import { describe, expect, it } from 'vitest';
import type { GameState, RoundReport, SkillDefinition } from '../src/model';
import { buySkill, changeRole, finishRound, GAME_RULES, getBattlePlayers, lockShop, moveSkill, newGame, prepareRound, rerollShop, restoreGame, roundIncome, sellSkill, serializeGame, shopUpgradeCost, startRound, upgradeShop, validateGame } from '../src/game';

const defs: SkillDefinition[] = Array.from({ length: 40 }, (_, i) => ({
  id: `skill_${i}`, name: `技能${i}`, nameEn: `Skill ${i}`, tags: [i % 2 ? 'attack' : 'magic'],
  categories: [], description: '测试技能', descriptionEn: i % 2 ? 'Attack speed and critical damage' : 'Magic damage and healing',
  super: 'Super', gaben: 'Gaben', values: ['100'], cooldowns: [5], mana: [50], icon: '', passive: i % 3 === 0, ultimate: i >= 30,
}));

// Independent accounting: the active fight is a snapshot, never another owner.
function copies(state: GameState, id: string): number {
  return state.pool[id] + state.players.reduce((sum, p) => sum + p.shop.filter(s => s === id).length + [...p.reserve, ...p.heroes.flatMap(h => h.skills)].reduce((n, stack) => n + (stack?.id === id ? stack.points : 0), 0), 0);
}
function expectConservation(state: GameState): void {
  for (const def of defs) expect(copies(state, def.id), def.id).toBe(20);
  expect(validateGame(state, defs)).toBeNull();
}
function offer(state: GameState, player: number, id: string, index = 0): void {
  const p = state.players[player];
  if (p.shop[index]) state.pool[p.shop[index]!]++;
  p.shop[index] = null;
  expect(state.pool[id]).toBeGreaterThan(0);
  state.pool[id]--; p.shop[index] = id;
}
function reports(state: GameState, damage = 1): RoundReport[] {
  return state.pairs.map(([a, b]) => ({ round: state.round, a, b, winner: a, damage, duration: 4, survivors: 1, stats: [] }));
}
function advance(state: GameState, damage = 1): void {
  expect(startRound(state, defs)).toBeNull();
  expect(finishRound(state, reports(state, damage))).toBeNull();
  if (state.phase !== 'finished') expect(prepareRound(state, defs)).toBeNull();
}

describe('shared inventory and transactions', () => {
  it('keeps every copy across buying nine points, failed tenth purchase, selling and rerolling', () => {
    const state = newGame(12, 1.5, defs), player = state.players[0];
    player.gold = 1000;
    for (let n = 0; n < 9; n++) { offer(state, 0, 'skill_0'); expect(buySkill(state, 0, 0)).toBeNull(); }
    expect(player.heroes[0].skills[0]).toMatchObject({ id: 'skill_0', points: 9, superRound: 1 });
    offer(state, 0, 'skill_0');
    const before = serializeGame(state);
    expect(buySkill(state, 0, 0)).toContain('Gaben');
    expect(serializeGame(state)).toBe(before);
    const gold = player.gold;
    expect(sellSkill(state, 0, { hero: 0, slot: 0 })).toBeNull();
    expect(player.gold - gold).toBe(18);
    expect(rerollShop(state, 0)).toBeNull();
    expectConservation(state);
  });

  it('rejects a full inventory purchase without charging or consuming the offer', () => {
    const state = newGame(7, 1, defs); state.players[0].gold = 100;
    for (let i = 0; i < 8; i++) { offer(state, 0, `skill_${i}`); expect(buySkill(state, 0, 0)).toBeNull(); }
    offer(state, 0, 'skill_8'); const before = serializeGame(state);
    expect(buySkill(state, 0, 0)).toContain('已满');
    expect(serializeGame(state)).toBe(before);
    expectConservation(state);
  });

  it('allows rearranging an ultimate within its hero but rejects equipping a second', () => {
    const state = newGame(2, 1, defs); state.players[0].gold = 100;
    expect(upgradeShop(state, 0)).toBeNull(); expect(upgradeShop(state, 0)).toBeNull();
    offer(state, 0, 'skill_30'); expect(buySkill(state, 0, 0)).toBeNull();
    offer(state, 0, 'skill_31'); expect(buySkill(state, 0, 0)).toBeNull();
    expect(moveSkill(state, 0, { hero: 0, slot: 0 }, { hero: 0, slot: 2 })).toBeNull();
    const before = serializeGame(state);
    expect(moveSkill(state, 0, { reserve: 0 }, { hero: 0, slot: 0 })).toContain('终极');
    expect(serializeGame(state)).toBe(before);
    expectConservation(state);
  });

  it('locks reserved stock across rounds and only unlocks on an explicit action', () => {
    const state = newGame(31, 2, defs), shop = [...state.players[0].shop];
    expect(lockShop(state, 0, true)).toBeNull();
    const before = serializeGame(state);
    expect(rerollShop(state, 0)).toContain('解除');
    expect(serializeGame(state)).toBe(before);
    expect(startRound(state, defs)).toBeNull();
    expect(state.players[0].shop).toEqual(shop);
    expectConservation(state);
  });
});

describe('round planning and deterministic AI', () => {
  it('pays next-round income once, does not carry balances, and survives repeated transition calls', () => {
    const state = newGame(10, 1.5, defs);
    expect(state.players[0].gold).toBe(6); expect(state.players[1].gold).toBe(9);
    expect(startRound(state, defs)).toBeNull();
    expect(state.round).toBe(1); expect(state.planningRound).toBe(2);
    expect(state.players[0].gold).toBe(8); expect(state.players[1].gold).toBe(12);
    expect(buySkill(state, 0, state.players[0].shop.findIndex(Boolean))).toBeNull();
    const before = serializeGame(state);
    expect(startRound(state, defs)).not.toBeNull(); expect(prepareRound(state, defs)).not.toBeNull();
    expect(serializeGame(state)).toBe(before);
    expect(finishRound(state, reports(state))).toBeNull();
    expect(prepareRound(state, defs)).toBeNull(); expect(prepareRound(state, defs)).toBeNull();
    expect(state.round).toBe(2); expect(state.players[0].gold).toBe(5);
    expectConservation(state);
  });

  it('keeps the current battle unchanged by next-round sales, role changes and purchases', () => {
    const state = newGame(25, 1, defs);
    offer(state, 0, 'skill_0'); expect(buySkill(state, 0, 0)).toBeNull();
    expect(startRound(state, defs)).toBeNull();
    const snapshot = getBattlePlayers(state);
    expect(sellSkill(state, 0, { hero: 0, slot: 0 })).toBeNull();
    expect(changeRole(state, 0, 0, 'mage')).toBeNull();
    offer(state, 0, 'skill_1'); expect(buySkill(state, 0, 0)).toBeNull();
    expect(state.battlePlayers).toEqual(snapshot);
    snapshot[0].heroes[0].skills.fill(null);
    expect(state.battlePlayers[0].heroes[0].skills[0]?.id).toBe('skill_0');
    expectConservation(state);
  });

  it('reproduces a long game and keeps AI budgets, formations and stock valid', () => {
    const a = newGame(1453, 2, defs), b = newGame(1453, 2, defs);
    for (let round = 1; round <= 12; round++) {
      for (const state of [a, b]) {
        expect(startRound(state, defs)).toBeNull();
        expect(state.battlePlayers.slice(1).every(p => p.gold === 0)).toBe(true);
        expectConservation(state);
        expect(finishRound(state, reports(state))).toBeNull();
        expect(prepareRound(state, defs)).toBeNull();
      }
      expect(serializeGame(a)).toBe(serializeGame(b));
    }
    expect(a.players.every(p => p.heroes.length === 5)).toBe(true);
    expect(new Set(a.players[0].heroes.map(h => h.role)).size).toBeLessThan(5);
    expect(roundIncome(50)).toBe(20);
    expect(shopUpgradeCost(a, 0)).toBe(0);
  });
});

describe('matches, ghosts and elimination', () => {
  it('keeps an early eliminated player’s placement after spectating the eventual champion',()=>{const state=newGame(91,1,defs);let originalRank:number|undefined;
    for(let r=0;r<4&&state.phase!=='finished';r++){expect(startRound(state,defs)).toBeNull();const list=reports(state,100).map(report=>({...report,winner:report.a===0?report.b:report.a}));expect(finishRound(state,list)).toBeNull();if(r===0){originalRank=state.players[0].placement;expect(originalRank).toBeGreaterThan(4);}expect(state.players[0].placement).toBe(originalRank);if((state as GameState).phase!=='finished')expect(prepareRound(state,defs)).toBeNull();}
    expect(state.phase).toBe('finished');const ranks=state.players.map(p=>p.id===state.winner?1:p.placement).sort((a,b)=>a!-b!);expect(ranks).toEqual([1,2,3,4,5,6,7,8]);expect(restoreGame(serializeGame(state),defs)?.players[0].placement).toBe(originalRank);
  });
  it('ranks simultaneous final eliminations using pre-clamp HP then stable seat order',()=>{const state=newGame(92,1,defs);state.players.forEach(p=>p.hp=1);expect(startRound(state,defs)).toBeNull();expect(finishRound(state,reports(state,5).map(r=>({...r,winner:null})))).toBeNull();expect(state.winner).toBe(0);expect(state.players.map(p=>p.placement)).toEqual([1,2,3,4,5,6,7,8]);expect(validateGame(state,defs)).toBeNull();});
  it('rejects missing, repeated or mismatched reports atomically', () => {
    const state = newGame(42, 1, defs); expect(startRound(state, defs)).toBeNull();
    const list = reports(state), before = serializeGame(state);
    expect(finishRound(state, list.slice(1))).not.toBeNull();
    expect(finishRound(state, [list[0], list[0], list[2], list[3]])).not.toBeNull();
    expect(serializeGame(state)).toBe(before);
    expect(finishRound(state, [...list].reverse())).toBeNull();
    const done = serializeGame(state);
    expect(finishRound(state, list)).not.toBeNull(); expect(serializeGame(state)).toBe(done);
  });

  it('returns eliminated copies and never deducts the shadow donor a second time', () => {
    const state = newGame(41, 1.5, defs); expect(startRound(state, defs)).toBeNull();
    const first = reports(state); first[0].damage = 100;
    const eliminated = first[0].b;
    expect(finishRound(state, first)).toBeNull();
    expect(state.players[eliminated].hp).toBe(0);
    expect(state.players[eliminated].shop.every(s => s === null)).toBe(true);
    expectConservation(state);
    expect(prepareRound(state, defs)).toBeNull(); expect(startRound(state, defs)).toBeNull();
    expect(state.ghostPairs).toHaveLength(1);
    const ghost = state.ghostPairs[0], donor = state.pairs[ghost][1];
    const list = reports(state, 17);
    for (let i = 0; i < list.length; i++) if (i !== ghost && (list[i].a === donor || list[i].b === donor)) list[i].winner = donor;
    list[ghost].winner = list[ghost].a;
    const hp = state.players[donor].hp;
    expect(finishRound(state, list)).toBeNull();
    expect(state.players[donor].hp).toBe(hp);
    expectConservation(state);
  });

  it('finishes an eight-player tournament and blocks all further economic actions', () => {
    const state = newGame(9, 1, defs);
    for (let round = 0; round < 3; round++) {
      expect(startRound(state, defs)).toBeNull();
      const list = reports(state, 100).map(r => ({ ...r, winner: r.a === 0 || r.b === 0 ? 0 : r.a }));
      expect(finishRound(state, list)).toBeNull();
      expectConservation(state);
      if (round < 2) expect(prepareRound(state, defs)).toBeNull();
    }
    expect(state.phase).toBe('finished'); expect(state.winner).toBe(0);
    const before = serializeGame(state);
    expect(rerollShop(state, 0)).not.toBeNull(); expect(buySkill(state, 0, 0)).not.toBeNull();
    expect(startRound(state, defs)).not.toBeNull(); expect(serializeGame(state)).toBe(before);
  });
});

describe('save compatibility and recovery', () => {
  it('resumes a battle and planning state without drawing or paying again', () => {
    const original = newGame(67, 1.5, defs); advance(original);
    expect(startRound(original, defs)).toBeNull();
    expect(buySkill(original, 0, original.players[0].shop.findIndex(Boolean))).toBeNull();
    const raw = serializeGame(original), restored = restoreGame(raw, defs)!;
    expect(restored).not.toBeNull(); expect(serializeGame(restored)).toBe(raw);
    for (const game of [original, restored]) {
      expect(finishRound(game, reports(game))).toBeNull(); expect(prepareRound(game, defs)).toBeNull();
      expect(startRound(game, defs)).toBeNull();
    }
    expect(serializeGame(restored)).toBe(serializeGame(original));
  });

  it('rejects forged inventory, wrong phases, unknown content, invalid coordinates and malformed JSON', () => {
    const state = newGame(1, 1, defs), raw = serializeGame(state);
    const changes = [
      (s: GameState) => { s.pool.skill_0++; },
      (s: GameState) => { s.planningRound++; },
      (s: GameState) => { s.players[0].shop[0] = 'unknown'; },
      (s: GameState) => { s.players[0].heroes[0].x = 9999; },
      (s: GameState) => { s.players[0].gold = -3; },
      (s: GameState) => { s.rng = 0; },
      (s: GameState) => { s.version = 99; },
    ];
    for (const change of changes) { const invalid: GameState = JSON.parse(raw); change(invalid); expect(restoreGame(JSON.stringify(invalid), defs)).toBeNull(); }
    expect(restoreGame(raw, defs.map((d, i) => i === 0 ? { ...d, ultimate: !d.ultimate } : d))).toBeNull();
    expect(restoreGame('{broken', defs)).toBeNull();
    expect(GAME_RULES.copiesPerSkill).toBe(20);
  });
});
