import { type GraphDocument, type GraphEdge, type GraphNode } from "../schema";

import { nodeIdentityKey } from "./identity";

/**
 * A batch of nodes and edges to fold into an existing document, as produced by
 * expanding a node from an external source (e.g. a GitHub fetch). The ids in a
 * delta are local to that fetch; {@link applyDelta} reconciles them against the
 * document.
 */
export type GraphDelta = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/** Builds the dedup key for an edge: its (source, target, relation) triple. */
function edgeTripleKey(
  source: string,
  target: string,
  relation: GraphEdge["relation"],
): string {
  // A NUL-delimited format avoids any collision with characters that appear in
  // ids or relations (ids are UUIDs; relations are a fixed enum).
  return `${source}\0${target}\0${relation}`;
}

/**
 * Folds `delta` into `doc`, collapsing nodes that represent the same external
 * entity and de-duplicating edges.
 *
 * Node handling:
 * - A delta node whose {@link nodeIdentityKey} matches a node already in the
 *   document (or already added from this delta) is not re-added. Instead its id
 *   is recorded in a mapping so edges that reference it are re-pointed at the
 *   surviving node.
 * - Nodes whose type has no identity fields (no identity key) are always added;
 *   every one is distinct.
 *
 * Edge handling: each delta edge's endpoints are re-pointed through the id
 * mapping, then the edge is added only if no existing or already-added edge
 * shares its (source, target, relation) triple. The edge keeps its own id,
 * relation, and label.
 *
 * Returns the new document plus the ids of the delta nodes that were actually
 * added (nodes without identity keys and first occurrences of keyed entities).
 * The input document and delta are not mutated.
 */
export function applyDelta(
  doc: GraphDocument,
  delta: GraphDelta,
): { document: GraphDocument; addedNodeIds: string[] } {
  // identityKey -> id of the node that owns that key in the merged set so far.
  const identityIndex = new Map<string, string>();
  for (const node of doc.nodes) {
    const key = nodeIdentityKey(node, doc.types);
    if (key !== undefined) {
      identityIndex.set(key, node.id);
    }
  }

  const addedNodes: GraphNode[] = [];
  const addedNodeIds: string[] = [];
  // delta node id -> id it should be treated as in the merged document. Every
  // delta node id gets an entry: either the surviving existing id (when deduped
  // against an earlier node) or its own id (when added).
  const idMapping = new Map<string, string>();

  for (const node of delta.nodes) {
    const key = nodeIdentityKey(node, doc.types);
    if (key !== undefined) {
      const survivingId = identityIndex.get(key);
      if (survivingId !== undefined) {
        idMapping.set(node.id, survivingId);
        continue;
      }
      identityIndex.set(key, node.id);
    }
    addedNodes.push(node);
    addedNodeIds.push(node.id);
    idMapping.set(node.id, node.id);
  }

  // Existing edge triples, so incoming duplicates are dropped.
  const edgeTriples = new Set<string>();
  for (const edge of doc.edges) {
    edgeTriples.add(
      edgeTripleKey(edge.source, edge.target, edge.relation),
    );
  }

  const addedEdges: GraphEdge[] = [];
  for (const edge of delta.edges) {
    const mappedSource = idMapping.get(edge.source);
    const mappedTarget = idMapping.get(edge.target);
    const source = mappedSource !== undefined ? mappedSource : edge.source;
    const target = mappedTarget !== undefined ? mappedTarget : edge.target;
    const triple = edgeTripleKey(source, target, edge.relation);
    if (edgeTriples.has(triple)) {
      continue;
    }
    edgeTriples.add(triple);
    addedEdges.push({ ...edge, source, target });
  }

  return {
    document: {
      ...doc,
      nodes: [...doc.nodes, ...addedNodes],
      edges: [...doc.edges, ...addedEdges],
    },
    addedNodeIds,
  };
}
