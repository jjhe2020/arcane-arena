import {skillBalance,UNIT_CONFIG} from '../config';
import type {CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';

const STEP=1/30;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const has=(u:CombatUnit,kind:string,time:number)=>u.statuses.some(s=>s.kind===kind&&s.until>time);
const upgraded=(c:C)=>c.skill.points>=6;
const gaben=(c:C)=>c.skill.points>=9;
const configured=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const friendlyOptions={dispel:'strong' as const};
interface EmbraceRun {source:string;token:number;until:number;finished:boolean;finish:()=>void}
interface SkinRun {last:number;next:number;expires:number}

/** Final, evidence-scoped overrides. AA numbers remain configurable; the
 * accompanying acceptance ledger records unresolved native/custom boundaries. */
export function applySummonRestorationAcceptance(registry:Record<string,SkillProgram>):void {
 const embraceRuns=new WeakMap<C['battle'],Map<string,EmbraceRun>>();
 const runs=(c:C)=>{let result=embraceRuns.get(c.battle);if(!result){result=new Map();embraceRuns.set(c.battle,result);}return result;};
 const wild=registry.custom_beastmaster_call_of_the_wild;
 const addSkills=(unit:CombatUnit,ids:string[])=>{for(const id of ids){unit.skills.push({id,points:3});unit.cooldowns.push(0);}};
 const nativeBody=(c:C,id:string,name:string,life:number,skills:string[]=[])=>{
  const raw=UNIT_CONFIG[id];if(!raw)throw Error(`Missing configured summon ${id}`);
  const template={...c.caster,sourceUnitType:id,skills:skills.map(id=>({id,points:3}))};
  const unit=c.summon({name,count:1,hp:raw.StatusHealth,attack:(raw.AttackDamageMin+raw.AttackDamageMax)/2,armor:raw.ArmorPhysical,range:raw.AttackRange/100,interval:raw.AttackRate/(raw.BaseAttackSpeed/100),speed:raw.MovementSpeed/100,lifetime:life,template,inheritsSkills:skills.length>0,initializeInherited:skills.length>0})[0];
  unit.sourceUnitType=id;unit.magicResist=raw.MagicalResistance/100;unit.mana=unit.maxMana=raw.StatusMana;
  c.status(unit,'regen',life,raw.StatusHealthRegen);c.status(unit,'manaRegen',life,raw.StatusManaRegen-3);return unit;
 };
 wild.target='self';wild.pointTarget=false;wild.canCast=c=>!c.caster.beastmasterBoar;
 wild.cast=c=>{
  const life=v(c,'SUMMON DURATION'),boar=c.summon({name:'豪猪',count:v(c,'BOAR COUNT',1),hp:v(c,'BOAR HEALTH'),attack:v(c,'BOAR ATTACK DAMAGE'),armor:v(c,'BOAR ARMOR',0),range:v(c,'BOAR ATTACK RANGE',550)/100,interval:v(c,'BOAR BASE ATTACK TIME',1.25),speed:v(c,'BOAR MOVE SPEED',c.skill.points>=3?350:c.skill.points>=2?330:320)/100,lifetime:life})[0];
  boar.beastmasterBoar=true;boar.magicResist=0;boar.attackPoint=v(c,'BOAR ATTACK POINT',.5);boar.attackBackswing=v(c,'BOAR ATTACK BACKSWING',.47);boar.projectileSpeed=v(c,'BOAR PROJECTILE SPEED',1500)/100;boar.skills=[{...c.skill}];boar.cooldowns=[Infinity];boar.inheritedMode='attackEffects';c.status(boar,'regen',life,v(c,'BEAST REGEN',1.5));
  const hawks=c.summon({name:'猎鹰',count:v(c,'HAWK COUNT',gaben(c)?3:1),hp:v(c,'HAWK HEALTH'),attack:0,armor:v(c,'HAWK ARMOR',5),range:0,speed:v(c,'HAWK SPEED')/100,lifetime:life});
  for(const hawk of hawks){hawk.beastmasterHawk=true;hawk.magicResist=0;c.status(hawk,'fly',life,1,{dispel:'none'});c.status(hawk,'disarm',life,1,{dispel:'none'});c.status(hawk,'invisible',life,1,{dispel:'none'});c.status(hawk,'regen',life,v(c,'BEAST REGEN',1.5));if(upgraded(c))addSkills(hawk,['beastmaster_hawk_dive']);}
  if(upgraded(c)){
   const warrior=nativeBody(c,'npc_dota_necronomicon_warrior_3','死灵战士',life,['necronomicon_warrior_mana_burn','necronomicon_warrior_last_will']);nativeBody(c,'npc_dota_necronomicon_archer_3','死灵弓手',life,['necronomicon_archer_purge','necronomicon_archer_aoe']);
   const sight=()=>{if(warrior.dead)return;if(!has(warrior,'break',c.battle.time))for(const enemy of c.battle.units.filter(t=>!t.dead&&t.side!==warrior.side&&distance(t,warrior)<=v(c,'TRUE SIGHT RADIUS',1000)/100))c.status(enemy,'revealed',v(c,'TRUE SIGHT LINGER',.5),1,{source:warrior.id,dispel:'none'});if(c.battle.time<Number(warrior.expiresAt))c.delay(.1,sight);};sight();
  }
  if(gaben(c)){
   const pool=['npc_dota_neutral_black_dragon','npc_dota_neutral_granite_golem','npc_dota_neutral_big_thunder_lizard'],id=pool[Math.floor(c.random()*pool.length)],unit=nativeBody(c,id,'支配远古',life);unit.ancient=true;
   if(id==='npc_dota_neutral_black_dragon')addSkills(unit,['black_dragon_fireball','black_dragon_splash_attack','black_dragon_dragonhide_aura']);
   if(id==='npc_dota_neutral_big_thunder_lizard')addSkills(unit,['big_thunder_lizard_slam','big_thunder_lizard_frenzy']);
   if(id==='npc_dota_neutral_granite_golem'){
    unit.summonGapGraniteAura=true;addSkills(unit,['granite_golem_hp_aura']);
    const pulse=()=>{if(unit.dead)return;for(const ally of c.allies())if(distance(ally,unit)<=v(c,'ANCIENT AURA RADIUS',1200)/100)c.status(ally,'maxHpPct',v(c,'ANCIENT AURA LINGER',.15),v(c,'ANCIENT HEALTH AURA',15)/100,{source:unit.id,skill:'granite_golem_hp_aura',dispel:'none',passive:true,data:{stacking:'strongest',uniqueGroup:'graniteHealthAura',suppressWithSourceBreak:true}});if(c.battle.time<Number(unit.expiresAt??Infinity))c.delay(.1,pulse);};pulse();
   }
  }
  if(upgraded(c))for(const unit of c.allies().filter(t=>t.owner===c.caster.id)){const bonus=v(c,'SUMMON HEALTH BONUS',250);unit.maxHp+=bonus;unit.hp+=bonus;}
 };
 wild.onAttack=c=>{if(!c.caster.beastmasterBoar||has(c.caster,'break',c.battle.time)||c.target.side===c.caster.side||c.target.ward||c.target.building)return;const life=v(c,'BOAR POISON DURATION');c.status(c.target,'slow',life,v(c,'BOAR SLOW')/100,{harmful:true});c.status(c.target,'attackSpeed',life,-v(c,'BOAR SLOW'),{harmful:true});};
 wild.implemented=['AA one boar plus hawk; subsequent casts retain existing summons','Historical boar550 range/1250ms BAT and flat attack-speed poison; AA damage/HP/movement slow retained','Invisible nonattacking hawks; Super grants historical Dive Bomb and two Necro3 units','AA discrete250HP cast bonus covers all owned summons including this cast ancient','Gaben three hawks and seeded ancient selection with existing native child abilities'];
 wild.remaining=['AA combined point-target description is represented by autonomous arena summoning rather than native directed scouting','Ancient pool/weights and Overlord stat inheritance are not recovered; existing three-type pool retained','Hawk vision has no fog-of-war equivalent; archer purge decay and shared-instance mana-break interactions need separate child-mechanism verification'];
 const necroBurn=registry.necronomicon_warrior_mana_burn;
 necroBurn.onAttack=c=>{if(c.target.side===c.caster.side||c.target.ward||c.target.building)return;const burned=Math.min(c.target.mana,v(c,'BURN_AMOUNT',50));c.mana(c.target,-burned);if(burned>0)c.damage(c.target,burned*v(c,'BURN_DAMAGE_CONVERSION',50)/100,'physical',false,{category:'attack',flags:{noAmplification:true,noSpellLifesteal:true}});};
 necroBurn.implemented=['Historical50 mana burn and physical damage equal to50% of burned mana; separate instance is explicit'];necroBurn.remaining=['Mana break still needs a typed main-attack component for one block and attack-lifesteal treatment; this separate physical instance is not declared native parity'];
 const archerAura=registry.necronomicon_archer_aoe;archerAura.passive=true;archerAura.cast=undefined;archerAura.canCast=undefined;
 archerAura.init=c=>c.zone({follow:true,radius:v(c,'RADIUS',1200)/100,duration:Math.max(0,Number(c.caster.expiresAt??c.battle.time+60)-c.battle.time),interval:.1,immediate:true,targets:'allies',effect:t=>{if(has(t,'invulnerable',c.battle.time)||has(t,'banished',c.battle.time))return;c.status(t,'haste',v(c,'AURA LINGER',.5),v(c,'MS_BONUS',9)/100,{dispel:'none',data:{stacking:'strongest',uniqueGroup:'necronomiconArcherMoveAura',suppressWithSourceBreak:true}});}});
 archerAura.implemented=['Historical7.28 replacement aura grants only movement speed, not obsolete KV attack-speed bonus','Duplicate sources do not stack;500ms linger; invulnerable allies excluded'];archerAura.remaining=[];
 const dive=registry.beastmaster_hawk_dive;
 dive.onCastStart=c=>{c.status(c.caster,'revealed',v(c,'ABILITYCASTPOINT',1)+v(c,'DIVE DURATION',.4),1,{dispel:'none'});};
 dive.cast=c=>{
  const target=c.target,origin={x:c.caster.x,y:c.caster.y},seconds=v(c,'DIVE DURATION',.4),started=c.battle.time;let done=false;
  const travel=()=>{if(done||c.caster.dead)return;const progress=Math.min(1,(c.battle.time-started+STEP)/seconds),accepted=c.moveContinuous(c.caster,origin.x+(target.x-origin.x)*progress,origin.y+(target.y-origin.y)*progress,{duration:STEP,priority:20,ignoreBarriers:true});if(!accepted){done=true;return;}if(progress>=1){done=true;c.delay(STEP,()=>{if(c.caster.dead)return;if(!target.dead){c.damage(target,v(c,'DAMAGE',250),'magical',false);c.status(target,'root',v(c,'STUN_DURATION',2.5),0,{harmful:true,dispel:'basic'});}c.execute(c.caster);});}else c.delay(STEP,travel);};travel();
 };
 dive.backswing=0;dive.implemented=['Historical1second revealed windup and fixed400ms targeted continuous dive','Damage then basic-dispellable root, followed by unconditional hawk sacrifice','Only the selected enemy is affected; path bystanders are not hit'];dive.remaining=['Shared cast cancellation still interrupts the one-second windup; native dive explicitly ignores disables after release','Native accelerating/decelerating homing curve is approximated by a fixed-duration path'];

 const offering=registry.custom_warlock_chaotic_offering,beginGolemAuras=new WeakMap<CombatUnit,()=>void>();
 const golemAura=(c:C)=>{
  const ends=Number(c.caster.expiresAt??c.battle.time+v(c,'GOLEM DURATION',60)),interval=v(c,'IMMOLATION INTERVAL',1),linger=v(c,'IMMOLATION LINGER',.5),seen=new Map<CombatUnit,{last:number;next:number}>();
  const pulse=()=>{if(c.caster.dead||c.battle.time>=ends-1e-8)return;
   if(!has(c.caster,'break',c.battle.time))for(const enemy of c.enemies().filter(t=>!t.ward&&!t.building&&distance(t,c.caster)<=v(c,'IMMOLATION RADIUS',300)/100)){let state=seen.get(enemy);if(!state){state={last:c.battle.time,next:c.battle.time+interval};seen.set(enemy,state);}state.last=c.battle.time;}
   for(const [enemy,state]of seen){if(enemy.dead||c.battle.time>state.last+linger+1e-8){seen.delete(enemy);continue;}if(state.next<=c.battle.time+1e-8){c.damage(enemy,v(c,'IMMOLATION DAMAGE PER SECOND',c.skill.points>=3?60:c.skill.points>=2?40:20)*interval,'magical',false,{flags:{damageOverTime:true}});state.next+=interval;}}
   c.delay(STEP,pulse);
  };pulse();
 };
 offering.init=c=>{if(c.caster.extraOfferingGolem){c.status(c.caster,'regen',v(c,'GOLEM DURATION',60),v(c,'GOLEM HEALTH REGEN'),{dispel:'none'});beginGolemAuras.set(c.caster,()=>golemAura(c));}};
 const summonOffering=(c:C,onDeath=false)=>{
  const position=onDeath?{x:c.caster.x,y:c.caster.y}:c.castPosition??{x:c.target.x,y:c.target.y},count=onDeath?v(c,'ON DEATH GOLEM COUNT',1):v(c,'GOLEM COUNT',gaben(c)?2:1),delay=v(c,'EFFECT DELAY',.5);
  for(let i=0;i<count;i++)c.delay(delay+i*v(c,'GOLEM SPAWN INTERVAL',.2),()=>{
   for(const enemy of c.enemies().filter(t=>!t.ward&&!t.building&&distance(t,position)<=v(c,'SUMMON BLAST RADIUS')/100))c.status(enemy,'stun',v(c,'SUMMON STUN DURATION',1),0,{harmful:true,dispel:'strong',piercesImmunity:true});
   const hp=onDeath?v(c,'ON DEATH GOLEM HEALTH',v(c,'GOLEM HEALTH')):v(c,'GOLEM HEALTH')-(!configured(c)&&gaben(c)?600:0),template={...c.caster,extraOfferingGolem:true,skills:[{...c.skill}]};
   const body=c.summon({name:'地狱火',count:1,hp,attack:v(c,'GOLEM DAMAGE'),armor:v(c,'GOLEM ARMOR'),lifetime:v(c,'GOLEM DURATION',60),range:v(c,'GOLEM ATTACK RANGE',225)/100,interval:v(c,'GOLEM BASE ATTACK TIME',1.2),speed:v(c,'GOLEM MOVE SPEED',c.skill.points>=3?360:c.skill.points>=2?340:320)/100,template,inheritsSkills:true,initializeInherited:true,inheritedMode:'attackEffects'})[0];
   body.extraOfferingGolem=true;body.magicResist=v(c,'GOLEM MAGIC RESISTANCE',33)/100;body.ancient=true;body.consideredHero=true;body.attackPoint=v(c,'GOLEM ATTACK POINT',.26);body.attackBackswing=v(c,'GOLEM ATTACK BACKSWING',.57);body.cooldowns=[Infinity];c.warp(body,position.x,position.y);beginGolemAuras.get(body)?.();
  });
 };
 offering.target='enemy';offering.pointTarget=true;offering.backswing=.7;offering.canCast=c=>!c.caster.extraOfferingGolem;
 offering.cast=c=>summonOffering(c);
 offering.onDeath=c=>{if(upgraded(c)&&!c.caster.extraOfferingGolem&&!c.caster.illusion&&!c.caster.statuses.some(s=>s.kind==='reincarnation'&&(s.value??0)>0))summonOffering(c,true);};
 offering.onAttack=c=>{if(!c.caster.extraOfferingGolem||has(c.caster,'break',c.battle.time))return;for(const enemy of c.enemies().filter(t=>!t.ward&&!t.building&&!has(t,'ethereal',c.battle.time)&&!has(t,'attackImmune',c.battle.time)&&distance(t,c.target)<=v(c,'FLAMING FISTS RADIUS',300)/100))c.damage(enemy,v(c,'FLAMING FISTS DAMAGE',c.skill.points>=3?50:c.skill.points>=2?40:30),'pure',true);};
 offering.implemented=['Frozen point targeted offering with500ms post-release delay; area stun pierces spell immunity','Gaben second golem and second area stun arrive200ms after the first','Golems retain60second independent lifetime,33% magic resistance and AA zero main attack','Independent golem-owned Immolation clocks and Flaming Fists count as the offering for statistics','Super death offering is one ordinary golem, does not trigger on illusion death or reincarnation'];
 offering.remaining=['AA Gaben reduced HP uses the existing native-delta interpretation, without original custom Lua proof','Current battle elimination policy ignores summoned bodies and may end combat before a last-hero death offering resolves','Native ethereal/attack-immune eligibility requires complete shared status representation'];

 const embrace=registry.custom_winter_wyvern_cold_embrace;
 embrace.projectileDisjointable=true;
 embrace.projectileDisjointOnInvisibility=true;
 const embraceKey=(c:C)=>`coldEmbrace:${c.target.id}:${c.caster.id}`;
 embrace.targetSelector=(c,targets)=>targets.filter(t=>!t.ward&&!t.building&&!has(t,'invulnerable',c.battle.time)&&!has(t,'banished',c.battle.time)&&t.hp<t.maxHp*.5).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0];
 embrace.cast=c=>{
  const target=c.target,seconds=v(c,'DURATION'),key=embraceKey(c),prior=runs(c).get(key),interval=Math.max(STEP,v(c,'HEAL INTERVAL',.25)),start=c.battle.time;let tick=1;
  if(prior)prior.finished=true;
  const token=Number(target.coldEmbraceSequence??0)+1;target.coldEmbraceSequence=token;
  const run:EmbraceRun={source:c.caster.id,token,until:c.battle.time+seconds,finished:false,finish:()=>{
   if(run.finished)return;
   // Expiry notifications precede scheduled tasks in the simulation. Preserve
   // the sixteenth historical sample when expiry and healing share a tick.
   if(!target.dead&&start+tick*interval<=run.until+1e-8&&start+tick*interval<=c.battle.time+1e-8){sample();tick++;}
   run.finished=true;
   target.statuses=target.statuses.filter(s=>!(s.skill===c.skill.id&&s.source===c.caster.id&&['coldEmbrace','physicalImmune','selfStun','root','disarm'].includes(s.kind)));
   if(!gaben(c))return;
   const origin={x:target.x,y:target.y};
   for(const enemy of c.enemies().filter(t=>!t.ward&&!t.building&&distance(t,origin)<=v(c,'SPLINTER RADIUS',1200)/100))c.projectile(enemy,v(c,'SPLINTER SPEED',800)/100,victim=>{
    c.damage(victim,v(c,'SPLINTER DAMAGE',340),'magical',false);
    c.status(victim,'slow',v(c,'SPLINTER SLOW DURATION',4),v(c,'SPLINTER SLOW',30)/100,{harmful:true,piercesImmunity:false});
    c.status(victim,'stun',v(c,'SPLINTER STUN DURATION',2),0,{harmful:true,dispel:'strong',piercesImmunity:false});
   },origin);
  }};runs(c).set(key,run);target[key]={source:c.caster.id,token,until:run.until};
  target.statuses=target.statuses.filter(s=>!(s.skill===c.skill.id&&s.source===c.caster.id&&['regen','coldEmbrace','physicalImmune','selfStun','root','disarm'].includes(s.kind)));
  const options={...friendlyOptions,data:{embraceToken:token}};
  c.status(target,'coldEmbrace',seconds,1,options);c.status(target,'physicalImmune',seconds,1,options);
  if(upgraded(c)){c.status(target,'root',seconds,0,options);c.status(target,'disarm',seconds,0,options);}else c.status(target,'selfStun',seconds,0,options);
  const sample=()=>{const flat=v(c,'BASE HEAL PER SECOND')+(!configured(c)&&gaben(c)?25:0);c.heal(target,(flat+target.maxHp*v(c,'MAX HEAL PER SECOND')/100)*interval,'heal');};
  const heal=()=>{
   if(run.finished||runs(c).get(key)!==run)return;
   if(target.dead){run.finish();return;}
   if(!target.statuses.some(s=>s.kind==='coldEmbrace'&&s.skill===c.skill.id&&s.source===c.caster.id)){run.finish();return;}
   if(c.battle.time>run.until+1e-8){run.finish();return;}
   sample();tick++;
   const next=start+tick*interval;if(next<=run.until+1e-8)c.delay(Math.max(0,next-c.battle.time),heal);
  };c.delay(interval,heal);
 };
 embrace.onStatusRemoved=(c,status)=>{if(status.kind!=='coldEmbrace')return;const run=runs(c).get(embraceKey(c));if(run&&run.token===status.data?.embraceToken)run.finish();};
 embrace.onUnitDeath=c=>{runs(c).get(embraceKey(c))?.finish();};
 embrace.onAffectedUnitDeath=(c,status)=>{if(status.kind==='coldEmbrace')runs(c).get(embraceKey(c))?.finish();};
 embrace.implemented=['Historical250ms direct-heal samples rather than health regeneration','AA strong dispel removes physical protection and control together','Super roots/disarms instead of stunning so spell casting remains available','Gaben release from the embraced body on expiry or early strong dispel; historical secondary projectile travel, slow and AA stun'];
 embrace.remaining=[];

 const rage=registry.alchemist_chemical_rage;
 const clearRage=(unit:CombatUnit)=>{unit.statuses=unit.statuses.filter(s=>!(s.skill==='alchemist_chemical_rage'&&['baseAttackTime','regen','moveFlat','selfStun'].includes(s.kind)));};
 rage.cast=c=>{
  const targets=[c.caster];if(gaben(c)){const ally=c.allies().filter(t=>t.id!==c.caster.id&&!t.ward&&!t.building&&!has(t,'banished',c.battle.time)).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0];if(ally)targets.push(ally);}
  for(const target of targets){
   c.dispel(target,false,true);c.disjoint(target);const seconds=v(c,'DURATION'),transform=v(c,'TRANSFORM DURATION',.35);
   c.status(target,'selfStun',transform,0,{dispel:'none'});
   c.status(target,'baseAttackTime',seconds,v(c,(c.isRangedAttack?.(target)??target.range>2)?'BASE ATTACK TIME (RANGED)':'BASE ATTACK TIME (MELEE)')-(!configured(c)&&upgraded(c)?.1:0),friendlyOptions);
   c.status(target,'regen',seconds,v(c,'BONUS HEALTH REGEN')+(!configured(c)&&upgraded(c)?50:0),friendlyOptions);
   c.status(target,'moveFlat',seconds,(v(c,'BONUS MOVE SPEED')+(!configured(c)&&upgraded(c)?150:0))/100,friendlyOptions);
   const until=c.battle.time+seconds,watch=()=>{if(target.dead){clearRage(target);return;}if(c.battle.time<until)c.delay(STEP,watch);};c.delay(STEP,watch);
  }
 };
 rage.onDeath=c=>clearRage(c.caster);rage.onUnitDeath=c=>clearRage(c.target);
 rage.backswing=0;
 rage.implemented=['Release applies a basic dispel and projectile disjoint','Uninterruptible350ms transformation action lock','AA melee/ranged base-attack-time replacement, regeneration and movement for30seconds','Super consumes each effective final row once','Gaben nearest allied eligible unit receives an independent complete rage'];
 rage.remaining=['AA closest-unit wording does not explicitly resolve enemy eligibility; nearest allied eligible body is retained','Exact native overlap of transformation and regeneration start requires an original-engine sample'];

 const skin=registry.viper_corrosive_skin;
 const applySkin=(c:C,target:CombatUnit)=>{
  if(target.side===c.caster.side||target.ward||target.building||has(target,'banished',c.battle.time)||has(target,'magicImmune',c.battle.time))return;
  const seconds=v(c,'DURATION'),key=`corrosive:${c.caster.id}`,old=target[key] as SkinRun|undefined,interval=v(c,'DAMAGE INTERVAL',1),slow=v(c,'ATTACK SLOW')*(!configured(c)&&upgraded(c)?2:1);
  c.status(target,'attackSpeed',seconds,-slow,{harmful:true,dispel:'basic',affectsInvulnerable:true});c.status(target,'corrosiveSkin',seconds,1,{harmful:true,dispel:'basic',affectsInvulnerable:true});
  const expires=target.statuses.find(s=>s.kind==='corrosiveSkin'&&s.skill===c.skill.id&&s.source===c.caster.id)?.until??c.battle.time;
  if(old&&old.expires>c.battle.time){old.expires=expires;return;}
  const start=c.battle.time,run:SkinRun={last:start,next:start+interval,expires};target[key]=run;
  const tick=()=>{
   if(target.dead||target[key]!==run)return;
   if(!target.statuses.some(s=>s.kind==='attackSpeed'&&s.skill===c.skill.id&&s.source===c.caster.id)){target[key]=undefined;return;}
   if(c.battle.time>run.expires+1e-8){target[key]=undefined;return;}
   c.damage(target,v(c,'DAMAGE PER SECOND')*interval,'magical',false,{flags:{damageOverTime:true,noReflection:true}});run.last=run.next;run.next+=interval;c.delay(Math.max(0,run.next-c.battle.time),tick);
  };c.delay(interval,tick);
 };
 skin.init=c=>{
  if(!c.caster.illusion)c.status(c.caster,'magicResist',1e6,v(c,'MAGIC RESISTANCE')/100*(!configured(c)&&upgraded(c)?2:1),{dispel:'none',passive:true});
  if(gaben(c))c.zone({follow:true,radius:v(c,'AURA RADIUS',1200)/100,duration:1e6,interval:v(c,'AURA INTERVAL',.1),immediate:true,effect:t=>applySkin(c,t)});
 };
 skin.onDamage=undefined;
 skin.onIncomingDamageEvent=c=>{const event=c.incomingDamageEvent;if(!event||event.inputAmount<=0||event.flags.noReflection||event.flags.reflection||event.flags.healthRemoval||event.category==='hpRemoval')return;if(c.target.id!==c.caster.id&&distance(c.caster,c.target)<=v(c,'MAX RANGE RADIUS')/100)applySkin(c,c.target);};
 skin.onStatusRemoved=(c,status,reason)=>{if(status.kind!=='corrosiveSkin')return;const key=`corrosive:${c.caster.id}`,run=c.target[key] as SkinRun|undefined;if(!run)return;if(reason==='expire'&&c.battle.time>=run.expires-1e-8&&run.next<=run.expires+1e-8&&run.next<=c.battle.time+1e-8)c.damage(c.target,v(c,'DAMAGE PER SECOND')*v(c,'DAMAGE INTERVAL',1),'magical',false,{flags:{damageOverTime:true,noReflection:true}});c.target[key]=undefined;};
 skin.implemented=['Damage-source retaliation within1400 and no retaliation on allied/self damage','Four-second unique slow and delayed one-second magical damage pulses','AA Super final attack slow and magic resistance; no native near-radius damage doubling imported','Gaben final1200 aura with immediate acquisition; source Break suppresses applications'];
 skin.remaining=['Native lethal-hit retaliation order is not specified by the recovered source; current incoming hook retains live-unit dispatch'];
}
