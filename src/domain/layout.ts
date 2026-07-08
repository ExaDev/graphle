import { type Position } from "../schema";

/**
 * Radius of the radial fan used to lay out newly expanded nodes, in canvas
 * pixels. Large enough that, at the default zoom level, fanned-out nodes do not
 * overlap their default-size cards and remain individually selectable; small
 * enough that the cluster still reads as grouped around its origin.
 */
export const EXPANSION_RADIUS = 200;

/**
 * Angular step between consecutive fan positions. `2 * Math.PI / 8` is one
 * eighth of a turn, so the first eight nodes form a full octagonal ring with
 * the first slot directly to the right of the origin. Counts beyond eight keep
 * advancing by the same step, winding onto a second turn, which keeps the
 * layout deterministic for any count.
 */
export const EXPANSION_ANGLE_STEP = (2 * Math.PI) / 8;

/**
 * Returns `count` positions arranged in a deterministic radial fan around
 * `origin`. Index 0 sits at angle 0 (directly to the right); each subsequent
 * index advances by {@link EXPANSION_ANGLE_STEP}. There is no randomness, so
 * the same arguments always produce the same positions.
 */
export function placeAround(origin: Position, count: number): Position[] {
  const positions: Position[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = i * EXPANSION_ANGLE_STEP;
    positions.push({
      x: origin.x + EXPANSION_RADIUS * Math.cos(angle),
      y: origin.y + EXPANSION_RADIUS * Math.sin(angle),
    });
  }
  return positions;
}
