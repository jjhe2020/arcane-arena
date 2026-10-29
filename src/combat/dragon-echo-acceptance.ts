import {skillBalance} from '../config';
import type {CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {addVisualWorldEffect} from './visual-state';

const STEP=1/30,FOREVER=1_000_000;
const DRAGON='dragon_knight_elder_dragon_form',FIRE='dragon_knight_fireball',EMPOWER='custom_magnataur_empower',TOTEM='custom_earthshaker_enchant_totem',EPIC='custom_sandking_epicenter',FLUX='custom_obsidian_destroyer_equilibrium';
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const has=(u:CombatUnit,k:string)=>u.statuses.some(s=>s.kind===k);
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const identity=(c:C)=>c.attackInstanceKey??c.skill.instanceId??c.skill.id;
const own=(c:C,t:CombatUnit,k:string)=>statuses(t).find(s=>s.kind===k&&s.source===c.caster.id&&s.skill===c.skill.id&&s.data?.ownerInstance===identity(c));
const data=(c:C)=>({ownerInstance:identity(c),instanceKey:identity(c)});
const configured=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const body=(t:CombatUnit)=>!t.dead&&!t.ward&&!has(t,'invulnerable')&&!has(t,'banished');
const enemy=(c:C,t:CombatUnit)=>body(t)&&t.side!==c.caster.side&&!t.building;
const burnSequences=new WeakMap<C['battle'],number>();

/** Final AA-first overrides. Historical timing and unresolved AA patch choices
 * are tracked separately in acceptance/dragon-echo.json. */
export function applyDragonEchoAcceptance(registry:Record<string,SkillProgram>):void{
 const dragon=registry[DRAGON];
 const dragonInit=dragon.init;dragon.init=c=>{if(!c.caster.illusion)dragonInit?.(c);};
 const activeDragon=(c:C)=>own(c,c.caster,'elderDragon')??own(c,c.caster,'dragonInheritedAttack');
 dragon.onIllusionCreated=c=>{
  const form=statuses(c.target).find(s=>s.skill===DRAGON&&s.kind==='elderDragon'&&s.until>c.battle.time);
  if(!form)return;
  for(const kind of ['elderDragon','attackTypeOverride','projectileSpeedOverride','range','moveFlat','freePathing']){
   const source=statuses(c.target).find(s=>s.skill===DRAGON&&s.kind===kind&&s.until>c.battle.time);if(!source)continue;
   c.status(c.caster,kind,source.until-c.battle.time,source.value,{dispel:'strong',removeOnDeath:true,data:data(c)});
  }
  // The retained pre7.35d behavior leaves the three on-hit modifiers on an
  // illusion after its visible ranged transformation expires. This is not an
  // assertion that the captured AA Lua necessarily used that native patch.
  c.status(c.caster,'dragonInheritedAttack',FOREVER,form.value,{dispel:'none',removeOnDeath:true,data:data(c)});
 };
 dragon.target='self';dragon.castPoint=0;dragon.requiresFacing=false;dragon.canCast=()=>true;
 // Preserve the independently owned Super Fireball grant, without the old cast.
 dragon.cast=c=>{
  const seconds=v(c,'DURATION'),put=(kind:string,amount:number)=>c.status(c.caster,kind,seconds,amount,{dispel:'strong',removeOnDeath:true,data:data(c)});
  put('elderDragon',c.skill.points>=9?4:Math.min(3,c.skill.points));put('attackTypeOverride',2);
  put('projectileSpeedOverride',v(c,'PROJECTILE SPEED',900)/100);
  put('range',v(c,'BONUS ATTACK RANGE')/100);put('moveFlat',v(c,'BONUS MOVE SPEED')/100);
  if(c.skill.points>=9){put('magicResist',v(c,'MAGIC RESISTANCE',25)/100);put('freePathing',1);}
 };
 const poison=(c:C,t:CombatUnit)=>{
  if(!body(t)||t.ward||has(t,'magicImmune'))return;
  const previous=own(c,t,'dot');
  // Repeated hits refresh, retaining the original damage and tick clock.
  c.status(t,'dot',v(c,'CORROSIVE DURATION',5),previous?.value??v(c,'CORROSIVE DAMAGE',c.skill.points>=9?30:20),{harmful:true,dispel:'basic',damageType:'magical',ignoreStatusResistance:true,interval:v(c,'CORROSIVE INTERVAL',1),data:data(c)});
 };
 const frost=(c:C,t:CombatUnit)=>{
  if(!enemy(c,t)||has(t,'magicImmune')||c.skill.points<3)return;
  const seconds=v(c,'FROST DURATION',3),movement=v(c,'FROST MOVE SLOW',c.skill.points>=9?60:40)/100,attack=-v(c,'FROST ATTACK SLOW',c.skill.points>=9?60:40);
  c.status(t,'slow',seconds,movement,{harmful:true,data:{...data(c),stacking:'strongest',uniqueGroup:'dragonFrost'}});
  c.status(t,'attackSpeed',seconds,attack,{harmful:true,data:{...data(c),stacking:'strongest',uniqueGroup:'dragonFrostAS'}});
 };
 dragon.beforeAttackDamage=c=>{if(!activeDragon(c))return;poison(c,c.target);frost(c,c.target);};
 dragon.onAttack=c=>{
  if(!activeDragon(c)||c.skill.points<2||c.target.ward||c.target.building||c.target.side===c.caster.side)return;
  const splash=v(c,'SPLASH DAMAGE',c.skill.points>=9?100:c.skill.points>=6?75:60)/100,radius=v(c,'SPLASH RADIUS',c.skill.points>=6?350:250)/100;
  for(const t of c.enemies().filter(t=>t.id!==c.target.id&&enemy(c,t)&&distance(t,c.target)<=radius)){
   frost(c,t);c.damage(t,(c.attackDamage??c.baseAttackDamage??c.caster.attack)*splash,'physical',true,{category:'spell',flags:{noAmplification:true,noSpellLifesteal:true,physicalAttackBlock:true}});poison(c,t);
  }
 };
 dragon.implemented=['AA zero attack-range bonus with actual ranged transformation and900projectile speed','Corrosive/frost primary-before-damage and secondary frost/splash/poison ordering;no miss effects','AA timed strong-dispel form,refresh,black MR/free-pathing and independent Fireball'];
 dragon.remaining=['Gaben100percent splash overrides inherited Super15in the retained working interpretation','Illusion on-hit retention after form expiry follows pre7.35d native behavior;exact AA patch and2023splash block date remain pending'];

 const fire=registry[FIRE];fire.pointTarget=true;fire.unitTarget=false;fire.dynamicRange=true;fire.castPoint=.2;
 fire.dynamicBackswing=c=>has(c.caster,'elderDragon')?v(c,'DRAGON BACKSWING',.6):skillBalance(c.definition,c.skill.points)?.backswing??.53;
 // The form belongs to the parent ability, not the child's source identity.
 fire.range=c=>has(c.caster,'elderDragon')?v(c,'DRAGON CAST RANGE',1400)/100:skillBalance(c.definition,c.skill.points)?.range??6;
 fire.cast=c=>{
  const center=c.castPosition??{x:c.target.x,y:c.target.y},interval=v(c,'BURN INTERVAL',.5),linger=v(c,'LINGER',2),burn=v(c,'DAMAGE',75)*interval;
  const apply=(t:CombatUnit)=>{
   if(!enemy(c,t)||has(t,'magicImmune'))return;
   const previous=own(c,t,'fireballBurn');
   const generation=Number(previous?.data?.burnGeneration??(burnSequences.get(c.battle)??0)+1);
   if(!previous)burnSequences.set(c.battle,generation);
   c.status(t,'fireballBurn',linger,1,{harmful:true,dispel:'none',ignoreStatusResistance:true,data:{...data(c),burnGeneration:generation}});
   if(previous)return;
   let until=own(c,t,'fireballBurn')!.until;
   const tick=()=>{
    if(t.dead)return;
    const marker=own(c,t,'fireballBurn');if(marker&&marker.data?.burnGeneration!==generation)return;
    if(marker&&marker.until<c.battle.time-1e-8)return;
    if(marker)until=marker.until;
    if(!marker&&Math.abs(c.battle.time-until)>STEP/2)return;
    c.damage(t,burn,'magical',false,{flags:{damageOverTime:true}});
    if(marker)c.delay(interval,tick);
   };
   tick();
  };
  c.zone({x:center.x,y:center.y,radius:v(c,'RADIUS',350)/100,duration:v(c,'DURATION',8),interval:STEP,immediate:true,includeEnd:true,effect:apply});
 };
 fire.implemented=['Fixed ground cursor and immediate half-second damage stream','Eight-second field,two-second nonstacking same-source linger;independent native resource slot'];
 fire.remaining=['Exact historical different-caster overlapping aura policy needs a dedicated source'];

 const empower=registry[EMPOWER];
 const empowerBuff=(c:C,t:CombatUnit,aura=false)=>{
  const seconds=aura?v(c,'AURA LINGER',.35):v(c,'DURATION')+(!configured(c)&&c.skill.points>=6?10:0),mult=t.id===c.caster.id?1+v(c,'SELF BONUS',75)/100:1;
  const damage=(v(c,'BONUS DAMAGE')+(!configured(c)&&c.skill.points>=6?10:0))/100*mult,cleave=(v(c,'CLEAVE DAMAGE')+(!configured(c)&&c.skill.points>=6?10:0))/100*mult;
  const opts={dispel:'basic' as const,piercesImmunity:true,removeOnDeath:true,data:data(c)};
  c.status(t,'empower',seconds,1,opts);
  c.status(t,'attackPct',seconds,damage,{...opts,data:{...data(c),stacking:'strongest',uniqueGroup:'empowerDamage'}});
  c.status(t,'cleave',seconds,cleave,{...opts,data:{...data(c),stacking:'strongest',uniqueGroup:'empowerCleave',distance:v(c,'CLEAVE DISTANCE',650)/100,startWidth:v(c,'CLEAVE START RADIUS',150)/100,endWidth:v(c,'CLEAVE END RADIUS',c.skill.points>=6?560:360)/100}});
 };
 empower.target='ally';empower.requiresFacing=false;empower.castPoint=0;empower.passive=false;
 empower.targetEligibility=(_c,t)=>body(t)&&!t.building;
 empower.targetSelector=(c,targets)=>targets.filter(t=>t.id!==c.caster.id).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0]??targets.find(t=>t.id===c.caster.id);
 empower.canCast=c=>c.skill.points<9;
 empower.cast=c=>{empowerBuff(c,c.target);if(c.skill.points>=6&&c.target.id!==c.caster.id)empowerBuff(c,c.caster);};
 empower.init=c=>{
  if(c.skill.points<9)return;
  const pulse=()=>{if(!c.caster.dead)for(const t of c.allies().filter(t=>body(t)&&!t.building))empowerBuff(c,t,true);c.delay(v(c,'AURA INTERVAL',.25),pulse);};
  pulse();
 };
 empower.implemented=['AA nearest ally,zero point,75percent larger self bonus and Super self co-cast','Main-based damage and melee cleave with source-specific strongest status group','Captured Gaben global aura:automatic live-source refresh without mana/cooldown casts'];
 empower.remaining=['Captured global aura conflicts with Season2 replacement announcement;live-source/Break lifecycle remains a working historical choice','Super200radius is retained as ending-radius only;exact AA shape and2023block policy remain pending'];

 const totem=registry[TOTEM];totem.target='self';totem.requiresFacing=false;totem.canCast=()=>true;
 totem.castPoint=c=>c.skill.points>=6?0:.6;
 totem.cast=c=>{
  const seconds=v(c,'BUFF DURATION',14);
  c.status(c.caster,'enchantTotem',seconds,v(c,'BONUS'),{dispel:'basic',removeOnDeath:true,data:data(c)});
  c.status(c.caster,'range',seconds,v(c,'BONUS ATTACK RANGE',75)/100,{dispel:'basic',removeOnDeath:true,data:data(c)});
 };
 totem.init=c=>{if(c.skill.points>=9)c.caster.attack+=v(c,'GABEN BASE DAMAGE',60);};
 totem.attackMainDamage=c=>({baseMultiplier:1+(own(c,c.caster,'enchantTotem')?.value??0)/100});
 totem.attackModifier=c=>({baseMultiplier:1+(own(c,c.caster,'enchantTotem')?.value??0)/100});
 totem.onAttack=c=>{c.caster.statuses=statuses(c.caster).filter(s=>!(s.source===c.caster.id&&s.skill===c.skill.id&&(s.data?.ownerInstance===undefined||s.data.ownerInstance===identity(c))&&['enchantTotem','range'].includes(s.kind)));};
 totem.implemented=['Fourteen-second dispellable single-successful-hit main-damage buff and75range','Miss retains buff,recast refreshes and preserves the cast-time rank value','AA active zero-point zero-mana Super,3.5cooldown and Gaben60base damage'];
 totem.remaining=['Captured empty mana array retained as zero;not silently replaced by native mana costs','Projectile reservation and inherited illusion cases remain pending;backswing.38 follows the dated7.27b change'];

 const epic=registry[EPIC];epic.target='self';epic.requiresFacing=false;epic.channel=undefined;
 epic.castPoint=c=>c.skill.points>=9?0:2;
 const pulse=(c:C,radius:number)=>{
  addVisualWorldEffect(c.battle,{source:c.caster.id,skill:c.skill.id,points:c.skill.points,layer:'wave',role:'ground_event',kind:'pulse',x:c.caster.x,y:c.caster.y,radius,until:c.battle.time+20/24});
  for(const t of c.enemies().filter(t=>enemy(c,t)&&distance(t,c.caster)<=radius&&!has(t,'magicImmune'))){
   const amount=v(c,'DAMAGE')+(!configured(c)&&c.skill.points>=6?20:0),mult=c.skill.points>=9&&distance(t,c.caster)<=v(c,'GABEN RADIUS',300)/100?v(c,'GABEN DAMAGE MULTIPLIER',2):1;
   c.damage(t,amount*mult,'magical',false);
   if(!t.dead){c.status(t,'slow',v(c,'SLOW DURATION'),v(c,'MOVEMENT SLOW')/100,{harmful:true,dispel:'strong',data:data(c)});c.status(t,'attackSpeed',v(c,'SLOW DURATION'),-v(c,'ATTACK SLOW'),{harmful:true,dispel:'strong',data:data(c)});}
  }
 };
 epic.canCast=c=>c.enemies().some(t=>enemy(c,t)&&distance(t,c.caster)<=v(c,'RADIUS',400)/100);
 epic.cast=c=>{
  const count=v(c,'PULSES')+(!configured(c)&&c.skill.points>=6?3:0),seconds=v(c,'PULSE DURATION',3),base=v(c,'RADIUS')+(!configured(c)&&c.skill.points>=6?100:0),growth=v(c,'RADIUS INCREASE PER PULSE');
  for(let i=0;i<count;i++)c.delay(seconds*(i+1)/count,()=>pulse(c,(base+i*growth)/100));
 };
 epic.init=c=>{
  if(c.skill.points<6||c.caster.illusion)return;
  let traveled=0;const seen=new WeakSet<object>(),threshold=v(c,'MOVEMENT DISTANCE',700)/100;
  const update=()=>{
   for(const entry of (c.caster.moveHistory??[]) as {time:number;distance:number;kind?:string}[])if(!seen.has(entry)){seen.add(entry);if(!c.caster.dead)traveled+=entry.kind==='warp'?Math.min(entry.distance,threshold):entry.distance;}
   if(!c.caster.dead){const radius=(v(c,'RADIUS')+(!configured(c)?100:0))/100;
    if(c.enemies().some(t=>enemy(c,t)&&distance(t,c.caster)<=radius))while(traveled>=threshold-1e-8){traveled-=threshold;pulse(c,radius);}
   }
   c.delay(STEP,update);
  };
  c.delay(STEP,update);
 };
 epic.implemented=['Three-second released sequence,first pulse after one interval,caster-following and death-persistent','AA strong-dispel damage-before-slow and Gaben close double damage','Historical700movement counter,teleport contribution capped once per warp,waiting for eligible enemy and not disabled by Break'];
 epic.remaining=['AA pulse count maps to native3second duration as an explicit historical candidate','Movement polling adds at most one simulation-tick latency;collision-correction contributions and passive radius AA-versus-native choice remain pending'];

 const flux=registry[FLUX];flux.onCast=undefined;
 flux.init=c=>{
  if(c.skill.points>=6){c.status(c.caster,'range',FOREVER,v(c,'BONUS ATTACK RANGE',300)/100,{passive:true,dispel:'none'});c.status(c.caster,'castRange',FOREVER,v(c,'BONUS CAST RANGE',300)/100,{passive:true,dispel:'none'});}
  if(c.skill.points>=9)c.status(c.caster,'spellAmp',FOREVER,v(c,'MAX SPELL AMPLIFICATION',100)/100,{passive:true,dispel:'none',data:{manaRatioSpellAmp:true}});
 };
 flux.onAbilityExecuted=c=>{if(c.chance?.(v(c,'CHANCE')/100,'essenceFlux')??c.random()<v(c,'CHANCE')/100)c.mana(c.caster,c.caster.maxMana*v(c,'MAX MANA RESTORE')/100);};
 flux.implemented=['Historical PRD after ability execution,including no-oncast subabilities and zero cooldown abilities','AA Super300attack/cast range and exact current-mana Gaben spell amplification without polling lag'];
 flux.remaining=['No inventory item system is claimed;granted child execution eligibility uses an explicit engine working event policy','Native illusion ownership and original AA free-child cast eligibility need separate evidence'];
}
