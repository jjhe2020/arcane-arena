import {ATTRIBUTE_CONFIG,ROLE_CONFIG} from './config';
import type {Role,RoleStats} from './model';
export interface LeveledRoleStats extends RoleStats {level:number;levelAttackSpeed:number;strengthGain:number;agilityGain:number;intelligenceGain:number}
export function heroLevelForRound(round:number):number{
 if(!Number.isSafeInteger(round)||round<1||round>10001)throw Error('英雄等级必须对应有效的正整数回合');
 return round;
}
/** Workbook totals already include level-one attributes. Only later levels
 * add their attribute-derived totals; this is also the planning UI authority. */
export function heroStatsAtLevel(role:Role|RoleStats,round:number):LeveledRoleStats{
 const base=typeof role==='string'?ROLE_CONFIG[role]:role,level=heroLevelForRound(round),steps=level-1;
 const strengthGain=base.strengthGain??0,agilityGain=base.agilityGain??0,intelligenceGain=base.intelligenceGain??0;
 const delta={strength:steps*strengthGain,agility:steps*agilityGain,intelligence:steps*intelligenceGain};
 return{...base,level,strengthGain,agilityGain,intelligenceGain,strength:base.strength+delta.strength,agility:base.agility+delta.agility,intelligence:base.intelligence+delta.intelligence,hp:base.hp+delta.strength*ATTRIBUTE_CONFIG.strengthHp,mana:base.mana+delta.intelligence*ATTRIBUTE_CONFIG.intelligenceMana,attack:base.attack+delta[base.primaryAttribute]*ATTRIBUTE_CONFIG.primaryAttack,armor:base.armor+delta.agility*ATTRIBUTE_CONFIG.agilityArmor,levelAttackSpeed:delta.agility*ATTRIBUTE_CONFIG.agilityAttackSpeed};
}
