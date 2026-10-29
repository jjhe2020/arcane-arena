import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBattle, restoreBattle, serializeBattle, stepBattle } from '../src/combat';
import { activeVisualProjectiles, addVisualProjectile, moveVisualProjectile, visualProjectilePosition } from '../src/combat/visual-state';
import type { BattleState, Player, SkillDefinition } from '../src/model';

const definitions = JSON.parse(readFileSync('public/data/skills.json', 'utf8')) as SkillDefinition[];
const skillIds = ['custom_drow_ranger_multishot', 'beastmaster_wild_axes', 'custom_shredder_chakram', 'custom_snapfire_mortimer_kisses', 'kunkka_ghostship'];
function player(id: number, skill?: string, points = 9): Player {
  return { id, name: `P${id}`, hp: 100, gold: 0, shopLevel: 5, locked: false, reserve: [], shop: [], heroes: [0, 1].map(i => ({ id: `h${i}`, name: `H${i}`, role: 'archer', skin: 'female', x: i ? 12 : 0, y: i ? -10 : -3.5, persistentStrengthBonus: 100, skills: skill && !i ? [{ id: skill, points }] : [] })) };
}
const create = (skill: string, points = 9) => createBattle(player(0, skill, points), player(1), 871, definitions);
function reachFlight(battle: BattleState, skill: string, catalog = definitions) {
  for (let i = 0; i < 180 && !activeVisualProjectiles(battle).some(p => p.skill === skill); i++) stepBattle(battle, 1 / 30, catalog);
  const flight = activeVisualProjectiles(battle).filter(p => p.skill === skill);
  expect(flight.length, `${skill} never exposed a real launch`).toBeGreaterThan(0);
  return flight;
}
function mechanics(battle: BattleState) {
  const { visualProjectiles: _visuals, nextVisualProjectile: _next, ...actual } = JSON.parse(serializeBattle(battle));
  return actual;
}

describe('real skill motion metadata', () => {
  it.each(skillIds)('%s has finite, distinct live positions and deterministic save/replay', skill => {
    const battle = create(skill), flight = reachFlight(battle, skill);
    expect(new Set(flight.map(p => p.id)).size).toBe(flight.length);
    expect(flight.every(p => [p.x, p.y, p.angle, p.createdAt, p.until].every(Number.isFinite) && p.until > battle.time)).toBe(true);
    const restored = restoreBattle(serializeBattle(battle), definitions);
    expect(activeVisualProjectiles(restored)).toEqual(activeVisualProjectiles(battle));
    stepBattle(battle, 1.5, definitions); stepBattle(restored, 1.5, definitions);
    expect(mechanics(restored)).toEqual(mechanics(battle));
    expect(activeVisualProjectiles(restored)).toEqual(activeVisualProjectiles(battle));
  });
  it.each(skillIds)('%s rendering metadata can be discarded without changing damage, RNG, events or results', skill => {
    const withMetadata = create(skill), discarded = create(skill);
    for (let i = 0; i < 240; i++) {
      stepBattle(withMetadata, 1 / 30, definitions); stepBattle(discarded, 1 / 30, definitions);
      delete discarded.visualProjectiles; delete discarded.nextVisualProjectile;
    }
    expect(mechanics(discarded)).toEqual(mechanics(withMetadata));
  });
  it('released Multishot arrows survive interruption, but cancelled salvos create no visual flights', () => {
    const battle = create('custom_drow_ranger_multishot', 3), flights = reachFlight(battle, 'custom_drow_ranger_multishot');
    const count = battle.nextVisualProjectile;
    battle.units[0].statuses.push({ kind: 'stun', until: battle.time + 5 });
    stepBattle(battle, 1 / 30, definitions);
    expect(activeVisualProjectiles(battle).some(p => flights.some(f => f.id === p.id))).toBe(true);
    stepBattle(battle, 2, definitions);
    expect(battle.nextVisualProjectile).toBe(count);
    expect(activeVisualProjectiles(battle).filter(p => p.skill === 'custom_drow_ranger_multishot')).toEqual([]);
  });
  it('Wild Axes continue on actual out-and-back paths after source death and clean up at completion', () => {
    const battle = create('beastmaster_wild_axes', 3), flight = reachFlight(battle, 'beastmaster_wild_axes');
    expect(flight).toHaveLength(2);
    battle.units[0].dead = true; battle.units[0].hp = 0;
    stepBattle(battle, .5, definitions);
    const moved = activeVisualProjectiles(battle).filter(p => p.skill === 'beastmaster_wild_axes');
    expect(moved).toHaveLength(2); expect(moved[0].x).not.toBe(moved[1].x);
    stepBattle(battle, 1.1, definitions);
    expect(activeVisualProjectiles(battle).filter(p => p.skill === 'beastmaster_wild_axes')).toEqual([]);
  });
  it('Chakram follows the live saw and stops showing when its source clock dies', () => {
    const battle = create('custom_shredder_chakram', 3), [flight] = reachFlight(battle, 'custom_shredder_chakram'), start = { x: flight.x, y: flight.y };
    stepBattle(battle, .2, definitions); expect({ x: flight.x, y: flight.y }).not.toEqual(start);
    battle.units[0].dead = true; battle.units[0].hp = 0;
    expect(activeVisualProjectiles(battle).filter(p => p.skill === 'custom_shredder_chakram')).toEqual([]);
  });
  it('a returned Chakram removes its visual rather than leaving a parked disc', () => {
    const battle = create('custom_shredder_chakram', 3); reachFlight(battle, 'custom_shredder_chakram');
    battle.units[0].mana = 0; stepBattle(battle, 4, definitions);
    expect(battle.units[0].mainChakramBlades).toBe(0);
    expect(activeVisualProjectiles(battle).filter(p => p.skill === 'custom_shredder_chakram')).toEqual([]);
  });
  it('a launched Ghostship moves after its source death and is removed at the real crash', () => {
    const battle = create('kunkka_ghostship', 3), [ship] = reachFlight(battle, 'kunkka_ghostship'), initial = { x: ship.x, y: ship.y };
    battle.units[0].dead = true; battle.units[0].hp = 0; stepBattle(battle, .3, definitions);
    expect(activeVisualProjectiles(battle).some(p => p.id === ship.id)).toBe(true);
    expect({ x: ship.x, y: ship.y }).not.toEqual(initial);
    stepBattle(battle, 4, definitions);
    expect(activeVisualProjectiles(battle).some(p => p.id === ship.id)).toBe(false);
  });
  it('Kisses exposes frozen launch and landing coordinates using the real impact deadline', () => {
    const battle = create('custom_snapfire_mortimer_kisses', 3), [flight] = reachFlight(battle, 'custom_snapfire_mortimer_kisses');
    expect(flight.arrival! - flight.createdAt).toBeCloseTo(.6);
    const midpoint = visualProjectilePosition(flight, flight.createdAt + .3);
    expect(midpoint.x).toBeCloseTo((flight.origin!.x + flight.destination!.x) / 2);
    expect(midpoint.y).toBeCloseTo((flight.origin!.y + flight.destination!.y) / 2);
    battle.units[0].dead = true; battle.units[0].hp = 0;
    expect(activeVisualProjectiles(battle).some(p => p.id === flight.id)).toBe(true);
    stepBattle(battle, .7, definitions);
    expect(activeVisualProjectiles(battle).some(p => p.id === flight.id)).toBe(false);
  });
  it('the granted Tidal Wave preserves its child identity and selects only the parent wave atlas', () => {
    const battle = create('kunkka_ghostship', 6), [wave] = reachFlight(battle, 'aa_granted_tidal_wave');
    expect(wave.artSkill).toBe('kunkka_ghostship'); expect(wave.layer).toBe('tidal_wave');
    const before = { x: wave.x, y: wave.y }; stepBattle(battle, .2, definitions);
    expect({ x: wave.x, y: wave.y }).not.toEqual(before);
    const restored = restoreBattle(serializeBattle(battle), definitions);
    expect(activeVisualProjectiles(restored)).toEqual(activeVisualProjectiles(battle));
    stepBattle(battle, 1.5, definitions); expect(activeVisualProjectiles(battle).some(p => p.id === wave.id)).toBe(false);
  });
  it('a spit projectile follows the actual hidden passenger instead of a preview path', () => {
    const owner = player(0, 'custom_snapfire_mortimer_kisses', 6); owner.heroes[1].x = 1; owner.heroes[1].y = -3.5;
    // Keep the parent barrage unaffordable so its channel does not take priority
    // over the independently granted child; retain this fixture in replay data.
    const catalog = definitions.map(d => d.id === 'custom_snapfire_mortimer_kisses' ? { ...d, mana: [1e6] } : d);
    const battle = createBattle(owner, player(1), 871, catalog), [glob] = reachFlight(battle, 'aa_granted_gobble_up', catalog);
    expect(glob.artSkill).toBe('custom_snapfire_mortimer_kisses'); expect(glob.layer).toBe('projectile');
    stepBattle(battle, .1, catalog);
    const passenger = battle.units.find(u => u.id.endsWith(':h1') && u.side === 0)!;
    expect({ x: glob.x, y: glob.y }).toEqual({ x: passenger.x, y: passenger.y });
    const restored = restoreBattle(serializeBattle(battle), catalog);
    expect(activeVisualProjectiles(restored)).toEqual(activeVisualProjectiles(battle));
    stepBattle(battle, 2, catalog); expect(activeVisualProjectiles(battle).some(p => p.id === glob.id)).toBe(false);
  });
  it('expired metadata cannot render and a renewed real clock can re-register its stable ID', () => {
    const battle = create('custom_shredder_chakram', 3), source = battle.units[0].id;
    const first = addVisualProjectile(battle, { source, skill: 'test', points: 3, x: 0, y: 0, angle: 0, until: .1 });
    battle.time = .2;
    expect(activeVisualProjectiles(battle)).toEqual([]);
    addVisualProjectile(battle, { source, skill: 'test', points: 3, x: 0, y: 0, angle: 0, until: .4 });
    moveVisualProjectile(battle, first, { x: 1, y: 2 }, .5);
    expect(activeVisualProjectiles(battle).some(p => p.id === first.id)).toBe(true);
    battle.finished = true; expect(activeVisualProjectiles(battle)).toEqual([]);
  });
});
