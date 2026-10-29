import {skillBalance,UNIT_CONFIG} from '../config';
import type {CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';

const STEP=1/30,PULSE='custom_necrolyte_death_pulse',WARD='custom_witch_doctor_death_ward',SWITCH='aa_granted_voodoo_switcheroo',DECAY='custom_undying_decay',CLEANSE='custom_shadow_demon_demonic_cleanse',PURGE='custom_shadow_demon_demonic_purge';
const S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9;
const configured=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const has=(u:CombatUnit,kind:string,time:number)=>u.statuses.some(s=>s.kind===kind&&s.until>time);
const hero=(u:CombatUnit)=>!u.summoned||!!u.illusion||!!u.heroClone;
interface DemonicRun {token:number;kind:'cleanse'|'purge';source:string;start:number;until:number;done:boolean;finish:(expired?:boolean)=>void}

/** Historical2023 mechanisms plus explicit AA overrides. Unrecovered AA
 * targeting and inherited-child boundaries remain in the acceptance ledger. */
export function applyDeathDemonicAcceptance(registry:Record<string,SkillProgram>):void {
 const pulse=registry[PULSE];
 pulse.target='self';pulse.pointTarget=false;pulse.backswing=.77;pulse.projectileDisjointable=false;
 pulse.canCast=c=>c.enemies().some(t=>distance(t,c.caster)<=v(c,'RADIUS')/100)||c.allies().some(t=>t.hp<t.maxHp*.7&&distance(t,c.caster)<=v(c,'RADIUS')/100);
 pulse.cast=c=>{
  const radius=v(c,'RADIUS')/100,speed=v(c,'PROJECTILE SPEED',400)/100;
  const eligible=(t:CombatUnit,side:number)=>!t.dead&&t.side===side&&!t.ward&&!t.building&&!has(t,'invulnerable',c.battle.time)&&!has(t,'banished',c.battle.time)&&(side===c.caster.side||!has(t,'magicImmune',c.battle.time));
  for(const target of c.battle.units.filter(t=>eligible(t,t.side)&&distance(t,c.caster)<=radius)){
   const allied=target.side===c.caster.side,amount=allied?v(c,'HEAL')+(!configured(c)&&S(c)?35:0):v(c,'DAMAGE');
   c.projectile(target,speed,unit=>{
    if(allied)c.heal(unit,amount);else c.damage(unit,amount,'magical',false);
    if(!G(c))return;
    // AA does not publish the bounce team/radius rule; retain the explicit
    // same-team/AA-radius working policy rather than inventing a new branch.
    const choices=c.battle.units.filter(t=>t.id!==unit.id&&eligible(t,unit.side)&&distance(t,unit)<=radius),next=choices[Math.floor(c.random()*choices.length)];
    if(next)c.projectile(next,speed,last=>{if(allied)c.heal(last,amount);else c.damage(last,amount,'magical',false);},unit);
   });
  }
 };
 pulse.implemented=['Historical400-speed nondisjointable enemy/ally projectiles including invisible units','Allied spell immunity permits healing; enemy immunity/hidden/invulnerable bodies do not acquire pulses','AA final Super heal and cooldown are consumed once','Each Gaben initial pulse has at most one separate seeded-random bounce'];
 pulse.remaining=['AA Gaben next-target team and radius are unrecovered; same team as initial recipient and AA radius remain explicit working choices'];

 const ward=registry[WARD],switcheroo=registry[SWITCH];
 const isWard=(c:C)=>!!c.caster.deathDemonicWard;
 const wardTier=(c:C)=>Number(c.caster.deathWardTier??c.skill.points);
 const wardPrepare=(c:C)=>isWard(c)?{ignoreDamageBlock:true,accuracy:v(c,'ACCURACY',50)/100,trueStrike:wardTier(c)>=9}:undefined;
 const wardBounce=(c:C)=>{
  if(!isWard(c)||wardTier(c)<9)return;
  const visited=new Set([c.target.id]),amount=c.attackDamage??c.caster.attack,speed=v(c,'BOUNCE PROJECTILE SPEED',1000)/100,radius=v(c,'BOUNCE RADIUS',650)/100;
  const next=(previous:CombatUnit)=>{
   const target=c.battle.units.filter(t=>t.side!==c.caster.side&&hero(t)&&!visited.has(t.id)&&(c.canTarget?.(t)??!t.dead)&&distance(t,previous)<=radius).sort((a,b)=>distance(a,previous)-distance(b,previous)||a.id.localeCompare(b.id))[0];
   if(!target)return;
   c.projectile(target,speed,unit=>{visited.add(unit.id);c.damage(unit,amount,'physical',true,{category:'spell',flags:{noAmplification:true,noSpellLifesteal:true,ignoreDamageBlock:true}});next(unit);},previous);
  };next(c.target);
 };
 const spawnWard=(c:C,switched=false)=>{
  const duration=switched?v(c,'DURATION',3):v(c,'CHANNEL TIME',8),tier=switched?Number(c.caster.deathWardParentTier??3):c.skill.points;
  const damage=switched?Number(c.caster.deathWardParentDamage??0):v(c,'DAMAGE')+(!configured(c)&&S(c)?60:0),range=switched?Number(c.caster.deathWardParentRange??700):v(c,'ATTACK RANGE')+(!configured(c)&&S(c)?100:0);
  const template={...c.caster,deathDemonicWard:true,deathWardTier:tier,skills:[{...c.skill}]};
  const raw=UNIT_CONFIG.npc_dota_witch_doctor_death_ward;
  const body=c.summon({name:switched?'巫毒守卫':'死亡守卫',count:1,hp:raw.StatusHealth,attack:damage,armor:raw.ArmorPhysical,range:range/100,interval:raw.AttackRate,speed:raw.MovementSpeed/100,lifetime:duration+(switched?0:v(c,'INACTIVE WARD DURATION',5)),nativeTemplateId:'npc_dota_witch_doctor_death_ward',template,inheritsSkills:true,initializeInherited:true,inheritedMode:'attackEffects'})[0];
  body.deathDemonicWard=true;body.deathWardTier=tier;body.ward=true;body.attackTargetCategory='heroes';body.magicResist=raw.MagicalResistance/100;body.mana=body.maxMana=raw.StatusMana;body.nextAttack=c.battle.time;c.status(body,'regen',duration,raw.StatusHealthRegen,{dispel:'none'});
  const point=switched?c.caster:c.castPosition??c.target;c.warp(body,point.x,point.y);c.status(body,'invulnerable',duration+(switched?0:v(c,'INACTIVE WARD DURATION',5)),0,{dispel:'none'});
  if(!switched)c.zone({follow:true,radius:0,duration,interval:STEP,targets:'all',channel:true,effect:()=>{},onEnd:()=>{body.nextAttack=Infinity;c.status(body,'disarm',v(c,'INACTIVE WARD DURATION',5),0,{dispel:'none'});c.status(body,'phased',v(c,'INACTIVE WARD DURATION',5),0,{dispel:'none'});body.expiresAt=c.battle.time+v(c,'INACTIVE WARD DURATION',5);}});
  return body;
 };
 ward.target='enemy';ward.pointTarget=true;ward.channel=c=>v(c,'CHANNEL TIME',8);ward.backswing=0;
 ward.targetSelector=(c,targets)=>targets.filter(hero).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0];
 ward.canCast=c=>!isWard(c);ward.cast=c=>{spawnWard(c);};
 ward.init=c=>{if(isWard(c))return;if(S(c)){c.caster.deathWardParentTier=c.skill.points;c.caster.deathWardParentDamage=v(c,'DAMAGE')+(!configured(c)?60:0);c.caster.deathWardParentRange=v(c,'ATTACK RANGE')+(!configured(c)?100:0);c.grantAbility?.(SWITCH,1);}};
 ward.prepareAttack=wardPrepare;ward.onAttack=wardBounce;ward.projectileDisjointable=true;
 ward.implemented=['Point-targeted historical0.35-second release and8-second channel','Native ward attack profile, hero/clone/illusion targeting,50% accuracy and damage-block immunity','AA final Super range/damage and independently queued Voodoo Switcheroo','Gaben true strike and unique-nearest-hero1000-speed physical spell bounces, without spell amplification/lifesteal or attack procs'];
 ward.remaining=['Secondary-bounce disjoint continuation/retry needs the native projectile cancellation callback; current chain stops if that projectile is removed','Native ground vision and manual ward orders have no arena interface; point placement uses deterministic nearest eligible hero AI'];
 switcheroo.target='self';switcheroo.castPoint=.1;switcheroo.backswing=.73;switcheroo.channel=undefined;switcheroo.prepareAttack=wardPrepare;switcheroo.onAttack=wardBounce;switcheroo.projectileDisjointable=true;
 switcheroo.canCast=c=>!isWard(c)&&c.caster.hp<c.caster.maxHp*.5&&c.enemies().some(t=>hero(t)&&distance(t,c.caster)<=Number(c.caster.deathWardParentRange??700)/100);
 switcheroo.cast=c=>{const duration=v(c,'DURATION',3);c.disjoint(c.caster);c.status(c.caster,'banished',duration,0,{dispel:'none'});c.status(c.caster,'visualForm',duration,0,{dispel:'none',data:{form:'voodoo_switcheroo',hidden:true}});const body=spawnWard(c,true);c.status(body,'attackSpeed',duration,-v(c,'ATTACK SPEED REDUCTION',30),{dispel:'none'});};
 switcheroo.implemented=['Independent100ms/730ms self action,150mana/40s cooldown','Full3-second hidden invulnerable action lock and projectile disjoint','Native30flat attack-speed reduction and parent current AA damage/range/Gaben behavior'];
 switcheroo.remaining=['Automatic low-health activation is the project AI policy','Inherits the Death Ward secondary-disjoint continuation boundary'];

 const decay=registry[DECAY];decay.pointTarget=true;decay.backswing=0;
 decay.cast=c=>{
  const point=c.castPosition??{x:c.target.x,y:c.target.y},radius=v(c,'RADIUS')/100,steal=v(c,'STRENGTH STEAL')+(!configured(c)&&S(c)?6:0);
  let sequence=Number(c.caster.decaySequence??0);c.caster.decaySequence=++sequence;
  const pulse=()=>{
   const token=`${c.caster.id}:${sequence}:${c.battle.time}`,seconds=v(c,'STEAL DURATION'),targets=c.battle.units.filter(t=>t.side!==c.caster.side&&!t.dead&&!t.ward&&!t.building&&!has(t,'invulnerable',c.battle.time)&&!has(t,'banished',c.battle.time)&&!has(t,'magicImmune',c.battle.time)&&distance(t,point)<=radius);let count=0;
   for(const target of targets){if(hero(target)&&!target.illusion){count++;c.status(target,'strength',seconds,-steal,{harmful:true,dispel:'strong',maxStacks:Number.MAX_SAFE_INTEGER,removeOnDeath:true,data:{instanceKey:token,attributeHealthMode:'decay'}});}}
   if(count)c.status(c.caster,'strength',seconds,count*steal,{dispel:'none',maxStacks:Number.MAX_SAFE_INTEGER,removeOnDeath:true,data:{instanceKey:token,attributeHealthMode:'decay'}});
   for(const target of targets)c.damage(target,v(c,'BASE DAMAGE')*(hero(target)?1:v(c,'CREEP DAMAGE MULTIPLIER',2)),'magical',false);
  };pulse();if(G(c))for(let i=1;i<=v(c,'EXTRA PULSE COUNT',2);i++)c.delay(v(c,'EXTRA PULSE INTERVAL',3)*i,pulse);
 };
 decay.implemented=['Frozen ground point; strength changes precede magical damage; ordinary creeps take double damage','Independent unlimited45-second stacks, strength floor0 and full caster gain per eligible hero','AA Strong enemy dispel, death cleanup and no current-health restoration when a stack is removed','AA final10 strength at Super; Gaben two fixed-location pulses3seconds apart'];
 decay.remaining=['Strength-derived regeneration is not implemented by the current project attribute system','Clone-group deduplication and dynamic upgrade changes to existing stacks require separate identity/version verification'];

 const demonicRuns=new WeakMap<C['battle'],Map<string,DemonicRun>>(),demonicCounters=new WeakMap<C['battle'],number>();
 const runs=(c:C)=>{let result=demonicRuns.get(c.battle);if(!result){result=new Map();demonicRuns.set(c.battle,result);}return result;};
 const disruption=(c:C,target:CombatUnit)=>target.statuses.some(s=>s.kind==='banished'&&s.until>c.battle.time&&s.skill==='custom_shadow_demon_disruption');
 const eligibility=(kind:'cleanse'|'purge')=>(c:C,target:CombatUnit)=>{if(target.dead||target.ward||target.building||(kind==='cleanse')!==(target.side===c.caster.side))return false;if(has(target,'banished',c.battle.time))return disruption(c,target);if(kind==='cleanse')return true;return !has(target,'undetectable',c.battle.time)&&!has(target,'shadowRealm',c.battle.time)&&(!has(target,'invisible',c.battle.time)||has(target,'revealed',c.battle.time));};
 const effect=(c:C,kind:'cleanse'|'purge')=>{
  const target=c.target;if(!eligibility(kind)(c,target))return;
  c.dispel(target,false,kind==='cleanse');
  if(kind==='purge'&&has(target,'invulnerable',c.battle.time)&&!disruption(c,target))return;
  runs(c).get(target.id)?.finish();
  const token=(demonicCounters.get(c.battle)??0)+1;demonicCounters.set(c.battle,token);const seconds=v(c,'DURATION'),marker=kind==='cleanse'?'demonicCleanse':'demonicPurge',options:Partial<EffectStatus>={harmful:kind==='purge',dispel:'strong',affectsInvulnerable:true,piercesImmunity:true,removeOnDeath:true,data:{demonicToken:token}};
  c.status(target,marker,seconds,1,options);
  const until=target.statuses.find(s=>s.kind===marker&&s.skill===c.skill.id&&s.source===c.caster.id)?.until??c.battle.time;
  const run:DemonicRun={token,kind,source:c.caster.id,start:c.battle.time,until,done:false,finish:expired=>{
   if(run.done)return;run.done=true;if(runs(c).get(target.id)===run)runs(c).delete(target.id);
   target.statuses=target.statuses.filter(s=>(s as EffectStatus).data?.demonicToken!==token);
   const fraction=expired?1:Math.max(0,Math.min(1,(c.battle.time-run.start)/Math.max(STEP,run.until-run.start)));
   if(target.dead)return;
   if(kind==='cleanse')c.heal(target,v(c,'CLEANSE HEAL')*fraction);
   else c.damage(target,v(c,'PURGE DAMAGE')*fraction,'magical',true,{flags:{affectsBanished:disruption(c,target),affectsInvulnerable:disruption(c,target)}});
  }};runs(c).set(target.id,run);
  const tick=()=>{
   if(run.done)return;
   if(target.dead){run.finish();return;}
   if(c.battle.time>=run.until-1e-8){run.finish(true);return;}
   c.dispel(target,false,kind==='cleanse');
   if(kind==='purge'){
    const progress=Math.min(1,(c.battle.time-run.start)/Math.max(STEP,run.until-run.start)),slow=(v(c,'MAX SLOW',100)-(v(c,'MAX SLOW',100)-v(c,'MIN SLOW',20))*progress)/100;
    c.status(target,'slow',run.until-c.battle.time,slow,{...options,ignoreStatusResistance:true});c.status(target,'break',run.until-c.battle.time,0,{...options,ignoreStatusResistance:true});
   }
   c.delay(Math.min(Math.max(STEP,v(c,'DISPEL INTERVAL',STEP)),run.until-c.battle.time),tick);
  };tick();
 };
 const chargeKey=(c:C,key:string)=>`${c.skill.id}:demonic:${key}`;
 const queue=(c:C)=>c.caster[chargeKey(c,'queue')] as number[];
 const scheduleCharge=(c:C,maximum:number)=>{const generation=chargeKey(c,'generation'),version=Number(c.caster[generation]??0)+1;c.caster[generation]=version;const pending=queue(c);if(!pending?.length)return;c.delay(Math.max(0,pending[0]-c.battle.time),()=>{if(c.caster[generation]!==version)return;pending.shift();c.caster[chargeKey(c,'available')]=Math.min(maximum,Number(c.caster[chargeKey(c,'available')]??0)+1);scheduleCharge(c,maximum);});};
 const initializeCharges=(c:C,maximum:number)=>{c.caster[chargeKey(c,'available')]=maximum;c.caster[chargeKey(c,'queue')]=[];c.caster[chargeKey(c,'generation')]=0;};
 const consumeCharge=(c:C,maximum:number)=>{const key=chargeKey(c,'available'),count=Number(c.caster[key]??0);if(count<=0)return false;c.caster[key]=count-1;const reduction=Math.min(.9,Math.max(0,c.caster.statuses.filter(s=>s.kind==='cooldownReduction'&&s.until>c.battle.time).reduce((n,s)=>n+(s.value??0),0))),pending=queue(c);pending.push(Math.max(c.battle.time,pending.at(-1)??0)+v(c,'CHARGE RESTORE TIME',60)*(1-reduction));scheduleCharge(c,maximum);return true;};
 const reduceRecharge=(c:C,seconds:number,maximum:number)=>{const pending=queue(c);if(!pending?.length||seconds<=0)return;const reduction=Math.min(seconds,Math.max(0,pending[0]-c.battle.time));for(let i=0;i<pending.length;i++)pending[i]-=reduction;if(pending[0]<=c.battle.time+1e-8){pending.shift();c.caster[chargeKey(c,'available')]=Math.min(maximum,Number(c.caster[chargeKey(c,'available')]??0)+1);}scheduleCharge(c,maximum);};
 const remove=(c:C,status:EffectStatus,expired=false)=>{const run=runs(c).get(c.target.id);if(run&&run.token===status.data?.demonicToken&&(status.kind==='demonicCleanse'||status.kind==='demonicPurge'))run.finish(expired);};
 for(const [id,kind,childId]of[[CLEANSE,'cleanse','extra_granted_demonic_purge'],[PURGE,'purge','extra_granted_demonic_cleanse']]as const){const p=registry[id];p.target=kind==='cleanse'?'ally':'enemy';p.pointTarget=false;p.backswing=.6;p.targetEligibility=eligibility(kind);p.allowZeroCooldown=true;
  p.init=c=>{if(S(c))initializeCharges(c,v(c,'MAX CHARGES',3));if(G(c))c.grantAbility?.(childId,1);};
  p.canCast=c=>(!S(c)||Number(c.caster[chargeKey(c,'available')]??0)>0)&&(kind==='purge'||c.target.hp<c.target.maxHp||c.target.statuses.some(s=>(s as EffectStatus).harmful&&s.until>c.battle.time));
  p.reduceRecharge=(c,seconds)=>{if(S(c))reduceRecharge(c,seconds,v(c,'MAX CHARGES',3));};
  p.cooldown=c=>S(c)?0:(c.definition.cooldowns[Math.min(2,c.skill.points-1)]??60);
  p.cast=c=>{if(!S(c)||consumeCharge(c,v(c,'MAX CHARGES',3)))effect(c,kind);};
  p.onStatusRemoved=(c,status,reason)=>remove(c,status,reason==='expire');p.onAffectedUnitDeath=(c,status)=>remove(c,status);
  p.implemented=['Historical800range/300ms point/600ms backswing with AA mana and60-second base cooldown','Continuous basic dispel; cumulative modifier-bound settlement on expiry, strong dispel or replacement','Explicit Disruption exception, invulnerable ally support and exclusive Cleanse/Purge marker','Super3sequential charges with independent60-second CDR-aware restore; Gaben independent granted action'];
  p.remaining=kind==='purge'?[]:['Granted Purge effect rank3/one-charge200mana behavior remains an AA working choice; the catalog does not specify these values'];if(kind==='purge')p.implemented.push('AA base Break explicitly overrides native Scepter-only Break; Gaben Cleanse is the AA fixed700heal/7second definition with explicit3charges/50mana');
 }
 for(const [id,kind,effectId]of[['extra_granted_demonic_cleanse','cleanse',CLEANSE],['extra_granted_demonic_purge','purge',PURGE]]as const){const p=registry[id];p.target=kind==='cleanse'?'ally':'enemy';p.targetEligibility=eligibility(kind);p.backswing=.6;p.allowZeroCooldown=true;p.cooldown=()=>0;
  p.init=c=>initializeCharges(c,v(c,'MAX CHARGES',kind==='cleanse'?3:1));p.reduceRecharge=(c,seconds)=>reduceRecharge(c,seconds,v(c,'MAX CHARGES',kind==='cleanse'?3:1));
  p.canCast=c=>Number(c.caster[chargeKey(c,'available')]??0)>0&&(kind==='purge'||c.target.hp<c.target.maxHp||c.target.statuses.some(s=>(s as EffectStatus).harmful&&s.until>c.battle.time));
  p.cast=c=>{if(consumeCharge(c,v(c,'MAX CHARGES',kind==='cleanse'?3:1)))c.castAbility(effectId,v(c,'REFERENCE POINT TIER',3),c.target);};
  p.implemented=['Separate granted action/mana/charge clock; reference effect delegates to the real AA main program','Historical800range/300ms point/600ms backswing; sequential60-second CDR-aware restore'];p.remaining=['AA grant effect rank and granted-Purge resource/charge values are explicitly retained working candidates, not inferred as symmetric'];
 }
}
