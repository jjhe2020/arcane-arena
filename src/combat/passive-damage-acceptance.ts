import type {BattleState,CombatUnit,SkillDefinition} from '../model';
import {skillBalance} from '../config';
import {statusValue} from '../combat';
import {getSkillProgram,skillValue,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {childValue} from './historical-children';
import {addVisualWorldEffect} from './visual-state';

const FIELD='custom_zuus_static_field',NAPALM='batrider_sticky_napalm',UPROAR='primal_beast_uproar',GALE='venomancer_venomous_gale',WAVE='vengefulspirit_wave_of_terror',JUMP='zuus_heavenly_jump';
const STEP=1/30,EPS=1e-8,PERMANENT=1_000_000;
const list=(u:CombatUnit)=>u.statuses as EffectStatus[];
const has=(c:C,u:CombatUnit,k:string)=>list(u).some(s=>s.kind===k&&s.until>c.battle.time+EPS);
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9,compiled=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const v=(c:C,k:string,f?:number)=>c.definition.grantedOnly?childValue(c,k,f):skillValue(c,k,f);
const identity=(c:C)=>c.skill.instanceId??c.skill.id;
const body=(t:CombatUnit)=>!t.dead&&!t.ward&&!t.building&&!t.courier;
const enemy=(c:C,t:CombatUnit)=>body(t)&&t.side!==c.caster.side&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&!has(c,t,'magicImmune');
const hero=(t:CombatUnit)=>!t.summoned||!!t.illusion||!!t.heroClone;
const visible=(c:C,t:CombatUnit)=>!has(c,t,'undetectable')&&!has(c,t,'shadowRealm')&&(!has(c,t,'invisible')||has(c,t,'revealed'));
const serials=new WeakMap<BattleState,number>();
function token(c:C){const n=(serials.get(c.battle)??0)+1;serials.set(c.battle,n);return `${c.caster.id}:${identity(c)}:${n}`;}
function clearRun(t:CombatUnit,key:string){t.statuses=list(t).filter(s=>s.data?.passiveDamageRun!==key);}

/** AA owns the two-target/in-place rule. These are independent native ranks. */
export const PASSIVE_DAMAGE_CHILD_DEFINITIONS:SkillDefinition[]=[{
 id:JUMP,name:'神圣一跃',nameEn:'Heavenly Jump',icon:'/art/icons/custom_zuus_static_field.webp',
 description:'原生四级神圣一跃命中分量。静电场超神免费原地触发，并独立选择两个目标。',
 descriptionEn:'Independent native four-rank Heavenly Jump hit component;the AA caller performs a free in-place effect on two targets.',
 tags:['magicDamage'],categories:['ABILITY: No Target','DAMAGE TYPE: Magical','PIERCES SPELL IMMUNITY: No'],
 values:['DAMAGE: 25 / 50 / 75 / 100','SEARCH RADIUS: 700 / 800 / 900 / 1000','MOVEMENT SLOW: 80','ATTACK SLOW: 100','CAST SLOW: 50','DURATION: 1.6'],
 cooldowns:[26,22,18,14],mana:[50,60,70,80],super:'',gaben:'',passive:false,ultimate:false,grantedOnly:true,sourceMaximumLevel:4,visualParentId:FIELD
}];

const fieldClocks=new WeakMap<BattleState,Map<string,number>>();
function staticField(c:C){
 const event=c.beforeAbilityDamageEvent,trigger=c.triggerSkillId;
 if(!event||event.inputAmount<=0||!trigger||trigger===FIELD||trigger===JUMP||getSkillProgram(trigger)?.itemActive||event.flags.healthRemoval||event.flags.healthLoss||event.flags.reflection||event.flags.noReflection||!enemy(c,c.target))return;
 let clocks=fieldClocks.get(c.battle);if(!clocks){clocks=new Map();fieldClocks.set(c.battle,clocks);}
 const key=`${c.caster.id}:${identity(c)}:${trigger}`;
 if((clocks.get(key)??-Infinity)>c.battle.time+EPS)return;
 clocks.set(key,c.battle.time+v(c,'COOLDOWN'));
 const pct=v(c,'HEALTH REDUCTION')+(!compiled(c)&&S(c)?2:0);
 c.damage(c.target,c.target.hp*pct/100,'magical',false);
 if(G(c)){
  const rank=PASSIVE_DAMAGE_CHILD_DEFINITIONS[0],radius=skillBalance(rank,4)?.params['SEARCH RADIUS']??1000;
  const targets=c.battle.units.filter(t=>enemy(c,t)&&visible(c,t)&&distance(t,c.caster)<=radius/100)
   .sort((a,b)=>Number(hero(b)||!!b.consideredHero)-Number(hero(a)||!!a.consideredHero)||distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id));
  const selected=targets.slice(0,v(c,'GABEN TARGETS',2));
  if(selected.length)addVisualWorldEffect(c.battle,{source:c.caster.id,skill:FIELD,points:c.skill.points,layer:'jump',kind:'proc',x:c.caster.x,y:c.caster.y,until:c.battle.time+16/24});
  for(const t of selected){c.castAbility(JUMP,4,t);c.status(t,'visualLink',12/24,0,{dispel:'none',ignoreStatusResistance:true,data:{layer:'jump_arc',beneficiaryId:c.caster.id}});}
 }
}

const napalmBusy=new WeakMap<BattleState,Set<string>>();
function napalmExtra(c:C,status:EffectStatus){
 const event=c.incomingDamageEvent;
 if(status.kind!=='stickyNapalm'||!event||event.inputAmount<=0||c.triggerUnitId!==c.caster.id||!enemy(c,c.target)||event.flags.healthRemoval||event.flags.healthLoss||event.flags.noReflection||event.flags.reflection||['item_radiance','item_cloak_of_flames','item_spirit_vessel','item_urn_of_shadows'].includes(c.triggerSkillId??''))return;
 let busy=napalmBusy.get(c.battle);if(!busy){busy=new Set();napalmBusy.set(c.battle,busy);}const key=`${c.caster.id}:${c.target.id}`;if(busy.has(key))return;
 const creep=c.target.summoned&&!c.target.illusion&&!c.target.heroClone;
 busy.add(key);try{c.damage(c.target,Number(status.value)*Number(status.data?.extraDamage??v(c,'EXTRA DAMAGE'))*(creep?v(c,'CREEP DAMAGE FACTOR',.5):1),'magical',false);}finally{busy.delete(key);}
}
function applyNapalm(c:C,target:CombatUnit){
 if(!enemy(c,target))return;
 // Application can trigger old stacks; the first cast does not listen retroactively.
 c.damage(target,v(c,'APPLICATION DAMAGE'),'magical',false);
 if(target.dead)return;
 const existing=list(target).find(s=>s.kind==='stickyNapalm'&&s.until>c.battle.time+EPS);
 if(existing&&existing.source!==c.caster.id){
  const until=c.battle.time+v(c,'DURATION')*(1-Math.min(.9,statusValue(target,'statusResistance')));
  for(const s of list(target))if(s.data?.passiveDamageRun===existing.data?.passiveDamageRun)s.until=until;
  return;
 }
 const max=v(c,'MAX STACKS',G(c)?0:10),count=Math.min(max>0?max:Number.MAX_SAFE_INTEGER,Number(existing?.value??0)+1),key=String(existing?.data?.passiveDamageRun??token(c));
 c.status(target,'stickyNapalm',v(c,'DURATION'),count,{harmful:true,dispel:'basic',removeOnDeath:true,data:{passiveDamageRun:key,instanceKey:identity(c),extraDamage:v(c,'EXTRA DAMAGE')}});
 const mark=list(target).find(s=>s.kind==='stickyNapalm'&&s.data?.passiveDamageRun===key);if(!mark)return;
 const options:Partial<EffectStatus>={harmful:true,dispel:'basic',removeOnDeath:true,ignoreStatusResistance:true,data:{passiveDamageRun:key,instanceKey:identity(c)}};
 c.status(target,'slow',mark.until-c.battle.time,Math.abs(v(c,'MOVEMENT SLOW'))*count/100,options);
 c.status(target,'turnRatePct',mark.until-c.battle.time,-Math.abs(v(c,'TURN RATE SLOW',70))/100,options);
}

function uproarStacks(c:C){return list(c.caster).find(s=>s.kind==='uproarStack'&&s.data?.instanceKey===identity(c));}
function emitUproarRays(c:C,count:number){
 const reach=v(c,'PROJECTILE DISTANCE',1400)/100,speed=v(c,'PROJECTILE SPEED',500)/100,split=v(c,'SPLIT DELAY',1.25),angleDelta=v(c,'SPLIT ANGLE',30)*Math.PI/180;
 const ray=(origin:{x:number;y:number},angle:number,remaining:number,depth:number)=>{
  if(remaining<=EPS)return;let point={...origin},ended=false,divided=false;const began=c.battle.time;
  c.linearProjectile({origin,angle,distance:remaining,speed,width:v(c,'PROJECTILE WIDTH',75)/100,followOrigin:c.caster,
   shouldContinue:()=>!divided,onMove:p=>{point={...p};},onEnd:()=>{ended=true;},effect:t=>{if(!enemy(c,t))return;c.damage(t,v(c,'PROJECTILE DAMAGE',100),'magical',false);c.status(t,'break',v(c,'BREAK DURATION',2.5),0,{harmful:true,dispel:'basic'});}});
  if(depth>=v(c,'MAX SPLITS',2))return;
  c.delay(split,()=>{if(ended)return;divided=true;const rest=Math.max(0,remaining-(c.battle.time-began)*speed);ray(point,angle-angleDelta,rest,depth+1);ray(point,angle+angleDelta,rest,depth+1);});
 };
 for(let wave=0;wave<v(c,'WAVES',3);wave++)c.delay(wave*v(c,'WAVE INTERVAL',.5),()=>{
  const n=count*v(c,'PROJECTILES PER STACK',2);for(let i=0;i<n;i++)ray({x:c.caster.x,y:c.caster.y},i*2*Math.PI/n,reach,0);
 });
}
function roar(c:C){
 const mark=uproarStacks(c),count=Math.min(v(c,'MAX STACKS'),Number(mark?.value??0));if(count<=0)return;
 c.caster.statuses=list(c.caster).filter(s=>s!==mark);c.caster.uproarStacks=0;c.caster[`uproarPool:${identity(c)}`]=0;
 if(S(c))c.dispel(c.caster,true,true);
 const key=token(c),duration=v(c,'BUFF DURATION',7),options:Partial<EffectStatus>={dispel:'basic',removeOnDeath:true,passive:false,data:{passiveDamageRun:key,instanceKey:'uproarRoar:'+identity(c)}};
 c.caster[`uproarReady:${identity(c)}`]=c.battle.time+duration;
 addVisualWorldEffect(c.battle,{source:c.caster.id,skill:UPROAR,points:c.skill.points,layer:'roar',x:c.caster.x,y:c.caster.y,radius:v(c,'ROAR RADIUS')/100,until:c.battle.time+16/24});
 c.status(c.caster,'attackBonus',duration,count*v(c,'BONUS DAMAGE PER STACK'),options);
 c.status(c.caster,'armor',duration,count*v(c,'ROAR ARMOR BONUS PER STACK'),options);
 for(const t of c.battle.units.filter(t=>enemy(c,t)&&distance(t,c.caster)<=v(c,'ROAR RADIUS')/100))c.status(t,'slow',v(c,'SLOW DURATION'),count*v(c,'SLOW PER STACK')/100,{harmful:true,dispel:'basic'});
 if(G(c))emitUproarRays(c,count);
}
function gainUproar(c:C){
 const damage=c.amount??0,poolKey=`uproarPool:${identity(c)}`,lastKey=`uproarLast:${identity(c)}`;
 if(c.caster.illusion||has(c,c.caster,'break')||c.target.side===c.caster.side||c.target.summoned&&!c.target.owner||damage<v(c,'DAMAGE MIN',20)||damage>v(c,'DAMAGE MAX',2000)||c.damageFlags?.healthRemoval||c.damageFlags?.healthLoss||c.damageFlags?.reflection)return;
 const slot=c.caster.skills.indexOf(c.skill);if(Number(c.caster[`uproarReady:${identity(c)}`]??0)>c.battle.time+EPS||slot>=0&&c.caster.cooldowns[slot]>c.battle.time+EPS)return;
 if(c.battle.time-Number(c.caster[lastKey]??-Infinity)>=v(c,'STACK DURATION',20))c.caster[poolKey]=0;
 c.caster[lastKey]=c.battle.time;
 const damagePool=Number(c.caster[poolKey]??0)+damage;
 if(damagePool<v(c,'DAMAGE THRESHOLD',50)){c.caster[poolKey]=damagePool;return;}
 // One large packet grants one stack; any overflow is discarded.
 c.caster[poolKey]=0;
 const n=Math.min(v(c,'MAX STACKS'),Number(uproarStacks(c)?.value??0)+1);c.caster.uproarStacks=n;
 c.status(c.caster,'uproarStack',v(c,'STACK DURATION',20),n,{dispel:'none',removeOnDeath:true,passive:false,data:{instanceKey:identity(c)}});
 if(S(c)&&n>=v(c,'MAX STACKS')){roar(c);c.startCooldown?.();}
}

interface GaleRun{c:C;target:CombatUnit;key:string;until:number;startedAt:number;nextTick:number;nextSlow:number;marker:EffectStatus}
const gales=new WeakMap<BattleState,Map<string,GaleRun>>();
function applyGale(c:C,target:CombatUnit){
 if(!enemy(c,target))return;
 let runs=gales.get(c.battle);if(!runs){runs=new Map();gales.set(c.battle,runs);}
 const signature=`${c.caster.id}:${identity(c)}:${target.id}`,old=runs.get(signature),active=old&&old.until>c.battle.time+EPS&&list(target).includes(old.marker);
 if(!active)c.damage(target,v(c,'INITIAL DAMAGE')+(!compiled(c)&&S(c)?v(c,'INITIAL DAMAGE'):0),'magical',false);
 if(target.dead)return;
 // Do not let this lease's own negative resistance extend its next refresh.
 const oldResistance=list(target).filter(s=>s.kind==='statusResistance'&&s.data?.passiveDamageRun===old?.key);
 target.statuses=list(target).filter(s=>!oldResistance.includes(s));
 const key=active?old.key:token(c);
 c.status(target,'venomousGale',v(c,'DURATION'),1,{harmful:true,dispel:'basic',removeOnDeath:true,data:{passiveDamageRun:key,instanceKey:identity(c)}});
 const marker=list(target).find(s=>s.kind==='venomousGale'&&s.data?.passiveDamageRun===key);if(!marker)return;
 const until=marker.until;marker.until+=STEP;
 const options:Partial<EffectStatus>={harmful:true,dispel:'basic',removeOnDeath:true,ignoreStatusResistance:true,data:{passiveDamageRun:key,instanceKey:identity(c)}};
 if(S(c))c.status(target,'attackSpeedPct',until-c.battle.time,-v(c,'SUPER ATTACK SPEED SLOW',10)/100,options);
 if(G(c))c.status(target,'statusResistance',until-c.battle.time,-v(c,'GABEN STATUS RESISTANCE REDUCTION',40)/100,options);
 if(active){old.until=until;old.startedAt=c.battle.time;old.nextSlow=c.battle.time;return;}
 const run:GaleRun={c,target,key,until,startedAt:c.battle.time,nextTick:c.battle.time+v(c,'DAMAGE INTERVAL',3),nextSlow:c.battle.time,marker};runs.set(signature,run);
 const tick=()=>{
  if(target.dead||!list(target).includes(run.marker)){runs!.delete(signature);return;}
  if(c.battle.time>=run.nextTick-EPS&&run.nextTick<=run.until+EPS){c.damage(target,v(c,'DAMAGE PER TICK'),'magical',false,{flags:{damageOverTime:true}});run.nextTick+=v(c,'DAMAGE INTERVAL',3);}
  if(c.battle.time>=run.until-EPS){clearRun(target,key);runs!.delete(signature);return;}
  if(c.battle.time>=run.nextSlow-EPS){const steps=Math.floor((c.battle.time-run.startedAt+EPS)/v(c,'SLOW RECOVERY INTERVAL',.3)),slow=Math.max(0,Math.abs(v(c,'SLOW'))-steps*v(c,'SLOW RECOVERY',1))/100;c.status(target,'slow',run.until-c.battle.time,slow,options);run.nextSlow+=v(c,'SLOW RECOVERY INTERVAL',.3);}
  c.delay(STEP,tick);
 };tick();
}

function terror(c:C){
 const origin={x:c.caster.x,y:c.caster.y},point=c.castPosition??c.target,range=c.effectiveCastRange?.(skillBalance(c.definition,c.skill.points)?.range??14)??14;
 c.linearProjectile({origin,angle:Math.atan2(point.y-origin.y,point.x-origin.x),distance:range,speed:v(c,'PROJECTILE SPEED',2000)/100,width:v(c,'RADIUS',325)/100,effect:t=>{
  if(!enemy(c,t))return;const duration=v(c,'DURATION',8),armor=v(c,'ARMOR REDUCTION')-(!compiled(c)&&S(c)?2:0),options:Partial<EffectStatus>={harmful:true,dispel:'basic',removeOnDeath:true};
  c.status(t,'armor',duration,armor,options);
  if(S(c)&&hero(t)){
   const data={instanceKey:`terror:${t.id}`},damage=t.attack*v(c,'STEAL DAMAGE',20)/100,stolenArmor=Math.max(0,t.armor)*v(c,'STEAL ARMOR',20)/100;
   c.status(t,'attackBonus',duration,-damage,{...options,data:{instanceKey:identity(c)}});
   c.status(t,'armor',duration,-stolenArmor,{...options,data:{instanceKey:'terrorSteal:'+identity(c)}});
   c.status(c.caster,'attackBonus',duration,damage,{dispel:'basic',removeOnDeath:true,data});
   c.status(c.caster,'armor',duration,stolenArmor,{dispel:'basic',removeOnDeath:true,data});
   if(damage>0||stolenArmor>0)addVisualWorldEffect(c.battle,{source:c.caster.id,skill:WAVE,points:c.skill.points,layer:'steal',kind:'proc',x:c.caster.x,y:c.caster.y,until:c.battle.time+16/24});
  }
  if(G(c))c.status(t,'fear',v(c,'GABEN FEAR DURATION',2),0,{harmful:true,dispel:'basic'});
  c.damage(t,v(c,'DAMAGE'),'magical',false);
 }});
}

export function applyPassiveDamageAcceptance(registry:Record<string,SkillProgram>):void{
 const sf=registry[FIELD];sf.passive=true;sf.onDealDamage=undefined;sf.onBeforeAbilityDamageEvent=staticField;
 sf.implemented=['AA per-ability cooldown and pre-primary current-HP magical damage;accepted zero-effective spell packets retain eligibility','Complete final Super12percent and independent native4two-target in-place Gaben component'];
 sf.remaining=['Per-ability cooldown is source-wide across bounce victims;AA Lua exact per-target clock is unrecovered','Free nested casts retain the existing execution-event policy;no blanket active-slot Heavenly Jump or horizontal movement is inferred'];sf.superImplemented=sf.gabenImplemented=true;
 registry[JUMP]={target:'enemy',castPoint:0,backswing:0,cast:c=>{if(!enemy(c,c.target))return;c.damage(c.target,v(c,'DAMAGE'),'magical',false);const options:Partial<EffectStatus>={harmful:true,dispel:'basic'};c.status(c.target,'slow',v(c,'DURATION',1.6),v(c,'MOVEMENT SLOW',80)/100,options);c.status(c.target,'attackSpeed',v(c,'DURATION',1.6),-v(c,'ATTACK SLOW',100),options);c.status(c.target,'castTimePct',v(c,'DURATION',1.6),v(c,'CAST SLOW',50)/100,options);},implemented:['Native four-rank hit/control values;AA parent performs free in-place selection'],remaining:['Effect-only component does not claim an independently granted active jump movement action']};
 const n=registry[NAPALM];n.target='enemy';n.pointTarget=true;n.requiresFacing=false;n.castPoint=0;n.backswing=0;n.onDamage=undefined;n.onDealDamage=undefined;n.cast=c=>{const point=c.castPosition??c.target;addVisualWorldEffect(c.battle,{source:c.caster.id,skill:NAPALM,points:c.skill.points,layer:'splash',x:point.x,y:point.y,radius:v(c,'RADIUS')/100,until:c.battle.time+16/24});for(const t of c.battle.units.filter(t=>enemy(c,t)&&distance(t,point)<=v(c,'RADIUS')/100))applyNapalm(c,t);};n.onAffectedUnitIncomingDamageEvent=napalmExtra;n.onAttack=c=>{if(!S(c)||c.caster.illusion)return;const targets=G(c)?c.battle.units.filter(t=>enemy(c,t)&&distance(t,c.target)<=v(c,'GABEN RADIUS',375)/100):[c.target];for(const t of targets)applyNapalm(c,t);};n.onStatusRemoved=(c,status)=>{if(status.kind==='stickyNapalm'&&status.data?.passiveDamageRun)clearRun(c.target,String(status.data.passiveDamageRun));};n.implemented=['2023 magical application and same-caster conditional damage,creep half coefficient,nonstacking turn reduction','Basic dispel removes the linked marker/slow/turn lease;foreign caster refreshes original stack and ownership','AA Super every landed attack and uncapped Gaben area stacking'];n.remaining=['First-application versus same-hit attack-proc ordering is an explicit version-qualified compatibility choice;AA Lua unavailable','Excluded unavailable item families and arbitrary competing-source refresh priorities remain bounded'];n.superImplemented=n.gabenImplemented=true;
 const u=registry[UPROAR];u.target='self';u.allowZeroCooldown=true;u.castPoint=0;u.backswing=0;u.canCastWhileChanneling=true;u.handlesBreak=true;u.init=c=>{if(!c.caster.illusion)c.status(c.caster,'attackBonus',PERMANENT,v(c,'BASE BONUS DAMAGE'),{dispel:'none',removeOnDeath:true,passive:false,data:{instanceKey:'uproarPassive:'+identity(c)}});};u.canCast=c=>Number(uproarStacks(c)?.value??0)>0;u.onDamage=undefined;u.onIncomingDamageEvent=gainUproar;u.cast=roar;u.onStatusRemoved=(c,s)=>{if(s.kind==='uproarStack')c.caster.uproarStacks=0;};u.implemented=['Separate undispellable passive flat damage and seven-second dispellable roar;Break only prevents stack gain','20second refreshable stacks,cumulative eligible player damage,single stack per packet,overflow discarded','AA max-stack automatic strong-dispelling roar and three body-following splitting Gaben waves'];u.remaining=['Gaben .5wave interval is retained project timing,not established AA Lua;2023pre-release KV vs public7.33cchronology is disclosed','Exact split ray cone geometry and arbitrary concurrent movement are planar approximations'];u.superImplemented=u.gabenImplemented=true;
 const g=registry[GALE];g.target='enemy';g.pointTarget=true;g.castPoint=0;g.backswing=.57;g.cast=c=>{const origin={x:c.caster.x,y:c.caster.y},point=c.castPosition??c.target,range=c.effectiveCastRange?.(skillBalance(c.definition,c.skill.points)?.range??8)??8;c.linearProjectile({origin,angle:Math.atan2(point.y-origin.y,point.x-origin.x),distance:range+v(c,'PROJECTILE OVERSHOOT',50)/100,speed:v(c,'PROJECTILE SPEED',1200)/100,width:v(c,'RADIUS',125)/100,effect:t=>applyGale(c,t)});};g.onStatusRemoved=(c,s)=>{if(s.kind==='venomousGale'&&s.data?.passiveDamageRun)clearRun(c.target,String(s.data.passiveDamageRun));};g.implemented=['2023instant+.57linear1200speed125radius and50overshoot;initial damage only on first application','Five full3second damage packets,gradual one-point slow recovery each.3seconds;refresh keeps periodic phase','AA final doubled Super impact/range/CD and one shared parent deadline for slow,attack slow and Gaben negative resistance'];g.remaining=['Flat arena has no deny orders or fog vision;AA does not grant the unrelated native ward talent','Self-negative-resistance refresh and fractional external resistance are constrained to the documented shared lease policy'];g.superImplemented=g.gabenImplemented=true;
 const w=registry[WAVE];w.target='enemy';w.pointTarget=true;w.castPoint=.3;w.backswing=.5;w.cast=terror;w.implemented=['2023 .3+.5,1400range2000speed325radius real linear wave;armor before magical damage','Repeated same-source debuffs refresh instead of stacking;AA Super steals only hero base attack/armor and Gaben fears'];w.remaining=['Super stolen armor/damage use release-impact base snapshots;AA exact multiple-caster stealing/recovery ownership remains source-qualified','Flying vision and terrain traversal are outside the flat arena visibility model'];w.superImplemented=w.gabenImplemented=true;
}
