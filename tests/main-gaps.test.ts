import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyDamage, createBattle, stepBattle } from '../src/combat';
import type { BattleState, CombatUnit, Player, SkillDefinition } from '../src/model';
import type { EffectStatus } from '../src/skill-effects';

const defs = JSON.parse(readFileSync(new URL('../public/data/skills.json', import.meta.url), 'utf8')) as SkillDefinition[];
function player(id: number, skill?: string, points = 3, count = 1): Player {
  return { id, name: `P${id}`, hp: 100, gold: 0, shopLevel: 3, locked: false, reserve: [], shop: [], heroes: Array.from({ length: count }, (_, i) => ({ id: `h${i}`, name: `h${i}`, role: 'mage', skin: 'female', x: i * 2, y: -2, skills: skill && !i ? [{ id: skill, points }] : [] })) };
}
function battle(skill: string, points = 3, enemies = 2, seed = 99) {
  const state = createBattle(player(0, skill, points), player(1, undefined, 3, enemies), seed, defs);
  for (const u of state.units) { u.maxHp = u.hp = 100000; u.maxMana = u.mana = 10000; u.statuses.push({ kind: 'root', until: 200 }, { kind: 'disarm', until: 200 }); }
  return state;
}
const advance = (state: BattleState, seconds: number) => stepBattle(state, seconds, defs);
const links = (unit: CombatUnit) => (unit.statuses as EffectStatus[]).find(s => s.kind === 'soulbind');

describe('dynamic main-skill completeness', () => {
  it('Ravage hits a hero that enters ahead of the expanding wave after the cast', () => {
    const state = battle('custom_tidehunter_ravage'), [caster, first, entrant] = state.units;
    first.x = 0; first.y = 2; entrant.x = 10; entrant.y = -2;
    advance(state, .5); entrant.x = 3; advance(state, .7);
    const hits = state.events.filter(e => e.type === 'hit' && e.skill === 'custom_tidehunter_ravage');
    expect(hits.some(e => e.target === entrant.id)).toBe(true);
    expect(hits.filter(e => e.target === first.id)).toHaveLength(1);
    expect(caster.hp).toBe(100000);
  });

  it('Gaben Ravage return wave hits a moving hero at its new radius, once in each direction', () => {
    const state = battle('custom_tidehunter_ravage', 9, 1), target = state.units[1]; target.x = 0; target.y = 0;
    advance(state, .8);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'custom_tidehunter_ravage')).toHaveLength(1);
    advance(state, 1.3); target.x = 8; target.y = -2; advance(state, .8);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'custom_tidehunter_ravage')).toHaveLength(2);
    advance(state, 1); expect(state.events.filter(e => e.type === 'hit' && e.skill === 'custom_tidehunter_ravage')).toHaveLength(2);
  });

  it('Soulbind replaces a dead partner and preserves the original anchor timer', () => {
    const state = battle('custom_grimstroke_soul_bind', 3, 3), [, anchor, partner, replacement] = state.units;
    anchor.x = 0; anchor.y = 1; partner.x = 2; partner.y = 1; replacement.x = 4; replacement.y = 1;
    advance(state, .4); const expires = links(anchor)!.until;
    expect(anchor.statuses.some(s => s.kind === 'soulbindAnchor'), JSON.stringify(anchor.statuses)).toBe(true);
    expect(links(anchor)!.data?.partnerId).toBe(partner.id);
    partner.hp = 0; partner.dead = true; advance(state, .1);
    expect(links(anchor), JSON.stringify(state.units.map(u => ({ id: u.id, statuses: u.statuses })))).toBeDefined();
    expect(links(anchor)!.data?.partnerId).toBe(replacement.id);
    expect(links(replacement)!.until).toBe(expires);
    expect(links(partner)).toBeUndefined();
  });

  it('Soulbind detaches a forced escape and Gaben fills only the missing place in its three-hero group', () => {
    const state = battle('custom_grimstroke_soul_bind', 9, 4), [, anchor, escaped, retained, replacement] = state.units;
    [anchor, escaped, retained, replacement].forEach((u, i) => { u.x = i * 1.6; u.y = 1; });
    advance(state, .4); const original = String(links(anchor)!.data?.group).split(',');
    expect(original).toHaveLength(3); expect(original).toContain(retained.id);
    escaped.x = 12; advance(state, .1);
    const group = String(links(anchor)!.data?.group).split(',');
    expect(group).toEqual([anchor.id, retained.id, replacement.id]); expect(links(escaped)).toBeUndefined();
  });

  it('an unpaired Soulbind target can acquire a later nearby hero and anchor death clears every link', () => {
    const state = battle('custom_grimstroke_soul_bind', 3, 2), [, anchor, entrant] = state.units;
    anchor.x = 0; anchor.y = 1; entrant.x = 10; entrant.y = 1;
    advance(state, .4); expect(links(anchor)).toBeUndefined();
    entrant.x = 2; advance(state, .1); expect(links(entrant)?.data?.partnerId).toBe(anchor.id);
    anchor.hp = 0; anchor.dead = true; advance(state, .1); expect(links(entrant)).toBeUndefined();
  });

  it('Spectral Dagger ground path slows later crossers and its caster loses free pathing after leaving it', () => {
    const state = battle('spectre_spectral_dagger', 4, 2), [caster, target, crossing] = state.units;
    target.x = 0; target.y = 6; crossing.x = 10; crossing.y = 1;
    advance(state, 1.2);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'spectre_spectral_dagger' && e.target === target.id)).toHaveLength(1);
    expect(caster.statuses.some(s => s.kind === 'freePathing')).toBe(true);
    crossing.x = 0; advance(state, .1);
    expect(crossing.statuses.some(s => s.kind === 'slow' && s.skill === 'spectre_spectral_dagger')).toBe(true);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'spectre_spectral_dagger' && e.target === crossing.id)).toHaveLength(0);
    caster.x = 5; advance(state, 1.2);
    expect(caster.statuses.some(s => s.kind === 'freePathing')).toBe(false);
    expect(caster.statuses.some(s => s.kind === 'haste' && s.skill === 'spectre_spectral_dagger')).toBe(true);
  });

  it('a dagger-struck moving victim lays another slowing path outside the original projectile line', () => {
    const state = battle('spectre_spectral_dagger', 4, 2), [, target, crossing] = state.units;
    target.x = 0; target.y = 6; crossing.x = 8; crossing.y = 6;
    advance(state, 1.6); target.x = 5; advance(state, .1); crossing.x = 2.5; advance(state, .1);
    expect(crossing.statuses.some(s => s.kind === 'slow' && s.skill === 'spectre_spectral_dagger')).toBe(true);
  });

  it('Dispersion selects a seeded random enemy rather than always the damage source', () => {
    const choices: string[] = [];
    for (const seed of [1, 123456789, 987654321, 0x12345678, 0xdeadbeef, 0xfedcba98]) {
      const state = battle('custom_spectre_dispersion', 6, 3, seed), [caster, attacker] = state.units;
      applyDamage(state, attacker, caster, 500, 'pure');
      const cast = state.events.find(e => e.type === 'cast' && e.skill === 'spectre_spectral_dagger');
      expect(cast).toBeDefined(); choices.push(cast!.target!);
    }
    expect(new Set(choices).size).toBeGreaterThan(1);
    expect(choices.some(id => id !== '1:h0')).toBe(true);
  });
});
