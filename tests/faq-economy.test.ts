import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameState, SkillDefinition, SkillStack } from '../src/model';
import { buySkill, finishRound, lockShop, moveSkill, newGame, prepareRound, rerollShop,
  sellSkill, serializeGame, startRound, upgradeShop, validateGame } from '../src/game';

const defs = JSON.parse(readFileSync(new URL('../public/data/skills.json', import.meta.url), 'utf8')) as SkillDefinition[];
const catalog = new Map(defs.map(d => [d.id, d]));
function assertInventory(state: GameState) {
  expect(validateGame(state, defs)).toBeNull();
  for (const { id } of defs) {
    const held = state.players.reduce((n, p) => n + p.shop.filter(s => s === id).length +
      [...p.reserve, ...p.heroes.flatMap(h => h.skills)].reduce((sum, s) => sum + (s?.id === id ? s.points : 0), 0), 0);
    expect(state.pool[id] + held, id).toBe(20);
  }
}
function nextRound(state: GameState) {
  expect(startRound(state, defs)).toBeNull();
  expect(finishRound(state, state.pairs.map(([a, b]) => ({ round: state.round, a, b,
    winner: a, damage: 1, duration: 1, survivors: 1, stats: [] })))).toBeNull();
  expect(prepareRound(state, defs)).toBeNull();
}
function twoHeroes(seed = 126789) {
  const state = newGame(seed, 1, defs); nextRound(state); nextRound(state);
  expect(state.players[0].heroes).toHaveLength(2); state.players[0].gold = 1000;
  return state;
}
function buyDistinct(state: GameState, count: number) {
  const player = state.players[0], bought: SkillStack[] = [];
  for (let attempts = 0; bought.length < count && attempts < 150; attempts++) {
    const owned = new Set([...player.reserve, ...player.heroes.flatMap(h => h.skills)].filter(Boolean).map(s => s!.id));
    const index = player.shop.findIndex(id => !!id && !owned.has(id) && !catalog.get(id)!.ultimate);
    if (index < 0) { expect(rerollShop(state, 0)).toBeNull(); continue; }
    const id = player.shop[index]!; expect(buySkill(state, 0, index)).toBeNull();
    bought.push(player.heroes.flatMap(h => h.skills).find(s => s?.id === id)!);
  }
  expect(bought).toHaveLength(count); return bought;
}
function unchanged(state: GameState, action: () => string | null) {
  const before = serializeGame(state); expect(action()).not.toBeNull(); expect(serializeGame(state)).toBe(before);
}

describe('official FAQ match pool with the real 230-skill catalog', () => {
  it('samples 100 distinct skills reproducibly and changes the selected set with the seed', () => {
    expect(defs).toHaveLength(230);
    const a = newGame(743, 1, defs), same = newGame(743, 1, defs), other = newGame(7919, 1, defs);
    expect(a.matchSkillIds).toHaveLength(100); expect(new Set(a.matchSkillIds).size).toBe(100);
    expect(a.matchSkillIds.every(id => catalog.has(id))).toBe(true);
    expect(a.matchSkillIds).toEqual(same.matchSkillIds); expect(a.players.map(p => p.shop)).toEqual(same.players.map(p => p.shop));
    expect([...a.matchSkillIds].sort()).not.toEqual([...other.matchSkillIds].sort());
    for (const state of [a, same, other]) {
      expect(state.players.flatMap(p => p.shop).filter(Boolean).every(id => state.matchSkillIds.includes(id!))).toBe(true);
      assertInventory(state);
    }
  });
  it('includes both categories without silently enforcing an 80/20 split', () => {
    const ultimateCounts = [1, 2, 3, 743, 7919, 126789, 937281, 0x9e3779b9].map(seed => {
      const ids = newGame(seed, 1, defs).matchSkillIds, count = ids.filter(id => catalog.get(id)!.ultimate).length;
      expect(count).toBeGreaterThan(0); expect(count).toBeLessThan(100); return count;
    });
    expect(new Set(ultimateCounts).size).toBeGreaterThan(1);
    expect(ultimateCounts.some(n => n !== 20)).toBe(true);
  });
});

describe('five-level shop and inactive God positions', () => {
  it('offers 4/6/6/8/10 real purchasable positions while both God positions stay empty and reject purchases', () => {
    const state = newGame(743, 1, defs), p = state.players[0]; p.gold = 1000;
    for (const [index, count] of [4, 6, 6, 8, 10].entries()) {
      if (index) expect(upgradeShop(state, 0)).toBeNull();
      expect(p.shopLevel).toBe(index + 1); expect(p.shop).toHaveLength(12);
      expect(p.shop.slice(0, count).every(Boolean)).toBe(true);
      expect(p.shop.slice(count)).toEqual(Array(12 - count).fill(null));
      unchanged(state, () => buySkill(state, 0, 10)); unchanged(state, () => buySkill(state, 0, 11));
      if (count < 10) unchanged(state, () => buySkill(state, 0, count));
      assertInventory(state);
    }
    unchanged(state, () => upgradeShop(state, 0));
  });
  it('never offers ultimates below level three and can offer them after a level-three reroll', () => {
    const state = newGame(7919, 1, defs), p = state.players[0]; p.gold = 1000;
    for (let level = 1; level <= 2; level++) {
      if (level === 2) expect(upgradeShop(state, 0)).toBeNull();
      for (let n = 0; n < 30; n++) {
        expect(p.shop.filter(Boolean).every(id => !catalog.get(id!)!.ultimate)).toBe(true);
        expect(rerollShop(state, 0)).toBeNull();
      }
    }
    const before = [...p.shop]; expect(upgradeShop(state, 0)).toBeNull(); expect(p.shop).toEqual(before);
    let seen = false;
    for (let n = 0; n < 30; n++) { expect(rerollShop(state, 0)).toBeNull(); seen ||= p.shop.some(id => !!id && catalog.get(id)!.ultimate); }
    expect(seen).toBe(true); expect(p.shop.slice(6)).toEqual(Array(6).fill(null)); assertInventory(state);
  });
  it('fills only newly unlocked positions, preserving purchased holes and locked existing offers', () => {
    const state = newGame(743, 1, defs), p = state.players[0]; p.gold = 1000;
    expect(buySkill(state, 0, 0)).toBeNull(); expect(lockShop(state, 0, true)).toBeNull();
    let oldCount = 4;
    for (const newCount of [6, 6, 8, 10]) {
      const oldOffers = p.shop.slice(0, oldCount); expect(upgradeShop(state, 0)).toBeNull();
      expect(p.shop.slice(0, oldCount)).toEqual(oldOffers); expect(p.shop[0]).toBeNull(); expect(p.locked).toBe(true);
      expect(p.shop.slice(oldCount, newCount).every(Boolean)).toBe(true); oldCount = newCount;
    }
    const retained = [...p.shop]; unchanged(state, () => rerollShop(state, 0)); expect(p.shop).toEqual(retained); assertInventory(state);
  });
});

describe('FAQ movement fees and permanent ability ownership', () => {
  it('charges hero-to-reserve once and permits free reserve-to-hero and internal ordering', () => {
    const state = twoHeroes(), p = state.players[0], [first, second] = buyDistinct(state, 2); p.gold = 10;
    expect(moveSkill(state, 0, { hero: 0, slot: 0 }, { hero: 0, slot: 1 })).toBeNull(); expect(p.gold).toBe(10);
    expect(p.heroes[0].skills.slice(0, 2).map(s => s?.id)).toEqual([second.id, first.id]);
    expect(moveSkill(state, 0, { hero: 0, slot: 1 }, { reserve: 0 })).toBeNull(); expect(p.gold).toBe(9);
    expect(moveSkill(state, 0, { reserve: 0 }, { reserve: 3 })).toBeNull(); expect(p.gold).toBe(9);
    expect(p.reserve[0]).toBeNull(); expect(p.reserve[3]?.id).toBe(first.id);
    expect(moveSkill(state, 0, { reserve: 3 }, { hero: 1, slot: 3 })).toBeNull(); expect(p.gold).toBe(9);
    expect(p.heroes[1].skills[3]?.id).toBe(first.id); expect(p.reserve[3]).toBeNull(); assertInventory(state);
  });
  it('charges one gold for a cross-hero swap, not one for each displaced spell', () => {
    const state = twoHeroes(), p = state.players[0], [first, second] = buyDistinct(state, 2);
    expect(moveSkill(state, 0, { hero: 0, slot: 1 }, { hero: 1, slot: 0 })).toBeNull(); p.gold = 10;
    expect(moveSkill(state, 0, { hero: 0, slot: 0 }, { hero: 1, slot: 0 })).toBeNull();
    expect(p.gold).toBe(9); expect(p.heroes[0].skills[0]?.id).toBe(second.id); expect(p.heroes[1].skills[0]?.id).toBe(first.id);
    assertInventory(state);
  });
  it('rejects unaffordable buy/upgrade/reroll/moves atomically, while free movements still work at zero gold', () => {
    const state = twoHeroes(), p = state.players[0]; buyDistinct(state, 3);
    expect(moveSkill(state, 0, { hero: 0, slot: 2 }, { reserve: 0 })).toBeNull(); p.gold = 0;
    unchanged(state, () => moveSkill(state, 0, { hero: 0, slot: 0 }, { reserve: 1 }));
    unchanged(state, () => moveSkill(state, 0, { hero: 0, slot: 0 }, { hero: 1, slot: 0 }));
    unchanged(state, () => moveSkill(state, 0, { reserve: 0 }, { hero: 0, slot: 0 }));
    unchanged(state, () => buySkill(state, 0, p.shop.findIndex(Boolean)));
    unchanged(state, () => upgradeShop(state, 0)); unchanged(state, () => rerollShop(state, 0));
    expect(moveSkill(state, 0, { hero: 0, slot: 0 }, { hero: 0, slot: 1 })).toBeNull();
    expect(moveSkill(state, 0, { reserve: 0 }, { hero: 1, slot: 0 })).toBeNull(); expect(p.gold).toBe(0); assertInventory(state);
  });
  it('moves existing permanent state with the stack and gives a sold/rebought skill no old state', () => {
    const id = 'custom_pudge_flesh_heap';
    const seed = Array.from({ length: 64 }, (_, n) => Math.imul(n + 1, 0x9e3779b9) >>> 0)
      .find(seed => newGame(seed, 1, defs).matchSkillIds.includes(id));
    expect(seed).toBeDefined(); const state = twoHeroes(seed!), p = state.players[0];
    const buyHeap = () => {
      for (let n = 0; n < 150; n++) {
        const slot = p.shop.indexOf(id);
        if (slot >= 0) { expect(buySkill(state, 0, slot)).toBeNull(); return; }
        expect(rerollShop(state, 0)).toBeNull();
      }
      throw new Error('Flesh Heap never appeared in the deterministic shared-pool draws');
    };
    buyHeap(); const acquired = p.heroes[0].skills.find(s => s?.id === id)!;
    // Seed an already earned skill-specific reward; battle settlement/lineage
    // is tested separately. Every economic action below uses the public API.
    acquired.persistentState = { [`${id}:strength`]: 8 };
    const original = structuredClone(acquired), slot = p.heroes[0].skills.indexOf(acquired);
    expect(moveSkill(state, 0, { hero: 0, slot }, { reserve: 0 })).toBeNull(); expect(p.reserve[0]).toEqual(original);
    expect(moveSkill(state, 0, { reserve: 0 }, { hero: 1, slot: 0 })).toBeNull(); expect(p.heroes[1].skills[0]).toEqual(original);
    expect(sellSkill(state, 0, { hero: 1, slot: 0 })).toBeNull(); expect(p.heroes[1].skills[0]).toBeNull();
    buyHeap(); const fresh = p.heroes.flatMap(h => h.skills).find(s => s?.id === id)!;
    expect(fresh.points).toBe(1); expect(fresh.persistentState).toBeUndefined(); expect(fresh.instanceId).not.toBe(original.instanceId);
    assertInventory(state);
  });
});
