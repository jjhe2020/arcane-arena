import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import type {SkillDefinition} from '../src/model';
import {createSkillLabCase, skillLabDamage, stepSkillLabCase, type SkillLabPoints} from '../src/skill-lab-simulation';

const catalog = JSON.parse(readFileSync('public/data/skills.json', 'utf8')) as SkillDefinition[];
function create(id: string, points: SkillLabPoints) {
  return createSkillLabCase(catalog.find(skill => skill.id === id)!, points, catalog);
}

describe('single-skill lab battles', () => {
  it('keeps the same hero and primary target at all ranks and records actual splash only when unlocked', () => {
    const cases = ([3, 6, 9] as const).map(points => create('custom_vengefulspirit_magic_missile', points));
    expect(cases.map(s => s.battle.rng)).toEqual(Array(3).fill(cases[0].battle.rng));
    const ledgers = cases.map(s => {
      const [hero, primary, rearA, rearB] = s.battle.units;
      expect(hero.level).toBe(12);
      expect(hero.skills.filter(Boolean)).toHaveLength(1);
      expect(primary.x).toBeLessThan(rearA.x);
      expect(rearA.x).toBe(rearB.x);
      expect(rearA.y).toBe(-rearB.y);
      stepSkillLabCase(s, s.duration);
      const casts = s.battle.events.filter(e => e.type === 'cast' && e.source === s.casterId);
      expect(casts).toHaveLength(1);
      expect(casts[0].target).toBe(s.dummyIds[0]);
      expect(s.battle.events.some(e => e.type === 'attack' && s.dummyIds.some(id => id === e.source))).toBe(false);
      return skillLabDamage(s);
    });
    expect(ledgers.map(rows => rows.map(row => row.skillTypes.magical))).toEqual([[270, 0, 0], [345, 0, 0], [345, 345, 345]]);
    expect(ledgers[0][0].basicTypes.physical).toBeGreaterThan(0);
    expect(ledgers[0][0].total).toBeCloseTo(ledgers[0][0].skill + ledgers[0][0].basic);
  });

  it('places a self-centered skill at its radius edge and preserves rank-dependent self casting', () => {
    const spray = create('custom_bristleback_quill_spray', 3);
    expect(spray.mode).toBe('self');
    expect(spray.startDistance).toBeCloseTo(spray.selfRadius! - .08);
    stepSkillLabCase(spray, 3);
    expect(skillLabDamage(spray)[0].skillTypes.physical).toBeCloseTo(85 / 1.3);
    expect(skillLabDamage(spray).slice(1).map(row => row.skill)).toEqual([0, 0]);

    const doom = create('custom_doom_bringer_doom', 9);
    expect(doom.mode).toBe('self');
    stepSkillLabCase(doom, 2);
    expect(doom.battle.events.find(e => e.type === 'cast')?.target).toBe(doom.casterId);
    expect(skillLabDamage(doom)[0].skillTypes.pure).toBeGreaterThan(0);
  });

  it('allows a genuine execute, then revives the same dummy with its cumulative ledger intact', () => {
    const scenario = create('custom_axe_culling_blade', 3);
    const dummy = scenario.battle.units.find(unit => unit.id === scenario.dummyIds[0])!;
    expect(dummy.hp).toBe(200);
    stepSkillLabCase(scenario, .4);
    expect(dummy.dead).toBe(true);
    expect(skillLabDamage(scenario)[0].skillTypes.pure).toBe(200);
    stepSkillLabCase(scenario, .6);
    expect(dummy.dead).toBe(false);
    expect(dummy.hp).toBe(dummy.maxHp);
    expect(skillLabDamage(scenario)[0].skillTypes.pure).toBe(200);
  });

  it('stages a wounded hero for healing skills while retaining normal target rules', () => {
    const scenario = create('omniknight_purification', 3);
    const hero = scenario.battle.units.find(unit => unit.id === scenario.casterId)!;
    expect(hero.hp / hero.maxHp).toBeCloseTo(.3);
    expect(scenario.mode).toBe('ally');
    stepSkillLabCase(scenario, 2);
    expect(hero.healing).toBe(300);
    expect(skillLabDamage(scenario).map(row => row.skillTypes.pure)).toEqual([300, 0, 0]);
  });
});
