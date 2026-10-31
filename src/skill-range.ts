import {skillBalance} from './config';
import type {EffectContext,SkillProgram} from './skill-effects';

/** Shared by actual cast eligibility and the inspectable range audit. Native
 * callbacks and explicit state-dependent programs override their public row;
 * all other skills consume the compiled row before a program fallback. */
export function resolveSkillCastRange(program:SkillProgram,context:EffectContext,flatBonus=0,percentageBonus=0){
 const balance=skillBalance(context.definition,context.skill.points);
 const callback=typeof program.range==='function';
 const dynamic=callback&&(context.definition.balanceDomain==='native'||program.dynamicRange===true);
 const baseRange:number=dynamic?(program.range as (c:EffectContext)=>number)(context):balance?.range??(callback?(program.range as (c:EffectContext)=>number)(context):typeof program.range==='number'?program.range:7);
 return {baseRange,range:program.ignoreCastRangeBonuses?baseRange:baseRange*(1+percentageBonus)+flatBonus,source:dynamic?'dynamic' as const:balance?'configured' as const:'program' as const};
}
