import type { GraphDocument, Position } from "../schema";

/**
 * Pure per-edge port assignment: for every edge in a `GraphDocument`, which
 * side (top/bottom/left/right) of each endpoint node it should attach to,
 * and where along that side (as a 0..1 offset fraction) once several edges
 * share the same node, side, and direction. No React, no React Flow, no
 * IO — a pure function of document-level node positions and a
 * caller-supplied uniform node size, since individual measured footprints
 * aren't available until a node is mounted on the canvas. The UI layer
 * (`src/ui/flow/floating-edge-geometry.ts`) turns an offset fraction into
 * an absolute pixel point against a node's *live* measured rect.
 */

/** Which side of a node's rendered card an edge attaches to. */
export type Side = "top" | "bottom" | "left" | "right";

/** A 2D point in document coordinates. */
export type Point = { x: number; y: number };

/** A node's approximate size at this coarse, document-level layer. */
type NodeSize = { width: number; height: number };

/**
 * Which side of the node centred at `fromCenter` faces the node centred at
 * `toCenter`, by comparing the horizontal and vertical distance between the
 * two centres and picking a side on whichever axis has the larger
 * magnitude (mirrors React Flow's floating-edges example's `getParams`).
 *
 * Tie-break: when `|dx| === |dy|` exactly, the horizontal axis wins (this
 * function treats the comparison as `|dx| >= |dy|`), so a perfectly
 * diagonal relationship always resolves to `"left"`/`"right"`, never
 * `"top"`/`"bottom"`.
 */
export function sideFacing(fromCenter: Point, toCenter: Point): Side {
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

/** A single edge's computed attachment: which side of each endpoint it
 *  leaves/arrives from, and its offset fraction (0..1) along that side. */
export type EdgePorts = {
  sourceSide: Side;
  sourceOffset: number;
  targetSide: Side;
  targetOffset: number;
};

/** Reuses the same minimum-gap value as `EDGE_EDGE_SPACING_PX` in
 *  `src/ui/flow/auto-layout.ts` (16px) — the established minimum visual gap
 *  for distinguishing parallel edge routes in this app. Not imported
 *  directly: `src/domain` must have zero UI-layer imports, so the literal
 *  is repeated here with this comment as the cross-reference. */
const MIN_HANDLE_GAP_PX = 16;

/** Which role a node plays for a given edge: `"out"` when the node is the
 *  edge's `source`, `"in"` when it is the edge's `target`. */
type Direction = "in" | "out";

const SIDES: Side[] = ["top", "bottom", "left", "right"];
const DIRECTIONS: Direction[] = ["in", "out"];

/** One edge's contribution to a `(nodeId, side, direction)` group: its id,
 *  plus the *other* endpoint's document position, needed to sort the group
 *  deterministically. */
type GroupEntry = { edgeId: string; otherPosition: Position };

/** All edges touching one node, bucketed by side and direction. Every
 *  bucket is created up front so grouping never needs a "get or create"
 *  check per side. */
type SideGroups = Record<Side, Record<Direction, GroupEntry[]>>;

function createSideGroups(): SideGroups {
  return {
    top: { in: [], out: [] },
    bottom: { in: [], out: [] },
    left: { in: [], out: [] },
    right: { in: [], out: [] },
  };
}

function centerOf(position: Position, nodeSize: NodeSize): Point {
  return { x: position.x + nodeSize.width / 2, y: position.y + nodeSize.height / 2 };
}

/** A side's available length to spread offsets along: the node's height for
 *  a left/right side (edges travel up/down that side), its width for a
 *  top/bottom side (edges travel left/right along it). */
function sideLength(side: Side, nodeSize: NodeSize): number {
  return side === "left" || side === "right" ? nodeSize.height : nodeSize.width;
}

/** Sorts a group's entries by the *other* endpoint's document position
 *  along the axis perpendicular to `side` (`y` for left/right, `x` for
 *  top/bottom), ascending, ties broken by edge id — this is what keeps a
 *  given edge's slot stable across re-renders instead of depending on
 *  iteration/insertion order. */
function sortGroup(entries: GroupEntry[], side: Side): GroupEntry[] {
  const axis = side === "left" || side === "right" ? "y" : "x";
  return [...entries].sort((a, b) => {
    const diff = a.otherPosition[axis] - b.otherPosition[axis];
    if (diff !== 0) return diff;
    return a.edgeId.localeCompare(b.edgeId);
  });
}

/**
 * Assigns an offset fraction to every entry in one `(node, side, direction)`
 * group. `direction` reserves half of the side's length for this group:
 * `"in"` occupies offsets in `[0, 0.5)`, `"out"` occupies `[0.5, 1)` — the
 * two halves never overlap, so incoming and outgoing edges on the same side
 * are always visually distinct, even when nothing needs to merge.
 *
 * Within the half, the ideal even-spacing gap for `n` entries (corner-padded
 * so no entry sits flush against a corner — `n` slots inside `n + 1` gaps,
 * the same evenly-spaced-slot shape as `align.ts`'s `distributeNodes`) is
 * `(length / 2) / (n + 1)`. If that gap is at least `MIN_HANDLE_GAP_PX`,
 * every entry gets its own evenly-spaced offset. Otherwise — genuine
 * shortage of space — every entry in the group collapses to one shared
 * offset: the exact centre of its half.
 */
function assignOffsets(
  entries: GroupEntry[],
  side: Side,
  direction: Direction,
  nodeSize: NodeSize,
): Map<string, number> {
  const sorted = sortGroup(entries, side);
  const halfLength = sideLength(side, nodeSize) / 2;
  const count = sorted.length;
  const gap = halfLength / (count + 1);
  const halfBase = direction === "in" ? 0 : 0.5;

  const offsets = new Map<string, number>();
  if (gap >= MIN_HANDLE_GAP_PX) {
    sorted.forEach((entry, index) => {
      const withinHalfFraction = (index + 1) / (count + 1);
      offsets.set(entry.edgeId, halfBase + withinHalfFraction * 0.5);
    });
  } else {
    const centreOffset = halfBase + 0.25;
    for (const entry of sorted) {
      offsets.set(entry.edgeId, centreOffset);
    }
  }
  return offsets;
}

/**
 * Computes every edge's port assignment in one pass over `doc`.
 *
 * For each edge:
 * 1. Each endpoint's centre is `node.position` plus half of `nodeSize` — a
 *    single uniform size for every node, since this layer runs before any
 *    node has a real measured footprint; the caller supplies it.
 * 2. `sideFacing` decides which side of the source node faces the target,
 *    and which side of the target node faces the source.
 * 3. Edges are grouped per `(nodeId, side, direction)`: a single edge
 *    always contributes to exactly one `"out"` group (keyed by its source)
 *    and exactly one `"in"` group (keyed by its target).
 * 4. Each group is sorted and split into offsets by `assignOffsets` (see
 *    its doc comment for the spacing/merge rule).
 * 5. The final map combines, per edge, its `sourceOffset` (from its `"out"`
 *    group at the source) and `targetOffset` (from its `"in"` group at the
 *    target).
 *
 * Edges with an endpoint id that isn't present in `doc.nodes` are skipped
 * entirely: there is no position to compute a centre from, so no port
 * assignment is possible for them.
 */
export function computeEdgePorts(doc: GraphDocument, nodeSize: NodeSize): Map<string, EdgePorts> {
  const nodesById = new Map(doc.nodes.map((node) => [node.id, node]));
  const groupsByNode = new Map<string, SideGroups>();

  const sideGroupsFor = (nodeId: string): SideGroups => {
    const existing = groupsByNode.get(nodeId);
    if (existing !== undefined) return existing;
    const created = createSideGroups();
    groupsByNode.set(nodeId, created);
    return created;
  };

  const sidesByEdge = new Map<string, { sourceSide: Side; targetSide: Side }>();

  for (const edge of doc.edges) {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (sourceNode === undefined || targetNode === undefined) continue;

    const sourceCenter = centerOf(sourceNode.position, nodeSize);
    const targetCenter = centerOf(targetNode.position, nodeSize);
    const sourceSide = sideFacing(sourceCenter, targetCenter);
    const targetSide = sideFacing(targetCenter, sourceCenter);

    sideGroupsFor(edge.source)[sourceSide].out.push({
      edgeId: edge.id,
      otherPosition: targetNode.position,
    });
    sideGroupsFor(edge.target)[targetSide].in.push({
      edgeId: edge.id,
      otherPosition: sourceNode.position,
    });

    sidesByEdge.set(edge.id, { sourceSide, targetSide });
  }

  const outOffsets = new Map<string, number>();
  const inOffsets = new Map<string, number>();
  for (const sideGroups of groupsByNode.values()) {
    for (const side of SIDES) {
      for (const direction of DIRECTIONS) {
        const entries = sideGroups[side][direction];
        if (entries.length === 0) continue;
        const assigned = assignOffsets(entries, side, direction, nodeSize);
        const target = direction === "out" ? outOffsets : inOffsets;
        for (const [edgeId, offset] of assigned) {
          target.set(edgeId, offset);
        }
      }
    }
  }

  const result = new Map<string, EdgePorts>();
  for (const [edgeId, sides] of sidesByEdge) {
    const sourceOffset = outOffsets.get(edgeId);
    const targetOffset = inOffsets.get(edgeId);
    if (sourceOffset === undefined || targetOffset === undefined) {
      // Every edge recorded in `sidesByEdge` was pushed into exactly one
      // "out" group and one "in" group above, so both offsets are always
      // present here; this check exists only to satisfy strict
      // indexed-access typing, not because either can genuinely be missing.
      continue;
    }
    result.set(edgeId, {
      sourceSide: sides.sourceSide,
      sourceOffset,
      targetSide: sides.targetSide,
      targetOffset,
    });
  }
  return result;
}
