import type { Position } from "../schema";

/**
 * The minimal shape both {@link alignNodes} and {@link distributeNodes} need:
 * an id and a position. Callers pass `GraphNode[]` directly (it's a
 * structural superset) without needing to strip other fields.
 */
export interface PositionedNode {
  id: string;
  position: Position;
}

/**
 * Which edge (or centre line) to align a selection of nodes against.
 * `"left"`/`"right"` align the x axis to the selection's min/max x;
 * `"top"`/`"bottom"` align the y axis to the selection's min/max y;
 * `"centerX"`/`"centerY"` align to the average x/y.
 */
export type AlignEdge = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";

/**
 * Which axis to evenly distribute a selection of nodes along.
 */
export type DistributeAxis = "horizontal" | "vertical";

/**
 * Returns one `{ id, position }` move per input node with every node's
 * position snapped to a shared value on one axis, ready to feed directly
 * into `{ type: "moveNodes", moves: alignNodes(...) }`. Only the aligned
 * axis changes; the other axis is returned unchanged.
 *
 * `"left"`/`"right"` set every x to the selection's min/max x.
 * `"top"`/`"bottom"` set every y to the selection's min/max y.
 * `"centerX"`/`"centerY"` set every x/y to the selection's average.
 */
export function alignNodes(
  nodes: PositionedNode[],
  edge: AlignEdge,
): Array<{ id: string; position: Position }> {
  if (nodes.length === 0) {
    return [];
  }

  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);

  switch (edge) {
    case "left": {
      const targetX = Math.min(...xs);
      return nodes.map((node) => ({
        id: node.id,
        position: { x: targetX, y: node.position.y },
      }));
    }
    case "right": {
      const targetX = Math.max(...xs);
      return nodes.map((node) => ({
        id: node.id,
        position: { x: targetX, y: node.position.y },
      }));
    }
    case "top": {
      const targetY = Math.min(...ys);
      return nodes.map((node) => ({
        id: node.id,
        position: { x: node.position.x, y: targetY },
      }));
    }
    case "bottom": {
      const targetY = Math.max(...ys);
      return nodes.map((node) => ({
        id: node.id,
        position: { x: node.position.x, y: targetY },
      }));
    }
    case "centerX": {
      const targetX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
      return nodes.map((node) => ({
        id: node.id,
        position: { x: targetX, y: node.position.y },
      }));
    }
    case "centerY": {
      const targetY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
      return nodes.map((node) => ({
        id: node.id,
        position: { x: node.position.x, y: targetY },
      }));
    }
  }
}

/**
 * Returns one `{ id, position }` move per input node with the nodes spaced
 * evenly along one axis between the current min and max node on that axis
 * (which stay put), ready to feed directly into
 * `{ type: "moveNodes", moves: distributeNodes(...) }`. The other axis is
 * returned unchanged for every node.
 *
 * Distribution needs at least three points to have a meaningful "in
 * between"; with fewer than three nodes this is a no-op and every node's
 * position is returned unchanged.
 */
export function distributeNodes(
  nodes: PositionedNode[],
  axis: DistributeAxis,
): Array<{ id: string; position: Position }> {
  if (nodes.length < 3) {
    return nodes.map((node) => ({ id: node.id, position: node.position }));
  }

  const key = axis === "horizontal" ? "x" : "y";
  const sorted = [...nodes].sort((a, b) => a.position[key] - b.position[key]);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) {
    return nodes.map((node) => ({ id: node.id, position: node.position }));
  }

  const min = first.position[key];
  const max = last.position[key];
  const step = (max - min) / (sorted.length - 1);

  return sorted.map((node, index) => {
    const value = min + step * index;
    const position: Position =
      axis === "horizontal"
        ? { x: value, y: node.position.y }
        : { x: node.position.x, y: value };
    return { id: node.id, position };
  });
}
