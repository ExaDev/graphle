import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION, GraphDocumentSchema } from "./graph";
import { BUILT_IN_TYPES_BY_NAME } from "./built-in-types";

const repoType = BUILT_IN_TYPES_BY_NAME.get("repo");
if (repoType === undefined) {
  throw new Error("test fixture: built-in repo type must exist");
}

describe("GraphDocumentSchema", () => {
  it("accepts a valid document at the current version (2) with a types array", () => {
    const result = GraphDocumentSchema.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
      types: [repoType],
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a document at the old version literal (1)", () => {
    const result = GraphDocumentSchema.safeParse({
      version: 1,
      name: "Legacy",
      types: [],
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a document missing the types array", () => {
    const result = GraphDocumentSchema.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
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
      nodes: [{ id: "n1", kind: "repo", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    });
    expect(result.success).toBe(false);
  });
});
