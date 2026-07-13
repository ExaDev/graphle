import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";

import type { Position } from "@/schema";

/** A node's measured on-canvas footprint, used to size and space it during layout. */
export type NodeSize = { width: number; height: number };

// The spacing constants below are sized relative to GenericNode's typical
// rendered card footprint (~220x80px — see GraphCanvas's
// DEFAULT_NODE_WIDTH/DEFAULT_NODE_HEIGHT fallback, which uses the same
// figures for a node React Flow hasn't measured yet).

/**
 * Minimum gap between two nodes sharing a layer (side by side in a TB
 * layout, stacked in an LR one) — keeps adjacent cards visually separated.
 * Exported so the spacing test can assert the laid-out gap against this
 * constant rather than a repeated literal.
 */
export const IN_LAYER_NODE_SPACING_PX = 48;

// Corridor ELK reserves between an edge's routed path and any node it isn't
// connected to — the direct fix for edges cutting through unrelated cards.
const EDGE_NODE_SPACING_PX = 24;

// Minimum gap between two distinct edge routes, so parallel edges travelling
// the same corridor don't visually merge.
const EDGE_EDGE_SPACING_PX = 16;

// Gap between successive layers (rows for TB, columns for LR) — the main
// corridor edges travel through between ranks, wide enough for a full edge
// label plus routing.
const BETWEEN_LAYERS_NODE_SPACING_PX = 80;

// Extra edge-to-node clearance specifically within the between-layers
// corridor, on top of EDGE_NODE_SPACING_PX — this is what stops a
// non-adjacent-layer edge sweeping close past a node it passes.
const BETWEEN_LAYERS_EDGE_NODE_SPACING_PX = 24;

// ELK's default crossing-minimisation pass count is 7. Raised substantially
// here: at the graph sizes this tool handles (tens to hundreds of nodes)
// the extra sweeps still complete in milliseconds, and fewer crossings is
// the entire point of migrating off dagre.
const THOROUGHNESS = 30;

const ELK_ALGORITHM_LAYERED = "layered"; // Eclipse Layout Kernel's Sugiyama-style layered algorithm — proper crossing minimisation and explicit edge-node spacing, unlike dagre.
const ELK_NODE_PLACEMENT_NETWORK_SIMPLEX = "NETWORK_SIMPLEX"; // Favours straight edges over the default's more compact-but-crooked placement, keeping long edges from drifting across node rows.

const ELK_DIRECTION_BY_INPUT: Record<"TB" | "LR", string> = {
  TB: "DOWN",
  LR: "RIGHT",
};

/**
 * Computes a new position for every node in `nodes` using ELK's layered
 * (Sugiyama-style) algorithm — rank assignment, crossing minimisation, and
 * positioning are all deterministic given the same graph, options, and input
 * order, unlike a force/stress-based layout (which starts from randomised
 * initial positions). Running this with the same arguments always produces
 * the same result.
 *
 * Every id in `nodes` must have a matching entry in `sizes` — the caller
 * (`GraphCanvas`, which has React Flow's live measured node dimensions) is
 * responsible for completeness; this throws rather than guessing a size.
 * `edges` referencing an id outside `nodes` are filtered out before being
 * handed to ELK (ELK errors on an unknown edge endpoint, where dagre
 * silently ignored it), so this still matches the old contract: callers
 * should already have filtered to the visible node/edge set (e.g.
 * `documentToFlow`'s output) before calling this, and any stray edge beyond
 * that is dropped rather than crashing the layout.
 *
 * ELK's `elkjs` package is loaded via a dynamic `import()` inside this
 * function rather than a static top-level import, so Vite code-splits the
 * layout engine (a multi-hundred-kilobyte chunk) out of the main bundle and
 * it only downloads the first time a layout button is actually used. Layout
 * runs on the main thread rather than in a Web Worker: graph sizes here are
 * tens to hundreds of nodes, and ELK completes in low milliseconds at that
 * scale, so the added complexity of worker plumbing (message passing,
 * termination, error propagation) buys nothing.
 */
export async function computeAutoLayout(
  nodes: ReadonlyArray<{ id: string; position: Position }>,
  edges: ReadonlyArray<{ source: string; target: string }>,
  sizes: ReadonlyMap<string, NodeSize>,
  direction: "TB" | "LR",
): Promise<Map<string, Position>> {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();

  const children: ElkNode[] = nodes.map((node) => {
    const size = sizes.get(node.id);
    if (size === undefined) {
      throw new Error(`computeAutoLayout: missing size for node "${node.id}"`);
    }
    return { id: node.id, width: size.width, height: size.height };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const elkEdges: ElkExtendedEdge[] = visibleEdges.map((edge, index) => ({
    id: `edge-${index}`,
    sources: [edge.source],
    targets: [edge.target],
  }));

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": ELK_ALGORITHM_LAYERED,
      "elk.direction": ELK_DIRECTION_BY_INPUT[direction],
      "elk.layered.thoroughness": String(THOROUGHNESS),
      "elk.layered.nodePlacement.strategy": ELK_NODE_PLACEMENT_NETWORK_SIMPLEX,
      "elk.spacing.nodeNode": String(IN_LAYER_NODE_SPACING_PX),
      "elk.spacing.edgeNode": String(EDGE_NODE_SPACING_PX),
      "elk.spacing.edgeEdge": String(EDGE_EDGE_SPACING_PX),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(BETWEEN_LAYERS_NODE_SPACING_PX),
      "elk.layered.spacing.edgeNodeBetweenLayers": String(BETWEEN_LAYERS_EDGE_NODE_SPACING_PX),
    },
    children,
    edges: elkEdges,
  };

  const laidOut = await elk.layout(graph);

  const positions = new Map<string, Position>();
  const laidOutChildren = laidOut.children;
  if (laidOutChildren === undefined) {
    throw new Error("computeAutoLayout: ELK returned no laid-out children");
  }
  for (const child of laidOutChildren) {
    if (child.x === undefined || child.y === undefined) {
      throw new Error(`computeAutoLayout: ELK did not assign a position to node "${child.id}"`);
    }
    // ELK reports top-left coordinates directly — unlike dagre, which
    // reports node centres and needed a width/height correction here.
    positions.set(child.id, { x: child.x, y: child.y });
  }
  return positions;
}
