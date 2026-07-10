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
 * React Flow edge with the relation shown as the edge label and the whole
 * domain edge stashed on `data`.
 */
import type { Edge, Node } from "@xyflow/react";

import type { GraphDocument, GraphEdge, GraphNode } from "@/schema";

/**
 * The React Flow node type every graphle node renders as. There is exactly one
 * React Flow component (the generic `GenericNode`); the graphle type name is
 * carried on `data.type` and resolved at render time.
 */
export const FLOW_NODE_TYPE = "default";

/** React Flow node carrying the full domain node as its data. */
export type GraphFlowNode = Node<GraphNode, typeof FLOW_NODE_TYPE>;
/** React Flow edge carrying the full domain edge as its data. */
export type GraphFlowEdge = Edge<GraphEdge>;

/**
 * Project a single domain node to a React Flow node. The constant
 * {@link FLOW_NODE_TYPE} selects the generic component; `data` is the whole
 * domain node so the component has the id, type, position, and data bag.
 */
export function nodeToFlow(node: GraphNode): GraphFlowNode {
  return {
    id: node.id,
    type: FLOW_NODE_TYPE,
    position: node.position,
    data: node,
  };
}

/**
 * Project a single domain edge to a React Flow edge. The relation is surfaced
 * as the visible `label` (React Flow renders it on the edge); the whole domain
 * edge is kept on `data` for any future edge interactions.
 */
export function edgeToFlow(edge: GraphEdge): GraphFlowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.relation,
    data: edge,
  };
}

/**
 * Project a whole document into the `{ nodes, edges }` shape React Flow
 * consumes. Memoise the result at the call site, not here: this is a plain
 * function and recomputes a fresh array each call.
 */
export function documentToFlow(document: GraphDocument): {
  nodes: GraphFlowNode[];
  edges: GraphFlowEdge[];
} {
  return {
    nodes: document.nodes.map(nodeToFlow),
    edges: document.edges.map(edgeToFlow),
  };
}
