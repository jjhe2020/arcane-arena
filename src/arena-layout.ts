import {BOARD_CONFIG} from './global-config';

/** Shared logical arena geometry. Art stays at its authored world size, so
 * fitting this smaller field makes heroes and effects appear 25% larger. */
export const ARENA_SCALE = BOARD_CONFIG.scale;
export const ARENA_WIDTH = BOARD_CONFIG.width * ARENA_SCALE;
export const ARENA_HEIGHT = BOARD_CONFIG.height * ARENA_SCALE;
export const BATTLE_BOUNDS = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 } as const;

/** Keep a margin inside the arena and reserve the lower half for formation. */
export const FORMATION_BOUNDS = { x: BOARD_CONFIG.formationHalfWidth * ARENA_SCALE, minY: BOARD_CONFIG.formationMinY * ARENA_SCALE, maxY: BOARD_CONFIG.formationMaxY * ARENA_SCALE } as const;
export function clampFormationPoint(x: number, y: number): { x: number; y: number } {
  return { x: Math.max(-FORMATION_BOUNDS.x, Math.min(FORMATION_BOUNDS.x, x)),
    y: Math.max(FORMATION_BOUNDS.minY, Math.min(FORMATION_BOUNDS.maxY, y)) };
}
