/** Shared logical arena geometry. Art stays at its authored world size, so
 * fitting this smaller field makes heroes and effects appear 25% larger. */
export const ARENA_SCALE = .8;
export const ARENA_WIDTH = 29.142857 * ARENA_SCALE;
export const ARENA_HEIGHT = 25.833333 * ARENA_SCALE;
export const BATTLE_BOUNDS = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 } as const;

/** Keep a margin inside the arena and reserve the lower half for formation. */
export const FORMATION_BOUNDS = { x: 13.6 * ARENA_SCALE, minY: -12 * ARENA_SCALE, maxY: 0 } as const;
export function clampFormationPoint(x: number, y: number): { x: number; y: number } {
  return { x: Math.max(-FORMATION_BOUNDS.x, Math.min(FORMATION_BOUNDS.x, x)),
    y: Math.max(FORMATION_BOUNDS.minY, Math.min(FORMATION_BOUNDS.maxY, y)) };
}
