import type { BattleState } from '../model';

export interface VisualPoint { x: number; y: number }
/** Read-only render metadata for motion already computed by a skill. It never
 * participates in targeting, collision, damage, RNG or win conditions. */
export interface VisualProjectile extends VisualPoint {
  id: string;
  source: string;
  skill: string;
  /** Explicit authored parent for granted-only children with no own atlas. */
  artSkill?: string;
  points: number;
  layer?: string;
  role?: string;
  angle: number;
  createdAt: number;
  until: number;
  expiresWithSource?: boolean;
  /** Only set when the actual mechanic has a fixed launch/arrival deadline.
   * Rendering may interpolate this segment; it must not invent a curved arc. */
  origin?: VisualPoint;
  destination?: VisualPoint;
  arrival?: number;
}
type NewVisualProjectile = Omit<VisualProjectile, 'id' | 'createdAt'>;

export function activeVisualProjectiles(battle: BattleState, time = battle.time): VisualProjectile[] {
  if (battle.finished) return [];
  return ((battle.visualProjectiles ?? []) as VisualProjectile[]).filter(p => p.createdAt <= time && p.until > time
    && (!p.expiresWithSource || battle.units.some(u => u.id === p.source && !u.dead)));
}
export function addVisualProjectile(battle: BattleState, options: NewVisualProjectile): VisualProjectile {
  const next = Number(battle.nextVisualProjectile ?? 0);
  battle.nextVisualProjectile = next + 1;
  const visual: VisualProjectile = { ...options, id: `visual-projectile:${next}`, createdAt: battle.time,
    ...(options.origin ? { origin: { ...options.origin } } : {}), ...(options.destination ? { destination: { ...options.destination } } : {}) };
  battle.visualProjectiles = [...activeVisualProjectiles(battle), visual];
  return visual;
}
export function moveVisualProjectile(battle: BattleState, visual: VisualProjectile, point: VisualPoint, until?: number): void {
  const dx = point.x - visual.x, dy = point.y - visual.y;
  if (dx || dy) visual.angle = Math.atan2(dy, dx);
  visual.x = point.x; visual.y = point.y;
  if (until !== undefined) visual.until = until;
  // A leased clock can resume after temporary untargetability. It may have
  // expired out of the public list while another projectile was added.
  if (!((battle.visualProjectiles ?? []) as VisualProjectile[]).some(p => p.id === visual.id)) battle.visualProjectiles = [...activeVisualProjectiles(battle), visual];
}
export function removeVisualProjectile(battle: BattleState, visual: VisualProjectile): void {
  battle.visualProjectiles = ((battle.visualProjectiles ?? []) as VisualProjectile[]).filter(p => p.id !== visual.id);
}
export function visualProjectilePosition(visual: VisualProjectile, time: number): VisualPoint {
  if (visual.origin && visual.destination && visual.arrival !== undefined) {
    const t = Math.max(0, Math.min(1, (time - visual.createdAt) / Math.max(1e-8, visual.arrival - visual.createdAt)));
    return { x: visual.origin.x + (visual.destination.x - visual.origin.x) * t, y: visual.origin.y + (visual.destination.y - visual.origin.y) * t };
  }
  return { x: visual.x, y: visual.y };
}

/** A real spatial occurrence, not a cast-preview timeline. Instant proc/burst
 * `until` is only its presentation lifetime; it does not schedule more damage.
 * Ring radius/previousRadius describe the exact current simulation sweep. */
export interface VisualWorldEffect extends VisualPoint {
  id: string;
  source: string;
  skill: string;
  artSkill?: string;
  points: number;
  layer: string;
  role?: string;
  createdAt: number;
  until: number;
  angle?: number;
  size?: number;
  radius?: number;
  previousRadius?: number;
  halfWidth?: number;
  maxRadius?: number;
  phase?: 'outward' | 'inward';
  /** Real simulation phase progress, independent of a short render lease. */
  progress?: number;
  kind?: 'ring' | 'burst' | 'pulse' | 'proc';
  loop?: boolean;
  expiresWithSource?: boolean;
}
export function activeVisualWorldEffects(battle: BattleState, time = battle.time): VisualWorldEffect[] {
  if (battle.finished) return [];
  return ((battle.visualWorldEffects ?? []) as VisualWorldEffect[]).filter(effect => effect.createdAt <= time && effect.until > time
    && (!effect.expiresWithSource || battle.units.some(u => u.id === effect.source && !u.dead)));
}
export function addVisualWorldEffect(battle: BattleState, options: Omit<VisualWorldEffect, 'id' | 'createdAt'>): VisualWorldEffect {
  const next = Number(battle.nextVisualWorldEffect ?? 0);
  battle.nextVisualWorldEffect = next + 1;
  const effect: VisualWorldEffect = { loop: false, ...options, id: `visual-world:${next}`, createdAt: battle.time };
  battle.visualWorldEffects = [...activeVisualWorldEffects(battle), effect];
  return effect;
}
export function updateVisualWorldEffect(battle: BattleState, effect: VisualWorldEffect, changes: Partial<Omit<VisualWorldEffect, 'id' | 'createdAt'>>): void {
  Object.assign(effect, changes);
  if (!((battle.visualWorldEffects ?? []) as VisualWorldEffect[]).some(other => other.id === effect.id)) battle.visualWorldEffects = [...activeVisualWorldEffects(battle), effect];
}
export function removeVisualWorldEffect(battle: BattleState, effect: VisualWorldEffect): void {
  battle.visualWorldEffects = ((battle.visualWorldEffects ?? []) as VisualWorldEffect[]).filter(other => other.id !== effect.id);
}
