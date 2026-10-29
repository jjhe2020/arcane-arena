import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBattle, restoreBattle, serializeBattle, stepBattle } from '../src/combat';
import { activeVisualWorldEffects, addVisualWorldEffect, type VisualWorldEffect } from '../src/combat/visual-state';
import type { BattleState, Player, SkillDefinition } from '../src/model';
import type { EffectContext, ZoneOptions } from '../src/skill-effects';
import { MORE_PROGRAMS } from '../src/skill-effects-more';

const definitions = JSON.parse(readFileSync('public/data/skills.json', 'utf8')) as SkillDefinition[];
const assets = JSON.parse(readFileSync('public/data/assets.json', 'utf8'));
const skillIds = ['custom_tidehunter_ravage', 'razor_plasma_field', 'custom_sandking_epicenter', 'custom_crystal_maiden_freezing_field'];
function player(id: number, skill?: string, points = 9): Player {
  return { id, name: `P${id}`, hp: 100, gold: 0, shopLevel: 5, locked: false, reserve: [], shop: [], heroes: [0, 1].map(i => ({ id: `h${i}`, name: `H${i}`, role: 'archer', skin: 'female', x: i ? 12 : 0, y: i ? -10 : -2, persistentStrengthBonus: 100, skills: skill && !i ? [{ id: skill, points }] : [] })) };
}
const create = (skill: string, points = 9) => createBattle(player(0, skill, points), player(1), 1781, definitions);
function reachEffect(battle: BattleState, skill: string) {
  for (let i = 0; i < 180 && !activeVisualWorldEffects(battle).some(p => p.skill === skill); i++) stepBattle(battle, 1 / 30, definitions);
  const effects = activeVisualWorldEffects(battle).filter(p => p.skill === skill);
  expect(effects.length, `${skill} never exposed a real occurrence`).toBeGreaterThan(0);
  return effects;
}
function mechanics(battle: BattleState) {
  const { visualProjectiles: _flights, nextVisualProjectile: _nextFlight, visualWorldEffects: _world, nextVisualWorldEffect: _nextWorld, ...actual } = JSON.parse(serializeBattle(battle));
  return actual;
}
const numberAtMaxBase = (skill: string, key: string) => {
  const row = definitions.find(d => d.id === skill)!.values.find(value => value.split(':')[0].trim() === key)!;
  return Number(row.slice(row.indexOf(':') + 1).match(/-?\d+(?:\.\d+)?/g)!.at(-1));
};

describe('real world effect metadata', () => {
  it.each(skillIds)('%s reconstructs real centers, radii and IDs through deterministic replay', skill => {
    const battle = create(skill), effect = reachEffect(battle, skill)[0];
    expect([effect.x, effect.y, effect.radius, effect.createdAt, effect.until].every(Number.isFinite)).toBe(true);
    expect(assets.skills[skill].layers[effect.layer]).toBeDefined();
    const restored = restoreBattle(serializeBattle(battle), definitions);
    expect(activeVisualWorldEffects(restored)).toEqual(activeVisualWorldEffects(battle));
    stepBattle(battle, 1.5, definitions); stepBattle(restored, 1.5, definitions);
    expect(mechanics(restored)).toEqual(mechanics(battle));
    expect(activeVisualWorldEffects(restored)).toEqual(activeVisualWorldEffects(battle));
  });
  it.each(skillIds)('%s does not consume RNG or change combat when all visual metadata is discarded', skill => {
    const retained = create(skill), discarded = create(skill);
    for (let i = 0; i < 240; i++) {
      stepBattle(retained, 1 / 30, definitions); stepBattle(discarded, 1 / 30, definitions);
      delete discarded.visualWorldEffects; delete discarded.nextVisualWorldEffect;
    }
    expect(mechanics(discarded)).toEqual(mechanics(retained));
  });
  it('Ravage exposes distinct outward and return rings and continues after its caster dies', () => {
    const battle = create('custom_tidehunter_ravage'), [outward] = reachEffect(battle, 'custom_tidehunter_ravage'), center = { x: outward.x, y: outward.y };
    expect(outward.layer).toBe('eruption'); expect(outward.phase).toBe('outward');
    battle.units[0].dead = true; battle.units[0].hp = 0;
    stepBattle(battle, .3, definitions);
    expect(outward.radius!).toBeGreaterThan(0); expect({ x: outward.x, y: outward.y }).toEqual(center);
    let inward: VisualWorldEffect | undefined;
    for (let i = 0; i < 150 && !inward; i++) { stepBattle(battle, 1 / 30, definitions); inward = activeVisualWorldEffects(battle).find(effect => effect.phase === 'inward'); }
    expect(inward).toBeDefined(); expect(inward!.id).not.toBe(outward.id); expect(inward!.layer).toBe('return');
    const radius = inward!.radius!; stepBattle(battle, .2, definitions); expect(inward!.radius!).toBeLessThan(radius);
    stepBattle(battle, 4, definitions); expect(activeVisualWorldEffects(battle)).toEqual([]);
  });
  it('Plasma Field uses the actual fixed origin and switches IDs when the physical wave contracts', () => {
    const battle = create('razor_plasma_field'), [outward] = reachEffect(battle, 'razor_plasma_field'), origin = { x: outward.x, y: outward.y };
    stepBattle(battle, .3, definitions); const previous = outward.radius!;
    battle.units[0].x += 2; stepBattle(battle, .3, definitions);
    expect(outward.radius!).toBeGreaterThan(previous); expect({ x: outward.x, y: outward.y }).toEqual(origin);
    let inward: VisualWorldEffect | undefined;
    for (let i = 0; i < 60 && !inward; i++) { stepBattle(battle, 1 / 30, definitions); inward = activeVisualWorldEffects(battle).find(effect => effect.phase === 'inward'); }
    expect(inward).toBeDefined(); expect(inward!.id).not.toBe(outward.id); expect(inward!.layer).toBe('wave');
    const radius = inward!.radius!; stepBattle(battle, .15, definitions); expect(inward!.radius!).toBeLessThan(radius);
    battle.units[0].dead = true; battle.units[0].hp = 0; expect(activeVisualWorldEffects(battle)).toEqual([]);
  });
  it('Epicenter emits one independently expiring effect at each actual pulse center and radius', () => {
    const battle = create('custom_sandking_epicenter'), [first] = reachEffect(battle, 'custom_sandking_epicenter');
    const firstCenter = { x: first.x, y: first.y }, atlas = assets.skills.custom_sandking_epicenter.layers.wave;
    expect(first.until - first.createdAt).toBeCloseTo(atlas.frames / atlas.fps);
    battle.units[0].x += 1; stepBattle(battle, .3, definitions);
    const later = activeVisualWorldEffects(battle).filter(effect => effect.id !== first.id);
    expect(later.length).toBeGreaterThan(0); expect(later[0].x).not.toBe(firstCenter.x); expect(later[0].radius!).toBeGreaterThan(first.radius!);
    expect({ x: first.x, y: first.y }).toEqual(firstCenter);
    const count = battle.nextVisualWorldEffect; battle.units[0].dead = true; battle.units[0].hp = 0;
    expect(activeVisualWorldEffects(battle).length).toBeGreaterThan(0);
    stepBattle(battle, 1, definitions); expect(battle.nextVisualWorldEffect).toBe(count); expect(activeVisualWorldEffects(battle)).toEqual([]);
  });
  it('Freezing Field records the exact already-sampled explosion even when it hits nobody', () => {
    const skill = 'custom_crystal_maiden_freezing_field', battle = create(skill, 3), caster = battle.units[0];
    caster.x = 1; caster.y = 2;
    const samples = [.25, .36], zones: ZoneOptions[] = []; let draws = 0;
    const context = { battle, caster, skill: { id: skill, points: 3 }, definition: definitions.find(d => d.id === skill)!, target: caster,
      random: () => samples[draws++], status: () => {}, enemies: () => [], zone: (options: ZoneOptions) => zones.push(options) } as unknown as EffectContext;
    MORE_PROGRAMS[skill].cast!(context);
    expect(activeVisualWorldEffects(battle)).toEqual([]);
    zones[0].effect(caster, 0);
    const [burst] = activeVisualWorldEffects(battle), radius = numberAtMaxBase(skill, 'RADIUS') / 100;
    expect(draws).toBe(2); expect(burst.x).toBeCloseTo(1); expect(burst.y).toBeCloseTo(2 + radius * .6);
    expect(burst.radius).toBe(numberAtMaxBase(skill, 'EXPLOSION RADIUS') / 100);
    const atlas = assets.skills[skill].layers.ice_burst; expect(burst.until - burst.createdAt).toBeCloseTo(atlas.frames / atlas.fps);
  });
  it('Epicenter movement-triggered pulses appear only after the real distance threshold', () => {
    const battle = create('custom_sandking_epicenter', 6), caster = battle.units[0]; caster.cooldowns[0] = 120;
    stepBattle(battle, .1, definitions); expect(activeVisualWorldEffects(battle)).toEqual([]);
    caster.x += 6.5; stepBattle(battle, .1, definitions); expect(activeVisualWorldEffects(battle)).toEqual([]);
    caster.x += 1; stepBattle(battle, .1, definitions);
    const [pulse] = activeVisualWorldEffects(battle);
    expect(activeVisualWorldEffects(battle)).toHaveLength(1); expect(pulse.layer).toBe('wave');
    expect(pulse.radius).toBe((numberAtMaxBase('custom_sandking_epicenter', 'RADIUS') + 100) / 100);
    expect(pulse.x).toBeCloseTo(caster.x);
  });
  it('interrupting Freezing Field prevents future samples while already-triggered bursts finish', () => {
    const battle = create('custom_crystal_maiden_freezing_field', 3); reachEffect(battle, 'custom_crystal_maiden_freezing_field');
    const count = battle.nextVisualWorldEffect; battle.units[0].statuses.push({ kind: 'stun', until: 120 });
    stepBattle(battle, .1, definitions); expect(activeVisualWorldEffects(battle).length).toBeGreaterThan(0);
    stepBattle(battle, 1, definitions); expect(battle.nextVisualWorldEffect).toBe(count); expect(activeVisualWorldEffects(battle)).toEqual([]);
  });
  it('a one-shot proc survives source death, expires naturally, and is absent after battle finish', () => {
    const battle = create('custom_sandking_epicenter');
    const effect = addVisualWorldEffect(battle, { source: battle.units[0].id, skill: 'legion_commander_moment_of_courage', points: 3, layer: 'counter', x: 0, y: 0, kind: 'proc', until: .5 });
    expect(effect.loop).toBe(false); battle.units[0].dead = true;
    expect(activeVisualWorldEffects(battle, .2)).toHaveLength(1); expect(activeVisualWorldEffects(battle, .5)).toEqual([]);
    battle.finished = true; expect(activeVisualWorldEffects(battle, .2)).toEqual([]);
  });
  it('the real Lich Ice Spire declares the authored spire body and preserves it on replay', () => {
    const battle = create('custom_lich_chain_frost', 6);
    for (let i = 0; i < 90 && !battle.units.some(unit => unit.summoned); i++) stepBattle(battle, 1 / 30, definitions);
    const spire = battle.units.find(unit => unit.summoned && unit.name === '冰柱');
    expect(spire).toBeDefined(); expect(spire!.sourceSkill).toBe('custom_lich_chain_frost'); expect(spire!.visualBody).toBe('spire');
    expect(assets.skills.custom_lich_chain_frost.layers.spire.role).toBe('world_prop');
    expect(restoreBattle(serializeBattle(battle), definitions).units.find(unit => unit.id === spire!.id)?.visualBody).toBe('spire');
  });
});
