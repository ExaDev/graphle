import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION, GraphDocument } from "./graph";

describe("GraphDocument", () => {
  it("accepts a valid document at the current version", () => {
    const result = GraphDocument.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a document at the wrong version literal (2)", () => {
    const result = GraphDocument.safeParse({
      version: 2,
      name: "Future",
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a document missing the name", () => {
    const result = GraphDocument.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a document whose nodes are not valid graph nodes", () => {
    const result = GraphDocument.safeParse({
      version: GRAPH_DOCUMENT_VERSION,
      name: "Demo",
      nodes: [{ id: "n1", kind: "nope", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    });
    expect(result.success).toBe(false);
  });
});
