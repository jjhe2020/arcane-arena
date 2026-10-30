import {BATTLE_CONFIG,skillBalance,UNIT_CONFIG} from '../config';
import type {BattleState,CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';

const PHANTASM='custom_chaos_knight_phantasm',STRIKE='phantom_assassin_phantom_strike',SHIFT='puck_phase_shift',VEIL='muerta_pierce_the_veil',WARD='custom_venomancer_plague_ward',DAGGER='phantom_assassin_stifling_dagger';
const STEP=1/30,FOREVER=1_000_000,WARD_BODY='npc_dota_venomancer_plague_ward_1';
const list=(t:CombatUnit)=>t.statuses as EffectStatus[],has=(t:CombatUnit,k:string)=>t.statuses.some(s=>s.kind===k),S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9,compiled=(c:C)=>!!skillBalance(c.definition,c.skill.points),identity=(c:C)=>c.attackInstanceKey??c.skill.instanceId??c.skill.id;
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y),body=(t:CombatUnit)=>!t.dead&&!t.hiddenSpellBody&&!has(t,'banished')&&!has(t,'invulnerable');
const visible=(t:CombatUnit)=>!has(t,'undetectable')&&!has(t,'shadowRealm')&&(!has(t,'invisible')||has(t,'revealed'));
const hero=(t:CombatUnit)=>!t.ward&&!t.building&&!t.courier&&(!t.summoned||!!t.illusion||!!t.heroClone||!!t.consideredHero);
const owner=(c:C)=>({ownerInstance:identity(c),instanceKey:identity(c)});
const buff=(c:C,t:CombatUnit,k:string,duration:number,value=0,data:Record<string,string|number|boolean>={})=>c.status(t,k,duration,value,{dispel:'none',removeOnDeath:true,data:{...owner(c),...data}});
const counters=new WeakMap<BattleState,number>();
const token=(c:C)=>{const n=(counters.get(c.battle)??0)+1;counters.set(c.battle,n);return `${c.caster.id}:${identity(c)}:${n}`;};
const remove=(t:CombatUnit,run:string)=>{t.statuses=list(t).filter(s=>s.data?.phantomWardRun!==run);};

function copyVeil(c:C):void{
 for(const status of list(c.target).filter(s=>s.skill===VEIL&&s.until>c.battle.time&&['physicalImmune','attackMagical','phased','range','visualScale'].includes(s.kind))){
  const {kind,until,value,data}=status;c.status(c.caster,kind,until-c.battle.time,value,{dispel:'none',removeOnDeath:true,data:{...data,...owner(c)}});
 }
}

export function applyPhantomWardAcceptance(registry:Record<string,SkillProgram>):void{
 const phantasm=registry[PHANTASM];phantasm.backswing=0;phantasm.channel=undefined;
 phantasm.cast=c=>{
  c.dispel(c.caster,false,true);c.disjoint(c.caster);const run=token(c),split=v(c,'SPLIT TIME',.5),origin={x:c.caster.x,y:c.caster.y},facing=c.caster.facing;
  for(const kind of ['invulnerable','banished','magicImmune'])buff(c,c.caster,kind,split,0,{phantomWardRun:run,keepUnitCollision:true});
  buff(c,c.caster,'visualForm',split,0,{phantomWardRun:run,form:'phantasm',hidden:true});
  c.delay(split,()=>{
   remove(c.caster,run);if(c.caster.dead)return;
   for(const old of c.battle.units.filter(t=>!t.dead&&t.illusion&&t.sourceSkill===PHANTASM&&t.phantasmCaster===c.caster.id))c.despawn?.(old);
   const make=(template:CombatUnit,count:number,ally=false)=>{
    const damageScale=compiled(c)?v(c,'PHANTASM DAMAGE',100)/100:1;const images=c.summon({template,name:`${template.name}幻象`,count,hp:template.maxHp,currentHp:template.hp,mana:template.mana,maxMana:template.maxMana,attack:template.attack*damageScale,attributeAttackScale:damageScale,armor:template.armor,range:template.range,interval:template.attackInterval,speed:template.moveSpeed,lifetime:S(c)?FOREVER:v(c,'PHANTASM DURATION',30),illusion:true,strongIllusion:true,damageTaken:compiled(c)?v(c,'PHANTASM DAMAGE TAKEN',325)/100:3.25,inheritsSkills:true,initializeInherited:true,inheritedMode:'passives',position:ally?template:origin});
    const center=ally?{x:template.x,y:template.y}:origin,spacing=v(c,ally?'ALLY FORMATION DISTANCE':'FORMATION DISTANCE',ally?81:135)/100,places=[{x:0,y:0},{x:0,y:spacing},{x:spacing,y:0},{x:0,y:-spacing},{x:-spacing,y:0}].slice(0,images.length+(ally?0:1));
    if(ally)places[0]={x:spacing,y:0};else for(let i=places.length-1;i>0;i--){const j=Math.floor(c.random()*(i+1));[places[i],places[j]]=[places[j],places[i]];}
    for(const [i,t]of(ally?images:[c.caster,...images]).entries()){const p=places[i]??places[0];c.warp(t,center.x+p.x,center.y+p.y);t.facing=ally?template.facing:facing;if(t!==c.caster){t.phantasmCaster=c.caster.id;}}
   };
   make(c.caster,v(c,'NUMBER OF ILLUSIONS')+(!compiled(c)&&S(c)?1:0));
   if(G(c))for(const ally of c.battle.units.filter(t=>t.id!==c.caster.id&&t.side===c.caster.side&&body(t)&&hero(t)&&!t.illusion&&!t.consideredHero)){c.dispel(ally,false,true);make(ally,1,true);}
   c.interrupt?.(c.caster);
  });
 };
 phantasm.implemented=['Historical half-second hidden invulnerable spell-immune split with basic dispel and disjoint','Explicit randomized cardinal reappearance; prior Phantasm family replacement; pre-init strong-illusion identity','AA final illusion count and round-long Super; global eligible allied hero copies'];
 phantasm.remaining=['AA all-allies exact nonhero/clone exceptions and its original patch are not recovered','Creation HP/mana are covered; remaining illusion temporary effects, regeneration and full bonus-damage pipeline need broader source-specific audit','Collision-size8 alternative formation is not modeled by the four role bodies'];

 const strike=registry[STRIKE];strike.target='any';strike.backswing=.8;strike.channel=undefined;strike.range=c=>skillBalance(c.definition,c.skill.points)?.range??v(c,'CAST RANGE',1500)/100;
 strike.targetEligibility=(c,t)=>t.id!==c.caster.id&&body(t)&&!t.building&&!t.ward&&!t.courier&&(t.side===c.caster.side||visible(t));
 strike.targetSelector=(c,ts)=>ts.filter(t=>t.side!==c.caster.side).sort((a,b)=>dist(b,c.caster)-dist(a,c.caster)||a.id.localeCompare(b.id))[0]??ts.filter(t=>t.side===c.caster.side).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster))[0];
 strike.cast=c=>{
  const dx=c.caster.x-c.target.x,dy=c.caster.y-c.target.y,length=Math.hypot(dx,dy)||1,separation=v(c,'LANDING DISTANCE',80)/100;
  c.warp(c.caster,c.target.x+dx/length*separation,c.target.y+dy/length*separation);
  if(c.target.side!==c.caster.side){const duration=v(c,'DURATION')+(!compiled(c)&&S(c)?3:0);c.status(c.caster,'attackSpeed',duration,v(c,'BONUS ATTACK SPEED'),{dispel:'basic',data:owner(c)});c.status(c.caster,'lifesteal',duration,(v(c,'LIFESTEAL')+(!compiled(c)&&S(c)?25:0))/100,{dispel:'basic',data:owner(c)});c.caster.castUntil=c.battle.time;}
  if(G(c))for(const t of c.battle.units.filter(t=>t.side!==c.caster.side&&body(t)&&visible(t)&&!t.ward&&!t.building&&!t.courier&&dist(t,c.caster)<=v(c,'GABEN RADIUS',1150)/100))c.castAbility(DAGGER,4,t);
 };
 strike.implemented=['Allied and enemy blink eligibility with enemy-only basic-dispellable attack-speed/lifesteal','Teleport towards prior caster position without disjoint; AA backline AI and max-level Gaben daggers'];
 strike.remaining=['Exact native body-separation distance and Gaben area center retain documented working choices','Enemy attack order selection is arena AI; complete native command queues are not modeled'];

 const dagger=registry[DAGGER];dagger.spellBlockTiming='impact';dagger.projectileDisjointable=true;dagger.projectileDisjointOnInvisibility=true;dagger.backswing=.47;
 const daggerEligible=(c:C,t:CombatUnit)=>t.side!==c.caster.side&&body(t)&&visible(t)&&!t.ward&&!t.building&&!t.courier;
 dagger.targetEligibility=daggerEligible;
 dagger.cast=c=>{if(!daggerEligible(c,c.target))return;const origin={x:c.caster.x,y:c.caster.y};c.projectile(c.target,v(c,'dagger_speed',1200)/100,t=>{
  c.attack(t,v(c,'attack_factor_tooltip',70)/100,true,undefined,true,{bonusDamage:v(c,'base_damage',65),trueStrike:true,attackOrigin:origin,scaleConditionalBonuses:true});
  c.status(t,'slow',v(c,'duration',4),Math.abs(v(c,'move_slow',-50))/100,{harmful:true,dispel:'basic'});
 },origin);};
 dagger.implemented=['Impact-blocked/disjointable1200-speed historical dagger, excluding ward/building/courier acquisition','True-strike disarm-ignoring main fraction plus65 before critical, including conditional attack fraction','Historical native Dagger does not activate Tidebringer bonus, cleave or cooldown'];dagger.remaining=['Projectile vision is outside the flat fully visible arena'];
 // This is a documented Dagger exception, not a general Tidebringer audit.
 const tide=registry.kunkka_tidebringer,tideModifier=tide?.attackModifier,tideAttack=tide?.onAttack;
 if(tideModifier)tide.attackModifier=c=>c.attackSourceSkill===DAGGER?{}:tideModifier(c);
 if(tideAttack)tide.onAttack=c=>{if(c.attackSourceSkill!==DAGGER)tideAttack(c);};

 const shift=registry[SHIFT];shift.channel=undefined;shift.backswing=0;
 shift.cast=c=>{
  const run=token(c),duration=v(c,'DURATION');c.disjoint(c.caster);
  buff(c,c.caster,'invulnerable',duration+STEP,0,{phantomWardRun:run});buff(c,c.caster,'visualForm',duration+STEP,0,{phantomWardRun:run,form:'phaseShift',hidden:true});
  let active=true;
  const end=()=>{if(!active)return;active=false;for(const s of list(c.caster).filter(s=>s.data?.phantomWardRun===run))s.until=Math.min(s.until,c.battle.time+STEP);};
  if(!c.channelUnit?.(c.caster,duration,end)){end();return;}
  const attack=()=>{for(const target of c.battle.units.filter(t=>t.side!==c.caster.side&&body(t)&&visible(t)&&!t.ward&&t.nativeTemplateId!=='npc_dota_unit_undying_zombie'&&dist(t,c.caster)<=(c.attackRange?.(c.caster)??c.caster.range)+v(c,'BONUS ATTACK RADIUS',200)/100))c.attack(target,1,true,undefined,true,{meleeRangeBuffer:v(c,'MELEE RANGE BUFFER',350)/100});};
  if(S(c))attack();
  if(G(c)){const interval=Math.max(STEP,v(c,'GABEN ATTACK INTERVAL',1)),tick=(elapsed:number)=>{if(!active||c.caster.dead)return;attack();if(elapsed+interval<duration-1e-8)c.delay(interval,()=>tick(elapsed+interval));};if(interval<duration)c.delay(interval,()=>tick(interval));}
 };
 shift.implemented=['Historical zero-animation channel with disjoint and hidden invulnerability preserving unit collision','Interruption/completion leave only one server tick protection','AA radius+200 immediate Super attacks ignore disarm, obey evasion and melee buffer; Gaben channel-bound one-second repeats'];shift.remaining=['Native item actions that specially cancel PhaseShift have no general item action subsystem','Full native stolen-channel continuation and AI dodge policy remain outside tested combinations'];

 const veil=registry[VEIL];veil.castPoint=0;veil.backswing=0;veil.onAttack=undefined;
 veil.cast=c=>{
  c.disjoint(c.caster);c.dispel(c.caster,false,true);const transform=v(c,'TRANSFORM DURATION',.35),end=c.battle.time+v(c,'DURATION'),run=token(c);
  buff(c,c.caster,'actionLock',transform,0,{phantomWardRun:run});
  c.delay(transform,()=>{if(c.caster.dead)return;const remaining=Math.max(0,end-c.battle.time);for(const kind of ['physicalImmune','attackMagical','phased'])buff(c,c.caster,kind,remaining,1);buff(c,c.caster,'attackBonus',remaining,v(c,'BONUS ATTACK DAMAGE')+(!compiled(c)&&S(c)?100:0));buff(c,c.caster,'visualScale',remaining,v(c,'MODEL SCALE',1.3));if(S(c))buff(c,c.caster,'range',remaining,v(c,'SUPER ATTACK RANGE',200)/100);});
 };
 veil.onIllusionCreated=copyVeil;
 veil.onAttackPoint=c=>{
  if(!G(c)||c.caster.illusion||has(c.caster,'break')||c.attackIsInstant||!c.attackRecord||!c.chance?.(v(c,'GUNSLINGER CHANCE',50)/100,'gunslinger'))return;
  const radius=(c.attackRange?.(c.caster)??c.caster.range)+v(c,'GUNSLINGER BONUS RANGE',150)/100,eligible=(t:CombatUnit)=>body(t)&&visible(t)&&t.side!==c.caster.side&&!t.ward&&!(has(c.caster,'attackMagical')&&t.building)&&(!has(t,'attackImmune')||has(c.caster,'attackMagical'))&&dist(t,c.caster)<=radius;
  const candidates=c.battle.units.filter(t=>eligible(t)&&t.id!==c.target.id),heroes=candidates.filter(t=>hero(t)||t.building),pool=heroes.length?heroes:candidates,target=pool.length?pool[Math.floor(c.random()*pool.length)]:(eligible(c.target)?c.target:undefined);
  if(target)c.attack(target,1,true,undefined,true,{noCleave:true,meleeRangeBuffer:v(c,'GUNSLINGER MELEE BUFFER',350)/100});
 };
 veil.implemented=['Historical zero-animation dispel/disjoint and action-locked transform included in total duration','Undispellable physical resistance/attack conversion/phased movement; illusion copy omits flat damage','Gaben Gunslinger normal-attack-point PRD, random hero-prioritized secondary instant attack, no cleave or recursion'];veil.remaining=['AA StrongDispelsOnly category conflicts with dated undispellable native buff; category is not a proved Lua override','Gunslinger illusion eligibility preserves existing excluded working rule; AA grants-native exact patch is not recovered','Muerta was released after the fixed February KV; March15Wiki supplies dated compatibility candidate'];

 const ward=registry[WARD];ward.target='enemy';ward.pointTarget=true;ward.unitTarget=false;ward.backswing=.63;ward.range=c=>skillBalance(c.definition,c.skill.points)?.range??8.5;
 ward.prepareAttack=c=>c.caster.plagueWard?{ignoreDamageBlock:true}:undefined;
 ward.cast=c=>{
  const cursor=c.castPosition??c.target,template={...c.caster,ward:true,plagueWard:true},duration=v(c,'DURATION',40),count=Math.max(0,Math.min(32,Math.floor(v(c,'WARD COUNT')+(!compiled(c)&&S(c)?1:0)))),dx=cursor.x-c.caster.x,dy=cursor.y-c.caster.y,length=Math.hypot(dx,dy)||1,bodies:CombatUnit[]=[];
  // AA supplies two wards but no formation. This body-radius separation is a
  // declared arena placement policy; it is not a native exact-offset claim.
  for(let i=0;i<count;i++){const offset=(i-(count-1)/2)*2*BATTLE_CONFIG.bodyRadius,position={x:cursor.x-dy/length*offset,y:cursor.y+(Math.abs(dx)+Math.abs(dy)>0?dx/length:1)*offset};bodies.push(...c.summon({template,nativeTemplateId:WARD_BODY,visualBody:'ward',name:'瘟疫守卫',count:1,hp:v(c,'WARD HP')*(!compiled(c)&&S(c)?2.5:1),attack:v(c,'WARD DAMAGE')*(!compiled(c)&&S(c)?2.5:1),armor:0,range:v(c,'ATTACK RANGE',600)/100,interval:v(c,'BASE ATTACK TIME',1.4),speed:0,lifetime:duration,position,inheritsSkills:G(c),initializeInherited:G(c),inheritedMode:'passives',inheritedPointsCap:3}));}
  const profile=UNIT_CONFIG[WARD_BODY];
  for(const t of bodies){t.ward=true;t.plagueWard=true;t.piercingAttackClass={hero:profile.piercingHeroMultiplier,creep:profile.piercingCreepMultiplier,reinforced:profile.piercingReinforcedMultiplier};t.magicResist=(profile?.MagicalResistance??0)/100;t.mana=t.maxMana=profile?.StatusMana??0;buff(c,t,'magicImmune',duration);buff(c,t,'regen',duration,v(c,'HEALTH REGEN',.25));if(!t.skills.some(s=>s?.id===WARD))t.skills.unshift({id:WARD,points:3,instanceId:`ward-controller:${t.id}`});}
 };
 ward.implemented=['Real ranged stationary ward profile with AA five-tier HP/damage/count/duration and explicit point birth','Magic-immunity buff, health regeneration, physical attacks ignoring damage block; dated final Piercing class factors','Gaben registered base-passive inheritance caps AA skills at rank3 before initialization'];ward.remaining=['Exact AA passive exclusion list and active-spell passive components are not recovered','No unlearned PoisonSting is granted; nativeAbilityDraft requires drafting it and this catalog lacks that skill','Piercing-spell target exceptions and manual ward orders need a separate unit-class matrix','Multiple-ward birth separation uses project body radius; original AA formation is unrecovered'];
}
