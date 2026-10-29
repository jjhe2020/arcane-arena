import {skillBalance,UNIT_CONFIG} from '../config';
import type {AttackRecord,CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';

const FLAK='gyrocopter_flak_cannon',FLAME='custom_ember_spirit_flame_guard',GOLEM='undying_flesh_golem',HEAP='custom_pudge_flesh_heap',FOCUS='custom_windrunner_focusfire';
const STEP=1/30,FOREVER=1_000_000;
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const has=(u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind);
const distance=(a:CombatUnit,b:CombatUnit)=>Math.hypot(a.x-b.x,a.y-b.y);
const identity=(c:C)=>c.attackInstanceKey??c.skill.instanceId??c.skill.id;
const data=(c:C)=>({ownerInstance:identity(c),instanceKey:identity(c)});
const own=(c:C,t:CombatUnit,kind:string)=>statuses(t).find(s=>s.kind===kind&&s.source===c.caster.id&&s.skill===c.skill.id&&s.data?.ownerInstance===identity(c)&&s.until>c.battle.time+1e-8);
const body=(t:CombatUnit)=>!t.dead&&!has(t,'invulnerable')&&!has(t,'banished');
const visible=(t:CombatUnit)=>body(t)&&!has(t,'undetectable')&&!has(t,'shadowRealm')&&(!has(t,'invisible')||has(t,'revealed'));
const field=(c:C,key:string)=>`${c.skill.id}:${identity(c)}:${key}`;
const read=(c:C,key:string)=>Number(c.caster[field(c,key)]??0);
const write=(c:C,key:string,n:number)=>{c.caster[field(c,key)]=n;};
const buff=(c:C,kind:string,seconds:number,value:number,extra:Partial<EffectStatus>={})=>c.status(c.caster,kind,seconds,value,{dispel:'strong',removeOnDeath:true,data:data(c),...extra});
const record=(c:C,target:CombatUnit,origin:string,ranged:boolean):AttackRecord=>{
 const sequence=read(c,'attackSequence')+1;write(c,'attackSequence',sequence);
 const focus=statuses(c.caster).find(s=>s.kind==='focusFire'&&s.until>c.battle.time&&s.data?.targetId===target.id);
 return{id:`${c.caster.id}:${identity(c)}:${origin}:${sequence}`,source:c.caster.id,target:target.id,abilityId:c.skill.id,ranged,data:{focusMultiplier:Number(focus?.data?.damageMultiplier??1),[field(c,'origin')]:origin}};
};

/** Final AA-first programs. Historical provenance and explicitly unresolved
 * custom upgrade interpretations are recorded in acceptance/flak-flesh.json. */
export function applyFlakFleshAcceptance(registry:Record<string,SkillProgram>):void{
 const flak=registry[FLAK];
 flak.target='self';flak.requiresFacing=false;flak.castPoint=0;flak.backswing=0;flak.canCast=c=>!c.caster.illusion;
 flak.cast=c=>buff(c,'flakCannon',v(c,'DURATION',10),v(c,'MAX ATTACKS'));
 const fan=(c:C)=>{
  for(const t of c.battle.units.filter(t=>t.side!==c.caster.side&&t.id!==c.target.id&&visible(t)&&!t.ward&&!t.building&&distance(t,c.caster)<=v(c,'RADIUS')/100)){
   c.launchAttack?.(t,1,false,{modifierPolicy:'none',rangedAttackPoint:true,projectileSpeed:v(c,'PROJECTILE SPEED',800)/100,attackRecord:record(c,t,'flak',true)});
  }
 };
 flak.onAttack=undefined;
 flak.onAttackPoint=c=>{
  const key=field(c,'fired'),r=c.attackRecord;if(r?.data[key])return;if(r)r.data[key]=true;
  if(r?.data[field(c,'origin')]==='sideGunner'){if(c.skill.points>=9)fan(c);return;}
  const active=own(c,c.caster,'flakCannon');if(!active||!(active.value!>0))return;
  fan(c);active.value!--;if(active.value!<=0)c.caster.statuses=c.caster.statuses.filter(s=>s!==active);
 };
 flak.init=c=>{
  if(c.skill.points<6||c.caster.illusion)return;
  const gun=()=>{
   if(c.caster.dead)return;
   if(!['break','invisible','banished','undetectable'].some(k=>has(c.caster,k))){
    const target=c.battle.units.filter(t=>t.side!==c.caster.side&&visible(t)&&!t.ward&&!has(t,'attackImmune')&&!has(t,'physicalImmune')&&distance(t,c.caster)<=v(c,'SIDE GUNNER RANGE',700)/100).sort((a,b)=>distance(b,c.caster)-distance(a,c.caster)||a.id.localeCompare(b.id))[0];
    if(target)c.launchAttack?.(target,1,true,{modifierPolicy:'all',meleeRangeBuffer:v(c,'SIDE GUNNER MELEE BUFFER',350)/100,attackRecord:record(c,target,'sideGunner',c.isRangedAttack?.(c.caster)??c.caster.range>2)});
   }
   c.delay(v(c,'SIDE GUNNER INTERVAL',1.2),gun);
  };c.delay(v(c,'SIDE GUNNER INTERVAL',1.2),gun);
 };

 const flame=registry[FLAME];
 const radiance=(c:C)=>{
  if(c.skill.points<9||read(c,'radianceInstalled'))return;write(c,'radianceInstalled',1);
  const interval=v(c,'RADIANCE INTERVAL',1),radius=v(c,'RADIANCE RADIUS',700)/100,linger=v(c,'RADIANCE LINGER',.5),dps=v(c,c.caster.illusion?'RADIANCE ILLUSION DAMAGE':'RADIANCE DAMAGE',c.caster.illusion?70:120);
  c.zone({follow:true,radius,duration:FOREVER,interval:STEP,immediate:true,effect:t=>{
   if(!body(t)||has(t,'magicImmune')||t.ward||t.building)return;
   const previous=own(c,t,'radianceBurn'),generation=Number(previous?.data?.generation??(read(c,'radianceSequence')+1));
   if(!previous)write(c,'radianceSequence',generation);
   const markerData={...data(c),generation,illusion:!!c.caster.illusion,appliedAt:Number(previous?.data?.appliedAt??c.battle.time)};
   c.status(t,'radianceBurn',linger,dps,{harmful:true,dispel:'none',data:markerData});
   c.status(t,'blind',linger,v(c,'RADIANCE BLIND',15)/100,{harmful:true,dispel:'none',data:{...data(c),stacking:'strongest',uniqueGroup:'radianceBlind'}});
   if(previous)return;
   const pulse=()=>{
    const current=own(c,t,'radianceBurn');if(!current||current.data?.generation!==generation||!body(t))return;
    const winner=statuses(t).filter(s=>s.kind==='radianceBurn'&&s.until>c.battle.time+1e-8).sort((a,b)=>Number(!!a.data?.illusion)-Number(!!b.data?.illusion)||Number(a.data?.appliedAt)-Number(b.data?.appliedAt)||String(a.source).localeCompare(String(b.source)))[0];
    if(winner===current)c.damage(t,dps*interval,'magical',false,{flags:{itemEffect:true,damageOverTime:true}});
    c.delay(interval,pulse);
   };c.delay(interval,pulse);
  }});
 };
 flame.init=radiance;flame.onIllusionCreated=radiance;
 flame.target='self';flame.requiresFacing=false;flame.castPoint=0;flame.backswing=.6;flame.canCast=c=>!c.caster.illusion;
 flame.cast=c=>{
  const generation=read(c,'flameSequence')+1;write(c,'flameSequence',generation);
  const seconds=v(c,'DURATION'),interval=v(c,'DAMAGE INTERVAL',.2),capacity=v(c,'MAGIC ABSORB')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?280:0);
  buff(c,'magicShield',seconds,capacity,{dispel:'basic',remaining:capacity,data:{...data(c),generation,damageStage:'beforeMagicResistance',absorbPercentage:v(c,'ABSORB PERCENTAGE',100)/100}});
  c.zone({follow:true,radius:v(c,'RADIUS')/100,duration:seconds,interval,effect:t=>{
   const shield=own(c,c.caster,'magicShield');if(shield?.data?.generation===generation&&body(t))c.damage(t,v(c,'DAMAGE PER SECOND')*interval,'magical',false,{flags:{damageOverTime:true}});
  }});
 };

 const golem=registry[GOLEM];
 golem.target='self';golem.requiresFacing=false;golem.castPoint=0;golem.backswing=0;golem.init=undefined;golem.canCast=c=>!c.caster.extraFleshZombie&&!c.caster.illusion;
 golem.cast=c=>{
  const seconds=v(c,'DURATION');buff(c,'fleshGolem',seconds,1);
  buff(c,'attackTypeOverride',seconds,1);buff(c,'attackRangeOverride',seconds,v(c,'MELEE ATTACK RANGE',150)/100);buff(c,'moveFlat',seconds,v(c,'MOVEMENT BONUS')/100);
  buff(c,'strengthPct',seconds,(v(c,'STRENGTH MULTIPLIER')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?10:0))/100);
 };
 golem.beforeAttackDamage=c=>{
  if(c.caster.illusion||c.caster.extraFleshZombie||!own(c,c.caster,'fleshGolem')||!body(c.target)||c.target.ward||c.target.building||has(c.target,'magicImmune')||c.target.side===c.caster.side)return;
  const seconds=v(c,'SLOW DURATION'),amplification=(v(c,'DAMAGE AMPLIFICATION')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?10:0))/100;
  c.status(c.target,'slow',seconds,v(c,'SLOW')/100,{harmful:true,dispel:'strong',data:{...data(c),stacking:'strongest',uniqueGroup:'fleshGolemSlow'}});
  c.status(c.target,'damageReduction',seconds,-amplification,{harmful:true,dispel:'strong',data:{...data(c),genericIncoming:true,stacking:'strongest',uniqueGroup:'fleshGolemAmplification'}});
 };
 golem.onAttack=c=>{
  if(c.caster.extraFleshZombie){if(!has(c.caster,'break'))c.status(c.target,'slow',v(c,'DEATHLUST DURATION',2.5),v(c,'DEATHLUST SLOW',5)/100,{harmful:true,dispel:'basic',maxStacks:999,piercesImmunity:true,data:{...data(c),instanceKey:`${identity(c)}:${c.attackRecord?.id??c.battle.time}`}});return;}
  if(c.caster.illusion||c.target.ward||c.target.building||c.target.side===c.caster.side)return;
  if(c.skill.points>=9&&c.random()<v(c,'SOUL RIP ATTACK CHANCE',10)/100)c.castAbility('custom_undying_soul_rip',3,c.target);
  if(c.skill.points<6||!own(c,c.caster,'fleshGolem')||!body(c.target))return;
  const profile=UNIT_CONFIG.npc_dota_unit_undying_zombie;
  const zombies=c.summon({name:'僵尸',count:1,hp:profile?.StatusHealth??2,attack:((profile?.AttackDamageMin??33)+(profile?.AttackDamageMax??36))/2,armor:profile?.ArmorPhysical??0,range:(profile?.AttackRange??128)/100,interval:profile?.AttackRate??1.6,speed:(profile?.MovementSpeed??375)/100,lifetime:v(c,'ZOMBIE DURATION',15),...(profile?{nativeTemplateId:'npc_dota_unit_undying_zombie'}:{})});
  for(const z of zombies){
   z.extraFleshZombie=true;z.extraZombieTarget=c.target.id;z.skills=[{...c.skill}];z.cooldowns=[FOREVER];z.magicResist=(profile?.MagicalResistance??33)/100;z.attackMin=profile?.AttackDamageMin??33;z.attackMax=profile?.AttackDamageMax??36;
   c.warp(z,c.target.x+.3,c.target.y);
   c.status(z,'attackTarget',v(c,'ZOMBIE DURATION',15),1,{dispel:'none',removeOnDeath:true,data:{targetId:c.target.id}});
   c.status(z,'hitCountBody',v(c,'ZOMBIE DURATION',15),1,{dispel:'none',removeOnDeath:true,data:{heroDamage:2,basicDamage:1,immuneSpells:true}});
   const lust=()=>{if(z.dead||c.target.dead)return;const active=c.target.hp/c.target.maxHp<v(c,'DEATHLUST HEALTH THRESHOLD',40)/100;
    if(active){c.status(z,'attackSpeed',v(c,'DEATHLUST INTERVAL',.5)+STEP,v(c,'DEATHLUST ATTACK SPEED',80),{source:z.id,passive:true,dispel:'none',removeOnDeath:true});c.status(z,'haste',v(c,'DEATHLUST INTERVAL',.5)+STEP,v(c,'DEATHLUST MOVE SPEED',50)/100,{source:z.id,passive:true,dispel:'none',removeOnDeath:true});}
    else z.statuses=z.statuses.filter(s=>!(s.skill===GOLEM&&s.source===z.id&&['attackSpeed','haste'].includes(s.kind)));
    c.delay(v(c,'DEATHLUST INTERVAL',.5),lust);
   };c.delay(v(c,'DEATHLUST INTERVAL',.5),lust);
  }
 };
 golem.onAttacked=c=>{if(c.skill.points>=9&&!c.caster.illusion&&!c.caster.extraFleshZombie&&c.random()<v(c,'SOUL RIP DEFENCE CHANCE',10)/100)c.castAbility('custom_undying_soul_rip',3,c.caster);};
 golem.onUnitDeath=c=>{if(c.caster.extraFleshZombie&&c.caster.extraZombieTarget===c.target.id){c.caster.expiresAt=c.battle.time;c.caster.nextAttack=FOREVER;c.interrupt?.(c.caster);}};
 golem.onIllusionCreated=c=>{
  const form=statuses(c.target).find(s=>s.skill===GOLEM&&s.kind==='fleshGolem'&&s.until>c.battle.time);if(!form)return;
  const strength=statuses(c.target).find(s=>s.skill===GOLEM&&s.kind==='strengthPct'&&s.until>c.battle.time);
  if(strength&&c.inheritTemporaryAttributeMultiplier?.(c.caster,'strength',strength.value??0))buff(c,'strengthPct',strength.until-c.battle.time,strength.value??0);
  for(const kind of ['fleshGolem','attackTypeOverride','attackRangeOverride','moveFlat']){const original=statuses(c.target).find(s=>s.skill===GOLEM&&s.kind===kind&&s.until>c.battle.time);if(original)buff(c,kind,original.until-c.battle.time,original.value??0);}
 };

 const heap=registry[HEAP];heap.target='self';heap.requiresFacing=false;heap.castPoint=0;heap.backswing=0;heap.canCastWhileChanneling=true;heap.canCast=c=>!c.caster.illusion;
 heap.cast=c=>buff(c,'allDamageBlock',v(c,'DURATION'),v(c,'DAMAGE BLOCK'));
 const permanentKey=`${HEAP}:strength`;
 heap.init=c=>{if(!c.caster.illusion)c.status(c.caster,'strength',FOREVER,Number((c.caster.skillState as Record<string,number>|undefined)?.[permanentKey]??0),{skill:`${HEAP}:persistent`,dispel:'none',passive:false,data:data(c)});};
 heap.onUnitDeath=c=>{
  if(c.skill.points<6||c.caster.illusion||c.caster.dead||c.target.side===c.caster.side||c.target.summoned||statuses(c.target).some(s=>s.kind==='reincarnation'&&(s.value??0)>0)||distance(c.caster,c.target)>v(c,'RANGE')/100)return;
  const amount=v(c,'STRENGTH BONUS',c.skill.points>=9?4:2),state=(c.caster.skillState??={}) as Record<string,number>,gains=(c.caster.permanentSkillGains??={}) as Record<string,number>;
  state[permanentKey]=Number(state[permanentKey]??0)+amount;gains[permanentKey]=Number(gains[permanentKey]??0)+amount;
  c.status(c.caster,'strength',FOREVER,state[permanentKey],{skill:`${HEAP}:persistent`,dispel:'none',passive:false,data:data(c)});
 };
 heap.onIllusionCreated=()=>{};

 const focus=registry[FOCUS];focus.castPoint=0;focus.backswing=0;focus.requiresFacing=false;focus.dynamicRange=true;focus.ignoreCastRangeBonuses=true;
 focus.range=c=>c.attackRange?.(c.caster)??c.caster.range;focus.canCast=c=>!c.caster.illusion;
 focus.cast=c=>buff(c,'focusFire',v(c,'DURATION',20),v(c,'BONUS ATTACK SPEED'),{data:{...data(c),targetId:c.target.id,damageMultiplier:1-Math.abs(v(c,'DAMAGE REDUCTION'))/100}});
 focus.init=c=>{if(c.skill.points>=6&&!c.caster.illusion)c.status(c.caster,'attackBonus',FOREVER,v(c,'MAELSTROM ATTACK BONUS',24),{dispel:'none',data:data(c)});};
 const procKey=(c:C)=>field(c,'maelstromProc');
 focus.prepareAttack=c=>{
  if(c.skill.points<6||c.caster.illusion||!c.attackRecord||!body(c.target)||c.target.ward||c.target.building||has(c.target,'magicImmune'))return;
  const r=c.attackRecord,key=procKey(c);
  if(r.data[key]===undefined){const eligible=c.battle.time+1e-8>=read(c,'chainReady'),passed=eligible&&(c.chance?.(v(c,'MAELSTROM CHANCE',30)/100,'maelstrom')??c.random()<v(c,'MAELSTROM CHANCE',30)/100);r.data[key]=passed;if(passed)write(c,'chainReady',c.battle.time+v(c,'MAELSTROM COOLDOWN',.2));}
  return r.data[key]?{trueStrike:true}:undefined;
 };
 focus.onAttack=c=>{
  const key=procKey(c);if(!c.attackRecord?.data[key]||c.attackRecord.data[`${key}:used`])return;c.attackRecord.data[`${key}:used`]=true;
  const seen=new Set<string>(),damage=v(c,'MAELSTROM DAMAGE',140),radius=v(c,'MAELSTROM RADIUS',650)/100;
  const jump=(t:CombatUnit,left:number)=>{if(left<=0)return;seen.add(t.id);c.damage(t,damage,'magical',false,{flags:{itemEffect:true}});if(left>1)c.delay(v(c,'MAELSTROM BOUNCE DELAY',.25),()=>{const next=c.battle.units.filter(other=>other.side!==c.caster.side&&visible(other)&&!other.ward&&!other.building&&!has(other,'magicImmune')&&!seen.has(other.id)&&distance(other,t)<=radius).sort((a,b)=>distance(a,t)-distance(b,t)||a.id.localeCompare(b.id))[0];if(next)jump(next,left-1);});};
  jump(c.target,v(c,'MAELSTROM STRIKES',4));
 };
 focus.onKill=c=>{if(c.skill.points>=9)for(let i=0;i<c.caster.skills.length;i++)if(c.caster.skills[i]?.id===FOCUS)c.caster.cooldowns[i]=c.battle.time;};
 for(const id of[FLAK,FLAME,GOLEM,HEAP,FOCUS])registry[id].superImplemented=registry[id].gabenImplemented=true;
 flak.implemented=['AA10second limited attack-point800speed modifier-free ranged flaks','Native-style1.2second furthest SideGunner with modifiers,body speed,melee range buffer and Break/invisibility gates','AA Gaben free SideGunner fans with per-record recursion exclusion'];
 flak.remaining=['Exact AA Gaben SideGunner versus active charge interaction and native historical dates of secondary edge rules remain source-pending'];
 flame.implemented=['AA old full magical barrier with explicit preMR stage,per-cast burn generation and final780/105Super values','Basic-dispellable active protection and independent item-origin Radiance with one-second unique aura burn and illusion priority'];
 flame.remaining=['Exact AA twice-powerful blind/illusion factor and native preMR versus FalsePromise BorrowedTime Refraction priority remain source-pending'];
 golem.implemented=['AA true melee40second total-strength form and pre-contact strongest generic incoming amplification','Super target-bound15second native-profile zombies with Deathlust and Gaben independent10percent SoulRip contacts','Remaining-form illusion inheritance re-bases temporary strength without duplicating totals'];
 golem.remaining=['Exact AA Zombie ability rank and Gaben SoulRip event eligibility/distribution,plus snapshot-versus-live historical dates remain source-pending'];
 heap.implemented=['AA final all-type block with0point immediate channel-preserving cast and strong-only cleanup','Owned persistent Super2/Gaben4strength with retained hero qualification and explicit radius450'];
 heap.remaining=['AA enemy-versus-hero wording,retroactive Gaben reward conversion,pre2023barrier priority and HPLOSS interactions remain source-pending'];
 focus.implemented=['AA450targetAS with20second native candidate and body range,attack-begin damage snapshots and conditional-bonus exclusions','Super native2023Maelstrom attack-pointPRD/TrueStrike and unique impact chains with item-origin metadata','Gaben zero mana and full credited-kill cooldown reset'];
 focus.remaining=['Exact AA any-kill-versus-marked-target reset qualifier and native manual move/stop controls beyond this autonomous arena remain source-pending'];
}
