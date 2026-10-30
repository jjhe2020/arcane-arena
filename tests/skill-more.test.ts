import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyDamage, BATTLE_BOUNDS, createBattle, stepBattle } from '../src/combat';
import type { BattleState, Player, SkillDefinition } from '../src/model';
import { MORE_PROGRAMS } from '../src/skill-effects-more';
import { MORE_CHILD_DEFINITIONS } from '../src/skill-effects-more-children';
import {BATTLE_CONFIG,skillBalance} from '../src/config';

const defs = JSON.parse(readFileSync(new URL('../public/data/skills.json', import.meta.url), 'utf8')) as SkillDefinition[];
function player(id: number, skill?: string, points = 3, count = 1): Player {
  return { id, name: `P${id}`, hp: 100, gold: 0, shopLevel: 3, locked: false, reserve: [], shop: [],
    heroes: Array.from({ length: count }, (_, i) => ({ id: `hero${i}`, name: `hero${i}`, role: 'mage', skin: 'female', x: i * 1.5, y: -2, skills: skill && !i ? [{ id: skill, points }] : [] })) };
}
function battle(skill: string, points = 3, targets = 1,definitions=defs): BattleState {
  const state = createBattle(player(0, skill, points), player(1, undefined, 3, targets), 137, definitions);
  for (const u of state.units) {
    u.maxHp = 100000; u.hp = 100000; u.mana = 100000; u.maxMana = 100000;
    u.moveSpeed = 0;
    if (u.side === 1) u.statuses.push({ kind: 'disarm', until: 200 });
  }
  return state;
}
function advance(state: BattleState, seconds: number) { stepBattle(state, seconds, defs); }

describe('catalog-driven additional skills', () => {
  it('registers distinct programs with honest source-verification gaps', () => {
    expect(Object.keys(MORE_PROGRAMS)).toHaveLength(61);
    for (const [id, program] of Object.entries(MORE_PROGRAMS)) {
      expect(defs.some(d => d.id === id)).toBe(true);
      expect(program.cast).toBeTypeOf('function');
      expect(program.implemented.length).toBeGreaterThan(0);
      expect(program.remaining.length).toBeGreaterThan(0);
    }
  });

  it('Resonant Pulse absorbs physical damage without consuming shield for magical damage', () => {
    const state = battle('void_spirit_resonant_pulse'); advance(state, .5);
    const [caster, enemy] = state.units, shield = caster.statuses.find(s => s.kind === 'physicalShield') as { remaining: number } | undefined;
    expect(shield).toBeDefined();
    const before = shield!.remaining;
    expect(applyDamage(state, enemy, caster, 100, 'physical')).toBe(0);
    expect(shield!.remaining).toBeLessThan(before);
    const physicalRemaining = shield!.remaining;
    expect(applyDamage(state, enemy, caster, 100, 'magical')).toBeCloseTo(75);
    expect(shield!.remaining).toBe(physicalRemaining);
  });

  it('Nethertoxin Super ramps to greater damage and Gaben silences only affected enemies', () => {
    const values = [3, 6, 9].map(points => {
      const state = battle('viper_nethertoxin', points); advance(state, 4);
      return { damage: state.events.filter(e => e.type === 'hit' && e.skill === 'viper_nethertoxin').reduce((sum, e) => sum + (e.amount ?? 0), 0), enemy: state.units[1] };
    });
    expect(values[1].damage).toBeGreaterThan(values[0].damage * 1.5);
    expect(values[0].enemy.statuses.some(s => s.kind === 'silence')).toBe(false);
    expect(values[2].enemy.statuses.some(s => s.kind === 'silence')).toBe(true);
    expect(values[2].enemy.statuses.some(s => s.kind === 'break')).toBe(true);
  });

  it('Sacred Arrow stops at its first collision instead of damaging every aligned hero', () => {
    const state = battle('custom_mirana_arrow', 3, 2);
    state.units[2].x = 0; state.units[2].y = 6;
    advance(state, 4);
    const impacts = state.events.filter(e => e.type === 'hit' && e.skill === 'custom_mirana_arrow');
    expect(impacts).toHaveLength(1);
    expect(impacts[0].target).toBe(state.units[1].id);
    const disable = state.events.find(e => e.type === 'status' && e.skill === 'custom_mirana_arrow' && e.status === 'stun');
    expect(disable?.duration).toBeGreaterThan(.01); expect(disable?.duration).toBeLessThan(5.5);
  });

  it('channel interruption stops Death Ward attacks and leaves its phased shell for five seconds', () => {
    const state = battle('custom_witch_doctor_death_ward'); advance(state, 1);
    const ward = state.units.find(u => u.summoned)!; expect(ward).toBeDefined(); expect(ward.dead).toBe(false);
    state.units[0].statuses.push({ kind: 'stun', until: 10 }); advance(state, .5);
    expect(ward.dead).toBe(false);expect(ward.statuses.some(s=>s.kind==='disarm')).toBe(true);expect(ward.statuses.some(s=>s.kind==='phased')).toBe(true);
    const hits = state.events.filter(e => e.type === 'hit' && e.source === ward.id).length;
    advance(state, 2); expect(state.events.filter(e => e.type === 'hit' && e.source === ward.id)).toHaveLength(hits);expect(ward.dead).toBe(false);
    advance(state, 3);expect(ward.dead).toBe(true);
  });

  it('Phantasm uses documented 100% output and 325% incoming damage despite swapped numeric labels', () => {
    for (const [points, count] of [[3, 3], [6, 4]]) {
      const state = battle('custom_chaos_knight_phantasm', points); advance(state, 1);
      const clones = state.units.filter(u => u.summoned);
      expect(clones).toHaveLength(count);
      expect(clones.every(u => u.attack === state.units[0].attack && u.damageTakenMultiplier === 3.25)).toBe(true);
    }
  });

  it('Wild Axes amplifies only its caster and owned summons before defense reduction', () => {
    const a = player(0, 'beastmaster_wild_axes', 3, 2), b = player(1);
    const state = createBattle(a, b, 3, defs), [caster, ally, enemy] = state.units;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; }
    enemy.statuses.push({ kind: 'disarm', until: 100 }); advance(state, 1.6);
    const amplification = enemy.statuses.filter(s => s.kind === 'sourceDamageAmp').reduce((sum, s) => sum + (s.value ?? 0), 0);
    expect(amplification).toBeCloseTo(.24);
    expect(applyDamage(state, caster, enemy, 100, 'pure')).toBeCloseTo(124);
    expect(applyDamage(state, ally, enemy, 100, 'pure')).toBeCloseTo(100);
    const summon = { ...ally, id: 'test-owned-summon', owner: caster.id, summoned: true, skills: [], statuses: [] }; state.units.push(summon);
    expect(applyDamage(state, summon, enemy, 100, 'pure')).toBeCloseTo(124);
  });

  it('Swashbuckle Gaben doubles fixed-damage strikes without substituting the hero attack stat', () => {
    for (const [points, count] of [[3, 3], [9, 6]]) {
      const state = battle('pangolier_swashbuckle', points); state.units[1].armor = 0; state.units[0].attack = 1000;
      advance(state, 1);
      expect(state.events.filter(e => e.type === 'hit' && e.source === state.units[0].id && e.amount === 85)).toHaveLength(count);
    }
  });

  it('Gaben Pulse spends two charges then waits for sequential recovery instead of free recasts', () => {
    const state = battle('void_spirit_resonant_pulse', 9);
    state.units[0].statuses.push({ kind: 'disarm', until: 200 });
    const casts = () => state.events.filter(e => e.type === 'cast' && e.skill === 'void_spirit_resonant_pulse');
    // A zero-point pulse may release the next charge before its traveling wave silences this target.
    advance(state, 2); expect(casts()).toHaveLength(2);
    advance(state, 2); expect(casts()).toHaveLength(2);
    const balance=skillBalance(defs.find(d=>d.id==='void_spirit_resonant_pulse')!,9)!;
    expect(casts()[1].time - casts()[0].time).toBeGreaterThanOrEqual(balance.cooldown! - 1e-8);
    const before = JSON.stringify(state); advance(state, 0); expect(JSON.stringify(state)).toBe(before);
    const recovery = balance.params['CHARGE RESTORE TIME'];
    advance(state, recovery - 4); expect(casts()).toHaveLength(2);
    advance(state, 1); expect(casts()).toHaveLength(3);
    expect(casts()[2].time - casts()[0].time).toBeGreaterThanOrEqual(recovery - 1e-8);
    expect(casts()[2].time - casts()[0].time).toBeLessThan(recovery + .45);
  });

  it('Gaben Death Ward pierces evasion and bounces to distinct nearby heroes', () => {
    for (const points of [3, 9]) {
      const state = battle('custom_witch_doctor_death_ward', points, 3);
      for (const target of state.units.filter(u => u.side === 1)) target.statuses.push({ kind: 'evasion', until: 200, value: 1 });
      advance(state, 1.5);
      const ward = state.units.find(u => u.summoned)!;
      const hits = state.events.filter(e => e.type === 'hit' && e.source === ward.id && (e.amount ?? 0) > 0);
      if (points === 3){expect(hits.length).toBeGreaterThan(0);expect(state.events.some(e=>e.type==='hit'&&e.source===ward.id&&e.outcome==='miss')).toBe(true);}
      else expect(new Set(hits.map(e => e.target)).size).toBe(3);
    }
  });

  it('Arcane Bolt Gaben adds derived intelligence exactly once per damaging ability event', () => {
    const state = battle('custom_skywrath_mage_arcane_bolt', 9), [caster, enemy] = state.units;
    const intelligence = Number(caster.intelligence), attack = caster.attack;
    applyDamage(state, caster, enemy, 100, 'pure', 'another_spell');
    advance(state, 1 / 30);
    expect(caster.intelligence).toBe(intelligence + 2);
    expect(caster.attack).toBe(attack + 2);
    expect(caster.statuses.filter(s => s.kind === 'intelligence')).toHaveLength(1);
  });

  it('Wave of Terror steals base stats at Super and adds fear only at Gaben', () => {
    for (const points of [6, 9]) {
      const state = battle('vengefulspirit_wave_of_terror', points), [caster, enemy] = state.units;
      const armor = enemy.armor, attack = enemy.attack; advance(state, .6);
      expect(caster.statuses.find(s => s.skill === 'vengefulspirit_wave_of_terror' && s.kind === 'attackBonus')?.value).toBeCloseTo(attack * .2);
      expect(enemy.statuses.filter(s=>s.skill==='vengefulspirit_wave_of_terror'&&s.kind==='armor').reduce((sum,s)=>sum+Number(s.value??0),0)).toBeCloseTo(-8-armor*.2);
      expect(enemy.statuses.some(s => s.kind === 'fear')).toBe(points === 9);
    }
  });

  it('Waveform traverses intermediate positions, hits each crossed unit once and permits another spell order in transit', () => {
    const state = battle('morphling_waveform');
    state.units[0].skills.push({ id: 'custom_vengefulspirit_magic_missile', points: 3 });
    advance(state, .5);
    const caster = state.units[0];
    expect(caster.y).toBeGreaterThan(-2); expect(caster.y).toBeLessThan(2.5);
    expect(caster.statuses.some(s => s.kind === 'visualForm' && (s as { data?: { form?: string } }).data?.form === 'waveform')).toBe(true);
    expect(caster.statuses.some(s => s.kind === 'silence')).toBe(false);
    expect(caster.statuses.some(s => s.kind === 'motionRoot')).toBe(true);
    expect(state.events.some(e=>e.type==='status'&&e.status==='castWindup'&&e.skill==='custom_vengefulspirit_magic_missile')).toBe(true);
    expect(caster.statuses.some(s => s.kind === 'invulnerable')).toBe(true);
    expect(state.events.filter(e => e.type === 'cast' && e.source === caster.id)).toHaveLength(1);
    advance(state, .3);
    expect(caster.statuses.some(s => s.kind === 'visualForm')).toBe(false);
    expect(caster.statuses.some(s => s.kind === 'invulnerable')).toBe(false);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'morphling_waveform')).toHaveLength(1);
    expect(state.events.filter(e => e.type === 'move' && e.skill === 'morphling_waveform').length).toBeGreaterThan(3);
  });

  it('Snowball carries passengers at the catalog speed and releases shared protection after contact', () => {
    const state = createBattle(player(0, 'custom_tusk_snowball', 3, 2), player(1), 6, defs);
    for (const unit of state.units) { unit.maxHp = unit.hp = 100000; unit.moveSpeed = 0; }
    const [caster, passenger] = state.units;
    for(let i=0;i<60&&!state.events.some(e=>e.type==='cast'&&e.skill==='custom_tusk_snowball');i++)advance(state,1/30);
    expect(state.events.some(e=>e.type==='cast'&&e.skill==='custom_tusk_snowball')).toBe(true);
    advance(state, .1);
    expect(caster.y).toBeGreaterThan(-2); expect(caster.y).toBeLessThan(2);
    expect(passenger.x).toBeCloseTo(caster.x); expect(passenger.y).toBeCloseTo(caster.y);
    expect(passenger.statuses.some(s => s.kind === 'visualForm' && (s as { data?: { passenger?: boolean } }).data?.passenger)).toBe(true);
    expect(passenger.statuses.some(s => s.kind === 'phased')).toBe(true);
    expect(passenger.statuses.some(s => s.kind === 'silence')).toBe(true);
    const castsDuringTravel = state.events.filter(e => e.type === 'cast' && e.source === passenger.id);
    expect(castsDuringTravel).toHaveLength(0);
    advance(state, 1);
    expect(caster.statuses.some(s => s.kind === 'visualForm')).toBe(false);
    expect(passenger.statuses.some(s => s.kind === 'invulnerable')).toBe(false);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'custom_tusk_snowball')).toHaveLength(1);
  });

  it('Super Freezing Field permits a second spell while its field remains active', () => {
    for (const points of [3, 6]) {
      const state = battle('custom_crystal_maiden_freezing_field', points);
      state.units[0].skills.push({ id: 'custom_vengefulspirit_magic_missile', points: 3 });
      advance(state, 1.5);
      const extraCast = state.events.some(e => e.type === 'cast' && e.skill === 'custom_vengefulspirit_magic_missile');
      expect(extraCast).toBe(points === 6);
      expect(state.events.some(e => e.type === 'hit' && e.skill === 'custom_crystal_maiden_freezing_field')).toBe(true);
    }
  });

  it('Super Life Drain adds another distinct enemy every channelled second', () => {
    for (const points of [3, 6]) {
      const state = battle('custom_pugna_life_drain', points, 3); advance(state, 2.6);
      const victims = new Set(state.events.filter(e => e.type === 'hit' && e.skill === 'custom_pugna_life_drain').map(e => e.target));
      expect(victims.size).toBe(points === 3 ? 1 : 3);
    }
  });

  it('historical granted children remain outside the purchasable catalog', () => {
    expect(MORE_CHILD_DEFINITIONS.length).toBeGreaterThanOrEqual(10);
    for (const child of MORE_CHILD_DEFINITIONS) {
      expect(child.grantedOnly).toBe(true);
      expect(defs.some(d => d.id === child.id)).toBe(false);
    }
  });

  it('Spirit Siphon spends its only level-one charge and cannot freely recast after the link ends', () => {
    const state = battle('death_prophet_spirit_siphon', 1), caster = state.units[0];
    caster.statuses.push({ kind: 'disarm', until: 200 }); advance(state, 8);
    const casts = () => state.events.filter(e => e.type === 'cast' && e.skill === 'death_prophet_spirit_siphon');
    expect(casts()).toHaveLength(1);
    expect(state.units.filter(u=>u.side===1).some(u=>u.statuses.some(s=>s.kind==='spiritSiphon'))).toBe(false);
    advance(state, 31); expect(casts()).toHaveLength(2);
    expect(casts()[1].time - casts()[0].time).toBeGreaterThanOrEqual(38 - 1e-8);
  });

  it('Spirit Siphon Gaben uses five distinct links, with faster charge recovery instead of link stacking', () => {
    const state = battle('death_prophet_spirit_siphon', 9, 5), caster = state.units[0];
    state.units.filter(u => u.side === 1).forEach((u, i) => { u.x = (i - 2) * .8; u.y = 1; });
    caster.statuses.push({ kind: 'disarm', until: 200 }); advance(state, 2);
    const links = state.units.filter(u => u.side === 1).map(u => u.statuses.filter(s => s.kind === 'spiritSiphon'));
    expect(links.every(a => a.length === 1)).toBe(true);
    const casts=()=>state.events.filter(e=>e.type==='cast'&&e.skill==='death_prophet_spirit_siphon');
    expect(casts()).toHaveLength(5);expect(new Set(casts().map(e=>e.target)).size).toBe(5);
    advance(state,15);expect(casts()).toHaveLength(5);
    advance(state,2);expect(casts()).toHaveLength(6);
    expect(casts()[5].time-casts()[0].time).toBeGreaterThanOrEqual(18-1e-8);
    expect(casts()[5].time-casts()[0].time).toBeLessThan(18.5);
  });

  it('Riki Gaben uses native fourth-level Smoke Screen with the AA two-second duration override', () => {
    const state = battle('custom_riki_tricks_of_the_trade', 9); state.units[1].y = 1;
    advance(state, .6);
    expect(state.units[1].statuses.find(s => s.skill === 'riki_smoke_screen' && s.kind === 'blind')?.value).toBe(.75);
    expect(state.units[1].statuses.some(s => s.skill === 'riki_smoke_screen' && s.kind === 'silence')).toBe(true);
    expect(state.events.some(e => e.type === 'cast' && e.skill === 'riki_smoke_screen' && e.points === 4)).toBe(true);
    advance(state, 2.5);
    expect(state.units[1].statuses.some(s => s.skill === 'riki_smoke_screen')).toBe(false);
  });

  it('Bloodthorn releases the accumulated damage once when its debuff is dispelled', () => {
    const state = battle('custom_monkey_king_boundless_strike', 9), [caster, target] = state.units;
    caster.statuses.push({ kind: 'disarm', until: 200 }); target.armor = 0; advance(state, 1);
    expect(target.statuses.some(s => s.kind === 'bloodthorn')).toBe(true);
    applyDamage(state, caster, target, 100, 'pure');
    target.statuses = target.statuses.filter(s => s.skill !== 'aa_granted_bloodthorn'); advance(state, .1);
    const hits = state.events.filter(e => e.type === 'hit' && e.skill === 'aa_granted_bloodthorn');
    expect(hits).toHaveLength(1); expect(hits[0].amount).toBeCloseTo(22.5);
    advance(state, 1); expect(state.events.filter(e => e.type === 'hit' && e.skill === 'aa_granted_bloodthorn')).toHaveLength(1);
  });

  it('Ice Blast Gaben Cold Feet freezes a stationary victim but breaks after leaving its original point', () => {
    const state = battle('custom_ancient_apparition_ice_blast', 9, 2), targets = state.units.filter(u => u.side === 1);
    advance(state, 1);
    expect(targets.every(u => u.statuses.some(s => s.kind === 'coldFeet'))).toBe(true);
    targets[1].x = 12; targets[1].y = 10; advance(state, 4);
    expect(targets[0].statuses.some(s => s.kind === 'stun' && s.skill === 'ancient_apparition_cold_feet')).toBe(true);
    expect(targets[1].statuses.some(s => s.kind === 'stun' && s.skill === 'ancient_apparition_cold_feet')).toBe(false);
    const hits = state.events.filter(e => e.type === 'hit' && e.skill === 'ancient_apparition_cold_feet' && e.target === targets[0].id);
    expect(hits).toHaveLength(4);
  });

  it('Marksmanship procs pierce evasion and base armor while preserving bonus armor, and disable near enemy heroes', () => {
    const state = battle('custom_drow_ranger_multishot', 9), [caster, target] = state.units;
    caster.mana = 0; caster.range = 8; target.y = 4; target.armor = 100;
    target.statuses.push({ kind: 'armor', value: 10, until: 200 }, { kind: 'evasion', value: 1, until: 200 });
    advance(state, 12);
    const hits = state.events.filter(e => e.type === 'hit' && e.source === caster.id && (e.amount ?? 0) > 0);
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.every(e => Math.abs(Number(e.amount) - (65 + 80) * .625) < 1e-6)).toBe(true);
    target.y = 0; advance(state, 2);
    expect(caster.statuses.some(s => s.kind === 'marksmanship')).toBe(false);
    const procs = state.events.filter(e => e.status === 'marksmanshipProc').length;
    advance(state, 3); expect(state.events.filter(e => e.status === 'marksmanshipProc')).toHaveLength(procs);
  });

  it('Gaben Phantasm uses the copied ally appearance and independent attribute snapshot', () => {
    const a = player(0, 'custom_chaos_knight_phantasm', 9, 2); a.heroes[1].role = 'tank'; a.heroes[1].skin = 'male';
    const state = createBattle(a, player(1), 9, defs), ally = state.units[1]; advance(state, 1.1);
    const clone = state.units.find(u => u.summoned && u.role === 'tank');
    expect(clone).toBeDefined(); expect(clone!.skin).toBe('male'); expect(clone!.strength).toBe(ally.strength);
    expect(clone!.attributes).not.toBe(ally.attributes); expect(clone!.owner).toBe(state.units[0].id);
  });

  it('Chakram Gaben creates radial blade groups that return when mana ends instead of leaving a permanent disarm', () => {
    const state = battle('custom_shredder_chakram', 9), caster = state.units[0]; advance(state, .8);
    expect(caster.mainChakramBlades).toBe(10); expect(caster.secondChakramBlades).toBe(10);
    expect(caster.statuses.some(s => s.kind === 'disarm' && s.skill === 'custom_shredder_chakram')).toBe(true);
    caster.mana = 0; advance(state, 3.2);
    expect(caster.mainChakramBlades).toBe(0); expect(caster.secondChakramBlades).toBe(0);
    expect(caster.statuses.some(s => s.kind === 'disarm' && s.skill === 'custom_shredder_chakram')).toBe(false);
  });

  it('Fissure Gaben builds a perpendicular physical ridge and triggers Aftershock for a cast on its own fissure', () => {
    const state = battle('custom_earthshaker_fissure', 9); state.units[1].y = .5; advance(state, 1);
    const walls = (state.barriers ?? []) as { skill: string; from: { x: number; y: number }; to: { x: number; y: number }; visual?:{group:string} }[];
    const cells=walls.filter(w => w.skill === 'custom_earthshaker_fissure');
    expect(new Set(cells.map(w=>w.visual?.group)).size).toBe(2);
    expect(cells).toHaveLength(60);expect(cells.every(w=>w.from.x===w.to.x&&w.from.y===w.to.y)).toBe(true);
    expect(state.events.some(e=>e.type==='hit'&&e.skill==='custom_earthshaker_fissure'&&Math.abs(Number(e.amount)-150*.75)<1e-6)).toBe(false);
    const caster=state.units[0];caster.x=walls[0].from.x;caster.y=walls[0].from.y;caster.nextAttack=100;
    caster.skills.push({id:'custom_vengefulspirit_magic_missile',points:3});caster.cooldowns.push(0);advance(state,1);
    const hits = state.events.filter(e => e.type === 'hit' && e.skill === 'custom_earthshaker_fissure');
    expect(hits.some(e => Math.abs(Number(e.amount) - 150 * .75) < 1e-6)).toBe(true);
  });

  it('Ice Shards Super extends both sides of one visual barrier group and Gaben burns distant enemies', () => {
    for (const [points, count] of [[3, 7], [6, 11], [9, 11]]) {
      const state = battle('custom_tusk_ice_shards', points, 2); state.units[2].x = 11; state.units[2].y = 11; advance(state, 2);
      const walls = (state.barriers ?? []) as { skill: string; visual?: { group: string } }[];
      const shards = walls.filter(w => w.skill === 'custom_tusk_ice_shards');
      expect(shards).toHaveLength(count); expect(new Set(shards.map(w => w.visual?.group)).size).toBe(1);
      const farHits = state.events.filter(e => e.type === 'hit' && e.skill === 'custom_tusk_ice_shards' && e.target === state.units[2].id);
      expect(farHits.length > 0).toBe(points === 9);
    }
  });

  it('Sun Ray Gaben egg ignores spell damage, dies to ten hero attacks, and explodes only if it survives', () => {
    for (const destroy of [false, true]) {
      const state = battle('custom_phoenix_sun_ray', 9), enemy = state.units[1]; advance(state, .4);
      const egg = state.units.find(u => u.summoned)!; expect(egg).toBeDefined();
      expect(applyDamage(state, enemy, egg, 10000, 'magical', 'test_spell')).toBe(0);
      if (destroy) { for (let i = 0; i < 9; i++) applyDamage(state, enemy, egg, 10000, 'physical'); expect(egg.dead).toBe(false); applyDamage(state, enemy, egg, 10000, 'physical'); expect(egg.dead).toBe(true); }
      advance(state, 6);
      expect(state.events.some(e => e.type === 'status' && e.skill === 'aa_granted_sun_ray_supernova' && e.status === 'stun')).toBe(!destroy);
      expect(state.units[0].dead).toBe(false);
    }
  });

  it('Gobble Up has an independent cooldown and carries then releases a real allied hero at the landing point', () => {
    const a = player(0, 'custom_snapfire_mortimer_kisses', 6, 2); a.heroes[1].x = 1;
    const state = createBattle(a, player(1), 5, defs), [caster, ally, enemy] = state.units;
    enemy.y = 8; caster.cooldowns[0] = 120;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    advance(state, .4); expect(ally.statuses.some(s => s.kind === 'banished')).toBe(true);
    advance(state, 1.2); expect(ally.statuses.some(s => s.kind === 'banished')).toBe(false); expect(ally.y).toBeGreaterThan(7);
    expect(state.events.filter(e => e.type === 'cast' && e.skill === 'aa_granted_gobble_up')).toHaveLength(1);
    expect(state.events.some(e => e.type === 'cast' && e.skill === 'aa_granted_spit_out')).toBe(true);expect(state.events.some(e => e.type === 'hit' && e.skill === 'aa_granted_spit_out')).toBe(true);
  });

  it('Astral Step Super applies the documented working interpretation of a 200% total critical', () => {
    const amounts = [3, 6].map(points => { const state = battle('void_spirit_astral_step', points); state.units[0].statuses.push({ kind: 'disarm', until: 200 }); state.units[1].armor = 0; advance(state, .5); return state.events.find(e => e.type === 'hit' && e.damageType === 'physical')!.amount; });
    expect(amounts[1]).toBe(Number(amounts[0]) * 2);
  });

  it('Dissimilate uses actual selectable portals and Super adds the explicit partial outer-ring geometry', () => {
    for (const points of [3, 6]) {
      const state = battle('custom_void_spirit_dissimilate', points); advance(state, .5);
      const visual = state.units[0].statuses.find(s => s.kind === 'visualForm') as { data: { portals: string } } | undefined;
      expect(visual).toBeDefined(); const portals = JSON.parse(visual!.data.portals) as { x: number; y: number }[];
      expect(portals.length).toBe(points === 3 ? 7 : 13);
      expect(state.units[0].statuses.some(s => s.kind === 'banished'&&(s as {data?:{keepUnitCollision?:boolean}}).data?.keepUnitCollision)).toBe(true);
      advance(state, 1.4);
      expect(portals.some(p => Math.hypot(p.x - state.units[0].x, p.y - state.units[0].y) < .01)).toBe(true);
      expect(state.units[0].statuses.some(s => s.kind === 'visualForm')).toBe(false);
    }
  });

  it('Cookie Super grants its holder 200 max health once and Gaben repeats three further hops', () => {
    const a = player(0, 'custom_snapfire_firesnap_cookie', 9, 2), state = createBattle(a, player(1), 4, defs), [caster, ally] = state.units;
    expect(caster.maxHp).toBe(1200); expect(ally.maxHp).toBe(1000);
    ally.hp = 100; for (const u of state.units) { u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    caster.x=ally.x=0;caster.y=-10;ally.y=-11.5;ally.facing=Math.PI/2;
    const enemy=state.units.find(unit=>unit.side!==caster.side)!;enemy.x=0;enemy.y=-8;enemy.hp=enemy.maxHp=100000;
    advance(state, 6.5);
    const hops=state.events.filter(e=>e.type==='move'&&e.skill==='custom_snapfire_firesnap_cookie'&&e.source===ally.id);
    expect(hops.length).toBeGreaterThan(4);expect(hops.every(e=>e.teleport===false)).toBe(true);
    expect(hops.filter((e,i)=>i===0||e.time-hops[i-1].time>.1)).toHaveLength(4);
    expect(caster.maxHp).toBe(1200);
  });

  it('Chakram Super gives an ally a separate moving Flamethrower with damage beyond the caster body', () => {
    const a = player(0, 'custom_shredder_chakram', 6, 2); a.heroes[0].y = -6; a.heroes[1].x = 0; a.heroes[1].y = 0;
    const state = createBattle(a, player(1), 3, defs), [caster, ally] = state.units;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.mana = u.maxMana = 10000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    caster.cooldowns[0] = 120; advance(state, 1.2);
    expect(ally.statuses.some(s => s.kind === 'flamethrower')).toBe(true);
    expect(state.events.some(e => e.type === 'hit' && e.skill === 'aa_granted_throwable_flamethrower')).toBe(true);
    expect(caster.statuses.some(s => s.kind === 'flamethrower')).toBe(false);
  });

  it('Ghostship Rum is applied by the ship sweep and Super delays an extra ten percent of incoming damage', () => {
    for (const [points, immediate] of [[3, 70], [6, 60]]) {
      const state = battle('kunkka_ghostship', points), [caster, enemy] = state.units;
      caster.statuses.push({ kind: 'disarm', until: 200 }); advance(state, .5);
      expect(caster.statuses.some(s => s.kind === 'ghostshipRum')).toBe(false);
      advance(state, 3);
      expect(caster.statuses.find(s => s.kind === 'ghostshipRum')?.value).toBeCloseTo(1 - immediate / 100);
      expect(applyDamage(state, enemy, caster, 100, 'pure')).toBeCloseTo(immediate);
      if (points === 6) expect(state.events.some(e => e.type === 'cast' && e.skill === 'aa_granted_tidal_wave')).toBe(true);
    }
  });

  it('Sun Ray presentation follows its current facing and ends promptly on a disable without a channel', () => {
    const state = battle('custom_phoenix_sun_ray', 6), caster = state.units[0]; advance(state, .4);
    const beam = caster.statuses.find(s => s.kind === 'visualBeam') as { data: { aimX: number; aimY: number; length: number } } | undefined;
    expect(beam?.data.length).toBe(11.5); expect(beam?.data.aimY).toBeGreaterThan(.99);
    caster.facing = Math.PI; advance(state, .1); const current=caster.statuses.find(s=>s.kind==='visualBeam') as typeof beam; expect(current?.data.aimX).toBeCloseTo(Math.cos(caster.facing)); expect(current?.data.aimY).toBeCloseTo(Math.sin(caster.facing));
    caster.statuses.push({ kind: 'stun', until: 10 }); advance(state, .3);
    expect(caster.statuses.some(s => s.kind === 'visualBeam')).toBe(false);
  });

  it('Life Drain transfers caster HP to a low ally only when the caster starts above ninety percent HP', () => {
    for (const full of [true, false]) {
      const state = createBattle(player(0, 'custom_pugna_life_drain', 3, 2), player(1), 13, defs), [caster, ally] = state.units;
      caster.hp = full ? 1000 : 850; ally.hp = 100;
      for (const u of state.units) { u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
      advance(state, 1);
      if (full) { expect(ally.hp).toBeGreaterThan(100); expect(caster.hp).toBeLessThan(1000); expect(1000 - caster.hp).toBeCloseTo(ally.hp - 100); expect(ally.statuses.some(s => s.kind === 'visualLink')).toBe(true); }
      else expect(ally.hp).toBe(100);
    }
  });

  it('Life Drain keeps a surviving secondary link after the primary leaves and ends when the final link leaves', () => {
    const state = battle('custom_pugna_life_drain', 6, 2), [caster, primary] = state.units;
    advance(state, 1.4); expect(caster.action).toBe('channel'); expect(primary.statuses.some(s => s.kind === 'visualLink')).toBe(true);
    primary.x = 14; primary.y = 12; advance(state, .2);
    expect(caster.action).toBe('channel');expect(primary.statuses.some(s=>s.kind==='visualLink')).toBe(false);
    expect(state.units.some(u=>u!==primary&&u.statuses.some(s=>s.kind==='visualLink'&&s.skill==='custom_pugna_life_drain'))).toBe(true);
    for(const u of state.units.filter(u=>u.side!==caster.side)){u.x=14;u.y=12;}advance(state,.2);
    expect(caster.castUntil).toBeLessThanOrEqual(state.time);
    expect(state.events.some(e => e.status === 'channelEnded')).toBe(true);
    expect(state.units.some(u => u.statuses.some(s => s.kind === 'visualLink' && s.skill === 'custom_pugna_life_drain'))).toBe(false);
    const hits = state.events.filter(e => e.type === 'hit' && e.skill === 'custom_pugna_life_drain').length;
    advance(state, .5); expect(state.events.filter(e => e.type === 'hit' && e.skill === 'custom_pugna_life_drain')).toHaveLength(hits);
  });

  it('Mana Drain Gaben holds three fixed links and drops its channel immunity on primary range break', () => {
    const state = battle('custom_lion_mana_drain', 9, 3), [caster, primary] = state.units;
    advance(state, 1);
    expect(state.units.filter(u => u.statuses.some(s => s.kind === 'visualLink'))).toHaveLength(3);
    expect(caster.statuses.some(s => s.kind === 'magicImmune')).toBe(true);
    primary.x = 14; primary.y = 12; advance(state, .2);
    expect(caster.statuses.some(s => s.kind === 'magicImmune')).toBe(false);
    expect(caster.castUntil).toBeLessThanOrEqual(state.time);
    expect(state.units.some(u => u.statuses.some(s => s.kind === 'visualLink'))).toBe(false);
  });

  it('strong-dispelling the primary Life Drain link ends the actual channel rather than hiding only its effect', () => {
    const state = battle('custom_pugna_life_drain', 3), [caster, target] = state.units; advance(state, .7);
    target.statuses = target.statuses.filter(s => s.kind !== 'lifeDrainLink'); advance(state, .2);
    expect(caster.castUntil).toBeLessThanOrEqual(state.time);
    expect(target.statuses.some(s => s.kind === 'visualLink')).toBe(false);
  });

  it('Phantasm protects the caster for the real split interval before strong illusions materialize', () => {
    const state = battle('custom_chaos_knight_phantasm', 3), [caster, enemy] = state.units; advance(state, .55);
    expect(state.units.filter(u => u.summoned)).toHaveLength(0);
    expect(applyDamage(state, enemy, caster, 1000, 'pure')).toBe(0);
    advance(state, .5);
    expect(caster.statuses.some(s => s.kind === 'invulnerable')).toBe(false);
    expect(state.units.filter(u => u.summoned && u.strongIllusion)).toHaveLength(3);
  });

  it('Sacred Arrow executes ordinary summons but respects ancient, creep-hero, illusion and ward classifications', () => {
    for (const flag of [undefined, 'ancient', 'consideredHero', 'illusion', 'ward']) {
      const state = battle('custom_mirana_arrow', 3, 2), target = state.units[1]; target.summoned = true; if (flag) target[flag] = true;
      // Ordinary summons do not keep a side alive. Keep a real hero off the arrow path.
      state.units[2].x = 10; state.units[2].y = 10;
      advance(state, 2);
      expect(target.dead).toBe(flag === undefined);
      expect(state.finished).toBe(false);
    }
  });

  it('Greater Bash charge damage uses effective movement modifiers despite the caster action-lock root', () => {
    const state = battle('custom_spirit_breaker_charge_of_darkness', 3), caster = state.units[0];
    caster.moveSpeed = 3;
    caster.statuses.push({ kind: 'moveFlat', value: 1, until: 200 }, { kind: 'haste', value: .5, until: 200 }, { kind: 'slow', value: .2, until: 200 }, { kind: 'disarm', until: 200 });
    advance(state, 1);
    const hit = state.events.find(e => e.type === 'hit' && e.skill === 'aa_granted_greater_bash');
    // Charge is a flat movement bonus, applied before percentage modifiers.
    expect(hit?.amount).toBeCloseTo((3 + 1 + 3.75) * 1.5 * .8 * 100 * .3 * .75);
  });

  it('Fissure explicitly lets allies through and Aftershock does not trigger from a merely nearby caster', () => {
    const state = battle('custom_earthshaker_fissure', 9), [caster] = state.units; state.units[1].y = .5; advance(state, .9);
    expect(((state.barriers ?? []) as { blocks: string }[]).every(w => w.blocks === 'enemies')).toBe(true);
    const hits = state.events.filter(e => e.type === 'hit' && e.skill === 'custom_earthshaker_fissure').length;
    caster.x = 2; caster.skills.push({ id: 'custom_vengefulspirit_magic_missile', points: 3 }); advance(state, .8);
    expect(state.events.some(e => e.type === 'cast' && e.skill === 'custom_vengefulspirit_magic_missile')).toBe(true);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'custom_earthshaker_fissure')).toHaveLength(hits);
  });

  it('Multishot invokes equipped attack modifiers on every real arrow hit', () => {
    const state = battle('custom_drow_ranger_multishot', 3), [caster, target] = state.units;
    caster.skills.push({ id: 'custom_drow_ranger_frost_arrows', points: 3 }); caster.statuses.push({ kind: 'disarm', until: 200 }); target.armor = 0;
    advance(state, 2.4);
    const hits = state.events.filter(e => e.type === 'hit' && e.source === caster.id && e.damageType === 'physical' && (e.amount ?? 0) > 0);
    expect(hits).toHaveLength(3); expect(hits.every((e,index) => Math.abs(Number(e.amount) - (65 * 1.6 + 30 + 5 * (index+1))) < 1e-6)).toBe(true);
    expect(target.statuses.some(s => s.kind === 'hypothermia')).toBe(true);
  });

  it('Multishot arrows already released survive a later channel interrupt while later salvos stop', () => {
    const state = battle('custom_drow_ranger_multishot', 3), [caster, target] = state.units;
    caster.statuses.push({ kind: 'disarm', until: 200 }); target.armor = 0;target.y=7;
    advance(state, .4);expect((state.projectiles as {skill:string}[]).some(p=>p.skill==='custom_drow_ranger_multishot')).toBe(true);
    expect(state.events.filter(e => e.type === 'hit' && e.source === caster.id)).toHaveLength(0);
    caster.statuses.push({ kind: 'stun', until: 200 }); advance(state, 2);
    expect(state.events.filter(e => e.type === 'hit' && e.source === caster.id && (e.amount ?? 0) > 0)).toHaveLength(1);
  });

  it('Life Break continuously leaps to the farthest eligible enemy and damages crossed units at Super', () => {
    const state = battle('custom_huskar_life_break', 6, 2), [caster, front, back] = state.units;
    front.x = 0; front.y = .3; back.x = 0; back.y = 3;
    advance(state, .5); expect(caster.y).toBeGreaterThan(-2); expect(caster.y).toBeLessThan(3); expect(caster.statuses.some(s => s.kind === 'magicImmune')).toBe(true);
    advance(state, .5);
    expect(caster.y).toBeGreaterThan(2); expect(caster.statuses.some(s => s.kind === 'magicImmune')).toBe(false);
    const allHits=state.events.filter(e=>e.type==='hit'&&e.skill==='custom_huskar_life_break'),hits=allHits.filter(e=>e.target!==caster.id);
    expect(allHits.filter(e=>e.target===caster.id)).toHaveLength(1);expect(allHits.find(e=>e.target===caster.id)?.damageType).toBe('magical');
    expect(new Set(hits.map(e => e.target)).size).toBe(2);
    expect(hits.find(e => e.target === back.id)!.amount).toBeGreaterThan(hits.find(e => e.target === front.id)!.amount!);
  });

  it('Snowball passes the front line on its way to the deepest eligible backline target', () => {
    const state = battle('custom_tusk_snowball', 3, 2), [caster, front, back] = state.units;
    front.x = 0; front.y = .5; back.x = 0; back.y = 7;
    advance(state, 1);
    expect(caster.y).toBeGreaterThan(1); expect(caster.y).toBeLessThan(7);
    expect(caster.statuses.some(s => s.kind === 'visualForm')).toBe(true);
    expect(state.events.some(e => e.type === 'hit' && e.skill === 'custom_tusk_snowball' && e.target === front.id)).toBe(true);
    advance(state, 1); expect(state.events.some(e => e.type === 'hit' && e.skill === 'custom_tusk_snowball' && e.target === back.id)).toBe(true);
  });

  it('Rebound selects the nearest ally and directs its landing toward the farthest enemy', () => {
    const a = player(0, 'marci_companion_run', 3, 2); a.heroes[1].x = 1;
    const state = createBattle(a, player(1, undefined, 3, 2), 9, defs), [caster, ally, front, back] = state.units;
    front.x = 1; front.y = .5; back.x = 1; back.y = 5;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    advance(state, 1.2);
    expect(caster.y).toBeGreaterThan(4); expect(ally.statuses.find(s => s.kind === 'haste' && s.skill === 'marci_companion_run')?.value).toBe(.4);
    expect(state.events.some(e => e.type === 'hit' && e.skill === 'marci_companion_run' && e.target === back.id)).toBe(true);
  });

  it('Phantasm inherits native critical attacks while excluding active orbs and recursive summons', () => {
    const definitions=structuredClone(defs),critical=definitions.find(d=>d.id==='custom_phantom_assassin_coup_de_grace')!;
    for(const row of Object.values(critical.balanceLevels!))row.params['CRITICAL CHANCE']=100;
    const state = battle('custom_chaos_knight_phantasm', 3,1,definitions), caster = state.units[0];
    caster.skills.push({ id: 'custom_phantom_assassin_coup_de_grace', points: 3 }, { id: 'custom_drow_ranger_frost_arrows', points: 3 }, { id: 'custom_vengefulspirit_magic_missile', points: 3 });
    // Use an authored guaranteed critical to isolate inheritance from PRD.
    caster.statuses.push({ kind: 'disarm', until: 200 }); stepBattle(state, 3, definitions);
    const clones = state.units.filter(u => u.illusion);
    expect(clones).toHaveLength(3);
    expect(clones.every(u => u.skills.some(s => s?.id === 'custom_phantom_assassin_coup_de_grace') && !u.skills.some(s => s?.id === 'custom_drow_ranger_frost_arrows'||s?.id === 'custom_vengefulspirit_magic_missile'))).toBe(true);
    expect(state.events.some(e=>e.type==='hit'&&e.flags?.critical&&clones.some(u=>u.id===e.source))).toBe(true);
    expect(state.units[1].statuses.some(s => s.kind === 'hypothermia' && clones.some(u => u.id === s.source))).toBe(false);
    expect(state.events.filter(e => e.type === 'cast' && clones.some(u => u.id === e.source))).toHaveLength(0);
    expect(clones.every(u => u.attack === caster.attack && u.intelligence === caster.intelligence)).toBe(true);
  });

  it('Life Drain directly destroys weak illusions through deferred-damage protection but spares strong illusions', () => {
    for (const strong of [false, true]) {
      const state = battle('custom_pugna_life_drain', 3), target = state.units[1];
      target.illusion = true; target.strongIllusion = strong;
      target.statuses.push({ kind: 'falsePromise', until: 20 }); advance(state, .6);
      expect(target.dead).toBe(!strong);
      expect(state.events.some(e => e.type === 'death' && e.target === target.id)).toBe(!strong);
    }
  });

  it('Sacred Arrow uses exact creep execution through damage prevention rather than an oversized damage packet', () => {
    const state = battle('custom_mirana_arrow', 3, 2), target = state.units[1];
    state.units[2].x = 10; state.units[2].y = 10;
    target.summoned = true; target.statuses.push({ kind: 'falsePromise', until: 20 }, { kind: 'shallowGrave', until: 20 }); advance(state, 1.5);
    expect(target.dead).toBe(true); expect(target.hp).toBe(0);
    expect(state.events.some(e => e.type === 'hit' && e.skill === 'custom_mirana_arrow' && e.executed === true)).toBe(true);
    expect(state.finished).toBe(false);
  });

  it('released Sacred Arrow and Ice Shards persist after their caster dies', () => {
    for (const id of ['custom_mirana_arrow', 'custom_tusk_ice_shards']) {
      const a = player(0, id, 3, 2); a.heroes[1].x = 8;
      const state = createBattle(a, player(1), 3, defs), [caster, , target] = state.units; target.y = 8;
      for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
      advance(state, .6); expect(state.events.some(e => e.type === 'cast' && e.skill === id)).toBe(true);
      expect(state.events.some(e => e.type === 'hit' && e.skill === id)).toBe(false);
      caster.hp = 0; caster.dead = true; advance(state, 1.2);
      expect(state.events.some(e => e.type === 'hit' && e.skill === id && e.target === target.id), `${id}: ${JSON.stringify(state.projectiles)} at ${state.time}`).toBe(true);
      if (id === 'custom_tusk_ice_shards') expect((state.barriers as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it('Ice Path still catches a late entrant after caster death and caps stun at the actual path expiry', () => {
    const a = player(0, 'jakiro_ice_path', 3, 2); a.heroes[1].x = 8;
    const state = createBattle(a, player(1), 3, defs), [caster, , target] = state.units; target.y = 4;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    advance(state, .7); target.x = 6; advance(state, .7); caster.hp = 0; caster.dead = true;
    advance(state, 3.5); target.x = 0; advance(state, .2);
    const stun = target.statuses.find(s => s.skill === 'jakiro_ice_path' && s.kind === 'stun');
    expect(stun).toBeDefined(); expect(stun!.until - state.time).toBeGreaterThan(0); expect(stun!.until - state.time).toBeLessThan(1);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'jakiro_ice_path')).toHaveLength(1);
  });

  it('Sharpshooter uses actual projectile travel and continuous recoil, with Super piercing a second hero', () => {
    for (const points of [3, 6]) {
      const state = battle('custom_hoodwink_sharpshooter', points, 2), [caster, first, second] = state.units;
      caster.statuses.push({ kind: 'disarm', until: 200 }); first.x = 0; first.y = 5; second.x = 0; second.y = 10;
      advance(state, 5.1);
      expect(state.events.filter(e => e.type === 'hit' && e.skill === 'custom_hoodwink_sharpshooter')).toHaveLength(0);
      expect(caster.y).toBeLessThan(-2); expect(caster.y).toBeGreaterThan(-5.5);
      advance(state, .34);
      expect(caster.y).toBeCloseTo(-5.5);
      advance(state, .26);
      expect(state.events.filter(e => e.type === 'hit' && e.skill === 'custom_hoodwink_sharpshooter')).toHaveLength(points === 6 ? 2 : 1);
    }
  });

  it('Multishot damage from an already released arrow survives the caster death', () => {
    const a = player(0, 'custom_drow_ranger_multishot', 3, 2); a.heroes[1].x = 8;
    const state = createBattle(a, player(1), 4, defs), [caster, , target] = state.units;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    target.y=7;advance(state, .7);expect((state.projectiles as {skill:string}[]).some(p=>p.skill==='custom_drow_ranger_multishot')).toBe(true);caster.hp = 0; caster.dead = true; advance(state, 1.5);
    expect(state.events.filter(e => e.type === 'hit' && e.source === caster.id && e.target === target.id && (e.amount ?? 0) > 0)).toHaveLength(1);
  });

  it('Spear of Mars damages on contact and carries a hero continuously to the arena wall before pinning', () => {
    const state = battle('custom_mars_spear_of_mars', 3), [caster, target] = state.units;
    caster.statuses.push({ kind: 'disarm', until: 200 }); target.x = 0; target.y = 2;
    advance(state, .7);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'custom_mars_spear_of_mars')).toHaveLength(1);
    expect(target.y).toBeGreaterThan(2); expect(target.y).toBeLessThan(10);
    expect(target.statuses.some(s => s.kind === 'selfStun' && s.skill === 'custom_mars_spear_of_mars')).toBe(true);
    advance(state, .9);
    expect(target.y).toBeCloseTo(BATTLE_BOUNDS.y-BATTLE_CONFIG.bodyRadius);
    expect(target.statuses.some(s => s.kind==='stun' && s.skill === 'custom_mars_spear_of_mars')).toBe(true);
    expect(target.statuses.some(s => s.kind==='selfStun' && s.skill === 'custom_mars_spear_of_mars')).toBe(false);
  });

  it('Gaben Spear pins both Super passengers at the wall before its projectile bounces away', () => {
    const state = battle('custom_mars_spear_of_mars', 9, 2), [caster, first, second] = state.units;
    caster.statuses.push({ kind: 'disarm', until: 200 }); first.x = second.x = 0; first.y = 2; second.y = 6;
    advance(state, 1.8);
    for (const target of [first, second]) {
      expect(target.y).toBeGreaterThan(11.5);
      expect(target.statuses.some(s => s.kind === 'stun' && s.skill === 'custom_mars_spear_of_mars')).toBe(true);
      expect(target.statuses.some(s => s.kind === 'selfStun' && s.skill === 'custom_mars_spear_of_mars')).toBe(false);
    }
    const projectiles = state.projectiles as { skill: string; y: number }[];
    expect(projectiles.some(p => p.skill === 'custom_mars_spear_of_mars' && p.y < 10)).toBe(true);
  });

  it('Ice Blast frostbites a late path entrant and keeps damaging after caster death', () => {
    const a = player(0, 'custom_ancient_apparition_ice_blast', 3, 2); a.heroes[1].x = 8;
    const state = createBattle(a, player(1, undefined, 3, 2), 5, defs), [caster, , destination, crossing] = state.units;
    destination.x = 0; destination.y = 6; crossing.x = 12; crossing.y = 1;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    advance(state, .6);expect(crossing.statuses.some(s=>s.kind==='iceBlastFrostbite')).toBe(false);crossing.x = 1; advance(state, .6);
    expect(crossing.statuses.some(s => s.kind === 'iceBlastFrostbite')).toBe(true);
    const before = crossing.taken;applyDamage(state,destination,caster,1e6,'pure','fixture');advance(state,1.2);
    expect(crossing.taken).toBeGreaterThan(before);
    expect(state.events.some(e => e.type === 'hit' && e.skill === 'custom_ancient_apparition_ice_blast' && e.target === destination.id && Number(e.amount) >= 150)).toBe(true);
  });

  it('Ice Blast shatters a frostbitten low-health hero through deferred damage and stops after strong removal', () => {
    for (const dispelled of [false, true]) {
      const state = battle('custom_ancient_apparition_ice_blast', 3, 2), target = state.units[1];
      state.units[0].statuses.push({ kind: 'disarm', until: 200 }); state.units[2].x = 8;
      advance(state, 1.2); expect(target.statuses.some(s => s.kind === 'iceBlastFrostbite')).toBe(true);
      if (dispelled) target.statuses = target.statuses.filter(s => s.skill !== 'custom_ancient_apparition_ice_blast');
      target.hp = 10000; target.statuses.push({ kind: 'falsePromise', until: 100 }); advance(state, 1.2);
      expect(target.dead).toBe(!dispelled);
      expect(state.events.some(e => e.type === 'hit' && e.executed === true && e.target === target.id)).toBe(!dispelled);
    }
  });

  it('Venomous Gale continues its independent piercing flight and poison after caster death', () => {
    const a = player(0, 'venomancer_venomous_gale', 3, 2); a.heroes[1].x = 8;
    const state = createBattle(a, player(1), 5, defs), [caster, , target] = state.units; target.y = 5;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    advance(state, .1); caster.hp = 0; caster.dead = true; advance(state, .8);
    expect(state.events.some(e=>e.type==='hit'&&e.target===target.id&&e.skill==='venomancer_venomous_gale'&&Number(e.amount)>0)).toBe(true);
    expect(target.statuses.some(s=>s.kind==='slow'&&s.skill==='venomancer_venomous_gale')).toBe(true);
    const before = target.taken; advance(state, 3); expect(target.taken).toBeGreaterThan(before);
  });

  it('Rebound approaches its ally continuously before making its separate landing leap', () => {
    const a = player(0, 'marci_companion_run', 3, 2); a.heroes[1].x = 5;
    const state = createBattle(a, player(1), 4, defs), [caster, , target] = state.units; target.x = 5; target.y = 5;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    const released=()=>state.events.some(e=>e.type==='cast'&&e.skill==='marci_companion_run');
    for(let i=0;i<60&&!released();i++)advance(state,1/30);
    expect(released()).toBe(true);const warp=caster.warpSequence;
    advance(state, .1); expect(caster.x).toBeGreaterThan(0); expect(caster.x).toBeLessThan(5); expect(caster.y).toBe(-2);
    advance(state, .6); expect(Math.abs(caster.x - 5)).toBeLessThan(.5);
    const values=skillBalance(defs.find(d=>d.id==='marci_companion_run')!,3)!;
    const landing=Math.min(7,values.range!)-values.params['LANDING OFFSET']/100;
    expect(caster.y).toBeCloseTo(-2+landing);expect(caster.warpSequence).toBe(warp);
    expect(caster.statuses.some(s => s.skill === 'marci_companion_run' && s.kind === 'silence')).toBe(false);
  });

  it('Gods Rebuke uses the historical 140-degree cone and a real 0.3-second knockback', () => {
    const state = battle('mars_gods_rebuke', 3, 3), [caster, primary, edge, outside] = state.units;
    caster.statuses.push({ kind: 'disarm', until: 200 }); primary.x = 0; primary.y = 0;
    edge.x = 3 * Math.sin(65 * Math.PI / 180); edge.y = -2 + 3 * Math.cos(65 * Math.PI / 180);
    outside.x = 4 * Math.sin(75 * Math.PI / 180); outside.y = -2 + 4 * Math.cos(75 * Math.PI / 180);
    advance(state, .3);
    expect(state.events.some(e => e.type === 'hit' && e.source === caster.id && e.target === edge.id)).toBe(true);
    expect(state.events.some(e => e.type === 'hit' && e.source === caster.id && e.target === outside.id)).toBe(false);
    expect(Math.hypot(edge.x, edge.y + 2)).toBeGreaterThan(3); expect(Math.hypot(edge.x, edge.y + 2)).toBeLessThan(4.5);
    advance(state, .3); expect(Math.hypot(edge.x, edge.y + 2)).toBeCloseTo(4.5);
  });

  it('Wild Axes already in flight complete their hits after the source dies', () => {
    const a = player(0, 'beastmaster_wild_axes', 3, 2); a.heroes[1].x = 8;
    const state = createBattle(a, player(1), 6, defs), [caster, , target] = state.units; target.y = 6;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    advance(state, .5); expect(state.events.some(e => e.type === 'cast' && e.skill === 'beastmaster_wild_axes')).toBe(true);
    caster.hp = 0; caster.dead = true; advance(state, 1.6);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'beastmaster_wild_axes' && e.target === target.id)).toHaveLength(2);
  });

  it('Stampede still tramples an enemy contacted by a surviving ally after caster death', () => {
    const a = player(0, 'centaur_stampede', 6, 2); a.heroes[1].x = 8;
    const state = createBattle(a, player(1), 6, defs), [caster, ally, target] = state.units; target.y = 4;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    advance(state, .5); expect(ally.statuses.some(s => s.kind === 'minimumMoveSpeed')).toBe(true);
    caster.hp = 0; caster.dead = true; ally.x = target.x; ally.y = target.y; advance(state, .1);
    expect(state.events.filter(e => e.type === 'hit' && e.skill === 'centaur_stampede' && e.target === target.id)).toHaveLength(1);
    expect(state.events.find(e=>e.type==='hit'&&e.skill==='centaur_stampede'&&e.target===target.id)?.source).toBe(ally.id);
    expect(target.statuses.some(s => s.kind === 'stun' && s.skill === 'centaur_stampede')).toBe(true);
  });

  it('Life Drain, Mana Drain and Mist Coil dispatch to their actual enemy and consume its spell block', () => {
    for (const id of ['custom_pugna_life_drain', 'custom_lion_mana_drain', 'custom_abaddon_death_coil']) {
      const state = battle(id, 3), [caster, target] = state.units; caster.statuses.push({ kind: 'disarm', until: 200 });
      target.statuses.push({ kind: 'spellBlock', until: 100 }); const mana = caster.mana;
      advance(state, 1);
      expect(state.events.some(e => e.type === 'status' && e.skill === id && e.status === 'spellBlocked'), id).toBe(true);
      expect(target.statuses.some(s => s.kind === 'spellBlock')).toBe(false);
      expect(caster.mana).toBeLessThan(mana);
      expect(state.events.some(e => e.type === 'hit' && e.skill === id&&e.target===target.id)).toBe(false);
      if(id==='custom_abaddon_death_coil')expect(state.events.filter(e=>e.type==='hit'&&e.skill===id&&e.target===caster.id).map(e=>[e.damageType,e.amount])).toEqual([['pure',65]]);
      expect(target.statuses.some(s => ['lifeDrainLink', 'manaDrainLink'].includes(s.kind))).toBe(false);
    }
  });

  it('Life Drain targets the bound enemy for actual Soulbind channel duplication', () => {
    const a = player(0, 'custom_grimstroke_soul_bind', 3); a.heroes[0].skills.push({ id: 'custom_pugna_life_drain', points: 3 });
    const state = createBattle(a, player(1, undefined, 3, 2), 6, defs), [, primary, partner] = state.units;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.mana = u.maxMana = 10000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    advance(state, 1.2);
    expect(state.events.some(e => e.type === 'cast' && e.skill === 'custom_pugna_life_drain' && e.duplicatedBy === 'custom_grimstroke_soul_bind')).toBe(true);
    expect(primary.taken).toBeGreaterThan(0); expect(partner.taken).toBeGreaterThan(0);
  });

  it('a real root blocks Waveform before mana payment until the root expires', () => {
    const state = battle('morphling_waveform', 3), caster = state.units[0];
    caster.statuses.push({ kind: 'root', until: .5 }, { kind: 'disarm', until: 200 }); const mana = caster.mana;
    advance(state, .3); expect(state.events.some(e => e.type === 'cast' && e.skill === 'morphling_waveform')).toBe(false); expect(caster.mana).toBe(mana);
    advance(state, 1); expect(state.events.some(e => e.type === 'cast' && e.skill === 'morphling_waveform')).toBe(true); expect(caster.mana).toBeLessThan(mana);
  });

  it('Gobble Up promptly releases a held ally if the caster dies before the automatic spit', () => {
    const state = createBattle(player(0, 'custom_snapfire_mortimer_kisses', 6, 2), player(1), 8, defs), [caster, ally] = state.units;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.mana = u.maxMana = 10000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    caster.cooldowns[0]=120;advance(state, .4);expect(ally.statuses.some(s => s.kind === 'banished' && s.skill === 'aa_granted_gobble_up')).toBe(true);
    caster.hp = 0; caster.dead = true; advance(state, .1);
    expect(ally.statuses.some(s => s.skill === 'aa_granted_gobble_up' && ['banished', 'visualForm'].includes(s.kind))).toBe(false);
    const position = { x: ally.x, y: ally.y }; advance(state, .8);
    expect(ally.x).toBeCloseTo(position.x); expect(ally.y).toBeCloseTo(position.y);
    expect(state.events.some(e => e.type === 'hit' && e.skill === 'aa_granted_gobble_up')).toBe(false);
  });

  it('Gobble Up can fall back to an ordinary nearby enemy creep and consumes it only after the spit lands', () => {
    const state = createBattle(player(0, 'custom_snapfire_mortimer_kisses', 9), player(1, undefined, 3, 2), 8, defs), [caster, creep, destination] = state.units;
    creep.summoned = true; creep.x = 1; creep.y = -2; destination.x = 0; destination.y = 6;
    for (const u of state.units) { u.hp = u.maxHp = 100000; u.mana = u.maxMana = 10000; u.moveSpeed = 0; u.statuses.push({ kind: 'disarm', until: 200 }); }
    caster.cooldowns[0]=120;advance(state, .4);expect(creep.statuses.some(s => s.kind === 'banished' && s.skill === 'aa_granted_gobble_up')).toBe(true); expect(creep.dead).toBe(false);
    advance(state, 1.2); expect(creep.dead).toBe(true);
    expect(state.events.some(e => e.type === 'hit' && e.skill === 'aa_granted_spit_out' && e.executed === true && e.target === creep.id)).toBe(true);
    expect(state.events.some(e => e.type === 'hit' && e.skill === 'aa_granted_spit_out' && e.target === destination.id)).toBe(true);
  });
});
