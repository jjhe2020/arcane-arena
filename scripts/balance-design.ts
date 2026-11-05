import { ARENA_SCALE } from '../src/arena-layout';
import { simulateBattle } from '../src/combat';
import { BOARD_CONFIG } from '../src/global-config';
import { ROLES, type Hero, type Player, type Role, type SkillDefinition } from '../src/model';
import { skillModelPreference } from '../src/skill-model-preferences';
import { SIMULATION_REVISION } from '../src/simulation-version';

export { SIMULATION_REVISION };

export const POINTS = [3, 6, 9] as const;
const models: readonly Role[] = ['tank', 'archer', 'mage', 'assassin'];
const positions = [BOARD_CONFIG.defaultHeroX1, BOARD_CONFIG.defaultHeroX2, BOARD_CONFIG.defaultHeroX3, BOARD_CONFIG.defaultHeroX4, BOARD_CONFIG.defaultHeroX5];

function mix(seed: number, index: number, salt: number): number {
  let bits = seed ^ Math.imul(index + 1, 0x9e3779b9) ^ salt;
  bits = Math.imul(bits ^ (bits >>> 16), 0x21f0aaad);
  bits = Math.imul(bits ^ (bits >>> 15), 0x735a2d97);
  return (bits ^ (bits >>> 15)) >>> 0;
}

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor((mix(seed, i, 0x82a2b175) / 2 ** 32) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const levelPermutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

// A group is shuffled independently for each block. Almost every skill in
// that group appears once per block, and each skill cycles the three levels
// in independently randomized order across every three blocks.
function groupDrawer(pool: number[], slots: number, seed: number, salt: number) {
  const blockSize = Math.floor(pool.length / slots);
  if (!blockSize) throw new Error('技能目录不足以构造完整实验阵容');
  const cache = new Map<number, number[]>();
  return (teamIndex: number): number[] => {
    const block = Math.floor(teamIndex / blockSize);
    let deck = cache.get(block);
    if (!deck) {
      deck = shuffled(pool, mix(seed, block, salt));
      if (cache.size === 8) cache.delete(cache.keys().next().value!);
      cache.set(block, deck);
    }
    const start = (teamIndex % blockSize) * slots;
    return deck.slice(start, start + slots).map(skill => {
      const group = Math.floor(block / POINTS.length);
      const order = levelPermutations[mix(seed, group, mix(salt, skill, 0x9fac56b1)) % levelPermutations.length];
      return skill * POINTS.length + order[block % POINTS.length];
    });
  };
}

export type SampledMatch = {
  index: number;
  a: number[];
  b: number[];
  duplicateModel: Role;
  battleSeed: number;
};

export function createSamplingDesign(input: SkillDefinition[], seed: number) {
  const skills = [...input].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (new Set(skills.map(skill => skill.id)).size !== skills.length) throw new Error('实验技能目录存在重复编号');
  const ordinary: number[] = [];
  const ultimate: number[] = [];
  const preferences = skills.map((skill, index) => {
    (skill.ultimate ? ultimate : ordinary).push(index);
    return skillModelPreference(skill.id);
  });
  const drawOrdinary = groupDrawer(ordinary, 15, seed, 0x788dbb51);
  const drawUltimate = groupDrawer(ultimate, 5, seed, 0x60faabf9);
  function drawTeam(index: number): number[] {
    return shuffled([...drawOrdinary(index), ...drawUltimate(index)], mix(seed, index, 0x2db895a4));
  }
  function drawMatch(index: number): SampledMatch {
    return {
      index,
      a: drawTeam(index * 2),
      b: drawTeam(index * 2 + 1),
      duplicateModel: models[(index + seed % models.length) % models.length],
      battleSeed: mix(seed, index, 0x49f3fa2c),
    };
  }
  function placeTeam(team: number[], duplicateModel: Role) {
    const lineup = [...models, duplicateModel].map(role => ({ role, features: [] as number[], ultimate: false }));
    const ranked = [...team].sort((a, b) => b % POINTS.length - a % POINTS.length);
    for (const feature of ranked) {
      const index = Math.floor(feature / POINTS.length);
      const isUltimate = skills[index].ultimate;
      const priority = preferences[index];
      let best: typeof lineup[number] | undefined;
      for (const hero of lineup) {
        // Each hero needs exactly one ultimate to fit all 20 skills. Keep
        // that slot open if a regular skill is placed ahead of its ultimate.
        if (isUltimate ? hero.ultimate : hero.features.length >= (hero.ultimate ? 4 : 3)) continue;
        const rank = priority.indexOf(hero.role);
        const bestRank = best ? priority.indexOf(best.role) : Infinity;
        if (rank < bestRank || (best && rank === bestRank && hero.features.length < best.features.length)) best = hero;
      }
      if (!best) throw new Error('技能实验阵容无法满足每个模型四技能、一终极技能');
      best.features.push(feature);
      if (isUltimate) best.ultimate = true;
    }
    return lineup;
  }
  function buildPlayer(team: number[], duplicateModel: Role, side: number): Player {
    const heroes: Hero[] = placeTeam(team, duplicateModel).map(({role, features}, index) => ({
      id: `p${side}-h${index}`,
      name: `${ROLES[role].name} ${index + 1}`,
      role,
      skin: (side + index) % 2 ? 'male' : 'female',
      x: positions[index] * ARENA_SCALE,
      y: (role === 'tank' || role === 'assassin' ? BOARD_CONFIG.frontRowY : BOARD_CONFIG.backRowY) * ARENA_SCALE,
      skills: features.map(feature => ({
        id: skills[Math.floor(feature / POINTS.length)].id,
        points: POINTS[feature % POINTS.length],
        instanceId: `balance-${side}-${feature}`,
      })),
    }));
    return { id: side, name: `实验 ${side}`, hp: 100, gold: 0, shopLevel: 5, heroes, reserve: [], shop: [], locked: false };
  }
  return { skills, drawMatch, placeTeam, buildPlayer };
}

export type SamplingDesign = ReturnType<typeof createSamplingDesign>;

export function simulateMatch(design: SamplingDesign, index: number, round: number): number {
  const {a, b, duplicateModel, battleSeed} = design.drawMatch(index);
  const first = design.buildPlayer(a, duplicateModel, 0);
  const second = design.buildPlayer(b, duplicateModel, 1);
  const outcome = (winner: number | null) => winner === null ? 1 : winner === first.id ? 2 : 0;
  const forward = outcome(simulateBattle(first, second, battleSeed, design.skills, round).winner);
  const reverse = outcome(simulateBattle(second, first, battleSeed, design.skills, round).winner);
  return forward * 3 + reverse;
}

export function decodeOutcome(value: number): [number, number] {
  if (!Number.isInteger(value) || value < 0 || value > 8) throw new Error(`无效的比赛记录：${value}`);
  return [Math.floor(value / 3), value % 3];
}
