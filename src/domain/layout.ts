import { type Position } from "../schema";

/**
 * Radius of the radial fan used to lay out newly expanded nodes, in canvas
 * pixels. Large enough that, at the default zoom level, fanned-out nodes do not
 * overlap their default-size cards and remain individually selectable; small
 * enough that the cluster still reads as grouped around its origin.
 */
export const EXPANSION_RADIUS = 200;

/**
 * Number of nodes placed on each ring of the expansion fan before stepping out
 * to the next ring. Eight keeps the first ring a clean octagon and, with the
 * per-ring radius scaling below, ensures later rings never collide with earlier
 * slots.
 */
const RING_SIZE = 8;

/**
 * Angular step between consecutive fan positions: one {@link RING_SIZE}th of a
 * turn, so the first ring forms a full octagon with slot 0 directly right of
 * the origin.
 */
export const EXPANSION_ANGLE_STEP = (2 * Math.PI) / RING_SIZE;

/**
 * Returns `count` positions arranged in a deterministic radial fan around
 * `origin`. Slot 0 sits at angle 0 (directly to the right); each subsequent slot
 * advances by {@link EXPANSION_ANGLE_STEP}. Each ring of {@link RING_SIZE} slots
 * steps the radius out by another {@link EXPANSION_RADIUS}, so rings never
 * collide (slot 8 lands on a wider ring than slot 0). Deterministic for any
 * count.
 */
export function placeAround(origin: Position, count: number): Position[] {
  const positions: Position[] = [];
  for (let i = 0; i < count; i += 1) {
    const ring = Math.floor(i / RING_SIZE);
    const radius = EXPANSION_RADIUS * (ring + 1);
    const angle = i * EXPANSION_ANGLE_STEP;
    positions.push({
      x: origin.x + radius * Math.cos(angle),
      y: origin.y + radius * Math.sin(angle),
    });
  }
  return positions;
}

/**
 * Layout constants for the cascade used when nodes are added one at a time (the
 * "Add node" menu and the GitHub panel's "add to graph"). Shared here so the two
 * add paths place nodes on the same grid rather than each hand-rolling — and
 * drifting on — the same arithmetic.
 */
const CASCADE_ORIGIN_X = 120;
const CASCADE_ORIGIN_Y = 80;
const CASCADE_COLUMNS = 8;
const CASCADE_COLUMN_STEP = 36;
const CASCADE_ROW_STEP = 60;

/**
 * A position on the add-cascade grid for the `index`-th node added. Columns of
 * {@link CASCADE_COLUMNS}, stepping down a row when a row fills.
 */
export function cascadePosition(index: number): Position {
  return {
    x: CASCADE_ORIGIN_X + (index % CASCADE_COLUMNS) * CASCADE_COLUMN_STEP,
    y: CASCADE_ORIGIN_Y + Math.floor(index / CASCADE_COLUMNS) * CASCADE_ROW_STEP,
  };
}
