import type { CombatUnit } from '../model';

export interface MotionPoint { x: number; y: number }
export interface TransformSnapshot extends MotionPoint { facing: number; warpSequence: number }
export interface ContinuousMoveOptions {
  /** Seconds of world time, independent of attack/cast animation speed. */
  duration?: number;
  /** Explicit project arbitration; equal-priority unrelated controllers keep the incumbent. */
  priority?: number;
  lockActions?: boolean;
  /** Only a skill's explicit motion exception may bypass a skill-created wall. */
  ignoreBarriers?: boolean;
}
export interface MotionController {
  owner: string;
  skill: string;
  from: MotionPoint;
  to: MotionPoint;
  startedAt: number;
  duration: number;
  priority: number;
  lockActions: boolean;
  ignoreBarriers: boolean;
}

/** Historical base turn-rate candidate, expressed in this engine's radians/sec.
 * The flat 30-Hz model intentionally does not claim Dota's acceleration curve. */
export const DEFAULT_TURN_RATE = 18;
export const FACING_TOLERANCE = 11.5 * Math.PI / 180;
const normalBudgets = new WeakMap<CombatUnit, number>();

export function angleDifference(target: number, current: number): number {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

export function beginMovementFrame(unit: CombatUnit, tick: number, speed: number, dt: number): void {
  unit.previousTransform = { x: unit.x, y: unit.y, facing: unit.facing, warpSequence: Number(unit.warpSequence ?? 0) } satisfies TransformSnapshot;
  unit.transformTick = tick;
  normalBudgets.set(unit, Math.max(0, speed * dt));
}

export function remainingMovementBudget(unit: CombatUnit): number { return normalBudgets.get(unit) ?? 0; }
/** Call after statuses/tasks but before ordinary movement if speed changed
 * during this tick. The presentation snapshot remains the tick-start position. */
export function refreshMovementBudget(unit: CombatUnit, speed: number, dt: number): void {
  normalBudgets.set(unit, Math.max(0, speed * dt));
}

/** Returns true only once the unit actually faces the order. Never snap facing. */
export function turnTowards(unit: CombatUnit, point: MotionPoint, dt: number, rate = Number(unit.turnRate ?? DEFAULT_TURN_RATE)): boolean {
  if (Math.hypot(point.x - unit.x, point.y - unit.y) < 1e-9) return true;
  const desired = Math.atan2(point.y - unit.y, point.x - unit.x);
  const difference = angleDifference(desired, unit.facing), limit = Math.max(0, Number.isFinite(rate) ? rate : DEFAULT_TURN_RATE) * dt;
  unit.facing = Math.atan2(Math.sin(unit.facing + Math.max(-limit, Math.min(limit, difference))), Math.cos(unit.facing + Math.max(-limit, Math.min(limit, difference))));
  return Math.abs(angleDifference(desired, unit.facing)) <= FACING_TOLERANCE + 1e-9;
}

export function recordMovement(unit: CombatUnit, time: number, point: MotionPoint, kind: 'walk' | 'forced' | 'collision' | 'warp', skill?: string): number {
  const distance = Math.hypot(point.x - unit.x, point.y - unit.y);
  if (distance <= 1e-10) return 0;
  const history = (unit.moveHistory ?? []) as { time: number; distance: number; kind?: string; skill?: string }[];
  unit.moveHistory = [...history.filter(item => item.time >= time - 3), { time, distance, kind, ...(skill ? { skill } : {}) }];
  unit.x = point.x; unit.y = point.y;
  if (kind === 'warp') unit.warpSequence = Number(unit.warpSequence ?? 0) + 1;
  if (kind === 'walk' || kind === 'collision') normalBudgets.set(unit, Math.max(0, remainingMovementBudget(unit) - distance));
  return distance;
}

export function limitOrdinaryMove(unit: CombatUnit, point: MotionPoint): MotionPoint {
  const distance = Math.hypot(point.x - unit.x, point.y - unit.y), budget = remainingMovementBudget(unit);
  if (distance <= budget || distance < 1e-10) return point;
  return { x: unit.x + (point.x - unit.x) / distance * budget, y: unit.y + (point.y - unit.y) / distance * budget };
}

/** Unit phasing is distinct from passing through skill-created barriers. */
export function ignoresUnitCollision(unit: CombatUnit): boolean {
  return unit.statuses.some(status => ['banished', 'phased', 'freePathing', 'fly', 'flying'].includes(status.kind));
}

/** Swept circular-body collision. Existing overlaps may exit but cannot deepen.
 * This prevents ordinary high-speed movement from tunnelling through a body. */
export function constrainUnitMotion(unit: CombatUnit, point: MotionPoint, others: CombatUnit[], radius: number): MotionPoint {
  if (ignoresUnitCollision(unit)) return point;
  const dx = point.x - unit.x, dy = point.y - unit.y, lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-16) return point;
  let fraction = 1;
  for (const other of others) {
    if (other === unit || other.dead || ignoresUnitCollision(other)) continue;
    const ox = unit.x - other.x, oy = unit.y - other.y, clearance = radius * 2;
    const c = ox * ox + oy * oy - clearance * clearance;
    const approach = ox * dx + oy * dy;
    if (c < -1e-8) { if (approach < 0) fraction = 0; continue; }
    if (approach >= 0) continue;
    const discriminant = approach * approach - lengthSquared * c;
    if (discriminant < 0) continue;
    const contact = (-approach - Math.sqrt(discriminant)) / lengthSquared;
    if (contact >= -1e-8 && contact <= fraction) fraction = Math.max(0, contact - 1e-6);
  }
  return { x: unit.x + dx * fraction, y: unit.y + dy * fraction };
}
