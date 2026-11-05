import {ATTRIBUTE_CONFIG,ROLE_CONFIG} from './config';
import type {Role,RoleStats} from './model';
import {getEnchantment} from './hero-enchantments';
export interface LeveledRoleStats extends RoleStats {level:number;levelAttackSpeed:number;strengthGain:number;agilityGain:number;intelligenceGain:number;healthRegen:number;manaRegenBonus:number;attackRangeBonus:number;castRangeBonus:number;skillAreaBonus:number}
export function heroLevelForRound(round:number):number{
 if(!Number.isSafeInteger(round)||round<1||round>10001)throw Error('英雄等级必须对应有效的正整数回合');
 return round;
}
/** Workbook totals already include level-one attributes. Only later levels
 * add their attribute-derived totals; this is also the planning UI authority. */
export function heroStatsAtLevel(role:Role|RoleStats,round:number,enchantmentId?:string):LeveledRoleStats{
 const base=typeof role==='string'?ROLE_CONFIG[role]:role,level=heroLevelForRound(round),steps=level-1;
 const effects=getEnchantment(enchantmentId)?.effects;
 const strengthGain=(base.strengthGain??0)+(effects?.strengthGain??0),agilityGain=(base.agilityGain??0)+(effects?.agilityGain??0),intelligenceGain=(base.intelligenceGain??0)+(effects?.intelligenceGain??0);
 const delta={strength:steps*strengthGain+(effects?.strength??0),agility:steps*agilityGain+(effects?.agility??0),intelligence:steps*intelligenceGain+(effects?.intelligence??0)};
 const attackInterval=base.attackInterval+(effects?.attackInterval??0);
 return {...base,level,strengthGain,agilityGain,intelligenceGain,
  strength:base.strength+delta.strength,agility:base.agility+delta.agility,intelligence:base.intelligence+delta.intelligence,
  hp:base.hp+delta.strength*ATTRIBUTE_CONFIG.strengthHp+(effects?.hp??0),mana:base.mana+delta.intelligence*ATTRIBUTE_CONFIG.intelligenceMana+(effects?.mana??0),
  attack:base.attack+delta[base.primaryAttribute]*ATTRIBUTE_CONFIG.primaryAttack,armor:base.armor+delta.agility*ATTRIBUTE_CONFIG.agilityArmor,levelAttackSpeed:delta.agility*ATTRIBUTE_CONFIG.agilityAttackSpeed,
  attackInterval,attackBackswing:base.attackBackswing===undefined?undefined:Math.max(0,base.attackBackswing+(effects?.attackInterval??0)),range:base.range+(effects?.range??0),moveSpeed:base.moveSpeed+(effects?.moveSpeed??0),
  healthRegen:effects?.healthRegen??0,manaRegenBonus:effects?.manaRegen??0,attackRangeBonus:effects?.range??0,castRangeBonus:effects?.castRange??0,skillAreaBonus:effects?.skillArea??0};
}
