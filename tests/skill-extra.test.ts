import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyDamage, battleGains, createBattle, FIXED_STEP, stepBattle } from '../src/combat';
import { EXTRA_PROGRAMS, EXTRA_CHILD_PROGRAMS, EXTRA_CHILD_DEFINITIONS, EXTRA_WORKING_DEFAULTS } from '../src/skill-effects-extra';
import { skillValue } from '../src/skill-effects';
import { activeVisualWorldEffects } from '../src/combat/visual-state';
import type { EffectContext, EffectStatus, ZoneOptions } from '../src/skill-effects';
import type { CombatUnit, Player, SkillDefinition, SkillStack } from '../src/model';

const catalog = JSON.parse(readFileSync(new URL('../public/data/skills.json', import.meta.url), 'utf8')) as SkillDefinition[];
const definition = (id: string) => catalog.find(d => d.id === id) ?? EXTRA_CHILD_DEFINITIONS.find(d => d.id === id)!;
function player(id: number, skills: SkillStack[] = []): Player {
  return { id, name: `P${id}`, hp: 100, gold: 0, shopLevel: 1, reserve: [], shop: [], locked: false,
    heroes: [{ id: `h${id}`, name: `H${id}`, role: 'mage', skin: 'female', x: 0, y: -2, skills }] };
}
function advance(battle: ReturnType<typeof createBattle>, seconds: number) {
  for (let n = 0; n < Math.round(seconds / FIXED_STEP); n++) stepBattle(battle, FIXED_STEP, catalog);
}
/** Direct program harness observes resources, status durations, and timer behavior.
 * Integration tests below separately exercise actual engine hooks and settlement. */
function harness(id: string, points = 9) {
  const battle = createBattle(player(0), player(1), 19, catalog);
  const [caster, target] = battle.units;
  const ally = structuredClone(caster); ally.id = 'ally'; ally.x = 1; ally.hp /= 2;
  const other = structuredClone(target); other.id = 'other'; other.x = 1;
  battle.units.push(ally, other);
  caster.mana = caster.maxMana = 2000;
  const skill: SkillStack = { id, points };
  const timers: { due: number; callback: () => void }[] = [];
  const zones: ZoneOptions[] = [], attacks: string[] = [], grants: { id: string; points: number; target: string }[] = [];
  const ctx: EffectContext = {
    battle, caster, target, skill, definition: definition(id), random: () => 0,
    allies: () => battle.units.filter(u => !u.dead && u.side === caster.side),
    enemies: () => battle.units.filter(u => !u.dead && u.side !== caster.side),
    damage: (u, amount) => { const actual = Math.min(u.hp, amount); u.hp -= actual; return actual; },
    execute: u => { u.dead = true; u.hp = 0; },
    heal: (u, amount) => { const actual = Math.min(u.maxHp - u.hp, amount); u.hp += actual; return actual; },
    mana: (u, amount) => { const previous = u.mana; u.mana = Math.max(0, Math.min(u.maxMana, previous + amount)); return u.mana - previous; },
    status: (u, kind, duration, amount = 0, options = {}) => {
      u.statuses = u.statuses.filter(s => !(s.kind === kind && s.source === caster.id && s.skill === id));
      u.statuses.push({ kind, source: caster.id, skill: id, until: battle.time + duration, value: amount, ...options } as EffectStatus);
    },
    dispel: () => {}, projectile: (u, _speed, callback) => callback(u), linearProjectile: () => {},
    delay: (seconds, callback) => { timers.push({ due: battle.time + seconds, callback }); },
    zone: zone => { zones.push(zone); }, barrier: () => {}, disjoint: () => {}, endChannel: () => {}, movementSpeed: unit => unit.moveSpeed, summon: () => [], teleport: (u, x, y) => { u.x = x; u.y = y; },
    warp: (u, x, y) => { u.x = x; u.y = y; }, moveContinuous: (u, x, y) => { u.x = x; u.y = y; return true; },
    attack: (u, multiplier = 1) => { attacks.push(u.id); const damage=caster.attack*multiplier;u.hp-=damage;return {landed:true,damage}; }, revive: () => {},
    castAbility: (grantedId, level, u) => { grants.push({ id: grantedId, points: level, target: u.id }); return true; },
  };
  function until(time: number) {
    while (timers.some(t => t.due <= time)) {
      timers.sort((a, b) => a.due - b.due); const timer = timers.shift()!;
      battle.time = timer.due; timer.callback();
    }
    battle.time = time;
  }
  function tickZones() {
    for (const zone of zones) for (const u of battle.units) {
      const x = zone.follow ? caster.x : zone.x ?? caster.x, y = zone.follow ? caster.y : zone.y ?? caster.y;
      if (!u.dead && Math.hypot(u.x - x, u.y - y) <= zone.radius) zone.effect(u, 1);
    }
  }
  return { ctx, caster, target, ally, other, attacks, grants, timers, zones, until, tickZones };
}
const status = (unit: CombatUnit, kind: string) => unit.statuses.find(s => s.kind === kind) as EffectStatus | undefined;

describe('r4 attack snapshots, bounce flight, damage ranges and cleave direction', () => {
  it('queues Moon Glaives one at a time from the last target and retains the original attack snapshot', () => {
    const h = harness('custom_luna_moon_glaive', 3), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    h.target.x = 0; h.target.y = 0; h.other.x = 3; h.other.y = 0;
    const third = structuredClone(h.other); third.id = 'third'; third.x = 6; h.ctx.battle.units.push(third);
    const shots: { target: CombatUnit; origin: { x: number; y: number }; hit: (u: CombatUnit) => void }[] = [];
    h.ctx.projectile = (target, _speed, hit, origin) => shots.push({ target, origin: { ...origin! }, hit });
    p.onAttack!({ ...h.ctx, baseAttackDamage: 180, attackDamage: 999 });
    expect(shots).toHaveLength(1); expect(shots[0].origin).toEqual({ x: 0, y: 0 }); expect(shots[0].target.id).toBe(h.other.id);
    const hp = h.other.hp; shots[0].hit(h.other); expect(hp - h.other.hp).toBeCloseTo(180 * .62);
    expect(shots).toHaveLength(2); expect(shots[1].origin).toEqual({ x: 3, y: 0 }); expect(shots[1].target.id).toBe(third.id);
    h.caster.attack = 5000; const thirdHp = third.hp; shots[1].hit(third);
    expect(thirdHp - third.hp).toBeCloseTo(180 * .62 ** 2); expect(shots).toHaveLength(2);
  });
  it('makes real Moon Glaive hits include flat/percentage attack bonuses and arrive after successive flights', () => {
    const id = 'custom_luna_moon_glaive', opponents = player(1);
    for (const name of ['second', 'third']) opponents.heroes.push({ ...structuredClone(opponents.heroes[0]), id: name });
    const battle = createBattle(player(0, [{ id, points: 3 }]), opponents, 77, catalog), caster = battle.units[0];
    for (const [i, u] of battle.units.entries()) { u.x = i ? 1.5 + (i - 1) * 3 : 0; u.y = 0; u.moveSpeed = 0; u.nextAttack = 100; u.armor = 0; u.hp = u.maxHp = 10000; }
    caster.range = 1.5; caster.attackInterval = 100; caster.nextAttack = 0;
    caster.statuses.push({ kind: 'attackBonus', value: 45, until: 100 }, { kind: 'attackPct', value: .5, until: 100 });
    advance(battle, .6);
    expect(10000 - battle.units[1].hp).toBeCloseTo(142.5); expect(battle.units[2].hp).toBe(10000); expect(battle.units[3].hp).toBe(10000);
    advance(battle, 1.2);
    expect(10000 - battle.units[2].hp).toBeCloseTo(142.5 * .62); expect(10000 - battle.units[3].hp).toBeCloseTo(142.5 * .62 ** 2);
    const hits = battle.events.filter(e => e.type === 'hit' && e.source === caster.id);
    expect(hits).toHaveLength(3); expect(hits[1].time - hits[0].time).toBeGreaterThan(.2); expect(hits[2].time - hits[1].time).toBeGreaterThan(.2);
  });
  it.each([3, 6])('samples skeleton attack damage every hit at tier %i and replays the seeded sequence', points => {
    function sample(seed: number) {
      const id = 'custom_skeleton_king_vampiric_aura', battle = createBattle(player(0, [{ id, points }]), player(1), seed, catalog);
      const [caster, enemy] = battle.units;
      caster.x = caster.y = 0; caster.mana = caster.maxMana = 1000; caster.moveSpeed = 0; caster.nextAttack = 100;
      enemy.x = 0; enemy.y = 10; enemy.hp = enemy.maxHp = 100000; enemy.armor = 0; enemy.moveSpeed = 0; enemy.nextAttack = 100;
      advance(battle, 2.2); const bone = battle.units.find(u => u.extraVampiricSkeleton)!;
      expect(bone.attackMin).toBe(22); expect(bone.attackMax).toBe(27);
      for (const u of battle.units.filter(u => u !== enemy)) { u.x = -10; u.y = -10; u.moveSpeed = 0; u.nextAttack = 100; }
      bone.x = 0; bone.y = 9; bone.nextAttack = battle.time;
      const start = battle.time; advance(battle, 8);
      return battle.events.filter(e => e.type === 'hit' && e.source === bone.id && e.target === enemy.id && e.time >= start).map(e => e.amount!);
    }
    const a = sample(7), again = sample(7), other = sample(11), bonus = points >= 6 ? 24 : 0;
    expect(a.length).toBeGreaterThanOrEqual(5); expect(new Set(a).size).toBeGreaterThan(1);
    expect(a.every(damage => damage >= 22 + bonus && damage <= 27 + bonus)).toBe(true);
    expect(a).toEqual(again); expect(a).not.toEqual(other);
  });
  it('cleaves forward within 650 distance, excludes units behind the attacker, and widens only the Super far edge', () => {
    function hit(points: number) {
      const a = player(0, [{ id: 'custom_magnataur_empower', points }]); a.heroes[0].role = 'assassin';
      const opponents = player(1);
      for (const id of ['forward', 'behind', 'edge', 'beyond']) opponents.heroes.push({ ...structuredClone(opponents.heroes[0]), id });
      const battle = createBattle(a, opponents, 77, catalog), caster = battle.units[0], locations = [[1, 0], [5, 0], [-1.5, 0], [5, 3.5], [8, 0]];
      for (const [index, u] of battle.units.entries()) {
        [u.x, u.y] = index ? locations[index - 1] : [0, 0]; u.moveSpeed = 0; u.nextAttack = 100; u.armor = 0; u.hp = u.maxHp = 10000;
      }
      advance(battle, .1); expect(status(caster, 'cleave')?.data).toEqual({ distance: 6.5, startWidth: 1.5, endWidth: points >= 6 ? 5.6 : 3.6 });
      caster.attackInterval = 100; caster.nextAttack = 0; advance(battle, 1);
      return Object.fromEntries(battle.units.filter(u => u.side === 1).map(u => [u.id.split(':')[1], 10000 - u.hp]));
    }
    const basic = hit(3), superLevel = hit(6);
    for (const result of [basic, superLevel]) { expect(result.h1).toBeGreaterThan(0); expect(result.forward).toBeGreaterThan(0); expect(result.behind).toBe(0); expect(result.beyond).toBe(0); }
    expect(basic.edge).toBe(0); expect(superLevel.edge).toBeGreaterThan(0);
  });
});

describe('extra skill upgrade behavior', () => {
  it('publishes Ink Swell tendrils only for actual tick damage and its burst only at the beneficiary detonation', () => {
    const id = 'custom_grimstroke_ink_swell', h = harness(id, 6), p = EXTRA_PROGRAMS[id];
    h.ctx.target = h.ally; h.caster.x = -6; h.caster.y = 0; h.ally.x = 3; h.ally.y = 0;
    h.target.x = 3; h.target.y = 1; h.other.x = 13; h.other.y = 0;
    p.cast!(h.ctx);
    expect(activeVisualWorldEffects(h.ctx.battle)).toEqual([]); expect(status(h.target, 'visualLink')).toBeUndefined();
    h.until(.2);
    expect(status(h.target, 'visualLink')?.source).toBe(h.ally.id);
    expect(status(h.target, 'visualLink')?.data?.layer).toBe('tendril');
    expect(status(h.other, 'visualLink')).toBeUndefined(); expect(activeVisualWorldEffects(h.ctx.battle)).toEqual([]);
    h.ally.x = 5; h.ally.y = 2; h.target.x = 5; h.target.y = 3;
    const seconds = skillValue(h.ctx, 'BUFF DURATION');
    h.until(seconds); const bursts = activeVisualWorldEffects(h.ctx.battle);
    expect(bursts).toHaveLength(1);
    expect(bursts[0]).toMatchObject({ source: h.caster.id, skill: id, points: 6, layer: 'burst', x: 5, y: 2,
      radius: skillValue(h.ctx, 'RADIUS') / 100 + 1.5, kind: 'burst', loop: false, createdAt: seconds });
    expect(bursts[0].until - bursts[0].createdAt).toBeCloseTo(16 / 24);
    expect(activeVisualWorldEffects(h.ctx.battle, bursts[0].until)).toEqual([]);
  });
  it.each(['dispel', 'death', 'zeroDamage'])('does not invent Ink Swell contact or a cancelled burst after %s', reason => {
    const id = 'custom_grimstroke_ink_swell', h = harness(id, 3), p = EXTRA_PROGRAMS[id];
    h.ctx.target = h.ally; h.ally.x = h.target.x; h.ally.y = h.target.y;
    if (reason === 'zeroDamage') h.ctx.damage = () => 0;
    p.cast!(h.ctx);
    if (reason === 'dispel') h.ally.statuses = [];
    if (reason === 'death') h.ally.dead = true;
    h.until(.2); expect(status(h.target, 'visualLink')).toBeUndefined();
    h.until(skillValue(h.ctx, 'BUFF DURATION'));
    if (reason !== 'zeroDamage') expect(activeVisualWorldEffects(h.ctx.battle)).toEqual([]);
  });
  it('uses independent PRD hooks for the selected attack procs without consuming rolls during cooldown', () => {
    for (const [id, key, amount] of [['custom_windrunner_focusfire', 'maelstrom', 140], ['ursa_overpower', 'bash', 120]] as const) {
      const h = harness(id), p = EXTRA_PROGRAMS[id], calls: string[] = []; let succeeds = false;
      h.ctx.chance = (_p, key) => { calls.push(key); return succeeds; };
      const hp = h.target.hp; p.onAttack!(h.ctx); expect(h.target.hp).toBe(hp);
      succeeds = true; p.onAttack!(h.ctx); expect(hp - h.target.hp).toBe(amount);
      p.onAttack!(h.ctx); expect(calls).toEqual([key, key]); expect(hp - h.target.hp).toBe(amount);
    }
    const h = harness('legion_commander_moment_of_courage'), p = EXTRA_PROGRAMS[h.ctx.skill.id], keys: string[] = [];
    h.ctx.chance = (_p, key) => { keys.push(key); return true; };
    p.onAttacked!(h.ctx); p.onAttack!(h.ctx); p.onAttacked!(h.ctx); p.onAttack!(h.ctx);
    expect(keys).toEqual(['defensiveCounterattack', 'offensiveCounterattack']); expect(h.attacks).toHaveLength(2);
    const procs = activeVisualWorldEffects(h.ctx.battle);
    expect(procs).toHaveLength(2); expect(new Set(procs.map(p => p.id)).size).toBe(2);
    expect(procs.every(p => p.layer === 'counter' && p.source === h.caster.id && p.skill === h.ctx.skill.id && p.loop === false && p.until - p.createdAt === .5)).toBe(true);
    expect(procs.map(p => ({ x: p.x, y: p.y }))).toEqual([{ x: h.caster.x, y: h.caster.y }, { x: h.caster.x, y: h.caster.y }]);
    h.caster.dead = true; expect(activeVisualWorldEffects(h.ctx.battle, .25)).toHaveLength(2);
    expect(activeVisualWorldEffects(h.ctx.battle, .5)).toEqual([]);
    const failed = harness('legion_commander_moment_of_courage'); failed.ctx.chance = () => false;
    EXTRA_PROGRAMS[failed.ctx.skill.id].onAttacked!(failed.ctx);
    expect(activeVisualWorldEffects(failed.ctx.battle)).toEqual([]);
  });
  it('lets Jingu soldiers apply whitelisted attack effects without copying Jingu or owner-only summons', () => {
    const id = 'custom_monkey_king_jingu_mastery', a = player(0, [
      { id, points: 9 }, { id: 'custom_drow_ranger_frost_arrows', points: 3 },
      { id: 'crystal_maiden_brilliance_aura', points: 9 }, { id: 'custom_warlock_chaotic_offering', points: 6 },
    ]);
    const battle = createBattle(a, player(1), 77, catalog), [caster, enemy] = battle.units;
    caster.x = caster.y = 0; enemy.x = 2; enemy.y = 0; enemy.hp = enemy.maxHp = 100000;
    for (const u of battle.units) { u.moveSpeed = 0; u.nextAttack = 100; u.mana = 0; }
    advance(battle, 3.2); const soldier = battle.units.find(u => u.extraJinguSoldier)!;
    expect(soldier).toBeDefined(); expect(soldier.inheritedInitialized).toBe(true);
    expect(soldier.skills.filter(Boolean).map(s => s!.id)).toEqual(['custom_drow_ranger_frost_arrows']);
    expect(enemy.statuses.some(s => s.kind === 'hypothermia' && s.source === soldier.id)).toBe(true);
    expect(battle.events.some(e => e.type === 'cast' && e.source === soldier.id)).toBe(false);
    advance(battle, 2.9); const soldiers = battle.units.filter(u => u.extraJinguSoldier);
    expect(soldiers).toHaveLength(3); expect(soldiers.every(u => u.owner === caster.id)).toBe(true);
    expect(battle.units.some(u => u.owner === soldier.id)).toBe(false);
  });
  it('does not add Butterfly attack bonuses twice to a Jingu soldier attack snapshot', () => {
    const a = player(0, [{ id: 'custom_monkey_king_jingu_mastery', points: 9 }, { id: 'custom_luna_moon_glaive', points: 9 }]);
    const battle = createBattle(a, player(1), 77, catalog), caster = battle.units[0];
    for (const u of battle.units) { u.moveSpeed = 0; u.nextAttack = 100; }
    const snapshot = caster.attack * (1 + caster.statuses.filter(s => s.kind === 'attackPct').reduce((n, s) => n + (s.value ?? 0), 0)) +
      caster.statuses.filter(s => s.kind === 'attackBonus').reduce((n, s) => n + (s.value ?? 0), 0);
    advance(battle, 2.1); const soldier = battle.units.find(u => u.extraJinguSoldier)!;
    expect(soldier.attack).toBe(snapshot); expect(soldier.skills.some(s => s?.id === 'custom_luna_moon_glaive')).toBe(true);
    expect(soldier.statuses.some(s => s.source === soldier.id && ['attackBonus', 'attackPct'].includes(s.kind))).toBe(false);
  });
  it('reveals ordinary invisibility in Chronosphere, keeps undetectable concealment, and maintains continuous control through status resistance', () => {
    const a = player(0, [{ id: 'custom_faceless_void_chronosphere', points: 9 }]), enemies = player(1);
    enemies.heroes.push({ ...structuredClone(enemies.heroes[0]), id: 'invisible' }, { ...structuredClone(enemies.heroes[0]), id: 'hidden' });
    const battle = createBattle(a, enemies, 77, catalog), [caster, visible, invisible, hidden] = battle.units;
    for (const u of battle.units) { u.x = 0; u.y = u.side ? 4 : 0; u.moveSpeed = 0; u.nextAttack = 100; u.hp = u.maxHp = 10000; }
    invisible.x = 1; invisible.y = 2; hidden.y = 1;
    invisible.statuses.push({ kind: 'invisible', until: 100 }, { kind: 'statusResistance', value: .9, until: 100 });
    hidden.statuses.push({ kind: 'undetectable', until: 100 });
    caster.range = 7; caster.nextAttack = 0; caster.mana = caster.maxMana = 1000;
    advance(battle, 1.2);
    expect(status(invisible, 'revealed')).toBeDefined(); expect(status(hidden, 'revealed')).toBeUndefined();
    expect(battle.events.some(e => e.type === 'attack' && e.source === caster.id && e.target === invisible.id)).toBe(true);
    expect(battle.events.some(e => e.type === 'attack' && e.source === caster.id && e.target === hidden.id)).toBe(false);
    for (let n = 0; n < 15; n++) { stepBattle(battle, FIXED_STEP, catalog); expect(status(invisible, 'stun')?.until).toBeGreaterThan(battle.time); }
    // Keep the speed fixture wholly inside the field and clear of unit bodies.
    caster.x = -2; caster.y = 2; caster.range = 0; caster.moveSpeed = 3.8; caster.nextAttack = 100; caster.castUntil = 0;
    const start = { x: caster.x, y: caster.y }; advance(battle, .2);
    expect(Math.hypot(caster.x - start.x, caster.y - start.y)).toBeCloseTo(2, 1);
    expect(status(caster, 'forceMoveSpeed')?.value).toBe(EXTRA_WORKING_DEFAULTS.chronoCasterMoveSpeed);
    expect(visible.dead).toBe(false);
  });
  it('restores exactly three Purge charges sequentially, not all on the first recharge', () => {
    const h = harness('custom_shadow_demon_demonic_purge', 6), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    p.init!(h.ctx);
    for (let n = 0; n < 3; n++) { expect(p.canCast!(h.ctx)).toBe(true); p.cast!(h.ctx); }
    expect(p.canCast!(h.ctx)).toBe(false); expect(p.cooldown!(h.ctx)).toBe(0);
    h.until(59); expect(p.canCast!(h.ctx)).toBe(false);
    h.until(60); expect(p.canCast!(h.ctx)).toBe(true); p.cast!(h.ctx);
    expect(p.canCast!(h.ctx)).toBe(false);
    h.until(120); expect(p.canCast!(h.ctx)).toBe(true);
  });
  it('grants Ink Swell two charges with the reduced ten-second recharge', () => {
    const h = harness('custom_grimstroke_ink_swell'), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    p.init!(h.ctx); p.cast!(h.ctx); p.cast!(h.ctx);
    expect(p.canCast!(h.ctx)).toBe(false);
    h.until(9.9); expect(p.canCast!(h.ctx)).toBe(false);
    h.until(10); expect(p.canCast!(h.ctx)).toBe(true);
  });
  it('gives Bloodrage max-health lifesteal to the caster and the closest allied hero', () => {
    const h = harness('bloodseeker_bloodrage');
    const summon = structuredClone(h.ally); summon.id = 'summon'; summon.x = .1; summon.summoned = true; h.ctx.battle.units.push(summon);
    EXTRA_PROGRAMS[h.ctx.skill.id].cast!(h.ctx);
    expect(status(h.caster, 'maxHpAttackLifesteal')?.value).toBeCloseTo(.018);
    expect(status(h.ally, 'maxHpAttackLifesteal')?.value).toBeCloseTo(.018);
    expect(status(summon, 'bloodrage')).toBeUndefined();
    expect(status(h.ally, 'attackSpeed')?.value).toBe(status(h.caster, 'attackSpeed')!.value! / 2);
  });
  it('only grants Overload charges for nearby allied casts and then consumes all charges', () => {
    const h = harness('custom_storm_spirit_overload', 6), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    h.ally.x = 7.6; h.ally.y = h.caster.y; p.onAllyCast!({ ...h.ctx, target: h.ally });
    const before = h.target.hp; p.onAttack!(h.ctx); expect(h.target.hp).toBe(before);
    h.ally.x = 7.5; p.onAllyCast!({ ...h.ctx, target: h.ally }); p.onCast!(h.ctx); p.onAttack!(h.ctx);
    expect(before - h.target.hp).toBe(200);
    const after = h.target.hp; p.onAttack!(h.ctx); expect(h.target.hp).toBe(after);
  });
  it('limits Gaben Overload to two unique bounces without recursive charge generation', () => {
    const h = harness('custom_storm_spirit_overload'), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    for (let n = 0; n < 3; n++) { const unit = structuredClone(h.other); unit.id = `bounce${n}`; unit.x += n + 2; h.ctx.battle.units.push(unit); }
    p.onCast!(h.ctx); p.onAttack!(h.ctx); h.until(1);
    expect(h.attacks).toHaveLength(2); expect(new Set(h.attacks).size).toBe(2);
    expect(h.attacks).not.toContain(h.target.id);
    expect(h.caster[`${h.ctx.skill.id}:charges`]).toBe(0);
    expect(p.remaining.length).toBeGreaterThan(0); // Working range is explicit, not reference parity.
  });
  it('combines AA 4.5 attack slow with the separately sourced historical movement slow duration', () => {
    const h = harness('custom_storm_spirit_overload', 3), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    p.onCast!(h.ctx); p.onAttack!(h.ctx);
    expect(status(h.target, 'attackSpeed')?.until).toBe(1.2);
    expect(status(h.target, 'slow')?.until).toBe(.8);
  });
  it('applies the AA 4.5 two-second Infernal Blade break to every Gaben target', () => {
    const h = harness('doom_bringer_infernal_blade'); EXTRA_PROGRAMS[h.ctx.skill.id].cast!(h.ctx);
    expect(status(h.target, 'break')?.until).toBe(2);
    expect(status(h.other, 'break')?.until).toBe(2);
    expect(status(h.target, 'dot')?.until).toBe(4);
  });
  it('uses captured Crippling Fear .1-second cast point ahead of an older zero-time patch', () => {
    expect(EXTRA_PROGRAMS.night_stalker_crippling_fear.castPoint).toBe(.1);
  });
  it('excludes illusions from both sides of Spirit Link as documented in AA 4.5b', () => {
    const h = harness('custom_lone_druid_spirit_link', 6), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    h.ally.owner = h.caster.id; h.ally.illusion = true;
    p.init!(h.ctx); h.tickZones(); expect(status(h.ally, 'ownerLifesteal')).toBeUndefined();
    expect(status(h.caster, 'attackSpeed')).toBeDefined();
    const image = harness('custom_lone_druid_spirit_link', 6); image.caster.illusion = true;
    p.init!(image.ctx); image.tickZones(); expect(image.zones).toHaveLength(0);
  });
  it('selects a real ally for Wolf Bite even when a closer illusion is available', () => {
    const h = harness('lycan_shapeshift'), image = structuredClone(h.ally);
    image.id = 'image'; image.illusion = true; image.x = 1.1; image.y = 2; h.ctx.battle.units.push(image);
    EXTRA_PROGRAMS[h.ctx.skill.id].cast!(h.ctx);
    expect(status(h.ally, 'wolfForm')).toBeDefined(); expect(status(image, 'wolfForm')).toBeUndefined();
  });
  it('uses a normal Standard Soul Rip for both Flesh Golem Gaben proc directions', () => {
    const h = harness('undying_flesh_golem'), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    p.onAttack!(h.ctx); p.onAttacked!(h.ctx);
    expect(h.grants).toEqual([
      { id: 'custom_undying_soul_rip', points: 3, target: h.target.id },
      { id: 'custom_undying_soul_rip', points: 3, target: h.caster.id },
    ]);
    expect(p.gabenImplemented).toBe(true); expect(p.superImplemented).toBe(true);
  });
  it('makes the Dark Pact whole-team copy pay the half-strength normal self-cost', () => {
    const h = harness('custom_slark_dark_pact'), hp = h.ally.hp;
    h.ally.x = 20; // Entire-team copy is not bounded by the caster's nearby radius.
    EXTRA_PROGRAMS[h.ctx.skill.id].cast!(h.ctx); h.until(1.5); expect(h.ally.hp).toBe(hp - 4.5); h.until(2.5);
    expect(h.ally.hp).toBe(hp - 45);
  });
  it('uses source-level Courage cooldown independently for attack and attacked procs', () => {
    const h = harness('legion_commander_moment_of_courage'), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    p.onAttack!(h.ctx); p.onAttacked!(h.ctx); expect(h.attacks).toHaveLength(2);
    h.until(.39); p.onAttack!(h.ctx); p.onAttacked!(h.ctx); expect(h.attacks).toHaveLength(2);
    h.until(.4); p.onAttack!(h.ctx); p.onAttacked!(h.ctx); expect(h.attacks).toHaveLength(4);
  });
  it('applies Shredder armor loss to both extra targets without consuming extra charges', () => {
    const h = harness('custom_snapfire_lil_shredder'), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    h.target.y = h.other.y = h.caster.y + 1;
    const third = structuredClone(h.other); third.id = 'third'; third.x = -1; h.ctx.battle.units.push(third);
    p.cast!(h.ctx); p.onAttack!(h.ctx);
    expect(h.attacks).toHaveLength(2);
    for (const u of [h.target, h.other, third]) expect(status(u, 'armor')?.value).toBe(-1);
    expect(h.caster[`${h.ctx.skill.id}:charges`]).toBe(5);
  });
  it('grants a separate Cleanse action with its own three-charge pool and fifty-mana definition', () => {
    const h = harness('custom_shadow_demon_demonic_purge'), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    p.init!(h.ctx);
    expect(h.caster.skills.some(s => s?.id === 'extra_granted_demonic_cleanse')).toBe(true);
    const child = harness('extra_granted_demonic_cleanse', 1), cp = EXTRA_CHILD_PROGRAMS[child.ctx.skill.id];
    cp.init!(child.ctx); cp.cast!({ ...child.ctx, target: child.ally });
    expect(child.grants).toEqual([{ id: 'custom_shadow_demon_demonic_cleanse', points: 3, target: child.ally.id }]);
    expect(definition(child.ctx.skill.id).mana).toEqual([50]); expect(child.caster[`${child.ctx.skill.id}:charges`]).toBe(2);
    expect(h.caster[`${h.ctx.skill.id}:availableCharges`]).toBe(3);
  });
  it('removes Super Enchant Totem mana and cast point while preserving base timing', () => {
    const h = harness('custom_earthshaker_enchant_totem', 6), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    expect(p.manaCost!(h.ctx)).toBe(0); expect((p.castPoint as (c: EffectContext) => number)(h.ctx)).toBe(0);
    expect(p.cooldown!(h.ctx)).toBe(3.5);
    h.ctx.skill.points = 3; expect((p.castPoint as (c: EffectContext) => number)(h.ctx)).toBe(.3);
  });
  it('keeps the limitations of historically sourced or defaulted upgrades explicit', () => {
    for (const id of ['enchantress_impetus', 'custom_monkey_king_jingu_mastery', 'dazzle_shadow_wave', 'muerta_pierce_the_veil']) {
      expect(EXTRA_PROGRAMS[id].remaining.length).toBeGreaterThan(0);
    }
  });
  it('limits historical Maelstrom to four unique targets, honors jump delay and suppresses procs during its internal cooldown', () => {
    const h = harness('custom_windrunner_focusfire', 6), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    for (let n = 0; n < 3; n++) { const unit = structuredClone(h.other); unit.id = `chain${n}`; unit.x = n + 2; h.ctx.battle.units.push(unit); }
    for (const unit of h.ctx.battle.units) unit.hp = unit.maxHp = 10000;
    p.init!(h.ctx); p.onAttack!(h.ctx); p.onAttack!(h.ctx);
    expect(h.target.hp).toBe(9860); expect(h.other.hp).toBe(10000);
    h.until(.25); expect(h.other.hp).toBe(9860);
    h.until(.75);
    const hit = h.ctx.enemies().filter(u => u.hp < 10000); expect(hit).toHaveLength(4);
    expect(hit.every(u => u.hp === 9860)).toBe(true); expect(status(h.caster, 'attackBonus')?.value).toBe(24);
  });
  it('uses zero Entangle cooldown only for Super bears and never lets the hero trigger bear hooks', () => {
    const h = harness('custom_lone_druid_spirit_bear', 6), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    p.onAttack!(h.ctx); expect(status(h.target, 'root')).toBeUndefined();
    h.caster.extraSpiritBear = true; p.onAttack!(h.ctx); p.onAttack!({ ...h.ctx, target: h.other });
    expect(status(h.target, 'root')?.until).toBe(2.8); expect(status(h.other, 'root')?.until).toBe(2.8);
    const normal = harness('custom_lone_druid_spirit_bear', 3); normal.caster.extraSpiritBear = true;
    p.onAttack!(normal.ctx); p.onAttack!({ ...normal.ctx, target: normal.other });
    expect(status(normal.target, 'root')).toBeDefined(); expect(status(normal.other, 'root')).toBeUndefined();
  });
  it('does not double Fireball damage when a lingering tick and an in-field refresh share a frame', () => {
    const h = harness('dragon_knight_fireball', 1), p = EXTRA_CHILD_PROGRAMS[h.ctx.skill.id];
    h.target.hp = h.target.maxHp = 10000; h.target.x = 0; h.target.y = h.caster.y + 1;
    p.cast!(h.ctx);
    const field = h.zones.find(z => z.radius === 3.5)!; expect(field).toBeDefined();
    // Resource payment belongs to the common cast queue, not the child program.
    h.until(.5); field.effect(h.target, 0); expect(h.target.hp).toBe(9962.5);
    h.until(1); field.effect(h.target, 1); expect(h.target.hp).toBe(9925);
    h.until(3); expect(h.target.hp).toBe(9775); // 6 half-second ticks including two-second linger.
  });
  it('gives Bongo Drums exactly the round-scaled Blessing attack speed and consumes a finite charge', () => {
    const h = harness('luna_lunar_blessing'); h.ctx.skill.superRound = 3; h.ctx.battle.round = 7;
    EXTRA_PROGRAMS[h.ctx.skill.id].init!(h.ctx); h.tickZones();
    expect(status(h.caster, 'attackSpeed')?.value).toBe(56); expect(status(h.caster, 'haste')?.value).toBe(.13);
    expect(h.caster[`${h.ctx.skill.id}:drumCharges`]).toBe(7);
    h.tickZones(); expect(h.caster[`${h.ctx.skill.id}:drumCharges`]).toBe(7);
  });
  it('performs Heavenly Jump at the same position and caps it at two targets', () => {
    const h = harness('custom_zuus_static_field'), original = { x: h.caster.x, y: h.caster.y };
    const third = structuredClone(h.other); third.id = 'third'; third.x = 9; h.ctx.battle.units.push(third);
    EXTRA_PROGRAMS[h.ctx.skill.id].onDealDamage!({ ...h.ctx, triggerSkillId: 'test' });
    expect({ x: h.caster.x, y: h.caster.y }).toEqual(original);
    expect(h.ctx.enemies().filter(u => status(u, 'castTimePct'))).toHaveLength(2);
    expect(status(h.target, 'castTimePct')?.value).toBe(.5); expect(status(h.target, 'slow')?.until).toBe(1.6);
  });
  it('uses one inverse Chaos Bolt roll so maximum damage cannot also receive maximum stun', () => {
    const low = harness('custom_chaos_knight_reality_rift', 6), high = harness('custom_chaos_knight_reality_rift', 6);
    high.ctx.random = () => 1; const beforeLow = low.target.hp, beforeHigh = high.target.hp;
    EXTRA_PROGRAMS[low.ctx.skill.id].cast!(low.ctx); EXTRA_PROGRAMS[high.ctx.skill.id].cast!(high.ctx);
    expect(beforeLow - low.target.hp).toBe(150); expect(status(low.target, 'stun')?.until).toBe(4);
    expect(beforeHigh - high.target.hp).toBe(300); expect(status(high.target, 'stun')?.until).toBe(2);
  });
  it('prioritizes visible heroes over a closer summon for Heavenly Jump', () => {
    const h = harness('custom_zuus_static_field'), summon = structuredClone(h.other);
    summon.id = 'creep'; summon.summoned = true; summon.x = h.caster.x; summon.y = h.caster.y + .1; h.ctx.battle.units.push(summon);
    EXTRA_PROGRAMS[h.ctx.skill.id].onDealDamage!({ ...h.ctx, triggerSkillId: 'test' });
    expect(status(summon, 'castTimePct')).toBeUndefined(); expect(status(h.target, 'castTimePct')).toBeDefined(); expect(status(h.other, 'castTimePct')).toBeDefined();
  });
  it('uses a bounded delayed Echo strike and honors effective melee stance without recursive double attacks', () => {
    const h = harness('custom_monkey_king_jingu_mastery', 6), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    h.ctx.status(h.caster, 'attackRangeOverride', 100, 1.5);h.ctx.status(h.caster, 'attackTypeOverride', 100, 1); p.onAttack!(h.ctx);
    expect(h.attacks).toHaveLength(0); h.until(.1); expect(h.attacks).toEqual([h.target.id]);
    p.onAttack!(h.ctx); h.until(.2); expect(h.attacks).toHaveLength(1);
    expect(status(h.target, 'slow')?.until).toBeCloseTo(.9);
  });
  it('limits Gunslinger to a single secondary attack and falls back to the primary target', () => {
    const h = harness('muerta_pierce_the_veil'), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    h.target.x = h.caster.x + 1; h.target.y = h.caster.y; h.other.x = h.caster.x + 2; h.other.y = h.caster.y;
    const targets: string[] = [];
    h.ctx.attack = unit => { targets.push(unit.id); p.onAttack!({ ...h.ctx, target: unit });return {landed:true,damage:0}; };
    p.onAttack!(h.ctx); expect(targets).toEqual([h.other.id]);
    h.other.dead = true; p.onAttack!(h.ctx); expect(targets).toEqual([h.other.id, h.target.id]);
  });
  it('makes evil attendants do the documented working damage independently of injured allies', () => {
    const h = harness('custom_enchantress_natures_attendants'), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    h.target.x = h.caster.x + 1; h.target.y = h.caster.y; h.target.hp = h.target.maxHp = 5000;
    for (const ally of h.ctx.allies()) ally.hp = ally.maxHp;
    expect(p.canCast!(h.ctx)).toBe(true); p.cast!(h.ctx); h.tickZones();
    expect(h.target.hp).toBe(5000 - 234); // 13 wisps × 36 DPS × half-second pulse.
    expect(EXTRA_WORKING_DEFAULTS.evilWispCount).toBe(13);
  });
  it('runs passive Radiance independently of Flame Guard and stops its refresh while broken', () => {
    const h = harness('custom_ember_spirit_flame_guard'), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    p.init!(h.ctx); const hp = h.target.hp; h.zones[0].effect(h.target, 0);
    expect(h.target.hp).toBe(hp - 30); expect(status(h.target, 'blind')?.value).toBe(.15);
    expect(status(h.caster, 'magicShield')).toBeUndefined();
    h.ctx.status(h.caster, 'break', 5); h.zones[0].effect(h.target, 1); expect(h.target.hp).toBe(hp - 30);
  });
  it('slows allied attack and cast clocks multiplicatively inside Gaben Chronosphere', () => {
    const h = harness('custom_faceless_void_chronosphere'); EXTRA_PROGRAMS[h.ctx.skill.id].cast!(h.ctx);
    h.zones[0].effect(h.ally, 0); h.zones[0].effect(h.target, 0);
    expect(status(h.ally, 'attackTimePct')?.value).toBe(5.5);
    expect(status(h.ally, 'castTimePct')?.value).toBe(5.5); expect(status(h.ally, 'stun')).toBeUndefined();
    expect(status(h.target, 'stun')).toBeDefined();
  });
  it('propagates Shapeshift to later summons and maintains range-limited shared Wolf Bite lifesteal', () => {
    const h = harness('lycan_shapeshift'), p = EXTRA_PROGRAMS[h.ctx.skill.id]; p.init!(h.ctx); p.cast!(h.ctx);
    const newborn = structuredClone(h.ally); newborn.id = 'newborn'; newborn.owner = h.caster.id; newborn.summoned = true; newborn.statuses = []; h.ctx.battle.units.push(newborn);
    h.tickZones(); expect(status(newborn, 'forceMoveSpeed')?.value).toBe(5.5);
    expect(status(h.ally, 'ownerLifesteal')?.data?.ownerId).toBe(h.caster.id);
    h.ally.x = 100; h.until(1); h.tickZones(); expect(status(h.ally, 'ownerLifesteal')!.until).toBeLessThan(1);
  });
  it('uses only three furthest Sproink targets, disjoints the caster and resolves attacks after knockback', () => {
    const h = harness('enchantress_bunny_hop', 1), p = EXTRA_CHILD_PROGRAMS[h.ctx.skill.id];
    for (let n = 0; n < 2; n++) { const unit = structuredClone(h.other); unit.id = `far${n}`; unit.x = h.caster.x + n + 3; unit.y = h.caster.y; h.ctx.battle.units.push(unit); }
    h.target.x = h.caster.x + .5; h.target.y = h.caster.y; h.other.x = h.caster.x + 2; h.other.y = h.caster.y;
    let disjointed = ''; h.ctx.disjoint = target => { disjointed = target.id; }; p.cast!(h.ctx);
    expect(disjointed).toBe(h.caster.id); h.until(.39); expect(h.attacks).toHaveLength(0); h.until(.4);
    expect(h.attacks).toHaveLength(3); expect(h.attacks).not.toContain(h.target.id); expect(h.other.x).toBe(h.caster.x + 7);
    expect(h.caster.extraFreeImpetus).toBe(false);
  });
});

describe('extra skill integration with combat and persistent gains', () => {
  it('keeps two casters Fireball field and lingering damage independent on the same target', () => {
    function fireballs(count: number) {
      const a = player(0, [{ id: 'dragon_knight_fireball', points: 1 }]);
      if (count === 2) a.heroes.push({ ...structuredClone(a.heroes[0]), id: 'second-caster' });
      const battle = createBattle(a, player(1), 7, catalog), target = battle.units.find(u => u.side === 1)!;
      for (const [index, u] of battle.units.entries()) {
        u.x = u.side === 1 ? 0 : index - .5; u.y = u.side === 1 ? 2 : 0;
        u.moveSpeed = 0; u.nextAttack = 100; u.mana = u.maxMana = 1000;
      }
      target.hp = target.maxHp = 10000; advance(battle, 1.3);
      return { battle, target, fieldDamage: 10000 - target.hp };
    }
    const single = fireballs(1), double = fireballs(2);
    expect(single.fieldDamage).toBeGreaterThan(0); expect(double.fieldDamage).toBeCloseTo(single.fieldDamage * 2);
    expect(double.target.statuses.filter(s => s.kind === 'fireballBurn')).toHaveLength(2);
    for (const h of [single, double]) { h.target.x = 12; h.target.y = 10; advance(h.battle, 2.1); }
    const singleLinger = 10000 - single.target.hp - single.fieldDamage, doubleLinger = 10000 - double.target.hp - double.fieldDamage;
    expect(singleLinger).toBeGreaterThan(0); expect(doubleLinger).toBeCloseTo(singleLinger * 2);
    const sourceDamage = double.battle.units.filter(u => u.side === 0).map(u => u.damage);
    expect(sourceDamage).toHaveLength(2); expect(sourceDamage[0]).toBeCloseTo(sourceDamage[1]);
  });
  it('counts Lunar Blessing rounds since upgrade, including a restored old stack with no timestamp', () => {
    const id = 'luna_lunar_blessing', a = player(0, [{ id, points: 6, superRound: 4 }]);
    const battle = createBattle(a, player(1), 11, catalog, undefined, 7); advance(battle, .3);
    const base = skillValue({ definition: definition(id), skill: { id, points: 6 } }, 'DAMAGE BONUS');
    expect(status(battle.units[0], 'attackBonus')?.value).toBe(base + 12);
    a.heroes[0].skills[0]!.superRound = undefined;
    const old = createBattle(a, player(1), 11, catalog, undefined, 7); advance(old, .3);
    expect(status(old.units[0], 'attackBonus')?.value).toBe(base);
  });
  it('records the last enemy hero death as permanent Flesh Heap Strength before battle termination', () => {
    const id = 'custom_pudge_flesh_heap', battle = createBattle(player(0, [{ id, points: 9 }]), player(1), 7, catalog);
    const [caster, target] = battle.units, strength = Number(caster.strength);
    applyDamage(battle, caster, target, target.maxHp * 10, 'pure');
    expect(caster.strength).toBe(strength + 4);
    expect(battleGains(battle)).toEqual([{ heroId: 'h0', attack: 0, strength: 0, agility: 0, intelligence: 0,
      skillState: { [`${id}:strength`]: 4 } }]);
  });
  it('grants Atrophy damage immediately on the final death and shares it at Gaben', () => {
    const id = 'custom_abyssal_underlord_atrophy_aura', battle = createBattle(player(0, [{ id, points: 9 }]), player(1), 7, catalog);
    const [caster, target] = battle.units;
    applyDamage(battle, caster, target, target.maxHp * 10, 'pure');
    expect(status(caster, 'attackBonus')?.value).toBe(45);
    expect(battleGains(battle)).toEqual([]);
  });
  it('restores Duel and Flesh Heap benefits only on the hero equipping their skill instances', () => {
    const duel = { id: 'custom_legion_commander_duel', points: 9,
      persistentState: { 'custom_legion_commander_duel:attack': 33 } };
    const heap = { id: 'custom_pudge_flesh_heap', points: 9,
      persistentState: { 'custom_pudge_flesh_heap:strength': 4 } };
    const a = player(0, [duel, heap]); a.heroes.push({ ...structuredClone(a.heroes[0]), id: 'recipient', skills: [] });
    const before = createBattle(a, player(1), 7, catalog);
    const donor = before.units.find(u => u.id === '0:h0')!, recipient = before.units.find(u => u.id === '0:recipient')!;
    expect(donor.attack - recipient.attack).toBe(33); expect(Number(donor.strength) - Number(recipient.strength)).toBe(4);
    expect(donor.maxHp - recipient.maxHp).toBe(88); expect(battleGains(before)).toEqual([]);
    a.heroes[1].skills = a.heroes[0].skills; a.heroes[0].skills = [];
    const after = createBattle(a, player(1), 7, catalog);
    const oldBody = after.units.find(u => u.id === '0:h0')!, newBody = after.units.find(u => u.id === '0:recipient')!;
    expect(oldBody.attack).toBe(recipient.attack); expect(oldBody.strength).toBe(recipient.strength);
    expect(newBody.attack).toBe(donor.attack); expect(newBody.strength).toBe(donor.strength); expect(newBody.maxHp).toBe(donor.maxHp);
    expect(battleGains(after)).toEqual([]);
  });
  it('adds only newly earned Heap Strength to the persistent instance total across multiple deaths', () => {
    const id = 'custom_pudge_flesh_heap', stack = { id, points: 9, persistentState: { [`${id}:strength`]: 4 } };
    const enemies = player(1); enemies.heroes.push({ ...structuredClone(enemies.heroes[0]), id: 'second' });
    const b = createBattle(player(0, [stack]), enemies, 7, catalog), caster = b.units[0], original = Number(caster.strength);
    for (const target of b.units.filter(u => u.side !== caster.side)) {
      target.x = caster.x; target.y = caster.y + 2; applyDamage(b, caster, target, target.maxHp * 10, 'pure');
    }
    expect(caster.strength).toBe(original + 8);
    expect(caster.skillState).toEqual({ [`${id}:strength`]: 12 });
    expect(caster.permanentSkillGains).toEqual({ [`${id}:strength`]: 8 });
    expect(caster.statuses.filter(s => s.skill === `${id}:persistent` && s.kind === 'strength')).toHaveLength(1);
  });
  it('summons a Super Offering golem after caster death without mana or cooldown requirements', () => {
    const id = 'custom_warlock_chaotic_offering', team=player(0, [{ id, points: 6 }]);
    team.heroes.push({...structuredClone(team.heroes[0]),id:'surviving-ally',skills:[]});
    const battle = createBattle(team, player(1), 7, catalog),caster=battle.units[0],enemy=battle.units.find(unit=>unit.side===1)!;
    for(const unit of battle.units){unit.nextAttack=100;unit.moveSpeed=0;}caster.mana = 0; caster.cooldowns[0] = 100;
    applyDamage(battle, enemy, caster, caster.maxHp * 10, 'pure');
    expect(battle.units.filter(unit=>unit.owner===caster.id&&unit.name==='地狱火')).toHaveLength(0);advance(battle,.6);
    const golems = battle.units.filter(u => u.owner === caster.id && u.name === '地狱火');
    expect(golems).toHaveLength(1); expect(golems[0].dead).toBe(false);
    expect(golems[0].maxHp).toBe(skillValue({ definition: definition(id), skill: { id, points: 6 } }, 'GOLEM HEALTH'));
    expect(battle.finished).toBe(false);
  });
  it('keeps Gaben Magnetic Field deferred damage after leaving the area without reapplying resistance', () => {
    const id = 'arc_warden_magnetic_field', battle = createBattle(player(0, [{ id, points: 9 }]), player(1), 7, catalog);
    const [caster, enemy] = battle.units;
    for (const u of battle.units) { u.moveSpeed = 0; u.range = 0; u.nextAttack = 100; }
    caster.mana = 1000; advance(battle, .6);
    expect(status(caster, 'damageDelay')?.value).toBe(2.5);
    const health = caster.hp; expect(applyDamage(battle, enemy, caster, 100, 'pure', 'test')).toBe(0);
    caster.x = 9; caster.statuses.push({ kind: 'damageReduction', value: .9, until: 100 });
    advance(battle, 2.4); expect(caster.hp).toBe(health);
    advance(battle, .2); expect(caster.hp).toBe(health - 100);
  });
  it('adds Gaben Berserker Strength exactly once and derives regeneration from it', () => {
    const id = 'huskar_berserkers_blood', normal = createBattle(player(0, [{ id, points: 6 }]), player(1), 7, catalog);
    const upgraded = createBattle(player(0, [{ id, points: 9 }]), player(1), 7, catalog);
    const caster = upgraded.units[0]; expect(caster.strength).toBe(Number(normal.units[0].strength) + 60);
    caster.hp = caster.maxHp * .05; advance(upgraded, .3);
    expect(status(caster, 'regen')?.value).toBeCloseTo(Number(caster.strength) * .9, 5);
    advance(upgraded, .3); expect(caster.strength).toBe(Number(normal.units[0].strength) + 60);
  });
  it('applies Butterfly Agility once and includes the resulting armor/attack speed in combat attributes', () => {
    const id = 'custom_luna_moon_glaive', base = createBattle(player(0, [{ id, points: 6 }]), player(1), 7, catalog);
    const upgraded = createBattle(player(0, [{ id, points: 9 }]), player(1), 7, catalog);
    expect(upgraded.units[0].agility).toBe(Number(base.units[0].agility) + 35);
    expect(upgraded.units[0].armor).toBeCloseTo(base.units[0].armor + 35 * .167, 4);
    expect(status(upgraded.units[0], 'evasion')?.value).toBe(.35);
    advance(upgraded, .3); expect(upgraded.units[0].agility).toBe(Number(base.units[0].agility) + 35);
  });
  it('keeps the Wraith Pact body attack-count based and its aura alive after its caster dies', () => {
    const id = 'custom_beastmaster_inner_beast', owner = player(0, [{ id, points: 9 }]);
    owner.heroes.push({ ...structuredClone(owner.heroes[0]), id: 'surviving-ally', skills: [] });
    const battle = createBattle(owner, player(1), 7, catalog);
    const caster = battle.units[0], enemy = battle.units.find(u => u.side === 1)!, totem = battle.units.find(u => u.name === '怨灵图腾')!;
    for (const unit of battle.units) { unit.moveSpeed = 0; unit.nextAttack = 100; }
    expect(totem.hp).toBe(8); expect(applyDamage(battle, enemy, totem, 9999, 'magical', 'test')).toBe(0);
    expect(applyDamage(battle, enemy, totem, 9999, 'physical')).toBe(2); expect(totem.hp).toBe(6);
    applyDamage(battle, enemy, caster, 99999, 'pure'); const hp = enemy.hp;
    expect(battle.finished).toBe(false); // A real ally keeps the team in play; ordinary summons do not.
    advance(battle, .3); expect(enemy.hp).toBeLessThan(hp); expect(status(enemy, 'physicalOutputReduction')?.value).toBe(.3);
    applyDamage(battle, enemy, totem, 9999, 'physical'); applyDamage(battle, enemy, totem, 9999, 'physical'); applyDamage(battle, enemy, totem, 9999, 'physical');
    expect(totem.dead).toBe(true);
  });
  it('summons fully configured bears without granting them item Strength or hero attributes', () => {
    const id = 'custom_lone_druid_spirit_bear', battle = createBattle(player(0, [{ id, points: 9 }]), player(1), 7, catalog);
    const [caster, enemy] = battle.units; caster.mana = caster.maxMana = 1000; enemy.nextAttack = 100; enemy.moveSpeed = 0;
    advance(battle, .7); const bear = battle.units.find(u => u.extraSpiritBear)!;
    expect(bear).toBeDefined(); expect(bear.attack).toBe(28); expect(bear.maxHp).toBe(3000);
    expect(bear.strength).toBe(0); expect(bear.agility).toBe(0); expect(bear.intelligence).toBe(0);
    expect(status(bear, 'attackBonus')?.value).toBe(59); expect(status(bear, 'attackSpeed')?.value).toBe(80);
  });
  it('summons eight upgraded skeletons and revives them indefinitely without extending their lifetime', () => {
    const id = 'custom_skeleton_king_vampiric_aura', battle = createBattle(player(0, [{ id, points: 9 }]), player(1), 7, catalog);
    const [caster, enemy] = battle.units; caster.mana = caster.maxMana = 1000; enemy.nextAttack = 100; enemy.moveSpeed = 0; enemy.hp = enemy.maxHp = 100000;
    advance(battle, 2.2); const bones = battle.units.filter(u => u.extraVampiricSkeleton);
    expect(bones).toHaveLength(8); expect(bones[0].maxHp).toBe(350); expect(bones[0].attack).toBe(48.5);
    for (const unit of battle.units) { unit.nextAttack = 100; unit.moveSpeed = 0; }
    const bone = bones[0], expires = bone.expiresAt;
    for (let death = 0; death < 2; death++) { applyDamage(battle, enemy, bone, 9999, 'pure'); expect(bone.dead).toBe(true); advance(battle, 3.1); expect(bone.dead).toBe(false); }
    expect(bone.extraSkeletonLives).toBe(2); expect(bone.expiresAt).toBe(expires);
  });
  it('applies friendly Purifying Flames nonlethality after magic resistance rather than reducing its raw damage', () => {
    const id = 'custom_oracle_fortunes_end', a = player(0, [{ id, points: 6 }]); a.heroes[0].x = 0; a.heroes[0].y = 0;
    const battle = createBattle(a, player(1), 7, catalog), [caster, enemy] = battle.units;
    caster.x = 0; caster.y = 0; enemy.x = 0; enemy.y = 1;
    caster.hp = 200; caster.magicResist = .5; caster.mana = 1000; enemy.nextAttack = 100; enemy.moveSpeed = 0; caster.nextAttack = 100;
    advance(battle, .1); expect(caster.hp).toBeLessThan(30); expect(caster.dead).toBe(false);
    expect(caster.statuses.some(s => s.kind === 'undying')).toBe(false);
  });
  it('casts granted Depth Shroud through its own combat slot without changing the purchased build', () => {
    const id = 'slark_shadow_dance', roster = player(0, [{ id, points: 9 }]);
    roster.heroes.push({ ...structuredClone(roster.heroes[0]), id: 'friend', x: 1, skills: [] });
    const battle = createBattle(roster, player(1), 7, catalog), caster = battle.units[0], ally = battle.units.find(u => u.side === caster.side && u.id !== caster.id)!;
    for (const unit of battle.units) { unit.nextAttack = 100; unit.moveSpeed = 0; }
    ally.hp = ally.maxHp * .5; caster.mana = 1000;
    advance(battle, .4);
    const slot = caster.skills.findIndex(s => s?.id === 'slark_depth_shroud');
    expect(slot).toBeGreaterThanOrEqual(5); expect(caster.cooldowns[slot]).toBeGreaterThan(75);
    expect(battle.events.some(e => e.type === 'cast' && e.skill === 'slark_depth_shroud')).toBe(true);
    expect(caster.mana).toBeGreaterThanOrEqual(925); expect(caster.mana).toBeLessThan(930);
    expect(status(ally, 'undetectable')).toBeDefined(); expect(status(ally, 'regen')?.value).toBe(120);
    expect(roster.heroes[0].skills).toEqual([{ id, points: 9 }]);
  });
  it('gives level-two True Form an independent mana/cooldown ledger and removes only its temporary HP on expiry', () => {
    const id = 'custom_lone_druid_spirit_link', battle = createBattle(player(0, [{ id, points: 9 }]), player(1), 7, catalog), [caster] = battle.units;
    for (const unit of battle.units) { unit.nextAttack = 100; unit.moveSpeed = 0; }
    const baseHp = caster.maxHp; caster.mana = 1000;
    advance(battle, .2);
    const slot = caster.skills.findIndex(s => s?.id === 'lone_druid_true_form');
    expect(slot).toBeGreaterThanOrEqual(5); expect(caster.skills[slot]?.points).toBe(2);
    expect(caster.maxHp).toBe(baseHp + 1000); expect(status(caster, 'attackRangeOverride')?.value).toBe(1.5);
    expect(caster.statuses.filter(s => s.kind === 'armor').reduce((sum, s) => sum + (s.value ?? 0), 0)).toBe(10);
    expect(caster.cooldowns[slot]).toBeGreaterThan(100); expect(caster.mana).toBeGreaterThanOrEqual(800); expect(caster.mana).toBeLessThan(805);
    advance(battle, 40); expect(caster.maxHp).toBe(baseHp); expect(caster.hp).toBeLessThanOrEqual(baseHp);
    expect(battle.events.filter(e => e.type === 'cast' && e.skill === 'lone_druid_true_form')).toHaveLength(1);
  });
  it('queues the matching Whirling Axes variant and applies Gaben mana/cooldown while retaining the other variant inactive', () => {
    const id = 'custom_troll_warlord_berserkers_rage', battle = createBattle(player(0, [{ id, points: 9 }]), player(1), 7, catalog), [caster, target] = battle.units;
    caster.x = 0; caster.y = 0; target.x = 0; target.y = 1; caster.mana = 1000;
    for (const unit of battle.units) { unit.nextAttack = 100; unit.moveSpeed = 0; }
    advance(battle, .7);
    const melee = caster.skills.findIndex(s => s?.id === 'troll_warlord_whirling_axes_melee');
    const ranged = caster.skills.findIndex(s => s?.id === 'troll_warlord_whirling_axes_ranged');
    expect(melee).toBeGreaterThanOrEqual(5); expect(ranged).toBeGreaterThan(melee);
    expect(caster.cooldowns[melee]).toBeGreaterThan(4); expect(caster.cooldowns[ranged]).toBe(0);
    expect(caster.mana).toBeGreaterThanOrEqual(975); expect(caster.mana).toBeLessThan(980);
    expect(status(target, 'blind')?.value).toBe(.6);
    expect(battle.events.filter(e => e.type === 'cast' && e.skill === 'troll_warlord_whirling_axes_melee')).toHaveLength(1);
  });
  it.each(['expiry', 'death'])('publishes the real melee Axes zone layer, follows its source and removes it on %s', ending => {
    const id = 'custom_troll_warlord_berserkers_rage', child = 'troll_warlord_whirling_axes_melee';
    const battle = createBattle(player(0, [{ id, points: 9 }]), player(1), 7, catalog), [caster, target] = battle.units;
    caster.x = caster.y = 0; target.x = 0; target.y = 1; caster.mana = 1000;
    for (const unit of battle.units) { unit.nextAttack = 100; unit.moveSpeed = 0; unit.hp = unit.maxHp = 100000; }
    advance(battle, .7);
    const zone = () => (battle.zones as { id: string; skill: string; layer: string; source: string; visualSkill: string; visualPoints: number; x: number; y: number; until: number }[]).find(z => z.skill === child);
    expect(zone()).toMatchObject({ source: caster.id, skill: child, layer: 'axe_melee', visualSkill: id, visualPoints: 9 });
    caster.x = -3; caster.y = -3; advance(battle, .1);
    expect(zone()).toMatchObject({ x: caster.x, y: caster.y });
    if (ending === 'death') { caster.dead = true; caster.hp = 0; advance(battle, .1); }
    else advance(battle, 2.5);
    expect(zone()).toBeUndefined();
  });
  it('creates the Reality Rift six-second full-damage illusion with the historical incoming multiplier', () => {
    const id = 'custom_chaos_knight_reality_rift', battle = createBattle(player(0, [{ id, points: 6 }]), player(1), 7, catalog), [caster, target] = battle.units;
    caster.x = 0; caster.y = 0; target.x = 0; target.y = 2; caster.mana = 1000; target.hp = target.maxHp = 100000;
    for (const unit of battle.units) { unit.nextAttack = 100; unit.moveSpeed = 0; }
    advance(battle, .8); const image = battle.units.find(u => u.name === '混沌幻象')!;
    expect(image).toBeDefined(); expect(image.illusion).toBe(true); expect(image.attack).toBe(caster.attack);
    expect(image.damageTakenMultiplier).toBe(3.25); expect(Number(image.expiresAt) - battle.events.find(e => e.type === 'summon' && e.target === image.id)!.time).toBe(6);
    expect((status(image, 'attackTarget') as EffectStatus).data?.targetId).toBe(target.id);
  });
  it('initializes a strong Venge illusion without adding an inherited sixty Strength twice', () => {
    const battle = createBattle(player(0, [{ id: 'vengefulspirit_command_aura', points: 9 }, { id: 'huskar_berserkers_blood', points: 9 }]), player(1), 7, catalog), [caster, enemy] = battle.units;
    const strength = caster.strength, hp = caster.maxHp; applyDamage(battle, enemy, caster, 999999, 'pure');
    const image = battle.units.find(u => u.strongAuraIllusion)!;
    expect(image).toBeDefined(); expect(image.strength).toBe(strength); expect(image.maxHp).toBe(hp);
    image.hp = image.maxHp * .05; enemy.nextAttack = 100; enemy.moveSpeed = 0; advance(battle, .3);
    expect(status(image, 'regen')?.value).toBeCloseTo(Number(strength) * .9);
    applyDamage(battle, enemy, image, 999999, 'pure'); expect(battle.units.filter(u => u.strongAuraIllusion)).toHaveLength(1);
  });
  it('spawns stationary invulnerable stone soldiers every two seconds and expires the oldest after twelve seconds', () => {
    const battle = createBattle(player(0, [{ id: 'custom_monkey_king_jingu_mastery', points: 9 }]), player(1), 7, catalog), [caster, enemy] = battle.units;
    for (const unit of battle.units) { unit.nextAttack = 100; unit.moveSpeed = 0; } enemy.hp = enemy.maxHp = 1000000;
    advance(battle, 4.1); const soldiers = battle.units.filter(u => u.extraJinguSoldier);
    expect(soldiers).toHaveLength(2); expect(soldiers[0].moveSpeed).toBe(0); expect(soldiers[0].attackInterval).toBe(1.2); expect(soldiers[0].range).toBe(caster.range + 4);
    expect(applyDamage(battle, enemy, soldiers[0], 9999, 'pure')).toBe(0);
    advance(battle, 10); expect(soldiers[0].dead).toBe(true); expect(battle.units.filter(u => u.extraJinguSoldier && !u.dead)).toHaveLength(6);
  });
  it('deduplicates Bad Juju armor per affected target and prevents its active from recursively creating stacks', () => {
    const roster = player(0, [{ id: 'dazzle_shadow_wave', points: 9 }]); roster.heroes.push({ ...structuredClone(roster.heroes[0]), id: 'ally', x: 1, skills: [] });
    const battle = createBattle(roster, player(1), 7, catalog), caster = battle.units[0], ally = battle.units.find(u => u.side === caster.side && u.id !== caster.id)!, enemy = battle.units.find(u => u.side !== caster.side)!;
    caster.x = 0; caster.y = 0; ally.x = 1; ally.y = 0; enemy.x = .5; enemy.y = 0; ally.hp /= 2; enemy.hp = enemy.maxHp = 100000;
    for (const unit of battle.units) { unit.nextAttack = 100; unit.moveSpeed = 0; } caster.mana = 1000;
    advance(battle, 1.5);
    expect(enemy.statuses.filter(s => s.kind === 'badJuju')).toHaveLength(1); expect(ally.statuses.filter(s => s.kind === 'badJuju')).toHaveLength(1);
    expect(enemy.statuses.filter(s => s.kind === 'armor').reduce((n, s) => n + (s.value ?? 0), 0)).toBe(-3);
    expect(battle.events.some(e => e.type === 'cast' && e.skill === 'dazzle_bad_juju')).toBe(true);
  });
});

describe('extra captured catalog differences', () => {
  function setup(id: string, points = 3, allies = 2, enemies = 1) {
    const a = player(0, [{ id, points }]), b = player(1);
    for (let n = 0; n < allies; n++) a.heroes.push({ ...structuredClone(a.heroes[0]), id: `friend${n}`, skills: [] });
    for (let n = 1; n < enemies; n++) b.heroes.push({ ...structuredClone(b.heroes[0]), id: `foe${n}`, skills: [] });
    const battle = createBattle(a, b, 79, catalog), caster = battle.units[0];
    for (const u of battle.units) { u.moveSpeed = 0; u.nextAttack = 100; u.hp = u.maxHp = 10000; u.x = 0; u.y = u.side ? 10 : 0; }
    caster.maxMana = caster.mana = 1000;
    return { battle, caster, allies: battle.units.filter(u => u.side === caster.side && u.id !== caster.id), enemies: battle.units.filter(u => u.side !== caster.side) };
  }
  it('casts Empower on the closest other ally even when a farther ally is injured', () => {
    const h = setup('custom_magnataur_empower'), [near, injured] = h.allies;
    near.x = 1; injured.x = 4; injured.hp = 100;
    advance(h.battle, .2);
    expect(status(near, 'empower')).toBeDefined(); expect(status(injured, 'empower')).toBeUndefined();
    expect(status(h.caster, 'empower')).toBeUndefined();
  });
  it('casts Ink Swell on an in-range frontliner, then falls back when the frontline is outside range', () => {
    const front = setup('custom_grimstroke_ink_swell'), [close, forward] = front.allies;
    close.x = 1; close.hp = 100; forward.y = 5;
    advance(front.battle, .5);
    expect(status(forward, 'inkSwell')).toBeDefined(); expect(status(close, 'inkSwell')).toBeUndefined();
    const fallback = setup('custom_grimstroke_ink_swell'); fallback.allies[0].x = 1; fallback.allies[1].y = 12;
    advance(fallback.battle, .5);
    expect(status(fallback.allies[0], 'inkSwell')).toBeDefined(); expect(status(fallback.allies[1], 'inkSwell')).toBeUndefined();
  });
  it('selects the enemy deepest in the backline, not the nearest or farthest diagonal unit', () => {
    const h = setup('custom_chaos_knight_reality_rift', 3, 0, 3), [near, back, diagonal] = h.enemies;
    near.y = 1; back.y = 5; diagonal.x = 10; diagonal.y = 2;
    advance(h.battle, .5);
    const cast = h.battle.events.find(e => e.type === 'cast' && e.skill === 'custom_chaos_knight_reality_rift');
    expect(cast?.target).toBe(back.id); expect(status(back, 'armor')?.value).toBe(-7); expect(status(near, 'armor')).toBeUndefined();
  });
  it('creates the Rift illusion only after the Chaos Bolt projectile impacts', () => {
    const h = harness('custom_chaos_knight_reality_rift', 6); let hit: ((unit: CombatUnit) => void) | undefined, summons = 0;
    h.ctx.projectile = (_target, _speed, callback) => { hit = callback; };
    h.ctx.summon = () => { summons++; return []; };
    EXTRA_PROGRAMS[h.ctx.skill.id].cast!(h.ctx);
    expect(summons).toBe(0); expect(hit).toBeDefined(); hit!(h.target); expect(summons).toBe(1);
  });
  it('awards Duel victory once after an allied third-party kill and immediately ends the duel', () => {
    const h = setup('custom_legion_commander_duel', 3, 1), target = h.enemies[0]; target.y = 2;
    advance(h.battle, .5); expect(status(h.caster, 'duel')).toBeDefined();
    applyDamage(h.battle, h.allies[0], target, 100000, 'pure');
    expect(h.caster.permanentAttackGain).toBe(0);
    expect(battleGains(h.battle).find(g => g.heroId === h.caster.heroId)?.skillState).toEqual({ 'custom_legion_commander_duel:attack': 33 });
    expect(status(h.caster, 'duel')).toBeUndefined(); expect(status(target, 'duel')).toBeUndefined();
    applyDamage(h.battle, h.allies[0], target, 100000, 'pure');
    expect(h.caster.permanentSkillGains).toEqual({ 'custom_legion_commander_duel:attack': 33 });
  });
  it('never gives Duel victory damage to an enemy that kills the caster', () => {
    const h = setup('custom_legion_commander_duel', 3, 1), target = h.enemies[0]; target.y = 2;
    target.skills = [{ id: 'custom_legion_commander_duel', points: 3 }]; target.cooldowns = [100];
    advance(h.battle, .5); expect(status(target, 'duel')?.source).toBe(h.caster.id);
    applyDamage(h.battle, target, h.caster, 100000, 'pure');
    expect(target.permanentAttackGain).toBe(0); expect(status(target, 'duel')).toBeUndefined();
  });
  it('ignores a closer summoned body when choosing a Duel opponent', () => {
    const h = setup('custom_legion_commander_duel', 3, 0, 2), [summon, hero] = h.enemies;
    summon.y = 1; summon.summoned = true; hero.y = 3;
    advance(h.battle, .5);
    expect(status(hero, 'duel')).toBeDefined(); expect(status(summon, 'duel')).toBeUndefined();
  });
  it('uses Goo Super as a no-target cast and allows Gaben ally buffs without a nearby enemy', () => {
    const h = setup('custom_bristleback_viscous_nasal_goo', 9, 1); h.allies[0].x = 1; h.enemies[0].y = 12;
    advance(h.battle, .2);
    expect(status(h.allies[0], 'nasalGoo')?.value).toBe(1); expect(status(h.caster, 'armor')?.value).toBe(5);
    expect(status(h.enemies[0], 'nasalGoo')).toBeUndefined();
    const hidden = setup('custom_bristleback_viscous_nasal_goo', 6, 0); hidden.enemies[0].y = 2;
    hidden.enemies[0].statuses.push({ kind: 'shadowRealm', source: hidden.enemies[0].id, skill: 'test', until: 10 });
    advance(hidden.battle, .2); expect(status(hidden.enemies[0], 'nasalGoo')?.value).toBe(1);
  });
  it('retains capped Hypothermia after the basic slow and bursts using the AA per-stack damage', () => {
    const h = harness('custom_drow_ranger_frost_arrows', 3), p = EXTRA_PROGRAMS[h.ctx.skill.id]; h.caster.mana = 0;
    for (let n = 0; n < 9; n++) p.onAttack!(h.ctx);
    expect(status(h.target, 'hypothermia')?.value).toBe(7); expect(status(h.target, 'hypothermia')?.until).toBe(7);
    expect(status(h.target, 'slow')?.until).toBe(1.5); expect(h.caster.mana).toBe(0);
    h.ctx.battle.time = 2; h.target.dead = true; const hp = h.other.hp; p.onUnitDeath!(h.ctx);
    expect(hp - h.other.hp).toBe(420); expect(status(h.other, 'slow')?.value).toBe(.4);
  });
  it('keeps the Spirit Bear alive and fighting independently after its owner dies', () => {
    const h = setup('custom_lone_druid_spirit_bear', 3, 1); advance(h.battle, 1);
    const bear = h.battle.units.find(u => u.extraSpiritBear)!; expect(bear).toBeDefined();
    bear.x = h.enemies[0].x; bear.y = h.enemies[0].y - 1; bear.moveSpeed = 0;
    applyDamage(h.battle, h.enemies[0], h.caster, 100000, 'pure'); const health = h.enemies[0].hp;
    expect(h.battle.finished).toBe(false);
    advance(h.battle, 2); expect(bear.dead).toBe(false); expect(h.enemies[0].hp).toBeLessThan(health);
  });
  it('keeps Static Field cooldowns independent per source ability and suppresses damage-over-time retriggers', () => {
    const h = harness('custom_zuus_static_field', 3), p = EXTRA_PROGRAMS[h.ctx.skill.id], hp = h.target.hp;
    p.onDealDamage!({ ...h.ctx, triggerSkillId: 'abilityA' }); expect(h.target.hp).toBeCloseTo(hp * .9);
    h.ctx.battle.time = 1; p.onDealDamage!({ ...h.ctx, triggerSkillId: 'abilityA' }); expect(h.target.hp).toBeCloseTo(hp * .9);
    p.onDealDamage!({ ...h.ctx, triggerSkillId: 'abilityB' }); expect(h.target.hp).toBeCloseTo(hp * .81);
    h.ctx.battle.time = 3; p.onDealDamage!({ ...h.ctx, triggerSkillId: 'abilityA' }); expect(h.target.hp).toBeCloseTo(hp * .729);
  });
  it('shares Grave Chill with every owned summon body rather than only Visage familiars', () => {
    const h = harness('custom_visage_grave_chill', 3), p = EXTRA_PROGRAMS[h.ctx.skill.id];
    h.ally.summoned = true; h.ally.owner = h.caster.id; h.ally.name = 'Spirit Bear';
    const skeleton = structuredClone(h.ally); skeleton.id = 'skeleton'; skeleton.name = 'Skeleton'; h.ctx.battle.units.push(skeleton);
    p.cast!(h.ctx); expect(status(h.ally, 'attackSpeed')?.value).toBe(100); expect(status(skeleton, 'attackSpeed')?.value).toBe(100);
    expect(status(h.caster, 'haste')?.value).toBe(.6);
  });
});
