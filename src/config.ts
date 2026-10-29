import data from './generated/game-config.json';
import type {Role,RoleStats,SkillDefinition} from './model';

export interface SkillBalance {pointTier:number;castPoint:number;backswing:number;cooldown:number;mana:number;range:number;params:Record<string,number>;program:Record<string,number>}
interface CompiledConfig {schemaVersion:number;hash:string;roles:Record<Role,RoleStats>;economy:{initialHp:number;copiesPerSkill:number;skillPrice:number;rerollPrice:number;ultimateShopLevel:number;matchPoolSize:number;heroArrivalRounds:number[];saleGoldPerPoint:number;upgradeDiscountPerRound:number;incomeBase:number;incomePerRound:number;incomeCap:number;roundDamageBase:number;roundDamageDivisor:number;moveSkillPrice:number};shopLevels:{level:number;activeSlots:number;upgradePrice:number}[];attributes:{strengthHp:number;intelligenceMana:number;agilityAttackSpeed:number;agilityArmor:number;primaryAttack:number};battle:{magicResist:number;bodyRadius:number;basicAttackProjectileSpeed:number;turnRate:number;attackRangeBuffer:number;minimumMoveSpeed:number;maximumMoveSpeed:number};units:Record<string,Record<string,number>>;skills:Record<string,Record<string,SkillBalance>>;nativeSkills:Record<string,Record<string,SkillBalance>>;workingDefaults:Record<string,number>}
interface CompiledConfig {skillMetadata:Record<string,{name:string;nameEn:string;description:string;super:string;gaben:string;passive:boolean;ultimate:boolean;balanceParamLabels:Record<string,string>}>}
interface BattleRules {minimumAttackSpeed:number;maximumAttackSpeed:number;minimumAttackInterval:number;defaultForcedMoveDuration:number;defaultLeapDuration:number;spellLifestealCreepFactor:number}
const config=data as unknown as CompiledConfig;
export const CONFIG_HASH=config.hash;
export const ROLE_CONFIG=config.roles;
export const ECONOMY_CONFIG=config.economy;
export const SHOP_LEVELS=config.shopLevels;
export const ATTRIBUTE_CONFIG=config.attributes;
export const BATTLE_CONFIG=config.battle as typeof config.battle & BattleRules;
export const UNIT_CONFIG=config.units;
export const WORKING_DEFAULTS=config.workingDefaults;
/** Explicit fallback for a displacement whose historical timing is absent.
 * Proven per-skill durations override it. This is a project value, not evidence. */
export function defaultMotionDuration(leap=false):number {const rules=config.battle as typeof config.battle&{defaultForcedMoveDuration?:number;defaultLeapDuration?:number};return (leap?rules.defaultLeapDuration:rules.defaultForcedMoveDuration)??.3;}
export const balanceTier=(points:number):number=>points>=9?9:points>=6?6:points>=3?3:points>=2?2:1;
/** Definitions carry their balance rows so ad-hoc test/program definitions keep
 * their own values. Native child ranks never pass through AA point mapping. */
export function skillBalance(definition:Pick<SkillDefinition,'id'> & Record<string,unknown>,points:number):SkillBalance|undefined {
  const levels=definition.balanceLevels as Record<string,SkillBalance>|undefined;
  if(!levels)return undefined;
  if(typeof definition.balanceInputSignature==='string'&&definition.balanceInputSignature!==JSON.stringify([definition.values,definition.cooldowns,definition.mana]))return undefined;
  const tier=definition.balanceDomain==='native'?Math.max(1,Math.floor(points)):balanceTier(points);
  return levels[String(tier)]??(definition.balanceDomain==='native'?levels[Object.keys(levels).sort((a,b)=>Number(b)-Number(a))[0]]:undefined);
}
export function attachSkillBalance<T extends SkillDefinition>(definition:T,native=false):T {
  const levels=(native?config.nativeSkills:config.skills)[definition.id];
  if(levels){const result:SkillDefinition=definition;result.balanceLevels=levels;result.balanceDomain=native?'native':'aa';result.configHash=CONFIG_HASH;result.balanceInputSignature=JSON.stringify([result.values,result.cooldowns,result.mana]);const info=config.skillMetadata?.[definition.id];if(info)Object.assign(result,info);}
  return definition;
}
export function configuredValue(c:{definition:SkillDefinition;skill:{points:number}},key:string):number|undefined {
  const row=skillBalance(c.definition,c.skill.points),normalized=key.trim().toUpperCase().replace(/:+$/,'');
  if(row&&c.definition.balanceDomain==='native'){if(normalized==='ABILITYCOOLDOWN')return row.cooldown;if(normalized==='ABILITYMANACOST')return row.mana;if(normalized==='ABILITYCASTPOINT')return row.castPoint;if(normalized==='ABILITYCASTRANGE')return row.range*100;}
  return row?.params[normalized];
}
export function balanceNumber(c:{definition:SkillDefinition;skill:{points:number}},key:string,fallback:number):number {
  return skillBalance(c.definition,c.skill.points)?.program[key]??fallback;
}
export function nativeBalance(id:string,level:number):SkillBalance|undefined {
  const levels=config.nativeSkills[id];if(!levels)return undefined;
  return levels[String(Math.max(1,Math.floor(level)))]??levels[Object.keys(levels).sort((a,b)=>Number(b)-Number(a))[0]];
}
