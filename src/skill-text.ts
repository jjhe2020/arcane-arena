import type {SkillDefinition} from './model';

/** Preserve captured translations as evidence; correct known sign conflicts in
 * player-facing text using the authoritative English catalog. */
export function upgradeText(definition:SkillDefinition,tier:'super'|'gaben'):string{
 if(definition.id==='custom_faceless_void_chronosphere'&&tier==='gaben')return '友军可以在时间结界中行动，但移动、攻击和施法速度均大幅降低。';
 return definition[tier];
}
export function originalRules(definition:SkillDefinition):string{
 const text=[definition.descriptionEn,definition.superEn,definition.gabenEn].filter(v=>typeof v==='string'&&v).join('\n\n');
 return text;
}
