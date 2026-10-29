import {BATTLE_CONFIG,UNIT_CONFIG,skillBalance} from '../config';
import type {BattleState,CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';

const SEED='custom_treant_leech_seed',BREAK='custom_huskar_life_break',DRAIN='custom_pugna_life_drain',BOLT='zuus_lightning_bolt',SHRED='custom_snapfire_lil_shredder',CLOUD='zuus_cloud',WRATH='zuus_thundergods_wrath',NIMBUS='npc_dota_zeus_cloud';
const STEP=1/30,EPS=1e-8,FOREVER=1_000_000;
const S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9;
const statuses=(t:CombatUnit)=>t.statuses as EffectStatus[];
const has=(c:C,t:CombatUnit,k:string)=>statuses(t).some(s=>s.kind===k&&s.until>c.battle.time+EPS);
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const ordinary=(t:CombatUnit)=>!t.dead&&!t.ward&&!t.building&&!t.courier;
const hero=(t:CombatUnit)=>ordinary(t)&&!t.illusion&&(!t.summoned||!!t.heroClone);
const identity=(c:C)=>c.skill.instanceId??c.attackInstanceKey??c.skill.id;
const sequence=(c:C)=>{const key=`leechShredder:${identity(c)}:sequence`;c.caster[key]=Number(c.caster[key]??0)+1;return`${c.caster.id}:${identity(c)}:${c.caster[key]}`;};
const own=(c:C,s:EffectStatus)=>s.skill===c.skill.id&&s.source===c.caster.id;
const visible=(c:C,t:CombatUnit)=>!has(c,t,'invisible')||has(c,t,'revealed');
function castRange(c:C):number{return skillBalance(c.definition,c.skill.points)?.range??v(c,'CAST RANGE',700)/100;}
function healPulse(c:C,host:{x:number;y:number},amount:number):void{
 for(const ally of c.allies().filter(t=>!t.ward&&!t.building&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&distance(t,host)<=v(c,'RADIUS')/100))c.projectile(ally,v(c,'HEAL PROJECTILE SPEED',450)/100,t=>c.heal(t,amount),host);
}
function seed(c:C):void{
 const duration=v(c,'DURATION'),length=duration>0?duration:FOREVER,interval=v(c,'PULSE INTERVAL',1),damage=v(c,'DAMAGE PER SECOND'),slow=Math.abs(v(c,'MOVEMENT SLOW'))/100;
 if(S(c)){
  const point=c.castPosition??c.target;
  c.zone({x:point.x,y:point.y,radius:v(c,'PUDDLE RADIUS',300)/100,duration:length,interval,immediate:true,effect:t=>{
   if(!ordinary(t)||has(c,t,'magicImmune'))return;
   c.damage(t,damage*interval,'magical',false,{flags:{damageOverTime:true}});c.status(t,'slow',interval+.1,slow,{harmful:true,dispel:'basic',data:{uniqueGroup:'leechSeedSlow',stacking:'strongest'}});healPulse(c,t,damage*interval);
  }});return;
 }
 const target=c.target,token=sequence(c);
 c.status(target,'leechSeed',length,damage,{harmful:true,dispel:'basic',removeOnDeath:false,maxStacks:Number.MAX_SAFE_INTEGER,data:{instanceKey:token,seedToken:token}});
 const marker=statuses(target).find(s=>s.kind==='leechSeed'&&s.data?.seedToken===token);if(!marker)return;
 c.status(target,'slow',marker.until-c.battle.time,slow,{harmful:true,dispel:'basic',ignoreStatusResistance:true,data:{instanceKey:token,seedToken:token,uniqueGroup:'leechSeedSlow',stacking:'strongest'}});
 const pulse=()=>{
  if(marker.data?.removed==='dispel'||!target.statuses.includes(marker)||c.battle.time>=marker.until-EPS)return;
  c.damage(target,damage*interval,'magical',false,{flags:{damageOverTime:true}});healPulse(c,target,damage*interval);
  if(c.battle.time+interval<marker.until-EPS)c.delay(interval,pulse);
 };pulse();
}

interface Leap {c:C;token:string;active:boolean;warp:number;last:{x:number;y:number};touched:Set<string>}
const leaps=new WeakMap<BattleState,Map<string,Leap>>();
const leapMap=(c:C)=>{let map=leaps.get(c.battle);if(!map){map=new Map;leaps.set(c.battle,map);}return map;};
function endLeap(leap:Leap):void{
 if(!leap.active)return;leap.active=false;const c=leap.c;
 if(c.motionActive?.(c.caster)?.skill===BREAK)c.cancelMotion?.(c.caster);
 c.caster.statuses=statuses(c.caster).filter(s=>!(own(c,s)&&s.data?.leapToken===leap.token));
}
function swept(a:{x:number;y:number},b:{x:number;y:number},t:CombatUnit,radius:number):boolean{
 const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,q=len?Math.max(0,Math.min(1,((t.x-a.x)*dx+(t.y-a.y)*dy)/len)):0;return Math.hypot(t.x-a.x-q*dx,t.y-a.y-q*dy)<=radius;
}
function lifeBreak(c:C):void{
 const map=leapMap(c),previous=map.get(c.caster.id);if(previous)endLeap(previous);
 c.dispel(c.caster);const token=sequence(c),leap:Leap={c,token,active:true,warp:Number(c.caster.warpSequence??0),last:{x:c.caster.x,y:c.caster.y},touched:new Set};map.set(c.caster.id,leap);
 const duration=v(c,'MAX IMMUNITY DURATION',5),options:Partial<EffectStatus>={dispel:'none',removeOnDeath:true,data:{leapToken:token}};
 for(const kind of ['magicImmune','disarm','motionRoot','castWithoutTurning','phased'])c.status(c.caster,kind,duration,0,options);
 const stopIfDisabled=()=>{
  if(!leap.active)return;
  const other=c.motionActive?.(c.caster);
  if(c.caster.dead||c.target.dead||Number(c.caster.warpSequence??0)!==leap.warp||distance(c.caster,c.target)>v(c,'MAX LEAP DISTANCE',2440)/100||['stun','hex','selfStun','banished','sleep','nightmare'].some(k=>has(c,c.caster,k))||(other&&other.skill!==BREAK)){endLeap(leap);return;}
  c.delay(STEP,stopIfDisabled);
 };c.delay(STEP,stopIfDisabled);
 c.projectile(c.target,v(c,'CHARGE SPEED',1200)/100,target=>{
  const current=map.get(c.caster.id);if(!current?.active||c.caster.dead)return;
  endLeap(current);
  if(c.trySpellBlock?.(target))return;
  c.damage(target,target.hp*v(c,'DAMAGE DEALT')/100,'magical',true);
  const actual=c.damage(c.caster,c.caster.hp*v(c,'DAMAGE TAKEN')/100,'magical',false,{flags:{nonLethal:true}});
  if(S(c)){
   const bonus=actual*v(c,'SUPER SELF DAMAGE SHARE',100)/100;
   c.damage(target,bonus,'magical',true);
   for(const id of leap.touched){const t=c.battle.units.find(t=>t.id===id);if(t&&!t.dead&&t.id!==target.id)c.damage(t,bonus,'magical',true);}
  }
  if(!target.dead)c.status(target,'slow',v(c,'SLOW DURATION'),Math.abs(v(c,'MOVEMENT SLOW'))/100,{harmful:true,dispel:'basic',piercesImmunity:true});
  if(G(c)&&!target.dead){c.interrupt?.(target);c.status(target,'taunt',v(c,'TAUNT DURATION',3),0,{harmful:true,dispel:'none',piercesImmunity:true,removeOnDeath:true,data:{targetId:c.caster.id}});}
 },undefined,point=>{
  if(!leap.active||map.get(c.caster.id)!==leap)return;
  const from={x:c.caster.x,y:c.caster.y};
  if(!c.moveContinuous(c.caster,point.x,point.y,{duration:STEP,lockActions:false,ignoreTerrainBarriers:true})){endLeap(leap);return;}
  const to={x:c.caster.x,y:c.caster.y};
  if(S(c))for(const t of c.enemies().filter(t=>t.id!==c.target.id&&ordinary(t)&&swept(from,to,t,Number(BATTLE_CONFIG.bodyRadius)*2)))leap.touched.add(t.id);
  leap.last=to;
 });
}

interface Drain {c:C;token:string;end:number;active:boolean;bound:boolean;links:Map<string,{target:CombatUnit;marker:EffectStatus}>;used:Set<string>;nextSecondary:number}
const drains=new WeakMap<BattleState,Map<string,Drain>>();
function drainMap(c:C){let map=drains.get(c.battle);if(!map){map=new Map;drains.set(c.battle,map);}return map;}
function endDrain(state:Drain):void{if(!state.active)return;state.active=false;const c=state.c;for(const{target}of state.links.values())target.statuses=statuses(target).filter(s=>!(own(c,s)&&s.data?.drainToken===state.token));c.endChannel();}
function addDrainLink(state:Drain,target:CombatUnit):void{
 const c=state.c;c.status(target,'lifeDrainLink',Math.max(STEP,state.end-c.battle.time)+STEP,0,{harmful:target.side!==c.caster.side,dispel:'strong',ignoreStatusResistance:true,removeOnDeath:true,data:{drainToken:state.token}});
 const marker=statuses(target).find(s=>s.kind==='lifeDrainLink'&&own(c,s)&&s.data?.drainToken===state.token);if(marker){state.links.set(target.id,{target,marker});state.used.add(target.id);c.status(target,'visualLink',marker.until-c.battle.time,0,{harmful:target.side!==c.caster.side,dispel:'none',ignoreStatusResistance:true,removeOnDeath:true,data:{drainToken:state.token,link:state.token,layer:'link',mode:'health',ally:target.side===c.caster.side}});}
}
function lifeDrain(c:C):void{
 const token=sequence(c),interval=v(c,'DRAIN INTERVAL',.25),state:Drain={c,token,end:c.battle.time+v(c,'CHANNEL DURATION',10),active:true,bound:c.caster.skills.some(s=>s?.id===DRAIN),links:new Map,used:new Set,nextSecondary:c.battle.time+v(c,'SECONDARY INTERVAL',1)};drainMap(c).set(token,state);addDrainLink(state,c.target);
 const range=()=>castRange(c)*(1+statuses(c.caster).filter(s=>s.kind==='castRangePct'&&s.until>c.battle.time).reduce((n,s)=>n+(s.value??0),0))+statuses(c.caster).filter(s=>s.kind==='castRange'&&s.until>c.battle.time).reduce((n,s)=>n+(s.value??0),0)+v(c,'BREAK BUFFER',200)/100;
 const validate=(schedule=true)=>{
  if(!state.active)return;
  if(c.caster.dead||c.caster.action!=='channel'||c.caster.castUntil<c.battle.time-EPS||(state.bound&&!c.caster.skills.some(s=>s?.id===DRAIN))){endDrain(state);return;}
  for(const[id,{target,marker}]of state.links)if(target.dead||!target.statuses.includes(marker)||marker.data?.removed||distance(target,c.caster)>range()||has(c,target,'invulnerable')||has(c,target,'banished')||target.side!==c.caster.side&&has(c,target,'magicImmune')){target.statuses=statuses(target).filter(s=>!(own(c,s)&&s.data?.drainToken===token));state.links.delete(id);}
  if(!state.links.size){endDrain(state);return;}
  if(schedule&&c.battle.time<state.end-EPS)c.delay(STEP,()=>validate());
 };c.delay(STEP,()=>validate());
 let nextTick=c.battle.time+interval;
 const tick=()=>{
  if(!state.active||c.battle.time>state.end+EPS)return;validate(false);if(!state.active)return;
  if(S(c)&&c.battle.time>=state.nextSecondary-EPS){
   const candidates=c.enemies().filter(t=>hero(t)&&!state.used.has(t.id)&&distance(t,c.caster)<=range()&&!has(c,t,'magicImmune'));
   if(candidates.length)addDrainLink(state,candidates[Math.floor(c.random()*candidates.length)]);
   state.nextSecondary+=v(c,'SECONDARY INTERVAL',1);
  }
  const amount=v(c,'DRAIN PER SECOND')*interval;
  for(const{target}of [...state.links.values()]){
   if(target.side===c.caster.side){const actual=c.damage(c.caster,amount,'magical',false,{flags:{damageOverTime:true}});if(target.hp<target.maxHp)c.heal(target,actual);else if(hero(target))c.mana(target,actual*v(c,'MANA RESTORE FACTOR',100)/100);}
   else if(target.illusion&&!target.strongIllusion)c.execute(target);
   else{const actual=c.damage(target,amount,'magical',false,{flags:{damageOverTime:true}});if(c.caster.hp<c.caster.maxHp)c.heal(c.caster,actual);else if(hero(target))c.mana(c.caster,actual*v(c,'MANA RESTORE FACTOR',100)/100);}
   if(target.side!==c.caster.side&&!target.dead)c.status(target,'revealed',interval+STEP,0,{harmful:true,dispel:'none',piercesImmunity:true,ignoreStatusResistance:true,data:{drainToken:token}});
  }
  if(c.caster.dead){endDrain(state);return;}
  nextTick+=interval;if(nextTick<=state.end+EPS)c.delay(Math.max(STEP,nextTick-c.battle.time),tick);else endDrain(state);
 };c.delay(interval,tick);
}

function revealArea(c:C,point:{x:number;y:number},radius:number,duration:number,linger=.5):void{
 c.zone({x:point.x,y:point.y,radius,duration,interval:.1,immediate:true,effect:t=>c.status(t,'revealed',linger,0,{harmful:true,dispel:'none',piercesImmunity:true,ignoreStatusResistance:true})});
}
const groundBolt=(c:C)=>c.originSkillId!==CLOUD&&(!!c.castPosition||c.caster.leechShredderGroundBoltRequested===true||!visible(c,c.target));
function bolt(c:C):void{
 const ground=groundBolt(c),point=c.castPosition??c.target;
 let target=c.target;
 if(ground){revealArea(c,point,v(c,'SIGHT RADIUS')/100,v(c,'SIGHT DURATION'),v(c,'TRUE SIGHT LINGER',.5));target=c.enemies().filter(t=>ordinary(t)&&!has(c,t,'magicImmune')&&distance(t,point)<=v(c,'GROUND SEARCH RADIUS',425)/100).sort((a,b)=>Number(Boolean(hero(b)||b.illusion||b.consideredHero))-Number(Boolean(hero(a)||a.illusion||a.consideredHero))||distance(a,point)-distance(b,point)||a.id.localeCompare(b.id))[0];delete c.caster.leechShredderGroundBoltRequested;if(!target)return;}
 if(c.originSkillId!==CLOUD&&c.trySpellBlock?.(target))return;
 c.damage(target,v(c,'DAMAGE'));if(!target.dead)c.status(target,'stun',v(c,'MINISTUN DURATION'),0,{harmful:true,dispel:'strong'});
 if(!ground)revealArea(c,point,v(c,'SIGHT RADIUS')/100,v(c,'SIGHT DURATION'),v(c,'TRUE SIGHT LINGER',.5));
}
function cloud(c:C):void{
 const raw=UNIT_CONFIG[NIMBUS];if(!raw)throw new Error('Native Nimbus profile missing');
 const duration=v(c,'CLOUD_DURATION',30),interval=v(c,'CLOUD_BOLT_INTERVAL',2.5),point=c.castPosition??c.target,end=c.battle.time+duration;
 const body=c.summon({name:'雷云',nativeTemplateId:NIMBUS,count:1,hp:raw.StatusHealth,attack:(raw.AttackDamageMin+raw.AttackDamageMax)/2,armor:raw.ArmorPhysical,range:raw.AttackRange/100,interval:raw.AttackRate,speed:raw.MovementSpeed/100,lifetime:duration+STEP})[0];if(!body)return;
 body.ward=true;body.sourceUnitType=NIMBUS;c.warp(body,point.x,point.y);c.status(body,'phased',duration+STEP,0,{dispel:'none'});
 const ranged=v(c,'HITS_TO_KILL_TOOLTIP',8),basic=v(c,'CREEP_HITS_TO_KILL_TOOLTIP',16);
 c.status(body,'hitCountBody',duration+STEP,0,{dispel:'none',data:{heroMeleeDamage:body.maxHp/(ranged/2),heroRangedDamage:body.maxHp/ranged,basicDamage:body.maxHp/basic,immuneSpells:true}});
 let next=c.battle.time;
 const frame=()=>{
  if(body.dead)return;
  const parent=c.caster.skills.find(s=>s?.id===BOLT),target=c.enemies().filter(t=>ordinary(t)&&!has(c,t,'magicImmune')&&!has(c,t,'shadowRealm')&&!has(c,t,'undetectable')&&distance(t,body)<=v(c,'CLOUD_RADIUS',450)/100).sort((a,b)=>distance(a,body)-distance(b,body)||a.id.localeCompare(b.id))[0];
  if(parent&&target&&c.battle.time>=next-EPS){c.castAbilityFrom?.(body,BOLT,parent.points,target);next=c.battle.time+interval;}
  if(c.battle.time>=end-EPS){c.despawn?.(body);return;}c.delay(STEP,frame);
 };frame();
}
function wrath(c:C):void{
 for(const target of c.battle.units.filter(t=>t.side!==c.caster.side&&hero(t)&&!has(c,t,'invulnerable')&&!has(c,t,'banished'))){
  const canDamage=visible(c,target)&&!has(c,target,'shadowRealm')&&!has(c,target,'undetectable');if(canDamage)c.damage(target,v(c,'DAMAGE'));
  revealArea(c,target,v(c,'SIGHT_RADIUS_DAY',500)/100,v(c,'SIGHT_DURATION',3));
 }
}

interface ShredSnapshot {active:boolean;ownAttack:boolean;damage:number;armor:number;duration:number;multishot:number;session:string}
interface ShredState {c:C;token:string;remaining:number;marker:EffectStatus;damage:number;ownAttack:boolean}
const shredStates=new WeakMap<BattleState,Map<string,ShredState>>();
const shredExtras=new WeakMap<BattleState,Map<string,ShredSnapshot>>();
function shredMap(c:C){let map=shredStates.get(c.battle);if(!map){map=new Map;shredStates.set(c.battle,map);}return map;}
const shredKey=(c:C)=>`${c.caster.id}:${identity(c)}`;
function shredSnapshot(c:C):ShredSnapshot|undefined{return c.attackRecord?.data[`shred:${identity(c)}`] as ShredSnapshot|undefined;}
function clearShred(state:ShredState):void{state.remaining=0;const c=state.c;c.caster.statuses=statuses(c.caster).filter(s=>!(own(c,s)&&s.data?.shredToken===state.token));}
function shred(c:C):void{
 const map=shredMap(c),old=map.get(shredKey(c));if(old)clearShred(old);
 const token=sequence(c),duration=v(c,'BUFF DURATION',6),data={shredToken:token};
 c.status(c.caster,'lilShredder',duration,v(c,'ATTACK COUNT',6),{dispel:'basic',removeOnDeath:true,data});
 const marker=statuses(c.caster).find(s=>s.kind==='lilShredder'&&s.data?.shredToken===token);if(!marker)return;
 for(const[kind,value]of [['attackSpeed',v(c,'BONUS ATTACK SPEED')],['range',v(c,'BONUS RANGE')/100],['baseAttackTime',v(c,'BASE ATTACK TIME',1)]] as const)c.status(c.caster,kind,duration,value,{dispel:'basic',removeOnDeath:true,data});
 map.set(shredKey(c),{c,token,remaining:v(c,'ATTACK COUNT',6),marker,damage:v(c,'FIXED DAMAGE PER SHOT'),ownAttack:S(c)});
}
export function applyLeechShredderAcceptance(registry:Record<string,SkillProgram>):void{
 registry[SEED]={target:'enemy',pointTarget:c=>S(c),unitTarget:c=>!S(c),spellBlockTiming:'program',projectileDisjointable:false,projectileDisjointOnInvisibility:false,targetEligibility:(c,t)=>ordinary(t)&&t.side!==c.caster.side&&(c.canTarget?.(t,!S(c))??true)&&(S(c)||!has(c,t,'magicImmune')),cast:c=>{if(!S(c)&&c.trySpellBlock?.(c.target))return;seed(c);},onStatusRemoved:(c,status,reason)=>{if(status.kind!=='leechSeed')return;status.data={...status.data,removed:reason};const token=status.data?.seedToken;c.target.statuses=statuses(c.target).filter(s=>!(own(c,s)&&s.data?.seedToken===token&&s!==status));},superImplemented:true,gabenImplemented:true,implemented:['Independent AA stacked seed instances with immediate native one-second pulses','Undisjointable450 healing projectiles and pulses persisting after host death','AA final Super300puddle/+50/+15 and Gaben permanent field'],remaining:['AA puddle per-victim healing and ground targeting are explicit compatibility interpretations','Status-resistance-adjusted last pulse, cross-caster slow priority and permanent fields beyond the finite match remain scoped']};
 registry[BREAK]={target:'enemy',range:5.5,targetSelector:(c,targets)=>targets.filter(ordinary).sort((a,b)=>distance(b,c.caster)-distance(a,c.caster)||a.id.localeCompare(b.id))[0],spellBlockTiming:'program',projectileDisjointable:false,projectileDisjointOnInvisibility:false,cast:lifeBreak,init:c=>{const strength=v(c,'GAUNTLET STRENGTH',G(c)?45:0);if(strength)c.status(c.caster,'strength',FOREVER,strength,{dispel:'none'});},canCast:c=>!has(c,c.caster,'root')&&!has(c,c.caster,'soulbind')&&!has(c,c.caster,'leash'),onDeath:c=>{const state=leapMap(c).get(c.caster.id);if(state)endLeap(state);},superImplemented:true,gabenImplemented:true,implemented:['Released undisjointable1200homing projectile and continuous movable spellcasting leap','Basic cleanse, capped5-second spell immunity, impact Spell Block','Enemy then real magical nonlethal self damage, source-native slow and AA Super self-loss transfer','True single-target taunt without Duel and AA Gaben45strength'],remaining:['AA Super raw-versus-effective self-loss basis under shields/deferred mitigation remains a working interpretation','Multiple concurrent invisible-projectile replay/recast and five-second-buff-expiry interactions require targeted source results','2023body2440cutoff conflicts with stale1400/.015tooltip; body profile is selected explicitly']};
 registry[DRAIN]={target:'any',range:7,channel:c=>v(c,'CHANNEL DURATION',10),spellBlockTiming:'cast',allowZeroCooldown:true,targetEligibility:(c,t)=>ordinary(t)&&t.id!==c.caster.id&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&(t.side===c.caster.side||!has(c,t,'magicImmune'))&&(t.side===c.caster.side||c.canTarget?.(t,true)!==false),targetSelector:(c,targets)=>{
  const ally=c.caster.hp/c.caster.maxHp>.9?targets.filter(t=>t.side===c.caster.side&&t.hp/t.maxHp<.5).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id.localeCompare(b.id))[0]:undefined;
  return ally??targets.filter(t=>t.side!==c.caster.side).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0];
 },cast:lifeDrain,onStatusRemoved:(c,status,reason)=>{if(status.kind!=='lifeDrainLink'||reason!=='dispel')return;status.data={...status.data,removed:true};const token=String(status.data?.drainToken),state=drainMap(c).get(token);c.target.statuses=statuses(c.target).filter(s=>!(own(c,s)&&s.data?.drainToken===token));if(state){state.links.delete(c.target.id);if(!state.links.size)endDrain(state);}},superImplemented:true,gabenImplemented:true,implemented:['Native quarter-second damage and actual-damage restoration before7.33','Lethal magical ally self-transfer, full-health allied-hero mana conversion and True Sight','AA one-second random secondary heroes; surviving links keep the shared channel after primary loss','Strong dispel per link and real Gaben zero cooldown/final500DPS'],remaining:['AA low-ally50% is an explicit AI policy','Current attacks on strong illusions/creep-hero mana classification and health-setting/FalsePromise crossings retain precise source limits','Full modern flat-heal and50%mana restore changes are deliberately excluded by dated7.33history']};
 registry[BOLT]={target:'enemy',pointTarget:groundBolt,unitTarget:c=>!groundBolt(c),spellBlockTiming:'program',targetEligibility:(c,t)=>ordinary(t)&&t.side!==c.caster.side&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&!has(c,t,'magicImmune'),cast:bolt,init:c=>{if(S(c))c.grantAbility?.(CLOUD,1);if(G(c))c.grantAbility?.(WRATH,3);},superImplemented:true,gabenImplemented:true,implemented:['AA425ground search with hero priority and invisible-unit targeting; direct-unit SpellBlock differs from ground vision','Immediate stationary750TrueSight area and AA Super1second stun/finalcast range','Independent native Nimbus and max-level historical Wrath'],remaining:['Ground-selection AI and untargetable-family edge cases are bounded interpretations','2023Bolt point.3 retained; exact older Bolt/Nimbus/Wrath backswing and TrueSight linger require direct capture','No full fog/elevation simulation is claimed']};
 registry[CLOUD]={target:'enemy',pointTarget:true,range:999.99,cast:cloud,implemented:['Native NO_ATTACK16HP stationary ward with4melee/8ranged/16creep hit counts','Immediate/ready-on-entry closest-target bolting on the Nimbus actor, not hero amp','Source-owned learned Bolt rank and released body persist after owner death'],remaining:['Dynamic cooldown-reduction historical Nimbus interval transition remains version-scoped','SpellSteal acquiring Nimbus without its associated Bolt and exact overlap/source-loss reacquisition identity remain scoped']};
 registry[WRATH]={target:'self',cast:wrath,implemented:['Historical global enemy-hero damage with invisible-first-hit exception and separate true-sight area','Independent native resources/ranks and no later modern health-percent damage'],remaining:['TempestDouble versus Meepo/other clone eligibility and exact older vision-center behavior require profile-specific source verification']};
 registry[SHRED]={target:'self',cast:shred,attackMainDamage:c=>{
  const extra=c.attackSourceSkill===SHRED?shredExtras.get(c.battle)?.get(c.caster.id):undefined;
  if(extra){if(c.attackRecord)c.attackRecord.data[`shred:${identity(c)}`]=extra;return extra.ownAttack?{}:{fixedDamage:extra.damage};}
  const state=shredMap(c).get(shredKey(c));if(!state||state.remaining<=0||!c.caster.statuses.includes(state.marker))return{};
  const snapshot:ShredSnapshot={active:true,ownAttack:state.ownAttack,damage:state.damage,armor:v(c,'ARMOR LOSS PER STACK'),duration:v(c,'ARMOR LOSS DURATION'),multishot:G(c)?v(c,'MULTISHOT TARGETS',2):0,session:state.token};
  if(c.attackRecord)c.attackRecord.data[`shred:${identity(c)}`]=snapshot;
  return state.ownAttack?{}:{fixedDamage:state.damage};
 },onAttackPoint:c=>{
  const snapshot=shredSnapshot(c);if(!snapshot||c.attackSourceSkill===SHRED)return;
  const searchRange=c.attackRange?.(c.caster)??c.caster.range;
  const state=shredMap(c).get(shredKey(c));if(state?.token===snapshot.session){state.remaining=Math.max(0,state.remaining-1);state.marker.value=state.remaining;if(!state.remaining)clearShred(state);}
  if(snapshot.multishot){const candidates=c.enemies().filter(t=>ordinary(t)&&t.id!==c.target.id&&(c.canTarget?.(t,true)??true)&&distance(t,c.caster)<=searchRange);
   let extras=shredExtras.get(c.battle);if(!extras){extras=new Map;shredExtras.set(c.battle,extras);}extras.set(c.caster.id,snapshot);
   try{for(let n=0;n<snapshot.multishot&&candidates.length;n++){const index=Math.floor(c.random()*candidates.length),target=candidates.splice(index,1)[0];c.attack(target,1,true,undefined,false,{modifierPolicy:'all',attackBatchKey:`shred:${c.attackInstanceKey??identity(c)}:${c.attackRecord?.id??c.battle.time}`});}}finally{extras.delete(c.caster.id);}
  }
 },beforeAttackDamage:c=>{
  const snapshot=shredSnapshot(c);if(!snapshot)return;
  const old=statuses(c.target).find(s=>s.kind==='shredderStacks'&&own(c,s)),count=Number(old?.value??0)+1;
  const options:Partial<EffectStatus>={harmful:true,dispel:'basic'};c.status(c.target,'shredderStacks',snapshot.duration,count,options);c.status(c.target,'armor',snapshot.duration,-count*snapshot.armor,options);
 },onStatusRemoved:(c,status)=>{if(status.kind!=='lilShredder')return;const state=shredMap(c).get(shredKey(c));if(state&&state.token===status.data?.shredToken)clearShred(state);},superImplemented:true,gabenImplemented:true,implemented:['Six-second6charge buff with nativeBAT1/AA300AS/range and source-snapshotted fixed versus own attack','Charges consumed once on primary launch even when missed; armor applied before successful damage','Gaben random full-modifier instant secondary attacks without recursion'],remaining:['AA3x currently means primary+2; frozenWiki bonus3 versus2023talent3x terminology needs direct native reconciliation','Exact Gaben secondary missile policy, fixed attack interactions with other replacements and modifiers after last-charge launch remain scoped']};
}
