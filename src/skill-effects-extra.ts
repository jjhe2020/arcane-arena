import type { CombatUnit, SkillDefinition } from './model';
import type { EffectContext, EffectStatus, SkillProgram } from './skill-effects';
import { addVisualWorldEffect } from './combat/visual-state';

// Every program below is keyed by an exact captured catalog ID. Source gaps are
// explicit; neither an unimplemented upgrade nor an absent number becomes a nuke.
type C = EffectContext;
const SECOND = 1;
const FOREVER = 120;
const U = (value: number) => value / 100;
const P = (value: number) => Math.abs(value) / 100;
const S = (c: C) => c.skill.points >= 6;
const G = (c: C) => c.skill.points >= 9;
const distance = (a: CombatUnit, b: CombatUnit) => Math.hypot(a.x - b.x, a.y - b.y);
const effectiveRange = (c: C) => c.caster.statuses.find(s => s.kind === 'attackRangeOverride' && s.until > c.battle.time)?.value ??
  c.caster.range + c.caster.statuses.filter(s => s.kind === 'range' && s.until > c.battle.time).reduce((sum, s) => sum + (s.value ?? 0), 0);
function value(c: C, key: string, fallback = 0): number {
  const row = c.definition.values.find(row => row.slice(0, row.indexOf(':')).trim().toUpperCase() === key.toUpperCase());
  const numbers = row?.slice(row.indexOf(':') + 1).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return numbers.length ? numbers[Math.min(numbers.length - 1, Math.max(0, Math.min(2, Math.floor(c.skill.points) - 1)))] : fallback;
}
const stateKey = (c: C, key: string) => `${c.skill.id}:${key}`;
const readState = (c: C, key: string) => Number(c.caster[stateKey(c, key)] ?? 0);
const setState = (c: C, key: string, n: number) => { c.caster[stateKey(c, key)] = n; };
const permanentValue = (c: C, key: string) => Number((c.caster.skillState as Record<string, number> | undefined)?.[stateKey(c, key)] ?? 0);
function gainPermanent(c: C, key: string, amount: number): number {
  const fullKey = stateKey(c, key), state = (c.caster.skillState ??= {}) as Record<string, number>;
  const gains = (c.caster.permanentSkillGains ??= {}) as Record<string, number>;
  state[fullKey] = (state[fullKey] ?? 0) + amount; gains[fullKey] = (gains[fullKey] ?? 0) + amount;
  return state[fullKey];
}
const nearby = (c: C, target: CombatUnit, radius: number) => c.enemies().filter(enemy => distance(enemy, target) <= radius);
const friendlies = (c: C, target: CombatUnit, radius: number) => c.allies().filter(ally => distance(ally, target) <= radius);
const ordered = (units: CombatUnit[], center: CombatUnit) => units.sort((a, b) => distance(a, center) - distance(b, center) || a.id.localeCompare(b.id));
function buff(c: C, target: CombatUnit, kind: string, amount: number, duration = FOREVER, options: Partial<EffectStatus> = {}) {
  c.status(target, kind, duration, amount, { harmful: false, ...options });
}
function debuff(c: C, target: CombatUnit, kind: string, amount: number, duration: number, options: Partial<EffectStatus> = {}) {
  c.status(target, kind, duration, amount, { harmful: true, ...options });
}
function clear(c: C, target: CombatUnit, kind: string) {
  target.statuses = target.statuses.filter(status => !(status.kind === kind && status.skill === c.skill.id && status.source === c.caster.id));
}
function has(c: C, target: CombatUnit, kind: string) {
  return target.statuses.some(status => status.kind === kind && status.skill === c.skill.id && status.source === c.caster.id && status.until > c.battle.time);
}
function periodic(c: C, seconds: number, interval: number, callback: (tick: number) => void) {
  c.zone({ follow: true, radius: 0.01, duration: seconds, interval, targets: 'all', effect: (target, tick) => {
    if (target.id === c.caster.id) callback(tick);
  } });
}
function active(cast: (c: C) => void, implemented: string[], remaining: string[], options: Partial<SkillProgram> = {}): SkillProgram {
  return { target: 'enemy', range: 7, backswing: .2, cast, implemented,
    remaining: ['AA reference execution/targeting/cast timings and cross-skill interactions require verification', ...remaining], ...options };
}
function passive(options: Partial<SkillProgram>, implemented: string[], remaining: string[]): SkillProgram {
  return { passive: true, implemented,
    remaining: ['AA reference interaction verification', ...remaining], ...options };
}
const programs: Record<string, SkillProgram> = {};

// Historical fallback only: Valve KV, commit 6abdd9d (2023-02-10).
// AA catalog values override this baseline. Exact KV paths and unresolved native
// implementation details are listed in docs/skill-extra-evidence-gaps.md.
const HISTORICAL = 'Historical Valve 2023-02-10 fallback; AA execution parity is unverified';
/** Concentrated working defaults authorized for unspecified AA details.
 * These values are executable assumptions, not claims of reference parity. */
export const EXTRA_WORKING_DEFAULTS = Object.freeze({
  echoSecondStrikeDelay: .1, luminositySecondStrikeDelay: .1, luminosityExtraLifesteal: 1.5,
  avernusExtraSlow: .5, overloadBounceRadius: 5, overloadBounceSpeed: 12,
  evilWispCount: 13, evilWispDamagePerSecond: 36, evilWispDuration: 12, evilWispRadius: 2.75,
  voidMinistun: .1, chronoTimeMultiplier: 6.5, soldierSpawnOffset: 1.2, soldierLifetime: 12,
  gunslingerChance: .5, radianceDamagePerSecond: 120, radianceBlind: .15, radianceRadius: 7,
  sproinkExtraImpetusMana: 0, grantedCleanseCharges: 3, grantedPurgeCharges: 1,
  badJujuLevel: 3, badJujuArmorPerStack: 3, badJujuDuration: 12, badJujuDamagePerStack: 60,
  wolfBiteDuration: 120, wolfBiteSharedLifesteal: .3, wolfBiteLinkRange: 12,
  frontlinerDepthTolerance: .4, hypothermiaBurstRadius: 4,
  moonGlaiveProjectileSpeed: 9, empowerSuperExtraEndWidth: 2, chronoCasterMoveSpeed: 10,
});
const WORKING = 'AA unspecified details use EXTRA_WORKING_DEFAULTS; see evidence document, not reference-verified';
// Explicit working allowlist of attack effects without owner-only summons,
// permanent hero rewards or recursive Jingu spawning. Native AA eligibility is
// not recovered; active casts remain disabled by inheritedMode.
export const JINGU_ATTACK_EFFECT_IDS = new Set([
  'custom_drow_ranger_frost_arrows', 'custom_slardar_bash_of_the_deep', 'custom_abaddon_curse_of_avernus',
  'custom_dawnbreaker_luminosity', 'troll_warlord_fervor', 'custom_phantom_assassin_coup_de_grace', 'custom_luna_moon_glaive',
]);
const chance = (c: C, probability: number, key: string) => c.chance?.(probability, key) ?? c.random() < probability;
const canUseGranted = (c: C) => !c.caster.dead && !c.caster.statuses.some(s =>
  ['silence', 'stun', 'selfStun', 'hex', 'duel', 'banished'].includes(s.kind) && s.until > c.battle.time);
function chainLightning(c: C, damage: number, strikes: number, radius = 6.5) {
  const seen = new Set<string>();
  const bounce = (target: CombatUnit, remaining: number) => {
    if (target.dead || remaining <= 0) return;
    seen.add(target.id); c.damage(target, damage, 'magical', false);
    const next = ordered(nearby(c, target, radius).filter(t => !seen.has(t.id)), target)[0];
    if (next && remaining > 1) c.delay(.25, () => bounce(next, remaining - 1));
  };
  bounce(c.target, strikes);
}
function maelstrom(c: C, damage = 140, strikes = 4) {
  if (c.caster.illusion || c.battle.time < readState(c, 'chainReady')) return;
  if (!(c.skill.id === 'custom_windrunner_focusfire' ? chance(c, .3, 'maelstrom') : c.random() < .3)) return;
  setState(c, 'chainReady', c.battle.time + .2); chainLightning(c, damage, strikes);
}
function appendInit(id: string, callback: (c: C) => void) {
  const previous = programs[id].init;
  programs[id].init = c => { previous?.(c); callback(c); };
}
function appendAttack(id: string, callback: (c: C) => void) {
  const previous = programs[id].onAttack;
  programs[id].onAttack = c => { previous?.(c); callback(c); };
}
function grantSlot(c: C, id: string, points: number) {
  if (c.grantAbility) { c.grantAbility(id, points); return; }
  if (c.caster.skills.some(s => s?.id === id)) return;
  // Slot 4 is reserved by the existing Spell Steal program. Granted spells use
  // later combat-only slots and never change the player's four build slots.
  while (c.caster.skills.length < 5) { c.caster.skills.push(null); c.caster.cooldowns.push(0); }
  c.caster.skills.push({ id, points }); c.caster.cooldowns.push(0);
}
const childPrograms: Record<string, SkillProgram> = {};
const childDefinitions: SkillDefinition[] = [];
function child(id: string, values: string[], cooldown: number, mana: number, program: SkillProgram) {
  childPrograms[id] = program;
  childDefinitions.push({ id, name: id, nameEn: id, tags: [], description: '历史参考授予技能', descriptionEn: HISTORICAL,
    super: '', gaben: '', values, cooldowns: [cooldown], mana: [mana], categories: ['PIERCES SPELL IMMUNITY: No'],
    icon: '', passive: false, ultimate: false, grantedOnly: true,
    historicalSource: { file: 'npc_abilities.txt', commit: '6abdd9d13de2f4330ca748082467b9ff6e6cd928', commitDate: '2023-02-10T01:16:45Z', id },
  });
}

programs.crystal_maiden_brilliance_aura = passive({
  init: c => periodic(c, FOREVER, SECOND, () => {
    for (const ally of c.allies()) {
      c.mana(ally, value(c, ally.id === c.caster.id ? 'SELF MANA REGEN' : 'MANA REGEN'));
      if (G(c)) buff(c, ally, 'cooldownReduction', .25, 1.1);
    }
  }),
  onCast: c => { const restored = value(c, 'MANA RESTORED PER CAST') + (S(c) ? 80 : 0);
    for (const ally of c.allies()) { c.mana(ally, restored); if (S(c)) c.heal(ally, restored * .25); }
  }
}, ['global ally mana regeneration', 'cast-triggered mana burst', 'Super +80 burst and healing', 'Gaben cooldown-reduction aura'],
['Close/self mana regen fields conflict in the captured text; SELF MANA REGEN used for caster and MANA REGEN for allies']);

programs.bloodseeker_bloodrage = active(c => {
  const duration = value(c, 'DURATION');
  const targets = [c.caster, ...(S(c) ? ordered(c.allies().filter(t => t.id !== c.caster.id && !t.summoned && distance(t, c.caster) <= 8), c.caster).slice(0, 1) : [])];
  for (const ally of targets) {
    buff(c, ally, 'bloodrage', 1, duration + .01);
    buff(c, ally, 'attackSpeed', (value(c, 'ATTACK SPEED') + (S(c) ? 25 : 0)) * (ally.id === c.caster.id ? 1 : .5), duration);
    buff(c, ally, 'spellAmp', P(value(c, 'SPELL AMPLIFICATION')) + (S(c) ? .08 : 0), duration);
    if (G(c)) buff(c, ally, 'maxHpAttackLifesteal', .018, duration);
    for (let time = 1; time <= duration; time++) c.delay(time, () => {
      if (!ally.dead && has(c, ally, 'bloodrage')) ally.hp = Math.max(1, ally.hp - ally.maxHp * P(value(c, 'MAX HEALTH DAMAGE PER SECOND')));
    });
  }
}, ['self attack-speed/spell amplification', 'nonlethal max-health cost per second', 'Super nearest ally buff with half attack speed'],
['Health-cost timing and allied half-attack-speed interaction need reference verification'], { target: 'self' });

programs.custom_beastmaster_inner_beast = passive({ init: c => periodic(c, FOREVER, .25, () => {
  for (const ally of friendlies(c, c.caster, U(value(c, 'RADIUS')))) {
    buff(c, ally, 'attackSpeed', value(c, 'BONUS ATTACK SPEED') + (S(c) ? 15 : 0) + (G(c) ? 15 : 0), .35);
    if (S(c)) { buff(c, ally, 'lifesteal', .2, .35); buff(c, ally, 'attackPct', .15, .35); }
  }
}) }, ['radius-bound ally attack-speed aura', 'Super lifesteal and attack-damage aura', 'Gaben extra attack speed'],
['Gaben Wraith Pact body, physical suppression and damage aura']);

programs.luna_lunar_blessing = passive({ init: c => periodic(c, FOREVER, .25, () => {
  const round = Number(c.battle.round ?? 1), upgradeRound = c.skill.superRound ?? round;
  const accumulated = S(c) ? Math.max(0, round - upgradeRound) * 4 : 0;
  for (const ally of friendlies(c, c.caster, U(value(c, 'BLESSING RADIUS')))) buff(c, ally, 'attackBonus', value(c, 'DAMAGE BONUS') + accumulated, .35);
}) }, ['radius-bound flat ally attack-damage aura', 'Super +4 damage for each round after the recorded upgrade round'], ['Gaben Bongo Drums exact referenced-item statistics', 'Day/night vision omitted from flat arena']);

programs.vengefulspirit_command_aura = passive({ init: c => periodic(c, FOREVER, .25, () => {
  for (const ally of friendlies(c, c.caster, U(value(c, 'RADIUS')))) buff(c, ally, 'attackPct', P(value(c, 'BASE DAMAGE BONUS')) + (S(c) ? .16 : 0), .35);
}), onDeath: c => {
  if (!G(c) || c.caster.strongAuraIllusion) return;
  const images = c.summon({ name: `${c.caster.name}·复仇幻象`, count: 1, hp: c.caster.maxHp, attack: c.caster.attack,
    armor: c.caster.armor, range: c.caster.range, interval: c.caster.attackInterval, speed: c.caster.moveSpeed * 1.12,
    lifetime: FOREVER, illusion: true, damageTaken: 1, inheritsSkills: true, initializeInherited: true });
  for (const image of images) { image.strongAuraIllusion = true; image.strongIllusion = true; image.maxMana = c.caster.maxMana; image.mana = c.caster.maxMana; }
} }, ['radius-bound percentage attack-damage aura', 'Super +16 percentage points', 'Gaben on-death full-damage strong illusion with active abilities and +12% move speed'],
['Working strong-illusion inheritance initializes all registered abilities with snapshot attribute deduplication; exact AA allowlist remains unverified']);

function empower(c: C, target: CombatUnit) {
  const duration = G(c) ? .35 : value(c, 'DURATION') + (S(c) ? 10 : 0);
  const selfMultiplier = target.id === c.caster.id ? 1.75 : 1;
  buff(c, target, 'empower', 1, duration);
  buff(c, target, 'attackPct', (P(value(c, 'BONUS DAMAGE')) + (S(c) ? .1 : 0)) * selfMultiplier, duration);
  buff(c, target, 'cleave', (P(value(c, 'CLEAVE DAMAGE')) + (S(c) ? .1 : 0)) * selfMultiplier, duration,
    { data: { distance: 6.5, startWidth: 1.5, endWidth: 3.6 + (S(c) ? EXTRA_WORKING_DEFAULTS.empowerSuperExtraEndWidth : 0) } });
}
programs.custom_magnataur_empower = active(c => {
  if (G(c)) { periodic(c, FOREVER, .25, () => { for (const ally of c.allies()) empower(c, ally); }); buff(c, c.caster, 'empowerAura', 1); }
  else { empower(c, c.target); if (S(c) && c.target.id !== c.caster.id) empower(c, c.caster); }
}, ['bonus attack damage', 'closest-other-ally targeting with self fallback', '75% larger self bonus', 'Super self co-cast and numerical bonuses', 'Gaben global aura'],
[HISTORICAL, 'Directional cleave uses native 150 starting radius, 360 ending radius and 650 distance; target centers define inclusion',
  'AA Super +200 cleave radius is interpreted as +200 ending radius only; AA geometry remains unverified'],
{ target: 'ally', castPoint: 0, canCast: c => !G(c) || !has(c, c.caster, 'empowerAura'),
  targetSelector: (c, candidates) => ordered(candidates.filter(t => t.id !== c.caster.id), c.caster)[0] ?? candidates.find(t => t.id === c.caster.id) });

programs.custom_drow_ranger_frost_arrows = passive({
  attackModifier: c => ({ bonus: value(c, 'BONUS DAMAGE') + (S(c) ? 20 : 0) }),
  onAttack: c => {
    const n = Math.min(7, Number(c.target.statuses.find(s => s.kind === 'hypothermia' && s.source === c.caster.id && s.until > c.battle.time)?.value ?? 0) + 1);
    debuff(c, c.target, 'slow', P(value(c, 'MOVEMENT SLOW')), 1.5);
    debuff(c, c.target, 'hypothermia', n, 7);
    debuff(c, c.target, 'healReduction', Math.min(1, n * (P(value(c, 'HYPOTHERMIA REGEN REDUCTION')) + (S(c) ? .04 : 0))), 7);
    if (G(c)) for (const enemy of ordered(nearby(c, c.target, 3.75).filter(t => t.id !== c.target.id), c.target).slice(0, 2)) c.attack(enemy, .5, false);
  }, onUnitDeath: c => {
    const stacks = c.target.statuses.find(s => s.kind === 'hypothermia' && s.source === c.caster.id && s.until > c.battle.time)?.value ?? 0;
    if (!stacks || c.target.side === c.caster.side) return;
    for (const enemy of nearby(c, c.target, EXTRA_WORKING_DEFAULTS.hypothermiaBurstRadius)) {
      c.damage(enemy, stacks * value(c, 'HYPOTHERMIA BURST DAMAGE'), 'magical', false);
      debuff(c, enemy, 'slow', .4, 2, { piercesImmunity: false });
    }
  }
}, ['zero-mana passive attack bonus', '1.5-second movement slow', 'seven-second capped Hypothermia stacks and recovery suppression', 'death burst uses AA damage per stack', 'Super bonus damage and suppression', 'Gaben two nearby split attacks'],
[HISTORICAL, 'Hypothermia lifetime/cap/slow use historical shard values; radius 400 is a transparent default', 'AA flat bonus damage is retained; historical shard extra damage per stack is not added without matching AA evidence', 'Death bursts after the original caster has already died require persistent passive-source hooks']);

programs.custom_viper_poison_attack = passive({
  init: c => { if (S(c)) buff(c, c.caster, 'range', 1.5, FOREVER, { dispel: 'none' }); },
  onAttack: c => {
    const seconds = value(c, 'DURATION');
    const old = c.target.statuses.find(s => s.kind === 'poisonAttack' && s.source === c.caster.id)?.value ?? 0;
    const n = Math.min(value(c, 'MAX STACKS') + (G(c) ? 3 : 0), old + 1);
    debuff(c, c.target, 'poisonAttack', n, seconds);
    debuff(c, c.target, 'slow', Math.min(.99, n * P(value(c, 'MOVE SLOW PER STACK'))), seconds);
    debuff(c, c.target, 'magicResist', -n * (P(value(c, 'MAGIC RESISTANCE PER STACK')) + (S(c) ? .1 : 0)), seconds);
    debuff(c, c.target, 'dot', n * value(c, 'DAMAGE PER SECOND'), seconds, { interval: 1, damageType: 'magical' });
    if (G(c)) debuff(c, c.target, 'armor', -n, seconds);
    if (S(c)) { const bonus = readState(c, 'resistance') + P(value(c, 'MAGIC RESISTANCE PER STACK')) + .1; setState(c, 'resistance', bonus); buff(c, c.caster, 'magicResist', bonus); }
  }
}, ['stacking poison damage and slow', 'magic vulnerability per stack', 'Super infinite resistance leech and attack range', 'Gaben stack cap and armor loss'],
['Magic resistance stacking and negative resistance clamp require reference verification', 'Super resistance buff duration is absent in snapshot']);

programs.winter_wyvern_arctic_burn = active(c => {
  const seconds = G(c) ? FOREVER : value(c, 'FLIGHT DURATION');
  buff(c, c.caster, 'arcticBurn', 1, seconds); buff(c, c.caster, 'range', U(value(c, 'BONUS ATTACK RANGE')), seconds);
  buff(c, c.caster, 'flying', 1, seconds);
  if (G(c)) buff(c, c.caster, 'haste', .25, seconds);
  c.caster[stateKey(c, 'hitTargets')] = new Set<string>();
}, ['temporary attack-range increase', 'current-health percentage burn', 'movement slow', 'Super slow and duration', 'Gaben permanent burn and repeated targets'],
['Flying collision/pathing', HISTORICAL, 'Projectile speed and one-hit-per-target reference verification'], {
  target: 'self', canCast: c => !has(c, c.caster, 'arcticBurn'), onAttack: c => {
    if (!has(c, c.caster, 'arcticBurn')) return;
    const hits = c.caster[stateKey(c, 'hitTargets')] as Set<string> | undefined;
    if (!G(c) && hits?.has(c.target.id)) return;
    hits?.add(c.target.id);
    const seconds = value(c, 'BURN DURATION') + (S(c) ? 2 : 0), target = c.target;
    debuff(c, target, 'arcticBurnDot', 1, seconds + .01);
    debuff(c, target, 'slow', P(value(c, 'MOVEMENT SLOW')) + (S(c) ? .12 : 0), seconds);
    const generation = Number(target[stateKey(c, 'burnGeneration')] ?? 0) + 1;
    target[stateKey(c, 'burnGeneration')] = generation;
    for (let i = 1; i <= seconds; i++) c.delay(i, () => {
      if (!target.dead && has(c, target, 'arcticBurnDot') && Number(target[stateKey(c, 'burnGeneration')]) === generation) c.damage(target, target.hp * P(value(c, 'HEALTH BURN')));
    });
  }
});

programs.enchantress_impetus = passive({ onAttack: c => {
  const cost = c.caster.extraFreeImpetus ? EXTRA_WORKING_DEFAULTS.sproinkExtraImpetusMana : c.definition.mana[Math.min(c.definition.mana.length - 1, Math.max(0, Math.min(2, c.skill.points - 1)))] ?? 0;
  if (c.caster.mana < cost) return;
  c.mana(c.caster, -cost);
  c.damage(c.target, distance(c.caster, c.target) * 100 * (P(value(c, 'DISTANCE DAMAGE')) + (S(c) ? .06 : 0)) * (c.target.summoned ? 2 : 1), 'pure');
} }, ['mana-funded distance-based pure attack damage', 'double damage to summoned targets', 'Super +6% distance factor'],
['Specialist Array exact item effect', 'Gaben Sproink', 'Creep/illusion classification for doubled damage', 'Distance measured at impact needs attack-origin snapshot']);

programs.doom_bringer_infernal_blade = active(c => {
  c.attack(c.target, 1, false);
  for (const target of G(c) ? nearby(c, c.target, 5) : [c.target]) {
    debuff(c, target, 'stun', 0, value(c, 'STUN DURATION') + (S(c) ? 1.2 : 0), { dispel: 'strong' });
    // AA 4.5, 2023-02-01: the default break was shortened from four to two seconds.
    debuff(c, target, 'break', 0, 2);
    if (S(c)) c.damage(target, 150, 'magical', false);
    debuff(c, target, 'dot', value(c, 'BASE BURN DAMAGE') + target.maxHp * (P(value(c, 'MAX HP AS DAMAGE')) + (S(c) ? .021 : 0)), value(c, 'BURN DURATION'), { interval: 1, damageType: 'magical' });
  }
}, ['infernal instant attack', 'ministun', 'base plus max-health burn', 'Super stun and burn percentages', 'Gaben 500-radius application'],
[HISTORICAL, 'Super bonus damage uses historical shard_bonus_damage=150; AA-specific trigger conditions still require comparison'], { range: 2 });

function courage(c: C, key: string) {
  if (c.battle.time < readState(c, key)) return;
  if (!chance(c, P(value(c, 'CHANCE TO COUNTERATTACK')) + (S(c) ? .08 : 0), key === 'defensiveCooldown' ? 'defensiveCounterattack' : 'offensiveCounterattack')) return;
  const cooldown = c.definition.cooldowns[Math.min(c.definition.cooldowns.length - 1, Math.min(2, c.skill.points - 1))] ?? 0;
  setState(c, key, c.battle.time + cooldown);
  addVisualWorldEffect(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'counter',
    x: c.caster.x, y: c.caster.y, angle: c.caster.facing, until: c.battle.time + 12 / 24, kind: 'proc', loop: false });
  const previous = c.target.hp; c.attack(c.target, 1, false);
  c.heal(c.caster, Math.max(0, previous - c.target.hp) * (P(value(c, 'LIFESTEAL')) + (S(c) ? .15 : 0)));
}
programs.legion_commander_moment_of_courage = passive({ onAttacked: c => courage(c, 'defensiveCooldown'), onAttack: c => { if (G(c)) courage(c, 'offensiveCooldown'); } },
['seeded counterattack with lifesteal', 'source-level internal cooldown', 'Super proc chance/lifesteal', 'Gaben attack-triggered separate cooldown'], []);

programs.custom_dawnbreaker_luminosity = passive({ attackModifier: c => {
  const n = readState(c, 'hits') + 1, threshold = S(c) ? 3 : 4; setState(c, 'hits', n % threshold);
  setState(c, 'proc', n % threshold === 0 ? 1 : 0);
  return { multiplier: n % threshold === 0 ? P(value(c, 'CRITICAL STRIKE DAMAGE')) + (S(c) ? .4 : 0) : 1 };
}, onAttack: c => {
  if (readState(c, 'proc')) {
    const heal = (c.amount ?? 0) * (P(value(c, 'HEALING FROM HEROES')) + (G(c) ? 1.5 : 0)) * (c.target.summoned ? 1 - P(value(c, 'CREEP HEAL PENALTY')) : 1);
    c.heal(c.caster, heal); for (const ally of friendlies(c, c.caster, 6.5).filter(t => t.id !== c.caster.id)) c.heal(ally, heal * .35);
  }
  if (G(c) && c.battle.time >= readState(c, 'doubleAttack')) {
    setState(c, 'doubleAttack', c.battle.time + 5);
    c.delay(EXTRA_WORKING_DEFAULTS.luminositySecondStrikeDelay, () => { if (!c.caster.dead && !c.target.dead) c.attack(c.target, 1, true); });
  }
} }, ['every-fourth attack critical and area healing', 'Super one fewer attack and critical bonus', 'Gaben five-second double attack'],
['Gaben +150% lifesteal interpreted as percentage points pending reference verification', 'Proc counter interaction with secondary attacks']);

programs.custom_monkey_king_jingu_mastery = passive({
  attackModifier: c => ({ bonus: readState(c, 'charges') > 0 ? value(c, 'BONUS DAMAGE') + (S(c) ? 130 : 0) : 0 }),
  onAttack: c => {
    if (readState(c, 'charges') > 0) { setState(c, 'charges', readState(c, 'charges') - 1); c.heal(c.caster, (c.amount ?? 0) * P(value(c, 'BONUS LIFESTEAL'))); return; }
    if (c.target.summoned) return;
    const old = c.target.statuses.find(s => s.kind === 'jinguHits' && s.source === c.caster.id)?.value ?? 0, n = old + 1;
    debuff(c, c.target, 'jinguHits', n, value(c, 'COUNTER DURATION'));
    if (n >= value(c, 'REQUIRED HITS')) {
      clear(c, c.target, 'jinguHits'); setState(c, 'charges', value(c, 'CHARGES'));
      const generation = readState(c, 'jinguGeneration') + 1; setState(c, 'jinguGeneration', generation);
      c.delay(35, () => { if (readState(c, 'jinguGeneration') === generation) setState(c, 'charges', 0); });
    }
  }
}, ['per-enemy hit counters with expiry', 'four charged bonus-damage/lifesteal attacks', 'Super +130 damage'], ['Super Echo Sabre', 'Gaben stone soldiers', 'Charged attack lifetime absent in catalog']);

programs.custom_luna_moon_glaive = passive({ onAttack: c => {
  const seen = new Set([c.target.id]), attack = c.baseAttackDamage ?? c.caster.attack;
  const count = value(c, 'BOUNCES') + (S(c) ? 1 : 0), factor = 1 - P(value(c, 'DAMAGE REDUCTION PER BOUNCE')) + (S(c) ? .08 : 0);
  const bounce = (current: CombatUnit, index: number) => {
    if (index > count) return;
    const next = ordered(nearby(c, current, U(value(c, 'BOUNCE RADIUS'))).filter(t => !seen.has(t.id)), current)[0];
    if (!next) return; seen.add(next.id);
    c.projectile(next, EXTRA_WORKING_DEFAULTS.moonGlaiveProjectileSpeed, target => {
      c.damage(target, attack * Math.pow(factor, index), 'physical'); bounce(target, index + 1);
    }, { x: current.x, y: current.y });
  };
  bounce(c.target, 1);
} }, ['bounded unique-target physical bounces travel serially from the previous hit target', 'effective pre-modifier attack snapshot includes flat and percentage attack bonuses',
  'per-bounce damage reduction', 'Super additional bounce and reduced penalty'],
['Gaben Butterfly', WORKING, 'Projectile speed 900 reference units/s is a working default', 'Native critical-strike and flat attack-modifier inheritance eligibility remains unverified']);

programs.custom_storm_spirit_overload = passive({
  onCast: c => setState(c, 'charges', readState(c, 'charges') + 1),
  onAllyCast: c => { if (S(c) && distance(c.target, c.caster) <= 7.5) setState(c, 'charges', readState(c, 'charges') + 1); },
  onAttack: c => { const n = readState(c, 'charges'); if (!n) return; setState(c, 'charges', 0);
    const release = (center: CombatUnit) => { for (const target of nearby(c, center, U(value(c, 'RADIUS')))) {
      c.damage(target, n * value(c, 'DAMAGE')); debuff(c, target, 'slow', P(value(c, 'MOVEMENT SLOW')), .8);
      // AA 4.5 explicitly changes the attack-speed slow from .8 to 1.2 seconds.
      debuff(c, target, 'attackSpeed', value(c, 'ATTACK SLOW'), 1.2);
    } };
    release(c.target);
    if (G(c)) {
      const seen = new Set([c.target.id]);
      const bounce = (current: CombatUnit, remaining: number) => {
        if (remaining <= 0) return;
        const next = ordered(nearby(c, current, EXTRA_WORKING_DEFAULTS.overloadBounceRadius).filter(t => !seen.has(t.id)), current)[0]; if (!next) return;
        seen.add(next.id);
        c.delay(distance(current, next) / EXTRA_WORKING_DEFAULTS.overloadBounceSpeed, () => {
          if (next.dead || c.caster.dead) return; c.attack(next, 1, false); release(next); bounce(next, remaining - 1);
        });
      };
      bounce(c.target, 2);
    }
  }
}, ['accumulating cast charges', 'all charges consumed by next attack', 'Super nearby allied casts grant charges', 'area damage/attack and movement slow', 'Gaben two unique-target chained attacks carrying Overload bursts'],
['Movement-slow duration uses historical AbilityDuration=.8; attack-slow duration is AA 4.5 1.2 seconds', 'Gaben bounce range, travel and charge propagation unspecified: nearest unseen target without distance cap is provisional']);

programs.custom_zuus_static_field = passive({ onDealDamage: c => {
  // This hook runs only for original, non-recursive damage. A cast which misses
  // never triggers Static Field; attacks do not count as an ability hit.
  if (!c.triggerSkillId || c.triggerSkillId === c.skill.id || c.target.dead || c.target.side === c.caster.side) return;
  const cooldownKey = `trigger:${c.triggerSkillId}`;
  if (c.battle.time < readState(c, cooldownKey)) return;
  setState(c, cooldownKey, c.battle.time + value(c, 'COOLDOWN'));
  c.damage(c.target, c.target.hp * (P(value(c, 'HEALTH REDUCTION')) + (S(c) ? .02 : 0)));
  if (G(c)) for (const target of nearby(c, c.caster, 10)
    .filter(t => !t.statuses.some(s => ['undetectable', 'shadowRealm'].includes(s.kind) && s.until > c.battle.time))
    .sort((a, b) => Number(!!a.summoned) - Number(!!b.summoned) || distance(a, c.caster) - distance(b, c.caster) || a.id.localeCompare(b.id)).slice(0, 2)) {
    c.damage(target, 100, 'magical', false);
    debuff(c, target, 'slow', .8, 1.6); debuff(c, target, 'attackSpeed', -100, 1.6);
    debuff(c, target, 'castTimePct', .5, 1.6);
  }
} }, ['current-health damage only after an actual ability damage event', 'independent cooldown per triggering ability', 'Super +2 percentage points'],
['Multi-target ability shared-vs-per-target cooldown needs reference comparison', HISTORICAL, 'Heavenly Jump uses maximum basic level, nearest-two targeting; granted level is unspecified in AA text']);

programs.custom_abaddon_curse_of_avernus = passive({ onAttack: c => {
  debuff(c, c.target, 'slow', P(value(c, 'BASIC SLOW')), value(c, 'BASIC DURATION'));
  if (!G(c) && has(c, c.target, 'avernusCurse')) return;
  const n = (c.target.statuses.find(s => s.kind === 'avernusHits' && s.source === c.caster.id)?.value ?? 0) + 1;
  debuff(c, c.target, 'avernusHits', n, value(c, 'BASIC DURATION'));
  if (n >= (S(c) ? 3 : 4)) {
    clear(c, c.target, 'avernusHits'); const duration = value(c, 'CURSE DURATION');
    debuff(c, c.target, 'avernusCurse', value(c, 'CURSE ATTACK SPEED'), duration);
    debuff(c, c.target, 'silence', 0, duration);
    debuff(c, c.target, 'slow', Math.min(.99, P(value(c, 'CURSE SLOW')) + (S(c) ? EXTRA_WORKING_DEFAULTS.avernusExtraSlow : 0)), duration);
  }
} }, ['four-hit curse/silence', 'basic and curse slows', 'Super three-hit threshold', 'Gaben can stack during existing curse'],
['Super -50% slow wording requires reference interpretation']);

programs.custom_abyssal_underlord_atrophy_aura = passive({ init: c => {
  periodic(c, FOREVER, .25, () => {
    const radius = S(c) ? 1000 : U(value(c, 'RADIUS'));
    for (const enemy of nearby(c, c.caster, radius)) debuff(c, enemy, 'attackPct', -(P(value(c, 'DAMAGE REDUCTION')) + (S(c) ? .15 : 0)), .35);
    buff(c, c.caster, 'attackBonus', readState(c, 'bonus'));
    if (G(c)) for (const ally of c.allies().filter(t => t.id !== c.caster.id)) buff(c, ally, 'attackBonus', readState(c, 'bonus'), .35);
  });
}, onUnitDeath: c => {
  if (c.target.side === c.caster.side || distance(c.target, c.caster) > (S(c) ? 1000 : U(value(c, 'RADIUS')))) return;
  setState(c, 'bonus', readState(c, 'bonus') + value(c, c.target.summoned ? 'BONUS DAMAGE(CREEP)' : 'BONUS DAMAGE(HERO)'));
  buff(c, c.caster, 'attackBonus', readState(c, 'bonus'));
  if (G(c)) for (const ally of c.allies().filter(t => t.id !== c.caster.id)) buff(c, ally, 'attackBonus', readState(c, 'bonus'), .35);
} }, ['enemy base-damage reduction aura', 'nearby death bonus damage', 'Super global aura', 'Gaben shares acquired bonus with allies'],
['Temporary damage-bonus duration absent: currently lasts until battle ends']);

programs.huskar_berserkers_blood = passive({ init: c => {
  if (G(c)) buff(c, c.caster, 'strength', 60, FOREVER, { dispel: 'none' });
  periodic(c, FOREVER, .2, () => {
  const scale = Math.min(1, Math.max(0, (1 - c.caster.hp / c.caster.maxHp) / (1 - P(value(c, 'HP FOR MAX BONUS')))));
  buff(c, c.caster, 'attackSpeed', value(c, 'MAX ATTACK SPEED') * scale, .3);
  buff(c, c.caster, 'magicResist', P(value(c, 'MAX MAGIC RESIST')) * scale, .3);
  if (typeof c.caster.strength === 'number') buff(c, c.caster, 'regen', c.caster.strength * (P(value(c, 'MAX STR REGEN')) + (S(c) ? .3 : 0)) * scale, .3);
}); } }, ['continuous missing-health attack speed and magic resistance', 'strength-based regeneration', 'Super +30 percentage points strength regeneration', 'Gaben +60 Strength'],
['Missing-health interpolation curve needs reference comparison']);

programs.custom_slark_dark_pact = active(c => {
  const allies = G(c) ? c.allies().filter(t => t.id !== c.caster.id && !t.summoned && !t.illusion) : [];
  for (let pulse = 0; pulse < 10; pulse++) c.delay(value(c, 'DELAY') + pulse * .1, () => {
    for (const unit of [c.caster, ...allies]) {
      if (unit.dead) continue;
      const own = unit.id === c.caster.id, damage = own ? (value(c, 'DAMAGE') + (S(c) ? 150 : 0)) / 10 : value(c, 'DAMAGE') * .05;
      c.dispel(unit, true);
      for (const enemy of nearby(c, unit, U(value(c, 'RADIUS')) + (own && S(c) ? 1.5 : 0))) { c.damage(enemy, damage); if (own && S(c)) c.dispel(enemy, false, false); }
      unit.hp = Math.max(1, unit.hp - damage * P(value(c, 'SELF DAMAGE')));
    }
  });
}, ['delayed strong self dispel and radial damage', 'ten .1-second purge/damage pulses', 'self-health cost', 'Super area/damage and enemy buff purge', 'Gaben allied normal-pact copies'],
['AA 2.0 confirms whole-team copies; summoned/illusion eligibility and allied self-cost ordering require reference verification', 'Continuous purge/damage subdivision and Super cooldown -1'], { target: 'self' });

programs.custom_enchantress_natures_attendants = active(c => {
  const healTick = (wisps: number) => { const targets = friendlies(c, c.caster, U(value(c, 'RADIUS'))).filter(t => t.hp < t.maxHp);
    for (let i = 0; i < wisps && targets.length; i++) c.heal(targets[Math.floor(c.random() * targets.length)], value(c, 'HEAL PER SECOND') + (S(c) ? 20 : 0));
  };
  periodic(c, 12, 1, () => healTick(value(c, 'WISPS') + (S(c) ? 5 : 0)));
  if (G(c)) periodic(c, EXTRA_WORKING_DEFAULTS.evilWispDuration, .5, () => {
    for (let wisp = 0; wisp < EXTRA_WORKING_DEFAULTS.evilWispCount; wisp++) {
      const enemies = nearby(c, c.caster, EXTRA_WORKING_DEFAULTS.evilWispRadius);
      if (!enemies.length) break;
      c.damage(enemies[Math.floor(c.random() * enemies.length)], EXTRA_WORKING_DEFAULTS.evilWispDamagePerSecond * .5, 'magical', false);
    }
  });
  if (S(c) && !has(c, c.caster, 'permanentWisps')) { buff(c, c.caster, 'permanentWisps', 1); periodic(c, FOREVER, 1, () => healTick(3)); }
}, ['seeded wisps distribute healing among injured nearby allies', '12-second duration', 'Super extra heal/wisps and permanent three wisps'],
['Exact wisp pulse/cycle distribution', WORKING], { target: 'self', canCast: c => friendlies(c, c.caster, U(value(c, 'RADIUS'))).some(t => t.hp < t.maxHp * .85) || (G(c) && nearby(c, c.caster, EXTRA_WORKING_DEFAULTS.evilWispRadius).length > 0) });

programs.lich_frost_shield = active(c => {
  const target = c.target, duration = value(c, 'BUFF DURATION');
  buff(c, target, 'frostShield', 1, duration + .01);
  buff(c, target, 'attackDamageReduction', P(value(c, 'DAMAGE REDUCTION')) + (S(c) ? .1 : 0), duration);
  if (S(c)) buff(c, target, 'regen', 50, duration);
  for (let i = 1; i <= duration; i++) c.delay(i, () => {
    if (target.dead || !has(c, target, 'frostShield')) return;
    for (const enemy of nearby(c, target, 6)) { c.damage(enemy, value(c, 'DAMAGE') + (G(c) ? target.maxHp * .06 : 0)); debuff(c, enemy, 'slow', P(value(c, 'SLOW')), value(c, 'SLOW DURATION')); }
  });
}, ['attack-only damage reduction', 'target-following ice pulses and slow', 'Super mitigation/regen', 'Gaben target-max-health area damage'],
['Pulse radius missing: 600 reference units provisional', 'Shield expiry boundary pulse ordering'], { target: 'ally' });

programs.custom_grimstroke_ink_swell = active(c => {
  const target = c.target, seconds = value(c, 'BUFF DURATION'), radius = U(value(c, 'RADIUS')) + (S(c) ? 1.5 : 0); let contact = 0;
  buff(c, target, 'inkSwell', 1, seconds + .01); buff(c, target, 'haste', P(value(c, 'MOVEMENT SPEED BONUS')) + (S(c) ? .16 : 0), seconds);
  for (let time = .2; time <= seconds + .001; time += .2) c.delay(time, () => {
    if (target.dead || !has(c, target, 'inkSwell')) return;
    const enemies = nearby(c, target, radius); if (enemies.some(t => !t.summoned)) contact += .2;
    for (const enemy of enemies) {
      const damage = c.damage(enemy, value(c, 'INK TENDRILS DPS') * .2 * (S(c) ? 1.4 : 1));
      if (damage > 0) c.status(enemy, 'visualLink', .21, 0, { source: target.id, dispel: 'none', ignoreStatusResistance: true,
        data: { layer: 'tendril', beneficiaryId: target.id } });
      if (S(c)) c.heal(target, damage * .4);
    }
  });
  c.delay(seconds, () => {
    if (target.dead || !has(c, target, 'inkSwell')) return;
    const fraction = Math.min(1, contact / value(c, 'MAX THRESHOLD DURATION'));
    addVisualWorldEffect(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'burst',
      x: target.x, y: target.y, radius, until: c.battle.time + 16 / 24, kind: 'burst', loop: false });
    for (const enemy of nearby(c, target, radius)) { const damage = c.damage(enemy, value(c, 'MAX DAMAGE') * fraction * (S(c) ? 1.4 : 1)); debuff(c, enemy, 'stun', 0, value(c, 'MAX STUN DURATION') * fraction, { dispel: 'strong' }); if (S(c)) c.heal(target, damage * .4); }
    if (S(c)) c.dispel(target, true);
  });
}, ['frontliner-priority ally targeting with nearest fallback', 'ally haste and following tendril damage', 'contact-time-scaled detonation/stun', 'Super radius/speed/damage/healing and strong dispel'],
['Frontliner means foremost living team depth within .4 world unit, then closest; exact original row classifier remains unverified', 'Super cooldown reduction', 'Gaben two charges'], {
  target: 'ally', range: c => U(value(c, 'CAST RANGE')),
  targetSelector: (c, candidates) => {
    const direction = c.caster.side === 0 ? 1 : -1;
    const frontline = Math.max(...c.allies().map(t => t.y * direction));
    const frontliners = candidates.filter(t => frontline - t.y * direction <= EXTRA_WORKING_DEFAULTS.frontlinerDepthTolerance);
    return ordered(frontliners.length ? frontliners : candidates.filter(t => t.id !== c.caster.id), c.caster)[0] ?? candidates.find(t => t.id === c.caster.id);
  }
});

programs.custom_visage_grave_chill = active(c => {
  const duration = value(c, 'DURATION'), attack = value(c, 'ATTACK SPEED DRAIN'), move = P(value(c, 'MOVE SPEED DRAIN'));
  debuff(c, c.target, 'attackSpeed', -attack, duration); debuff(c, c.target, 'slow', move, duration);
  if (S(c)) debuff(c, c.target, 'disarm', 0, duration);
  const targets = c.allies().filter(t => t.id === c.caster.id || t.owner === c.caster.id || (G(c) && distance(t, c.caster) <= 5));
  for (const ally of targets) { buff(c, ally, 'attackSpeed', attack, duration); buff(c, ally, 'haste', move, duration); }
}, ['target attack/movement-speed drain', 'caster and controlled summon buff', 'Super disarm', 'Gaben nearby allied buff'], ['Super cooldown reduction', 'Controlled-unit distance limit absent']);

programs.custom_chaos_knight_reality_rift = active(c => {
  const dx = c.target.x - c.caster.x, dy = c.target.y - c.caster.y, length = Math.hypot(dx, dy) || 1;
  const pull = G(c) ? Math.max(0, length - .8) : Math.min(length, U(value(c, 'PULL DISTANCE')));
  const x = c.target.x - dx / length * pull, y = c.target.y - dy / length * pull;
  c.teleport(c.target, x, y); c.teleport(c.caster, x - dx / length * .8, y - dy / length * .8);
  for (const image of c.allies().filter(t => t.owner === c.caster.id && !!t.illusion)) c.teleport(image, c.caster.x, c.caster.y);
  debuff(c, c.target, 'armor', -value(c, 'ARMOR REDUCTION') * (G(c) ? 2 : 1), 6, { piercesImmunity: S(c) });
  if (S(c)) {
    // Native localization explicitly relates stun inversely to damage. One
    // seeded draw controls both; AA explicitly grants level 4, not the old 2.
    const roll = c.random(), damage = 150 + roll * 150, stun = 4 - roll * 2;
    c.projectile(c.target, 7, target => {
      c.damage(target, damage, 'magical', false); debuff(c, target, 'stun', 0, stun, { dispel: 'strong', piercesImmunity: false });
      const images = c.summon({ name: '混沌幻象', count: 1, hp: c.caster.maxHp, attack: c.caster.attack, armor: c.caster.armor,
        range: c.caster.range, interval: c.caster.attackInterval, speed: c.caster.moveSpeed, lifetime: 6, illusion: true, damageTaken: 3.25,
        inheritsSkills: true, initializeInherited: true, inheritedMode: 'attackEffects' });
      for (const image of images) { image.strongIllusion = true; c.teleport(image, c.caster.x, c.caster.y); buff(c, image, 'attackTarget', 1, 6, { dispel: 'none', data: { targetId: target.id } }); }
    });
  }
}, ['backline-priority target/caster/owned-image reposition', 'six-second armor reduction', 'Super range/piercing debuff and impact-timed illusion', 'Gaben direct pull and doubled armor reduction'],
['Backline uses furthest team-forward depth, with nearest distance as tie-breaker; midpoint distribution remains a working interpretation', HISTORICAL, 'Illusion inherits passive/attack-effect programs with snapshot deduplication; exact AA allowlist remains unverified', 'Chaos Bolt uses one continuous uniform roll with inverse linear damage/stun; native distribution requires comparison'], {
  range: c => U(value(c, 'CAST RANGE')) + (S(c) ? 5 : 0),
  targetSelector: (c, candidates) => candidates.sort((a, b) => (c.caster.side === 0 ? 1 : -1) * (b.y - a.y) || distance(a, c.caster) - distance(b, c.caster) || a.id.localeCompare(b.id))[0]
});

programs.custom_undying_soul_rip = active(c => {
  const count = Math.min(value(c, 'MAX UNITS'), c.battle.units.filter(t => !t.dead && distance(t, c.caster) <= U(value(c, 'RIP RADIUS'))).length);
  const amount = count * (value(c, 'DAMAGE/HEAL PER UNIT') + (S(c) ? 25 : 0));
  const targets = G(c) ? c.battle.units.filter(t => !t.dead && distance(t, c.target) <= 5) : [c.target];
  for (const target of targets) { if (target.side === c.caster.side) c.heal(target, amount); else c.damage(target, amount); }
}, ['nearby-unit-count scaled heal/damage', 'Super +25 per unit', 'Gaben mixed-team 500-radius effect'],
['Adaptive ally/enemy targeting beyond default ally selection', 'Tombstone special heal', 'Gaben Crimson Guard'], { target: 'ally' });

programs.dazzle_shadow_wave = active(c => {
  const targets = [c.caster], seen = new Set([c.caster.id]); let current = c.target;
  while (targets.length < value(c, 'MAX HEAL TARGETS')) {
    if (!seen.has(current.id)) { targets.push(current); seen.add(current.id); }
    const next = ordered(friendlies(c, current, U(value(c, 'HEAL ARC RADIUS'))).filter(t => !seen.has(t.id)), current)[0];
    if (!next) break; current = next;
  }
  for (const ally of targets) { c.heal(ally, value(c, 'DAMAGE')); if (G(c)) jujuEffect(c, ally, 1, c.skill.id); for (const enemy of nearby(c, ally, U(value(c, 'DAMAGE RADIUS')))) { c.damage(enemy, value(c, 'DAMAGE'), 'physical'); if (S(c)) debuff(c, enemy, 'hex', 0, 2); } }
}, ['bounded ally healing chain including caster', 'physical damage around every healed ally', 'Super hex'], ['Gaben Bad Juju referenced ability/version undefined', 'Chain priority needs reference comparison'], { target: 'ally' });

programs.custom_oracle_fortunes_end = active(c => {
  const center = { x: c.target.x, y: c.target.y }, radius = U(value(c, 'RADIUS'));
  const targets = c.battle.units.filter(t => !t.dead && Math.hypot(t.x - center.x, t.y - center.y) <= radius);
  for (const target of targets) {
    if (S(c)) {
      // Friendly Purifying Flames is nonlethal magical damage. Using the damage
      // primitive retains magic resistance, shields and False Promise handling.
      if (target.side === c.caster.side) buff(c, target, 'undying', 1, .01, { dispel: 'none' });
      c.damage(target, 360);
      if (target.side === c.caster.side) clear(c, target, 'undying');
      buff(c, target, 'regen', 44, 9);
    }
    if (target.side === c.caster.side) c.dispel(target); else { c.dispel(target, false, false); c.damage(target, value(c, 'DAMAGE')); debuff(c, target, 'root', 0, value(c, 'ROOT DURATION')); }
  }
  if (G(c)) c.zone({ x: center.x, y: center.y, radius: 6.5, duration: 10, interval: 1, targets: 'all', effect: target => {
    if (target.side === c.caster.side) { buff(c, target, 'healAmplification', .25, 1.1); c.heal(target, 60); }
    else { debuff(c, target, 'healReduction', .25, 1.1); c.damage(target, 60); }
  } });
}, ['instant area damage/root/enemy purge', 'ally debuff purge', 'Super pre-purge Purifying Flames', 'Gaben healing/damage rain'],
[HISTORICAL, 'Healing-buff dispel interaction and False Promise nonlethal settlement require reference check'], { castPoint: 0 });

programs.custom_shadow_demon_demonic_purge = active(c => {
  const target = c.target, seconds = value(c, 'DURATION');
  debuff(c, target, 'demonicPurge', 1, seconds + .01, { dispel: 'none' }); debuff(c, target, 'break', 0, seconds, { dispel: 'none' });
  for (let time = 0; time <= seconds; time += .25) c.delay(time, () => {
    if (target.dead || !has(c, target, 'demonicPurge')) return;
    c.dispel(target, false, false); debuff(c, target, 'slow', Math.max(.2, 1 - .8 * time / seconds), .3, { dispel: 'none' });
  });
  c.delay(seconds, () => { if (has(c, target, 'demonicPurge')) c.damage(target, value(c, 'PURGE DAMAGE')); });
}, ['continuously strips positive buffs', 'gradually declining slow', 'break', 'expiry damage'],
['Slow min/max absent: linear 100% to 0% provisional', 'Super three charges', 'Gaben separate Demonic Cleanse ability']);

programs.custom_shadow_demon_demonic_cleanse = active(c => {
  const target = c.target, seconds = value(c, 'DURATION'); buff(c, target, 'demonicCleanse', 1, seconds + .01);
  for (let time = 0; time <= seconds; time += .25) c.delay(time, () => { if (!target.dead && has(c, target, 'demonicCleanse')) c.dispel(target); });
  c.delay(seconds, () => { if (has(c, target, 'demonicCleanse')) c.heal(target, value(c, 'CLEANSE HEAL')); });
}, ['continuous allied basic dispel', 'expiry healing'], ['Disrupted/invulnerable ally targeting', 'Super three charges', 'Gaben separate Demonic Purge ability'], { target: 'ally' });

programs.night_stalker_crippling_fear = active(c => c.zone({ follow: true, radius: U(value(c, 'AURA RADIUS')) + (S(c) ? .5 : 0), duration: value(c, 'NIGHT DURATION'), interval: .2, effect: target => {
  debuff(c, target, 'silence', 0, .3); if (S(c)) debuff(c, target, 'blind', .5, .3);
} }), ['mobile silence aura with night-duration values', 'Super radius and miss chance', 'captured AA catalog .1-second cast point overrides older zero-cast-point patch'], ['Super cooldown reduction', 'Gaben periodic level-four Void reference ability'], { target: 'self', castPoint: .1 });

programs.custom_drow_ranger_wave_of_silence = active(c => {
  const dx = c.target.x - c.caster.x, dy = c.target.y - c.caster.y, length = Math.hypot(dx, dy) || 1, range = U(value(c, 'CAST RANGE'));
  for (const target of c.enemies()) {
    const along = ((target.x - c.caster.x) * dx + (target.y - c.caster.y) * dy) / length;
    const across = Math.abs((target.x - c.caster.x) * dy - (target.y - c.caster.y) * dx) / length;
    if (along < 0 || along > range || across > U(value(c, 'WIDTH')) + (S(c) ? 2.5 : 0)) continue;
    const knockback = U(value(c, 'KNOCKBACK MAX')) * (G(c) ? 2 : 1) * Math.max(0, 1 - along / range);
    c.teleport(target, target.x + dx / length * knockback, target.y + dy / length * knockback);
    debuff(c, target, 'silence', 0, value(c, 'SILENCE DURATION')); if (G(c)) debuff(c, target, 'blind', 1, value(c, 'SILENCE DURATION'));
  }
}, ['directional silence wave', 'distance-weighted knockback', 'Super width', 'Gaben double knockback and total miss chance'],
['Continuous knockback duration/path', 'Super cooldown reduction', 'Width vs full diameter reference verification'], { range: 9 });

function goo(c: C, target: CombatUnit) {
  const seconds = value(c, 'DURATION'), allied = target.side === c.caster.side;
  const n = Math.min(S(c) ? 7 : value(c, 'STACK LIMIT'), (target.statuses.find(s => s.kind === 'nasalGoo' && s.source === c.caster.id)?.value ?? 0) + 1);
  c.status(target, 'nasalGoo', seconds, n, { harmful: !allied });
  c.status(target, 'armor', seconds, (value(c, 'BASE ARMOR LOSS') + n * value(c, 'ARMOR LOSS PER STACK')) * (allied ? 1 : -1), { harmful: !allied });
  c.status(target, allied ? 'haste' : 'slow', seconds, P(value(c, 'BASE MOVEMENT SLOW')) + n * P(value(c, 'MOVE SLOW PER STACK')), { harmful: !allied });
}
programs.custom_bristleback_viscous_nasal_goo = active(c => {
  for (const target of S(c) ? nearby(c, c.caster, 7) : [c.target]) goo(c, target);
  if (G(c)) for (const ally of friendlies(c, c.caster, 7)) goo(c, ally);
}, ['refreshing capped armor/slow stacks', 'Super radial application and seven stacks', 'Gaben inverse allied bonuses'],
['Source cast range/AOE omitted: 700 reference units provisional, above historical base 650'], {
  castPoint: 0, targetSelector: (c, candidates) => S(c) ? c.caster : ordered(candidates, c.caster)[0],
  canCast: c => !S(c) || G(c) || nearby(c, c.caster, 7).length > 0
});

function napalm(c: C, target: CombatUnit) {
  const n = Math.min(G(c) ? Number.MAX_SAFE_INTEGER : 10,
    (target.statuses.find(s => s.kind === 'stickyNapalm' && s.source === c.caster.id)?.value ?? 0) + 1);
  debuff(c, target, 'stickyNapalm', n, value(c, 'DURATION'));
  debuff(c, target, 'slow', Math.min(.99, n * P(value(c, 'MOVEMENT SLOW'))), value(c, 'DURATION'));
  c.damage(target, value(c, 'APPLICATION DAMAGE'));
}
programs.batrider_sticky_napalm = active(c => {
  for (const target of nearby(c, c.target, U(value(c, 'RADIUS')))) napalm(c, target);
}, ['stacking area debuff', 'application damage', 'per-stack movement slow', 'owner-only extra damage after actual damage events', 'Super attack application', 'Gaben uncapped stacks and area attack application'],
['Turn-rate slow requires engine turning model', 'Per-ability exclusion/tick rules for extra damage need reference verification'], {
  range: c => U(value(c, 'CAST RANGE')),
  onAttack: c => { if (S(c)) for (const target of G(c) ? nearby(c, c.target, 3.75) : [c.target]) napalm(c, target); },
  onDealDamage: c => {
    if (c.target.dead || c.target.side === c.caster.side || c.triggerSkillId === c.skill.id) return;
    const stacks = c.target.statuses.find(s => s.kind === 'stickyNapalm' && s.source === c.caster.id && s.until > c.battle.time)?.value ?? 0;
    if (stacks) c.damage(c.target, stacks * value(c, 'EXTRA DAMAGE'));
  }
});

programs.ursa_overpower = active(c => { setState(c, 'charges', value(c, 'ATTACKS') + (S(c) ? 3 : 0)); buff(c, c.caster, 'attackSpeed', value(c, 'BONUS ATTACK SPEED')); },
['fixed number of very fast attacks', 'Super three extra attacks', 'Gaben seeded cooldown-limited bash'], ['Buff duration absent from source', 'Bash damage type needs reference verification'], {
  target: 'self', canCast: c => readState(c, 'charges') <= 0, onAttack: c => {
    if (readState(c, 'charges') > 0) { setState(c, 'charges', readState(c, 'charges') - 1); if (!readState(c, 'charges')) clear(c, c.caster, 'attackSpeed'); }
    if (G(c) && c.battle.time >= readState(c, 'bashReady') && chance(c, .25, 'bash')) { setState(c, 'bashReady', c.battle.time + 2.3); c.damage(c.target, 120, 'physical'); debuff(c, c.target, 'stun', 0, 1.5, { dispel: 'strong' }); }
  }
});

programs.custom_earthshaker_enchant_totem = active(c => { buff(c, c.caster, 'enchantTotem', 1); buff(c, c.caster, 'range', .75); },
['one empowered attack', 'temporary bonus range', 'Gaben +60 base attack damage'], ['Super mana cost and cooldown reduction', 'Buff timeout absent from catalog'], {
  target: 'self', castPoint: .3, canCast: c => !has(c, c.caster, 'enchantTotem'),
  init: c => { if (G(c)) c.caster.attack += 60; },
  attackModifier: c => ({ multiplier: has(c, c.caster, 'enchantTotem') ? 1 + P(value(c, 'BONUS')) : 1 }),
  onAttack: c => { if (has(c, c.caster, 'enchantTotem')) { clear(c, c.caster, 'enchantTotem'); clear(c, c.caster, 'range'); } }
});

programs.custom_snapfire_lil_shredder = active(c => { setState(c, 'charges', 6); buff(c, c.caster, 'attackSpeed', value(c, 'BONUS ATTACK SPEED')); buff(c, c.caster, 'range', U(value(c, 'BONUS RANGE'))); },
['six rapid armor-shredding attacks', 'bonus attack range', 'Super own attack damage', 'Gaben two additional targets'],
['Fixed base damage currently replaces via multiplier against raw attack; other attack modifiers require ordering verification', 'Gaben multishot target range omitted: uses current attack range'], {
  target: 'self', canCast: c => readState(c, 'charges') <= 0,
  attackModifier: c => ({ multiplier: readState(c, 'charges') > 0 && !S(c) ? value(c, 'FIXED DAMAGE PER SHOT') / Math.max(1, c.caster.attack) : 1 }),
  onAttack: c => {
    if (readState(c, 'charges') <= 0) return;
    const shred = (target: CombatUnit) => {
      const n = (target.statuses.find(s => s.kind === 'shredderStacks' && s.source === c.caster.id)?.value ?? 0) + 1;
      debuff(c, target, 'shredderStacks', n, value(c, 'ARMOR LOSS DURATION'));
      debuff(c, target, 'armor', -n * value(c, 'ARMOR LOSS PER STACK'), value(c, 'ARMOR LOSS DURATION'));
    };
    shred(c.target);
    if (G(c)) for (const target of ordered(c.enemies().filter(t => t.id !== c.target.id && distance(t, c.caster) <= c.caster.range + U(value(c, 'BONUS RANGE'))), c.target).slice(0, 2)) { c.attack(target, 1, false); shred(target); }
    setState(c, 'charges', readState(c, 'charges') - 1);
    if (!readState(c, 'charges')) { clear(c, c.caster, 'attackSpeed'); clear(c, c.caster, 'range'); }
  }
});

programs.custom_lone_druid_spirit_bear = active(c => {
  const bears = c.summon({ name: '灵熊', count: 1, hp: value(c, 'BEAR HP') + (S(c) ? 1000 : 0), attack: 28,
    armor: value(c, 'BEAR ARMOR') + (S(c) ? 8 : 0), interval: value(c, 'BEAR BASE ATTACK TIME') - (S(c) ? .1 : 0),
    speed: U(value(c, 'BEAR MOVESPEED') + (S(c) ? 25 : 0)), range: 1.5, lifetime: FOREVER });
  for (const bear of bears) {
    bear.extraSpiritBear = true; bear.consideredHero = true; bear.skills = [{ ...c.skill }]; bear.cooldowns = [FOREVER];
    bear.mana = bear.maxMana = 300;
    buff(c, bear, 'regen', value(c, 'BEAR HP REGEN')); buff(c, bear, 'manaRegen', -2.5);
    // No Strength/Agility/Intelligence item bonuses: the AA description excludes attributes.
    if (G(c)) { buff(c, bear, 'attackBonus', 24 + 10 + 25); buff(c, bear, 'attackSpeed', 70 + 10); buff(c, bear, 'lifesteal', .24); }
  }
  setState(c, 'summoned', 1);
}, ['independent bear body with source HP/armor/regen/movement/attack timing', 'Super bear numerical bonuses'],
[HISTORICAL, 'Bear item active AI starts when engaging; native pseudo-random distribution and creep lifesteal penalty require comparison'], {
  target: 'self', canCast: c => !c.caster.extraSpiritBear && !c.allies().some(t => t.owner === c.caster.id && t.name === '灵熊'),
  onAttack: c => {
    if (!c.caster.extraSpiritBear) return;
    if (c.battle.time >= readState(c, 'entangleReady') && c.random() < .2) {
      setState(c, 'entangleReady', c.battle.time + (S(c) ? 0 : 5));
      const duration = sourceArray([1, 1.6, 2.8], c), damage = sourceArray([30, 40, 60], c);
      debuff(c, c.target, 'root', 0, duration, { piercesImmunity: false });
      debuff(c, c.target, 'dot', damage * (c.target.summoned ? 3 : 1), duration, { interval: 1, damageType: 'magical', piercesImmunity: false });
    }
    if (!G(c)) return;
    maelstrom(c, 180, 12);
    if (c.battle.time >= readState(c, 'bashReady') && c.random() < .25) {
      setState(c, 'bashReady', c.battle.time + 2.3); c.damage(c.target, 100, 'physical', true);
      debuff(c, c.target, 'stun', 0, 1.5, { dispel: 'strong', piercesImmunity: true });
    }
    if (canUseGranted(c) && c.battle.time >= readState(c, 'berserkReady') && c.caster.mana >= 25) {
      c.mana(c.caster, -25); setState(c, 'berserkReady', c.battle.time + 16);
      // Passive item stats originate from the summoner; the bear's temporary
      // buff is an additional source and must add only the active 110 AS.
      buff(c, c.caster, 'attackSpeed', 110, 6);
      buff(c, c.caster, 'moveFlat', .3, 6); debuff(c, c.caster, 'armor', -8, 6); debuff(c, c.caster, 'silence', 0, 6);
    }
    if (c.battle.time >= readState(c, 'staticShieldReady') && c.caster.mana >= 50) {
      c.mana(c.caster, -50); setState(c, 'staticShieldReady', c.battle.time + 35); buff(c, c.caster, 'staticShield', 1, 15);
    }
  }, onAttacked: c => {
    if (!G(c) || !c.caster.extraSpiritBear || !has(c, c.caster, 'staticShield') || c.battle.time < readState(c, 'staticReady') || c.random() >= .2) return;
    setState(c, 'staticReady', c.battle.time + 1);
    const others = ordered(nearby(c, c.caster, 9).filter(t => t.id !== c.target.id), c.caster).slice(0, 4);
    for (const target of [c.target, ...others]) c.damage(target, 225, 'magical', false);
  }
});

programs.custom_warlock_chaotic_offering = active(c => {
  for (const enemy of nearby(c, c.target, U(value(c, 'SUMMON BLAST RADIUS')))) debuff(c, enemy, 'stun', 0, 1, { dispel: 'strong' });
  const hp = G(c) ? value(c, 'GOLEM HEALTH') - sourceArray([500, 600, 600], c) : value(c, 'GOLEM HEALTH');
  const golems = c.summon({ name: '地狱火', count: G(c) ? 2 : 1, hp, attack: value(c, 'GOLEM DAMAGE'), armor: value(c, 'GOLEM ARMOR'), lifetime: 60, range: 2.25, speed: sourceArray([3.2, 3.4, 3.6], c), interval: 1.2 });
  for (const golem of golems) {
    golem.magicResist = .33; golem.ancient = true;
    golem.extraOfferingGolem = true; golem.skills = [{ ...c.skill }]; golem.cooldowns = [FOREVER];
    c.teleport(golem, c.target.x, c.target.y); buff(c, golem, 'regen', value(c, 'GOLEM HEALTH REGEN'));
    // AA 4.5 overrides the historical native spell damage; the KV supplies radius/type.
    for (let second = 1; second <= 60; second++) c.delay(second, () => {
      if (!golem.dead) for (const enemy of nearby(c, golem, 3)) c.damage(enemy, sourceArray([20, 40, 60], c), 'magical', false);
    });
  }
}, ['target-area one-second stun', 'sixty-second golem body', 'source HP/armor/regen'],
[HISTORICAL, 'AA GOLEM DAMAGE=0 remains authoritative; Gaben HP reduction uses native scepter absolute HP deltas pending AA verification'], {
  canCast: c => !c.caster.extraOfferingGolem,
  onAttack: c => { if (c.caster.extraOfferingGolem) for (const enemy of nearby(c, c.target, 3)) c.damage(enemy, sourceArray([30, 40, 50], c), 'pure', true); },
  onDeath: c => { if (S(c) && !c.caster.extraOfferingGolem) programs.custom_warlock_chaotic_offering.cast!({ ...c, target: c.caster }); }
});

// Additional transformations and defensive systems. Shared simulation statuses
// implement the damage/targeting contracts; display layers remain independent.
programs.custom_faceless_void_chronosphere = active(c => {
  const x = c.target.x, y = c.target.y;
  c.zone({ x, y, radius: U(value(c, 'RADIUS')), duration: value(c, 'DURATION'), interval: .1, targets: 'all', effect: target => {
    if (target.id === c.caster.id) {
      buff(c, target, 'forceMoveSpeed', EXTRA_WORKING_DEFAULTS.chronoCasterMoveSpeed, .15, { dispel: 'none' });
      if (S(c)) buff(c, target, 'attackSpeed', 200, .15); return;
    }
    if (target.owner === c.caster.id) return;
    if (target.side !== c.caster.side && target.statuses.some(s => s.kind === 'invisible' && s.until > c.battle.time) &&
      !target.statuses.some(s => ['undetectable', 'shadowRealm'].includes(s.kind) && s.until > c.battle.time)) {
      debuff(c, target, 'revealed', 1, .15, { piercesImmunity: true, dispel: 'none', ignoreStatusResistance: true });
    }
    if (G(c) && target.side === c.caster.side) {
      debuff(c, target, 'slow', 1 - 1 / EXTRA_WORKING_DEFAULTS.chronoTimeMultiplier, .15, { piercesImmunity: true, dispel: 'none', ignoreStatusResistance: true });
      debuff(c, target, 'attackTimePct', EXTRA_WORKING_DEFAULTS.chronoTimeMultiplier - 1, .15, { piercesImmunity: true, dispel: 'none', ignoreStatusResistance: true });
      debuff(c, target, 'castTimePct', EXTRA_WORKING_DEFAULTS.chronoTimeMultiplier - 1, .15, { piercesImmunity: true, dispel: 'none', ignoreStatusResistance: true });
    } else debuff(c, target, 'stun', 0, .15, { piercesImmunity: true, dispel: 'none', ignoreStatusResistance: true });
  } });
}, ['stationary time-stop affects enemies and allies', 'caster and controlled units exempt', 'caster moves at a disclosed high speed while inside',
  'reveals normally invisible enemies without overriding undetectable concealment', 'Super in-zone caster attack speed', 'Gaben allies retain slowed actions'],
[WORKING, 'Caster high movement speed uses 1000 reference units/s because the catalog supplies no number',
  'Gaben -550% interpreted as 6.5x slower movement/attack/cast clocks; channel duration remains world-time as a working cast-speed interpretation', 'Time-stop immunity interactions need AA comparison']);

programs.custom_legion_commander_duel = active(c => {
  const seconds = value(c, 'DURATION') + (S(c) ? 1 : 0), externalReduction = G(c) ? .8 : 0;
  buff(c, c.caster, 'duel', 1, seconds, { dispel: 'none', data: { targetId: c.target.id, externalReduction } });
  debuff(c, c.target, 'duel', 1, seconds, { dispel: 'none', data: { targetId: c.caster.id, externalReduction } });
  if ([c.caster, c.target].every(unit => unit.statuses.some(s => s.kind === 'duel' && s.skill === c.skill.id && s.source === c.caster.id))) addVisualWorldEffect(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'challenge', kind: 'burst', x: (c.caster.x + c.target.x) / 2, y: (c.caster.y + c.target.y) / 2, angle: Math.atan2(c.target.y - c.caster.y, c.target.x - c.caster.x), until: c.battle.time + 16 / 24 });
}, ['mutually forced attacks on duel partner', 'both participants cannot cast', 'caster-only duel victory damage reward', 'Super range/duration/reward', 'Gaben outside-source damage reduction'],
['Super cooldown reduction', 'Hero-only selection excludes summon bodies and illusions; considered-hero special bodies need original target-type verification'], {
  init: c => { c.caster.attack += permanentValue(c, 'attack'); },
  range: c => U(value(c, 'CAST RANGE')) + (S(c) ? 2.5 : 0),
  targetSelector: (c, candidates) => ordered(candidates.filter(t => !t.summoned && !t.illusion), c.caster)[0],
  onUnitDeath: c => { const duel = c.caster.statuses.find(s => s.kind === 'duel' && s.skill === c.skill.id && s.source === c.caster.id) as EffectStatus | undefined;
    if (duel?.data?.targetId === c.target.id && duel.until > c.battle.time) {
      const gain = value(c, 'REWARD DAMAGE') + (S(c) ? 10 : 0);
      c.caster.attack += gain; gainPermanent(c, 'attack', gain);
      addVisualWorldEffect(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'victory', kind: 'burst', x: c.caster.x, y: c.caster.y, until: c.battle.time + 28 / 24 });
      clear(c, c.caster, 'duel');
    }
  }
});

programs.oracle_false_promise = active(c => {
  const seconds = value(c, 'DURATION') + (S(c) ? 1.5 : 0);
  c.dispel(c.target, true);
  buff(c, c.target, 'falsePromise', 1, seconds, { data: { healMultiplier: 1 + P(value(c, 'DELAYED HEAL AMPLIFICATION')) }, dispel: 'none' });
  if (S(c)) buff(c, c.target, 'armor', 15, seconds);
  if (G(c)) { buff(c, c.target, 'lifesteal', .25, seconds); buff(c, c.target, 'spellLifesteal', .25, seconds); }
}, ['strong dispel on cast', 'damage and amplified healing settled on expiration', 'Super duration and armor', 'Gaben attack/spell lifesteal statuses'],
['Super cooldown reduction', 'Settlement interactions with immunity, reductions and other death-prevention require reference comparison'],
{ target: 'ally', range: c => U(value(c, 'CAST RANGE')), canCast: c => c.target.hp / c.target.maxHp < .6 && !has(c, c.target, 'falsePromise') });

programs.custom_ember_spirit_flame_guard = active(c => {
  const seconds = value(c, 'DURATION');
  buff(c, c.caster, 'magicShield', value(c, 'MAGIC ABSORB') + (S(c) ? 280 : 0), seconds);
  c.zone({ follow: true, radius: U(value(c, 'RADIUS')), duration: seconds, interval: .2, effect: target => {
    if (has(c, c.caster, 'magicShield')) c.damage(target, (value(c, 'DAMAGE PER SECOND') + (S(c) ? 50 : 0)) * .2);
  } });
}, ['magic-only absorption shield', 'mobile damage stops immediately when shield breaks', 'Super shield and DPS bonuses'],
['Super cooldown reduction', 'Gaben twice-power Radiance item statistics'], { target: 'self', canCast: c => !has(c, c.caster, 'magicShield') });

programs.undying_flesh_golem = active(c => {
  const seconds = value(c, 'DURATION'); buff(c, c.caster, 'fleshGolem', 1, seconds);
  buff(c, c.caster, 'attackRangeOverride', 1.5, seconds); buff(c, c.caster, 'moveFlat', U(value(c, 'MOVEMENT BONUS')), seconds);
  if (typeof c.caster.strength === 'number') buff(c, c.caster, 'strengthPct', P(value(c, 'STRENGTH MULTIPLIER')) + (S(c) ? .1 : 0), seconds);
}, ['forty-second melee transformation', 'movement increase', 'attacks apply slow and incoming-damage amplification'],
['Super zombie body stats absent from catalog', 'Super cooldown reduction', 'AA 5.5 identifies level-four Soul Rip; mapped to Standard points 3 per site FAQ, with attack/attacked triggers from English snapshot'], { target: 'self',
  canCast: c => !c.caster.extraFleshZombie,
  onAttack: c => {
    if (c.caster.extraFleshZombie) {
      debuff(c, c.target, 'slow', .05, 2.5, { maxStacks: 99, piercesImmunity: true });
      if (c.target.hp / c.target.maxHp < .4) { buff(c, c.caster, 'attackSpeed', 80, 2.5); buff(c, c.caster, 'haste', .5, 2.5); }
      return;
    }
    if (G(c) && c.random() < .1) c.castAbility('custom_undying_soul_rip', 3, c.target);
    if (!has(c, c.caster, 'fleshGolem')) return;
    debuff(c, c.target, 'slow', P(value(c, 'SLOW')), value(c, 'SLOW DURATION'));
    debuff(c, c.target, 'damageVulnerability', P(value(c, 'DAMAGE AMPLIFICATION')) + (S(c) ? .1 : 0), value(c, 'SLOW DURATION'));
    if (S(c)) {
      const zombies = c.summon({ name: '僵尸', count: 1, hp: 2, attack: 34.5, armor: 0, range: 1.28, interval: 1.6, speed: 3.75, lifetime: 15 });
      for (const zombie of zombies) {
        zombie.extraFleshZombie = true; zombie.extraZombieTarget = c.target.id;
        zombie.skills = [{ ...c.skill }]; zombie.cooldowns = [FOREVER]; zombie.magicResist = .33;
        c.teleport(zombie, c.target.x + .3, c.target.y);
        buff(c, zombie, 'attackTarget', 1, 15, { dispel: 'none', data: { targetId: c.target.id } });
        buff(c, zombie, 'hitCountBody', 1, 15, { dispel: 'none', data: { heroDamage: 2, basicDamage: 1, immuneSpells: true } });
      }
    }
  }, onAttacked: c => { if (G(c) && !c.caster.extraFleshZombie && c.random() < .1) c.castAbility('custom_undying_soul_rip', 3, c.caster); },
  onUnitDeath: c => { if (c.caster.extraFleshZombie && c.caster.extraZombieTarget === c.target.id) c.caster.expiresAt = c.battle.time; }
});

programs.custom_pudge_flesh_heap = active(c => buff(c, c.caster, 'allDamageBlock', value(c, 'DAMAGE BLOCK') * (G(c) ? 2 : 1), value(c, 'DURATION')),
['temporary flat block against all damage types', 'Super permanent +2 Strength per nearby enemy hero death', 'Gaben doubled block and Strength gain'],
['Base kill credit outside the death radius conflicts with Super wording; using Super explicit 450 radius'], { target: 'self',
init: c => buff(c, c.caster, 'strength', permanentValue(c, 'strength'), FOREVER,
  { skill: `${c.skill.id}:persistent`, passive: false, dispel: 'none' }),
onUnitDeath: c => {
  if (!S(c) || c.target.side === c.caster.side || c.target.summoned || distance(c.target, c.caster) > U(value(c, 'RANGE'))) return;
  const gain = G(c) ? 4 : 2;
  buff(c, c.caster, 'strength', gainPermanent(c, 'strength', gain), FOREVER,
    { skill: `${c.skill.id}:persistent`, passive: false, dispel: 'none' });
} });

programs.custom_windrunner_focusfire = active(c => {
  buff(c, c.caster, 'focusFire', value(c, 'BONUS ATTACK SPEED'), FOREVER,
    { data: { targetId: c.target.id, damageMultiplier: S(c) ? 1 : 1 - P(value(c, 'DAMAGE REDUCTION')) } });
}, ['target-specific bonus attack speed and attack-damage reduction', 'Super removes penalty', 'Gaben target kill resets cooldown'],
['Duration absent from catalog: remains until target dies/battle ends', 'Super Maelstrom', 'Gaben zero mana cost', 'Secondary modifier damage must be excluded from base-attack reduction'], {
  canCast: c => !c.caster.statuses.some(s => s.kind === 'focusFire' && s.skill === c.skill.id && s.until > c.battle.time && !c.battle.units.find(t => t.id === (s as EffectStatus).data?.targetId)?.dead),
  onKill: c => { if (G(c)) { const slot = c.caster.skills.findIndex(s => s?.id === c.skill.id); if (slot >= 0) c.caster.cooldowns[slot] = c.battle.time; } }
});

programs.arc_warden_magnetic_field = active(c => {
  const x = c.target.x, y = c.target.y, radius = U(value(c, 'RADIUS')) + (G(c) ? 2 : 0);
  if (S(c)) for (const enemy of c.enemies().filter(t => Math.hypot(t.x - x, t.y - y) <= radius)) {
    const offsetX = enemy.x - x, offsetY = enemy.y - y, exactCenter = Math.hypot(offsetX, offsetY) < 1e-8;
    const dx = exactCenter ? 1 : offsetX, dy = exactCenter ? 0 : offsetY, length = Math.hypot(dx, dy);
    c.teleport(enemy, x + dx / length * (radius + .4), y + dy / length * (radius + .4));
  }
  c.zone({ x, y, radius, duration: value(c, 'DURATION'), interval: .2, targets: 'all', effect: target => {
    if (target.side === c.caster.side) {
      buff(c, target, 'attackSpeed', value(c, 'ATTACK SPEED BONUS') + (S(c) ? 40 : 0), .3);
      buff(c, target, 'magneticField', P(value(c, 'EVASION BONUS')), .3, { data: { x, y, radius } });
      if (S(c)) buff(c, target, 'magicResist', .4, .3);
      if (G(c)) buff(c, target, 'damageDelay', 2.5, .3);
    } else if (S(c)) debuff(c, target, 'slow', .3, .3);
  } });
}, ['stationary attack-speed field', 'evades only attacks from outside its boundary', 'Super enemy displacement/slow and ally magic resistance', 'Gaben increased radius'],
['Delayed damage mitigation/death-prevention ordering requires reference verification', 'Exact initial area target policy and displacement path'], { target: 'ally' });

programs.muerta_pierce_the_veil = active(c => c.delay(value(c, 'TRANSFORM DURATION'), () => {
  const seconds = value(c, 'DURATION'); buff(c, c.caster, 'physicalImmune', 1, seconds); buff(c, c.caster, 'attackMagical', 1, seconds);
  buff(c, c.caster, 'attackBonus', value(c, 'BONUS ATTACK DAMAGE') + (S(c) ? 100 : 0), seconds);
  if (S(c)) buff(c, c.caster, 'range', 2, seconds);
  c.dispel(c.caster);
}), ['delayed physical immunity', 'attacks become magical', 'attack damage bonus', 'basic dispel', 'Super extra attack damage/range'],
['Phased collision movement', 'Gaben Gunslinger'], { target: 'self' });

programs.slark_shadow_dance = active(c => {
  const seconds = value(c, 'DURATION') + (S(c) ? 1 : 0);
  buff(c, c.caster, 'undetectable', 1, seconds); buff(c, c.caster, 'haste', P(value(c, 'BONUS MOVEMENT SPEED')), seconds);
  buff(c, c.caster, 'regen', value(c, 'HEALTH GAINED PER SECOND'), seconds); if (S(c)) buff(c, c.caster, 'attackSpeed', 50, seconds);
}, ['temporary single-target concealment while still vulnerable to AOE', 'concealment regeneration/movement', 'Super duration and attack speed'],
['Passive out-of-enemy-vision condition requires visibility model', 'Gaben Depth Shroud'], { target: 'self', canCast: c => c.caster.hp / c.caster.maxHp < .6 });

function wolf(c: C, target: CombatUnit) {
  buff(c, target, 'wolfForm', 1); buff(c, target, 'slowImmune', 1); buff(c, target, 'forceMoveSpeed', U(value(c, 'SHAPESHIFT MOVE SPEED')));
  buff(c, target, 'attackRangeOverride', 1.5); buff(c, target, 'critChance', P(value(c, 'CRITICAL CHANCE'))); buff(c, target, 'critMultiplier', P(value(c, 'CRITICAL DAMAGE')));
}
programs.lycan_shapeshift = active(c => {
  wolf(c, c.caster); c.caster.maxHp += value(c, 'HEALTH BONUS'); c.caster.hp += value(c, 'HEALTH BONUS');
  for (const summon of c.allies().filter(t => t.owner === c.caster.id)) {
    buff(c, summon, 'slowImmune', 1); buff(c, summon, 'forceMoveSpeed', U(value(c, 'SHAPESHIFT MOVE SPEED')));
    buff(c, summon, 'critChance', P(value(c, 'CRITICAL CHANCE'))); buff(c, summon, 'critMultiplier', P(value(c, 'CRITICAL DAMAGE')));
  }
  if (S(c)) { const direction = c.caster.side === 0 ? 1 : -1;
    const enemy = c.enemies().sort((a, b) => direction * (b.y - a.y) || distance(a, c.caster) - distance(b, c.caster) || a.id.localeCompare(b.id))[0];
    if (enemy) { const dx = enemy.x - c.caster.x, dy = enemy.y + direction * .8 - c.caster.y, length = Math.hypot(dx, dy) || 1, travel = Math.min(15, length);
      c.teleport(c.caster, c.caster.x + dx / length * travel, c.caster.y + dy / length * travel);
      for (const target of nearby(c, c.caster, 4)) debuff(c, target, 'fear', 0, 1.5);
    }
  }
  if (G(c)) { const ally = ordered(friendlies(c, c.caster, 6).filter(t => t.id !== c.caster.id && !t.summoned && !t.illusion && !has(c, t, 'wolfForm')), c.caster)[0];
    if (ally) { wolf(c, ally); ally.maxHp += value(c, 'HEALTH BONUS'); ally.hp += value(c, 'HEALTH BONUS'); c.caster.extraWolfPartner = ally.id; }
  }
}, ['permanent melee wolf form', 'fixed movement speed and slow immunity', 'critical strikes for caster/existing summons', 'bonus health', 'Super bounded backline teleport/fear', 'Gaben nearby ally transformation'],
[WORKING, 'Backline uses furthest enemy along team-forward axis plus .8 unit clearance; Wolf Bite inherits persistent form/health for this battle'], { target: 'self', castPoint: 0, canCast: c => !has(c, c.caster, 'wolfForm'), init: c => periodic(c, FOREVER, .1, () => {
  if (!has(c, c.caster, 'wolfForm')) return;
  for (const unit of c.allies().filter(t => t.owner === c.caster.id)) {
    buff(c, unit, 'slowImmune', 1, .2); buff(c, unit, 'forceMoveSpeed', U(value(c, 'SHAPESHIFT MOVE SPEED')), .2);
    buff(c, unit, 'critChance', P(value(c, 'CRITICAL CHANCE')), .2); buff(c, unit, 'critMultiplier', P(value(c, 'CRITICAL DAMAGE')), .2);
  }
  const partner = c.allies().find(t => t.id === c.caster.extraWolfPartner);
  if (partner && distance(partner, c.caster) <= EXTRA_WORKING_DEFAULTS.wolfBiteLinkRange) for (const [unit, other] of [[c.caster, partner], [partner, c.caster]]) {
    buff(c, unit, 'lifesteal', EXTRA_WORKING_DEFAULTS.wolfBiteSharedLifesteal, .2);
    buff(c, unit, 'ownerLifesteal', EXTRA_WORKING_DEFAULTS.wolfBiteSharedLifesteal, .2, { data: { ownerId: other.id } });
  }
}) });

programs.custom_lone_druid_spirit_link = passive({ init: c => {
  if (c.caster.illusion) return; // AA 4.5b, 2023-02-04: Spirit Link does not work on illusions.
  periodic(c, FOREVER, .25, () => {
  const summons = c.allies().filter(t => t.owner === c.caster.id && !t.illusion), shared = P(value(c, 'SHARED ARMOR'));
  buff(c, c.caster, 'attackSpeed', value(c, 'BONUS ATTACK SPEED') + (S(c) ? 30 : 0), .35);
  buff(c, c.caster, 'armor', summons.reduce((sum, t) => sum + t.armor, 0) * shared, .35);
  for (const summon of summons) {
    buff(c, summon, 'armor', c.caster.armor * shared, .35); buff(c, summon, 'attackSpeed', value(c, 'BONUS ATTACK SPEED') + (S(c) ? 30 : 0), .35);
    buff(c, summon, 'ownerLifesteal', P(value(c, 'SHARED LIFESTEAL')) + (S(c) ? .2 : 0), .35, { data: { ownerId: c.caster.id } });
  }
}); } }, ['periodic caster/summon shared base armor', 'both receive attack speed', 'summon attack damage heals owner', 'Super lifesteal and attack speed', 'AA 4.5b excludes illusions'],
['Armor-sharing aggregation across multiple summons needs source comparison', 'Gaben level-two True Form statistics']);

programs.custom_skeleton_king_vampiric_aura = active(c => {
  for (let index = 0; index < value(c, 'SKELETONS'); index++) c.delay(index * .25, () => {
    const skeletons = c.summon({ name: '骷髅战士', count: 1, hp: 175 * (S(c) ? 2 : 1), attack: 24.5 + (S(c) ? 24 : 0), armor: 1,
      range: 1.15, speed: 3.5, interval: 1.2, lifetime: value(c, 'SKELETON DURATION') });
    for (const skeleton of skeletons) {
      skeleton.attackMin = 22; skeleton.attackMax = 27;
      skeleton.extraVampiricSkeleton = true; skeleton.skills = [{ ...c.skill }]; skeleton.cooldowns = [FOREVER];
      skeleton.extraSkeletonLives = 0;
      buff(c, skeleton, 'lifesteal', P(value(c, 'LIFESTEAL')), value(c, 'SKELETON DURATION'), { dispel: 'none' });
    }
  });
}, ['attack lifesteal', 'staggered maximum-count skeleton summon', 'seeded 22–27 base attack sampled on every hit before attack bonuses', 'three-second one-time resurrection', 'Super +24 damage and double health', 'Gaben unlimited resurrection and global random-hero level-two Wraithfire Blast'],
[HISTORICAL, 'AA 4.0 damage range 22–27 uses seeded continuous uniform sampling; native discrete/continuous distribution is unverified', 'AA 4.5 overrides level-two Wraithfire stun to .75 seconds; projectile/collision and global target priority need comparison'], {
  target: 'self', castPoint: .1, canCast: c => !c.caster.extraVampiricSkeleton,
  init: c => buff(c, c.caster, 'lifesteal', P(value(c, 'LIFESTEAL')), FOREVER, { dispel: 'none' }),
  onDeath: c => {
    if (!c.caster.extraVampiricSkeleton || c.battle.time >= Number(c.caster.expiresAt) || (!G(c) && Number(c.caster.extraSkeletonLives) >= 1)) return;
    c.caster.extraSkeletonLives = Number(c.caster.extraSkeletonLives) + 1;
    c.revive(c.caster, 3, 1);
    if (G(c)) c.delay(3, () => {
      if (c.caster.dead || c.battle.time >= Number(c.caster.expiresAt)) return;
      const targets = c.enemies().filter(t => !t.summoned && !t.illusion), target = targets[Math.min(targets.length - 1, Math.floor(c.random() * targets.length))];
      if (target) c.projectile(target, 12, unit => {
        c.damage(unit, 90, 'magical', false); debuff(c, unit, 'stun', 0, .75, { dispel: 'strong', piercesImmunity: false });
        c.delay(.75, () => { if (!unit.dead) { debuff(c, unit, 'slow', .2, 2, { piercesImmunity: false }); debuff(c, unit, 'dot', 40, 2, { interval: 1, damageType: 'magical', piercesImmunity: false }); } });
      });
    });
  }
});

programs.custom_troll_warlord_berserkers_rage = active(c => {
  const melee = c.caster.range > 2; buff(c, c.caster, 'berserkersStance', melee ? 1 : 2);
  buff(c, c.caster, 'attackRangeOverride', U(value(c, melee ? 'MELEE ATTACK RANGE' : 'RANGED ATTACK RANGE')));
  if (melee) { buff(c, c.caster, 'armor', value(c, 'BONUS ARMOR')); buff(c, c.caster, 'moveFlat', U(value(c, 'BONUS MOVE SPEED'))); buff(c, c.caster, 'baseAttackTime', value(c, 'MELEE BASE ATTACK TIME')); }
}, ['switches original ranged/melee attack style', 'melee stance movement/armor/base attack time', 'seeded melee ensnare'],
['Super granted Whirling Axes variants', 'Gaben Whirling Axes mana/cooldown/dispels', 'AI currently selects opposite initial style once per battle'], {
  target: 'self', castPoint: 0, canCast: c => !has(c, c.caster, 'berserkersStance'), onAttack: c => {
    if (c.caster.statuses.find(s => s.kind === 'berserkersStance' && s.skill === c.skill.id)?.value === 1 && c.random() < P(value(c, 'ENSNARE CHANCE'))) debuff(c, c.target, 'root', 0, value(c, 'ENSNARE DURATION'));
  }
});

programs.dragon_knight_elder_dragon_form = active(c => {
  buff(c, c.caster, 'elderDragon', 1, value(c, 'DURATION')); buff(c, c.caster, 'moveFlat', U(value(c, 'BONUS MOVE SPEED')), value(c, 'DURATION'));
  if (G(c)) buff(c, c.caster, 'magicResist', .25, value(c, 'DURATION'));
  if (G(c)) buff(c, c.caster, 'freePathing', 1, value(c, 'DURATION'));
}, ['timed dragon transformation state', 'movement bonus', 'level-specific poison/splash/frost attacks', 'Super stronger wider splash', 'Gaben black-dragon numerical effects'],
['Form attack range omitted/zero in catalog', 'Super Fireball', 'Gaben free pathing', 'Splash pre-mitigation damage and poison propagation require ordering verification'], {
  target: 'self', canCast: c => !has(c, c.caster, 'elderDragon'), onAttack: c => {
    if (!has(c, c.caster, 'elderDragon')) return;
    const targets = c.skill.points >= 2 ? nearby(c, c.target, 2.5 + (S(c) ? 1 : 0)) : [c.target];
    for (const target of targets) {
      if (target.id !== c.target.id) c.damage(target, c.caster.attack * (G(c) ? 1 : .6 + (S(c) ? .15 : 0)), 'physical');
      debuff(c, target, 'dot', G(c) ? 30 : 20, 5, { damageType: 'magical', interval: 1 });
      if (c.skill.points >= 3) { debuff(c, target, 'slow', G(c) ? .6 : .4, 3); debuff(c, target, 'attackSpeed', G(c) ? -60 : -40, 3); }
    }
  }
});

programs.gyrocopter_flak_cannon = active(c => {
  setState(c, 'charges', value(c, 'MAX ATTACKS')); buff(c, c.caster, 'flakCannon', 1, 10);
}, ['limited attacks splash independent attacks to all nearby enemies', 'secondary attacks skip attack modifiers', 'Super autonomous furthest-target side gunner', 'Gaben side-gunner flak attacks'],
['Side-gunner and flak interactions with lifesteal/attack immunities require reference verification'], {
  target: 'self', canCast: c => !has(c, c.caster, 'flakCannon') || readState(c, 'charges') <= 0,
  init: c => { if (S(c)) periodic(c, FOREVER, 1.2, () => {
    const target = c.enemies().filter(t => distance(t, c.caster) <= 7).sort((a, b) => distance(b, c.caster) - distance(a, c.caster) || a.id.localeCompare(b.id))[0];
    if (!target) return; c.attack(target, 1, false);
    if (G(c)) for (const other of c.enemies().filter(t => t.id !== target.id && distance(t, c.caster) <= U(value(c, 'RADIUS')))) c.attack(other, 1, false);
  }); },
  onAttack: c => { if (!has(c, c.caster, 'flakCannon') || readState(c, 'charges') <= 0) return;
    for (const target of c.enemies().filter(t => t.id !== c.target.id && distance(t, c.caster) <= U(value(c, 'RADIUS')))) c.attack(target, 1, false);
    setState(c, 'charges', readState(c, 'charges') - 1);
  }
});

programs.custom_dark_willow_shadow_realm = active(c => {
  const seconds = value(c, 'DURATION') + (S(c) ? 2 : 0); setState(c, 'entered', c.battle.time);
  buff(c, c.caster, 'shadowRealm', 1, seconds, { data: { persistOnAttack: G(c) } }); buff(c, c.caster, 'range', U(value(c, 'ATTACK RANGE BONUS')), seconds);
}, ['temporary single-target untargetability', 'bonus attack range', 'charge-time-scaled magical attack bonus', 'Super duration', 'Gaben attacks preserve realm'],
['Super cooldown reduction', 'Untargetability interaction with in-flight projectiles and delayed single-target spells'], {
  target: 'self', canCast: c => !has(c, c.caster, 'shadowRealm'), onAttack: c => {
    if (!has(c, c.caster, 'shadowRealm')) return;
    const fraction = Math.min(1, Math.max(0, (c.battle.time - readState(c, 'entered')) / value(c, 'MAX DAMAGE DURATION')));
    c.damage(c.target, value(c, 'MAX DAMAGE') * fraction);
  }
});

programs.kunkka_tidebringer = passive({ attackModifier: c => {
  const ready = c.battle.time >= readState(c, 'readyAt'); setState(c, 'proc', ready ? 1 : 0);
  return { bonus: ready ? value(c, 'DAMAGE BONUS') : 0 };
}, onAttack: c => {
  if (!readState(c, 'proc')) return; setState(c, 'proc', 0);
  const cooldown = c.definition.cooldowns[Math.min(c.definition.cooldowns.length - 1, Math.max(0, Math.min(2, c.skill.points - 1)))] ?? 0;
  setState(c, 'readyAt', c.battle.time + Math.max(0, cooldown - (S(c) ? 2 : 0)));
  const dx = c.target.x - c.caster.x, dy = c.target.y - c.caster.y, length = Math.hypot(dx, dy) || 1;
  for (const target of c.enemies().filter(t => t.id !== c.target.id)) {
    const along = ((target.x - c.caster.x) * dx + (target.y - c.caster.y) * dy) / length;
    const across = Math.abs((target.x - c.caster.x) * dy - (target.y - c.caster.y) * dx) / length;
    if (along > 0 && along <= U(value(c, 'CLEAVE RANGE')) && across <= .5 + along * .5) c.damage(target, (c.caster.attack + value(c, 'DAMAGE BONUS')) * (P(value(c, 'CLEAVE DAMAGE')) + (G(c) ? 1 : 0)), 'physical');
  }
} }, ['cooldown-limited bonus attack', 'forward cleave without secondary attack modifiers', 'Super cooldown reduction', 'Gaben +100 percentage points cleave'],
['Cleave start/end widths absent: expanding .5+distance/2 half-width provisional', 'Cleave uses raw attack + ability bonus; full pre-mitigation attack snapshot needed']);

const sourceArray = (numbers: number[], c: C) => numbers[Math.min(numbers.length - 1, Math.max(0, Math.min(2, c.skill.points - 1)))] ?? 0;
const superCooldownReduction: Record<string, number> = {
  custom_slark_dark_pact: 1, custom_grimstroke_ink_swell: 5, custom_visage_grave_chill: 3,
  night_stalker_crippling_fear: 5, custom_drow_ranger_wave_of_silence: 3,
  custom_earthshaker_enchant_totem: 1.5, custom_legion_commander_duel: 20,
  oracle_false_promise: 30, custom_ember_spirit_flame_guard: 28, undying_flesh_golem: 30,
  custom_dark_willow_shadow_realm: 2,
};
for (const [id, reduction] of Object.entries(superCooldownReduction)) {
  programs[id].cooldown = c => Math.max(0, sourceArray(c.definition.cooldowns, c) - (S(c) ? reduction : 0));
  programs[id].implemented.push(`Super cooldown shortened by ${reduction} seconds`);
  programs[id].remaining = programs[id].remaining.filter(item => item !== 'Super cooldown reduction');
}
programs.custom_slark_dark_pact.remaining = programs.custom_slark_dark_pact.remaining.map(item => item.replace(' and Super cooldown -1', ''));
programs.custom_earthshaker_enchant_totem.manaCost = c => S(c) ? 0 : sourceArray(c.definition.mana, c);
programs.custom_earthshaker_enchant_totem.castPoint = c => S(c) ? 0 : .3;
programs.custom_earthshaker_enchant_totem.implemented.push('Super zero mana cost and zero cast point');
programs.custom_earthshaker_enchant_totem.remaining = programs.custom_earthshaker_enchant_totem.remaining.filter(item => item !== 'Super mana cost and cooldown reduction');
programs.custom_windrunner_focusfire.manaCost = c => G(c) ? 0 : sourceArray(c.definition.mana, c);
programs.custom_windrunner_focusfire.implemented.push('Gaben zero mana cost');
programs.custom_windrunner_focusfire.remaining = programs.custom_windrunner_focusfire.remaining.filter(item => item !== 'Gaben zero mana cost');

// Item grants retain their historical passive stats as well as their active or
// proc behavior. These are selected factual values, not bundled reference files.
appendInit('custom_beastmaster_inner_beast', c => {
  if (!G(c)) return;
  const totems = c.summon({ name: '怨灵图腾', count: 1, hp: 8, attack: 0, armor: 0, range: 0, interval: 1, speed: 1.5, lifetime: 25 });
  for (const totem of totems) {
    buff(c, totem, 'disarm', 1, 25, { dispel: 'none', passive: false });
    buff(c, totem, 'hitCountBody', 1, 25, { dispel: 'none', passive: false, data: { heroDamage: 2, basicDamage: 1, immuneSpells: true } });
    const center = c.enemies().sort((a, b) => nearby(c, b, 9).length - nearby(c, a, 9).length || distance(a, c.caster) - distance(b, c.caster))[0];
    if (center) {
      const dx = center.x - c.caster.x, dy = center.y - c.caster.y, length = Math.hypot(dx, dy) || 1;
      c.teleport(totem, c.caster.x + dx / length * Math.min(3.5, length), c.caster.y + dy / length * Math.min(3.5, length));
    }
    // A summoned totem persists independently when its original owner dies.
    for (let tick = 1; tick <= 100; tick++) c.delay(tick * .25, () => {
      if (totem.dead) return;
      for (const enemy of nearby(c, totem, 9)) {
        debuff(c, enemy, 'physicalOutputReduction', .3, .35, { passive: false }); c.damage(enemy, 7.5, 'magical', false);
      }
    });
  }
});
programs.custom_beastmaster_inner_beast.implemented.push('Gaben independently destructible historical Wraith Pact totem, 25-second lifetime, 900-radius 30% physical-output reduction and 30 DPS');
programs.custom_beastmaster_inner_beast.remaining = programs.custom_beastmaster_inner_beast.remaining.filter(s => !s.startsWith('Gaben Wraith Pact')).concat(HISTORICAL, 'Totem attack-count reduction (heroes two/basic one) and autonomous movement/optimal initial placement still require AA execution comparison');

appendInit('luna_lunar_blessing', c => {
  if (!G(c)) return;
  buff(c, c.caster, 'strength', 7); buff(c, c.caster, 'intelligence', 7); setState(c, 'drumCharges', 8);
  periodic(c, FOREVER, .1, () => {
    for (const ally of friendlies(c, c.caster, 12)) buff(c, ally, 'moveFlat', .2, .2);
    if (!canUseGranted(c) || !nearby(c, c.caster, 12).length || readState(c, 'drumCharges') <= 0 || c.battle.time < readState(c, 'drumsReady')) return;
    setState(c, 'drumCharges', readState(c, 'drumCharges') - 1); setState(c, 'drumsReady', c.battle.time + 30);
    const round = Number(c.battle.round ?? 1), damage = value(c, 'DAMAGE BONUS') + Math.max(0, round - (c.skill.superRound ?? round)) * 4;
    for (const ally of friendlies(c, c.caster, 12)) { buff(c, ally, 'attackSpeed', damage, 6); buff(c, ally, 'haste', .13, 6); }
  });
});
programs.luna_lunar_blessing.implemented.push('Gaben Bongo Drums passive attributes/movement aura and eight six-second activations every 30 seconds; active attack speed equals current round-scaled Blessing damage');
programs.luna_lunar_blessing.remaining = programs.luna_lunar_blessing.remaining.filter(s => !s.startsWith('Gaben Bongo Drums')).concat(HISTORICAL, 'Independent granted item activation timing and no-cast-action policy require AA comparison');

programs.undying_flesh_golem.implemented.push('Super target-bound fifteen-second zombies with attack-count health, Deathstrike slow and low-health frenzy');
programs.undying_flesh_golem.remaining = programs.undying_flesh_golem.remaining.filter(s => !s.startsWith('Super zombie body')).concat(HISTORICAL, 'Zombie 33–36 damage represented as midpoint 34.5; hit-count health, target binding and Deathstrike movement interpretation require AA comparison');

appendInit('custom_luna_moon_glaive', c => {
  if (!G(c)) return;
  buff(c, c.caster, 'agility', 35); buff(c, c.caster, 'attackSpeed', 30);
  buff(c, c.caster, 'attackBonus', 25); buff(c, c.caster, 'evasion', .35);
});
programs.custom_luna_moon_glaive.implemented.push('Gaben historical Butterfly: 35 Agility, 30 attack speed, 25 damage and 35% evasion');
programs.custom_luna_moon_glaive.remaining = programs.custom_luna_moon_glaive.remaining.filter(s => s !== 'Gaben Butterfly').concat(HISTORICAL);

appendInit('custom_windrunner_focusfire', c => { if (S(c)) buff(c, c.caster, 'attackBonus', 24); });
appendAttack('custom_windrunner_focusfire', c => { if (S(c)) maelstrom(c); });
programs.custom_windrunner_focusfire.range = c => c.caster.statuses.find(s => s.kind === 'attackRangeOverride' && s.until > c.battle.time)?.value ?? c.caster.range + c.caster.statuses.filter(s => s.kind === 'range' && s.until > c.battle.time).reduce((sum, s) => sum + (s.value ?? 0), 0);
programs.custom_windrunner_focusfire.implemented.push('Super Maelstrom +24 damage and 30% four-target 140 magic-damage chain; .2s proc cooldown and .25s jumps', 'AA 4.0 cast range equals attack range');
programs.custom_windrunner_focusfire.remaining = programs.custom_windrunner_focusfire.remaining.filter(s => s !== 'Super Maelstrom').concat(HISTORICAL, 'Maelstrom uses independent project PRD state; exact AA distribution and proc eligibility remain unverified');

appendInit('custom_monkey_king_jingu_mastery', c => {
  if (!S(c)) return;
  buff(c, c.caster, 'strength', 13); buff(c, c.caster, 'intelligence', 10);
  buff(c, c.caster, 'attackBonus', 15); buff(c, c.caster, 'attackSpeed', 10); buff(c, c.caster, 'manaRegen', 1.75);
});
appendAttack('custom_monkey_king_jingu_mastery', c => {
  if (!S(c) || effectiveRange(c) > 2 || c.battle.time < readState(c, 'echoReady')) return;
  setState(c, 'echoReady', c.battle.time + 6);
  debuff(c, c.target, 'slow', 1, .8);
  // Item native scripts are not in KV: second strike is explicit and bounded,
  // with its exact interval and modifier inheritance retained as unresolved.
  c.delay(EXTRA_WORKING_DEFAULTS.echoSecondStrikeDelay, () => {
    if (c.caster.dead || c.target.dead) return;
    c.attack(c.target, 1, true); debuff(c, c.target, 'slow', 1, .8);
  });
});
programs.custom_monkey_king_jingu_mastery.implemented.push('Super historical Echo Sabre attributes, six-second melee double attack and .8s slow');
programs.custom_monkey_king_jingu_mastery.remaining = programs.custom_monkey_king_jingu_mastery.remaining.filter(s => s !== 'Super Echo Sabre').concat(HISTORICAL, 'Echo Sabre second-strike interval and attack-modifier inheritance absent from KV; immediate nonrecursive strike is provisional');
appendInit('custom_monkey_king_jingu_mastery', c => {
  if (!G(c) || c.caster.extraJinguSoldier) return;
  periodic(c, FOREVER, 2, () => {
    const attack = (c.caster.attack + (readState(c, 'charges') > 0 ? value(c, 'BONUS DAMAGE') + 130 : 0) + c.caster.statuses.filter(s => s.kind === 'attackBonus' && s.until > c.battle.time).reduce((sum, s) => sum + (s.value ?? 0), 0)) *
      (1 + c.caster.statuses.filter(s => s.kind === 'attackPct' && s.until > c.battle.time).reduce((sum, s) => sum + (s.value ?? 0), 0));
    const template = { ...c.caster, skills: c.caster.skills.filter(skill => !!skill && JINGU_ATTACK_EFFECT_IDS.has(skill.id)) };
    const soldiers = c.summon({ name: '石猴战士', count: 1, hp: 1, attack, armor: 0, range: effectiveRange(c) + 4, interval: 1.2, speed: 0,
      lifetime: EXTRA_WORKING_DEFAULTS.soldierLifetime, template, inheritsSkills: true, initializeInherited: true,
      inheritedMode: 'attackEffects', attackSnapshotIncludesBonuses: true });
    const angle = readState(c, 'soldierCount') * Math.PI / 3; setState(c, 'soldierCount', readState(c, 'soldierCount') + 1);
    for (const soldier of soldiers) {
      soldier.extraJinguSoldier = true; c.teleport(soldier, c.caster.x + Math.cos(angle) * EXTRA_WORKING_DEFAULTS.soldierSpawnOffset, c.caster.y + Math.sin(angle) * EXTRA_WORKING_DEFAULTS.soldierSpawnOffset);
      buff(c, soldier, 'invulnerable', 1, EXTRA_WORKING_DEFAULTS.soldierLifetime, { dispel: 'none', passive: false });
    }
  });
});

appendInit('custom_ember_spirit_flame_guard', c => {
  if (!G(c)) return;
  c.zone({ follow: true, radius: EXTRA_WORKING_DEFAULTS.radianceRadius, duration: FOREVER, interval: .25, effect: target => {
    if (c.caster.statuses.some(s => s.kind === 'break' && s.until > c.battle.time)) return;
    c.damage(target, EXTRA_WORKING_DEFAULTS.radianceDamagePerSecond * .25, 'magical', false);
    debuff(c, target, 'blind', EXTRA_WORKING_DEFAULTS.radianceBlind, .35);
  } });
});
appendAttack('muerta_pierce_the_veil', c => {
  if (!G(c) || readState(c, 'gunslingerSecondary') || c.caster.illusion || c.caster.statuses.some(s => s.kind === 'break' && s.until > c.battle.time) || c.random() >= EXTRA_WORKING_DEFAULTS.gunslingerChance) return;
  const range = c.caster.statuses.find(s => s.kind === 'attackRangeOverride' && s.until > c.battle.time)?.value ?? c.caster.range + c.caster.statuses.filter(s => s.kind === 'range' && s.until > c.battle.time).reduce((n, s) => n + (s.value ?? 0), 0);
  const alternatives = ordered(nearby(c, c.caster, range).filter(t => t.id !== c.target.id && !t.statuses.some(s => ['undetectable', 'shadowRealm'].includes(s.kind) && s.until > c.battle.time)), c.caster);
  const target = alternatives[0] ?? c.target;
  setState(c, 'gunslingerSecondary', 1); try { c.attack(target, 1, true); } finally { setState(c, 'gunslingerSecondary', 0); }
});

appendInit('enchantress_impetus', c => {
  if (!S(c)) return; buff(c, c.caster, 'statBonus', 5); buff(c, c.caster, 'attackBonus', 10);
});
appendAttack('enchantress_impetus', c => {
  if (!S(c) || effectiveRange(c) <= 2 || c.battle.time < readState(c, 'arrayReady')) return;
  const targets = ordered(c.enemies().filter(t => t.id !== c.target.id && distance(t, c.caster) <= effectiveRange(c)), c.caster).slice(0, 2);
  if (!targets.length) return;
  setState(c, 'arrayReady', c.battle.time + 12);
  for (const target of targets) c.attack(target, 1, false);
});
programs.enchantress_impetus.implemented.push('Super historical Specialists Array +5 attributes/+10 damage and two secondary ranged attacks every 12 seconds');
programs.enchantress_impetus.remaining = programs.enchantress_impetus.remaining.filter(s => s !== 'Specialist Array exact item effect').concat(HISTORICAL, 'Historical native localization confirms ranged-only Array secondary attacks do not trigger attack modifiers');

appendInit('night_stalker_crippling_fear', c => {
  if (!G(c)) return;
  periodic(c, FOREVER, 4, () => {
    for (const target of nearby(c, c.caster, 5.5)) {
      c.damage(target, 320, 'magical', false); debuff(c, target, 'stun', 0, EXTRA_WORKING_DEFAULTS.voidMinistun, { dispel: 'strong', piercesImmunity: false });
      debuff(c, target, 'slow', .5, 4, { piercesImmunity: false });
      debuff(c, target, 'attackSpeed', -50, 4, { piercesImmunity: false });
    }
  });
});
programs.night_stalker_crippling_fear.implemented.push('Gaben level-four Void every four seconds in 550 radius: 320 magical damage, night-duration four-second 50% move/-50 attack slow');
programs.night_stalker_crippling_fear.remaining = programs.night_stalker_crippling_fear.remaining.filter(s => s !== 'Gaben periodic level-four Void reference ability').concat(HISTORICAL, 'Native Void normal ministun is not present in KV; not confused with scepter_ministun=1');

appendInit('custom_undying_soul_rip', c => {
  if (!G(c)) return;
  c.caster.maxHp += 250; c.caster.hp += 250; buff(c, c.caster, 'regen', 12); buff(c, c.caster, 'armor', 8);
  periodic(c, FOREVER, .1, () => {
    if (!has(c, c.caster, 'crimsonActive')) buff(c, c.caster, 'attackDamageBlock', c.caster.range > 2 ? 50 : 75, .2, { data: { chance: .6 } });
    if (!canUseGranted(c) || c.battle.time < readState(c, 'crimsonReady') || !nearby(c, c.caster, 12).length) return;
    setState(c, 'crimsonReady', c.battle.time + 35);
    for (const ally of friendlies(c, c.caster, 12)) {
      buff(c, ally, 'crimsonActive', 1, 12); buff(c, ally, 'attackDamageBlock', 75, 12, { data: { chance: 1 } });
    }
  });
});
programs.custom_undying_soul_rip.implemented.push('Gaben historical Crimson Guard +250 HP/+12 regeneration/+8 armor, chance-based self block and 12-second allied guaranteed 75 physical attack block');
programs.custom_undying_soul_rip.remaining = programs.custom_undying_soul_rip.remaining.filter(s => s !== 'Gaben Crimson Guard').concat(HISTORICAL, 'Item first-use AI and native multi-source reapplication exclusion require comparison');

child('dragon_knight_fireball', ['RADIUS: 350', 'DAMAGE: 75', 'DURATION: 8', 'LINGER: 2'], 20, 100, {
  target: 'enemy', castPoint: .2,
  range: c => c.caster.statuses.some(s => s.kind === 'elderDragon' && s.until > c.battle.time) ? 14 : 6,
  cast: c => {
    c.zone({ x: c.target.x, y: c.target.y, radius: 3.5, duration: 8, interval: .5, effect: unit => {
      debuff(c, unit, 'fireballBurn', 1, 2.01);
      // Independent from dragon poison: native lingering burn must not replace it.
      // The target's timers must also remain independent across different casters.
      const lastDamageKey = `${stateKey(c, 'fireballLastDamage')}:${c.caster.id}`;
      const generationKey = `${stateKey(c, 'fireballGeneration')}:${c.caster.id}`;
      const burn = () => {
        if (Number(unit[lastDamageKey] ?? -1) > c.battle.time - .25) return;
        unit[lastDamageKey] = c.battle.time; c.damage(unit, 37.5, 'magical', false);
      };
      burn();
      const generation = Number(unit[generationKey] ?? 0) + 1;
      unit[generationKey] = generation;
      for (const delay of [.5, 1, 1.5, 2]) c.delay(delay, () => {
        if (!unit.dead && has(c, unit, 'fireballBurn') && Number(unit[generationKey]) === generation) burn();
      });
    } });
  },
  implemented: ['independently queued Fireball with native mana/cooldown/cast point', 'form-sensitive range and persistent 75 DPS field with two-second linger'],
  remaining: [HISTORICAL, 'Area first/last tick phase requires reference comparison'],
});
appendInit('dragon_knight_elder_dragon_form', c => { if (S(c)) grantSlot(c, 'dragon_knight_fireball', 1); });
programs.dragon_knight_elder_dragon_form.implemented.push('Super independent Fireball: 100 mana/20s cooldown, form-sensitive range, 350-radius eight-second 75 DPS field with two-second linger');
programs.dragon_knight_elder_dragon_form.remaining = programs.dragon_knight_elder_dragon_form.remaining.filter(s => s !== 'Super Fireball').concat(HISTORICAL, 'Fireball first/last tick phase requires AA reference comparison');

appendInit('custom_troll_warlord_berserkers_rage', c => {
  if (!S(c)) return;
  c.caster.extraAxesGaben = G(c);
  grantSlot(c, 'troll_warlord_whirling_axes_melee', 4); grantSlot(c, 'troll_warlord_whirling_axes_ranged', 4);
});
const axeStance = (c: C) => c.caster.statuses.find(s => s.kind === 'berserkersStance' && s.until > c.battle.time)?.value;
child('troll_warlord_whirling_axes_melee', ['DAMAGE: 200', 'MAX RANGE: 450', 'BLIND: 60', 'BLIND DURATION: 5'], 9, 50, {
  target: 'self', castPoint: 0,
  cooldown: c => c.caster.extraAxesGaben ? 4 : 9, manaCost: c => c.caster.extraAxesGaben ? 25 : 50,
  canCast: c => axeStance(c) === 1 && nearby(c, c.caster, 4.5).length > 0,
  cast: c => {
      if (c.caster.extraAxesGaben) c.dispel(c.caster);
      const hit = new Set<string>();
      c.zone({ follow: true, radius: 4.5, duration: 3, interval: .1, visualLayer: 'axe_melee', effect: target => {
        if (hit.has(target.id)) return; hit.add(target.id); c.damage(target, 200, 'magical', false); debuff(c, target, 'blind', .6, 5, { piercesImmunity: false });
      } });
  },
  implemented: ['independent melee Whirling Axes action and resource ledger', 'once-per-target damage/blind', 'AA Gaben 4s/25 mana and self basic dispel'],
  remaining: [HISTORICAL, 'Melee orbital paths use a once-per-target 450 radius envelope'],
});
child('troll_warlord_whirling_axes_ranged', ['DAMAGE: 90', 'RANGE: 950', 'SLOW: 40', 'SLOW DURATION: 4'], 9, 60, {
  target: 'enemy', range: 9.5, castPoint: .2,
  cooldown: c => c.caster.extraAxesGaben ? 4 : 9, manaCost: c => c.caster.extraAxesGaben ? 25 : 60,
  canCast: c => axeStance(c) === 2,
  cast: c => {
      const targets = nearby(c, c.caster, 9.5), facing = Math.atan2(c.target.y - c.caster.y, c.target.x - c.caster.x);
      for (const target of targets) {
        const bearing = Math.atan2(target.y - c.caster.y, target.x - c.caster.x), difference = Math.atan2(Math.sin(bearing - facing), Math.cos(bearing - facing));
        if (Math.abs(difference) > 25 / 2 * Math.PI / 180 + Math.atan2(1, Math.max(.01, distance(target, c.caster)))) continue;
        c.projectile(target, 15, unit => { if (c.caster.extraAxesGaben) c.dispel(unit, false, false); c.damage(unit, 90, 'magical', false); debuff(c, unit, 'slow', .4, 4, { piercesImmunity: false }); });
      }
  },
  implemented: ['independent ranged Whirling Axes action and resource ledger', 'traveling fan damage/slow', 'AA Gaben 4s/25 mana and enemy basic dispel'],
  remaining: [HISTORICAL, 'Native five projectile paths approximated by a 25-degree total fan and target tracking'],
});
programs.custom_troll_warlord_berserkers_rage.implemented.push('Super form-specific independent Whirling Axes with source mana/cooldown/damage/debuffs', 'Gaben four-second cooldown/25 mana and enemy/self basic dispels');
programs.custom_troll_warlord_berserkers_rage.remaining = programs.custom_troll_warlord_berserkers_rage.remaining.filter(s => !s.startsWith('Super granted') && !s.startsWith('Gaben Whirling')).concat(HISTORICAL, 'Ranged axes fan uses 25-degree total spread; melee orbital paths use a once-per-target radius envelope; granted max basic level requires AA verification');

child('slark_depth_shroud', ['RADIUS: 250', 'DURATION: 3'], 75, 75, {
  target: 'ally', range: 8, castPoint: .1,
  canCast: c => c.target.hp < c.target.maxHp * .75 && !c.target.statuses.some(s => s.kind === 'undetectable' && s.until > c.battle.time),
  cast: c => c.zone({ x: c.target.x, y: c.target.y, radius: 2.5, duration: 3, interval: .1, targets: 'allies', effect: target => {
    buff(c, target, 'undetectable', 1, .15); buff(c, target, 'haste', Number(c.caster.depthShroudHaste ?? .48), .15);
    buff(c, target, 'regen', Number(c.caster.depthShroudRegen ?? 120), .15);
    buff(c, target, 'attackSpeed', Number(c.caster.depthShroudAttackSpeed ?? 0), .15);
  } }),
  implemented: ['independent queued point cast, mana, cooldown and .1s cast point', 'three-second stationary allied concealment field', 'parent AA Shadow Dance recovery/movement effects'],
  remaining: [HISTORICAL, 'Shadow Dance Super attack-speed inheritance and aura boundary linger use explicit working interpretation'],
});
appendInit('slark_shadow_dance', c => {
  if (!G(c)) return;
  c.caster.depthShroudHaste = P(value(c, 'BONUS MOVEMENT SPEED')); c.caster.depthShroudRegen = value(c, 'HEALTH GAINED PER SECOND'); c.caster.depthShroudAttackSpeed = 50;
  grantSlot(c, 'slark_depth_shroud', 1);
});
programs.slark_shadow_dance.implemented.push('Gaben combat-only Depth Shroud with independent mana/cooldown/targeting and shared action queue');
programs.slark_shadow_dance.remaining = programs.slark_shadow_dance.remaining.filter(s => s !== 'Gaben Depth Shroud').concat(HISTORICAL, 'Depth Shroud ally eligibility and Super inheritance need AA reference comparison');

child('lone_druid_true_form', ['BONUS ARMOR: 10', 'BONUS HP: 1000', 'DURATION: 40'], 100, 200, {
  target: 'self', castPoint: 0,
  canCast: c => !has(c, c.caster, 'trueForm') && nearby(c, c.caster, 12).length > 0,
  cast: c => {
    buff(c, c.caster, 'trueForm', 1, 40, { dispel: 'none' }); buff(c, c.caster, 'armor', 10, 40, { dispel: 'none' });
    buff(c, c.caster, 'attackRangeOverride', 1.5, 40, { dispel: 'none' }); buff(c, c.caster, 'baseAttackTime', 1.7, 40, { dispel: 'none' });
    buff(c, c.caster, 'magicResist', .33, 40, { dispel: 'none' }); c.caster.maxHp += 1000; c.caster.hp += 1000;
    c.delay(40, () => { c.caster.maxHp -= 1000; c.caster.hp = Math.min(c.caster.hp, c.caster.maxHp); });
  },
  onAttack: c => {
    if (!has(c, c.caster, 'trueForm') || c.battle.time < readState(c, 'heroEntangleReady') || c.random() >= .3) return;
    setState(c, 'heroEntangleReady', c.battle.time + 5);
    debuff(c, c.target, 'root', 0, 2.8); debuff(c, c.target, 'dot', 60 * (c.target.summoned ? 3 : 1), 2.8, { interval: 1, damageType: 'magical' });
  },
  implemented: ['independent queued level-two True Form at 200 mana/100s cooldown', 'forty-second +1000 HP/+10 armor melee form and 1.7 BAT', 'historical Demolish spell resistance and hero Entangle'],
  remaining: [HISTORICAL, 'AA 4.5b zero transformation timing overrides native 1.933 seconds; exact Entangle granted level and melee range require comparison', 'Building damage has no targets in the flat arena'],
});
appendInit('custom_lone_druid_spirit_link', c => { if (G(c) && !c.caster.illusion) grantSlot(c, 'lone_druid_true_form', 2); });
programs.custom_lone_druid_spirit_link.implemented.push('Gaben independent combat-only level-two True Form without consuming a purchased skill slot');
programs.custom_lone_druid_spirit_link.remaining = programs.custom_lone_druid_spirit_link.remaining.filter(s => s !== 'Gaben level-two True Form statistics').concat(HISTORICAL, 'Granted True Form Entangle level and HP loss on expiry require AA comparison');

child('enchantress_bunny_hop', ['HOP DISTANCE: 500', 'HOP DURATION: .4', 'ATTACK TARGETS: 3', 'BONUS ATTACK RANGE: 200'], 4, 50, {
  target: 'self', castPoint: 0,
  canCast: c => nearby(c, c.caster, effectiveRange(c) + 2).length > 0,
  cast: c => {
    c.disjoint(c.caster);
    const range = c.caster.statuses.find(s => s.kind === 'attackRangeOverride' && s.until > c.battle.time)?.value ?? c.caster.range + c.caster.statuses.filter(s => s.kind === 'range' && s.until > c.battle.time).reduce((n, s) => n + (s.value ?? 0), 0);
    const targets = nearby(c, c.caster, range + 2).filter(t => !t.statuses.some(s => ['undetectable', 'shadowRealm', 'magicImmune'].includes(s.kind) && s.until > c.battle.time))
      .sort((a, b) => distance(b, c.caster) - distance(a, c.caster) || a.id.localeCompare(b.id)).slice(0, 3);
    for (const target of targets) {
      const x = target.x, y = target.y, dx = x - c.caster.x, dy = y - c.caster.y, length = Math.hypot(dx, dy) || 1;
      debuff(c, target, 'stun', 0, .4, { dispel: 'none', piercesImmunity: false });
      for (let step = 1; step <= 8; step++) c.delay(step * .05, () => { if (!target.dead) c.teleport(target, x + dx / length * 5 * step / 8, y + dy / length * 5 * step / 8); });
      c.delay(.4, () => {
        if (c.caster.dead || target.dead) return;
        c.caster.extraFreeImpetus = true; try { c.attack(target, 1, true); } finally { c.caster.extraFreeImpetus = false; }
      });
    }
  },
  implemented: ['queued Sproink at 50 mana/four-second cooldown', 'disjoints incoming projectiles', 'three furthest-target .4s enemy knockbacks and Impetus attacks'],
  remaining: [HISTORICAL, WORKING, 'Working choice: retains native self disjoint, no extra orb mana, and normal attack modifiers; excludes concealed/magic-immune targets'],
});
appendInit('enchantress_impetus', c => { if (G(c)) grantSlot(c, 'enchantress_bunny_hop', 1); });

function jujuEffect(c: C, target: CombatUnit, sign: number, triggerSkillId = c.triggerSkillId) {
  if (!G(c) || !triggerSkillId || triggerSkillId === 'dazzle_bad_juju' || target.dead) return;
  const cast = [...c.battle.events].reverse().find(e => e.type === 'cast' && e.source === c.caster.id && e.skill === triggerSkillId);
  const token = cast ? `${triggerSkillId}:${cast.time}` : `${triggerSkillId}:${Math.floor(c.battle.time * 10)}`;
  const key = `${c.skill.id}:juju:${target.id}:${triggerSkillId}`;
  if (c.caster[key] === token) return; c.caster[key] = token;
  c.status(target, 'badJuju', EXTRA_WORKING_DEFAULTS.badJujuDuration, 1, { harmful: sign < 0, dispel: 'none', maxStacks: 100, piercesImmunity: false });
  c.status(target, 'armor', EXTRA_WORKING_DEFAULTS.badJujuDuration, sign * EXTRA_WORKING_DEFAULTS.badJujuArmorPerStack, { harmful: sign < 0, dispel: 'none', maxStacks: 100, piercesImmunity: false });
}
child('dazzle_bad_juju', ['RADIUS: 1200', 'DAMAGE/HEAL PER STACK: 60'], 15, 100, {
  target: 'self', castPoint: .2,
  canCast: c => [...c.enemies(), ...c.allies()].some(t => distance(t, c.caster) <= 12 && t.statuses.some(s => s.kind === 'badJuju' && s.source === c.caster.id && s.until > c.battle.time)),
  cast: c => {
    for (const unit of [...c.enemies(), ...c.allies()].filter(t => distance(t, c.caster) <= 12)) {
      const stacks = unit.statuses.filter(s => s.kind === 'badJuju' && s.source === c.caster.id && s.until > c.battle.time).length;
      if (unit.side === c.caster.side) c.heal(unit, stacks * EXTRA_WORKING_DEFAULTS.badJujuDamagePerStack); else c.damage(unit, stacks * EXTRA_WORKING_DEFAULTS.badJujuDamagePerStack, 'physical', false);
    }
  },
  implemented: ['independent max-level historical Bad Juju active', 'physical damage/allied healing scaled by existing armor stacks'],
  remaining: [HISTORICAL, WORKING, 'Chosen 2023 active version, once per affected target per actual spell cast; active preserves existing stacks'],
});
appendInit('dazzle_shadow_wave', c => { if (G(c)) grantSlot(c, 'dazzle_bad_juju', EXTRA_WORKING_DEFAULTS.badJujuLevel); });
programs.dazzle_shadow_wave.onHeal = c => jujuEffect(c, c.target, 1);
programs.dazzle_shadow_wave.onDealDamage = c => jujuEffect(c, c.target, -1);
programs.dazzle_shadow_wave.onCast = c => {
  const cast = [...c.battle.events].reverse().find(e => e.type === 'cast' && e.source === c.caster.id);
  if (!cast || !c.battle.events.some(e => (e.type === 'heal' || e.type === 'hit') && e.source === c.caster.id && e.target === c.target.id && e.time >= cast.time)) jujuEffect(c, c.target, c.target.side === c.caster.side ? 1 : -1);
};

/** Charged abilities restore charges sequentially using their own recharge timer.
 * Cast-point/backswing still apply to each use; charges do not bypass mana. */
function charged(id: string, unlocked: (c: C) => boolean, maximum: number) {
  const program = programs[id], cast = program.cast!, init = program.init, canCast = program.canCast;
  const cooldown = program.cooldown ?? ((c: C) => sourceArray(c.definition.cooldowns, c));
  program.init = c => { init?.(c); if (unlocked(c)) setState(c, 'availableCharges', maximum); };
  program.canCast = c => (!unlocked(c) || readState(c, 'availableCharges') > 0) && (!canCast || canCast(c));
  program.cooldown = c => unlocked(c) ? 0 : cooldown(c);
  program.cast = c => {
    if (unlocked(c)) {
      if (readState(c, 'availableCharges') <= 0) return;
      setState(c, 'availableCharges', readState(c, 'availableCharges') - 1);
      const reduction = Math.min(.9, Math.max(0, c.caster.statuses.filter(s => s.kind === 'cooldownReduction' && s.until > c.battle.time).reduce((sum, s) => sum + (s.value ?? 0), 0)));
      const due = Math.max(c.battle.time, readState(c, 'chargeReady')) + cooldown(c) * (1 - reduction);
      setState(c, 'chargeReady', due);
      c.delay(due - c.battle.time, () => setState(c, 'availableCharges', Math.min(maximum, readState(c, 'availableCharges') + 1)));
    }
    cast(c);
  };
  program.implemented.push(`${maximum} charges with sequential source cooldown recharge`);
}
charged('custom_grimstroke_ink_swell', G, 2);
charged('custom_shadow_demon_demonic_purge', S, 3);
charged('custom_shadow_demon_demonic_cleanse', S, 3);
programs.custom_grimstroke_ink_swell.remaining = programs.custom_grimstroke_ink_swell.remaining.filter(s => s !== 'Gaben two charges');
for (const parentId of ['custom_shadow_demon_demonic_purge', 'custom_shadow_demon_demonic_cleanse']) {
  const grantsCleanse = parentId.endsWith('_purge'), effectId = grantsCleanse ? 'custom_shadow_demon_demonic_cleanse' : 'custom_shadow_demon_demonic_purge';
  const grantedId = grantsCleanse ? 'extra_granted_demonic_cleanse' : 'extra_granted_demonic_purge';
  const maximum = grantsCleanse ? EXTRA_WORKING_DEFAULTS.grantedCleanseCharges : EXTRA_WORKING_DEFAULTS.grantedPurgeCharges;
  child(grantedId, [], 0, grantsCleanse ? 50 : 200, {
    target: grantsCleanse ? 'ally' : 'enemy', range: 7, castPoint: .3,
    init: c => setState(c, 'charges', maximum), cooldown: () => 0,
    canCast: c => readState(c, 'charges') > 0 && !c.target.statuses.some(s => s.kind === (grantsCleanse ? 'demonicCleanse' : 'demonicPurge') && s.until > c.battle.time) &&
      (!grantsCleanse || c.target.hp < c.target.maxHp || c.target.statuses.some(s => (s as EffectStatus).harmful && s.until > c.battle.time)),
    cast: c => {
      if (readState(c, 'charges') <= 0) return;
      setState(c, 'charges', readState(c, 'charges') - 1);
      const reduction = Math.min(.9, Math.max(0, c.caster.statuses.filter(s => s.kind === 'cooldownReduction' && s.until > c.battle.time).reduce((sum, s) => sum + (s.value ?? 0), 0)));
      const due = Math.max(c.battle.time, readState(c, 'chargeReady')) + 60 * (1 - reduction);
      setState(c, 'chargeReady', due); c.delay(due - c.battle.time, () => setState(c, 'charges', Math.min(maximum, readState(c, 'charges') + 1)));
      c.castAbility(effectId, 3, c.target);
    },
    implemented: ['separate granted cast action/mana ledger', `${maximum} sequential charges with cooldown reduction`, 'standard parent definition retained for damage/healing and duration'],
    remaining: [WORKING, 'Granted level 3/700 range/.3 cast point chosen; Cleanse has three charges, granted Purge one charge'],
  });
  appendInit(parentId, c => { if (G(c)) grantSlot(c, grantedId, 1); });
  programs[parentId].implemented.push(`Gaben independent queued ${grantsCleanse ? 'three-charge Cleanse at 50 mana' : 'one-charge Purge at 200 mana'}`);
  programs[parentId].remaining = programs[parentId].remaining.filter(s => !s.startsWith('Super three') && !s.startsWith('Gaben separate')).concat(WORKING);
}

// Each formerly missing upgrade now has an executable mechanism. Defaults are
// centralized, and this metadata deliberately separates execution from parity.
const completedWithWorkingDefaults: Record<string, { implemented: string[]; remaining: string[] }> = {
  vengefulspirit_command_aura: { implemented: ['Gaben initializes copied active/passive abilities with snapshot stat deduplication'], remaining: ['Exact AA strong-illusion ability allowlist and permanent-gain ownership remain reference-sensitive'] },
  enchantress_impetus: { implemented: ['Gaben independently queued Sproink with three furthest targets, continuous enemy knockback, self disjoint and free-orb attacks'], remaining: ['Sproink uses normal attack modifiers, zero extra Impetus mana and native disjoint as working choices', 'Attack-origin distance snapshots and nonhero damage classification need comparison'] },
  custom_dawnbreaker_luminosity: { implemented: ['Gaben +150 percentage-point healing factor and .1s delayed modifier-enabled extra attack every five seconds'], remaining: ['Working interpretation: +150 percentage points, second attack advances Luminosity and other attack modifiers'] },
  custom_monkey_king_jingu_mastery: { implemented: ['Super queued .1s Echo second strike with normal attack modifiers', 'Gaben stationary invulnerable 12-second stone soldiers every two seconds, snapshot damage and +400 range', 'Soldiers inherit an explicit seven-skill attack-effect allowlist with init and attack snapshot deduplication; Jingu itself and owner-only summons are excluded', 'Historical 35-second Jingu charge expiry'], remaining: ['JINGU_ATTACK_EFFECT_IDS is a conservative project allowlist, not recovered AA eligibility; other attack effects remain excluded', 'Six radial spawn offsets at 1.2 units and .1s Echo interval are working choices'] },
  custom_storm_spirit_overload: { implemented: ['Gaben sequential two unique-target 500-range bounces at 1200 reference units/second carrying the captured charge burst'], remaining: ['Each jump carries full captured burst and a normal attack without secondary modifiers; radius/speed/propagation are working defaults'] },
  custom_abaddon_curse_of_avernus: { implemented: ['Super three-hit threshold and +50 percentage-point curse slow, bounded by movement minimum'], remaining: ['+50 applies to curse slow, not initial slow; percentage-point interpretation remains a working rule'] },
  custom_slark_dark_pact: { implemented: ['Gaben real allied heroes copy ten half-strength normal pulses, with synchronized delay, strong dispels and nonlethal self-cost'], remaining: ['Summons/illusions excluded; self-cost is direct HP removal and therefore bypasses mitigation/False Promise by explicit working rule'] },
  custom_enchantress_natures_attendants: { implemented: ['Gaben 13 evil wisps, each 36 magical DPS, half-second target distribution for 12 seconds in 275 radius'], remaining: ['Evil wisp values mirror the chosen Super swarm as an explicit balance default; no AA source supplied their numbers'] },
  dazzle_shadow_wave: { implemented: ['Gaben granted historical active Bad Juju with per-cast/per-target armor stacks and independently queued stack-scaled healing/damage'], remaining: ['Working 2023 version/level 3; active preserves stacks; effects without damage/healing use actual cast target'] },
  custom_shadow_demon_demonic_purge: { implemented: ['Gaben queued three-charge Cleanse with separate mana/cooldowns and CDR-aware sequential recharge'], remaining: ['Granted basic level 3, 700 range and .3s cast point are working choices; targeting banished allies still follows shared engine eligibility'] },
  custom_shadow_demon_demonic_cleanse: { implemented: ['Gaben queued one-charge Purge with separate mana/cooldown and CDR-aware recharge'], remaining: ['Granted basic level 3, one charge, 700 range and .3s cast point are working choices'] },
  night_stalker_crippling_fear: { implemented: ['Gaben periodic nighttime level-four Void includes interrupting .1s mini-stun'], remaining: ['Native ordinary mini-stun duration missing: .1s working default, explicitly distinct from one-second Scepter stun'] },
  custom_warlock_chaotic_offering: { implemented: ['Gaben two independently attacking golems with reduced HP, AA Flaming Fists/Immolation values and historical ancillary stats'], remaining: ['HP uses native Scepter absolute reduction deltas; AA zero base attack is preserved; exact AA Gaben stats still need reference confirmation'] },
  custom_faceless_void_chronosphere: { implemented: ['Gaben allied movement, remaining attack windup/interval and cast-point/backswing clocks all use explicit 6.5x slowdown', 'Caster in-zone movement1000 and ordinary-invisibility reveal', 'Continuous field constraints ignore status-resistance duration shrinkage between refreshes'], remaining: ['-550% interpreted as 6.5x time; channel duration remains world-time as explicit cast-speed interpretation', '1000 caster movement speed and .15s field linger are exposed working defaults; source supplies only high-speed wording'] },
  custom_ember_spirit_flame_guard: { implemented: ['Gaben independent passive 120 DPS Radiance with 700 radius/15% blind and break suppression'], remaining: ['Twice-power interpreted as doubling burn only; no item attack stat/evasion grant; native blind/radius retained'] },
  muerta_pierce_the_veil: { implemented: ['Gaben 50% modifier-enabled Gunslinger shot, preferring another target then the primary, with recursion/break guards'], remaining: ['Muerta absent from February snapshot: 50% chance and effective attack-range targeting are transparent working defaults'] },
  lycan_shapeshift: { implemented: ['Super bounded forward-axis backline blink and fear', 'Gaben nearest real-hero persistent Wolf Bite with 30% range-limited shared lifesteal', 'Later owned summons inherit Shapeshift bonuses'], remaining: ['Backline .8 unit clearance, allied form/health inheritance and battle-long Wolf Bite are working choices'] },
  dragon_knight_elder_dragon_form: { implemented: ['Gaben free pathing bypasses unit separation and arena barriers while respecting map bounds'], remaining: ['Black-dragon/Fireball ordering, splash snapshot and zero source attack-range field remain reference-sensitive'] },
};
for (const [id, completion] of Object.entries(completedWithWorkingDefaults)) {
  programs[id].implemented.push(...completion.implemented);
  programs[id].remaining = ['AA reference execution and cross-skill verification', HISTORICAL, WORKING, ...completion.remaining];
}
const superImplemented = new Set([
  'custom_monkey_king_jingu_mastery', 'custom_abaddon_curse_of_avernus', 'lycan_shapeshift',
  'doom_bringer_infernal_blade', 'enchantress_impetus', 'custom_lone_druid_spirit_bear',
  'custom_skeleton_king_vampiric_aura', 'custom_windrunner_focusfire',
  'dragon_knight_elder_dragon_form', 'custom_troll_warlord_berserkers_rage', 'custom_oracle_fortunes_end', 'undying_flesh_golem',
  'custom_chaos_knight_reality_rift',
  'crystal_maiden_brilliance_aura', 'bloodseeker_bloodrage', 'custom_beastmaster_inner_beast',
  'luna_lunar_blessing', 'vengefulspirit_command_aura', 'custom_magnataur_empower',
  'custom_drow_ranger_frost_arrows', 'custom_viper_poison_attack', 'winter_wyvern_arctic_burn',
  'legion_commander_moment_of_courage', 'custom_dawnbreaker_luminosity', 'custom_luna_moon_glaive',
  'custom_storm_spirit_overload', 'custom_zuus_static_field', 'custom_abyssal_underlord_atrophy_aura',
  'huskar_berserkers_blood', 'custom_slark_dark_pact', 'custom_enchantress_natures_attendants',
  'lich_frost_shield', 'custom_grimstroke_ink_swell', 'custom_visage_grave_chill',
  'custom_undying_soul_rip', 'dazzle_shadow_wave', 'custom_shadow_demon_demonic_purge',
  'custom_shadow_demon_demonic_cleanse', 'night_stalker_crippling_fear', 'custom_drow_ranger_wave_of_silence',
  'custom_bristleback_viscous_nasal_goo', 'batrider_sticky_napalm', 'ursa_overpower',
  'custom_earthshaker_enchant_totem', 'custom_snapfire_lil_shredder', 'custom_warlock_chaotic_offering',
  'custom_faceless_void_chronosphere', 'custom_legion_commander_duel', 'oracle_false_promise',
  'custom_ember_spirit_flame_guard', 'custom_pudge_flesh_heap', 'arc_warden_magnetic_field',
  'muerta_pierce_the_veil', 'slark_shadow_dance', 'custom_lone_druid_spirit_link',
  'gyrocopter_flak_cannon', 'custom_dark_willow_shadow_realm', 'kunkka_tidebringer',
]);
const gabenImplemented = new Set([
  'vengefulspirit_command_aura', 'enchantress_impetus', 'custom_dawnbreaker_luminosity', 'custom_monkey_king_jingu_mastery',
  'custom_storm_spirit_overload', 'custom_slark_dark_pact', 'custom_enchantress_natures_attendants', 'dazzle_shadow_wave',
  'custom_shadow_demon_demonic_purge', 'custom_shadow_demon_demonic_cleanse', 'night_stalker_crippling_fear',
  'custom_warlock_chaotic_offering', 'custom_faceless_void_chronosphere', 'custom_ember_spirit_flame_guard',
  'muerta_pierce_the_veil', 'lycan_shapeshift', 'dragon_knight_elder_dragon_form',
  'winter_wyvern_arctic_burn', 'custom_luna_moon_glaive', 'custom_zuus_static_field',
  'custom_oracle_fortunes_end', 'custom_undying_soul_rip', 'custom_skeleton_king_vampiric_aura',
  'custom_lone_druid_spirit_bear', 'custom_troll_warlord_berserkers_rage',
  'custom_beastmaster_inner_beast', 'luna_lunar_blessing',
  'slark_shadow_dance', 'custom_lone_druid_spirit_link',
  'custom_chaos_knight_reality_rift',
  'crystal_maiden_brilliance_aura', 'bloodseeker_bloodrage', 'custom_magnataur_empower',
  'custom_drow_ranger_frost_arrows', 'custom_viper_poison_attack', 'doom_bringer_infernal_blade',
  'legion_commander_moment_of_courage', 'custom_abaddon_curse_of_avernus', 'custom_abyssal_underlord_atrophy_aura',
  'huskar_berserkers_blood', 'lich_frost_shield', 'custom_grimstroke_ink_swell', 'custom_visage_grave_chill',
  'custom_drow_ranger_wave_of_silence', 'custom_bristleback_viscous_nasal_goo', 'batrider_sticky_napalm',
  'ursa_overpower', 'custom_earthshaker_enchant_totem', 'custom_snapfire_lil_shredder',
  'custom_legion_commander_duel', 'oracle_false_promise', 'custom_pudge_flesh_heap',
  'custom_windrunner_focusfire', 'arc_warden_magnetic_field', 'gyrocopter_flak_cannon',
  'custom_dark_willow_shadow_realm', 'kunkka_tidebringer',
  'undying_flesh_golem',
]);
for (const [id, program] of Object.entries(programs)) {
  program.superImplemented = superImplemented.has(id);
  program.gabenImplemented = gabenImplemented.has(id);
}

export const EXTRA_PROGRAMS: Record<string, SkillProgram> = programs;
export const EXTRA_CHILD_PROGRAMS: Record<string, SkillProgram> = childPrograms;
export const EXTRA_CHILD_DEFINITIONS: SkillDefinition[] = childDefinitions;
