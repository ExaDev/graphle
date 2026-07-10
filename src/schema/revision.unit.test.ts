import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION } from "./graph";
import { GraphRevision } from "./revision";

const now = "2024-01-15T10:30:00Z";

const document = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Demo",
  types: [],
  edgeTypes: [],
  nodes: [],
  edges: [],
};

describe("GraphRevision", () => {
  it("accepts a valid revision and defaults origin to local", () => {
    const result = GraphRevision.safeParse({
      id: crypto.randomUUID(),
      graphId: crypto.randomUUID(),
      document,
      createdAt: now,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.origin).toBe("local");
    }
  });

  it("accepts an explicit origin and label", () => {
    const result = GraphRevision.safeParse({
      id: crypto.randomUUID(),
      graphId: crypto.randomUUID(),
      document,
      createdAt: now,
      origin: "remote-pull",
      label: "Before refactor",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.origin).toBe("remote-pull");
      expect(result.data.label).toBe("Before refactor");
    }
  });

  it("rejects an unrecognised origin", () => {
    const result = GraphRevision.safeParse({
      id: crypto.randomUUID(),
      graphId: crypto.randomUUID(),
      document,
      createdAt: now,
      origin: "manual",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a revision with a malformed createdAt timestamp", () => {
    const result = GraphRevision.safeParse({
      id: crypto.randomUUID(),
      graphId: crypto.randomUUID(),
      document,
      createdAt: "yesterday",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a revision whose nested document has the wrong version", () => {
    const result = GraphRevision.safeParse({
      id: crypto.randomUUID(),
      graphId: crypto.randomUUID(),
      document: { version: 1, name: "Demo", types: [], nodes: [], edges: [] },
      createdAt: now,
    });
    expect(result.success).toBe(false);
  });
});
