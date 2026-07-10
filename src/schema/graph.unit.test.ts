import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION, GraphDocumentSchema } from "./graph";
import { BUILT_IN_EDGE_TYPES_BY_NAME } from "./built-in-edge-types";
import { BUILT_IN_TYPES_BY_NAME } from "./built-in-types";

const repoType = BUILT_IN_TYPES_BY_NAME.get("repo");
if (repoType === undefined) {
  throw new Error("test fixture: built-in repo type must exist");
}

const ownsEdgeType = BUILT_IN_EDGE_TYPES_BY_NAME.get("owns");
if (ownsEdgeType === undefined) {
  throw new Error("test fixture: built-in owns edge type must exist");
}

describe("GraphDocumentSchema", () => {
  it("accepts a valid document at the current version (3) with types and edgeTypes arrays", () => {
    const result = GraphDocumentSchema.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
      types: [repoType],
      edgeTypes: [ownsEdgeType],
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a document at the old version literal (2)", () => {
    const result = GraphDocumentSchema.safeParse({
      version: 2,
      name: "Legacy",
      types: [],
      edgeTypes: [],
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a document missing the types array", () => {
    const result = GraphDocumentSchema.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
      edgeTypes: [],
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a document missing the edgeTypes array", () => {
    const result = GraphDocumentSchema.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
      types: [],
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a type definition missing required fields", () => {
    const result = GraphDocumentSchema.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
      types: [{ name: "repo" }],
      edgeTypes: [],
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an edge type definition missing required fields", () => {
    const result = GraphDocumentSchema.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
      types: [],
      edgeTypes: [{ name: "depends-on" }],
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a node carrying the legacy `kind` discriminator instead of `type`", () => {
    const result = GraphDocumentSchema.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
      types: [repoType],
      edgeTypes: [],
      nodes: [{ id: "n1", kind: "repo", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an edge carrying the legacy `relation`/`label` fields instead of `type`/`data`", () => {
    const result = GraphDocumentSchema.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
      types: [repoType],
      edgeTypes: [ownsEdgeType],
      nodes: [],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          relation: "owns",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
