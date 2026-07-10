import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION } from "./graph";
import { StoredGraph, StoredGraphSummary } from "./storage";

const now = "2024-01-15T10:30:00Z";

const document = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Demo",
  types: [],
  nodes: [],
  edges: [],
};

describe("StoredGraph", () => {
  it("accepts a valid stored graph", () => {
    const result = StoredGraph.safeParse({
      id: crypto.randomUUID(),
      name: "Demo",
      document,
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stored graph with a malformed createdAt timestamp", () => {
    const result = StoredGraph.safeParse({
      id: crypto.randomUUID(),
      name: "Demo",
      document,
      createdAt: "yesterday",
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a stored graph whose nested document has the wrong version", () => {
    const result = StoredGraph.safeParse({
      id: crypto.randomUUID(),
      name: "Demo",
      document: { version: 1, name: "Demo", types: [], nodes: [], edges: [] },
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });
});

describe("StoredGraphSummary", () => {
  it("accepts a valid summary", () => {
    const result = StoredGraphSummary.safeParse({
      id: crypto.randomUUID(),
      name: "Demo",
      updatedAt: now,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a summary missing the updatedAt field", () => {
    const result = StoredGraphSummary.safeParse({
      id: crypto.randomUUID(),
      name: "Demo",
    });
    expect(result.success).toBe(false);
  });
});
