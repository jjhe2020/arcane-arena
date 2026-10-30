import {skillBalance} from '../config';
import type {BattleState,CombatUnit,SkillDefinition} from '../model';
import {skillValue,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {childValue} from './historical-children';
import {charged} from './charges';
import {addVisualWorldEffect,removeVisualWorldEffect} from './visual-state';

const AIM='custom_sniper_take_aim',TIDE='kunkka_tidebringer',TRICKS='custom_riki_tricks_of_the_trade',FURY='marci_unleash',WIND='custom_windrunner_windrun',GRENADE='sniper_concussive_grenade',ASSASSINATE='sniper_assassinate',SMOKE='riki_smoke_screen';
const STEP=1/30,EPS=1e-8,FOREVER=1_000_000;
const list=(u:CombatUnit)=>u.statuses as EffectStatus[],identity=(c:C)=>c.skill.instanceId??c.attackInstanceKey??c.skill.id;
const has=(c:C,u:CombatUnit,k:string)=>list(u).some(s=>s.kind===k&&s.until>c.battle.time+EPS),S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9;
const v=(c:C,key:string,fallback=0)=>c.definition.grantedOnly?childValue(c,key,fallback):skillValue(c,key,fallback);
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const ordinary=(t:CombatUnit)=>!t.dead&&!t.ward&&!t.building&&!t.courier&&!t.hiddenSpellBody;
const hidden=(c:C,t:CombatUnit)=>has(c,t,'banished')||list(t).some(s=>s.until>c.battle.time&&s.data?.outOfGame===true);
const visible=(c:C,t:CombatUnit)=>!has(c,t,'undetectable')&&!has(c,t,'shadowRealm')&&(!has(c,t,'invisible')||has(c,t,'revealed'));
const remove=(c:C,u:CombatUnit,run:string)=>{u.statuses=list(u).filter(s=>s.data?.tempoRun!==run);};
const serial=(c:C)=>{const key=`tempoSerial:${identity(c)}`;c.caster[key]=Number(c.caster[key]??0)+1;return`${c.caster.id}:${identity(c)}:${c.caster[key]}`;};
function native(id:string,name:string,nameEn:string,parent:string,maximum:number,values:string[],cooldowns:number[],mana:number[],castPoint:number,backswing:number,range:number,ultimate=false):SkillDefinition {
 return{id,name,nameEn,description:`独立历史原生等级的${name}；父技能触发时保留根归因。`,descriptionEn:`Independent historical native ${nameEn} component.`,super:'',gaben:'',values,cooldowns,mana,categories:['ABILITY: Point Target'],tags:[],icon:`/art/icons/${parent}.webp`,passive:false,ultimate,grantedOnly:true,balanceDomain:'native',sourceMaximumLevel:maximum,visualParentId:parent,historicalSource:{id,maxLevel:maximum,date:'2023-02-10'},referencePublic:{castPoint,backswing,range}};
}
export const ATTACK_TEMPO_CHILD_DEFINITIONS:SkillDefinition[]=[
 native('sniper_concussive_grenade','震荡手雷','Concussive Grenade',AIM,1,['DAMAGE: 25','RADIUS: 375','PROJECTILE SPEED: 2500','KNOCKBACK DISTANCE: 475','KNOCKBACK DURATION: 0.4','MOVEMENT SLOW: 50','DEBUFF DURATION: 3'],[10],[50],.1,.8,6),
 {...native('sniper_assassinate','暗杀','Assassinate',AIM,3,['DAMAGE: 320 / 510 / 700','PROJECTILE SPEED: 2500','MINISTUN: 0.01','VISION DURATION: 4'],[20,15,10],[175,225,275],2,1.37,30,true),categories:['ABILITY: Unit Target','DAMAGE TYPE: Magical']},
 native('riki_smoke_screen','烟幕','Smoke Screen',TRICKS,4,['RADIUS: 375','DURATION: 6 / 6 / 6 / 2','MISS CHANCE: 30 / 45 / 60 / 75','AURA LINGER: 0.5'],[20,17,14,11],[65,70,75,80],.2,0,5.5)
];

function grenade(c:C):void {
 const point={...c.castPosition??c.target},origin={x:c.caster.x,y:c.caster.y},push=v(c,'KNOCKBACK DISTANCE',475)/100,time=v(c,'KNOCKBACK DURATION',.4),debuff=v(c,'DEBUFF DURATION',3);
 const dx=origin.x-point.x,dy=origin.y-point.y,len=Math.hypot(dx,dy)||1;
 c.cancelMotion?.(c.caster);c.moveContinuous(c.caster,origin.x+dx/len*push,origin.y+dy/len*push,{duration:time,ignoreTerrainBarriers:true,lockActions:false});
 const explode=()=>{addVisualWorldEffect(c.battle,{source:c.caster.id,skill:AIM,points:c.visualPoints??c.skill.points,layer:'grenade_burst',x:point.x,y:point.y,radius:v(c,'RADIUS',375)/100,until:c.battle.time+16/24});for(const target of c.enemies().filter(t=>ordinary(t)&&!t.roshan&&!hidden(c,t)&&!has(c,t,'invulnerable')&&!has(c,t,'magicImmune')&&dist(t,point)<=v(c,'RADIUS',375)/100+EPS)){
  const ax=target.x-point.x,ay=target.y-point.y,length=Math.hypot(ax,ay)||1,run=serial(c),options={harmful:true,dispel:'basic' as const,removeOnDeath:true,data:{tempoRun:run}};
  c.status(target,'slow',debuff,v(c,'MOVEMENT SLOW',50)/100,options);c.status(target,'disarm',debuff,0,options);c.status(target,'stun',time,0,{...options,dispel:'strong'});
  c.cancelMotion?.(target);c.moveContinuous(target,target.x+ax/length*push,target.y+ay/length*push,{duration:time,ignoreTerrainBarriers:true});c.damage(target,v(c,'DAMAGE',25),'magical');
 }};
 const distance=dist(origin,point);if(distance<=EPS)explode();else c.linearProjectile({origin,angle:Math.atan2(point.y-origin.y,point.x-origin.x),distance,speed:v(c,'PROJECTILE SPEED',2500)/100,width:0,visualLayer:'grenade',targetFilter:()=>false,effect:()=>{},onEnd:explode});
}
function assassinate(c:C):void {
 const target=c.target,run=serial(c),until=c.battle.time+v(c,'VISION DURATION',4);c.status(target,'revealed',until-c.battle.time,0,{harmful:true,dispel:'none',piercesImmunity:true,data:{tempoRun:run}});
 c.projectile(target,v(c,'PROJECTILE SPEED',2500)/100,t=>{remove(c,t,run);if(t.dead||hidden(c,t)||has(c,t,'invulnerable')||has(c,t,'magicImmune')||c.trySpellBlock?.(t))return;c.damage(t,v(c,'DAMAGE',700),'magical');if(!t.dead)c.status(t,'stun',v(c,'MINISTUN',.01),0,{harmful:true,dispel:'strong',removeOnDeath:true});},undefined,undefined,{visualLayer:'assassinate',onDisjoint:()=>remove(c,target,run),onTargetLost:()=>remove(c,target,run)});
}
function aimInit(c:C):void {c.status(c.caster,'range',FOREVER,v(c,'BONUS RANGE')/100,{dispel:'none',passive:true});if(S(c))c.grantAbility?.(GRENADE,v(c,'GRENADE LEVEL',1));}
function aimAttack(c:C):void {if(!G(c)||c.caster.illusion)return;const key=`tempoAssassinate:${identity(c)}`;if(Number(c.caster[key]??0)>c.battle.time+EPS)return;c.caster[key]=c.battle.time+v(c,'ASSASSINATE COOLDOWN',5);c.castAbility(ASSASSINATE,v(c,'ASSASSINATE LEVEL',3),c.target);}

const tideKey=(c:C)=>`tempoTide:${identity(c)}`;
const tideSlot=(c:C)=>{const exact=c.caster.skills.indexOf(c.skill);return exact>=0?exact:c.skill.instanceId?c.caster.skills.findIndex(skill=>skill?.id===TIDE&&skill.instanceId===c.skill.instanceId):-1;};
const tideDeadline=(c:C)=>{const slot=tideSlot(c);return slot>=0?Number(c.caster.cooldowns[slot]??0):Number(c.caster[tideKey(c)]??0);};
function tideEligible(c:C):boolean {return !c.caster.illusion&&!has(c,c.caster,'silence')&&!has(c,c.caster,'hex')&&c.target.side!==c.caster.side&&ordinary(c.target)&&c.attackSourceSkill!=='phantom_assassin_stifling_dagger';}
function tideInit(c:C):void {
 const tick=()=>{const ready=!c.caster.dead&&!c.caster.illusion&&!has(c,c.caster,'silence')&&!has(c,c.caster,'hex')&&c.battle.time>=tideDeadline(c)-EPS;
  if(ready)c.status(c.caster,'attackBonus',STEP*2,v(c,'DAMAGE BONUS'),{dispel:'none',passive:false,data:{instanceKey:identity(c),tempoTideReady:true}});
  else c.caster.statuses=list(c.caster).filter(s=>!(s.source===c.caster.id&&s.skill===TIDE&&s.data?.tempoTideReady&&s.data.instanceKey===identity(c)));c.delay(STEP,tick);
 };tick();
}
function tideMain(c:C){const visibleBonus=list(c.caster).find(s=>s.skill===TIDE&&s.source===c.caster.id&&s.data?.tempoTideReady&&s.data.instanceKey===identity(c)&&s.until>c.battle.time)?.value??0,eligible=tideEligible(c);if(c.attackRecord)c.attackRecord.data[`${tideKey(c)}:included`]=eligible?visibleBonus:0;return eligible?{}:{flatBonus:-visibleBonus};}
function tidePoint(c:C):void {if(!c.attackRecord)return;const key=tideKey(c),ready=tideEligible(c)&&c.battle.time>=tideDeadline(c)-EPS;c.attackRecord.data[key]=ready;if(ready){const cd=skillBalance(c.definition,c.skill.points)?.cooldown??Math.max(0,(c.definition.cooldowns[Math.min(2,c.skill.points-1)]??0)-(S(c)?2:0));const deadline=c.battle.time+Math.max(0,cd-(c.stolenCooldownReduction??0))*Math.max(.1,1-list(c.caster).filter(s=>s.kind==='cooldownReduction'&&s.until>c.battle.time).reduce((n,s)=>n+(s.value??0),0));const slot=tideSlot(c);if(slot>=0)c.caster.cooldowns[slot]=deadline;else c.caster[key]=deadline;c.caster.statuses=list(c.caster).filter(s=>!(s.source===c.caster.id&&s.skill===TIDE&&s.data?.tempoTideReady&&s.data.instanceKey===identity(c)));}}
function tideModifier(c:C){const key=tideKey(c),included=Number(c.attackRecord?.data[`${key}:included`]??0);return{bonus:(c.attackRecord?.data[key]?v(c,'DAMAGE BONUS'):0)-included};}
function tideCleave(c:C):void {
 if(!c.attackRecord?.data[tideKey(c)])return;const dx=c.target.x-c.caster.x,dy=c.target.y-c.caster.y,l=Math.hypot(dx,dy)||1,range=v(c,'CLEAVE RANGE')/100,start=v(c,'CLEAVE START RADIUS',150)/100,end=v(c,'CLEAVE END RADIUS',650)/100,damage=Number(c.attackCleaveDamage??c.attackDamage??0)*v(c,'CLEAVE DAMAGE')/100;
 addVisualWorldEffect(c.battle,{source:c.caster.id,skill:TIDE,points:c.skill.points,layer:'cleave',x:c.caster.x,y:c.caster.y,angle:Math.atan2(dy,dx),until:c.battle.time+16/24});
 for(const t of c.enemies().filter(t=>t.id!==c.target.id&&ordinary(t)&&!hidden(c,t)&&!has(c,t,'invulnerable'))){const along=((t.x-c.caster.x)*dx+(t.y-c.caster.y)*dy)/l,across=Math.abs((t.x-c.caster.x)*dy-(t.y-c.caster.y)*dx)/l;if(along>=0&&along<=range+EPS&&across<=start+(end-start)*along/range+EPS)c.damage(t,damage,'physical',true,{flags:{noAmplification:true,noSpellLifesteal:true,physicalAttackBlock:true}});}
}

interface SmokeLease {c:C;target:CombatUnit;key:string;until:number;done:boolean}
const smokeLeases=new WeakMap<BattleState,Map<string,SmokeLease>>();
function leaseSmoke(c:C,target:CombatUnit,linger:number):void {
 let map=smokeLeases.get(c.battle);if(!map)smokeLeases.set(c.battle,map=new Map());let lease=map.get(target.id);
 if(lease&&!lease.done&&lease.until>c.battle.time+EPS){lease.until=c.battle.time+linger;return;}
 lease={c,target,key:serial(c),until:c.battle.time+linger,done:false};map.set(target.id,lease);const holder=lease,clear=()=>{target.statuses=list(target).filter(s=>s.data?.smokeLease!==holder.key);};
 const tick=()=>{if(target.dead||c.battle.time>=holder.until-EPS){holder.done=true;clear();return;}
  if(hidden(c,target)||has(c,target,'invulnerable')||has(c,target,'magicImmune'))clear();else{const options={harmful:true,dispel:'none' as const,removeOnDeath:true,data:{smokeLease:holder.key,instanceKey:'smoke'}};holder.c.status(target,'silence',holder.until-c.battle.time,0,options);holder.c.status(target,'blind',holder.until-c.battle.time,v(holder.c,'MISS CHANCE',75)/100,{...options,data:{...options.data,prdKey:'blind'}});}
  c.delay(STEP,tick);
 };tick();
}
function smoke(c:C):void {const point={...c.castPosition??c.target},duration=v(c,'DURATION',2),linger=v(c,'AURA LINGER',.5);c.zone({x:point.x,y:point.y,radius:v(c,'RADIUS',375)/100,duration,interval:STEP,immediate:true,includeEnd:true,effect:t=>{if(!ordinary(t)||hidden(c,t)||has(c,t,'invulnerable'))return;const existing=smokeLeases.get(c.battle)?.get(t.id);if(has(c,t,'magicImmune')&&!existing)return;leaseSmoke(c,t,linger);}});}

function tricks(c:C):void {
 const duration=v(c,'DURATION'),count=v(c,'ATTACK RATE',S(c)?5:4),targetsPer=v(c,'TARGETS PER ATTACK',S(c)?2:1),run=serial(c),end=c.battle.time+duration;let active=true;
 c.disjoint(c.caster);for(const kind of['invulnerable','phased','visualForm'])c.status(c.caster,kind,duration+STEP,1,{dispel:'none',removeOnDeath:true,data:{tempoRun:run,form:'tricks',hidden:kind==='visualForm',outOfGame:true}});
 const boundary=addVisualWorldEffect(c.battle,{source:c.caster.id,skill:TRICKS,points:c.skill.points,layer:'boundary',x:c.caster.x,y:c.caster.y,followUnit:c.caster.id,radius:v(c,'RADIUS')/100,until:end+STEP,loop:true,expiresWithSource:true});
 const cleanup=()=>{if(!active)return;active=false;remove(c,c.caster,run);removeVisualWorldEffect(c.battle,boundary);};c.onChannelEnd?.(cleanup);
 if(G(c))c.castAbility(SMOKE,v(c,'SMOKE LEVEL',4),c.caster);
 const hit=()=>{if(!active||c.caster.dead||c.battle.time>end+EPS)return;const targets=c.enemies().filter(t=>ordinary(t)&&!t.consideredHero&&(!t.summoned||t.illusion||t.heroClone)&&!hidden(c,t)&&!has(c,t,'invulnerable')&&!has(c,t,'attackImmune')&&visible(c,t)&&dist(c.caster,t)<=v(c,'RADIUS')/100+EPS);
  for(let i=0;i<targetsPer&&targets.length;i++){const index=Math.floor(c.random()*targets.length),target=targets.splice(index,1)[0];c.attack(target,v(c,'ATTACK DAMAGE FACTOR',40)/100,true,undefined,true);}
 };
 for(let i=0;i<count;i++){if(i===0)hit();else c.delay(i*duration/Math.max(1,count-1),hit);}c.delay(duration+STEP,cleanup);
}

interface FuryState {run:string;until:number;phase:'flurry'|'recovery';remaining:number;firstAt?:number;recoverUntil?:number;successful?:boolean}
const furyState=(c:C)=>c.caster[`tempoFury:${identity(c)}`] as FuryState|undefined;
function furyCounter(c:C,s:FuryState):void {c.status(c.caster,'unleash',Math.max(STEP,s.until-c.battle.time),s.phase==='flurry'?s.remaining:0,{dispel:'none',removeOnDeath:true,data:{tempoRun:s.run}});}
function furyClearPhase(c:C,s:FuryState):void {c.caster.statuses=list(c.caster).filter(x=>!(x.data?.tempoRun===s.run&&x.data?.furyPhase));}
function furyLoad(c:C,s:FuryState):void {furyClearPhase(c,s);s.phase='flurry';s.remaining=v(c,'STRIKES PER FURY');s.firstAt=undefined;s.recoverUntil=undefined;s.successful=undefined;furyCounter(c,s);c.status(c.caster,'attackSpeed',Math.max(STEP,s.until-c.battle.time),v(c,'BONUS ATTACK SPEED'),{dispel:'none',removeOnDeath:true,data:{tempoRun:s.run,furyPhase:true}});}
function furyRecover(c:C,s:FuryState,success:boolean):void {furyClearPhase(c,s);s.phase='recovery';s.recoverUntil=c.battle.time+v(c,'FLURRY COOLDOWN',1.5);s.successful=success;furyCounter(c,s);if(success){const data={tempoRun:s.run,furyPhase:true};c.status(c.caster,'disarm',v(c,'FLURRY COOLDOWN',1.5),0,{dispel:'none',removeOnDeath:true,data});c.status(c.caster,'baseAttackTime',v(c,'FLURRY COOLDOWN',1.5),v(c,'RECOVERY ATTACK TIME',2),{dispel:'none',removeOnDeath:true,data});}}
function fury(c:C):void {
 const run=serial(c),duration=v(c,'DURATION'),s:FuryState={run,until:c.battle.time+duration,phase:'flurry',remaining:v(c,'STRIKES PER FURY')};c.caster[`tempoFury:${identity(c)}`]=s;
 c.status(c.caster,'unleash',duration,1,{dispel:'none',removeOnDeath:true,data:{tempoRun:run}});c.status(c.caster,'haste',duration,v(c,'MOVEMENT SPEED BONUS',15)/100,{dispel:'none',removeOnDeath:true,data:{tempoRun:run}});c.status(c.caster,'maximumAttackSpeed',duration,0,{dispel:'none',removeOnDeath:true,data:{tempoRun:run,unlimited:true}});furyLoad(c,s);
 const tick=()=>{if(c.caster.dead||c.battle.time>=s.until-EPS||!list(c.caster).some(x=>x.kind==='unleash'&&x.data?.tempoRun===run)){remove(c,c.caster,run);return;}if(s.phase==='flurry'&&s.firstAt!==undefined&&c.battle.time>=s.firstAt+v(c,'FLURRY WINDOW',1)-EPS)furyRecover(c,s,false);if(s.phase==='recovery'&&c.battle.time>=Number(s.recoverUntil)-EPS)furyLoad(c,s);c.delay(STEP,tick);};c.delay(STEP,tick);
}
function furyDebuff(c:C,t:CombatUnit):void {const duration=v(c,'DEBUFF DURATION',2),options={harmful:true,dispel:'basic' as const,removeOnDeath:true};c.status(t,'slow',duration,v(c,'MOVEMENT SLOW')/100,options);c.status(t,'attackSpeed',duration,-v(c,'BASE ATTACK SPEED SLOW'),options);}
function furyPulse(c:C,center:CombatUnit):void {for(const [layer,lifetime]of[['pulse',22/24],['pulse_core',10/24],['pulse_debris',26/24]]as const)addVisualWorldEffect(c.battle,{source:c.caster.id,skill:FURY,points:c.skill.points,layer,x:center.x,y:center.y,radius:v(c,'PULSE RADIUS')/100,until:c.battle.time+lifetime});for(const t of c.enemies().filter(t=>ordinary(t)&&!hidden(c,t)&&!has(c,t,'invulnerable')&&!has(c,t,'magicImmune')&&dist(t,center)<=v(c,'PULSE RADIUS')/100+EPS)){furyDebuff(c,t);c.damage(t,v(c,'PULSE DAMAGE'),'magical');if(S(c)&&!t.dead)c.status(t,'silence',v(c,'PULSE SILENCE',1.5),0,{harmful:true,dispel:'basic',removeOnDeath:true});}}
function furyPoint(c:C):void {const s=furyState(c),record=c.attackRecord;if(!s||!record||s.phase!=='flurry'||c.battle.time>=s.until||record.data[`tempoFury:${s.run}`])return;record.data[`tempoFury:${s.run}`]=true;s.firstAt??=c.battle.time;s.remaining--;furyCounter(c,s);furyDebuff(c,c.target);if(s.remaining<=0){furyPulse(c,c.target);furyRecover(c,s,true);}}

function wind(c:C):void {
 if(G(c)){c.caster[`tempoWindNextCast:${identity(c)}`]=c.battle.time+v(c,'CHARGE CAST INTERVAL',.25);c.resetCooldown?.();}
 c.interrupt?.(c.caster);const duration=v(c,'DURATION')+(!skillBalance(c.definition,c.skill.points)&&S(c)?2:0),run=serial(c),data={tempoRun:run,instanceKey:identity(c)};c.status(c.caster,'windrun',duration,1,{dispel:'basic',removeOnDeath:true,data});for(const[kind,value]of[['evasion',v(c,'EVASION')/100],['haste',v(c,'MOVE SPEED BONUS')/100]]as const)c.status(c.caster,kind,duration,value,{dispel:'basic',removeOnDeath:true,data});
 const tick=()=>{if(c.caster.dead||!list(c.caster).some(s=>s.kind==='windrun'&&s.data?.tempoRun===run&&s.until>c.battle.time+EPS))return;for(const t of c.enemies().filter(t=>ordinary(t)&&!hidden(c,t)&&!has(c,t,'invulnerable')&&!has(c,t,'magicImmune')&&dist(c.caster,t)<=v(c,'ENEMY SLOW RADIUS')/100+EPS))c.status(t,'slow',v(c,'AURA LINGER',2.5),Math.abs(v(c,'ENEMY SLOW'))/100,{harmful:true,dispel:'basic',removeOnDeath:true,data});c.delay(STEP,tick);};tick();
}

export function applyAttackTempoAcceptance(registry:Record<string,SkillProgram>):void {
 registry[AIM]={passive:true,init:aimInit,onAttack:aimAttack,superImplemented:true,gabenImplemented:true,implemented:['Explicit AA passive-only range;no native active is imported','Independent native Grenade and five-second attack-triggered Assassinate'],remaining:['Exact AA Assassinate grant rank is unspecified;max3working value retained','In-flight level/source-slot transitions remain individually qualified']};
 registry[GRENADE]={target:'enemy',pointTarget:true,rootDisables:true,cast:grenade,implemented:['Native2500ground projectile;enemy debuff/disable/continuous knockback before damage','Self push is continuous and does not disable;terrain exception remains distinct from arena walls'],remaining:['Vertical-motion conflicts,arc height and trees have no full planar equivalent']};
 registry[ASSASSINATE]={target:'enemy',unitTarget:true,spellBlockTiming:'program',projectileDisjointable:true,projectileDisjointOnInvisibility:true,projectileDisjointOnUndetectable:true,cast:assassinate,implemented:['Native damage before one-frame ministun and impact-blocked2500tracking shot','Temporary native reveal belongs to actual shot;free AA proc retains native3stat domain'],remaining:['Source-death/slot-removal phases remain individually bounded;native passive attack proc rank remains an AA working default']};
 registry[TIDE]={passive:false,handlesBreak:true,init:tideInit,attackMainDamage:tideMain,onAttackPoint:tidePoint,attackModifier:tideModifier,onAttack:tideCleave,superImplemented:true,gabenImplemented:true,implemented:['Cooldown-ready regular damage bonus with2023silence/Break and illusion eligibility','Real attackCleaveDamage snapshot and native150/end-radius trapezoid','Cleave is physical spell with no spell amplification/lifesteal and native physical block'],remaining:['Mid-windup eligibility changes and arbitrary ranged/instant exceptions remain source-qualified','Manual autocast input is represented by the existing always-on arena policy']};
 registry[SMOKE]={target:'enemy',pointTarget:true,cast:smoke,implemented:['Native independent4rank domain and explicit AAlevel4two-second final duration','Half-second lease,75percent wearer PRD and immunity-qualified aura'],remaining:['Mixed blind/evasion/accuracy roll order is a declared engine working policy,not complete native proof']};
 registry[TRICKS]={target:'self',channel:c=>v(c,'DURATION'),rootDisables:true,leashDisables:true,canCast:c=>!has(c,c.caster,'sleightActive')&&c.enemies().some(t=>ordinary(t)&&!t.consideredHero&&(!t.summoned||t.illusion||t.heroClone)&&visible(c,t)&&!hidden(c,t)&&!has(c,t,'invulnerable')&&dist(t,c.caster)<=v(c,'RADIUS')/100),cast:tricks,attackMainDamage:c=>({baseBonus:c.attackSourceSkill===TRICKS&&c.caster.primaryAttribute==='agility'?Number(c.caster.agility??0)*v(c,'AGILITY BONUS',100)/100:0}),superImplemented:true,gabenImplemented:true,implemented:['Native hidden out-of-game channel and immediate first instant attack;frozen count includes final channel boundary','Ability-only white agility contribution and40percent real attack factor','AAhero-only selection,Super two distinct targets/five rounds,independent Gnative4Smoke','Official AASeason4 excludes new Tricks while the actual Sleight marker is active'],remaining:['Explicit AA greatly increased cast point lacks a recovered numerical value;current public.3is not certified','Native ally-target jump/fullScepter and missing Cloak are not silently granted;Fog/player queues remain bounded']};
 registry[FURY]={target:'self',canCast:c=>!has(c,c.caster,'unleash')&&c.enemies().some(t=>ordinary(t)&&dist(t,c.caster)<=8),cast:fury,onAttackPoint:furyPoint,onCast:c=>{if(G(c)&&c.triggerSkillId!==FURY&&has(c,c.caster,'unleash'))furyPulse(c,c.caster);},superImplemented:true,gabenImplemented:true,implemented:['Native1second flurry windows and separate success/failure1.5second recovery;AS only while loaded','Executed attack records consume charges even on miss/instant attacks;last pulse precedes primary damage','AA15percent movement,Super silence and Gany-spell pulse/-10cooldown;no fullScepter basic purge imported'],remaining:['Recovery fixed2BAT plus action suppression is an explicit finite arena representation;foreign IAS/time-scaling combinations need qualification','AAattack-speed-slow terminology and precise ranged pulse-versus-projectile timing remain separately qualified']};
 const windrun:SkillProgram={target:'self',castPoint:0,backswing:0,canCastWhileChanneling:true,canCast:c=>c.battle.time>=Number(c.caster[`tempoWindNextCast:${identity(c)}`]??0)-EPS&&c.enemies().some(t=>ordinary(t)&&dist(t,c.caster)<=8),cast:wind,superImplemented:true,gabenImplemented:true,implemented:['Native immediate cast/zero backswing and2.5second slow lease with AA80evasion/60speed','Actual dispellable Windrun lifetime owns its aura;purge/death stops renewal','Unique final AA1/2/4/6duration and Gtwo sequential charges use public recharge authority/sharedmemory','No ungranted Scepter invisibility/phasing/old movement bonus imported'],remaining:['Charge acquisition/stolen/transferred-state and old7.22quarter-second action gap are qualified arena policies']};charged(windrun,G,c=>v(c,'CHARGES',2),c=>skillBalance(c.definition,c.skill.points)?.cooldown??12);registry[WIND]=windrun;
}
