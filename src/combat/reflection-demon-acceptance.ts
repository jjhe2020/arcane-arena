import {skillBalance} from '../config';
import type {CombatUnit} from '../model';
import {arrayValue,skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {charged} from './charges';

const STEP=1/30,FOREVER=1_000_000;
const DISPERSION='custom_spectre_dispersion',DISPOSE='marci_grapple',DISRUPTION='custom_shadow_demon_disruption',DISSIMILATE='custom_void_spirit_dissimilate',DOOM='custom_doom_bringer_doom',CATCHER='shadow_demon_soul_catcher';
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const has=(u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind);
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const owner=(c:C)=>c.attackInstanceKey??c.skill.instanceId??c.skill.id;
const sequence=new WeakMap<C['battle'],number>();
const castToken=(c:C)=>{const n=(sequence.get(c.battle)??0)+1;sequence.set(c.battle,n);return `${c.caster.id}:${owner(c)}:${n}`;};
const active=(s:EffectStatus,c:C)=>s.until>c.battle.time+1e-8;
const validBody=(t:CombatUnit)=>!t.dead&&!t.ward&&!t.building;
const ordinaryEnemy=(c:C,t:CombatUnit)=>validBody(t)&&t.side!==c.caster.side&&!has(t,'banished')&&!has(t,'invulnerable');
const visible=(t:CombatUnit)=>!has(t,'shadowRealm')&&!has(t,'undetectable')&&(!has(t,'invisible')||has(t,'revealed'));
const sameInstance=(c:C,s:EffectStatus,token:string)=>s.source===c.caster.id&&s.skill===c.skill.id&&s.data?.castToken===token;
const compiled=(c:C)=>!!skillBalance(c.definition,c.skill.points);

/** AA clauses take precedence over the dated native prototypes. Unproven AA
 * counters, upgrade ordering and historical endpoint rules stay in the ledger. */
export function applyReflectionDemonAcceptance(registry:Record<string,SkillProgram>):void{
 const dispose=registry[DISPOSE];
 dispose.target='any';
 dispose.targetEligibility=(c,t)=>validBody(t)&&t.id!==c.caster.id&&!has(t,'banished')&&!has(t,'invulnerable')&&(t.side===c.caster.side||visible(t)&&!has(t,'magicImmune'));
 dispose.targetSelector=(c,targets)=>{
  const enemy=targets.filter(t=>t.side!==c.caster.side).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0];
  // Friendly rescue selection is an arena AI policy; it does not change the
  // legal ally target set, including spell-immune allies.
  return targets.filter(t=>t.side===c.caster.side&&t.hp<t.maxHp*.25).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id.localeCompare(b.id))[0]??enemy;
 };
 dispose.requiresFacing=c=>{const a=Math.atan2(c.target.y-c.caster.y,c.target.x-c.caster.x)-c.caster.facing;return Math.abs(Math.atan2(Math.sin(a),Math.cos(a)))>v(c,'FACING ANGLE',115)*Math.PI/180;};
 dispose.cast=c=>{
  const victim=c.target,seconds=v(c,'THROW DURATION',.5),token=castToken(c),gap=distance(victim,c.caster),dx=(victim.x-c.caster.x)/(gap||1),dy=(victim.y-c.caster.y)/(gap||1),reach=v(c,'THROW DISTANCE')/100;
  let landed=false;
  const land=()=>{
   if(landed)return;landed=true;
   victim.statuses=statuses(victim).filter(s=>!sameInstance(c,s,token));
   if(c.skill.points>=9&&!victim.dead)c.status(victim,'targetAttackSpeed',v(c,'GABEN DURATION',8),v(c,'GABEN ATTACK SPEED',120),{harmful:victim.side!==c.caster.side,dispel:'basic',piercesImmunity:victim.side===c.caster.side});
   for(const t of c.enemies().filter(t=>ordinaryEnemy(c,t)&&distance(t,victim)<=v(c,'LANDING RADIUS',275)/100)){
    c.status(t,'slow',v(c,'SLOW DURATION'),v(c,'MOVEMENT SLOW')/100,{harmful:true});
    c.damage(t,v(c,'IMPACT DAMAGE'),'magical',false);
   }
  };
  const blocked=statuses(victim).some(s=>active(s,c)&&String(s.data?.blockedMotionSkills??'').split(',').includes(DISPOSE));
  if(blocked){land();return;}
  c.cancelMotion?.(victim);
  // Dispose overrides an incumbent controller; subsequent ordinary forced
  // movement may replace this air controller and cause premature landing.
  const end=c.battle.time+seconds;
  const moved=c.moveContinuous(victim,c.caster.x-dx*reach,c.caster.y-dy*reach,{duration:seconds,priority:-1,onEnd:reason=>{
   if(reason==='interrupted')land();else c.delay(Math.max(0,end-c.battle.time),land);
  }});
  if(!moved){land();return;}
  const motion=c.motionActive?.(victim);
  c.status(victim,'selfStun',seconds,0,{harmful:false,dispel:'none',ignoreStatusResistance:true,data:{castToken:token}});
  const check=()=>{
   if(landed)return;
   const now=c.motionActive?.(victim),replaced=!!motion&&!!now&&(now.owner!==motion.owner||now.startedAt!==motion.startedAt);
   if(c.caster.dead||victim.dead||replaced||c.battle.time>=end-1e-8){
    if(now&&motion&&now.owner===motion.owner&&now.startedAt===motion.startedAt)c.cancelMotion?.(victim);
    land();return;
   }
   c.delay(STEP,check);
  };
  c.delay(STEP,check);
 };
 dispose.implemented=['AA allied/enemy throw;magic-immune ally eligibility and enemy Spell Block','Historical.5second disabled continuous throw;115degree facing cone','Exactly-once landing area slow then damage;controller rejection/replacement and either death land early','AA Super final range and Gaben target-specific120attack speed for8seconds'];
 dispose.remaining=['Friendly rescue threshold25percent is a disclosed arena AI policy','Historical off-axis landing endpoint and flat-arena wall exceptions need precise geometry evidence'];

 const disruption=registry[DISRUPTION],returns=new WeakMap<C['battle'],Map<string,()=>void>>();
 const disruptionEligible=(c:C,t:CombatUnit)=>validBody(t)&&(!t.summoned||!!t.illusion||!!t.heroClone)&&(!t.consideredHero||!!t.heroClone)&&!has(t,'banished')&&!has(t,'invulnerable')&&!has(t,'magicImmune')&&(t.side===c.caster.side||visible(t));
 disruption.target='any';disruption.targetEligibility=disruptionEligible;
 disruption.targetSelector=(c,targets)=>{
  const allies=c.allies().filter(t=>disruptionEligible(c,t)&&t.hp<t.maxHp*.25&&distance(t,c.caster)<=(skillBalance(c.definition,c.skill.points)?.range??6.5)+.4).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id.localeCompare(b.id));
  return allies[0]??targets.filter(t=>t.side!==c.caster.side).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0];
 };
 // Replace the old charged wrapper together with its captured cast. The
 // ordinary recharge is the AA cooldown array, not Gaben's public zero CD.
 disruption.canCast=undefined;disruption.cooldown=c=>arrayValue(c.definition.cooldowns,c.skill.points,20);
 disruption.cast=c=>{
  const target=c.target;if(!disruptionEligible(c,target))return;
  if(c.skill.points>=6&&target.side!==c.caster.side)c.castAbility(CATCHER,v(c,'SOUL CATCHER LEVEL',4),target);
  const health=target.hp,token=castToken(c),time=v(c,'BANISH DURATION');
  c.status(target,'banished',time,0,{harmful:target.side!==c.caster.side,dispel:'strong',data:{castToken:token,instanceKey:owner(c)}});
  const mark=statuses(target).find(s=>sameInstance(c,s,token)&&s.kind==='banished');if(!mark)return;
  let map=returns.get(c.battle);if(!map){map=new Map();returns.set(c.battle,map);}
  const spawn=()=>{
   if(!map!.delete(token)||target.dead)return;
   const original=c.battle.units.find(t=>t.id===String(target.disruptionOriginalHeroId??''))??target;
   const images=c.summon({name:'禁锢幻象',count:v(c,'ILLUSION COUNT',2),hp:original.maxHp,attack:original.attack*v(c,'ILLUSION DAMAGE')/100,armor:original.armor,range:original.range,interval:original.attackInterval,speed:original.moveSpeed,lifetime:v(c,'ILLUSION DURATION'),illusion:true,damageTaken:v(c,'ILLUSION DAMAGE TAKEN')/100,template:original,inheritsSkills:true,initializeInherited:true,inheritedMode:'passives'});
   for(const [index,image]of images.entries()){
    image.hp=Math.min(image.maxHp,health);image.mana=original.mana;image.maxMana=original.maxMana;image.disruptionOriginalHeroId=original.id;image.facing=target.facing;
    c.warp(image,target.x+(index%2===0?1:-1),target.y);
   }
  };
  map.set(token,spawn);
  const watch=()=>{if(target.dead){map!.delete(token);return;}if(!statuses(target).some(s=>sameInstance(c,s,token)&&active(s,c))){spawn();return;}c.delay(STEP,watch);};
  c.delay(STEP,watch);
 };
 disruption.onStatusRemoved=(c,status)=>{if(status.kind==='banished'&&typeof status.data?.castToken==='string')returns.get(c.battle)?.get(status.data.castToken)?.();};
 disruption.onAffectedUnitDeath=(c,status)=>{if(status.kind==='banished'&&typeof status.data?.castToken==='string')returns.get(c.battle)?.delete(status.data.castToken);};
 charged(disruption,c=>c.skill.points>=9,c=>v(c,'CHARGES',2),c=>v(c,'CHARGE RESTORE TIME',arrayValue(c.definition.cooldowns,c.skill.points,20)));
 disruption.superImplemented=disruption.gabenImplemented=true;
 disruption.implemented=['AA2.75second banishment accepts self/allies/hero illusions but excludes spell-immune allies and creep heroes','Current health captured at cast;other body stats and mana captured at illusion creation','AA strong-dispel early return creates two images once;victim death cancels,caster death retains release','AA final outgoing/incoming/lifetime and sequential two-charge recharge','Super free historical level-four Soul Catcher before banishment'];
 disruption.remaining=['Soul Catcher level4 and before-banish ordering remain explicit AA working candidates','Image spawn offsets100are arena layout candidates;exact native collision-dependent cardinal layout is not claimed','Targeting other illusion families without an original-body link retains that existing illusion template'];

 const catcher=registry[CATCHER];
 catcher.cast=c=>{
  const countTargets=c.battle.units.filter(t=>validBody(t)&&t.side!==c.caster.side&&!t.ancient&&!has(t,'magicImmune')&&(!has(t,'invulnerable')&&!has(t,'banished')||statuses(t).some(s=>s.kind==='banished'&&s.skill===DISRUPTION))&&distance(t,c.target)<=v(c,'radius',250)/100);
  const heroCount=countTargets.filter(t=>!t.illusion&&(t.heroClone||!t.summoned&&!t.consideredHero)).length;
  if(heroCount)c.status(c.caster,'spellAmp',v(c,'duration',10),heroCount*v(c,'bonus_spell_amp',11)/100,{dispel:'basic',data:{instanceKey:owner(c)}});
  for(const target of countTargets){
   const before=target.hp;target.hp=Math.max(1,before*(1-v(c,'health_lost',35)/100));const removed=before-target.hp,token=castToken(c);
   c.status(target,'soulCatcher',v(c,'duration',10),removed,{harmful:true,dispel:'basic',data:{castToken:token,instanceKey:token}});
   let returned=false;const restore=()=>{if(returned)return;returned=true;if(!target.dead)c.heal(target,removed*v(c,'HEALTH RETURN',50)/100);};
   const watch=()=>{if(target.dead)return;if(!statuses(target).some(s=>sameInstance(c,s,token)&&active(s,c))){restore();return;}c.delay(STEP,watch);};c.delay(STEP,watch);
  }
 };
 catcher.implemented=['Historical7.20-7.31d area direct current-health setting,including Disruption victims','This cast hero count replaces spell-amplification stacks;clones included,illusions/creep heroes excluded','Independent marks return half of each initial actual health loss when removed'];
 catcher.remaining=['AA child level/order are candidates;ordinary healing versus fixed-health restoration manipulation remains unverified','Most-recent Disruption exception across multiple casters needs separate historical combination proof'];

 const dissimilate=registry[DISSIMILATE];
 dissimilate.requiresFacing=false;
 dissimilate.cast=c=>{
  const start={x:c.caster.x,y:c.caster.y},facing=c.caster.facing,portals=[start],count=Math.max(1,Math.floor(v(c,'INNER PORTALS',6))),angle=v(c,'PORTAL ANGLE',60)*Math.PI/180;
  for(let i=0;i<count;i++)portals.push({x:start.x+Math.cos(facing+i*angle)*v(c,'INNER RADIUS',520)/100,y:start.y+Math.sin(facing+i*angle)*v(c,'INNER RADIUS',520)/100});
  if(c.skill.points>=6)for(let i=0;i<Math.floor(v(c,'OUTER PORTALS',6));i++)portals.push({x:start.x+Math.cos(facing+i*angle)*v(c,'OUTER RADIUS',1040)/100,y:start.y+Math.sin(facing+i*angle)*v(c,'OUTER RADIUS',1040)/100});
  const valid=portals.filter(p=>Math.abs(p.x)<=14.17&&Math.abs(p.y)<=12.516),radius=v(c,'DAMAGE RADIUS',275)/100;
  const victims=(p:{x:number;y:number})=>c.enemies().filter(t=>ordinaryEnemy(c,t)&&distance(t,p)<=radius).length;
  const destination=valid.slice().sort((a,b)=>victims(b)-victims(a)||distance(a,c.target)-distance(b,c.target))[0]??start,token=castToken(c),seconds=v(c,'PHASE DURATION');
  c.status(c.caster,'banished',seconds+STEP,0,{dispel:'none',data:{castToken:token,keepUnitCollision:true}});
  c.status(c.caster,'visualForm',seconds+STEP,0,{dispel:'none',data:{castToken:token,form:'dissimilate',hidden:true,portals:JSON.stringify(valid)}});
  c.delay(seconds,()=>{
   if(c.caster.dead)return;
   c.caster.statuses=statuses(c.caster).filter(s=>!sameInstance(c,s,token));
   c.warp(c.caster,destination.x,destination.y);
   for(const target of c.enemies().filter(t=>ordinaryEnemy(c,t)&&distance(t,c.caster)<=radius)){
    c.damage(target,v(c,'DAMAGE')+(!compiled(c)&&c.skill.points>=6?175:0),'magical',false);
    if(c.skill.points>=9)c.status(target,'stun',v(c,'GABEN STUN',2.5),0,{harmful:true,dispel:'strong'});
   }
  });
 };
 dissimilate.implemented=['AA1.3second hidden invulnerable action lock;body remains collidable','Historical facing-oriented center+six inner portals;Super six aligned outer portals at1040','Exit-only explicit warp without projectile disjoint;275radius magical damage then AA2.5second Gaben stun','AA final Super515damage consumed once'];
 dissimilate.remaining=['Exit maximizes nearby victims at release;tie-break against the AI target and arena clipping are declared policies','Entry disjoint and interactions with other forced movement during hidden phase lack historical proof'];

 const doom=registry[DOOM];
 doom.unitTarget=c=>c.skill.points<9;
 doom.targetSelector=(c,targets)=>c.skill.points>=9?c.caster:targets.filter(t=>ordinaryEnemy(c,t)&&visible(t)&&!t.ancient).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0];
 doom.targetEligibility=(c,t)=>c.skill.points>=9?t.id===c.caster.id:ordinaryEnemy(c,t)&&visible(t)&&!t.ancient;
 doom.requiresFacing=c=>c.skill.points<9;doom.spellBlockTiming='program';
 doom.cast=c=>{
  if(c.skill.points<9&&c.trySpellBlock?.(c.target))return;
  const seconds=v(c,'DURATION'),damage=v(c,'DAMAGE PER SECOND')+(!compiled(c)&&c.skill.points>=6?30:0),interval=v(c,'DAMAGE INTERVAL',1),token=castToken(c),end=c.battle.time+seconds;
  const apply=(t:CombatUnit,remaining:number,aura=false)=>{
   const options:Partial<EffectStatus>={harmful:true,dispel:'strong',piercesImmunity:true,ignoreStatusResistance:aura,data:{castToken:token,instanceKey:owner(c)}};
   for(const kind of ['doom','silence','mute',...(c.skill.points>=6?['break']:[])])c.status(t,kind,remaining,0,options);
  };
  const clear=(t:CombatUnit)=>{t.statuses=statuses(t).filter(s=>!sameInstance(c,s,token));};
  if(c.skill.points<9){
   const t=c.target;c.dispel(t,false,false);apply(t,seconds);
   const mark=statuses(t).find(s=>sameInstance(c,s,token)&&s.kind==='doom');if(!mark)return;
   // This shortened AA instance keeps one-second ticks strictly before the
   // actual debuff expiry. The historical exact endpoint stays a ledger gap.
   const tick=()=>{if(t.dead||!statuses(t).some(s=>s.kind==='doom'&&sameInstance(c,s,token)&&active(s,c)))return;c.damage(t,damage,'pure',true,{flags:{damageOverTime:true}});if(c.battle.time+interval<mark.until-1e-8)c.delay(interval,tick);};
   tick();return;
  }
  let next=c.battle.time;const affected=new Set<CombatUnit>(),purged=new Set<string>();
  const pulse=()=>{
   if(c.caster.dead||c.battle.time>=end-1e-8){for(const t of affected)clear(t);return;}
   const current=c.enemies().filter(t=>ordinaryEnemy(c,t)&&distance(t,c.caster)<=v(c,'GABEN RADIUS',325)/100),members=new Set(current),damaging=c.battle.time>=next-1e-8;
   for(const t of affected)if(!members.has(t)){clear(t);affected.delete(t);}
   for(const t of current){
    if(!purged.has(t.id)){purged.add(t.id);c.dispel(t,false,false);}
    if(damaging)c.damage(t,damage,'pure',true,{flags:{damageOverTime:true}});
    if(!t.dead){apply(t,Math.min(end-c.battle.time,STEP*2),true);affected.add(t);}
   }
   if(damaging)next+=interval;c.delay(STEP,pulse);
  };
  pulse();
 };
 doom.onStatusRemoved=(c,status)=>{if(status.kind==='doom'&&status.data?.castToken)c.target.statuses=statuses(c.target).filter(s=>!sameInstance(c,s,String(status.data!.castToken)));};
 doom.implemented=['AA pure damage,silence,mute,offensive Basic Dispel and Strong-Dispel removal','Initial immediate damage followed by one-second intervals;released base curse survives source death','Super final90DPS and Break;Gaben true self order,zero point,moving325aura without self-disable','Aura recipients share its damage clock;leaving removes this source only and re-entry does not repeat Basic Dispel','Pre7.34 prototype permits healing;modern healing prevention is not imported'];
 doom.remaining=['Shortened AA final damage endpoint is the explicit strictly-before-expiry working candidate','Zero aura linger uses the retained native prototype;its exact pre2023 historical introduction needs proof','No equipment action system exists,so mute is a semantic state without claimed item-active coverage','Independent multiple-caster Doom damage stacking needs historical combination proof'];

 const dispersion=registry[DISPERSION];
 dispersion.init=c=>{if(!c.caster.illusion)c.status(c.caster,'damageReduction',FOREVER,(v(c,'DAMAGE REFLECTED')+(!compiled(c)&&c.skill.points>=6?5:0))/100,{passive:true,dispel:'none',data:{genericIncoming:true,instanceKey:owner(c)}});};
 dispersion.onDamage=undefined;
 dispersion.onBeforeDamageResolution=c=>{
  const event=c.beforeDamageResolution;
  if(c.caster.illusion||!event||event.flags.healthLoss||event.flags.healthRemoval||event.flags.reflection||event.flags.noReflection||event.flags.noDamageHooks)return;
  const min=v(c,'MIN RADIUS')/100,max=v(c,'MAX RADIUS')/100,rate=(v(c,'DAMAGE REFLECTED')+(!compiled(c)&&c.skill.points>=6?5:0))/100;
  // The after-outgoing, before-target basis is explicit. Whether the unknown
  // AA/native revision instead uses raw pre-output input remains source_pending.
  for(const target of c.enemies().filter(t=>ordinaryEnemy(c,t)&&distance(t,c.caster)<=max)){
   const weight=Math.max(0,1-Math.max(0,distance(target,c.caster)-min)/Math.max(.000001,max-min));
   c.damage(target,event.damageAmount*rate*weight,c.damageType,true,{flags:{healthLoss:true,reflection:true,noDamageHooks:true,noSpellLifesteal:true,noReflection:true,noAmplification:true,bypassGenericMultipliers:true}});
  }
 };
 dispersion.onIncomingDamageEvent=c=>{
  if(c.caster.illusion||c.skill.points<6||!c.incomingDamageEvent)return;
  const key=`dispersion:${owner(c)}`,state=(c.caster[key]??={received:0,ready:0}) as {received:number;ready:number};
  state.received+=Math.max(0,c.incomingDamageEvent.actualDamage);
  const threshold=v(c,'DAGGER DAMAGE THRESHOLD',300);
  if(state.received<threshold||state.ready>c.battle.time+1e-8)return;
  const targets=c.enemies().filter(t=>ordinaryEnemy(c,t)).sort((a,b)=>a.id.localeCompare(b.id));if(!targets.length)return;
  state.received-=threshold;state.ready=c.battle.time+v(c,'DAGGER COOLDOWN',c.skill.points>=9?1:7);
  c.castAbility('spectre_spectral_dagger',v(c,'DAGGER LEVEL',4),targets[Math.floor(c.random()*targets.length)]);
 };
 dispersion.implemented=['AA distance-weighted reflection and matching reduction consume the same final table percentage','Pre-lethal synchronous reflection includes overkill and damage fully absorbed later by the primary victim','Same-type typed HPLOSS reflection suppresses damage hooks,amplification,recursive reflection and lifesteal','Generic-incoming group stacks additively;illusion copies do not initialize or trigger Dispersion','AA seeded-random enemy Dagger after300actual damage uses final7/1cooldown and historical child level4'];
 dispersion.remaining=['Source outgoing modifiers versus raw input reflection basis remains an explicit after-outgoing working candidate','Pre2023 HPLOSS exceptions for each negation,barrier,False Promise and active Borrowed Time require individual source proof','AA Dagger progress during cooldown,threshold overflow and exact child level are not resolved by the catalog','Generic-incoming providers not yet classified by their individual acceptance module keep the existing independent working behavior'];
}
