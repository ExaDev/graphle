import { describe, expect, it } from "vitest";

import type { EdgePorts } from "@/domain";
import {
  GRAPH_DOCUMENT_VERSION,
  GraphEdge,
  GraphNodeSchema,
  type EdgeTypeDefinition,
  type GraphDocument,
  type GraphNode,
} from "@/schema";

import {
  FLOW_EDGE_TYPE,
  FLOW_NODE_TYPE,
  documentToFlow,
  edgeToFlow,
  nodeToFlow,
} from "./to-flow";

/** A fixed port assignment for `edgeToFlow` unit tests that don't exercise
 *  `computeEdgePorts` itself (that's `edge-ports.unit.test.ts`'s job) — only
 *  its passthrough onto the projected `GraphFlowEdge`. */
const samplePorts: EdgePorts = {
  sourceSide: "right",
  sourceOffset: 0.5,
  targetSide: "left",
  targetOffset: 0.5,
};

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
  it("sets id, the generic flow type, the domain position, and the whole node (plus childCount) as data", () => {
    const node = makeFreeform("A", 10, 20);
    const flow = nodeToFlow(node, 0);
    expect(flow.id).toBe(node.id);
    expect(flow.type).toBe(FLOW_NODE_TYPE);
    expect(flow.position).toEqual({ x: 10, y: 20 });
    expect(flow.data).toMatchObject(node);
    expect(flow.data.childCount).toBe(0);
  });

  it("stamps the given childCount onto data", () => {
    const node = makeFreeform("A");
    expect(nodeToFlow(node, 3).data.childCount).toBe(3);
  });

  it("routes every graphle type through the single generic flow type", () => {
    expect(nodeToFlow(makeFreeform("A"), 0).type).toBe(FLOW_NODE_TYPE);
    expect(nodeToFlow(makeOrg("exadev"), 0).type).toBe(FLOW_NODE_TYPE);
    expect(nodeToFlow(makeIssue(7), 0).type).toBe(FLOW_NODE_TYPE);
  });

  it("preserves the graphle type name on data, not on the flow type", () => {
    expect(nodeToFlow(makeFreeform("A"), 0).data.type).toBe("freeform");
    expect(nodeToFlow(makeOrg("exadev"), 0).data.type).toBe("org");
    expect(nodeToFlow(makeIssue(7), 0).data.type).toBe("issue");
  });
});

describe("edgeToFlow", () => {
  it("sets id, the floating flow type, source, target, the whole edge as data.edge, and ports as data.ports", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: a.id,
      target: b.id,
      type: "owns",
      data: {},
    });
    const flow = edgeToFlow(edge, noEdgeTypes, samplePorts);
    expect(flow.id).toBe(edge.id);
    expect(flow.type).toBe(FLOW_EDGE_TYPE);
    expect(flow.source).toBe(a.id);
    expect(flow.target).toBe(b.id);
    expect(flow.data?.edge).toBe(edge);
    expect(flow.data?.ports).toEqual(samplePorts);
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
    expect(edgeToFlow(edge, noEdgeTypes, samplePorts).label).toBe("Owns");
  });

  it("uses data.label as the label when present", () => {
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      type: "references",
      data: { label: "depends on" },
    });
    expect(edgeToFlow(edge, noEdgeTypes, samplePorts).label).toBe("depends on");
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
    const dashedFlow = edgeToFlow(dashed, noEdgeTypes, samplePorts);
    const solidFlow = edgeToFlow(solid, noEdgeTypes, samplePorts);
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
    expect(flow.nodes[0]?.data).toMatchObject(a);
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

  it("stamps childCount onto each node, zero for a leaf", () => {
    const parent = makeFreeform("Parent");
    const childA = { ...makeFreeform("A"), parentId: parent.id };
    const childB = { ...makeFreeform("B"), parentId: parent.id };
    const flow = documentToFlow(documentWith([parent, childA, childB]));
    const parentFlow = flow.nodes.find((n) => n.id === parent.id);
    expect(parentFlow?.data.childCount).toBe(2);
    expect(flow.nodes.find((n) => n.id === childA.id)?.data.childCount).toBe(0);
  });

  it("drops nodes hidden by a collapsed ancestor", () => {
    const parent = { ...makeFreeform("Parent"), collapsed: true };
    const child = { ...makeFreeform("Child"), parentId: parent.id };
    const flow = documentToFlow(documentWith([parent, child]));
    expect(flow.nodes.map((n) => n.id)).toEqual([parent.id]);
  });

  it("keeps an uncollapsed graph's node/edge output unchanged from before subgraphs existed", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const edge = GraphEdge.parse({
      id: "e1",
      source: a.id,
      target: b.id,
      type: "owns",
      data: {},
    });
    const flow = documentToFlow(documentWith([a, b], [edge]));
    expect(flow.nodes.map((n) => n.id)).toEqual([a.id, b.id]);
    expect(flow.edges).toHaveLength(1);
    expect(flow.edges[0]?.source).toBe(a.id);
    expect(flow.edges[0]?.target).toBe(b.id);
  });

  it("drops an edge fully internal to one collapsed subtree", () => {
    const parent = { ...makeFreeform("Parent"), collapsed: true };
    const childA = { ...makeFreeform("A"), parentId: parent.id };
    const childB = { ...makeFreeform("B"), parentId: parent.id };
    const edge = GraphEdge.parse({
      id: "e1",
      source: childA.id,
      target: childB.id,
      type: "references",
      data: {},
    });
    const flow = documentToFlow(documentWith([parent, childA, childB], [edge]));
    expect(flow.edges).toEqual([]);
  });

  it("reroutes an edge from a hidden node to its nearest visible ancestor", () => {
    const parent = { ...makeFreeform("Parent"), collapsed: true };
    const child = { ...makeFreeform("Child"), parentId: parent.id };
    const outside = makeFreeform("Outside");
    const edge = GraphEdge.parse({
      id: "e1",
      source: child.id,
      target: outside.id,
      type: "references",
      data: {},
    });
    const flow = documentToFlow(documentWith([parent, child, outside], [edge]));
    expect(flow.edges).toHaveLength(1);
    expect(flow.edges[0]?.source).toBe(parent.id);
    expect(flow.edges[0]?.target).toBe(outside.id);
  });

  it("computes a rerouted edge's port assignment from the visible ancestor's position, not the hidden original endpoint's", () => {
    // The child sits far to the left of "outside", so a port computation
    // keyed by the *original* endpoint would face the edge "right" (child
    // faces towards outside, which is to its right). But the edge is drawn
    // from the group node the child is rerouted to, and the group sits to
    // the right of "outside" — so the attachment side computed from the
    // group's own position is "left", the opposite of what the original
    // endpoint would produce.
    const parent = { ...makeFreeform("Parent", 1000, 0), collapsed: true };
    const child = { ...makeFreeform("Child", 0, 0), parentId: parent.id };
    const outside = makeFreeform("Outside", 500, 0);
    const edge = GraphEdge.parse({
      id: "e1",
      source: child.id,
      target: outside.id,
      type: "references",
      data: {},
    });
    const flow = documentToFlow(documentWith([parent, child, outside], [edge]));
    expect(flow.edges).toHaveLength(1);
    const rendered = flow.edges[0];
    expect(rendered).toBeDefined();
    if (rendered === undefined) return;
    expect(rendered.source).toBe(parent.id);
    const { data } = rendered;
    expect(data).toBeDefined();
    if (data === undefined) return;
    expect(data.ports.sourceSide).toBe("left");
  });

  it("gives a collapsed group's boundary edges the same port assignment they would get attached to the group node directly", () => {
    // Two hidden children (each positioned nowhere near the group, to prove
    // their own position isn't what drives the result) each contribute one
    // boundary edge. Collapsing the group and rerouting its children's
    // edges must not change the geometry of those edges at all: it should
    // be indistinguishable from the two edges having attached to the group
    // node directly all along.
    const parent = makeFreeform("Parent", 1000, 0);
    const outsideA = makeFreeform("OutsideA", 0, -2000);
    const outsideB = makeFreeform("OutsideB", 3000, 0);

    const baseline = documentToFlow(
      documentWith(
        [parent, outsideA, outsideB],
        [
          GraphEdge.parse({ id: "eA", source: parent.id, target: outsideA.id, type: "references", data: {} }),
          GraphEdge.parse({ id: "eB", source: parent.id, target: outsideB.id, type: "references", data: {} }),
        ],
      ),
    );

    const collapsedParent = { ...parent, collapsed: true };
    const childA = { ...makeFreeform("ChildA", 5000, -1900), parentId: parent.id };
    const childB = { ...makeFreeform("ChildB", 0, 5000), parentId: parent.id };
    const collapsed = documentToFlow(
      documentWith(
        [collapsedParent, childA, childB, outsideA, outsideB],
        [
          GraphEdge.parse({ id: "eA", source: childA.id, target: outsideA.id, type: "references", data: {} }),
          GraphEdge.parse({ id: "eB", source: childB.id, target: outsideB.id, type: "references", data: {} }),
        ],
      ),
    );

    for (const edgeId of ["eA", "eB"]) {
      const baselinePorts = baseline.edges.find((e) => e.id === edgeId)?.data?.ports;
      const collapsedPorts = collapsed.edges.find((e) => e.id === edgeId)?.data?.ports;
      expect(baselinePorts).toBeDefined();
      expect(collapsedPorts).toBeDefined();
      if (baselinePorts === undefined || collapsedPorts === undefined) continue;
      expect(collapsedPorts).toEqual(baselinePorts);
    }
  });
});
