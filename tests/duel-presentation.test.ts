import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyDamage, createBattle, restoreBattle, serializeBattle, stepBattle } from '../src/combat';
import { duelVisuals } from '../src/duel-presentation';
import type { AssetManifest, BattleState, Player, SkillDefinition } from '../src/model';
import type { EffectStatus } from '../src/skill-effects';

const ID = 'custom_legion_commander_duel';
const definitions = JSON.parse(readFileSync('public/data/skills.json', 'utf8')) as SkillDefinition[];
const assets = JSON.parse(readFileSync('public/data/assets.json', 'utf8')) as AssetManifest;
function player(id: number, points = 9): Player {
  return { id, name: `P${id}`, hp: 100, gold: 0, shopLevel: 5, locked: false, reserve: [], shop: [],
    heroes: [0, 1].map(i => ({ id: `h${i}`, name: `H${i}`, role: 'mage', skin: 'female',
      x: i ? 11 : 0, y: i ? -10 : -1, persistentStrengthBonus: 1000,
      skills: !id && !i ? [{ id: ID, points }] : [] })) };
}
function create(points = 9) { return createBattle(player(0, points), player(1), 771, definitions); }
function start(battle: BattleState) {
  for (let i = 0; i < 90 && !duelVisuals(assets, battle).length; i++) stepBattle(battle, 1 / 30, definitions);
  expect(duelVisuals(assets, battle).length).toBeGreaterThan(0);
  const caster = battle.units[0], modifier = caster.statuses.find(s => s.kind === 'duel') as EffectStatus;
  const target = battle.units.find(unit => unit.id === modifier.data?.targetId)!;
  return { caster, target, modifier, reciprocal: target.statuses.find(s => s.kind === 'duel') as EffectStatus };
}

describe('Duel decorations follow the actual mutually forced pair', () => {
  it.each([3, 6, 9])('draws the live pair once at %i points, with isolation only for actual external reduction', points => {
    const battle = create(points);
    expect(duelVisuals(assets, battle)).toEqual([]); // Possession is not evidence.
    const { caster, target, modifier, reciprocal } = start(battle), before = JSON.stringify(battle);
    const visuals = duelVisuals(assets, battle);
    expect(visuals.filter(v => v.key.endsWith(':arena'))).toHaveLength(1);
    expect(visuals.filter(v => v.key.endsWith(':isolation'))).toHaveLength(points >= 9 ? 1 : 0);
    expect(modifier.data?.externalReduction).toBe(points >= 9 ? .8 : 0);
    expect(reciprocal.data?.externalReduction).toBe(points >= 9 ? .8 : 0);
    expect(visuals.every(v => v.x === (caster.x + target.x) / 2 && v.y === (caster.y + target.y) / 2)).toBe(true);
    expect(visuals.every(v => [v.age, v.size, v.height, v.angle, v.z].every(Number.isFinite))).toBe(true);
    expect(visuals.every(v => v.loop)).toBe(true);
    expect(duelVisuals(assets, { ...battle, units: [...battle.units].reverse() })).toEqual(visuals);
    expect(JSON.stringify(battle)).toBe(before); // No barriers, RNG, position, or combat mutations.
  });
  it('does not paint Gaben isolation after reduction is absent on either participant', () => {
    const battle = create(), { modifier, reciprocal } = start(battle);
    modifier.data!.externalReduction = 0;
    expect(duelVisuals(assets, battle).map(v => v.key.split(':').at(-1))).toEqual(['arena']);
    modifier.data!.externalReduction = .8; reciprocal.data!.externalReduction = 0;
    expect(duelVisuals(assets, battle)).toHaveLength(1);
    reciprocal.data!.externalReduction = .8;
    expect(duelVisuals(assets, battle)).toHaveLength(2);
  });
  it('uses live positions and pair direction without moving bodies to preview coordinates', () => {
    const battle = create(), { caster, target } = start(battle), original = duelVisuals(assets, battle);
    caster.x = -3; caster.y = 2; target.x = 5; target.y = 2;
    const visuals = duelVisuals(assets, battle);
    expect(visuals.map(v => v.key)).toEqual(original.map(v => v.key));
    expect(visuals.every(v => v.x === 1 && v.y === 2 && v.angle === 0)).toBe(true);
    expect(visuals.every((v, i) => v.size > original[i].size && v.height === original[i].height)).toBe(true);
    expect([caster.x, caster.y, target.x, target.y]).toEqual([-3, 2, 5, 2]);
  });
  it.each(['caster', 'target', 'both'] as const)('cleans decorations immediately when %s dies', who => {
    const battle = create(), { caster, target } = start(battle);
    if (who !== 'target') applyDamage(battle, target, caster, 1e9, 'pure');
    if (who !== 'caster') applyDamage(battle, battle.units[1], target, 1e9, 'pure');
    expect(duelVisuals(assets, battle)).toEqual([]);
  });
  it('cleans a stale asymmetric pair, expiry and finished battle without needing a renderer clock', () => {
    const battle = create(), { target, modifier, reciprocal } = start(battle);
    expect(duelVisuals(assets, battle, Math.min(modifier.until, reciprocal.until))).toEqual([]);
    expect(duelVisuals(assets, { ...battle, finished: true })).toEqual([]);
    target.statuses = target.statuses.filter(s => s !== reciprocal);
    expect(duelVisuals(assets, battle)).toEqual([]);
  });
  it('expires after an actual simulated duel ends and respects blocked casts', () => {
    const battle = create(), { modifier, reciprocal } = start(battle);
    stepBattle(battle, Math.max(modifier.until, reciprocal.until) - battle.time + .2, definitions);
    expect(duelVisuals(assets, battle)).toEqual([]);
    const blocked = create(); blocked.units[2].statuses.push({ kind: 'spellBlock', until: 100 });
    stepBattle(blocked, 1, definitions);
    expect(blocked.events.some(event => event.status === 'spellBlocked')).toBe(true);
    expect(duelVisuals(assets, blocked)).toEqual([]);
  });
  it('has identical keys, animation age and pair positions after deterministic restoration', () => {
    const battle = create(); start(battle); stepBattle(battle, .4, definitions);
    const restored = restoreBattle(serializeBattle(battle), definitions);
    expect(duelVisuals(assets, restored)).toEqual(duelVisuals(assets, battle));
    expect(duelVisuals(assets, battle).every(v => v.age > .3 && v.age < .6)).toBe(true);
  });
});
