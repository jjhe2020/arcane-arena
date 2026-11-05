import type {Role} from './model';

export const ENCHANTMENT_GRADES = ['D', 'C', 'B', 'A', 'S'] as const;
export type EnchantmentGrade = (typeof ENCHANTMENT_GRADES)[number];
export const ENCHANTMENT_REDRAW_PRICE = 2;

export const ENCHANTMENT_STATS = {
  strength: {grade: 'D', label: '基础力量', coefficient: 1, sign: 1},
  agility: {grade: 'D', label: '基础敏捷', coefficient: 1, sign: 1},
  intelligence: {grade: 'D', label: '基础智力', coefficient: 1, sign: 1},
  hp: {grade: 'C', label: '基础生命上限', coefficient: 12, sign: 1},
  mana: {grade: 'C', label: '基础魔法上限', coefficient: 7, sign: 1},
  healthRegen: {grade: 'C', label: '生命恢复/秒', coefficient: .4, sign: 1},
  manaRegen: {grade: 'C', label: '魔法恢复/秒', coefficient: .1, sign: 1},
  strengthGain: {grade: 'B', label: '力量成长', coefficient: .1, sign: 1},
  agilityGain: {grade: 'B', label: '敏捷成长', coefficient: .1, sign: 1},
  intelligenceGain: {grade: 'B', label: '智力成长', coefficient: .1, sign: 1},
  attackInterval: {grade: 'A', label: '基础攻击间隔', coefficient: .01, sign: -1},
  moveSpeed: {grade: 'A', label: '移动速度', coefficient: .03, sign: 1},
  range: {grade: 'S', label: '攻击射程', coefficient: .04, sign: 1},
  castRange: {grade: 'S', label: '施法距离', coefficient: .05, sign: 1},
  skillArea: {grade: 'S', label: '技能作用范围', coefficient: .01, sign: 1},
} as const;

type EnchantmentStat = keyof typeof ENCHANTMENT_STATS;
type EnchantmentEffects = Partial<Record<EnchantmentStat, number>>;
interface Enchantment {id: string; name: string; grade: EnchantmentGrade; effects: EnchantmentEffects}
export interface EnchantmentChoice {mode: 'arrival' | 'redraw'; options: string[]}

export const ENCHANTMENTS: readonly Enchantment[] = [
  {id: 'granite', name: '花岗石', grade: 'D', effects: {strength: 13, agility: -2}},
  {id: 'swallow', name: '飞燕', grade: 'D', effects: {agility: 15, intelligence: -3}},
  {id: 'quill', name: '羽笔', grade: 'D', effects: {intelligence: 14, strength: -3}},
  {id: 'oak', name: '坚橡', grade: 'D', effects: {strength: 8, agility: 7}},
  {id: 'silverleaf', name: '银叶', grade: 'D', effects: {agility: 8, intelligence: 7}},
  {id: 'ember', name: '余烬', grade: 'D', effects: {intelligence: 8, strength: 7}},
  {id: 'bulwark', name: '壁垒', grade: 'C', effects: {hp: 200, agility: -2}},
  {id: 'reservoir', name: '秘泉', grade: 'C', effects: {mana: 105, strength: -3}},
  {id: 'spring', name: '春生', grade: 'C', effects: {healthRegen: 6, intelligence: -2}},
  {id: 'incense', name: '静香', grade: 'C', effects: {manaRegen: 1.5, agility: -3}},
  {id: 'tide', name: '蓄潮', grade: 'C', effects: {hp: 120, mana: 28, intelligence: -2}},
  {id: 'dew', name: '晨露', grade: 'C', effects: {healthRegen: 3.2, mana: 42}},
  {id: 'ironroot', name: '铁根', grade: 'B', effects: {strengthGain: .8, strength: 4}},
  {id: 'feather', name: '轻羽', grade: 'B', effects: {agilityGain: .9, hp: 84, strength: -3}},
  {id: 'starwell', name: '星井', grade: 'B', effects: {intelligenceGain: .8, mana: 42, agility: -2}},
  {id: 'briar', name: '棘生', grade: 'B', effects: {strengthGain: .5, agilityGain: .6, mana: 14}},
  {id: 'crescent', name: '弦月', grade: 'B', effects: {agilityGain: .6, intelligenceGain: .6, hp: -12}},
  {id: 'aurora', name: '极光', grade: 'B', effects: {intelligenceGain: .7, strengthGain: .4, intelligence: 3}},
  {id: 'anchor', name: '铁锚', grade: 'A', effects: {attackInterval: -.14, moveSpeed: -.09, agility: 2}},
  {id: 'windstep', name: '踏风', grade: 'A', effects: {moveSpeed: .45, hp: -24}},
  {id: 'quickblade', name: '疾刃', grade: 'A', effects: {attackInterval: -.1, agility: 4, mana: -14}},
  {id: 'swiftcurrent', name: '迅流', grade: 'A', effects: {moveSpeed: .27, manaRegen: .5}},
  {id: 'warbeat', name: '战鼓', grade: 'A', effects: {attackInterval: -.08, strengthGain: .5}},
  {id: 'gale', name: '劲风', grade: 'A', effects: {attackInterval: -.11, moveSpeed: .09, hp: -24}},
  {id: 'eagle-eye', name: '鹰眼', grade: 'S', effects: {range: .56, agility: -2}},
  {id: 'starlight', name: '星芒', grade: 'S', effects: {castRange: .7, intelligence: 2}},
  {id: 'resonance', name: '共鸣', grade: 'S', effects: {skillArea: .14, manaRegen: -.2}},
  {id: 'horizon', name: '地平线', grade: 'S', effects: {range: .32, castRange: .3, strength: -2}},
  {id: 'echo', name: '回响', grade: 'S', effects: {skillArea: .09, mana: 35, intelligence: -1}},
  {id: 'farspark', name: '远火', grade: 'S', effects: {castRange: .4, attackInterval: -.04}},
];

const byId = new Map(ENCHANTMENTS.map(enchantment => [enchantment.id, enchantment]));
const byGrade = new Map(ENCHANTMENT_GRADES.map(grade => [grade, ENCHANTMENTS.filter(enchantment => enchantment.grade === grade)]));
export const getEnchantment = (id: unknown) => typeof id === 'string' ? byId.get(id) : undefined;
export const enchantmentEntries = (effects: EnchantmentEffects) => Object.entries(effects) as [EnchantmentStat, number][];
export const enchantmentCoefficient = (stat: EnchantmentStat, amount: number) => amount * ENCHANTMENT_STATS[stat].sign / ENCHANTMENT_STATS[stat].coefficient;

/** Effect geometry grows independently of travel distances, targeting searches, and summon placement. */
export function enlargedSkillArea(caster: {skillAreaBonus?: number} | undefined, key: string, size: number): number {
  if (!caster?.skillAreaBonus || size <= 0) return size;
  const field = key.toUpperCase().replace(/[:_]/g, ' ').trim();
  const geometry = /\b(RADIUS|WIDTH|AOE)\b|AREA HALF HEIGHT/.test(field);
  const placement = /\b(AI|SEARCH|SPAWN|VISION|SIGHT|ORBIT|TREE|RETARGET)\b/.test(field);
  return geometry && !placement ? size * (1 + caster.skillAreaBonus) : size;
}

function takeRandom<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)];
}

export function arrivalEnchantments(random: () => number): EnchantmentChoice {
  const grades = [...ENCHANTMENT_GRADES];
  const options = Array.from({length: 3}, () => {
    const grade = grades.splice(Math.floor(random() * grades.length), 1)[0];
    return takeRandom(byGrade.get(grade)!, random).id;
  });
  return {mode: 'arrival', options};
}

export function redrawEnchantments(currentId: string, random: () => number): EnchantmentChoice {
  const excluded = new Set([currentId]);
  const options = Array.from({length: 4}, () => {
    const grade = takeRandom(ENCHANTMENT_GRADES, random);
    const chosen = takeRandom(byGrade.get(grade)!.filter(enchantment => !excluded.has(enchantment.id)), random).id;
    excluded.add(chosen);
    return chosen;
  });
  return {mode: 'redraw', options};
}

const preferences: Record<Role, Partial<Record<EnchantmentStat, number>>> = {
  tank: {strength: 1.4, strengthGain: 1.6, hp: 1.6, healthRegen: 1.4},
  archer: {agility: 1.4, agilityGain: 1.5, range: 1.6, attackInterval: 1.5},
  assassin: {agility: 1.4, agilityGain: 1.5, moveSpeed: 1.5, attackInterval: 1.4},
  mage: {intelligence: 1.4, intelligenceGain: 1.5, manaRegen: 1.4, castRange: 1.5, skillArea: 1.5},
};
export function chooseAiEnchantment(role: Role, choice: EnchantmentChoice): string {
  const score = (id: string) => enchantmentEntries(byId.get(id)!.effects).reduce((sum, [stat, amount]) => sum + enchantmentCoefficient(stat, amount) * (preferences[role][stat] ?? 1), 0);
  return choice.options.reduce((best, id) => score(id) > score(best) ? id : best);
}

export function validEnchantmentState(hero: {enchantmentId?: unknown; enchantmentChoice?: unknown}, allowChoice: boolean): boolean {
  const current = getEnchantment(hero.enchantmentId);
  if (hero.enchantmentId !== undefined && !current) return false;
  if (hero.enchantmentChoice === undefined) return true;
  if (!current || !allowChoice || !hero.enchantmentChoice || typeof hero.enchantmentChoice !== 'object') return false;
  const {mode, options} = hero.enchantmentChoice as Partial<EnchantmentChoice>;
  if (!Array.isArray(options) || new Set(options).size !== options.length || options.some(id => !getEnchantment(id))) return false;
  if (mode === 'redraw') return options.length === 4 && !options.includes(current.id);
  return mode === 'arrival' && options.length === 3 && options.includes(current.id) && new Set(options.map(id => byId.get(id)!.grade)).size === 3;
}
