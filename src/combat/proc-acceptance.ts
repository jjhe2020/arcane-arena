import {GLOBAL_BATTLE_CONFIG} from '../global-config';
import {skillBalance} from '../config';
import {addVisualWorldEffect} from './visual-state';
import type {CombatUnit} from '../model';
import {skillValue as value,type EffectContext,type EffectStatus,type SkillProgram} from '../skill-effects';

const STEP=1/30,FOREVER=GLOBAL_BATTLE_CONFIG.timeLimit;
const SPEAR='custom_huskar_burning_spear',CHAOS='custom_chaos_knight_chaos_strike',HELIX='custom_axe_counter_helix',COUP='custom_phantom_assassin_coup_de_grace',CURSE='custom_abaddon_curse_of_avernus';
const has=(u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind);
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const enemy=(c:EffectContext,t:CombatUnit,buildings=false)=>t.side!==c.caster.side&&!t.ward&&(buildings||!t.building)&&!t.dead&&!has(t,'invulnerable')&&!has(t,'banished');
const key=(c:EffectContext)=>c.attackInstanceKey??c.skill.instanceId??c.skill.id;
const owns=(c:EffectContext,s:EffectStatus)=>s.source===c.caster.id&&s.skill===c.skill.id&&(!s.data?.ownerInstance||s.data.ownerInstance===key(c));
const compiled=(c:EffectContext)=>!!skillBalance(c.definition,c.skill.points);
const hero=(u:CombatUnit)=>!u.summoned||!!u.illusion||!!u.consideredHero;
interface SpearSnapshot {duration:number;damage:number;pure:boolean;spread:number}

/** Final AA-first programs. Historical candidate choices and uncovered branches
 * are listed individually in references/dota-wiki/acceptance/proc-acceptance.json. */
export function applyProcAcceptance(registry:Record<string,SkillProgram>):void {
 const spear=registry[SPEAR];
 spear.onAttack=undefined;
 spear.onAttackPoint=c=>{
  if(!c.attackRecord||!enemy(c,c.target)||c.caster.illusion||has(c.caster,'silence')||(has(c.target,'magicImmune')&&c.skill.points<9))return;
  c.caster.hp=Math.max(1,c.caster.hp*(1-value(c,'CURRENT HEALTH COST')/100));
  c.attackRecord.data[key(c)]={duration:value(c,'DURATION'),damage:value(c,'BURN DAMAGE PER SECOND'),pure:c.skill.points>=9,spread:c.skill.points>=6?value(c,'SUPER RADIUS',400)/100:0} satisfies SpearSnapshot;
 };
 spear.beforeAttackDamage=c=>{
  const snapshot=c.attackRecord?.data[key(c)] as SpearSnapshot|undefined;if(!snapshot)return;
  const targets=[c.target,...(snapshot.spread>0?c.enemies().filter(t=>t.id!==c.target.id&&distance(t,c.caster)<=snapshot.spread):[])];
  for(const t of targets.filter(t=>enemy(c,t)))c.status(t,'dot',snapshot.duration,snapshot.damage,{harmful:true,dispel:'strong',ignoreStatusResistance:true,damageType:snapshot.pure?'pure':'magical',piercesImmunity:snapshot.pure,interval:value(c,'BURN INTERVAL',1),maxStacks:value(c,'MAX STACKS',0)>0?value(c,'MAX STACKS'):Number.MAX_SAFE_INTEGER,data:{ownerInstance:key(c),instanceKey:key(c)}});
 };
 spear.passive=false;
 spear.implemented=['AA independent eight-second damage stacks,first tick after one second,strong dispel only','Attack-point nonlethal health setting and record-local projectile eligibility;silence/illusion/ward/building exclusions','AA attacker-centered Super spread costs health once;Gaben pure damage pierces spell immunity'];
 spear.remaining=['Exact AA Super sampling center on impact versus attack point is not recovered;existing impact-center policy retained','Damage-level changes within an existing source counter need historical comparison;current battle-edit isolation does not exercise livelevel changes'];

 const chaos=registry[CHAOS];chaos.attackModifier=undefined;chaos.onAttack=undefined;
 chaos.criticalAttack=c=>{
  if(!enemy(c,c.target))return;
  const factor=hero(c.target)?1:value(c,'CREEP DAMAGE MULTIPLIER',1.5);
  return{chance:(value(c,'CHANCE')+(!compiled(c)&&c.skill.points>=6?10:0))/100,multiplier:value(c,'CRITICAL MAX')/100*factor,minMultiplier:value(c,'CRITICAL MIN')/100*factor,maxMultiplier:value(c,'CRITICAL MAX')/100*factor,lifesteal:(value(c,'CRITICAL LIFESTEAL')+(!compiled(c)&&c.skill.points>=6?20:0))/100,prdKey:'critical'};
 };
 chaos.init=c=>{
  if(c.skill.points<9)return;
  const pulse=()=>{if(c.caster.dead)return;for(const ally of c.allies().filter(t=>t.id!==c.caster.id&&!t.ward&&!t.building&&!has(t,'invulnerable')&&!has(t,'banished')&&distance(t,c.caster)<=value(c,'AURA RADIUS',10000)/100))c.status(ally,'variableCrit',value(c,'AURA LINGER',.25),(value(c,'CHANCE')+(!compiled(c)?10:0))/200,{dispel:'none',data:{min:value(c,'CRITICAL MIN')/100,max:value(c,'CRITICAL MAX')/100,lifesteal:(value(c,'CRITICAL LIFESTEAL')+(!compiled(c)?20:0))/100,creepMultiplier:value(c,'CREEP DAMAGE MULTIPLIER',1.5),excludeBuildingsAndWards:true,prdKey:'critical',ownerInstance:key(c),instanceKey:key(c),stacking:'strongest',uniqueGroup:'chaosStrikeAura',suppressWithSourceBreak:true}});};
  pulse();c.zone({follow:true,radius:.01,duration:FOREVER,interval:.1,targets:'all',effect:t=>{if(t.id===c.caster.id)pulse();}});
 };
 chaos.implemented=['Attack-point PRD variable critical with selected-critical-only lifesteal and native target restrictions','AA final chance/lifesteal values;historical ordinary-creep damage multiplier','Gaben ally aura retains half proc chance,source ownership and source-Break suppression'];
 chaos.remaining=['AA aura range/linger not supplied;existing global-arena/.25second working values retained','Exact native ordering of variable critical versus another variable/fixed provider remains a shared-engine comparison boundary'];

 const helix=registry[HELIX];
 const spin=(c:EffectContext,outgoing=false)=>{
  if(c.caster.illusion||!enemy(c,c.target,true)||(!outgoing&&(c.target.ward||c.target.building)))return;
  const state=c.caster as CombatUnit&Record<string,unknown>,clock=`helix:${key(c)}:${outgoing?'outgoing':'incoming'}`;
  if(Number(state[clock]??0)>c.battle.time+1e-8)return;
  const chance=(value(c,'CHANCE TO HELIX')+(!compiled(c)&&c.skill.points>=9?10:0))/100;
  if(!(c.chance?.(chance,'helix')??c.random()<chance))return;
  state[clock]=c.battle.time+value(c,outgoing?'OFFENSIVE COOLDOWN':'DEFENSIVE COOLDOWN',.3);
  addVisualWorldEffect(c.battle,{source:c.caster.id,skill:c.skill.id,points:c.skill.points,layer:'helix',x:c.caster.x,y:c.caster.y,until:c.battle.time+16/24,kind:'proc',loop:false});
  const damage=value(c,'DAMAGE')+(!compiled(c)&&c.skill.points>=6?120:0);
  for(const t of c.enemies().filter(t=>enemy(c,t)&&distance(t,c.caster)<=value(c,'RADIUS')/100)){
   c.damage(t,damage,'pure',true);
   if(c.skill.points>=9&&!t.dead){const old=statuses(t).find(s=>s.kind==='helixStacks'&&owns(c,s)),count=Math.min(value(c,'MAX DEBUFF STACKS',6),(old?.value??0)+1),duration=value(c,'DEBUFF DURATION',6),data={ownerInstance:key(c),instanceKey:key(c),targetId:c.caster.id};
    c.status(t,'helixStacks',duration,count,{harmful:true,data});c.status(t,'outgoingDamageReduction',duration,count*value(c,'DAMAGE REDUCTION PER STACK',15)/100,{harmful:true,data});
   }
  }
 };
 helix.onAttacked=c=>spin(c);helix.onAttack=c=>{if(c.skill.points>=6)spin(c,true);};
 helix.implemented=['Landed attack events,not attack start;AA independent incoming/outgoing .3second proc clocks','PRD pure area damage with AA radius and final upgrades','Six-second source-specific Gaben stack group refresh and six-stack cap'];
 helix.remaining=['AA Gaben says damage;nativeShard reduces attack damage only.Current AA all-damage-to-owner interpretation is retained pending originalLua','Shared versus independent native PRD failure streams for the removed outgoing-attack upgrade is not recovered','Gaben debuff dispel class is retained from existing implementation and still needs exact historical evidence'];

 const coup=registry[COUP],init=coup.init;coup.attackModifier=undefined;
 coup.criticalAttack=c=>enemy(c,c.target)?{chance:value(c,'CRITICAL CHANCE')/100,multiplier:value(c,'CRITICAL DAMAGE')/100,prdKey:'critical'}:undefined;
 coup.init=c=>init?.(c);
 coup.onAttack=c=>{if(c.skill.points>=9&&c.attackCritical)c.castAbility('phantom_assassin_fan_of_knives',1,c.caster);};
 coup.implemented=['Pre7.34 direct critical rather than DeadlyFocus;attack-begin PRD snapshot and native target restrictions','AA+7percent chance and independently granted historicalFanOfKnives','AA literal every successful critical triggers a freeFan including another critical provider'];
 coup.remaining=['AA EveryCrit interpretation includes other critical sources;original modifiedLua has not been recovered'];
 const fan=registry.phantom_assassin_fan_of_knives;
 fan.canCast=c=>c.enemies().some(t=>enemy(c,t)&&distance(t,c.caster)<=value(c,'radius',550)/100);
 fan.cast=c=>{
  const center={x:c.caster.x,y:c.caster.y},started=c.battle.time,radius=value(c,'radius',550)/100,speed=value(c,'projectile_speed',1000)/100,seen=new Set<string>();
  c.zone({x:center.x,y:center.y,radius,duration:Math.ceil(radius/Math.max(.001,speed)/STEP)*STEP,interval:STEP,includeEnd:true,immediate:true,effect:t=>{
   if(seen.has(t.id)||!enemy(c,t)||distance(t,center)>Math.min(radius,Math.max(0,(c.battle.time-started)*speed))+1e-8)return;
   seen.add(t.id);c.status(t,'break',value(c,'duration',3),0,{harmful:true,piercesImmunity:true});c.damage(t,t.maxHp*value(c,'pct_health_damage_initial',16)/100,'pure',true);
  }});
 };
 fan.implemented=['Fixed-center expanding filled pulse at1000speed,hitting each eligible enemy once','Historical16percent maxHP pure damage with break applied first;spell immunity pierced'];fan.remaining=['Historical candidate child resource/cast clocks are tested separately from freeAA critical-triggered casts'];

 const curse=registry[CURSE];curse.onAttack=undefined;
 curse.beforeAttackDamage=c=>{
  if(!enemy(c,c.target,true)||has(c.target,'magicImmune'))return;
  const target=c.target,full=statuses(target).find(s=>s.kind==='avernusCurse'&&owns(c,s));
  if(full&&c.skill.points<9)return;
  const data={ownerInstance:key(c),instanceKey:key(c)},old=statuses(target).find(s=>s.kind==='avernusHits'&&owns(c,s)),count=(old?.value??0)+1;
  const slowData={...data,instanceKey:`${key(c)}:avernusBaseSlow`,stacking:'strongest',uniqueGroup:'avernusSlow'};
  c.status(target,'avernusHits',value(c,'BASIC DURATION'),count,{harmful:true,ignoreStatusResistance:true,data});
  c.status(target,'slow',value(c,'BASIC DURATION'),value(c,'BASIC SLOW')/100,{harmful:true,ignoreStatusResistance:true,data:slowData});
  if(count<value(c,'ATTACKS REQUIRED',c.skill.points>=6?3:4))return;
  target.statuses=target.statuses.filter(s=>!owns(c,s as EffectStatus)||!['avernusHits'].includes(s.kind));
  const seconds=value(c,'CURSE DURATION'),slow=(value(c,'CURSE SLOW')+(!compiled(c)&&c.skill.points>=6?50:0))/100;
  c.status(target,'avernusCurse',seconds,value(c,'CURSE ATTACK SPEED'),{harmful:true,data});c.status(target,'silence',seconds,0,{harmful:true,data});
  c.status(target,'slow',seconds,slow,{harmful:true,data:{...data,instanceKey:`${key(c)}:avernusCurseSlow`,stacking:'strongest',uniqueGroup:'avernusSlow'}});
  target.statuses=target.statuses.filter(s=>!(owns(c,s as EffectStatus)&&s.kind==='slow'&&(s as EffectStatus).data?.instanceKey===`${key(c)}:avernusBaseSlow`));
 };
 curse.implemented=['Successful-hit counter and debuffs before attack damage;separate base/full slow identities select strongest rather than overwrite/add','AA three-hit Super and final slow;Gaben continues stacking while curse is active','Source-specific basic-dispellable curse/silence counters and repeated full refresh'];
 curse.remaining=['AA Super slow uses the existing fifty-percentage-point interpretation;originalLua not recovered','Multiple independent Curse owners sharing native attack-speed/debuff groups still need comparison'];
}
