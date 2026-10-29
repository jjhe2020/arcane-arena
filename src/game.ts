import { ROLES, type GameState, type Hero, type Player, type Role, type RoundReport, type SkillDefinition, type SkillStack } from './model';
import {SIMULATION_REVISION} from './simulation-version';

/** Confirmed capacities/economy, plus explicitly provisional project rules. */
export const GAME_RULES = {
  version: 1, players: 8, initialHp: 100, shopSlots: 12, reserveSlots: 4,
  skillsPerHero: 4, copiesPerSkill: 20, skillPrice: 3, rerollPrice: 1,
  maximumPoints: 9, ultimateShopLevel: 3,
  regularShopSlots:10, godShopSlots:2, activeShopSlots:[4,6,6,8,10],
  matchPoolSize:100,
  // Working rules: four custom classes arrive on these rounds; refunds and
  // upgrade costs are configurable project defaults, not a claimed AA patch.
  heroArrivalRounds: [1, 3, 5, 7, 9], saleGoldPerPoint: 2,
  shopUpgradePrices: [10, 15, 20, 25], upgradeDiscountPerRound: 1,
  // User confirmed five levels and two reserved, inactive God placeholders.
  maximumShopLevel: 5,
} as const;

export type SkillLocation = { hero?: number; reserve?: number; slot?: number };
type Catalog = Map<string, SkillDefinition>;
const catalogs = new WeakMap<GameState, Catalog>();
const roleOrder: Role[] = ['tank', 'archer', 'mage', 'assassin', 'tank'];
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const integer = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
const finite = (n: unknown, min = 0, max = 1e9): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validSkillState=(value:unknown):value is Record<string,number>=>record(value)&&Object.keys(value).length<=256&&Object.entries(value).every(([key,n])=>/^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$/.test(key)&&key.length<=160&&finite(n,0,1e7));

function signature(defs: SkillDefinition[]): string {
  // Appearance changes do not invalidate a game; rules/content changes do.
  const text = SIMULATION_REVISION+JSON.stringify([...defs].sort((a, b) => a.id.localeCompare(b.id)).map(d => [d.id, d.ultimate, d.passive, d.tags, d.categories, d.values, d.cooldowns, d.mana, d.descriptionEn, d.super, d.gaben]));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `arena-${GAME_RULES.version}-${(hash >>> 0).toString(16)}`;
}

function bind(state: GameState, defs: SkillDefinition[]): Catalog {
  if (!Array.isArray(defs) || !defs.length || defs.some(d => !d || typeof d.id !== 'string' || !/^[a-zA-Z0-9_.:-]+$/.test(d.id) || ['__proto__', 'constructor', 'prototype'].includes(d.id)) || new Set(defs.map(d => d.id)).size !== defs.length) throw new Error('技能目录为空、重复或包含无效编号');
  if (state.contentSignature && state.contentSignature !== signature(defs)) throw new Error('技能目录与当前存档不一致');
  const catalog = new Map(defs.map(d => [d.id, d]));
  catalogs.set(state, catalog);
  state.contentSignature = signature(defs);
  return catalog;
}

function catalogFor(state: GameState): Catalog {
  const catalog = catalogs.get(state);
  if (!catalog) throw new Error('请使用 restoreGame 恢复对局及技能目录');
  return catalog;
}

function random(state: GameState): number {
  let value = state.rng || 0x6d2b79f5;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng / 4294967296;
}

function shuffle<T>(state: GameState, values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function roundIncome(round: number): number { return Math.min(20, 6 + 2 * Math.max(0, round - 1)); }
export function shopOfferCount(level:number):number{return GAME_RULES.activeShopSlots[Math.max(0,Math.min(4,Math.floor(level)-1))];}
export function heroCountForRound(round: number): number { return GAME_RULES.heroArrivalRounds.filter(r => r <= round).length; }
export function skillTier(points: number): 'basic' | 'standard' | 'super' | 'gaben' {
  return points >= 9 ? 'gaben' : points >= 6 ? 'super' : points >= 3 ? 'standard' : 'basic';
}
/** Current official FAQ formula; floor rounding and draws are project defaults. */
export function roundDamage(round: number, survivors: number): number { return Math.max(1, Math.floor(5 + round / 3.8 + survivors * round / 3.8)); }

function makeHero(player: number, index: number): Hero {
  const role = roleOrder[(index + (player % 4)) % roleOrder.length];
  return { id: `p${player}-h${index}`, name: `${ROLES[role].name} ${index + 1}`, role, skin: (player + index) % 2 ? 'male' : 'female', x: [-8, -4, 0, 4, 8][index], y: role === 'tank' || role === 'assassin' ? -4 : -8.5, skills: Array(4).fill(null) };
}

function editable(state: GameState, playerId: number): Player | string {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return '玩家不存在';
  if (state.phase === 'finished') return '对局已结束';
  if (player.hp <= 0) return '该玩家已经淘汰';
  return player;
}

function allStacks(player: Player): SkillStack[] { return [...player.heroes.flatMap(h => h.skills), ...player.reserve].filter((s): s is SkillStack => s !== null); }
function releaseShop(state: GameState, player: Player): void {
  player.shop.forEach(id => { if (id !== null) state.pool[id]++; });
  player.shop.fill(null);
}
function drawShop(state: GameState, player: Player, startSlot=0): void {
  const catalog = catalogFor(state);
  const ids = [...state.matchSkillIds].sort().filter(id => !catalog.get(id)!.ultimate || player.shopLevel >= GAME_RULES.ultimateShopLevel);
  for (let slot = startSlot; slot < shopOfferCount(player.shopLevel); slot++) {
    if (player.shop[slot] !== null) continue;
    const available = ids.reduce((sum, id) => sum + state.pool[id], 0);
    if (!available) break;
    let roll = Math.floor(random(state) * available);
    for (const id of ids) {
      roll -= state.pool[id];
      if (roll < 0) { player.shop[slot] = id; state.pool[id]--; break; }
    }
  }
}

function beginPlanning(state: GameState, round: number): void {
  state.planningRound = round;
  const living = state.players.filter(p => p.hp > 0);
  // Release ALL unlocked offers first, then draw round-robin. No player can
  // retain another player's old shop stock simply by being processed first.
  living.forEach(p => { if (!p.locked) releaseShop(state, p); });
  living.forEach(p => {
    p.gold = Math.floor(roundIncome(round) * (p.id === 0 ? 1 : state.difficulty));
    while (p.heroes.length < heroCountForRound(round)) p.heroes.push(makeHero(p.id, p.heroes.length));
  });
  const order = [...living.slice(round % living.length), ...living.slice(0, round % living.length)];
  // One offer per player at a time avoids filling one complete shop first.
  const catalog = catalogFor(state);
  const ids = [...state.matchSkillIds].sort();
  for (let slot = 0; slot < GAME_RULES.regularShopSlots; slot++) for (const p of order) {
    if(slot>=shopOfferCount(p.shopLevel))continue;
    if (p.shop[slot] !== null) continue;
    const eligible = ids.filter(id => state.pool[id] > 0 && (!catalog.get(id)!.ultimate || p.shopLevel >= GAME_RULES.ultimateShopLevel));
    const total = eligible.reduce((sum, id) => sum + state.pool[id], 0);
    if (!total) continue;
    let roll = Math.floor(random(state) * total);
    for (const id of eligible) if ((roll -= state.pool[id]) < 0) { state.pool[id]--; p.shop[slot] = id; break; }
  }
}

export function newGame(seed: number, difficulty: number, defs: SkillDefinition[]): GameState {
  if (!Number.isFinite(seed)) throw new Error('随机种子无效');
  if (!finite(difficulty, 0.25, 10)) throw new Error('难度倍率必须在 0.25 至 10 之间');
  const state: GameState = {
    version: GAME_RULES.version, seed: seed >>> 0, rng: (seed >>> 0) || 0x6d2b79f5,
    round: 1, planningRound: 1, phase: 'prep', difficulty,
    players: Array.from({ length: 8 }, (_, id) => ({ id, name: id ? `对手 ${id}` : '你', hp: GAME_RULES.initialHp, gold: 0, shopLevel: 1, heroes: [makeHero(id, 0)], reserve: Array(4).fill(null), shop: Array(12).fill(null), locked: false })),
    pool: Object.fromEntries(defs.map(d => [d.id, GAME_RULES.copiesPerSkill])),
    matchSkillIds:[],nextSkillInstance:1,
    pairs: [], ghostPairs: [], battlePlayers: [], history: [], pendingReports: [], selectedHero: 0, battleSeed: 0,
  };
  bind(state, defs);
  // FAQ specifies 100 available skills but no base/ultimate quota. Sample
  // uniformly without replacement; smaller catalogs are test fixtures only.
  state.matchSkillIds=shuffle(state,defs.map(d=>d.id).sort()).slice(0,GAME_RULES.matchPoolSize);
  beginPlanning(state, 1);
  return state;
}

function canEquip(catalog: Catalog, hero: Hero, stack: SkillStack, replacing = -1): boolean {
  return !hero.skills.some((other, index) => index !== replacing && other && (other.id === stack.id || (catalog.get(stack.id)!.ultimate && catalog.get(other.id)!.ultimate)));
}

function destinationFor(state: GameState, player: Player, id: string): SkillLocation | null {
  const catalog = catalogFor(state), stack = { id, points: 1 };
  if (player.id === 0) {
    const hero = player.heroes[state.selectedHero];
    if (hero && hero.skills.includes(null) && canEquip(catalog, hero, stack)) return { hero: state.selectedHero, slot: hero.skills.indexOf(null) };
  }
  const heroes = player.heroes.map((hero, index) => ({ hero, index, score: skillScore(catalog.get(id)!, hero) })).sort((a, b) => b.score - a.score || a.index - b.index);
  if (player.id !== 0) for (const { hero, index } of heroes) if (hero.skills.includes(null) && canEquip(catalog, hero, stack)) return { hero: index, slot: hero.skills.indexOf(null) };
  if (player.reserve.includes(null)) return { reserve: player.reserve.indexOf(null) };
  for (const { hero, index } of heroes) if (hero.skills.includes(null) && canEquip(catalog, hero, stack)) return { hero: index, slot: hero.skills.indexOf(null) };
  return null;
}

function location(player: Player, at: SkillLocation): { slots: (SkillStack | null)[]; index: number; hero?: Hero } | null {
  if (!at || typeof at !== 'object') return null;
  if (at.reserve !== undefined) {
    if (at.hero !== undefined || at.slot !== undefined || !integer(at.reserve, 0, 3)) return null;
    return { slots: player.reserve, index: at.reserve };
  }
  if (!integer(at.hero, 0, player.heroes.length - 1) || !integer(at.slot, 0, 3)) return null;
  return { slots: player.heroes[at.hero].skills, index: at.slot, hero: player.heroes[at.hero] };
}

export function buySkill(state: GameState, playerId: number, shopIndex: number): string | null {
  const player = editable(state, playerId); if (typeof player === 'string') return player;
  if(!integer(shopIndex,0,shopOfferCount(player.shopLevel)-1))return shopIndex>=10?'God位置尚未开放':'这个商品位尚未解锁';
  if (!integer(shopIndex, 0, 11)) return '商品位置无效';
  const id = player.shop[shopIndex]; if (!id) return '这个商品已售出';
  if (player.gold < GAME_RULES.skillPrice) return '金币不足，需要 3 金币';
  const existing = allStacks(player).find(s => s.id === id);
  if (existing && existing.points >= GAME_RULES.maximumPoints) return '该技能已经达到 Gaben';
  const destination = existing ? null : destinationFor(state, player, id);
  if (!existing && !destination) return '英雄技能槽与暂存区已满';
  player.gold -= GAME_RULES.skillPrice;
  player.shop[shopIndex] = null; // Reserved shop copy becomes an owned point.
  if (existing) { existing.points++; if(existing.points===6&&existing.superRound===undefined)existing.superRound=state.planningRound; }
  else { const target = location(player, destination!)!; target.slots[target.index] = { id, points: 1,instanceId:`ability:${state.nextSkillInstance++}` }; }
  return null;
}

export function rerollShop(state: GameState, playerId: number): string | null {
  const player = editable(state, playerId); if (typeof player === 'string') return player;
  if (player.locked) return '请先解除商店锁定';
  if (player.gold < GAME_RULES.rerollPrice) return '刷新需要 1 金币';
  player.gold -= GAME_RULES.rerollPrice;
  releaseShop(state, player); drawShop(state, player);
  return null;
}

export function lockShop(state: GameState, playerId: number, locked?: boolean): string | null {
  const player = editable(state, playerId); if (typeof player === 'string') return player;
  player.locked = locked ?? !player.locked;
  return null;
}

export function shopUpgradeCost(state: GameState, playerId: number): number {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.shopLevel >= GAME_RULES.maximumShopLevel) return Infinity;
  return Math.max(0, GAME_RULES.shopUpgradePrices[player.shopLevel - 1] - (state.planningRound - 1) * GAME_RULES.upgradeDiscountPerRound);
}

export function upgradeShop(state: GameState, playerId: number): string | null {
  const player = editable(state, playerId); if (typeof player === 'string') return player;
  if (player.shopLevel >= GAME_RULES.maximumShopLevel) return '当前商店已解锁全部可用商品';
  const cost = shopUpgradeCost(state, playerId);
  if (player.gold < cost) return `升级需要 ${cost} 金币`;
  const previousCount=shopOfferCount(player.shopLevel);player.gold -= cost; player.shopLevel++;
  // Fill only newly opened positions. An upgrade never refills bought slots or
  // replaces retained/locked offers; level 3 needs a reroll to offer ultimates.
  drawShop(state,player,previousCount);
  return null;
}

export function moveSkill(state: GameState, playerId: number, from: SkillLocation, to: SkillLocation): string | null {
  const player = editable(state, playerId); if (typeof player === 'string') return player;
  const source = location(player, from), target = location(player, to);
  if (!source || !target) return '技能位置无效';
  const stack = source.slots[source.index], other = target.slots[target.index];
  if (!stack) return '这个位置没有技能';
  if (source.slots === target.slots && source.index === target.index) return null;
  // FAQ: hero-to-hero / hero-to-reserve costs 1; reserve-to-hero is free.
  // Swap policy: one gold per cross-body operation, including an outgoing
  // hero skill when swapping from reserve. Internal ordering is free.
  const fee=source.slots!==target.slots&&(from.hero!==undefined||(to.hero!==undefined&&!!other&&other.id!==stack.id))?1:0;
  const catalog = catalogFor(state);
  // Validate the final arrangement on a copy: swaps inside the same hero must
  // not mistake the source's ultimate for a second ultimate.
  const next = copy(player), nextSource = location(next, from)!, nextTarget = location(next, to)!;
  if (other?.id === stack.id) {
    if (other.points + stack.points > GAME_RULES.maximumPoints) return '合并后超过技能点上限';
    const superRounds=[stack.superRound,other.superRound].filter((n):n is number=>n!==undefined);
    const lineage=[...new Set([...(other.lineage??(other.instanceId?[other.instanceId]:[])),...(stack.lineage??(stack.instanceId?[stack.instanceId]:[]))])],persistentState={...other.persistentState};
    for(const [key,value]of Object.entries(stack.persistentState??{}))persistentState[key]=(persistentState[key]??0)+value;
    nextTarget.slots[nextTarget.index] = { id: stack.id, points: other.points + stack.points,instanceId:other.instanceId,lineage,...(Object.keys(persistentState).length?{persistentState}:{}), ...((other.points+stack.points)>=6?{superRound:superRounds.length?Math.min(...superRounds):state.planningRound}:{}) };
    nextSource.slots[nextSource.index] = null;
  } else {
    nextSource.slots[nextSource.index] = other ? { ...other } : null;
    nextTarget.slots[nextTarget.index] = { ...stack };
  }
  if (next.heroes.some(h => h.skills.filter(s => s && catalog.get(s.id)!.ultimate).length > 1)) return '每名英雄最多装备一个终极技能';
  if (next.heroes.some(h => new Set(h.skills.filter(Boolean).map(s => s!.id)).size !== h.skills.filter(Boolean).length)) return '同一英雄不能装备重复技能';
  if(player.gold<fee)return '移动技能需要1金币';
  player.gold-=fee;
  source.slots[source.index] = nextSource.slots[nextSource.index];
  target.slots[target.index] = nextTarget.slots[nextTarget.index];
  return null;
}

export function sellSkill(state: GameState, playerId: number, from: SkillLocation): string | null {
  const player = editable(state, playerId); if (typeof player === 'string') return player;
  const source = location(player, from); if (!source) return '技能位置无效';
  const stack = source.slots[source.index]; if (!stack) return '这个位置没有技能';
  player.gold += stack.points * GAME_RULES.saleGoldPerPoint;
  state.pool[stack.id] += stack.points;
  source.slots[source.index] = null;
  return null;
}

export function changeRole(state: GameState, playerId: number, heroIndex: number, role: Role): string | null {
  const player = editable(state, playerId); if (typeof player === 'string') return player;
  if (!integer(heroIndex, 0, player.heroes.length - 1) || !Object.hasOwn(ROLES, role)) return '英雄或职业无效';
  const hero = player.heroes[heroIndex]; hero.role = role; hero.name = `${ROLES[role].name} ${heroIndex + 1}`;
  return null;
}

function skillScore(def: SkillDefinition, hero: Hero): number {
  const text = [def.nameEn, ...def.tags, ...def.categories, def.descriptionEn].join(' ').toLowerCase();
  let score = 10;
  if (hero.role === 'tank' && /heal|armor|health|shield|defen|reduc|taunt|lifesteal|stun/.test(text)) score += 9;
  if ((hero.role === 'archer' || hero.role === 'assassin') && /attack|critical|bash|damage per|attack speed|lifesteal/.test(text)) score += 9;
  if (hero.role === 'mage' && /spell|mana|magic|cooldown|radius|damage/.test(text)) score += 7;
  if (hero.role === 'mage' && !def.passive) score += 3;
  if (hero.role === 'assassin' && /blink|move|slow|stun/.test(text)) score += 4;
  if (def.ultimate) score += 4;
  return score;
}

function organizeAi(state: GameState, player: Player): void {
  const catalog=catalogFor(state);
  // Newly bought spells already choose a suitable hero. Only move bench spells
  // into empty legal slots here, using the same free bench-to-hero transaction
  // as the human. Never erase/repack all equipped skills to bypass move fees.
  const reserves=player.reserve.map((stack,index)=>({stack,index})).filter((entry):entry is {stack:SkillStack;index:number}=>!!entry.stack).sort((a,b)=>Number(catalog.get(b.stack.id)!.ultimate)-Number(catalog.get(a.stack.id)!.ultimate)||b.stack.points-a.stack.points);
  for(const {stack,index}of reserves){const choices=player.heroes.map((hero,i)=>({hero,index:i,score:skillScore(catalog.get(stack.id)!,hero)-hero.skills.filter(Boolean).length*1.5})).filter(({hero})=>hero.skills.includes(null)&&canEquip(catalog,hero,stack)).sort((a,b)=>b.score-a.score||a.index-b.index);if(choices.length)moveSkill(state,player.id,{reserve:index},{hero:choices[0].index,slot:choices[0].hero.skills.indexOf(null)});}
}

function aiStep(state: GameState, player: Player): boolean {
  const catalog = catalogFor(state), stacks = allStacks(player);
  // Upgrade only once there is an actual formation to improve, or at no cost.
  const cost = shopUpgradeCost(state, player.id);
  if (Number.isFinite(cost) && player.gold >= cost && (cost === 0 || (stacks.length >= Math.min(4, player.heroes.length * 2) && player.gold >= cost + 3))) return upgradeShop(state, player.id) === null;
  const candidates = player.shop.map((id, index) => {
    if (!id) return { index, score: -Infinity };
    const owned = stacks.find(s => s.id === id);
    if (owned) return { index, score: owned.points >= 9 ? -Infinity : 30 + owned.points * 3 + ([2, 5, 8].includes(owned.points) ? 20 : 0) };
    const target = destinationFor(state, player, id);
    if (!target) return { index, score: -Infinity };
    return { index, score: Math.max(...player.heroes.map(h => skillScore(catalog.get(id)!, h))) - (target.reserve !== undefined ? 8 : 0) };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  if (player.gold >= 3 && candidates[0]?.score > -Infinity && buySkill(state, player.id, candidates[0].index) === null) { organizeAi(state, player); return true; }
  if (player.gold > 0) { player.locked = false; return rerollShop(state, player.id) === null; }
  return false;
}

function runAi(state: GameState): void {
  const players = state.players.filter(p => p.id !== 0 && p.hp > 0);
  const offset = state.round % Math.max(1, players.length);
  const order = [...players.slice(offset), ...players.slice(0, offset)];
  order.forEach(p => organizeAi(state, p));
  // Interleave one legal economic action per bot. No wall-clock scheduling and
  // no buy/sell loop; the bound also protects future zero-price rule changes.
  for (let turn = 0; turn < 256; turn++) {
    let changed = false;
    for (const player of order) changed = aiStep(state, player) || changed;
    if (!changed) break;
  }
}

function makePairs(state: GameState): void {
  const living = shuffle(state, state.players.filter(p => p.hp > 0).map(p => p.id));
  const previous = state.history.filter(r => r.round === state.round - 1);
  const fought = (a: number, b: number) => previous.some(r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  state.pairs = []; state.ghostPairs = [];
  while (living.length > 1) {
    const a = living.shift()!;
    const candidate = living.findIndex(b => !fought(a, b));
    const b = living.splice(candidate < 0 ? 0 : candidate, 1)[0];
    state.pairs.push([a, b]);
  }
  if (living.length) {
    const a = living[0], others = shuffle(state, state.players.filter(p => p.hp > 0 && p.id !== a).map(p => p.id));
    if (others.length) {
      const b = others.find(id => !fought(a, id)) ?? others[0];
      state.ghostPairs.push(state.pairs.length); state.pairs.push([a, b]);
    }
  }
}

/** Result -> preparation only; money for this planning round was already paid. */
export function prepareRound(state: GameState, defs: SkillDefinition[]): string | null {
  try { bind(state, defs); } catch (error) { return (error as Error).message; }
  if (state.phase === 'prep') return null;
  if (state.phase === 'finished') return '对局已结束';
  if (state.phase !== 'result') return '本轮战斗尚未结算';
  state.round = state.planningRound; state.phase = 'prep';
  state.pairs = []; state.ghostPairs = []; state.battlePlayers = []; state.pendingReports = [];
  return null;
}

export function startRound(state: GameState, defs: SkillDefinition[]): string | null {
  if (state.phase !== 'prep') return '当前不能重复开战';
  try { bind(state, defs); } catch (error) { return (error as Error).message; }
  if (state.players.filter(p => p.hp > 0).length < 2) return '没有足够的存活玩家';
  runAi(state); makePairs(state);
  state.battleSeed = Math.floor(random(state) * 4294967296);
  state.battlePlayers = copy(state.players);
  state.pendingReports = []; state.phase = 'battle';
  beginPlanning(state, state.round + 1);
  return null;
}

export function getBattlePlayers(state: GameState): Player[] { return copy(state.battlePlayers); }

function validReport(report: unknown): report is RoundReport {
  if (!record(report) || !integer(report.round, 1, 10000) || !integer(report.a, 0, 7) || !integer(report.b, 0, 7) || report.a === report.b || (report.winner !== null && report.winner !== report.a && report.winner !== report.b) || !integer(report.damage, 0, 10000) || !finite(report.duration, 0, 100000) || !integer(report.survivors, 0, 10000) || !Array.isArray(report.stats) || report.stats.length > 10000) return false;
  if(report.gains!==undefined&&(!Array.isArray(report.gains)||report.gains.length>100||report.gains.some(g=>!record(g)||typeof g.heroId!=='string'||!finite(g.attack,0,1e7)||['strength','agility','intelligence'].some(k=>g[k]!==undefined&&!finite(g[k],0,1e7))||(g.skillState!==undefined&&!validSkillState(g.skillState)))))return false;
  return report.stats.every(s => record(s) && typeof s.id === 'string' && typeof s.name === 'string' && integer(s.side, 0, 7) && finite(s.damage) && finite(s.taken) && finite(s.healing));
}

export function finishRound(state: GameState, reports: RoundReport[]): string | null {
  if (state.phase !== 'battle') return '当前没有等待结算的战斗';
  if (!Array.isArray(reports) || reports.length !== state.pairs.length || reports.some(r => !validReport(r) || r.round !== state.round)) return '战斗报告不完整或无效';
  const ordered = state.pairs.map(([a, b]) => reports.filter(r => r.a === a && r.b === b));
  if (ordered.some(matches => matches.length !== 1)) return '战斗报告与本轮配对不一致';
  const losses = new Map<number, number>();
  ordered.forEach(([report], index) => {
    const damage = Math.max(1, report.damage);
    if (report.winner !== report.a) losses.set(report.a, (losses.get(report.a) ?? 0) + damage);
    if (!state.ghostPairs.includes(index) && report.winner !== report.b) losses.set(report.b, (losses.get(report.b) ?? 0) + damage);
  });
  const before = state.players.filter(p => p.hp > 0).map(p => ({ id: p.id, hp: p.hp, final: p.hp - (losses.get(p.id) ?? 0) }));
  const survivingCount=before.filter(p=>p.final>0).length;
  before.filter(p=>p.final<=0).sort((a,b)=>b.final-a.final||b.hp-a.hp||a.id-b.id).forEach((p,index)=>state.players[p.id].placement=survivingCount+index+1);
  ordered.forEach(([report],index)=>{for(const gain of report.gains??[]){
    const candidates=state.ghostPairs.includes(index)?[state.players[report.a]]:[state.players[report.a],state.players[report.b]];
    const player=candidates.find(p=>p.heroes.some(h=>h.id===gain.heroId)),hero=player?.heroes.find(h=>h.id===gain.heroId);if(!player||!hero)continue;
    hero.persistentAttackBonus=(hero.persistentAttackBonus??0)+gain.attack;
    if(gain.strength)hero.persistentStrengthBonus=(hero.persistentStrengthBonus??0)+gain.strength;
    if(gain.agility)hero.persistentAgilityBonus=(hero.persistentAgilityBonus??0)+gain.agility;
    if(gain.intelligence)hero.persistentIntelligenceBonus=(hero.persistentIntelligenceBonus??0)+gain.intelligence;
    const original=state.battlePlayers[player.id].heroes.find(h=>h.id===gain.heroId);
    for(const [key,delta]of Object.entries(gain.skillState??{})){
      const id=key.split(':')[0],instance=original?.skills.find(s=>s?.id===id)?.instanceId;
      const stack=instance?allStacks(player).find(s=>s.id===id&&(s.instanceId===instance||s.lineage?.includes(instance))):undefined;
      if(stack){stack.persistentState??={};stack.persistentState[key]=(stack.persistentState[key]??0)+delta;}
    }
  }});
  for (const player of state.players) {
    if (player.hp <= 0) continue;
    player.hp = Math.max(0, player.hp - (losses.get(player.id) ?? 0));
    if (!player.hp) {
      player.eliminatedRound = state.round; player.gold = 0;
      releaseShop(state, player);
      allStacks(player).forEach(s => { state.pool[s.id] += s.points; });
      player.heroes.forEach(h => h.skills.fill(null)); player.reserve.fill(null); player.locked = false;
    }
  }
  state.pendingReports = copy(ordered.map(([report]) => report));
  state.history.push(...copy(state.pendingReports));
  const alive = state.players.filter(p => p.hp > 0);
  if (alive.length <= 1) {
    state.phase = 'finished';
    // Simultaneous final eliminations: stable ranking by pre-clamp remaining HP,
    // previous HP, then seat. Never resurrect or deduct a shadow's donor twice.
    state.winner = alive[0]?.id ?? before.sort((a, b) => b.final - a.final || b.hp - a.hp || a.id - b.id)[0].id;
  } else state.phase = 'result';
  return null;
}

/** Returns a human-readable problem rather than repairing or rerolling a save. */
export function validateGame(state: unknown, defs: SkillDefinition[]): string | null {
  if (!record(state) || state.version !== GAME_RULES.version) return '存档版本不兼容';
  if (state.contentSignature !== signature(defs)) return '存档技能目录与当前版本不一致';
  const ids = new Set(defs.map(d => d.id)), catalog = new Map(defs.map(d => [d.id, d]));
  if (!integer(state.seed, 0, 0xffffffff) || !integer(state.rng, 1, 0xffffffff) || !integer(state.battleSeed, 0, 0xffffffff) || !integer(state.round, 1, 10000) || !integer(state.planningRound, 1, 10001) || !finite(state.difficulty, 0.25, 10) || !['prep', 'battle', 'result', 'finished'].includes(String(state.phase))) return '存档回合或随机状态无效';
  if (state.planningRound !== state.round + (state.phase === 'prep' ? 0 : 1)) return '存档发钱阶段不一致';
  if(!integer(state.nextSkillInstance,1,1e9)||!Array.isArray(state.matchSkillIds)||state.matchSkillIds.length!==Math.min(GAME_RULES.matchPoolSize,ids.size)||new Set(state.matchSkillIds).size!==state.matchSkillIds.length||state.matchSkillIds.some(id=>typeof id!=='string'||!ids.has(id)))return '存档本局随机池无效';
  const matchIds=new Set(state.matchSkillIds);
  const totals = Object.fromEntries([...ids].map(id => [id, 0]));
  if (!record(state.pool) || Object.keys(state.pool).length !== ids.size || Object.entries(state.pool).some(([id, count]) => !ids.has(id) || !integer(count, 0, 20))) return '存档共享库存无效';
  for (const id of ids) totals[id] = state.pool[id] as number;
  const validPlayers = (players: unknown, countInventory: boolean): players is Player[] => {
    if (!Array.isArray(players) || players.length !== 8) return false;
    const heroIds = new Set<string>(),placements=new Set<number>(),instances=new Set<string>();
    return players.every((p, index) => {
      if (!record(p) || p.id !== index || typeof p.name !== 'string' || p.name.length > 100 || !integer(p.hp, 0, GAME_RULES.initialHp) || !integer(p.gold, 0, 10000) || !integer(p.shopLevel, 1, GAME_RULES.maximumShopLevel) || typeof p.locked !== 'boolean' || !Array.isArray(p.heroes) || !integer(p.heroes.length, 1, 5) || !Array.isArray(p.reserve) || p.reserve.length !== 4 || !Array.isArray(p.shop) || p.shop.length !== 12 || (p.eliminatedRound !== undefined && !integer(p.eliminatedRound, 1, state.round as number))) return false;
      const owned = new Set<string>();
      const stackValid = (s: unknown): boolean => {
        if (s === null) return true;
        if (!record(s) || typeof s.id !== 'string' || !matchIds.has(s.id) || !integer(s.points, 1, 9) || owned.has(s.id) || (s.superRound!==undefined&&(!integer(s.superRound,1,state.planningRound as number)||s.points<6))) return false;
        if(typeof s.instanceId!=='string'||!/^ability:[1-9]\d*$/.test(s.instanceId)||Number(s.instanceId.split(':')[1])>=(state.nextSkillInstance as number))return false;
        const lineage=s.lineage??[s.instanceId];if(!Array.isArray(lineage)||lineage.length<1||lineage.length>s.points||!lineage.includes(s.instanceId)||new Set(lineage).size!==lineage.length||lineage.some(id=>typeof id!=='string'||!/^ability:[1-9]\d*$/.test(id)||instances.has(id)||Number(id.split(':')[1])>=(state.nextSkillInstance as number)))return false;
        lineage.forEach(id=>instances.add(id));if(s.persistentState!==undefined&&(!validSkillState(s.persistentState)||Object.keys(s.persistentState).some(key=>!key.startsWith(s.id+':'))))return false;
        owned.add(s.id); if (countInventory) totals[s.id] += s.points;
        return true;
      };
      if (!p.heroes.every(h => {
        if (!record(h) || typeof h.id !== 'string' || h.id.length > 100 || heroIds.has(h.id) || typeof h.name !== 'string' || h.name.length > 100 || !Object.hasOwn(ROLES, String(h.role)) || !['male', 'female'].includes(String(h.skin)) || !finite(h.x, -14.57, 14.57) || !finite(h.y, -12.916, 0) || !Array.isArray(h.skills) || h.skills.length !== 4 || !h.skills.every(stackValid)) return false;
        if(h.persistentAttackBonus!==undefined&&!finite(h.persistentAttackBonus,0,1e7))return false;
        if(['persistentStrengthBonus','persistentAgilityBonus','persistentIntelligenceBonus'].some(k=>h[k]!==undefined&&!finite(h[k],0,1e7)))return false;
        if(h.persistentSkillState!==undefined&&!validSkillState(h.persistentSkillState))return false;
        heroIds.add(h.id);
        return h.skills.filter(s => s && catalog.get(s.id)!.ultimate).length <= 1;
      }) || !p.reserve.every(stackValid)) return false;
      for (const [slot,id] of p.shop.entries()) { if (id !== null) { if (slot>=shopOfferCount(p.shopLevel as number)||typeof id !== 'string' || !matchIds.has(id)||((p.shopLevel as number)<3&&catalog.get(id)!.ultimate)) return false; if (countInventory) totals[id]++; } }
      if (p.hp === 0 && (p.eliminatedRound === undefined || !integer(p.placement,1,8) || owned.size || p.shop.some(Boolean))) return false;
      if (p.hp > 0 && (p.eliminatedRound !== undefined || p.placement!==undefined || p.heroes.length !== heroCountForRound((countInventory ? state.planningRound : state.round) as number))) return false;
      if(p.placement!==undefined){if(placements.has(p.placement as number))return false;placements.add(p.placement as number);}
      return true;
    });
  };
  if (!validPlayers(state.players, true) || Object.values(totals).some(total => total !== 20)) return '存档阵容或技能库存不守恒';
  if (!integer(state.selectedHero, 0, state.players[0].heroes.length - 1)) return '存档选中英雄无效';
  if (!Array.isArray(state.battlePlayers) || !Array.isArray(state.pairs) || state.pairs.length > 4 || !Array.isArray(state.ghostPairs) || state.ghostPairs.length > 1 || new Set(state.ghostPairs).size !== state.ghostPairs.length) return '存档配对信息无效';
  if (state.phase === 'prep') {
    if (state.battlePlayers.length || state.pairs.length || state.ghostPairs.length) return '备战存档包含过期战斗';
  } else {
    if (!validPlayers(state.battlePlayers, false)) return '存档战斗快照无效';
    const charged = new Set<number>();
    for (let i = 0; i < state.pairs.length; i++) {
      const pair = state.pairs[i];
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(id => integer(id, 0, 7) && (state.battlePlayers as Player[])[id].hp > 0) || pair[0] === pair[1] || charged.has(pair[0])) return '存档配对参与者无效';
      charged.add(pair[0]);
      if (!state.ghostPairs.includes(i)) { if (charged.has(pair[1])) return '存档玩家被重复结算'; charged.add(pair[1]); }
    }
    if (state.ghostPairs.some(i => !integer(i, 0, (state.pairs as unknown[]).length - 1)) || charged.size !== state.battlePlayers.filter(p => p.hp > 0).length) return '存档影子配对不完整';
  }
  if (!Array.isArray(state.history) || state.history.length > 40000 || !state.history.every(r => validReport(r) && r.round <= (state.round as number)) || !Array.isArray(state.pendingReports) || state.pendingReports.length > 4 || !state.pendingReports.every(r => validReport(r) && r.round === state.round)) return '存档战报无效';
  if (state.phase === 'finished') {
    if (!integer(state.winner, 0, 7) || state.players.filter(p => p.hp > 0).length > 1) return '存档胜者无效';
  } else if (state.winner !== undefined || state.players.filter(p => p.hp > 0).length < 2) return '存档比赛状态无效';
  return null;
}

export function serializeGame(state: GameState): string {
  const error = validateGame(state, [...catalogFor(state).values()]);
  if (error) throw new Error(error);
  return JSON.stringify(state);
}

export function restoreGame(raw: string, defs: SkillDefinition[]): GameState | null {
  try {
    if (typeof raw !== 'string' || raw.length > 10_000_000) return null;
    const state: unknown = JSON.parse(raw);
    if (validateGame(state, defs)) return null;
    const game = state as GameState;
    bind(game, defs);
    return game;
  } catch { return null; }
}
