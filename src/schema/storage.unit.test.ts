import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION } from "./graph";
import { StoredGraph, StoredGraphSummary, StoredTypeLibrary } from "./storage";

const now = "2024-01-15T10:30:00Z";

const document = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Demo",
  types: [],
  edgeTypes: [],
  nodes: [],
  edges: [],
};

const typeLibraryDocument = {
  version: 1,
  nodeTypes: [],
  edgeTypes: [],
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

  it("accepts a stored graph linked to a remote gist", () => {
    const result = StoredGraph.safeParse({
      id: crypto.randomUUID(),
      name: "Demo",
      document,
      createdAt: now,
      updatedAt: now,
      linkedRemote: {
        provider: "gist",
        gistId: "abc123",
        filename: "graph.json",
        syncMode: "manual",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stored graph with a malformed linkedRemote", () => {
    const result = StoredGraph.safeParse({
      id: crypto.randomUUID(),
      name: "Demo",
      document,
      createdAt: now,
      updatedAt: now,
      linkedRemote: { provider: "gist" },
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

describe("StoredTypeLibrary", () => {
  it("accepts a valid stored type library", () => {
    const result = StoredTypeLibrary.safeParse({
      id: "library",
      document: typeLibraryDocument,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an id other than the literal 'library'", () => {
    const result = StoredTypeLibrary.safeParse({
      id: crypto.randomUUID(),
      document: typeLibraryDocument,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a stored type library with a malformed updatedAt timestamp", () => {
    const result = StoredTypeLibrary.safeParse({
      id: "library",
      document: typeLibraryDocument,
      updatedAt: "yesterday",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a stored type library linked to a remote gist", () => {
    const result = StoredTypeLibrary.safeParse({
      id: "library",
      document: typeLibraryDocument,
      updatedAt: now,
      linkedRemote: {
        provider: "gist",
        gistId: "abc123",
        filename: "types.json",
        syncMode: "manual",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stored type library with a malformed linkedRemote", () => {
    const result = StoredTypeLibrary.safeParse({
      id: "library",
      document: typeLibraryDocument,
      updatedAt: now,
      linkedRemote: { provider: "gist" },
    });
    expect(result.success).toBe(false);
  });
});
