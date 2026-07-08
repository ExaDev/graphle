import { describe, expect, it } from "vitest";

import { GraphNode } from "./node";

const position = { x: 10, y: 20 };

describe("GraphNode", () => {
  it("accepts a valid freeform node", () => {
    const result = GraphNode.safeParse({
      id: crypto.randomUUID(),
      kind: "freeform",
      position,
      data: { label: "My note" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("freeform");
    }
  });

  it("accepts a valid org node", () => {
    const result = GraphNode.safeParse({
      id: crypto.randomUUID(),
      kind: "org",
      position,
      data: { login: "exadev" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid repo node", () => {
    const result = GraphNode.safeParse({
      id: crypto.randomUUID(),
      kind: "repo",
      position,
      data: { owner: "exadev", name: "graphle" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid issue node", () => {
    const result = GraphNode.safeParse({
      id: crypto.randomUUID(),
      kind: "issue",
      position,
      data: { owner: "exadev", repo: "graphle", number: 1, title: "Bug" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid project node", () => {
    const result = GraphNode.safeParse({
      id: crypto.randomUUID(),
      kind: "project",
      position,
      data: { owner: "exadev", number: 1, title: "Roadmap" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a node with an unknown kind discriminator", () => {
    const result = GraphNode.safeParse({
      id: crypto.randomUUID(),
      kind: "unknown",
      position,
      data: { label: "x" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a repo node missing a required data field (name)", () => {
    const result = GraphNode.safeParse({
      id: crypto.randomUUID(),
      kind: "repo",
      position,
      data: { owner: "exadev" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a freeform node with an empty label", () => {
    const result = GraphNode.safeParse({
      id: crypto.randomUUID(),
      kind: "freeform",
      position,
      data: { label: "" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an issue node whose number is not an integer", () => {
    const result = GraphNode.safeParse({
      id: crypto.randomUUID(),
      kind: "issue",
      position,
      data: { owner: "exadev", repo: "graphle", number: 1.5, title: "Bug" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a node missing the position", () => {
    const result = GraphNode.safeParse({
      id: crypto.randomUUID(),
      kind: "org",
      data: { login: "exadev" },
    });
    expect(result.success).toBe(false);
  });
});
