import { describe, expect, it } from "vitest";

import {
  GRAPH_DOCUMENT_VERSION,
  GraphEdge,
  GraphNodeSchema,
  type EdgeTypeDefinition,
  type GraphDocument,
  type GraphNode,
} from "@/schema";

import {
  FLOW_NODE_TYPE,
  documentToFlow,
  edgeToFlow,
  nodeToFlow,
} from "./to-flow";

function makeFreeform(label: string, x = 0, y = 0): GraphNode {
  return GraphNodeSchema.parse({
    id: crypto.randomUUID(),
    type: "freeform",
    position: { x, y },
    data: { label },
  });
}

function makeOrg(login: string, x = 0, y = 0): GraphNode {
  return GraphNodeSchema.parse({
    id: crypto.randomUUID(),
    type: "org",
    position: { x, y },
    data: { login },
  });
}

function makeIssue(number: number, x = 0, y = 0): GraphNode {
  return GraphNodeSchema.parse({
    id: crypto.randomUUID(),
    type: "issue",
    position: { x, y },
    data: { owner: "exadev", repo: "graphle", number, title: "Sample" },
  });
}

/** No document-carried edge types: `edgeToFlow` falls back to the built-in registry. */
const noEdgeTypes: EdgeTypeDefinition[] = [];

function documentWith(
  nodes: GraphNode[],
  edges: GraphDocument["edges"] = [],
): GraphDocument {
  return {
    version: GRAPH_DOCUMENT_VERSION,
    name: "test",
    types: [],
    edgeTypes: noEdgeTypes,
    nodes,
    edges,
  };
}

describe("nodeToFlow", () => {
  it("sets id, the generic flow type, the domain position, and the whole node as data", () => {
    const node = makeFreeform("A", 10, 20);
    const flow = nodeToFlow(node);
    expect(flow.id).toBe(node.id);
    expect(flow.type).toBe(FLOW_NODE_TYPE);
    expect(flow.position).toEqual({ x: 10, y: 20 });
    expect(flow.data).toBe(node);
  });

  it("routes every graphle type through the single generic flow type", () => {
    expect(nodeToFlow(makeFreeform("A")).type).toBe(FLOW_NODE_TYPE);
    expect(nodeToFlow(makeOrg("exadev")).type).toBe(FLOW_NODE_TYPE);
    expect(nodeToFlow(makeIssue(7)).type).toBe(FLOW_NODE_TYPE);
  });

  it("preserves the graphle type name on data, not on the flow type", () => {
    expect(nodeToFlow(makeFreeform("A")).data.type).toBe("freeform");
    expect(nodeToFlow(makeOrg("exadev")).data.type).toBe("org");
    expect(nodeToFlow(makeIssue(7)).data.type).toBe("issue");
  });
});

describe("edgeToFlow", () => {
  it("sets id, source, target, and the whole edge as data", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: a.id,
      target: b.id,
      type: "owns",
      data: {},
    });
    const flow = edgeToFlow(edge, noEdgeTypes);
    expect(flow.id).toBe(edge.id);
    expect(flow.source).toBe(a.id);
    expect(flow.target).toBe(b.id);
    expect(flow.data).toBe(edge);
  });

  it("falls back to the resolved type's display label when data has no label field set", () => {
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      type: "owns",
      data: {},
    });
    // "owns" resolves to the built-in edge type registry (falls back since
    // `noEdgeTypes` carries no document-level override).
    expect(edgeToFlow(edge, noEdgeTypes).label).toBe("Owns");
  });

  it("uses data.label as the label when present", () => {
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      type: "references",
      data: { label: "depends on" },
    });
    expect(edgeToFlow(edge, noEdgeTypes).label).toBe("depends on");
  });

  it("derives a line style (colour + dash pattern) from the resolved type", () => {
    const dashed = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      type: "tracks",
      data: {},
    });
    const solid = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      type: "owns",
      data: {},
    });
    const dashedFlow = edgeToFlow(dashed, noEdgeTypes);
    const solidFlow = edgeToFlow(solid, noEdgeTypes);
    expect(dashedFlow.style).toMatchObject({ strokeDasharray: "6 4" });
    expect(solidFlow.style).not.toHaveProperty("strokeDasharray");
    expect(solidFlow.style).toMatchObject({ stroke: "var(--mantine-color-green-6)" });
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
      type: "references",
      data: {},
    });
    const flow = documentToFlow(documentWith([a, b, c], [edge]));
    expect(flow.nodes).toHaveLength(3);
    expect(flow.edges).toHaveLength(1);
  });

  it("carries positions and types through for a multi-type document", () => {
    const a = makeFreeform("A", 10, 20);
    const b = makeOrg("exadev", 30, 40);
    const c = makeIssue(3, 50, 60);
    const flow = documentToFlow(documentWith([a, b, c]));
    expect(flow.nodes[0]?.id).toBe(a.id);
    expect(flow.nodes[0]?.type).toBe(FLOW_NODE_TYPE);
    expect(flow.nodes[0]?.position).toEqual({ x: 10, y: 20 });
    expect(flow.nodes[0]?.data).toBe(a);
    expect(flow.nodes[1]?.data.type).toBe("org");
    expect(flow.nodes[1]?.position).toEqual({ x: 30, y: 40 });
    expect(flow.nodes[2]?.data.type).toBe("issue");
    expect(flow.nodes[2]?.position).toEqual({ x: 50, y: 60 });
  });

  it("keeps edge ids, endpoints, and projection order", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const first = GraphEdge.parse({
      id: "e1",
      source: a.id,
      target: b.id,
      type: "owns",
      data: {},
    });
    const second = GraphEdge.parse({
      id: "e2",
      source: b.id,
      target: a.id,
      type: "references",
      data: {},
    });
    const flow = documentToFlow(documentWith([a, b], [first, second]));
    expect(flow.edges[0]?.id).toBe("e1");
    expect(flow.edges[0]?.label).toBe("Owns");
    expect(flow.edges[1]?.id).toBe("e2");
    expect(flow.edges[1]?.label).toBe("References");
  });
});
