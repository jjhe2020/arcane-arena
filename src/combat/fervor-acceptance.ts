import {skillBalance} from '../config';
import {skillValue as value,type SkillProgram} from '../skill-effects';

/** Valve 7.20 moved the new-target boundary to zero and excluded misses.
 * The existing landed-contact hook supplies that qualification. */
export function applyFervorAcceptance(registry:Record<string,SkillProgram>):void {
 const fervor=registry.troll_warlord_fervor;
 fervor.onAttack=c=>{
  const previous=c.caster.statuses.find(s=>s.kind==='fervorCounter'&&s.source===c.caster.id&&s.skill===c.skill.id&&s.until>c.battle.time)?.value??0;
  const stacks=Math.min(value(c,'MAX STACKS'),c.skill.points>=9||c.caster.fervorTarget===c.target.id?previous+1:0);
  c.caster.fervorTarget=c.target.id;c.caster.fervorStacks=stacks;
  c.status(c.caster,'fervorCounter',1e6,stacks,{dispel:'strong'});
  c.status(c.caster,'attackSpeed',1e6,stacks*(value(c,'ATTACK SPEED PER STACK')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?15:0)),{dispel:'strong'});
 };
 fervor.implemented=['Successful landed attacks count; missed and disjointed attacks do not count','Valve7.20 new-target contact starts at zero; repeated-target contact increments up to AA cap','AA Super final speed per stack and Gaben target-switch retention'];
 fervor.remaining=['Break follows the current project policy matching the2025 fix; exact2023 qualification remains source-pending','AA strong-dispel counter/bonus scope and death/reincarnation/redirection combinations require their separate acceptance results'];
}
