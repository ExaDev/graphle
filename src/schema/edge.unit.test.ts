import { describe, expect, it } from "vitest";

import { GraphEdge } from "./edge";

describe("GraphEdge", () => {
  it("accepts a valid edge without a label", () => {
    const result = GraphEdge.safeParse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      relation: "owns",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an edge with an optional label", () => {
    const result = GraphEdge.safeParse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      relation: "references",
      label: "depends on",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an edge with an unknown relation", () => {
    const result = GraphEdge.safeParse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      target: crypto.randomUUID(),
      relation: "relates-to",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an edge missing the target", () => {
    const result = GraphEdge.safeParse({
      id: crypto.randomUUID(),
      source: crypto.randomUUID(),
      relation: "tracks",
    });
    expect(result.success).toBe(false);
  });
});
