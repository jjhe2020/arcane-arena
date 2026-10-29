import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyDamage, createBattle, stepBattle } from './combat';
import { eventVisuals, movingVisuals, portalVisuals, resolveVisualArt, statusVisuals } from './visual-bindings';
import { activeVisualProjectiles, addVisualProjectile, visualProjectilePosition } from './combat/visual-state';
import { bodyPresentation, linePresentations } from './animation';
import type { AssetManifest, BattleState, CombatEvent, CombatUnit, Player, SkillDefinition, SkillStack } from './model';
import type { EffectStatus } from './skill-effects';
import {selectVisualLayers,type VisualSkillArt} from './visual-layers';

const assets = JSON.parse(readFileSync('public/data/assets.json', 'utf8')) as AssetManifest;
const definitions = JSON.parse(readFileSync('public/data/skills.json', 'utf8')) as SkillDefinition[];
const art = (id: string) => assets.skills[id] as VisualSkillArt;
const layers = (visuals: ReturnType<typeof statusVisuals>) => visuals.map(v => v.key.split(':').at(v.key.startsWith('event:') ? -2 : -1));
function player(id: number, skills: SkillStack[] = [], ally = false): Player {
  return { id, name: `P${id}`, hp: 100, gold: 0, shopLevel: 5, locked: false, shop: [], reserve: [],
    heroes: [0, ...(ally ? [1] : [])].map(i => ({ id: `h${i}`, name: `H${i}`, role: 'mage', skin: 'female',
      x: i, y: -2, persistentStrengthBonus: 100, skills: i ? [] : skills })) };
}
function setup(id?: string, points = 9, ally = false) {
  const battle = createBattle(player(0, id ? [{ id, points }] : [], ally), player(1), 871, definitions);
  for (const unit of battle.units) { unit.moveSpeed = 0; unit.nextAttack = 100; unit.mana = unit.maxMana = 10000; unit.hp = unit.maxHp = 100000; }
  return { battle, caster: battle.units[0], target: battle.units.at(-1)!, step: (seconds: number) => stepBattle(battle, seconds, definitions) };
}
function waitFor(battle: BattleState, predicate: () => boolean) {
  for (let i = 0; i < 180 && !predicate(); i++) stepBattle(battle, 1 / 30, definitions);
  expect(predicate(), 'The actual simulation never produced the expected live evidence').toBe(true);
}
function addStatus(unit: CombatUnit, status: Partial<EffectStatus> & { kind: string }) {
  unit.statuses.push({ until: 10, ...status });
}

describe('live status-to-art binding', () => {
  it('does not paint Chemical Rage merely because a unit owns the skill', () => {
    const h = setup('alchemist_chemical_rage');
    expect(statusVisuals(assets, h.battle.units, 0)).toEqual([]);
  });
  it('paints only live Rage and regeneration layers once each, then removes them on expiry or recipient death', () => {
    const h = setup('alchemist_chemical_rage', 3);
    waitFor(h.battle, () => h.caster.statuses.some(s => s.kind === 'regen' && s.skill === 'alchemist_chemical_rage'));
    const visual = statusVisuals(assets, h.battle.units, h.battle.time);
    expect(layers(visual).sort()).toEqual(['rage', 'regen']);
    expect(visual.every(v => v.x === h.caster.x && v.y === h.caster.y)).toBe(true);
    expect(visual.map(v => v.clip)).toEqual(expect.arrayContaining([art('alchemist_chemical_rage').layers!.rage, art('alchemist_chemical_rage').layers!.regen]));
    const expiry = Math.max(...h.caster.statuses.map(s => s.until));
    expect(statusVisuals(assets, h.battle.units, expiry)).toEqual([]);
    h.caster.dead = true; expect(statusVisuals(assets, h.battle.units, h.battle.time)).toEqual([]);
  });
  it('also paints the real Gaben Rage body on its allied recipient rather than dropping it because the source differs', () => {
    const h = setup('alchemist_chemical_rage', 9, true), ally = h.battle.units[1];
    waitFor(h.battle, () => ally.statuses.some(s => s.kind === 'baseAttackTime' && s.skill === 'alchemist_chemical_rage'));
    const visual = statusVisuals(assets, [h.caster, ally], h.battle.time).filter(v => v.key.startsWith(`s:${ally.id}:`));
    expect(layers(visual).sort()).toEqual(['rage', 'regen']);
    expect(visual.every(v => v.x === ally.x && v.y === ally.y)).toBe(true);
  });
  it('does not convert caster permanent numeric attributes into target debuffs', () => {
    const h = setup('custom_slardar_amplify_damage');
    h.caster.statuses = []; h.target.statuses = [];
    addStatus(h.caster, { kind: 'strength', value: 20, source: h.caster.id, skill: 'custom_slardar_amplify_damage', harmful: false });
    expect(statusVisuals(assets, h.battle.units, 1)).toEqual([]);
    addStatus(h.target, { kind: 'armor', value: -10, source: h.caster.id, skill: 'custom_slardar_amplify_damage', harmful: true });
    const visual = statusVisuals(assets, h.battle.units, 1);
    expect(layers(visual)).toEqual(['haze']); expect(visual[0].x).toBe(h.target.x); expect(visual[0].y).toBe(h.target.y);
    h.caster.dead = true; expect(layers(statusVisuals(assets, h.battle.units, 1))).toEqual(['haze']);
  });
  it('keeps Jingu target counters separate from the caster charged-attack layer', () => {
    const h = setup('custom_monkey_king_jingu_mastery', 3); h.caster.statuses = []; h.target.statuses = [];
    addStatus(h.target, { kind: 'jinguHits', value: 1, source: h.caster.id, skill: 'custom_monkey_king_jingu_mastery', harmful: true });
    const visual = statusVisuals(assets, h.battle.units, 1);
    expect(layers(visual)).toEqual(['stack']);
    expect(visual[0].key.startsWith(`s:${h.target.id}:`)).toBe(true);
  });
  it('obeys the real source tier and does not show Mana Drain Super immunity in Normal', () => {
    const h = setup('custom_lion_mana_drain', 3);
    addStatus(h.caster, { kind: 'magicImmune', source: h.caster.id, skill: 'custom_lion_mana_drain' });
    expect(statusVisuals(assets, h.battle.units, 1)).toEqual([]);
    h.caster.skills[0]!.points = 6;
    expect(layers(statusVisuals(assets, h.battle.units, 1))).toEqual(['immunity']);
  });
  it('removes Refraction shield art when the damage-absorb pool ends, even with attack charges left', () => {
    const h = setup('templar_assassin_refraction', 3);
    waitFor(h.battle, () => h.caster.statuses.some(s => s.kind === 'refraction'));
    expect(layers(statusVisuals(assets, h.battle.units, h.battle.time))).toContain('shield');
    for (let i = 0; i < 6; i++) applyDamage(h.battle, h.target, h.caster, 100, 'pure');
    expect(h.caster.statuses.some(s => s.kind === 'refraction')).toBe(false);
    expect(h.caster.statuses.some(s => s.kind === 'refractionAttack')).toBe(true);
    expect(layers(statusVisuals(assets, h.battle.units, h.battle.time))).not.toContain('shield');
  });
  it('uses the approved cumulative HP bands for Berserker Rage instead of showing all four at full health', () => {
    const h = setup('custom_troll_warlord_berserkers_rage', 3);
    for (const [ratio, count] of [[1, 1], [.6, 2], [.4, 3], [.2, 4]] as const) {
      h.caster.hp = h.caster.maxHp * ratio;
      const healthLayers = layers(statusVisuals(assets, h.battle.units, 0)).filter(id => id?.startsWith('rage_stack_'));
      expect(healthLayers).toEqual(Array.from({ length: count }, (_, i) => `rage_stack_${i + 1}`));
    }
  });
  it('shows actual Sticky Napalm stacks despite their semantic state using the stickyNapalm name', () => {
    const h = setup('batrider_sticky_napalm', 3);
    waitFor(h.battle, () => h.target.statuses.some(s => s.kind === 'stickyNapalm'));
    expect(layers(statusVisuals(assets, h.battle.units, h.battle.time))).toContain('coat');
  });
  it('shows the actual Warpath stack aura after another spell is cast', () => {
    const h = setup('bristleback_warpath', 3);
    h.caster.skills.push({ id: 'bloodseeker_bloodrage', points: 3 });
    waitFor(h.battle, () => h.caster.statuses.some(s => s.kind === 'warpath' && (s.value ?? 0) > 0));
    expect(layers(statusVisuals(assets, h.battle.units, h.battle.time))).toEqual(expect.arrayContaining(['fury', 'stack', 'embers']));
  });
  it('shows Jingu charged attacks only while the real private charge counter is nonzero', () => {
    const h = setup('custom_monkey_king_jingu_mastery', 3), key = 'custom_monkey_king_jingu_mastery:charges';
    h.caster.range = 10; h.caster.nextAttack = 0; h.caster.attackInterval = .2;
    waitFor(h.battle, () => Number(h.caster[key] ?? 0) > 0);
    expect(layers(statusVisuals(assets, h.battle.units, h.battle.time))).toContain('charged');
    waitFor(h.battle, () => Number(h.caster[key] ?? 0) === 0);
    expect(layers(statusVisuals(assets, h.battle.units, h.battle.time))).not.toContain('charged');
  });
  it('shows earned Flesh Heap marks from the persistent skill instance without inventing its temporary block shell', () => {
    const id = 'custom_pudge_flesh_heap';
    const battle = createBattle(player(0, [{ id, points: 6, persistentState: { [`${id}:strength`]: 4 } }]), player(1), 871, definitions);
    expect(battle.units[0].statuses.some(s => s.kind === 'strength' && s.skill === `${id}:persistent` && s.value === 4)).toBe(true);
    expect(layers(statusVisuals(assets, battle.units, 0))).toEqual(['heap_mark']);
  });
  it.each([1, 3])('only paints dragon frost when the level-%i attack actually applied a slow', points => {
    const h = setup('dragon_knight_elder_dragon_form', points);
    h.caster.range = 10; h.caster.nextAttack = 0; h.caster.attackInterval = .2;
    waitFor(h.battle, () => h.target.statuses.some(s => s.kind === 'dot' && s.skill === 'dragon_knight_elder_dragon_form'));
    const visual = layers(statusVisuals(assets, h.battle.units, h.battle.time));
    expect(visual).toContain('poison');
    if (points >= 3) expect(visual).toContain('frost_slow'); else expect(visual).not.toContain('frost_slow');
  });
  it('ends Gods Strength immunity art at its real four-second immunity expiry while retaining the damage buff', () => {
    const h = setup('custom_sven_gods_strength', 6);
    waitFor(h.battle, () => h.caster.statuses.some(s => s.kind === 'magicImmune'));
    expect(layers(statusVisuals(assets, h.battle.units, h.battle.time))).toEqual(expect.arrayContaining(['strength', 'immune']));
    h.step(4.2);
    expect(h.caster.statuses.some(s => s.kind === 'magicImmune' && s.until > h.battle.time)).toBe(false);
    expect(h.caster.statuses.some(s => s.kind === 'attackPct' && s.until > h.battle.time)).toBe(true);
    expect(layers(statusVisuals(assets, h.battle.units, h.battle.time))).toContain('strength');
    expect(layers(statusVisuals(assets, h.battle.units, h.battle.time))).not.toContain('immune');
  });
  it('does not leak dragon poison or frost layers onto the granted Fireball burn status', () => {
    const h = setup('dragon_knight_elder_dragon_form', 6);
    waitFor(h.battle, () => h.target.statuses.some(s => s.kind === 'fireballBurn'));
    expect(h.battle.events.some(e => e.type === 'cast' && e.skill === 'dragon_knight_fireball')).toBe(true);
    expect(layers(statusVisuals(assets, h.battle.units, h.battle.time))).not.toEqual(expect.arrayContaining(['poison', 'frost_slow']));
    const targetVisuals = statusVisuals(assets, h.battle.units, h.battle.time).filter(v => v.key.startsWith(`s:${h.target.id}:`));
    expect(targetVisuals).toEqual([]);
  });
});

describe('actual granted transformation and summoned-body art', () => {
  it('replaces the real Spirit Link True Form recipient with the approved bear action, then restores on expiry', () => {
    const h = setup('custom_lone_druid_spirit_link', 9);
    waitFor(h.battle, () => h.caster.statuses.some(s => s.kind === 'trueForm'));
    for (const action of ['idle', 'move', 'attack', 'death']) {
      expect(bodyPresentation(assets, h.caster, action, h.battle.time).clip).toBe(art('custom_lone_druid_spirit_link').layers![`truebear_${action}`]);
    }
    const end = h.caster.statuses.find(s => s.kind === 'trueForm')!.until;
    expect(bodyPresentation(assets, h.caster, 'idle', end).clip).toBeUndefined();
  });
  it('uses the ancient body for an actual Call of the Wild ancient instead of falling back to the boar', () => {
    const h = setup('custom_beastmaster_call_of_the_wild', 9);
    waitFor(h.battle, () => h.battle.units.some(u => u.name === '支配远古'));
    const ancient = h.battle.units.find(u => u.name === '支配远古')!;
    expect(ancient.ancient).toBe(true); expect(String(ancient.sourceUnitType)).toContain('npc_dota_');
    expect(bodyPresentation(assets, ancient, 'idle', h.battle.time).clip).toBe(art('custom_beastmaster_call_of_the_wild').layers!.ancient_idle);
    expect(bodyPresentation(assets, ancient, 'attack', h.battle.time).clip).toBe(art('custom_beastmaster_call_of_the_wild').layers!.ancient_attack);
  });
});

describe('granted-child art provenance', () => {
  it('uses parent provenance and its captured tier when the child has no own art', () => {
    const resolved = resolveVisualArt(assets, { skill: 'aa_test_missing_child', visualSkill: 'dragon_knight_elder_dragon_form', visualPoints: 9, points: 1 });
    expect(resolved).toEqual({ id: 'dragon_knight_elder_dragon_form', art: art('dragon_knight_elder_dragon_form'), points: 9 });
    expect(resolveVisualArt(assets, { skill: 'unmapped_unknown_child' })).toBeUndefined();
  });
  it('prefers a child own atlas and child tier over either captured or explicit parent fallback', () => {
    const child = 'aa_test_own_child', own = art('custom_lina_dragon_slave');
    const withOwn = { ...assets, skills: { ...assets.skills, [child]: own } };
    for (const parent of [{ visualSkill: 'dragon_knight_elder_dragon_form' }, { artSkill: 'dragon_knight_elder_dragon_form' }]) {
      const resolved = resolveVisualArt(withOwn, { skill: child, points: 3, visualPoints: 9, ...parent });
      expect(resolved).toEqual({ id: child, art: own, points: 3 });
    }
  });
});

describe('event art requires the corresponding actual event', () => {
  it('draws Ink Swell tendrils from the real beneficiary to tick-hit enemies without treating visual metadata as enemy buffs', () => {
    const id = 'custom_grimstroke_ink_swell', h = setup(id, 6, true), ally = h.battle.units[1];
    ally.y = -1;
    waitFor(h.battle, () => h.target.statuses.some(s => s.kind === 'visualLink' && s.skill === id));
    const marker = h.target.statuses.find(s => s.kind === 'visualLink' && s.skill === id) as EffectStatus;
    expect(marker.source).toBe(ally.id); expect(marker.data?.beneficiaryId).toBe(ally.id);
    const connections = linePresentations(assets, h.battle.units, h.battle.time).filter(l => l.clip === art(id).layers!.tendril);
    expect(connections).toHaveLength(1);
    expect(connections[0].x).toBeCloseTo((ally.x + h.target.x) / 2);
    expect(connections[0].y).toBeCloseTo((ally.y + h.target.y) / 2);
    expect(statusVisuals(assets, h.battle.units, h.battle.time).some(v => v.key.startsWith(`s:${h.target.id}:`) && v.clip === art(id).layers!.coat)).toBe(false);
  });
  it('binds a real Courage lifesteal heal to caster feedback, independently of the successful counter proc layer', () => {
    const h = setup('legion_commander_moment_of_courage');
    h.caster.hp /= 2; h.caster.range = 10; h.caster.nextAttack = 0; h.caster.attackInterval = .1;
    waitFor(h.battle, () => h.battle.events.some(e => e.type === 'heal' && e.skill === 'legion_commander_moment_of_courage'));
    const heal = h.battle.events.find(e => e.type === 'heal' && e.skill === 'legion_commander_moment_of_courage')!;
    expect(heal.amount).toBeGreaterThan(0);
    const visual = eventVisuals(assets, heal, h.battle.units);
    expect(layers(visual)).toEqual(['steal']); expect(visual[0].clip).toBe(art('legion_commander_moment_of_courage').layers!.steal);
    expect({ x: visual[0].x, y: visual[0].y }).toEqual({ x: h.caster.x, y: h.caster.y }); expect(visual[0].loop).toBe(false);
    expect(eventVisuals(assets, { ...heal, type: 'cast' }, h.battle.units)).toEqual([]);
  });
  it('suppresses zero-damage and prevented hits instead of inventing hit art', () => {
    const h = setup('custom_drow_ranger_frost_arrows');
    const hit: CombatEvent = { time: 1, type: 'hit', source: h.caster.id, target: h.target.id, skill: 'custom_drow_ranger_frost_arrows', x: 1, y: 2, amount: 10 };
    expect(layers(eventVisuals(assets, hit, h.battle.units))).toEqual(['frost_hit']);
    for (const patch of [{ amount: 0 }, { amount: -1 }, { amount: undefined }, { outcome: 'miss' }, { outcome: 'blocked' }]) {
      expect(eventVisuals(assets, { ...hit, ...patch }, h.battle.units)).toEqual([]);
    }
  });
  it('does not turn a cast, summon, or unrelated status into Ravage world explosions', () => {
    const h = setup('custom_tidehunter_ravage');
    for (const type of ['cast', 'summon', 'attack', 'move', 'death', 'status'] as const) {
      const event: CombatEvent = { time: 1, type, source: h.caster.id, skill: 'custom_tidehunter_ravage', x: 0, y: 0, status: 'strength', amount: 10 };
      expect(eventVisuals(assets, event, h.battle.units)).toEqual([]);
    }
  });
  it('keeps event layers within the actual child own tier even when parent provenance has Gaben points', () => {
    const h = setup('custom_lion_mana_drain', 3);
    const event: CombatEvent = { time: 1, type: 'hit', source: h.caster.id, target: h.target.id, skill: 'custom_lion_mana_drain',
      x: 0, y: 0, amount: 10, points: 3, visualSkill: 'custom_lion_finger_of_death', visualPoints: 9 };
    expect(eventVisuals(assets, event, h.battle.units)).toEqual([]);
    expect(layers(eventVisuals(assets, { ...event, points: 9 }, h.battle.units))).toEqual(['damage']);
  });
});

describe('portals use actual Dissimilate world geometry', () => {
  it.each([3, 9])('maps every real tier-%i portal coordinate and removes the field when its real marker is released', points => {
    const h = setup('custom_void_spirit_dissimilate', points);
    waitFor(h.battle, () => h.caster.statuses.some(s => s.kind === 'visualForm'));
    const marker = h.caster.statuses.find(s => s.kind === 'visualForm') as EffectStatus;
    const actual = JSON.parse(String(marker.data?.portals)) as { x: number; y: number }[];
    const visual = portalVisuals(assets, h.battle.units, h.battle.time);
    expect(visual.map(v => ({ x: v.x, y: v.y }))).toEqual(actual);
    expect(visual.length).toBeGreaterThan(1); expect(new Set(visual.map(v => v.key)).size).toBe(actual.length);
    expect(visual.every(v => v.clip === art('custom_void_spirit_dissimilate').layers!.portal && v.loop)).toBe(true);
    h.caster.dead = true; expect(portalVisuals(assets, h.battle.units, h.battle.time)).toEqual([]); h.caster.dead = false;
    expect(portalVisuals(assets, h.battle.units, marker.until)).toEqual([]);
    h.step(2); expect(portalVisuals(assets, h.battle.units, h.battle.time)).toEqual([]);
  });
  it('does not synthesize portals from owning or casting the skill, or malformed metadata', () => {
    const h = setup('custom_void_spirit_dissimilate');
    expect(portalVisuals(assets, h.battle.units, 0)).toEqual([]);
    for (const portals of ['not json', '{}', '[{"x":null,"y":0}]', JSON.stringify(Array.from({ length: 33 }, () => ({ x: 0, y: 0 })))]) {
      h.caster.statuses = []; addStatus(h.caster, { kind: 'visualForm', skill: 'custom_void_spirit_dissimilate', data: { form: 'dissimilate', portals } });
      expect(portalVisuals(assets, h.battle.units, 1)).toEqual([]);
    }
  });
});

describe('moving art follows published simulation metadata', () => {
  it.each(['beastmaster_wild_axes', 'custom_shredder_chakram', 'custom_snapfire_mortimer_kisses', 'kunkka_ghostship'])('binds %s to its real moving coordinates, time and authored layer', id => {
    const h = setup(id, 3);
    // Kisses has an actual minimum range; keep this fixture beyond it.
    if (id === 'custom_snapfire_mortimer_kisses') { h.caster.y = -3.5; h.target.y = 3.5; }
    waitFor(h.battle, () => activeVisualProjectiles(h.battle).some(v => v.skill === id));
    const metadata = activeVisualProjectiles(h.battle).filter(v => v.skill === id), visual = movingVisuals(assets, h.battle, h.battle.time);
    for (const motion of metadata) {
      const bound = visual.filter(v => v.key.startsWith(`motion:${motion.id}:`));
      expect(bound.length).toBeGreaterThan(0);
      for (const v of bound) {
        expect({ x: v.x, y: v.y }).toEqual(visualProjectilePosition(motion, h.battle.time));
        expect(v.age).toBeCloseTo(h.battle.time - motion.createdAt); expect(v.angle).toBeCloseTo(motion.angle + Math.PI / 2);
        if (motion.layer) expect(v.clip).toBe(art(id).layers![motion.layer]);
      }
    }
    const saved = h.battle.visualProjectiles; delete h.battle.visualProjectiles;
    expect(movingVisuals(assets, h.battle, h.battle.time)).toEqual([]);
    h.battle.visualProjectiles = saved; h.battle.finished = true;
    expect(movingVisuals(assets, h.battle, h.battle.time)).toEqual([]);
  });
  it('published swept Multishot arrows retain finite real coordinates and their own projectile atlas',()=>{const id='custom_drow_ranger_multishot',h=setup(id,3);waitFor(h.battle,()=>((h.battle.projectiles??[]) as {skill:string}[]).some(p=>p.skill===id));const flights=(h.battle.projectiles as {skill:string;id:string;x:number;y:number;angle:number}[]).filter(p=>p.skill===id);expect(flights.length).toBeGreaterThan(0);for(const flight of flights){expect([flight.x,flight.y,flight.angle].every(Number.isFinite)).toBe(true);const resolved=resolveVisualArt(assets,flight,3)!;expect(selectVisualLayers(resolved.art,resolved.points,'projectile').map(layer=>layer.clip)).toEqual([art(id).layers!.arrow]);}});
  it('selects only the actual granted Tidal Wave parent layer while retaining child motion identity', () => {
    const h = setup('kunkka_ghostship', 6);
    waitFor(h.battle, () => activeVisualProjectiles(h.battle).some(v => v.skill === 'aa_granted_tidal_wave'));
    const wave = activeVisualProjectiles(h.battle).find(v => v.skill === 'aa_granted_tidal_wave')!;
    const visual = movingVisuals(assets, h.battle, h.battle.time).filter(v => v.key.startsWith(`motion:${wave.id}:`));
    expect(visual).toHaveLength(1); expect(visual[0].clip).toBe(art('kunkka_ghostship').layers!.tidal_wave);
    expect({ x: visual[0].x, y: visual[0].y }).toEqual(visualProjectilePosition(wave, h.battle.time));
  });
  it('cannot bypass tier exclusions through an explicit moving layer fallback', () => {
    const h = setup();
    addVisualProjectile(h.battle, { source: h.caster.id, skill: 'kunkka_ghostship', points: 3, layer: 'tidal_wave', x: 0, y: 0, angle: 0, until: 10 });
    expect(movingVisuals(assets, h.battle, 1)).toEqual([]);
  });
});
