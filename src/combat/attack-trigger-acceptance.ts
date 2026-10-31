import {GLOBAL_BATTLE_CONFIG} from '../global-config';
import {balanceNumber,skillBalance} from '../config';
import type {CombatUnit} from '../model';
import {skillValue as value,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {addVisualWorldEffect} from './visual-state';

const LOCK='faceless_void_time_lock',COURAGE='legion_commander_moment_of_courage',LUM='custom_dawnbreaker_luminosity',STAR='dawnbreaker_fire_wreath',IMPETUS='enchantress_impetus';
const STEP=1/30,FOREVER=GLOBAL_BATTLE_CONFIG.timeLimit;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const has=(c:C,u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind&&s.until>c.battle.time+1e-8);
const key=(c:C,name:string)=>`${c.skill.instanceId??c.skill.id}:${name}`;
const read=(c:C,name:string)=>Number(c.caster[key(c,name)]??0);
const write=(c:C,name:string,n:number)=>{c.caster[key(c,name)]=n;};
const enemy=(c:C,t:CombatUnit)=>!t.dead&&t.side!==c.caster.side&&!t.ward&&!t.building&&!Boolean(t.courier);
const hero=(t:CombatUnit)=>!t.summoned||!!t.illusion||!!t.consideredHero;
const own=(c:C,s:EffectStatus)=>s.skill===c.skill.id&&s.source===c.caster.id&&(!s.data?.ownerInstance||s.data.ownerInstance===(c.skill.instanceId??c.skill.id));
const owns=(c:C,u:CombatUnit,kind:string)=>(u.statuses as EffectStatus[]).find(s=>s.kind===kind&&own(c,s));
const upgraded=(c:C,name:string,bonus:number)=>value(c,name)+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?bonus:0);
const baseCooldown=(c:C)=>skillBalance(c.definition,c.skill.points)?.cooldown??(c.definition.cooldowns[Math.min(c.definition.cooldowns.length-1,Math.min(2,c.skill.points-1))]??0);

function timeLock(c:C,t:CombatUnit):void{
 if(!enemy(c,t))return;
 // The disabling bash is immediate; its separate magical damage and attack
 // start after the historical 7.31d delay, not one visual animation frame.
 c.status(t,'stun',value(c,'DURATION'),0,{harmful:true,dispel:'strong',piercesImmunity:true});
 c.delay(value(c,'SECOND ATTACK DELAY',.4),()=>{
  if(t.dead||c.caster.dead)return;
  c.damage(t,upgraded(c,'BONUS DAMAGE',70),'magical',true);
  c.launchAttack?.(t,1,true);
 });
}

function courage(c:C,outgoing=false):void{
 if(c.caster.illusion||!enemy(c,c.target))return;
 const clock=outgoing?'offensiveCooldown':'defensiveCooldown';
 if(read(c,clock)>c.battle.time+1e-8)return;
 const probability=upgraded(c,'CHANCE TO COUNTERATTACK',8)/100;
 if(!(c.chance?.(probability,outgoing?'offensiveCounterattack':'defensiveCounterattack')??c.random()<probability))return;
 write(c,clock,c.battle.time+baseCooldown(c));
 const duration=value(c,'PROC BUFF DURATION',1),data={ownerInstance:c.skill.instanceId??c.skill.id};
 c.status(c.caster,'courageReady',duration,1,{dispel:'none',data});
 c.status(c.caster,'attackSpeed',duration,value(c,'PROC ATTACK SPEED',1000),{dispel:'none',data});
 c.status(c.caster,'lifesteal',duration,upgraded(c,'LIFESTEAL',15)/100,{dispel:'none',data});
 addVisualWorldEffect(c.battle,{source:c.caster.id,skill:c.skill.id,points:c.skill.points,layer:'counter',x:c.caster.x,y:c.caster.y,angle:c.caster.facing,until:c.battle.time+12/24,kind:'proc',loop:false});
 const target=c.battle.units.find(t=>t.id===c.currentAttackTargetId);
 if(c.attackInProgress&&target&&enemy(c,target))c.attack(target,1,true);
}

interface LumSnapshot {ready:boolean;healFactor:number;allyFactor:number;radius:number}
interface LumBatch {key:string;ready:boolean;processed:boolean}
function lumSnapshot(c:C):LumSnapshot{
 const batchKey=c.attackBatchKey;let batch=c.caster[key(c,'batch')] as LumBatch|undefined;
 if(batchKey&&batch?.key!==batchKey){batch={key:batchKey,ready:read(c,'hits')>=value(c,'ATTACKS TO CHARGE',c.skill.points>=6?2:3),processed:false};c.caster[key(c,'batch')]=batch;}
 return{ready:batchKey?!!batch?.ready:read(c,'hits')>=value(c,'ATTACKS TO CHARGE',c.skill.points>=6?2:3),healFactor:(value(c,'HEALING FROM HEROES')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=9?150:0))/100,allyFactor:value(c,'ALLY HEAL PERCENT',35)/100,radius:value(c,'HEAL RADIUS',650)/100};
}
function lumData(c:C):LumSnapshot|undefined{return c.attackRecord?.data[key(c,'luminosity')] as LumSnapshot|undefined;}
function setLumSnapshot(c:C):LumSnapshot{
 const old=lumData(c);if(old)return old;
 const snapshot=lumSnapshot(c);if(c.attackRecord)c.attackRecord.data[key(c,'luminosity')]=snapshot;return snapshot;
}
function healLuminosity(c:C,snapshot:LumSnapshot):void{
 if(!snapshot.ready||has(c,c.caster,'break'))return;
 // Existing effective-damage basis is retained until the historical barrier /
 // delayed-damage basis can be established. The ledger keeps that stage open.
 const amount=(c.amount??0)*snapshot.healFactor*(hero(c.target)?1:1-value(c,'CREEP HEAL PENALTY')/100);
 c.lifestealHeal?.(c.caster,amount);
 for(const ally of c.allies().filter(t=>t.id!==c.caster.id&&hero(t)&&!t.ward&&!t.building&&distance(t,c.caster)<=snapshot.radius))c.lifestealHeal?.(ally,amount*snapshot.allyFactor);
}

interface Charges {count:number;maximum:number;next:number|null;recharge:number}
function starCharges(c:C):Charges{
 let state=c.caster[key(c,'starCharges')] as Charges|undefined;
 if(!state)state=c.caster[key(c,'starCharges')]={count:2,maximum:2,next:null,recharge:baseCooldown(c)};
 while(state.next!==null&&state.next<=c.battle.time+1e-8&&state.count<state.maximum){state.count++;state.next=state.count===state.maximum?null:state.next+state.recharge;}
 return state;
}
function castStarbreaker(c:C):void{
 if(c.skill.points>=6){const charges=starCharges(c);if(charges.count<=0)return;charges.count--;if(charges.next===null){charges.recharge=baseCooldown(c)*Math.max(.1,1-c.caster.statuses.filter(s=>s.kind==='cooldownReduction'&&s.until>c.battle.time).reduce((n,s)=>n+(s.value??0),0));charges.next=c.battle.time+charges.recharge;}const slot=c.caster.skills.indexOf(c.skill);if(slot>=0)c.caster.cooldowns[slot]=charges.count>0?c.battle.time:charges.next;}
 const duration=value(c,'COMBO DURATION'),radius=upgraded(c,'SWIPE/SMASH RADIUS',150)/100,angle=Math.atan2((c.castPosition??c.target).y-c.caster.y,(c.castPosition??c.target).x-c.caster.x),started=c.battle.time,token=`${c.caster.id}:${c.skill.instanceId??c.skill.id}:${started}`,data={instanceKey:token};
 const bonus=value(c,'SWIPE/SMASH BONUS DAMAGE'),stun=value(c,'SMASH STUN DURATION');let ended=false;
 c.status(c.caster,'starbreakerActive',duration+STEP,1,{dispel:'none',data});c.status(c.caster,'disarm',duration,1,{dispel:'none',data});
 c.status(c.caster,'facingLock',duration,c.caster.facing,{dispel:'none',data:{...data,allowMovement:c.skill.points>=6}});
 if(c.skill.points>=6){c.status(c.caster,'magicImmune',duration,1,{dispel:'none',data});c.status(c.caster,'haste',duration,-value(c,'SUPER MOVE SLOW',25)/100,{dispel:'none',data});c.status(c.caster,'minimumMoveSpeed',duration,value(c,'SUPER MIN MOVE SPEED',215)/100,{dispel:'none',data});}
 else{c.status(c.caster,'motionRoot',duration,1,{dispel:'none',data});c.status(c.caster,'phased',duration,1,{dispel:'none',data});}
 const cancelled=()=>ended||c.caster.dead||['stun','hex','banished','taunt','fear','hypnotized','cyclone'].some(k=>has(c,c.caster,k));
 const finish=()=>{ended=true;c.caster.statuses=c.caster.statuses.filter(s=>!(s.skill===c.skill.id&&(s as EffectStatus).data?.instanceKey===token));};
 const sweep=(index:number)=>{
  if(cancelled()){finish();return;}
  const offset=index===2?value(c,'SMASH DISTANCE',250)/100:0,center={x:c.caster.x+Math.cos(angle)*offset,y:c.caster.y+Math.sin(angle)*offset};
  for(const target of c.enemies().filter(t=>!t.ward&&!t.building&&!Boolean(t.courier)&&distance(t,center)<=radius+1e-8)){
   c.attack(target,1,true,undefined,false,{trueStrike:true,noCleave:true,allowInvisibleTarget:true,bonusDamage:bonus,attackBatchKey:`${token}:${index}`});
   if(index===2)c.status(target,'stun',stun,0,{harmful:true,dispel:'strong',piercesImmunity:false});
   else c.status(target,'slow',value(c,'SWIPE SLOW DURATION',.12),value(c,'SWIPE SLOW',100)/100,{harmful:true,piercesImmunity:false});
  }
  if(index===2){finish();c.status(c.caster,'selfStun',value(c,'SELF STUN DURATION',.2),1,{dispel:'none'});}
 };
 // Queue motion before the endpoint attack so the final smash samples the
 // completed236.5-unit path. Small sweeps pause rather than catch up after a
 // wall/root/other motion controller; they never alter facing or attack BAT.
 let previous=0;
 for(let n=1;n<=Math.ceil(duration/STEP);n++){
  const due=Math.min(duration,n*STEP),elapsed=due-previous;previous=due;
  c.delay(due,()=>{if(cancelled()){if(!ended)finish();return;}if(c.skill.points>=6||has(c,c.caster,'root'))return;const motion=c.motionActive?.(c.caster);if(motion&&motion.skill!==c.skill.id)return;
   const length=value(c,'FORCED MOVE SPEED',215)/100*elapsed;c.moveContinuous(c.caster,c.caster.x+Math.cos(angle)*length,c.caster.y+Math.sin(angle)*length,{duration:STEP,priority:1,lockActions:false});
  });
 }
 sweep(0);c.delay(value(c,'ATTACK INTERVAL',duration/2),()=>sweep(1));c.delay(duration,()=>sweep(2));
}

/** Final attack-trigger programs. Unrecovered native consumption/basis details
 * remain individually open in attack-trigger.json, rather than inferred from a
 * shared attack flag or a passing implementation test. */
export function applyAttackTriggerAcceptance(registry:Record<string,SkillProgram>):void{
 const lock=registry[LOCK];lock.onAttack=c=>{if(c.caster.illusion||!enemy(c,c.target))return;const chance=upgraded(c,'CHANCE',4)/100;if(c.chance?.(chance,'timeLock')??c.random()<chance)timeLock(c,c.target);};
 lock.init=c=>{if(c.skill.points>=9)c.zone({follow:true,radius:value(c,'GABEN RADIUS',450)/100,duration:FOREVER,interval:value(c,'GABEN INTERVAL',4),effect:t=>{if(!c.caster.illusion)timeLock(c,t);}});};
 lock.implemented=['Immediate immunity-piercing strong-dispellable bash;historical .4-second bonus damage and modifier-enabled second attack','Ranged second attacks preserve the owner projectile path,normal misses and native disarm exception','Native2012PRD eligibility with AA final bonus/chance and independently timed Gaben450area four-second pulses'];lock.remaining=['Exact originalAA PRD coefficients are not recovered;the calibrated project coefficient model remains explicit','Only synchronous recursive hooks have the shared safety bound;delayed TimeLock chains have no artificial eight-proc cap','AA Gaben forced-proc recursion eligibility and attack-point-versus-contact proc snapshot require direct historical qualification'];

 const counter=registry[COURAGE];counter.onAttacked=undefined;counter.onIncomingAttackStart=c=>courage(c);
 counter.onAttack=c=>{if(owns(c,c.caster,'courageReady'))c.caster.statuses=c.caster.statuses.filter(s=>!own(c,s as EffectStatus)||!['courageReady','attackSpeed','lifesteal'].includes(s.kind));if(c.skill.points>=9)courage(c,true);};
 counter.implemented=['Incoming ordinary attack-start PRD rolls including subsequently cancelled/missed attacks','A one-second1000AS/lifesteal buff is consumed only by a successful attack;an ongoing attack instead counters its current target with all modifiers','AA final Super probability/lifesteal and independent Gaben outgoing cooldown'];counter.remaining=['Whether native animation-free instant attacks emit the incoming-start event is not recovered;only ordinary orders opt in','AA outgoing-counter recursive eligibility beyond the independent cooldown remains a source boundary'];

 const lum=registry[LUM];lum.attackModifier=undefined;lum.handlesBreak=true;
 lum.criticalAttack=c=>{if(!enemy(c,c.target))return;const snapshot=setLumSnapshot(c);return snapshot.ready?{chance:1,multiplier:upgraded(c,'CRITICAL STRIKE DAMAGE',40)/100}:undefined;};
 lum.beforeAttackDamage=c=>{if(!enemy(c,c.target))return;const snapshot=setLumSnapshot(c),batch=c.caster[key(c,'batch')] as LumBatch|undefined;if(c.attackBatchKey&&batch?.key===c.attackBatchKey){if(batch.processed)return;batch.processed=true;}if(snapshot.ready)write(c,'hits',0);else if(!has(c,c.caster,'break'))write(c,'hits',read(c,'hits')+1);};
 lum.onAttack=c=>{if(!enemy(c,c.target))return;const snapshot=lumData(c);if(snapshot)healLuminosity(c,snapshot);if(c.skill.points>=9&&!has(c,c.caster,'break')&&read(c,'doubleAttack')<=c.battle.time){write(c,'doubleAttack',c.battle.time+value(c,'GABEN ATTACK INTERVAL',5));c.delay(value(c,'GABEN ATTACK DELAY',.1),()=>{if(!c.caster.dead&&!c.target.dead)c.attack(c.target,1,true);});}};
 lum.onDeath=c=>{if(read(c,'hits')>=value(c,'ATTACKS TO CHARGE',c.skill.points>=6?2:3))write(c,'hits',0);};
 lum.implemented=['Enemy hero/creep successful-contact counting excludes allied/ward/building attacks','One counter update per Starbreaker wave;precharged ensured critical survives Break and resets while healing/new charges are suppressed','AA final critical/healing/required hits;Gaben independent five-second additional attack;lifesteal-class self/hero-ally restoration'];lum.remaining=['Healing currently follows effective attack damage;historical self/allies-before-damage ordering and barriers/deferred-damage basis remain unimplemented','Ranged in-flight charging/consumption and stronger-crit versus ready-buff consumption still require direct observation','AA Gaben+150percent is retained as percentage points and .1-second extra-attack delay is a documented working interpretation'];

 const star=registry[STAR],oldInit=star.init;star.init=c=>{oldInit?.(c);if(c.skill.points>=6)starCharges(c);};star.pointTarget=true;star.dynamicRange=false;star.range=c=>(upgraded(c,'SWIPE/SMASH RADIUS',150)+value(c,'SMASH DISTANCE',250))/100;star.cast=castStarbreaker;star.canCast=c=>!owns(c,c.caster,'starbreakerActive')&&(c.skill.points<6||starCharges(c).count>0);
 star.reduceRecharge=(c,seconds)=>{if(c.skill.points<6)return;const state=starCharges(c);if(state.next!==null)state.next=Math.max(c.battle.time,state.next-seconds);starCharges(c);};
 star.onAttack=c=>{if(c.skill.points<9||!enemy(c,c.target))return;const duration=value(c,'GABEN ARMOR DURATION',5);for(const s of c.target.statuses as EffectStatus[])if(s.kind==='armor'&&own(c,s))s.until=c.battle.time+duration;c.status(c.target,'armor',duration,-value(c,'GABEN ARMOR REDUCTION',1),{harmful:true,maxStacks:Number.MAX_SAFE_INTEGER});};
 star.implemented=['Immediate first swipe and half-duration/endpoint waves;each successful wave counts Luminosity once','True Strike modifier-enabled instant attacks except cleave;swipe slow follows damage and frontal-offset smash stun follows damage','Base215forward continuous movement with facing/ordinary-movement lock;Super free ordinary movement with25percent selfslow and minimum215','AA Super two sequential charges/radius/immunity and Gaben basic-dispellable refreshable armor stacks'];star.remaining=['Native smash90-range vertical knock-up has no altitude axis in the arena;final self-stun is represented','Cliffs/trees/buildings and facing-dependent manual ability queues have no exact flat-arena navigation/input counterparts'];

 const impetus=registry[IMPETUS];impetus.onAttack=c=>{
  const cost=c.caster.extraFreeImpetus?0:skillBalance(c.definition,c.skill.points)?.mana??c.definition.mana[Math.min(c.definition.mana.length-1,Math.max(0,Math.min(2,c.skill.points-1)))]??0;if(c.caster.mana<cost)return;c.mana(c.caster,-cost);
  c.damage(c.target,distance(c.caster,c.target)*balanceNumber(c,'skill_effects_extra.damage.1',100)*(value(c,'DISTANCE DAMAGE')/100+(c.skill.points>=6?balanceNumber(c,'skill_effects_extra.damage.2',.06):0))*(c.target.summoned?balanceNumber(c,'skill_effects_extra.damage.3',2):balanceNumber(c,'skill_effects_extra.damage.4',1)),'pure');
 };
 const priorPoint=impetus.onAttackPoint;impetus.onAttackPoint=c=>{priorPoint?.(c);if(c.skill.points<6||!(c.attackIsRanged??c.isRangedAttack?.(c.caster))||read(c,'arrayReady')>c.battle.time)return;
  const range=c.attackRange?.(c.caster)??c.caster.range,targets=c.enemies().filter(t=>t.id!==c.target.id&&enemy(c,t)&&!has(c,t,'attackImmune')&&(!has(c,t,'invisible')||has(c,t,'revealed'))&&(c.canTarget?.(t,true)??true)&&distance(t,c.caster)<=range+1e-8).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id)).slice(0,value(c,'ARRAY TARGETS',2));
  if(!targets.length)return;write(c,'arrayReady',c.battle.time+value(c,'ARRAY COOLDOWN',12));for(const target of targets)c.launchAttack?.(target,1,false,{modifierPolicy:'none'});
 };
 impetus.implemented=impetus.implemented.filter(s=>!s.includes('secondary ranged attacks')).concat('Specialists Array releases two closest eligible ranged projectiles at primary launch even if it later misses;normal missile speed and Arena collision','Array explicit no-modifier policy excludes status/learned criticals,on-hit effects and lifesteal while keeping armor/block/misses');
 impetus.remaining=impetus.remaining.filter(s=>!s.includes('secondary attacks do not trigger')).concat('Impetus base orb mana/distance-origin and independent Sproink acceptance remain outside this Array-only submechanism review');
}
