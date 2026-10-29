import {skillBalance} from '../config';
import type {CombatUnit,SkillDefinition} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {grantIndependent} from './historical-upgrades';
import {addVisualWorldEffect,updateVisualWorldEffect} from './visual-state';

const STEP=1/30,FOREVER=1_000_000;
const FROST='custom_lich_chain_frost',CHAKRA='keeper_of_the_light_chakra_magic',HAZE='custom_slardar_amplify_damage',FEAR='night_stalker_crippling_fear',CULL='custom_axe_culling_blade',VOID='night_stalker_void';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const has=(u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind);
const owner=(c:C)=>c.attackInstanceKey??c.skill.instanceId??c.skill.id;
const compiled=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const validEnemy=(c:C,t:CombatUnit)=>t.side!==c.caster.side&&!t.dead&&!t.ward&&!t.building&&!has(t,'banished')&&!has(t,'invulnerable');
const visible=(t:CombatUnit)=>!has(t,'invisible')||has(t,'revealed');
const normalHero=(t:CombatUnit)=>!t.summoned&&!t.illusion&&!t.heroClone;

/** Historical child used by AA's passive, free level-four Void. It is not an
 * independently acquired action slot and does not borrow the parent's values. */
export const CONTROL_EXECUTION_CHILD_DEFINITIONS:SkillDefinition[]=[{
 id:VOID,name:'虚空',nameEn:'Void',description:'AA Gaben授予的四级夜间虚空',descriptionEn:'AA passive level-four nighttime Void',tags:[],super:'',gaben:'',icon:'',passive:false,ultimate:false,grantedOnly:true,balanceDomain:'native',
 values:['DAMAGE: 320','DURATION: 4','MOVEMENT SLOW: 50','ATTACK SLOW: 50','MINISTUN: 0.1'],cooldowns:[8],mana:[110],categories:['ABILITY: Unit Target','PIERCES SPELL IMMUNITY: No'],
 historicalSource:{url:'https://github.com/SteamTracking/GameTracking-Dota2/blob/6abdd9d13de2f4330ca748082467b9ff6e6cd928/game/dota/pak01_dir/scripts/npc/npc_abilities.txt',version:'2023-02-10; ordinary ministun supported by 7.22 patch notes'}
}];

/** AA rules win over the historical prototype. Uncertain AA-only duration,
 * qualification and environment branches are identified in the acceptance ledger. */
export function applyControlExecutionAcceptance(registry:Record<string,SkillProgram>):void{
 const frost=registry[FROST];
 frost.spellBlockTiming='program';frost.projectileDisjointable=false;frost.projectileDisjointOnInvisibility=false;
 frost.targetEligibility=(c,t)=>validEnemy(c,t)&&visible(t)&&!has(t,'shadowRealm')&&!has(t,'undetectable');
 frost.cast=c=>{
  if(c.skill.points>=6){
   const duration=v(c,'SPIRE DURATION',15),heroes=v(c,'SPIRE HERO HITS',5),creeps=v(c,'SPIRE CREEP HITS',10);
   const spire=c.summon({name:'冰柱',nativeTemplateId:'npc_dota_lich_ice_spire',visualBody:'spire',count:1,hp:creeps,attack:0,range:0,speed:0,lifetime:duration})[0];
   spire.ward=true;spire.chainFrostSpire=true;spire.attackCapability='none';c.warp(spire,c.target.x+1,c.target.y);
   c.status(spire,'hitCountBody',duration,0,{dispel:'none',data:{heroDamage:creeps/Math.max(1,heroes),basicDamage:1,immuneSpells:true}});
   c.status(spire,'magicImmune',duration,0,{dispel:'none'});c.status(spire,'disarm',duration,0,{dispel:'none'});
   c.zone({x:spire.x,y:spire.y,radius:v(c,'SPIRE RADIUS',750)/100,duration,interval:STEP,immediate:true,effect:t=>{if(!spire.dead)c.status(t,'slow',v(c,'SPIRE AURA LINGER',.5),v(c,'SPIRE SLOW',30)/100,{harmful:true,dispel:'none',ignoreStatusResistance:true,piercesImmunity:false,data:{instanceKey:`${owner(c)}:spire`,stacking:'strongest',uniqueGroup:'iceSpireSlow'}});}});
  }
  const choose=(current:CombatUnit)=>{
   const enemies=c.enemies().filter(t=>t.id!==current.id&&!t.ward&&!t.building&&visible(t)&&distance(t,current)<=v(c,'BOUNCE RANGE')/100);
   const choices=enemies.length?enemies:c.allies().filter(t=>t.id!==current.id&&t.chainFrostSpire&&!t.dead&&distance(t,current)<=v(c,'BOUNCE RANGE')/100);
   return choices.length?choices[Math.floor(c.random()*choices.length)]:undefined;
  };
  const bounce=(target:CombatUnit,index:number,increases:number,origin?:{x:number;y:number})=>{
   c.projectile(target,v(c,index===0?'INITIAL PROJECTILE SPEED':'BOUNCE PROJECTILE SPEED',index===0?1050:850)/100,t=>{
    const blocked=index===0&&!!c.trySpellBlock?.(t);
    if(t.side!==c.caster.side&&!blocked){
     c.status(t,'slow',v(c,'SLOW DURATION'),Math.abs(v(c,'MOVEMENT SLOW'))/100,{harmful:true,piercesImmunity:false});
     c.status(t,'attackSpeed',v(c,'SLOW DURATION'),v(c,'ATTACK SLOW'),{harmful:true,piercesImmunity:false});
     c.damage(t,v(c,'DAMAGE EACH BOUNCE')+(!compiled(c)&&c.skill.points>=6?70:0)+increases*v(c,'INCREMENTAL DAMAGE'),'magical',false);
    }
    if(c.skill.points<9&&index>=v(c,'BOUNCES'))return;
    // Native target choice is made at impact, before the bounce pause. The
    // frozen origin remains the hit location if that unit moves in the pause.
    const next=choose(t),position={x:t.x,y:t.y};
    if(next)c.delay(v(c,'BOUNCE DELAY',.2),()=>{if(!next.dead)bounce(next,index+1,increases+(blocked?0:1),position);});
   },origin);
  };
  bounce(c.target,0,0);
 };
 frost.implemented=['AA jump count excludes the initial hit; increasing magical damage and debuff-before-damage order','1050 first projectile,850 later projectiles,.2second bounce pause; undisjointable released projectiles','Primary-only impact Spell Block; random visible enemy selection before spire fallback','AA Super attack-count spire and Gaben unlimited jumps'];
 frost.remaining=['Pre7.35 Wiki versus modern Wiki disagree about damage increment on a blocked initial hit; older no-increment candidate used','AA spire spawn point is unspecified; existing target-plus100 placement retained','Frost Shield restores one hero-hit on its existing pulses;native pulse deadline and healing-manipulation rules need Shield review'];
 const frostShield=registry.lich_frost_shield,shieldCast=frostShield.cast!;
 frostShield.cast=c=>{
  if(!c.target.chainFrostSpire){shieldCast(c);return;}
  const spire=c.target;
  // Preserve the Shield program's actual authored pulse schedule. Its full
  // historical clock is a separate acceptance task; do not add a second timer.
  shieldCast({...c,delay:(seconds,effect,cancel)=>c.delay(seconds,()=>{
   effect();
   if(!spire.dead&&statuses(spire).some(s=>s.kind==='frostShield'&&s.skill==='lich_frost_shield'&&s.source===c.caster.id)){
    const body=statuses(spire).find(s=>s.kind==='hitCountBody');c.heal(spire,Number(body?.data?.heroDamage??0));
   }
  },cancel)});
 };
 frostShield.implemented.push('Each existing Shield pulse restores one authored hero-hit of health to a Chain Frost Ice Spire');
 frostShield.remaining.push('Ice Spire fixed-health restoration versus amplification/reduction remains unverified;existing ordinary-heal routing is a declared candidate');

 const chakra=registry[CHAKRA];
 const availableReduction=(c:C,t:CombatUnit)=>t.skills.some((s,i)=>s&&s.id!==CHAKRA&&(c.skill.points>=9||!(c.battle.skillUltimates as Record<string,boolean>|undefined)?.[s.id])&&(t.cooldowns[i]??0)>c.battle.time+.001);
 chakra.targetSelector=(c,targets)=>targets.filter(t=>!t.ward&&!t.building).sort((a,b)=>((b.maxMana-b.mana)+(availableReduction(c,b)?500:0))-((a.maxMana-a.mana)+(availableReduction(c,a)?500:0))||a.id.localeCompare(b.id))[0];
 chakra.canCast=c=>c.target.mana<c.target.maxMana||availableReduction(c,c.target);
 chakra.init=c=>{if(c.skill.points>=9)grantIndependent(c,'keeper_of_the_light_blinding_light',3);};
 const reduce=(c:C,t:CombatUnit,seconds:number,onlyAbilityId?:string)=>c.reduceCooldowns?.(t,seconds,{includeUltimates:c.skill.points>=9,excludeAbilityId:CHAKRA,includeChargeRecharge:true,includeActiveEffect:false,...(onlyAbilityId?{onlyAbilityId}:{})});
 chakra.cast=c=>{
  const targets=c.target.id===c.caster.id?[c.caster]:[c.target,c.caster];
  for(const t of targets){
   const seconds=v(c,'COOLDOWN REDUCTION')+(c.skill.points>=6&&t.id!==c.caster.id?v(c,'SUPER ALLY REDUCTION',2):0);
   c.mana(t,v(c,'MANA RESTORE'));if(c.skill.points>=6)c.dispel(t);
   reduce(c,t,seconds);
   c.status(t,'chakraMagic',v(c,'BUFF DURATION',15),seconds,{dispel:'basic',data:{instanceKey:owner(c)}});
  }
 };
 const retroactive=(c:C,t:CombatUnit)=>{
  const id=c.triggerSkillId;if(!id||id===CHAKRA)return;
  const buffs=statuses(t).filter(s=>s.kind==='chakraMagic'&&s.source===c.caster.id&&s.skill===CHAKRA&&s.until>c.battle.time&&s.data?.instanceKey===owner(c));
  if(buffs.length)reduce(c,t,Math.max(...buffs.map(s=>s.value??0)),id);
 };
 chakra.onCast=c=>retroactive(c,c.caster);chakra.onAllyCast=c=>retroactive(c,c.target);
 chakra.implemented=['AA ally targeting applies restoration,dispel and reductions to both ally and caster','Existing basic cooldowns and explicitly supported recharging charge spells;Gaben also includes ultimates','AA retroactive window affects the newly cast ability only;Chakra never reduces its own cooldown'];
 chakra.remaining=['AA retroactive seconds and consumption count unspecified: editable15second multi-cast working window uses the old native prototype without claiming exact AA Lua','Retroactive routing after the original Chakra caster dies is not established','Charge implementations without reduceRecharge hooks remain outside the verified recharge set'];
 const blinding=registry.keeper_of_the_light_blinding_light;
 blinding.pointTarget=true;
 blinding.cast=c=>{
  const center=c.castPosition??{x:c.target.x,y:c.target.y};
  for(const target of c.enemies().filter(t=>validEnemy(c,t)&&!has(t,'magicImmune')&&distance(t,center)<=v(c,'radius',600)/100)){
   const dx=target.x-center.x,dy=target.y-center.y,length=Math.hypot(dx,dy),seconds=v(c,'knockback_duration',.6),reach=v(c,'knockback_distance',400)/100;
   // A zero-distance direction is unspecified by the captured prototype. Keep
   // the existing zero-vector policy rather than inventing a random direction.
   if(length>1e-8)c.moveContinuous(target,target.x+dx/length*reach,target.y+dy/length*reach,{duration:seconds,lockActions:false});
   c.status(target,'blind',v(c,'duration',4),v(c,'miss_rate',40)/100,{harmful:true});
   c.damage(target,v(c,'damage',180),'magical',false);
  }
 };
 blinding.implemented=['Historical600radius/180damage/40percent blind and non-disabling400distance/.6second continuous knockback','Knockback is requested before blind and damage;an existing channel is retained'];
 blinding.remaining=['Exact zero-distance push direction is not recovered;existing zero-vector policy retained','Crossing terrain obstacles while retaining Arena restrictions needs a distinct terrain-only motion exception'];

 const haze=registry[HAZE],hazeTrails=new WeakMap<C['battle'],Set<string>>();
 haze.cast=c=>{
  const targets=c.skill.points>=9?c.enemies().filter(t=>distance(t,c.target)<=v(c,'GABEN RADIUS',350)/100):[c.target];
  for(const t of targets.filter(t=>validEnemy(c,t))){
   const permanent=c.skill.points>=6,duration=permanent?FOREVER:v(c,'DURATION'),data={instanceKey:owner(c)},options={harmful:true,piercesImmunity:true,dispel:permanent?'none' as const:'basic' as const,data,...(permanent?{maxStacks:Number.MAX_SAFE_INTEGER}:{})};
   c.status(t,'armor',duration,v(c,'ARMOR REDUCTION'),options);
   c.status(t,'revealed',duration,0,{harmful:true,piercesImmunity:true,dispel:permanent?'none':'basic',ignoreStatusResistance:true,data});
   let controllers=hazeTrails.get(c.battle);if(!controllers){controllers=new Set();hazeTrails.set(c.battle,controllers);}
   const trailKey=`${c.caster.id}:${owner(c)}:${t.id}`;if(controllers.has(trailKey))continue;controllers.add(trailKey);
   // Water is represented as authored spatial metadata only. No river or
   // modern Slardar innate bonuses are invented in this flat-arena model.
   let pool=addVisualWorldEffect(c.battle,{source:c.caster.id,skill:HAZE,points:c.skill.points,layer:'watertrail',kind:'pulse',x:t.x,y:t.y,radius:v(c,'PUDDLE RADIUS',100)/100,until:c.battle.time+v(c,'PUDDLE DURATION',8),loop:true});
   const trail=()=>{
    if(t.dead||!statuses(t).some(s=>s.kind==='armor'&&s.skill===HAZE&&s.source===c.caster.id&&s.data?.instanceKey===owner(c))){controllers!.delete(trailKey);return;}
    if(distance(pool,t)>v(c,'PUDDLE SPACING',50)/100)pool=addVisualWorldEffect(c.battle,{source:c.caster.id,skill:HAZE,points:c.skill.points,layer:'watertrail',kind:'pulse',x:t.x,y:t.y,radius:v(c,'PUDDLE RADIUS',100)/100,until:c.battle.time+v(c,'PUDDLE DURATION',8),loop:true});
    else updateVisualWorldEffect(c.battle,pool,{until:c.battle.time+v(c,'PUDDLE DURATION',8)});
    c.delay(Math.max(STEP,v(c,'PUDDLE INTERVAL',.5)),trail);
   };c.delay(Math.max(STEP,v(c,'PUDDLE INTERVAL',.5)),trail);
  }
 };
 haze.implemented=['Armor reduction and True Sight reveal,including spell-immune targets','AA permanent undispellable uncapped Super stacks;Gaben applies within350ofprimary target','Eight-second independently leased water-trail metadata without inventing river bonuses'];
 haze.remaining=['Water-dependent interactions are outside the current flat-arena environment;visual metadata does not certify those rules'];

 registry[VOID]={target:'enemy',range:5.25,castPoint:.3,cooldown:()=>8,manaCost:()=>110,cast:c=>{
  if(!validEnemy(c,c.target)||has(c.target,'magicImmune'))return;
  c.status(c.target,'slow',v(c,'DURATION',4),v(c,'MOVEMENT SLOW',50)/100,{harmful:true});
  c.status(c.target,'attackSpeed',v(c,'DURATION',4),-Math.abs(v(c,'ATTACK SLOW',50)),{harmful:true});
  c.damage(c.target,v(c,'DAMAGE',320),'magical',false);
  c.status(c.target,'stun',v(c,'MINISTUN',.1),0,{harmful:true,dispel:'strong'});
 },implemented:['Historical nighttime level-four slow,damage and ordinary.1second ministun in that order'],remaining:[]};
 const fear=registry[FEAR];
 fear.cast=c=>c.zone({follow:true,radius:v(c,'AURA RADIUS')/100+(!compiled(c)&&c.skill.points>=6?.5:0),duration:v(c,'NIGHT DURATION'),interval:v(c,'AURA INTERVAL',STEP),immediate:true,effect:t=>{
  if(!validEnemy(c,t))return;
  const options={harmful:true,dispel:'strong' as const,piercesImmunity:false,ignoreStatusResistance:true};
  c.status(t,'silence',v(c,'AURA LINGER',.5),0,options);
  if(c.skill.points>=6)c.status(t,'blind',v(c,'AURA LINGER',.5),v(c,'SUPER BLIND',50)/100,options);
 }});
 fear.init=c=>{
  if(c.skill.points<9)return;
  const pulse=()=>{if(c.caster.dead)return;for(const t of c.enemies().filter(t=>validEnemy(c,t)&&distance(t,c.caster)<=v(c,'GABEN RADIUS',550)/100))c.castAbility(VOID,4,t);c.delay(v(c,'GABEN INTERVAL',4),pulse);};
  c.delay(v(c,'GABEN INTERVAL',4),pulse);
 };
 fear.implemented=['AA always-night durations and.1second cast point;following aura applies immediately and lingers.5seconds','AA Super blind/radius/cooldown;pre7.20 blind prototype without modern post7.34 damage','Gaben free level-four nighttime Void every4seconds with native child damage attribution'];
 fear.remaining=['AA passive Void Break/silence/source-death clock restart policy is not specified;current timer stops permanently at owner death'];

 const cull=registry[CULL];
 const threshold=(c:C)=>v(c,'KILL THRESHOLD')+(!compiled(c)&&c.skill.points>=6?150:0);
 cull.canCast=c=>validEnemy(c,c.target)&&c.target.hp<=threshold(c);
 cull.range=c=>(v(c,'CAST RANGE',225)+(c.skill.points>=6&&!compiled(c)?200:0))/100;
 cull.init=c=>c.status(c.caster,'armor',FOREVER,Number((c.caster.skillState as Record<string,number>|undefined)?.[`${CULL}:armor`]??0),{dispel:'none'});
 cull.cast=c=>{
  const target=c.target;if(!validEnemy(c,target))return;
  if(target.hp<=threshold(c))c.execute(target);else c.damage(target,threshold(c),'pure',true);
  if(!target.dead||!normalHero(target))return;
  const gain=v(c,'ARMOR PER KILL')+(!compiled(c)&&c.skill.points>=6?1:0),key=`${CULL}:armor`,state=(c.caster.skillState??{}) as Record<string,number>,gains=(c.caster.permanentSkillGains??{}) as Record<string,number>;
  state[key]=(state[key]??0)+gain;gains[key]=(gains[key]??0)+gain;c.caster.skillState=state;c.caster.permanentSkillGains=gains;
  c.status(c.caster,'armor',FOREVER,state[key],{dispel:'none'});c.resetCooldown?.();
  for(const ally of c.allies()){
   if(distance(ally,c.caster)<=v(c,'KILL SPEED RADIUS')/100){c.status(ally,'haste',v(c,'KILL SPEED DURATION'),v(c,'KILL MOVE SPEED BONUS')/100);c.status(ally,'attackSpeed',v(c,'KILL SPEED DURATION'),v(c,'KILL ATTACK SPEED BONUS'));}
   if(c.skill.points>=9)c.status(ally,'physicalImmune',v(c,'GABEN IMMUNITY DURATION',2));
  }
 };
 cull.implemented=['AA225base/425Super range and final threshold;release-time threshold test with above-threshold pure-damage fallback','Successful actual hero kill resets cooldown,grants persistent per-skill armor and six-second nearby speed buffs','AA Gaben grants two-second physical immunity to all living allies;no unrelated ethereal or magical immunity'];
 cull.remaining=['2023 illusion/clone kill qualification differs between cooldown,speed and permanent armor;existing real-hero-only working policy retained until exact historical evidence','AA threshold-versus-damage wording does not supply a separate above-threshold damage amount;native7.31 unified amount used'];
}
