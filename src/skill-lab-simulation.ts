import { BATTLE_BOUNDS, FIXED_STEP, createBattle, effectiveAttackRange, getSkillLabCastMode, getSkillRange, stepBattle } from './combat';
import { BASIC_ATTACK_ID } from './combat/statistics';
import { BATTLE_CONFIG, skillBalance } from './config';
import type { BattleState, CombatUnit, DamageAmounts, Hero, Player, Role, SkillDefinition } from './model';

export const SKILL_LAB_POINTS = [3, 6, 9] as const;
export type SkillLabPoints = typeof SKILL_LAB_POINTS[number];
export type SkillLabMode = ReturnType<typeof getSkillLabCastMode>;
export const SKILL_LAB_DURATION = 30;
export const SKILL_LAB_HERO_LEVEL = 12;
export const SKILL_LAB_DUMMY_HEALTH = 10000;
export const SKILL_LAB_DUMMY_ARMOR = 5;
export const SKILL_LAB_DUMMY_MAGIC_RESIST = BATTLE_CONFIG.magicResist;

const CASTER_ID = '0:lab-hero';
const DUMMY_IDS = ['1:lab-dummy-1', '1:lab-dummy-2', '1:lab-dummy-3'] as const;
const REAR_OFFSET = 1.6;
const REAR_SPREAD = 1.2;
const EDGE_INSET = .08;

// These abilities use a melee-only attack effect in the combat engine.
const MELEE_FIXTURES = new Set(['custom_magnataur_empower', 'kunkka_tidebringer']);
const INJURED_FIXTURES = new Set([
  'abaddon_borrowed_time', 'chen_hand_of_god', 'custom_enchantress_natures_attendants',
  'custom_shadow_demon_demonic_cleanse', 'custom_winter_wyvern_cold_embrace',
  'faceless_void_time_walk', 'legion_commander_press_the_attack', 'omniknight_purification',
  'oracle_false_promise', 'puck_phase_shift', 'slark_shadow_dance', 'terrorblade_sunder',
  'troll_warlord_battle_trance', 'visage_silent_as_the_grave', 'weaver_time_lapse',
]);
const CONDITIONAL_NOTES: Readonly<Record<string, string>> = {
  custom_rubick_spell_steal: '需要敌人先释放可窃取的技能。木桩没有装备技能。',
  marci_companion_run: '需要另一名可作为跳板的友方单位。',
  wisp_tether: '需要另一名可连接的友方单位。',
  custom_medusa_mana_shield: '护盾在开场生效。耗蓝和反击需要受到敌人伤害。',
  primal_beast_uproar: '基础攻击加成在开场生效。怒吼需要承受敌人伤害来叠层。',
  custom_spectre_dispersion: '伤害反弹需要英雄受到敌人伤害。',
  nyx_assassin_spiked_carapace: '反弹与眩晕需要英雄受到敌人伤害。',
  legion_commander_moment_of_courage: '反击需要英雄受到敌人攻击。',
  shredder_reactive_armor: '叠加护甲需要英雄受到敌人攻击。',
  tidehunter_kraken_shell: '格挡和驱散需要英雄受到敌人伤害。',
  viper_corrosive_skin: '反击毒素需要英雄受到敌人伤害。',
};

export interface SkillLabCase {
  battle: BattleState;
  definitions: SkillDefinition[];
  definition: SkillDefinition;
  points: SkillLabPoints;
  casterId: string;
  dummyIds: typeof DUMMY_IDS;
  mode: SkillLabMode;
  duration: number;
  startDistance: number;
  selfRadius?: number;
  setupNote?: string;
}

export interface SkillLabDummyDamage {
  id: string;
  index: number;
  total: number;
  skill: number;
  basic: number;
  types: DamageAmounts;
  skillTypes: DamageAmounts;
  basicTypes: DamageAmounts;
}

function player(id: number, heroes: Hero[]): Player {
  return { id, name: id === 0 ? '实验英雄' : '训练木桩', hp: 1, gold: 0, shopLevel: 1, heroes, reserve: [], shop: [], locked: true };
}

function seedFor(skillId: string): number {
  let seed = 0x811c9dc5;
  for (const character of skillId) seed = Math.imul(seed ^ character.charCodeAt(0), 0x01000193);
  return seed >>> 0;
}

function selfRadius(definition: SkillDefinition, points: SkillLabPoints): number | undefined {
  const row = skillBalance(definition, points);
  if (!row) return undefined;
  const values = row.params;
  if (definition.id === 'custom_doom_bringer_doom') return values['GABEN RADIUS'] / 100;
  if (definition.id === 'custom_bristleback_viscous_nasal_goo') return row.range;
  const radius = values['RADIUS'] ?? values['PULSE RADIUS'] ?? values['AURA RADIUS'] ??
    values['ROAR RADIUS'] ?? values['ENEMY SLOW RADIUS'] ?? values['TRAMPLE RADIUS'];
  return radius > 0 ? radius / 100 : undefined;
}

function placeUnits(caster: CombatUnit, dummies: CombatUnit[], distance: number): void {
  caster.x = -(distance + REAR_OFFSET) / 2;
  caster.y = 0;
  caster.facing = 0;
  dummies.forEach((dummy, index) => {
    dummy.x = caster.x + distance + (index === 0 ? 0 : REAR_OFFSET);
    dummy.y = index === 0 ? 0 : index === 1 ? -REAR_SPREAD : REAR_SPREAD;
    dummy.facing = Math.PI;
  });
}

export function createSkillLabCase(definition: SkillDefinition, points: SkillLabPoints, definitions: SkillDefinition[]): SkillLabCase {
  const role: Role = MELEE_FIXTURES.has(definition.id) ? 'assassin' : 'mage';
  const hero: Hero = { id: 'lab-hero', name: '实验英雄', role, skin: 'female', x: -2, y: 0, skills: [{ id: definition.id, points }] };
  const dummies: Hero[] = DUMMY_IDS.map((id, index) => ({
    id: id.slice(2), name: `木桩 ${index + 1}`, role: 'tank', skin: 'male', x: -2, y: index - 1, skills: [],
  }));
  let mode: SkillLabMode = 'unavailable';
  let startDistance = 3;
  let radius: number | undefined;
  let setupNote = CONDITIONAL_NOTES[definition.id];
  const battle = createBattle(player(0, [hero]), player(1, dummies), seedFor(definition.id), definitions, undefined, SKILL_LAB_HERO_LEVEL, {
    casterId: CASTER_ID,
    primaryTargetId: DUMMY_IDS[0],
    skillId: definition.id,
    prepare: state => {
      const [caster, ...targets] = state.units;
      targets.forEach((target, index) => {
        target.trainingDummy = index + 1;
        target.hp = target.maxHp = SKILL_LAB_DUMMY_HEALTH;
        target.armor = SKILL_LAB_DUMMY_ARMOR;
        target.magicResist = SKILL_LAB_DUMMY_MAGIC_RESIST;
        target.moveSpeed = 0;
        target.attackCapability = 'none';
      });
      const skill = caster.skills[0]!;
      mode = getSkillLabCastMode(state, caster, skill, targets[0]);
      if (mode === 'self') radius = selfRadius(definition, points);
      const castRange = getSkillRange(state, caster, skill, targets[0])?.range ?? 0;
      const params = skillBalance(definition, points)?.params;
      const defaultDistance = Math.min(3, effectiveAttackRange(caster) - EDGE_INSET);
      let reach = mode === 'unit' || mode === 'point' ? castRange : radius ?? defaultDistance;
      if (definition.id === 'custom_tiny_toss') reach = (params?.['GRAB RADIUS'] ?? 275) / 100;
      if (definition.id === 'omniknight_purification') reach = (params?.['DAMAGE RADIUS'] ?? 260) / 100;
      if (definition.id === 'faceless_void_time_walk') reach = (params?.['RANGE'] ?? 800) / 100 + .8;
      const arenaLimit = Math.min(12, (BATTLE_BOUNDS.x - BATTLE_CONFIG.bodyRadius) * 2 - REAR_OFFSET);
      startDistance = Math.max(1, Math.min(reach - EDGE_INSET, arenaLimit));
      placeUnits(caster, targets, startDistance);

      if (INJURED_FIXTURES.has(definition.id)) {
        caster.hp = caster.maxHp * .3;
        setupNote = '英雄以 30% 生命开始，以满足技能的受伤条件。';
        if (definition.id === 'faceless_void_time_walk' || definition.id === 'weaver_time_lapse') {
          setupNote = '英雄以 30% 生命开始。回复需要战斗中已有的近期伤害记录。';
        }
      } else if (definition.id === 'keeper_of_the_light_chakra_magic') {
        caster.mana = caster.maxMana * .3;
        setupNote = '英雄以 30% 魔法开始，以满足回魔条件。';
      } else if (definition.id === 'custom_axe_culling_blade') {
        targets[0].hp = 200;
        setupNote = '一号木桩以 200 生命开始，以演示斩杀。';
      } else if (definition.id === 'custom_alchemist_acid_spray' && points === 9) {
        setupNote = '9 级酸雾于开场自动覆盖战场。';
      } else if (definition.id === 'custom_magnataur_empower' && points === 9) {
        setupNote = '9 级强化以开场光环形式生效。';
      }
    },
  });
  return { battle, definitions, definition, points, casterId: CASTER_ID, dummyIds: DUMMY_IDS, mode, duration: SKILL_LAB_DURATION, startDistance, selfRadius: radius, setupNote };
}

export function stepSkillLabCase(scenario: SkillLabCase, dt: number): void {
  if (!Number.isFinite(dt) || dt < 0) throw new Error('Skill lab dt must be finite and nonnegative.');
  const remaining = scenario.duration - scenario.battle.time;
  if (remaining >= FIXED_STEP - 1e-9) stepBattle(scenario.battle, Math.min(dt, remaining), scenario.definitions);
}

const emptyDamage = (): DamageAmounts => ({ physical: 0, magical: 0, pure: 0 });

export function skillLabDamage(scenario: SkillLabCase): SkillLabDummyDamage[] {
  return scenario.dummyIds.map((id, index) => {
    const target = scenario.battle.units.find(unit => unit.id === id);
    const skillTypes = emptyDamage(), basicTypes = emptyDamage();
    let skill = 0, basic = 0;
    for (const row of target?.abilityStats ?? []) {
      const source = scenario.battle.units.find(unit => unit.id === row.sourceUnitId);
      if (source?.side !== 0) continue;
      const isBasic = row.rootAbilityId === BASIC_ATTACK_ID;
      if (isBasic) basic += row.taken;
      else skill += row.taken;
      const bucket = isBasic ? basicTypes : skillTypes;
      bucket.physical += row.takenTypes.physical;
      bucket.magical += row.takenTypes.magical;
      bucket.pure += row.takenTypes.pure;
    }
    const types = {
      physical: skillTypes.physical + basicTypes.physical,
      magical: skillTypes.magical + basicTypes.magical,
      pure: skillTypes.pure + basicTypes.pure,
    };
    return { id, index: index + 1, total: skill + basic, skill, basic, types, skillTypes, basicTypes };
  });
}
