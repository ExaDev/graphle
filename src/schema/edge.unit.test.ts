import { describe, expect, it } from "vitest";

import { GraphEdge } from "./edge";

describe("GraphEdge", () => {
  it("accepts a valid edge with empty data", () => {
    const result = GraphEdge.safeParse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      type: "owns",
      data: {},
    });
    expect(result.success).toBe(true);
  });

  it("accepts an edge with data fields", () => {
    const result = GraphEdge.safeParse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      type: "references",
      data: { label: "depends on" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts any string as the type — validity is checked against the resolved edge type, not the schema", () => {
    const result = GraphEdge.safeParse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      type: "relates-to",
      data: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects an edge missing the target", () => {
    const result = GraphEdge.safeParse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      type: "tracks",
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an edge missing data", () => {
    const result = GraphEdge.safeParse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      type: "owns",
    });
    expect(result.success).toBe(false);
  });
});
