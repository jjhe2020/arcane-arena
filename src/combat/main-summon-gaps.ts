import type { CombatUnit, SkillDefinition } from '../model';
import type { EffectContext as C, EffectStatus, SkillProgram, SummonOptions } from '../skill-effects';
import units from './historical-unit-data.json';

// AA's explicit values remain authoritative. These are missing neutral-unit
// behaviors from the pinned Valve 2023-02-10 KV/localization working baseline.
const SOURCE = { commit: '6abdd9d13de2f4330ca748082467b9ff6e6cd928', commitDate: '2023-02-10T01:16:45Z' };
const HISTORICAL = 'Pinned Valve 2023-02-10 candidate; original AA execution unverified';
const SPLIT = 'mud_golem_rock_destroy', AURA = 'granite_golem_hp_aura', INVIS = 'lycan_summon_wolves_invisibility';
const distance = (a: CombatUnit, b: CombatUnit) => Math.hypot(a.x - b.x, a.y - b.y);
const active = (u: CombatUnit, kind: string, time: number) => u.statuses.some(s => s.kind === kind && s.until > time);
const lifetime = (c: C, u: CombatUnit) => Math.max(.1, Number(u.expiresAt ?? 120) - c.battle.time);
function attach(unit: CombatUnit, id: string) {
  if (unit.skills.some(s => s?.id === id)) return;
  unit.skills.push({ id, points: 1 }); unit.cooldowns.push(0);
}
function remove(unit: CombatUnit, id: string, kinds?: string[]) {
  unit.statuses = unit.statuses.filter(s => s.skill !== id || (kinds && !kinds.includes(s.kind)));
}
function sourceOptions(unit: CombatUnit, id: string): Partial<EffectStatus> {
  return { source: unit.id, skill: id, passive: true, harmful: false, dispel: 'none' };
}
function boulder(unit: CombatUnit) { attach(unit, 'mud_golem_hurl_boulder'); }

export const SUMMON_GAP_CHILD_DEFINITIONS: SkillDefinition[] = [SPLIT, AURA, INVIS].map(id => ({
  id, name: id, nameEn: id, description: '历史参考召唤物被动', descriptionEn: HISTORICAL,
  tags: ['passive'], super: '', gaben: '', values: [], cooldowns: [], mana: [], categories: ['ABILITY: Passive'],
  icon: '', passive: true, ultimate: false, grantedOnly: true, historicalSource: { ...SOURCE, file: 'npc_abilities.txt', id },
}));

export const SUMMON_GAP_CHILD_PROGRAMS: Record<string, SkillProgram> = {
  [SPLIT]: {
    passive: true,
    onDeath: c => {
      const raw = units.units.npc_dota_neutral_mud_golem_split;
      const shards = c.summon({ name: '泥土碎片傀儡', count: 2, hp: raw.StatusHealth,
        attack: (raw.AttackDamageMin + raw.AttackDamageMax) / 2, armor: raw.ArmorPhysical,
        interval: raw.AttackRate / (raw.BaseAttackSpeed / 100), range: raw.AttackRange / 100,
        speed: raw.MovementSpeed / 100, lifetime: 60 });
      shards.forEach((shard, i) => {
        shard.sourceUnitType = 'npc_dota_neutral_mud_golem_split'; shard.owner = c.caster.owner ?? c.caster.id;
        shard.magicResist = raw.MagicalResistance / 100; shard.mana = shard.maxMana = raw.StatusMana;
        c.status(shard, 'regen', 60, raw.StatusHealthRegen);
        c.status(shard, 'manaRegen', 60, raw.StatusManaRegen - 3);
        boulder(shard); c.teleport(shard, c.caster.x + (i ? .45 : -.45), c.caster.y);
      });
    },
    implemented: ['On death spawns exactly two 60-second Shard Golems', 'Shards retain Boulder but do not split again'],
    remaining: [HISTORICAL, 'Unit KV HP250/attack10–14 overrides stale tooltip HP240/attack9; damage uses midpoint12'],
  },
  [AURA]: { passive: true, implemented: ['15% maximum-health aura in radius1200 with nonstacking identical sources'], remaining: [HISTORICAL, 'Aura refresh interval .1s and linger .15s are project defaults'] },
  [INVIS]: {
    passive: true,
    onAttack: c => {
      c.caster.summonGapInvisibilityReadyAt = c.battle.time + 2;
      remove(c.caster, INVIS, ['invisible']);
    },
    implemented: ['Permanent detectable invisibility outside attacks', 'Attack reveals wolf and restarts two-second fade delay'],
    remaining: [HISTORICAL, 'Attack windup also reveals the wolf; exact native reveal phase needs comparison'],
  },
};

function startGraniteAura(c: C, golem: CombatUnit) {
  if (golem.summonGapGraniteAura) return;
  golem.summonGapGraniteAura = true; attach(golem, AURA);
  // The zone belongs to the original cast but explicitly follows the body by
  // distance. It therefore survives the summoner's death and stops with golem.
  c.zone({ x: 0, y: 0, radius: 100, duration: lifetime(c, golem), interval: .1, targets: 'allies', effect: target => {
    if (golem.dead || active(golem, 'break', c.battle.time) || distance(golem, target) > 12) return;
    const elected = c.allies().filter(u => u.summonGapGraniteAura && !active(u, 'break', c.battle.time) && distance(u, target) <= 12)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (elected?.id !== golem.id) return;
    target.statuses = target.statuses.filter(s => !(s.skill === AURA && s.kind === 'maxHpPct' && s.source !== golem.id));
    c.status(target, 'maxHpPct', .15, .15, sourceOptions(golem, AURA));
  } });
}
function startWolfInvisibility(c: C, wolf: CombatUnit) {
  attach(wolf, INVIS); wolf.summonGapInvisibilityReadyAt = c.battle.time;
  c.status(wolf, 'invisible', lifetime(c, wolf), 1, sourceOptions(wolf, INVIS));
  c.zone({ x: 0, y: 0, radius: 100, duration: lifetime(c, wolf), interval: 1 / 30, targets: 'allies', effect: target => {
    if (target.id !== wolf.id || wolf.dead) return;
    if (['attack', 'cast'].includes(wolf.action) && wolf.actionStart > Number(wolf.summonGapLastActionStart ?? -1)) {
      wolf.summonGapLastActionStart = wolf.actionStart;
      wolf.summonGapInvisibilityReadyAt = Math.max(Number(wolf.summonGapInvisibilityReadyAt), wolf.actionStart + 2);
    }
    if (active(wolf, 'break', c.battle.time) || c.battle.time < Number(wolf.summonGapInvisibilityReadyAt)) remove(wolf, INVIS, ['invisible']);
    else c.status(wolf, 'invisible', .1, 1, sourceOptions(wolf, INVIS));
  } });
}

export function applySummonGapOverrides(registry: Record<string, SkillProgram>): void {
  const stone = registry.medusa_stone_gaze, previousStone = stone.cast!;
  stone.cast = c => previousStone({ ...c, summon: (options: SummonOptions) => {
    const bodies = c.summon(options);
    if (options.name === '泥土傀儡') for (const body of bodies) { boulder(body); attach(body, SPLIT); }
    return bodies;
  } });
  stone.implemented.push('Gaben Mud Golems cast historical Boulder and split on death into two Boulder-capable shards');
  stone.remaining = stone.remaining.filter(s => !s.includes('Boulder and death-split')).concat(HISTORICAL, 'Mud Golem unit stats are historical candidates; shard tooltip/unit-stat mismatch is recorded in child metadata');

  const wild = registry.custom_beastmaster_call_of_the_wild, previousWild = wild.cast!;
  wild.cast = c => {
    previousWild(c);
    for (const golem of c.allies().filter(u => u.owner === c.caster.id && u.sourceUnitType === 'npc_dota_neutral_granite_golem')) startGraniteAura(c, golem);
  };
  wild.implemented.push('Granite Golem grants nonstacking 15% max-HP aura to nearby allies and restores HP capacity on leaving/death');
  wild.remaining = wild.remaining.map(s => s.replace('Granite Golem max-health aura not implemented; ', '')).concat(HISTORICAL, 'Identical Granite auras do not stack; maximum-HP changes preserve current health percentage');

  const wolves = registry.custom_lycan_summon_wolves, previousWolves = wolves.cast!;
  wolves.cast = c => {
    const before = new Set(c.battle.units.map(u => u.id)); previousWolves(c);
    if (c.skill.points >= 3) for (const wolf of c.allies().filter(u => !before.has(u.id) && u.owner === c.caster.id && (u.wolfCripple || u.bigBadWolf))) startWolfInvisibility(c, wolf);
  };
  wolves.implemented.push('AA Standard rank maps to native level4 wolves: detectable invisibility, attack reveal and two-second refade, including Big Bad Wolf');
  wolves.remaining = wolves.remaining.map(s => s.replace('Wolf invisibility absent; ', '')).concat(HISTORICAL, 'AA rank mapping 1/2/4 follows captured wolf HP/damage; native level3 has no separate purchasable AA rank');

  const tether = registry.wisp_tether, previousTether = tether.cast!, previousCanTether = tether.canCast;
  const partnerFor = (c: C) => c.allies().filter(t => t.id !== c.caster.id && !t.summoned).sort((a, b) => distance(a, c.caster) - distance(b, c.caster) || a.id.localeCompare(b.id))[0];
  tether.canCast = c => (!previousCanTether || previousCanTether(c)) && !!partnerFor(c) && distance(partnerFor(c)!, c.caster) <= 16;
  tether.cast = c => {
    const partner = partnerFor(c); if (!partner) return;
    let pulling = distance(partner, c.caster) >= 7;
    previousTether({ ...c, zone: options => c.zone({ ...options, effect: (target, tick) => { if (!pulling) options.effect(target, tick); } }) });
    if (!pulling) return;
    const marker = 'wisp_tether_latch';
    const finish = () => { pulling = false; remove(c.caster, marker); };
    const pull = () => {
      if (c.caster.dead || partner.dead || !c.caster.statuses.some(s => s.kind === 'tether' && s.source === c.caster.id)) { finish(); return; }
      const gap = distance(c.caster, partner); if (gap <= 3 + 1e-8) { finish(); return; }
      c.status(c.caster, 'root', .1, 0, { skill: marker, dispel: 'none' });
      c.status(c.caster, 'freePathing', .1, 1, { skill: marker, dispel: 'none' });
      const step = Math.min(10 / 30, gap - 3);
      c.teleport(c.caster, c.caster.x + (partner.x - c.caster.x) / gap * step, c.caster.y + (partner.y - c.caster.y) / gap * step);
      c.delay(1 / 30, pull);
    };
    c.delay(1 / 30, pull);
  };
  tether.implemented.push('Historical >=700 initial latch pulls caster continuously at1000 units/s to300 separation; link does not prematurely break during latch');
  tether.remaining = tether.remaining.map(s => s.replace('Initial pull to distant ally is not implemented; ', '')).concat(HISTORICAL, 'Historical initial range1600 and latch700/speed1000/end300; static map bounds retained and exact terrain interaction unverified');
}
