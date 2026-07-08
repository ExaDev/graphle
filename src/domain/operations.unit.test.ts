import { describe, expect, it } from "vitest";

import {
  GRAPH_DOCUMENT_VERSION,
  GraphEdge,
  type GraphDocument,
  GraphNode,
} from "../schema";

import {
  GraphOperationError,
  applyOperation,
  type GraphOperation,
} from "./operations";

const position = { x: 0, y: 0 };

function makeFreeform(label: string): GraphNode {
  return GraphNode.parse({
    id: crypto.randomUUID(),
    kind: "freeform",
    position,
    data: { label },
  });
}

function makeOrg(login: string): GraphNode {
  return GraphNode.parse({
    id: crypto.randomUUID(),
    kind: "org",
    position,
    data: { login },
  });
}

function documentWith(
  nodes: GraphNode[],
  edges: GraphDocument["edges"] = [],
): GraphDocument {
  return { version: GRAPH_DOCUMENT_VERSION, name: "test", nodes, edges };
}

describe("applyOperation - addNode", () => {
  it("adds a node to an empty document", () => {
    const doc = documentWith([]);
    const node = makeFreeform("A");
    const next = applyOperation(doc, { type: "addNode", node });
    expect(next.nodes).toEqual([node]);
  });

  it("throws GraphOperationError when a node with the same id already exists", () => {
    const node = makeFreeform("A");
    const doc = documentWith([node]);
    expect(() =>
      applyOperation(doc, { type: "addNode", node }),
    ).toThrow(GraphOperationError);
  });

  it("does not mutate the input document", () => {
    const doc = documentWith([]);
    applyOperation(doc, { type: "addNode", node: makeFreeform("A") });
    expect(doc.nodes).toEqual([]);
  });
});

describe("applyOperation - updateNodeData", () => {
  it("replaces a node's data when the data matches the node kind", () => {
    const node = makeFreeform("A");
    const doc = documentWith([node]);
    const next = applyOperation(doc, {
      type: "updateNodeData",
      id: node.id,
      data: { label: "B", note: "updated" },
    });
    expect(next.nodes[0]?.data).toEqual({ label: "B", note: "updated" });
  });

  it("throws GraphOperationError when the data does not match the node kind", () => {
    const node = makeFreeform("A");
    const doc = documentWith([node]);
    expect(() =>
      applyOperation(doc, {
        type: "updateNodeData",
        id: node.id,
        data: { login: "exadev" },
      }),
    ).toThrow(GraphOperationError);
  });

  it("is a no-op when the id is not present", () => {
    const node = makeFreeform("A");
    const doc = documentWith([node]);
    const next = applyOperation(doc, {
      type: "updateNodeData",
      id: "missing",
      data: { label: "B" },
    });
    expect(next.nodes).toEqual([node]);
  });
});

describe("applyOperation - moveNodes", () => {
  it("updates the position of each moved node", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const doc = documentWith([a, b]);
    const next = applyOperation(doc, {
      type: "moveNodes",
      moves: [
        { id: a.id, position: { x: 10, y: 20 } },
        { id: b.id, position: { x: 30, y: 40 } },
      ],
    });
    expect(next.nodes[0]?.position).toEqual({ x: 10, y: 20 });
    expect(next.nodes[1]?.position).toEqual({ x: 30, y: 40 });
  });

  it("leaves nodes not listed in moves untouched", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    const next = applyOperation(doc, { type: "moveNodes", moves: [] });
    expect(next.nodes[0]?.position).toEqual(position);
  });
});

describe("applyOperation - removeNode", () => {
  it("removes the node with the given id", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const doc = documentWith([a, b]);
    const next = applyOperation(doc, { type: "removeNode", id: a.id });
    expect(next.nodes).toEqual([b]);
  });

  it("cascades: removes every edge whose source or target is the removed id", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const c = makeFreeform("C");
    const edgeAB = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: a.id,
      target: b.id,
      relation: "references",
    });
    const edgeBC = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: b.id,
      target: c.id,
      relation: "references",
    });
    const doc = documentWith([a, b, c], [edgeAB, edgeBC]);
    const next = applyOperation(doc, { type: "removeNode", id: b.id });
    expect(next.nodes).toEqual([a, c]);
    expect(next.edges).toEqual([]);
  });
});

describe("applyOperation - addEdge", () => {
  it("adds an edge when both endpoints exist", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const doc = documentWith([a, b]);
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: a.id,
      target: b.id,
      relation: "owns",
    });
    const next = applyOperation(doc, { type: "addEdge", edge });
    expect(next.edges).toEqual([edge]);
  });

  it("throws GraphOperationError when the source node is missing", () => {
    const b = makeFreeform("B");
    const doc = documentWith([b]);
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: b.id,
      relation: "owns",
    });
    expect(() => applyOperation(doc, { type: "addEdge", edge })).toThrow(
      GraphOperationError,
    );
  });

  it("throws GraphOperationError when the target node is missing", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: a.id,
      target: crypto.randomUUID(),
      relation: "owns",
    });
    expect(() => applyOperation(doc, { type: "addEdge", edge })).toThrow(
      GraphOperationError,
    );
  });
});

describe("applyOperation - updateEdge", () => {
  function docWithEdge() {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const edge = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: a.id,
      target: b.id,
      relation: "references",
      label: "original",
    });
    return { doc: documentWith([a, b], [edge]), edge };
  }

  it("updates only the relation when only relation is supplied (label preserved)", () => {
    const { doc, edge } = docWithEdge();
    const next = applyOperation(doc, {
      type: "updateEdge",
      id: edge.id,
      relation: "owns",
    });
    expect(next.edges[0]?.relation).toBe("owns");
    expect(next.edges[0]?.label).toBe("original");
  });

  it("updates only the label when only label is supplied (relation preserved)", () => {
    const { doc, edge } = docWithEdge();
    const next = applyOperation(doc, {
      type: "updateEdge",
      id: edge.id,
      label: "renamed",
    });
    expect(next.edges[0]?.relation).toBe("references");
    expect(next.edges[0]?.label).toBe("renamed");
  });

  it("updates both relation and label when both are supplied", () => {
    const { doc, edge } = docWithEdge();
    const next = applyOperation(doc, {
      type: "updateEdge",
      id: edge.id,
      relation: "contains",
      label: "renamed",
    });
    expect(next.edges[0]?.relation).toBe("contains");
    expect(next.edges[0]?.label).toBe("renamed");
  });

  it("is a no-op when neither field is supplied", () => {
    const { doc, edge } = docWithEdge();
    const op: GraphOperation = { type: "updateEdge", id: edge.id };
    const next = applyOperation(doc, op);
    expect(next.edges[0]?.relation).toBe("references");
    expect(next.edges[0]?.label).toBe("original");
  });
});

describe("applyOperation - renameGraph", () => {
  it("sets the document name", () => {
    const doc = documentWith([]);
    const next = applyOperation(doc, { type: "renameGraph", name: "renamed" });
    expect(next.name).toBe("renamed");
  });
});

describe("applyOperation - replaceDocument", () => {
  it("returns the replacement document", () => {
    const doc = documentWith([makeFreeform("A")]);
    const replacement = documentWith([makeOrg("exadev")]);
    const next = applyOperation(doc, {
      type: "replaceDocument",
      document: replacement,
    });
    expect(next).toBe(replacement);
  });
});
