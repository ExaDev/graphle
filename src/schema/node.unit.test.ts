import { describe, expect, it } from "vitest";

import { GraphNodeSchema } from "./node";

const position = { x: 10, y: 20 };

describe("GraphNodeSchema", () => {
  it("accepts a valid node with a type name and opaque data record", () => {
    const result = GraphNodeSchema.safeParse({
      id: crypto.randomUUID(),
      type: "repo",
      position,
      data: { owner: "exadev", name: "graphle" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts any string as the type (registry-independent loading)", () => {
    const result = GraphNodeSchema.safeParse({
      id: "n1",
      type: "anything-custom",
      position,
      data: { arbitrary: true },
    });
    expect(result.success).toBe(true);
  });

  it("preserves the full data record on parse", () => {
    const data = { owner: "exadev", name: "graphle", url: "https://example" };
    const result = GraphNodeSchema.safeParse({
      id: "n1",
      type: "repo",
      position,
      data,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).toEqual(data);
    }
  });

  it("rejects a node with an empty id", () => {
    const result = GraphNodeSchema.safeParse({
      id: "",
      type: "repo",
      position,
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a node missing the type field", () => {
    const result = GraphNodeSchema.safeParse({
      id: "n1",
      position,
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a node missing the position", () => {
    const result = GraphNodeSchema.safeParse({
      id: "n1",
      type: "org",
      data: { login: "exadev" },
    });
    expect(result.success).toBe(false);
  });
});
