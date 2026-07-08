import { describe, expect, it } from "vitest";

import {
  GRAPH_DOCUMENT_VERSION,
  GraphEdge,
  type GraphDocument,
  GraphNode,
} from "@/schema";

import { documentToFlow, edgeToFlow, nodeToFlow } from "./to-flow";

function makeFreeform(label: string, x = 0, y = 0): GraphNode {
  return GraphNode.parse({
    id: crypto.randomUUID(),
    kind: "freeform",
    position: { x, y },
    data: { label },
  });
}

function makeOrg(login: string, x = 0, y = 0): GraphNode {
  return GraphNode.parse({
    id: crypto.randomUUID(),
    kind: "org",
    position: { x, y },
    data: { login },
  });
}

function makeIssue(number: number, x = 0, y = 0): GraphNode {
  return GraphNode.parse({
    id: crypto.randomUUID(),
    kind: "issue",
    position: { x, y },
    data: { owner: "exadev", repo: "graphle", number, title: "Sample" },
  });
}

function documentWith(
  nodes: GraphNode[],
  edges: GraphDocument["edges"] = [],
): GraphDocument {
  return { version: GRAPH_DOCUMENT_VERSION, name: "test", nodes, edges };
}

describe("nodeToFlow", () => {
  it("sets id, type to the kind, the domain position, and the whole node as data", () => {
    const node = makeFreeform("A", 10, 20);
    const flow = nodeToFlow(node);
    expect(flow.id).toBe(node.id);
    expect(flow.type).toBe("freeform");
    expect(flow.position).toEqual({ x: 10, y: 20 });
    expect(flow.data).toBe(node);
  });

  it("maps each kind to its kind string as the React Flow type", () => {
    expect(nodeToFlow(makeFreeform("A")).type).toBe("freeform");
    expect(nodeToFlow(makeOrg("exadev")).type).toBe("org");
    expect(nodeToFlow(makeIssue(7)).type).toBe("issue");
  });
});

describe("edgeToFlow", () => {
  it("sets id, source, target, the relation as label, and the whole edge as data", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: a.id,
      target: b.id,
      relation: "owns",
    });
    const flow = edgeToFlow(edge);
    expect(flow.id).toBe(edge.id);
    expect(flow.source).toBe(a.id);
    expect(flow.target).toBe(b.id);
    expect(flow.label).toBe("owns");
    expect(flow.data).toBe(edge);
  });
});

describe("documentToFlow", () => {
  it("projects an empty document to empty nodes and edges", () => {
    const flow = documentToFlow(documentWith([]));
    expect(flow.nodes).toEqual([]);
    expect(flow.edges).toEqual([]);
  });

  it("projects every node and edge, preserving counts", () => {
    const a = makeFreeform("A");
    const b = makeOrg("exadev");
    const c = makeIssue(42);
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: a.id,
      target: b.id,
      relation: "references",
    });
    const flow = documentToFlow(documentWith([a, b, c], [edge]));
    expect(flow.nodes).toHaveLength(3);
    expect(flow.edges).toHaveLength(1);
  });

  it("carries positions and kinds through for a multi-kind document", () => {
    const a = makeFreeform("A", 10, 20);
    const b = makeOrg("exadev", 30, 40);
    const c = makeIssue(3, 50, 60);
    const flow = documentToFlow(documentWith([a, b, c]));
    expect(flow.nodes[0]?.id).toBe(a.id);
    expect(flow.nodes[0]?.type).toBe("freeform");
    expect(flow.nodes[0]?.position).toEqual({ x: 10, y: 20 });
    expect(flow.nodes[0]?.data).toBe(a);
    expect(flow.nodes[1]?.type).toBe("org");
    expect(flow.nodes[1]?.position).toEqual({ x: 30, y: 40 });
    expect(flow.nodes[2]?.type).toBe("issue");
    expect(flow.nodes[2]?.position).toEqual({ x: 50, y: 60 });
  });

  it("keeps edge ids, endpoints, and the relation-as-label in projection order", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const first = GraphEdge.parse({
      id: "e1",
      source: a.id,
      target: b.id,
      relation: "owns",
    });
    const second = GraphEdge.parse({
      id: "e2",
      source: b.id,
      target: a.id,
      relation: "references",
    });
    const flow = documentToFlow(documentWith([a, b], [first, second]));
    expect(flow.edges[0]?.id).toBe("e1");
    expect(flow.edges[0]?.label).toBe("owns");
    expect(flow.edges[1]?.id).toBe("e2");
    expect(flow.edges[1]?.label).toBe("references");
  });
});
