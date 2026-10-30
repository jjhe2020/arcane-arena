import {BATTLE_CONFIG,skillBalance}from'../config';
import type {BattleState,CombatUnit}from'../model';
import {skillValue,type EffectContext as C,type SkillProgram}from'../skill-effects';
import {addVisualBodyAction,addVisualProjectile,moveVisualProjectile,removeVisualProjectile}from'./visual-state';

const LUM='custom_dawnbreaker_luminosity',LANCE='custom_phantom_lancer_spirit_lance',TRAMPLE='primal_beast_trample',STEP=1/30;
const v=(c:C,key:string,fallback=0)=>skillValue(c,key,fallback);
// Retain the already serialized counter namespace. These final overrides own
// the state from battle creation; no old function/private closure is invoked.
const key=(c:C,name:string)=>`${c.skill.instanceId??c.skill.id}:${name}`;
const read=(c:C,name:string)=>Number(c.caster[key(c,name)]??0);
const write=(c:C,name:string,n:number)=>{c.caster[key(c,name)]=n;};
const has=(c:C,u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind&&s.until>c.battle.time+1e-8);
const enemy=(c:C,t:CombatUnit)=>!t.dead&&t.side!==c.caster.side&&!t.ward&&!t.building&&!t.courier;
const hero=(t:CombatUnit)=>!t.summoned||!!t.illusion||!!t.consideredHero||!!t.heroClone;
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const visible=(c:C,t:CombatUnit)=>!has(c,t,'undetectable')&&!has(c,t,'shadowRealm')&&(!has(c,t,'invisible')||has(c,t,'revealed'));
interface LumSnapshot{ready:boolean;healFactor:number;allyFactor:number;radius:number}
interface LumBatch{key:string;ready:boolean;processed:boolean}
function lumSnapshot(c:C):LumSnapshot{
 const stored=c.attackRecord?.data[key(c,'luminosity')]as LumSnapshot|undefined;if(stored)return stored;
 let batch=c.caster[key(c,'batch')]as LumBatch|undefined;
 if(c.attackBatchKey&&batch?.key!==c.attackBatchKey){batch={key:c.attackBatchKey,ready:read(c,'hits')>=v(c,'ATTACKS TO CHARGE',c.skill.points>=6?2:3),processed:false};c.caster[key(c,'batch')]=batch;}
 const snapshot={ready:c.attackBatchKey?!!batch?.ready:read(c,'hits')>=v(c,'ATTACKS TO CHARGE',c.skill.points>=6?2:3),healFactor:(v(c,'HEALING FROM HEROES')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=9?150:0))/100,allyFactor:v(c,'ALLY HEAL PERCENT',35)/100,radius:v(c,'HEAL RADIUS',650)/100};
 if(c.attackRecord)c.attackRecord.data[key(c,'luminosity')]=snapshot;return snapshot;
}
function lumHeal(c:C):void{
 const snapshot=c.attackRecord?.data[key(c,'luminosity')]as LumSnapshot|undefined,resolution=c.attackDamageResolution;
 if(!snapshot?.ready||!resolution||has(c,c.caster,'break')||!enemy(c,c.target)||!c.attackRecord||c.attackRecord.data[key(c,'restorationCommitted')])return;
 c.attackRecord.data[key(c,'restorationCommitted')]=true;
 if(resolution.damageType!=='physical'||resolution.outcome!=='damage')return;
 // Native lifesteal includes overkill and ordinarily ignores target generic
 // multipliers. Use observations from this one resolution,never a damage
 // preview/re-entry that can reroll PRD or consume another block/barrier.
 let basis=resolution.afterTypeMitigation??resolution.beforeHealthClamp??0;
 // These protection crossings are explicit retained working policies,not
 // claimed native phase closure. The detached event distinguishes zero from
 // a stage never reached; no guessed value is restored for converted/deferred.
 if(resolution.afterBarriers!==undefined&&resolution.afterGeneric!==undefined&&Math.abs(resolution.afterBarriers-resolution.afterGeneric)>1e-8
  ||resolution.afterRum!==undefined&&resolution.afterBarriers!==undefined&&Math.abs(resolution.afterRum-resolution.afterBarriers)>1e-8
  ||resolution.afterNonLethalClamp!==undefined&&resolution.beforeHealthClamp!==undefined&&resolution.afterNonLethalClamp<resolution.beforeHealthClamp-1e-8)basis=resolution.effectiveDamage;
 const amount=Math.max(0,basis)*snapshot.healFactor*(hero(c.target)?1:1-v(c,'CREEP HEAL PENALTY')/100);
 c.lifestealHeal?.(c.caster,amount);
 for(const ally of c.allies().filter(t=>t.id!==c.caster.id&&hero(t)&&!t.ward&&!t.building&&dist(t,c.caster)<=snapshot.radius))c.lifestealHeal?.(ally,amount*snapshot.allyFactor);
}

interface LanceRun{images:CombatUnit[];startedAt:number;until:number;targetId:string}
const lanceRuns=new WeakMap<BattleState,Map<string,LanceRun>>();
const lanceKey=(c:C)=>`${c.caster.id}:${c.skill.instanceId??c.attackInstanceKey??c.skill.id}`;
function lanceMap(c:C):Map<string,LanceRun>{let runs=lanceRuns.get(c.battle);if(!runs){runs=new Map();lanceRuns.set(c.battle,runs);}return runs;}
function lanceStart(c:C):void{
 const images=c.battle.units.filter(t=>t.illusion&&t.owner===c.caster.id&&!t.dead&&dist(t,c.caster)<=v(c,'FAKE CAST RADIUS',675)/100);
 const publicValues=skillBalance(c.definition,c.skill.points),until=Math.max(c.battle.time+(publicValues?.castPoint??.3)+(publicValues?.backswing??.73),c.caster.castUntil);
 lanceMap(c).set(lanceKey(c),{images,startedAt:c.battle.time,until,targetId:c.target.id});
 for(const image of images)addVisualBodyAction(c.battle,{unitId:image.id,sourceId:c.caster.id,skill:LANCE,points:c.skill.points,action:'cast',until,...(image.action==='idle'?{facing:Math.atan2(c.target.y-image.y,c.target.x-image.x)}:{})});
}
function fakeLances(c:C):void{
 const runs=lanceMap(c),run=runs.get(lanceKey(c));runs.delete(lanceKey(c));
 if(!run||run.targetId!==c.target.id||run.until<c.battle.time)return;
 for(const image of run.images.filter(t=>!t.dead&&t.owner===c.caster.id)){
  const speed=v(c,'LANCE SPEED',1000)/100,visual=addVisualProjectile(c.battle,{source:image.id,skill:LANCE,artSkill:LANCE,points:c.skill.points,layer:'lance',x:image.x,y:image.y,angle:Math.atan2(c.target.y-image.y,c.target.x-image.x),until:c.battle.time+STEP*2});
  const tick=()=>{
   // Pure presentation: no target acquisition,damage,debuff,spell block,
   // disjoint,bounce,proc,mana or mechanical projectile is ever created.
   const dx=c.target.x-visual.x,dy=c.target.y-visual.y,distance=Math.hypot(dx,dy),travel=speed*STEP;
   if(distance<=travel+1e-8){removeVisualProjectile(c.battle,visual);return;}
   moveVisualProjectile(c.battle,visual,{x:visual.x+dx/distance*travel,y:visual.y+dy/distance*travel},c.battle.time+STEP*2);c.delay(STEP,tick);
  };c.delay(STEP,tick);
 }
}
function lance(c:C):void{
 fakeLances(c);
 const seen=new Set<string>();
 const launch=(target:CombatUnit,left:number,origin?:{x:number;y:number})=>{
  seen.add(target.id);c.projectile(target,v(c,'LANCE SPEED',1000)/100,t=>{
   if(t.dead||has(c,t,'magicImmune')||has(c,t,'invulnerable')||has(c,t,'banished')||t.hiddenSpellBody||c.trySpellBlock?.(t))return;
   const debuff=()=>c.status(t,'slow',v(c,'SLOW DURATION'),Math.abs(v(c,'MOVEMENT SLOW'))/100,{harmful:true,dispel:'basic',removeOnDeath:true});
   if(c.damageWithEffects)c.damageWithEffects(t,v(c,'LANCE DAMAGE'),'magical',false,debuff);else{debuff();c.damage(t,v(c,'LANCE DAMAGE'),'magical');}
   // Keep the previously accepted AA image snapshot,random draw and bounce
   // geometry. The contact wrapper changes only pre-spell-effect ordering.
   const angle=c.random()*Math.PI*2,separation=BATTLE_CONFIG.bodyRadius*2+.07;
   const images=c.summon({name:'灵魂幻象',count:1,hp:c.caster.maxHp,currentHp:c.caster.hp,mana:c.caster.mana,maxMana:c.caster.maxMana,attack:c.caster.attack*v(c,'ILLUSION DAMAGE')/100,attributeAttackScale:v(c,'ILLUSION DAMAGE')/100,armor:c.caster.armor,range:c.caster.range,interval:c.caster.attackInterval,speed:c.caster.moveSpeed,lifetime:v(c,'ILLUSION DURATION'),illusion:true,damageTaken:v(c,'ILLUSION DAMAGE TAKEN')/100,inheritsSkills:true,initializeInherited:true,inheritedMode:'passives',position:{x:t.x+Math.cos(angle)*separation,y:t.y+Math.sin(angle)*separation}});
   for(const image of images){c.orderAttack?.(image,t);image.attackMin=Number(c.caster.attackMin??c.caster.attack)*v(c,'ILLUSION DAMAGE')/100;image.attackMax=Number(c.caster.attackMax??c.caster.attack)*v(c,'ILLUSION DAMAGE')/100;}
   if(left>1){const next=c.enemies().filter(other=>!seen.has(other.id)&&enemy(c,other)&&!other.hiddenSpellBody&&visible(c,other)&&!has(c,other,'invulnerable')&&!has(c,other,'banished')&&dist(other,t)<=v(c,'BOUNCE DISTANCE',750)/100+1e-8).sort((a,b)=>Number(!hero(a)&&!a.consideredHero)-Number(!hero(b)&&!b.consideredHero)||dist(a,t)-dist(b,t)||a.id.localeCompare(b.id))[0];if(next)launch(next,left-1,{x:t.x,y:t.y});}
  },origin,undefined,{onDisjoint:()=>{},onTargetLost:()=>{}});
 };
 launch(c.target,v(c,'TOTAL TARGETS',c.skill.points>=6?2:1));
}

/** Final C16 overrides are registered after the previously accepted skills. */
export function applyImpactRestorationAcceptance(registry:Record<string,SkillProgram>):void{
 const lum=registry[LUM];lum.attackModifier=undefined;lum.handlesBreak=true;
 lum.criticalAttack=c=>!enemy(c,c.target)?undefined:lumSnapshot(c).ready?{chance:1,multiplier:(v(c,'CRITICAL STRIKE DAMAGE')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?40:0))/100}:undefined;
 lum.beforeAttackDamage=c=>{if(!enemy(c,c.target))return;const snapshot=lumSnapshot(c),batch=c.caster[key(c,'batch')]as LumBatch|undefined;if(c.attackBatchKey&&batch?.key===c.attackBatchKey){if(batch.processed)return;batch.processed=true;}if(snapshot.ready)write(c,'hits',0);else if(!has(c,c.caster,'break'))write(c,'hits',read(c,'hits')+1);};
 lum.onBeforeAttackHealthCommit=lumHeal;
 lum.onAttack=c=>{if(!enemy(c,c.target)||c.skill.points<9||has(c,c.caster,'break')||read(c,'doubleAttack')>c.battle.time)return;write(c,'doubleAttack',c.battle.time+v(c,'GABEN ATTACK INTERVAL',5));c.delay(v(c,'GABEN ATTACK DELAY',.1),()=>{if(!c.caster.dead&&!c.target.dead)c.attack(c.target,1,true);});};
 lum.onDeath=c=>{if(read(c,'hits')>=v(c,'ATTACKS TO CHARGE',c.skill.points>=6?2:3))write(c,'hits',0);};
 lum.implemented=['Genuine single resolved physical packet restores caster then nearby heroes before HP commitment,including lethal overkill','Existing successful-contact/batch/Break/AAcounter and independently timed Gaben attack retained','Native lifesteal amplification belongs to this provider and per-recipient suppression remains separate'];
 lum.remaining=['Exact barrier/FalsePromise/BorrowedTime/rum/nonlethal and mixed damage-type basis retain explicit working outcomes rather than whole native closure','Strongercritical competition,ready ranged missile allocation and partial-charge death lifetime remain separately source-qualified'];
 const spiritLance=registry[LANCE];spiritLance.onCastStart=lanceStart;spiritLance.cast=lance;
 spiritLance.implemented=[...(spiritLance.implemented??[]),'Actual existing owned illusions within675play a cosmetic cast lease;only real release emits harmless fake lances','StaticField dispatch precedes the actual primary contact slow and damage without duplicate events'];
 spiritLance.remaining=['Illusion membership is frozen at accepted cast start;enter/leave-radius and exact cosmeticidleturn timing remain source-qualified','Fake-projectile moving-target/death/source-expiration chronology is a bounded presentation policy;no real damage/proc is synthesized'];
 const trample=registry[TRAMPLE];trample.ordinaryMoveGoal=c=>{
  if(['duel','taunt','berserk','hypnotized','focusFire','attackTarget'].some(kind=>has(c,c.caster,kind)))return;
  const active=c.caster.statuses.some(s=>s.kind==='trampling'&&s.skill===TRAMPLE&&s.source===c.caster.id&&s.until>c.battle.time&&((s as {data?:Record<string,unknown>}).data?.instanceKey===(c.skill.instanceId??c.attackInstanceKey??c.skill.id)));
  if(!active)return;const target=c.enemies().filter(t=>enemy(c,t)&&visible(c,t)).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster)||a.id.localeCompare(b.id))[0];
  return target?{targetId:target.id,arrivalRange:0}:undefined;
 };
 trample.implemented=[...(trample.implemented??[]),'Explicit arena pursuit policy uses the ordinary movement budget after legal casts/pending/channels,not another forced step'];
 trample.remaining=[...(trample.remaining??[]).filter(x=>!x.includes('current ordinary AIcanstopinsideattackrange')),'Native automatedpursuit/orbit is not established by the AA row or retained7.35notes;center pursuit is a declared arena input policy and may stop at body contact'];
}
