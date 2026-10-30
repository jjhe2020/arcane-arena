import {UNIT_CONFIG} from '../config';
import type {EffectContext as C,EffectStatus,SkillProgram} from '../skill-effects';
import {addVisualWorldEffect} from './visual-state';

const CHAKRA='keeper_of_the_light_chakra_magic',STEP='void_spirit_astral_step',CALL='custom_furion_force_of_nature',JINGU='custom_monkey_king_jingu_mastery';
const GREATER='npc_dota_furion_treant_large',EPS=1e-8;
interface StepCharges {count:number;maximum:number;next:number|null}

/** Existing unit columns are authoritative. Only this legacy native upgrade
 * body uses its native attack-damage range; ordinary AA Treants keep AA damage. */
function rangedTreants(c:C):C {
 return {...c,summon:options=>{
  const units=c.summon(options);
  if(options.nativeTemplateId===GREATER){
   const raw=UNIT_CONFIG[GREATER];
   if(!raw)throw new Error('Greater Treant configuration missing');
   for(const unit of units){unit.attackMin=raw.AttackDamageMin;unit.attackMax=raw.AttackDamageMax;}
  }
  return units;
 }};
}

/** C16 repairs lifecycle protocols without inventing another balance domain. */
export function applyLifecycleSummonAcceptance(registry:Record<string,SkillProgram>):void {
 const chakra=registry[CHAKRA];
 const chakraCast=chakra.cast!;
 chakra.cast=c=>chakraCast({...c,mana:(target,amount)=>{
  const before=target.mana,restored=c.mana(target,amount);
  if(target.mana>before)addVisualWorldEffect(c.battle,{source:c.caster.id,skill:CHAKRA,points:c.visualPoints??c.skill.points,layer:'restore',kind:'proc',x:target.x,y:target.y,followUnit:target.id,until:c.battle.time+16/24});
  return restored;
 }});
 chakra.onCast=undefined;
 chakra.onAllyCast=undefined;
 chakra.onAffectedUnitAbilityExecuted=(c:C,status:EffectStatus)=>{
  const execution=c.executedAbility;
  if(status.kind!=='chakraMagic'||!execution||execution.id===CHAKRA||!execution.procsOnCast||status.until<=c.battle.time+EPS)return;
  // The real modifier already selected this provider/instance. Rebuilding a
  // slot key after death, replacement or theft would lose that lease identity.
  c.reduceCooldowns?.(c.target,Number(status.value??0),{includeUltimates:(status.points??c.skill.points)>=9,excludeAbilityId:CHAKRA,onlyAbilityId:execution.id,includeChargeRecharge:true,includeActiveEffect:false});
 };
 chakra.implemented.push('Existing Chakra modifier routes only its recipient actual executed action,including an already-dead or no-longer-owning original provider');
 chakra.remaining=chakra.remaining.filter(text=>!text.includes('original Chakra caster dies')&&!text.includes('without reduceRecharge'));
 chakra.remaining.push('The15second plural retroactive window remains an explicit AA working prototype;this router repair does not establish its unrecovered original Lua duration/consumption');

 const step=registry[STEP];
 step.reduceRecharge=(c,seconds)=>{
  const state=c.caster[`charges:${STEP}`] as StepCharges|undefined;
  if(!state||state.next===null||seconds<=0)return;
  state.next-=Math.min(seconds,Math.max(0,state.next-c.battle.time));
  // The existing wrapper owns capacity, final rank-specific recharge and its
  // sequential refresh. Calling its existing state gate performs that refresh.
  step.canCast?.(c);
 };
 step.implemented.push('Chakra reduces the current real charge-restoration deadline;excess reduction does not consume a future full cycle');

 const call=registry[CALL],cast=call.cast!,death=call.onUnitDeath;
 call.cast=c=>cast(rangedTreants(c));
 if(death)call.onUnitDeath=c=>death(rangedTreants(c));
 call.implemented.push('The native Greater Treant uses configured102–114per-attack variance in both direct Super and Gaben death-spawn paths;ordinary AA Treant damage is unchanged');

 const jingu=registry[JINGU],init=jingu.init;
 jingu.init=c=>init?.({...c,summon:options=>c.summon({...options,
  // These are AA profession clones,not illusions or native Monkey King bodies.
  // HP,attack and armour were already snapshotted by the established caller.
  ...(options.template?.extraJinguSoldier?{copyAttributes:true}:{})
 })});
 jingu.implemented.push('AA profession soldier clones copy current source attributes without adding their already-snapshotted health,armour or main attack a second time');
 jingu.remaining.push('The current1.2BAT/.36attack point/.84backswing soldier clock remains a working AA candidate;native maximum attack frequency alone does not uniquely determine every profession animation clock');
}
