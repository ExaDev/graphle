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

import {
  GraphOperationError,
  applyOperation,
  type GraphOperation,
} from "./operations";

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

function makeOrg(login: string): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "org",
    position,
    data: { login },
  };
}

function documentWith(
  nodes: GraphNode[],
  edges: GraphDocument["edges"] = [],
): GraphDocument {
  return { version: GRAPH_DOCUMENT_VERSION, name: "test", types, edgeTypes, nodes, edges };
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

describe("applyOperation - addNodes", () => {
  it("adds every node to the document in one operation", () => {
    const doc = documentWith([]);
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const next = applyOperation(doc, { type: "addNodes", nodes: [a, b] });
    expect(next.nodes).toEqual([a, b]);
  });

  it("throws GraphOperationError when a node id already exists in the document", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    expect(() =>
      applyOperation(doc, { type: "addNodes", nodes: [makeFreeform("B"), a] }),
    ).toThrow(GraphOperationError);
  });

  it("throws GraphOperationError when the batch itself repeats an id", () => {
    const doc = documentWith([]);
    const a = makeFreeform("A");
    expect(() =>
      applyOperation(doc, { type: "addNodes", nodes: [a, { ...a }] }),
    ).toThrow(GraphOperationError);
  });

  it("does not mutate the input document", () => {
    const doc = documentWith([]);
    applyOperation(doc, { type: "addNodes", nodes: [makeFreeform("A")] });
    expect(doc.nodes).toEqual([]);
  });
});

describe("applyOperation - updateNodeData", () => {
  it("replaces a node's data when the data matches the node type", () => {
    const node = makeFreeform("A");
    const doc = documentWith([node]);
    const next = applyOperation(doc, {
      type: "updateNodeData",
      id: node.id,
      nodeType: "freeform",
      data: { label: "B", note: "updated" },
    });
    expect(next.nodes[0]?.data).toEqual({ label: "B", note: "updated" });
  });

  it("throws GraphOperationError when the data does not match the node type", () => {
    const node = makeFreeform("A");
    const doc = documentWith([node]);
    expect(() =>
      applyOperation(doc, {
        type: "updateNodeData",
        id: node.id,
        nodeType: "freeform",
        data: { login: "exadev" },
      }),
    ).toThrow(GraphOperationError);
  });

  it("throws GraphOperationError when the node type cannot be resolved", () => {
    const node = makeFreeform("A");
    const doc = documentWith([node]);
    expect(() =>
      applyOperation(doc, {
        type: "updateNodeData",
        id: node.id,
        nodeType: "no-such-type",
        data: { label: "B" },
      }),
    ).toThrow(GraphOperationError);
  });

  it("is a no-op when the id is not present", () => {
    const node = makeFreeform("A");
    const doc = documentWith([node]);
    const next = applyOperation(doc, {
      type: "updateNodeData",
      id: "missing",
      nodeType: "freeform",
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
      type: "references",
      data: {},
    });
    const edgeBC = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: b.id,
      target: c.id,
      type: "references",
      data: {},
    });
    const doc = documentWith([a, b, c], [edgeAB, edgeBC]);
    const next = applyOperation(doc, { type: "removeNode", id: b.id });
    expect(next.nodes).toEqual([a, c]);
    expect(next.edges).toEqual([]);
  });

  it("clears parentId on children of the removed node, orphaning rather than cascade-removing them", () => {
    const parent = makeFreeform("Parent");
    const child = { ...makeFreeform("Child"), parentId: parent.id };
    const doc = documentWith([parent, child]);
    const next = applyOperation(doc, { type: "removeNode", id: parent.id });
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]?.id).toBe(child.id);
    expect(next.nodes[0]?.parentId).toBeUndefined();
  });
});

describe("applyOperation - removeNodes", () => {
  it("removes every node with a listed id in one operation", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const c = makeFreeform("C");
    const doc = documentWith([a, b, c]);
    const next = applyOperation(doc, { type: "removeNodes", ids: [a.id, c.id] });
    expect(next.nodes).toEqual([b]);
  });

  it("cascades: removes every edge touching a removed id", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const c = makeFreeform("C");
    const edgeAB = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: a.id,
      target: b.id,
      type: "references",
      data: {},
    });
    const edgeBC = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: b.id,
      target: c.id,
      type: "references",
      data: {},
    });
    const doc = documentWith([a, b, c], [edgeAB, edgeBC]);
    const next = applyOperation(doc, { type: "removeNodes", ids: [a.id, b.id] });
    expect(next.nodes).toEqual([c]);
    expect(next.edges).toEqual([]);
  });

  it("clears parentId on children of removed nodes, orphaning rather than cascade-removing them", () => {
    const parent = makeFreeform("Parent");
    const child = { ...makeFreeform("Child"), parentId: parent.id };
    const other = makeFreeform("Other");
    const doc = documentWith([parent, child, other]);
    const next = applyOperation(doc, { type: "removeNodes", ids: [parent.id, other.id] });
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]?.id).toBe(child.id);
    expect(next.nodes[0]?.parentId).toBeUndefined();
  });

  it("is a no-op when none of the ids are present", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    const next = applyOperation(doc, { type: "removeNodes", ids: ["missing"] });
    expect(next.nodes).toEqual([a]);
  });
});

describe("applyOperation - setParent", () => {
  it("sets a node's parentId", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const doc = documentWith([a, b]);
    const next = applyOperation(doc, { type: "setParent", id: b.id, parentId: a.id });
    expect(next.nodes.find((n) => n.id === b.id)?.parentId).toBe(a.id);
  });

  it("clears a node's parentId when given undefined", () => {
    const a = makeFreeform("A");
    const b = { ...makeFreeform("B"), parentId: a.id };
    const doc = documentWith([a, b]);
    const next = applyOperation(doc, { type: "setParent", id: b.id, parentId: undefined });
    expect(next.nodes.find((n) => n.id === b.id)?.parentId).toBeUndefined();
  });

  it("throws GraphOperationError when the parent id does not exist", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    expect(() =>
      applyOperation(doc, { type: "setParent", id: a.id, parentId: "missing" }),
    ).toThrow(GraphOperationError);
  });

  it("throws GraphOperationError when the new parent would be its own descendant (a cycle)", () => {
    const a = makeFreeform("A");
    const b = { ...makeFreeform("B"), parentId: a.id };
    const doc = documentWith([a, b]);
    expect(() =>
      applyOperation(doc, { type: "setParent", id: a.id, parentId: b.id }),
    ).toThrow(GraphOperationError);
  });

  it("throws GraphOperationError when a node is set as its own parent", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    expect(() =>
      applyOperation(doc, { type: "setParent", id: a.id, parentId: a.id }),
    ).toThrow(GraphOperationError);
  });
});

describe("applyOperation - setCollapsed", () => {
  it("sets collapsed to true", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    const next = applyOperation(doc, { type: "setCollapsed", id: a.id, collapsed: true });
    expect(next.nodes[0]?.collapsed).toBe(true);
  });

  it("sets collapsed back to false", () => {
    const a = { ...makeFreeform("A"), collapsed: true };
    const doc = documentWith([a]);
    const next = applyOperation(doc, { type: "setCollapsed", id: a.id, collapsed: false });
    expect(next.nodes[0]?.collapsed).toBe(false);
  });

  it("is a no-op when the id is not present", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    const next = applyOperation(doc, { type: "setCollapsed", id: "missing", collapsed: true });
    expect(next.nodes).toEqual([a]);
  });
});

describe("applyOperation - groupNodes", () => {
  it("creates a group node and parents every childId onto it, in one operation", () => {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const doc = documentWith([a, b]);
    const groupId = crypto.randomUUID();
    const next = applyOperation(doc, {
      type: "groupNodes",
      groupId,
      label: "My group",
      childIds: [a.id, b.id],
      position: { x: 5, y: 5 },
    });
    const group = next.nodes.find((n) => n.id === groupId);
    expect(group?.type).toBe("group");
    expect(group?.data).toEqual({ label: "My group" });
    expect(next.nodes.find((n) => n.id === a.id)?.parentId).toBe(groupId);
    expect(next.nodes.find((n) => n.id === b.id)?.parentId).toBe(groupId);
  });

  it("throws GraphOperationError when the groupId already exists", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    expect(() =>
      applyOperation(doc, {
        type: "groupNodes",
        groupId: a.id,
        label: "Group",
        childIds: [],
        position,
      }),
    ).toThrow(GraphOperationError);
  });

  it("throws GraphOperationError when a childId does not exist", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    expect(() =>
      applyOperation(doc, {
        type: "groupNodes",
        groupId: crypto.randomUUID(),
        label: "Group",
        childIds: [a.id, "missing"],
        position,
      }),
    ).toThrow(GraphOperationError);
  });

  it("removing the group node ungroups its children rather than deleting them", () => {
    const a = makeFreeform("A");
    const doc = documentWith([a]);
    const groupId = crypto.randomUUID();
    const grouped = applyOperation(doc, {
      type: "groupNodes",
      groupId,
      label: "Group",
      childIds: [a.id],
      position,
    });
    const ungrouped = applyOperation(grouped, { type: "removeNode", id: groupId });
    expect(ungrouped.nodes).toHaveLength(1);
    expect(ungrouped.nodes[0]?.id).toBe(a.id);
    expect(ungrouped.nodes[0]?.parentId).toBeUndefined();
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
      type: "owns",
      data: {},
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
      type: "owns",
      data: {},
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
      type: "owns",
      data: {},
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
      type: "references",
      data: { label: "original" },
    });
    return { doc: documentWith([a, b], [edge]), edge };
  }

  it("replaces an edge's data when the data matches the edge type", () => {
    const { doc, edge } = docWithEdge();
    const next = applyOperation(doc, {
      type: "updateEdge",
      id: edge.id,
      edgeType: "references",
      data: { label: "renamed" },
    });
    expect(next.edges[0]?.type).toBe("references");
    expect(next.edges[0]?.data).toEqual({ label: "renamed" });
  });

  it("changes the edge's type and data together", () => {
    const { doc, edge } = docWithEdge();
    const next = applyOperation(doc, {
      type: "updateEdge",
      id: edge.id,
      edgeType: "owns",
      data: {},
    });
    expect(next.edges[0]?.type).toBe("owns");
    expect(next.edges[0]?.data).toEqual({});
  });

  it("throws GraphOperationError when the data does not match the edge type", () => {
    const { doc, edge } = docWithEdge();
    expect(() =>
      applyOperation(doc, {
        type: "updateEdge",
        id: edge.id,
        edgeType: "references",
        data: { label: 123 },
      }),
    ).toThrow(GraphOperationError);
  });

  it("throws GraphOperationError when the edge type cannot be resolved", () => {
    const { doc, edge } = docWithEdge();
    expect(() =>
      applyOperation(doc, {
        type: "updateEdge",
        id: edge.id,
        edgeType: "no-such-type",
        data: {},
      }),
    ).toThrow(GraphOperationError);
  });

  it("is a no-op when the id is not present", () => {
    const { doc, edge } = docWithEdge();
    const op: GraphOperation = {
      type: "updateEdge",
      id: "missing",
      edgeType: "references",
      data: { label: "new" },
    };
    const next = applyOperation(doc, op);
    expect(next.edges[0]).toEqual(edge);
  });

  it("clears the label (omits the key) when data omits it", () => {
    const { doc, edge } = docWithEdge();
    const next = applyOperation(doc, {
      type: "updateEdge",
      id: edge.id,
      edgeType: "references",
      data: {},
    });
    expect(next.edges[0]?.data).toEqual({});
    expect("label" in (next.edges[0]?.data ?? {})).toBe(false);
  });
});

describe("applyOperation - removeEdge", () => {
  function docWithTwoEdges() {
    const a = makeFreeform("A");
    const b = makeFreeform("B");
    const c = makeFreeform("C");
    const first = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: a.id,
      target: b.id,
      type: "references",
      data: {},
    });
    const second = GraphEdge.parse({
      id: crypto.randomUUID(),
      source: b.id,
      target: c.id,
      type: "owns",
      data: { label: "kept" },
    });
    return { doc: documentWith([a, b, c], [first, second]), first, second };
  }

  it("removes the edge with the given id", () => {
    const { doc, first, second } = docWithTwoEdges();
    const next = applyOperation(doc, { type: "removeEdge", id: first.id });
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]?.id).toBe(second.id);
  });

  it("is a no-op when the id is not present", () => {
    const { doc } = docWithTwoEdges();
    const next = applyOperation(doc, { type: "removeEdge", id: "does-not-exist" });
    expect(next.edges).toHaveLength(2);
  });

  it("does not mutate the input document", () => {
    const { doc, first } = docWithTwoEdges();
    applyOperation(doc, { type: "removeEdge", id: first.id });
    expect(doc.edges).toHaveLength(2);
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
