import type { AssetManifest, BattleState, CombatUnit } from './model';
import type { EffectStatus } from './skill-effects';
import type { PlacedVisual } from './visual-bindings';
import { tierVisualLayers, type VisualSkillArt } from './visual-layers';

const DUEL = 'custom_legion_commander_duel';
const living = (unit: CombatUnit) => !unit.dead && unit.hp > 0 && Number.isFinite(unit.x) && Number.isFinite(unit.y);

/** Use the first effective duel just as combat's forced-target/damage readers
 * do. A later overlapping modifier must not invent a second active pair. */
function effectiveDuel(unit: CombatUnit, time: number): EffectStatus | undefined {
  return unit.statuses.find(status => status.kind === 'duel' && status.until > time) as EffectStatus | undefined;
}

function beganAt(battle: BattleState, unit: CombatUnit, status: EffectStatus, time: number): number {
  // The modifier has no createdAt. Its actual status event carries both birth
  // and duration; matching expiry also rejects an older cast on this pair.
  for (let i = battle.events.length - 1; i >= 0; i--) {
    const event = battle.events[i];
    if (event.time <= time && event.type === 'status' && event.status === 'duel'
      && event.source === status.source && event.target === unit.id && event.skill === status.skill
      && typeof event.duration === 'number' && Math.abs(event.time + event.duration - status.until) < 1e-6) return event.time;
  }
  return 0;
}

/** Decorative pair art only: this function neither creates collision barriers
 * nor moves participants. The atlas' horizontal axis follows the real pair.
 * Isolation requires actual reduction on BOTH effective modifiers; merely
 * owning a Gaben Duel (or retaining a stale tier flag) is not enough. */
export function duelVisuals(assets: AssetManifest, battle: BattleState, time = battle.time): PlacedVisual[] {
  if (battle.finished || !Number.isFinite(time)) return [];
  const art = assets.skills[DUEL] as VisualSkillArt | undefined;
  if (!art) return [];
  const units = new Map(battle.units.map(unit => [unit.id, unit])), seen = new Set<string>(), result: PlacedVisual[] = [];
  for (const unit of battle.units) {
    if (!living(unit)) continue;
    const status = effectiveDuel(unit, time);
    if (status?.skill !== DUEL || typeof status.data?.targetId !== 'string') continue;
    const other = units.get(status.data.targetId);
    if (!other || other.id === unit.id || !living(other)) continue;
    const reciprocal = effectiveDuel(other, time);
    if (reciprocal?.skill !== DUEL || reciprocal.source !== status.source || reciprocal.data?.targetId !== unit.id) continue;
    const [first, second] = unit.id < other.id ? [unit, other] : [other, unit];
    const pair = `${first.id}|${second.id}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const source = status.source ? units.get(status.source) : undefined;
    const points = status.points ?? source?.skills.find(skill => skill?.id === DUEL)?.points ?? 1;
    const layers = tierVisualLayers(art, points).filter(layer => layer.role === 'duel_boundary');
    const reduces = (modifier: EffectStatus) => Number.isFinite(Number(modifier.data?.externalReduction)) && Number(modifier.data?.externalReduction) > 0;
    // The effect is authoritative. Use the authored isolation layer when that
    // effect actually exists, even if a future rule moves it to another tier.
    if (reduces(status) && reduces(reciprocal)) layers.push(...tierVisualLayers(art, 9).filter(layer => layer.role === 'pair_external_damage_reduction'));
    const dx = second.x - first.x, dy = second.y - first.y, separation = Math.hypot(dx, dy);
    const x = (first.x + second.x) / 2, y = (first.y + second.y) / 2, angle = Math.atan2(dy, dx);
    const age = Math.max(0, time - Math.max(beganAt(battle, unit, status, time), beganAt(battle, other, reciprocal, time)));
    for (const layer of layers) {
      const base = Number(layer.clip.worldSize), isolation = layer.role === 'pair_external_damage_reduction';
      if (!Number.isFinite(base) || base <= 0) continue;
      // These are cosmetic atlas-fit fractions, NOT a Duel radius: the arena
      // encloses roughly the middle 60% of its canvas; the two isolation plates
      // leave the middle 30% clear. Stretch only the pair axis so living bodies
      // remain between the plates rather than enforcing preview spacing.
      const size = Math.max(base, (separation + 1.2) / (isolation ? .3 : .6));
      result.push({ key: `duel:${pair}:${layer.id}`, clip: layer.clip, x, y, age, size, height: base,
        angle, z: isolation ? .62 : .14, loop: true });
    }
  }
  return result.sort((a, b) => a.key.localeCompare(b.key));
}
