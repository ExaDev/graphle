/**
 * Pure projection from a {@link GraphDocument} to the node/edge arrays React
 * Flow renders. This layer contains no React and no state: it is a straight
 * structural map so it can be unit-tested in isolation and memoised at the call
 * site (GraphCanvas) rather than here.
 *
 * Every domain {@link GraphNode} becomes a React Flow node stamped with the
 * single {@link FLOW_NODE_TYPE} type string, so React Flow routes them all
 * through the one generic component; the graphle node type lives on `data.type`
 * and is resolved by the component. Each domain {@link GraphEdge} becomes a
 * React Flow edge stamped with the single {@link FLOW_EDGE_TYPE} type string,
 * routing every edge through the one `FloatingEdge` component; its label and
 * line style (colour, dash pattern) are derived from its resolved edge type,
 * and the whole domain edge plus its precomputed attachment `ports` (see
 * {@link GraphFlowEdgeData}) are stashed on `data`.
 *
 * Subgraphs (`GraphNode.parentId`/`collapsed`, see `src/schema/node.ts`) are
 * resolved here too, in {@link documentToFlow}: a node hidden by a collapsed
 * ancestor is dropped from the projected array entirely (not merely styled
 * `hidden`), and an edge with exactly one hidden endpoint is rerouted to that
 * endpoint's nearest visible ancestor — "reroute to the group node" — rather
 * than hidden outright. `nodeToFlow` itself stays a pure per-node projection
 * with no document-wide knowledge, so `documentToFlow` supplies the one piece
 * of whole-document context a node's presentation needs: how many children it
 * has, via `childCount` on `data`.
 */
import type { Edge, Node } from "@xyflow/react";

import {
  childCount as countChildren,
  computeEdgePorts,
  indexNodesById,
  isHidden,
  visibleAncestor,
  type EdgePorts,
} from "@/domain";
import { resolveEdgeType } from "@/schema";
import type { EdgeTypeDefinition, GraphDocument, GraphEdge, GraphNode } from "@/schema";

/**
 * The React Flow node type every graphle node renders as. There is exactly one
 * React Flow component (the generic `GenericNode`); the graphle type name is
 * carried on `data.type` and resolved at render time.
 */
export const FLOW_NODE_TYPE = "default";

/**
 * The React Flow edge type every graphle edge renders as. There is exactly
 * one React Flow edge component, `FloatingEdge`: it computes each edge's
 * live attachment point from the domain's precomputed side/offset assignment
 * (stashed on `ports`, see {@link GraphFlowEdge}) against each endpoint's
 * live measured position, rather than pinning to a fixed handle.
 */
export const FLOW_EDGE_TYPE = "floating";

// Fallback footprint for a node React Flow hasn't measured yet (the brief
// window right after it's added, before first paint). Two call sites need a
// size for an unmeasured node: `GraphCanvas`'s auto-layout (still needs some
// size to rank and space a node) and `computeEdgePorts` below (a uniform
// size for every node, since document-level port assignment runs before any
// node has a real measured footprint). 220x80 is close to `GenericNode`'s
// typical rendered size.
export const DEFAULT_NODE_WIDTH = 220;
export const DEFAULT_NODE_HEIGHT = 80;

/** A domain node plus the one piece of whole-document context its
 *  presentation needs — see the module doc. */
export type GraphFlowNodeData = GraphNode & { childCount: number };

/** React Flow node carrying the domain node (plus `childCount`) as its data. */
export type GraphFlowNode = Node<GraphFlowNodeData, typeof FLOW_NODE_TYPE>;

/**
 * The data every {@link GraphFlowEdge} carries: the whole domain edge (under
 * `edge`, a sibling of `ports` rather than merged into it — the domain
 * `GraphEdge` type itself never gains a `ports` field), plus this edge's
 * precomputed `ports` assignment from `computeEdgePorts` (which side of each
 * endpoint it attaches to, and its offset fraction along that side).
 *
 * `ports` lives inside React Flow's `data` bag rather than as a top-level
 * `GraphFlowEdge` property: React Flow's edge renderer forwards only a
 * fixed, known set of top-level `Edge` fields as props to a custom edge
 * component (id/type/source/target/label/style/…, see `EdgeProps`) — any
 * other top-level field is invisible to the component. `data` is the one
 * caller-defined field on that list, so it is the only place `FloatingEdge`
 * can actually read `ports` from.
 */
export type GraphFlowEdgeData = { edge: GraphEdge; ports: EdgePorts };

/** React Flow edge carrying {@link GraphFlowEdgeData} (the domain edge plus
 *  its precomputed attachment ports) as its data. */
export type GraphFlowEdge = Edge<GraphFlowEdgeData, typeof FLOW_EDGE_TYPE>;

/**
 * Project a single domain node to a React Flow node. The constant
 * {@link FLOW_NODE_TYPE} selects the generic component; `data` is the whole
 * domain node (plus `childCount`, supplied by the caller — a per-node
 * function has no document-wide view of who else's `parentId` points at it)
 * so the component has the id, type, position, data bag, and child count.
 */
export function nodeToFlow(node: GraphNode, childCount: number): GraphFlowNode {
  return {
    id: node.id,
    type: FLOW_NODE_TYPE,
    position: node.position,
    data: { ...node, childCount },
  };
}

/**
 * Mantine's accent shade — the one Badge/Button render for colour-aware
 * "light"/"filled" variants. Edge lines share it with node accents so a
 * type's colour reads consistently across the canvas.
 */
const ACCENT_SHADE = 6;

/** CSS variable reference for a Mantine colour's accent shade. */
function accentColorVar(color: string): string {
  return `var(--mantine-color-${color}-${String(ACCENT_SHADE)})`;
}

/** SVG `stroke-dasharray` for each edge-type stroke style; `undefined` draws
 *  a plain solid line (React Flow's default, no dasharray needed). */
const STROKE_DASH_ARRAYS: Record<EdgeTypeDefinition["strokeStyle"], string | undefined> = {
  solid: undefined,
  dashed: "6 4",
  dotted: "1 4",
};

/**
 * The display label for a graph edge, read from `data` via the resolved
 * type's `labelField`. Falls back to the type's display label (or, last
 * resort, the raw type name) so an edge whose label field is empty still
 * shows a recognisable tag on the canvas, mirroring {@link GenericNode}'s
 * `extractLabel`.
 */
function edgeLabelText(edge: GraphEdge, type: EdgeTypeDefinition | undefined): string {
  const labelField = type?.labelField;
  if (labelField !== undefined) {
    const value = edge.data[labelField];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return type?.label ?? edge.type;
}

/** Line style (colour + dash pattern) for an edge's resolved type. */
function edgeTypeStyle(
  type: EdgeTypeDefinition | undefined,
): { stroke: string; strokeDasharray?: string } | undefined {
  if (type === undefined) return undefined;
  const dash = STROKE_DASH_ARRAYS[type.strokeStyle];
  return { stroke: accentColorVar(type.color), ...(dash !== undefined ? { strokeDasharray: dash } : {}) };
}

/**
 * Project a single domain edge to a React Flow edge. The label and line style
 * are derived from the edge's resolved type (from `edgeTypes`, falling back to
 * the built-in registry); the whole domain edge is kept on `data.edge` for any
 * future edge interactions. `ports` (this edge's precomputed side/offset
 * assignment, from `computeEdgePorts`) is threaded through by the caller —
 * this function has no document-wide view needed to compute it itself — and
 * stashed alongside it on `data.ports` for `FloatingEdge` to read.
 */
export function edgeToFlow(
  edge: GraphEdge,
  edgeTypes: EdgeTypeDefinition[],
  ports: EdgePorts,
): GraphFlowEdge {
  const type = resolveEdgeType(edgeTypes, edge.type);
  const style = edgeTypeStyle(type);
  return {
    id: edge.id,
    type: FLOW_EDGE_TYPE,
    source: edge.source,
    target: edge.target,
    label: edgeLabelText(edge, type),
    ...(style !== undefined ? { style } : {}),
    data: { edge, ports },
  };
}

/**
 * Project a whole document into the `{ nodes, edges }` shape React Flow
 * consumes. Memoise the result at the call site, not here: this is a plain
 * function and recomputes a fresh array each call.
 *
 * Nodes hidden by a collapsed ancestor (`isHidden`) are dropped entirely.
 * Edges follow both endpoints to their nearest visible ancestor
 * (`visibleAncestor` — a no-op for a node that isn't hidden): if both
 * resolve to the same node the edge is internal to one collapsed subtree
 * and is dropped (nothing meaningful to draw); if they differ, the edge is
 * rerouted to draw between the resolved endpoints — "reroute to the group
 * node" — with its `data` (label/style source) otherwise untouched.
 *
 * Edges are rerouted to their actually-drawn (visible-ancestor) endpoints
 * *before* `computeEdgePorts` ever sees them, so port assignment groups and
 * spaces edges against the node each edge is really attached to — not the
 * original, possibly-hidden endpoint. Computing ports from the original
 * endpoints would key each rerouted boundary edge's crowding group by its
 * (now invisible) child node instead of the shared group node several
 * children's edges actually converge on, defeating the crowding logic
 * `computeEdgePorts` exists to provide and misdirecting the chosen side
 * relative to the group node's real position. `computeEdgePorts` runs once
 * over the rerouted edge set (a uniform `DEFAULT_NODE_WIDTH`/
 * `DEFAULT_NODE_HEIGHT` footprint for every node, since this coarse layer
 * has no measured sizes to work from) and each edge's resulting assignment
 * is threaded into `edgeToFlow`.
 */
export function documentToFlow(document: GraphDocument): {
  nodes: GraphFlowNode[];
  edges: GraphFlowEdge[];
} {
  const nodesById = indexNodesById(document.nodes);

  const nodes = document.nodes
    .filter((node) => !isHidden(node.id, nodesById))
    .map((node) => nodeToFlow(node, countChildren(node.id, document.nodes)));

  // Resolve every edge's actually-drawn endpoints up front: an edge fully
  // internal to one collapsed subtree (both endpoints resolve to the same
  // ancestor) has nothing to draw and is dropped here, before port
  // computation ever sees it. The rerouted edges are what both port
  // assignment and rendering use from this point on.
  const routedEdges: GraphEdge[] = [];
  for (const edge of document.edges) {
    const source = visibleAncestor(edge.source, nodesById);
    const target = visibleAncestor(edge.target, nodesById);
    if (source === target) continue;
    routedEdges.push(source === edge.source && target === edge.target ? edge : { ...edge, source, target });
  }

  const edgePorts = computeEdgePorts(
    { ...document, edges: routedEdges },
    { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
  );

  const edges: GraphFlowEdge[] = [];
  for (const edge of routedEdges) {
    const ports = edgePorts.get(edge.id);
    // `computeEdgePorts` only assigns a port to an edge whose (rerouted)
    // source and target both resolve to a real node in `document.nodes`
    // (see its own doc comment) — an edge referencing a nonexistent node id
    // has no coherent attachment point to draw, so it is dropped here
    // rather than rendered with a made-up side/offset.
    if (ports === undefined) continue;
    edges.push(edgeToFlow(edge, document.edgeTypes, ports));
  }

  return { nodes, edges };
}
