import { describe, expect, it } from "vitest";

import {
  BUILT_IN_EDGE_TYPES,
  BUILT_IN_TYPES,
  GRAPH_DOCUMENT_VERSION,
  toPortableEdgeTypeDefinition,
  toPortableTypeDefinition,
  type EdgeTypeDefinition,
  type GraphDocument,
  type GraphEdge,
  type GraphNode,
  type NodeTypeDefinition,
} from "../schema";

import { findSchemaDrift } from "./schema-drift";

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

function makeOrg(data: Record<string, unknown>): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "org",
    position,
    data,
  };
}

function documentWith(
  nodes: GraphNode[],
  edges: GraphDocument["edges"] = [],
): GraphDocument {
  return { version: GRAPH_DOCUMENT_VERSION, name: "test", types, edgeTypes, nodes, edges };
}

describe("findSchemaDrift", () => {
  it("returns an empty array for a document with no drift", () => {
    const doc = documentWith([makeFreeform("A"), makeOrg({ login: "exadev" })]);
    expect(findSchemaDrift(doc)).toEqual([]);
  });

  it("reports no drift for a node whose data matches its type", () => {
    const doc = documentWith([makeOrg({ login: "exadev" })]);
    expect(findSchemaDrift(doc)).toEqual([]);
  });

  it("reports drift for a node missing required data", () => {
    const node = makeOrg({});
    const doc = documentWith([node]);
    const drift = findSchemaDrift(doc);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ kind: "node", id: node.id, typeName: "org" });
    expect(drift[0]?.issues).not.toHaveLength(0);
    expect(drift[0]?.issues.some((issue) => issue.toLowerCase().includes("login"))).toBe(true);
  });

  it("reports drift for a node referencing an unknown type", () => {
    const node = makeFreeform("A");
    const doc = documentWith([{ ...node, type: "nonexistent-type" }]);
    const drift = findSchemaDrift(doc);
    expect(drift).toEqual([
      {
        kind: "node",
        id: node.id,
        typeName: "nonexistent-type",
        issues: ['Unknown type "nonexistent-type"'],
      },
    ]);
  });

  it("reports drift for an edge whose data no longer matches its type", () => {
    const source = makeFreeform("A");
    const target = makeFreeform("B");
    const edge: GraphEdge = {
      id: crypto.randomUUID(),
      source: source.id,
      target: target.id,
      type: "owns",
      data: { label: 123 },
    };
    const doc = documentWith([source, target], [edge]);
    const drift = findSchemaDrift(doc);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ kind: "edge", id: edge.id, typeName: "owns" });
    expect(drift[0]?.issues).not.toHaveLength(0);
  });
});
