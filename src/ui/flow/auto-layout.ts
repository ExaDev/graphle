import dagre, { type EdgeLabel, type GraphLabel, type NodeLabel } from "@dagrejs/dagre";

import type { Position } from "@/schema";

/** A node's measured on-canvas footprint, used to size and space it during layout. */
export type NodeSize = { width: number; height: number };

/**
 * Computes a new position for every node in `nodes` using dagre's layered
 * layout algorithm — rank assignment, ordering, and positioning are all
 * deterministic given the same graph and options, unlike a force/stress-based
 * layout (which starts from randomised initial positions). Running this with
 * the same arguments always produces the same result.
 *
 * Every id in `nodes` must have a matching entry in `sizes` — the caller
 * (`GraphCanvas`, which has React Flow's live measured node dimensions) is
 * responsible for completeness; this throws rather than guessing a size.
 * `edges` referencing an id outside `nodes` are ignored by dagre, so callers
 * should already have filtered to the visible node/edge set (e.g.
 * `documentToFlow`'s output) before calling this.
 */
export function computeAutoLayout(
  nodes: ReadonlyArray<{ id: string; position: Position }>,
  edges: ReadonlyArray<{ source: string; target: string }>,
  sizes: ReadonlyMap<string, NodeSize>,
  direction: "TB" | "LR",
): Map<string, Position> {
  const graph = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction });

  for (const node of nodes) {
    const size = sizes.get(node.id);
    if (size === undefined) {
      throw new Error(`computeAutoLayout: missing size for node "${node.id}"`);
    }
    graph.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const positions = new Map<string, Position>();
  for (const node of nodes) {
    const label = graph.node(node.id);
    if (label.x === undefined || label.y === undefined) {
      throw new Error(`computeAutoLayout: dagre did not assign a position to node "${node.id}"`);
    }
    positions.set(node.id, {
      x: label.x - label.width / 2,
      y: label.y - label.height / 2,
    });
  }
  return positions;
}
