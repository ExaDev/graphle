/**
 * Pure edge-reachability traversal over a `GraphDocument`. No React, no IO:
 * "everything connected to this node" for context-menu actions such as
 * selecting or isolating a subgraph.
 */
import type { GraphDocument } from "../schema";

/** Builds an id -> neighbour-ids adjacency map once from `edges`, treating
 *  every edge as bidirectional so both endpoints list each other. */
function buildAdjacency(edges: GraphDocument["edges"]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const addNeighbour = (from: string, to: string): void => {
    const neighbours = adjacency.get(from);
    if (neighbours === undefined) {
      adjacency.set(from, [to]);
    } else {
      neighbours.push(to);
    }
  };
  for (const edge of edges) {
    addNeighbour(edge.source, edge.target);
    addNeighbour(edge.target, edge.source);
  }
  return adjacency;
}

/**
 * Every node id reachable from `seedId` by following `doc.edges` in either
 * direction (source->target and target->source), including `seedId` itself.
 * `seedId` need not be present in `doc.nodes` — the BFS runs over whatever
 * edges reference it, and if it has none, the result is just `[seedId]`.
 */
export function connectedNodeIds(seedId: string, doc: GraphDocument): string[] {
  const adjacency = buildAdjacency(doc.edges);
  const visited = new Set<string>([seedId]);
  const queue: string[] = [seedId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) continue;
    const neighbours = adjacency.get(id);
    if (neighbours === undefined) continue;
    for (const neighbour of neighbours) {
      if (visited.has(neighbour)) continue;
      visited.add(neighbour);
      queue.push(neighbour);
    }
  }
  return [...visited];
}
