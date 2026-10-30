import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyDamage, createBattle, FIXED_STEP, stepBattle } from '../src/combat';
import type { CombatUnit, Player, SkillDefinition } from '../src/model';

const defs = JSON.parse(readFileSync(new URL('../public/data/skills.json', import.meta.url), 'utf8')) as SkillDefinition[];
function setup(id: string, points = 9, seed = 23, friend = false) {
  const player = (side: number): Player => ({ id: side, name: `P${side}`, hp: 100, gold: 0, shopLevel: 1,
    reserve: [], shop: [], locked: false, heroes: [{ id: `h${side}`, name: `H${side}`, role: 'mage', skin: 'female', x: 0, y: -2,
      skills: side ? [] : [{ id, points }] }] });
  const a = player(0); if (friend) a.heroes.push({ ...structuredClone(a.heroes[0]), id: 'friend', skills: [] });
  const battle = createBattle(a, player(1), seed, defs), caster = battle.units[0], enemy = battle.units.find(u => u.side === 1)!;
  for (const u of battle.units) { u.moveSpeed = 0; u.nextAttack = 100; u.hp = u.maxHp = 10000; u.x = 0; u.y = u.side ? 8 : 0; }
  caster.mana = caster.maxMana = 1000; enemy.facing = -Math.PI / 2;
  return { battle, caster, enemy, friend: battle.units.find(u => u.id.endsWith(':friend')) };
}
const advance = (b: ReturnType<typeof createBattle>, seconds: number) => { for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++) stepBattle(b, FIXED_STEP, defs); };
const status = (u: CombatUnit, kind: string) => u.statuses.find(s => s.kind === kind);
function graniteFixture() {
  // Fixed bounded seed search verifies the actual random ancient selection;
  // no fabricated body or hand-inserted aura bypasses the summon pipeline.
  for (let attempt = 1; attempt <= 40; attempt++) {
    // Xorshift's first draw is strongly correlated for adjacent tiny seeds.
    const seed = Math.imul(attempt, 0x9e3779b9) >>> 0;
    const h = setup('custom_beastmaster_call_of_the_wild', 9, seed, true);
    h.friend!.x = 2; h.friend!.hp = 5000; advance(h.battle, .8);
    const golem = h.battle.units.find(u => u.sourceUnitType === 'npc_dota_neutral_granite_golem');
    if (golem) { for (const u of h.battle.units) { u.moveSpeed = 0; u.nextAttack = 100; } return { ...h, golem }; }
  }
  throw new Error('No granite candidate in the deterministic seed fixture');
}

describe('historical summon behavior gaps', () => {
  it('gives a Stone Gaze golem a real Boulder cast and splits it into two nonrecursive shards on death', () => {
    const h = setup('medusa_stone_gaze'); h.enemy.y = 2; advance(h.battle, 3.5);
    const golem = h.battle.units.find(u => u.name === '泥土傀儡')!;
    expect(golem).toBeDefined(); expect(golem.skills.map(s => s?.id)).toContain('mud_golem_hurl_boulder');
    expect(h.battle.events.some(e => e.type === 'cast' && e.skill === 'mud_golem_hurl_boulder' && e.source === golem.id)).toBe(true);
    applyDamage(h.battle, h.enemy, golem, 100000, 'pure');
    const shards = h.battle.units.filter(u => u.sourceUnitType === 'npc_dota_neutral_mud_golem_split');
    expect(shards).toHaveLength(2);
    for (const shard of shards) {
      expect(shard.maxHp).toBe(250); expect(shard.attack).toBe(12); expect(shard.owner).toBe(h.caster.id);
      expect(Number(shard.expiresAt) - h.battle.time).toBe(60);
      expect(shard.skills.map(s => s?.id)).toEqual(['mud_golem_hurl_boulder']);
    }
    applyDamage(h.battle, h.enemy, shards[0], 100000, 'pure');
    expect(h.battle.units.filter(u => u.sourceUnitType === 'npc_dota_neutral_mud_golem_split')).toHaveLength(2);
  });
  it('applies Granite max HP once, preserves health ratio, and reverses it when leaving or killing the aura body', () => {
    const h = graniteFixture(), ally = h.friend!;
    expect(ally.maxHp).toBeCloseTo(11500); expect(ally.hp).toBeCloseTo(5750);
    ally.x = 14; ally.y = 0; advance(h.battle, .3); expect(ally.maxHp).toBeCloseTo(10000); expect(ally.hp).toBeCloseTo(5000);
    ally.x = h.golem.x; ally.y = h.golem.y; advance(h.battle, .2); expect(ally.maxHp).toBeCloseTo(11500);
    applyDamage(h.battle, h.enemy, h.golem, 100000, 'pure'); advance(h.battle, .3);
    expect(ally.maxHp).toBeCloseTo(10000); expect(ally.hp).toBeCloseTo(5000);
  });
  it('keeps the Granite aura after its original hero dies', () => {
    const h = graniteFixture(); applyDamage(h.battle, h.enemy, h.caster, 100000, 'pure'); advance(h.battle, .4);
    expect(h.golem.dead).toBe(false); expect(h.friend!.maxHp).toBeCloseTo(11500);
  });
  it('does not stack two Granite sources or dip during source handoff', () => {
    const h = graniteFixture();
    for (let attempts = 0; attempts < 20 && h.battle.units.filter(u => u.sourceUnitType === 'npc_dota_neutral_granite_golem').length < 2; attempts++) {
      h.caster.cooldowns[0] = 0; h.caster.mana = 1000; advance(h.battle, .8);
      for (const u of h.battle.units) { u.moveSpeed = 0; u.nextAttack = 100; }
    }
    const golems = h.battle.units.filter(u => u.sourceUnitType === 'npc_dota_neutral_granite_golem'); expect(golems.length).toBeGreaterThanOrEqual(2);
    expect(h.friend!.maxHp).toBeCloseTo(11500);
    const elected = String(status(h.friend!, 'maxHpPct')!.source), old = golems.find(u => u.id === elected)!;
    applyDamage(h.battle, h.enemy, old, 100000, 'pure'); advance(h.battle, .3);
    expect(h.friend!.maxHp).toBeCloseTo(11500); expect(h.friend!.statuses.filter(s => s.kind === 'maxHpPct')).toHaveLength(1);
  });
  it('makes Standard wolves invisible, reveals attacks, and fades again two seconds after their last attack', () => {
    const h = setup('custom_lycan_summon_wolves', 3); advance(h.battle, .6);
    const wolf = h.battle.units.find(u => u.sourceSkill === 'custom_lycan_summon_wolves')!; wolf.moveSpeed = 0; wolf.nextAttack = 100;
    expect(status(wolf, 'invisible')).toBeDefined();
    wolf.x = h.enemy.x; wolf.y = h.enemy.y - 1; wolf.nextAttack = h.battle.time; advance(h.battle, .5); wolf.nextAttack = 100;
    expect(status(wolf, 'invisible')).toBeUndefined(); advance(h.battle, 2.1); expect(status(wolf, 'invisible')).toBeDefined();
    wolf.statuses.push({ kind: 'break', source: h.enemy.id, skill: 'test', until: h.battle.time + .3 });
    advance(h.battle, .1); expect(status(wolf, 'invisible')).toBeUndefined(); advance(h.battle, .4); expect(status(wolf, 'invisible')).toBeDefined();
    const rankTwo = setup('custom_lycan_summon_wolves', 2); advance(rankTwo.battle, .6);
    expect(rankTwo.battle.units.filter(u => u.sourceSkill === 'custom_lycan_summon_wolves').every(u => !status(u, 'invisible'))).toBe(true);
  });
  it('pulls Tether continuously from beyond break range to 300 without breaking the newly established link', () => {
    const h = setup('wisp_tether', 3, 23, true); h.friend!.x = 12; h.friend!.y = 0;
    advance(h.battle, .2);
    expect(h.caster.x).toBeGreaterThan(0); expect(h.caster.x).toBeLessThan(3); expect(status(h.caster, 'tether')).toBeDefined();
    advance(h.battle, 1.2);
    expect(Math.hypot(h.friend!.x - h.caster.x, h.friend!.y - h.caster.y)).toBeCloseTo(3);
    expect(status(h.caster, 'tether')).toBeDefined(); expect(status(h.caster, 'root')).toBeUndefined();
    const close = setup('wisp_tether', 3, 23, true); close.friend!.x = 6; advance(close.battle, .5);
    expect(close.caster.x).toBeCloseTo(0); expect(status(close.caster, 'tether')).toBeDefined();
  });
});
