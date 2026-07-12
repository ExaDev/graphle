import { describe, expect, it } from "vitest";

import {
  BUILT_IN_EDGE_TYPES,
  BUILT_IN_TYPES,
  GRAPH_DOCUMENT_VERSION,
  GraphEdge,
  toPortableEdgeTypeDefinition,
  toPortableTypeDefinition,
  type EdgeTypeDefinition,
  type GraphDocument,
  type GraphNode,
  type NodeTypeDefinition,
} from "../schema";

import { connectedNodeIds } from "./reachability";

const position = { x: 0, y: 0 };

/** The built-in types as a document would carry them (portable form). */
const types: NodeTypeDefinition[] = BUILT_IN_TYPES.map(toPortableTypeDefinition);
/** The built-in edge types as a document would carry them (portable form). */
const edgeTypes: EdgeTypeDefinition[] = BUILT_IN_EDGE_TYPES.map(toPortableEdgeTypeDefinition);

function makeFreeform(label: string): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "freeform",
    position,
    data: { label },
  };
}

function documentWith(
  nodes: GraphNode[],
  edges: GraphDocument["edges"] = [],
): GraphDocument {
  return { version: GRAPH_DOCUMENT_VERSION, name: "test", types, edgeTypes, nodes, edges };
}

function makeEdge(source: string, target: string): GraphEdge {
  return GraphEdge.parse({
    id: crypto.randomUUID(),
    source,
    target,
    type: "references",
    data: {},
  });
}

describe("connectedNodeIds", () => {
  it("returns every node in a chain, including the seed", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const c = makeFreeform("C");
    const doc = documentWith(
      [a, b, c],
      [makeEdge(a.id, b.id), makeEdge(b.id, c.id)],
    );
    const result = connectedNodeIds(a.id, doc);
    expect(new Set(result)).toEqual(new Set([a.id, b.id, c.id]));
  });

  it("returns just the seed when it has no edges", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const doc = documentWith([a, b]);
    expect(connectedNodeIds(a.id, doc)).toEqual([a.id]);
  });

  it("does not include nodes in a disconnected component", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const c = makeFreeform("C");
    const d = makeFreeform("D");
    const doc = documentWith(
      [a, b, c, d],
      [makeEdge(a.id, b.id), makeEdge(c.id, d.id)],
    );
    const result = connectedNodeIds(a.id, doc);
    expect(new Set(result)).toEqual(new Set([a.id, b.id]));
    expect(result).not.toContain(c.id);
    expect(result).not.toContain(d.id);
  });

  it("traverses bidirectionally, finding nodes reachable only via incoming edges from the seed's perspective", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const c = makeFreeform("C");
    // b -> a and c -> b: both directed "into" the chain ending at a.
    const doc = documentWith([a, b, c], [makeEdge(b.id, a.id), makeEdge(c.id, b.id)]);
    const result = connectedNodeIds(a.id, doc);
    expect(new Set(result)).toEqual(new Set([a.id, b.id, c.id]));
  });

  it("finds a node starting the walk from a node that only ever appears as an edge target", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const doc = documentWith([a, b], [makeEdge(a.id, b.id)]);
    // Start the BFS from b, which only ever appears as a `target`.
    const result = connectedNodeIds(b.id, doc);
    expect(new Set(result)).toEqual(new Set([a.id, b.id]));
  });

  it("does not throw when the seed id is not present in doc.nodes", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a], [makeEdge(a.id, "not-a-node")]);
    const result = connectedNodeIds("not-a-node", doc);
    expect(new Set(result)).toEqual(new Set([a.id, "not-a-node"]));
  });

  it("returns just the seed id when it is absent from doc.nodes and has no edges", () => {
    const doc = documentWith([]);
    expect(connectedNodeIds("missing", doc)).toEqual(["missing"]);
  });
});
