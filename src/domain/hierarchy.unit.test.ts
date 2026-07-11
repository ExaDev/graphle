import { describe, expect, it } from "vitest";

import type { GraphNode } from "../schema";

import {
  childCount,
  descendantIds,
  indexNodesById,
  isHidden,
  visibleAncestor,
  wouldCreateCycle,
} from "./hierarchy";

const position = { x: 0, y: 0 };

function node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return { id, type: "freeform", position, data: {}, ...overrides };
}

describe("isHidden", () => {
  it("is false for a top-level node", () => {
    const nodes = [node("a")];
    expect(isHidden("a", indexNodesById(nodes))).toBe(false);
  });

  it("is false for the collapsed node itself", () => {
    const nodes = [node("a", { collapsed: true })];
    expect(isHidden("a", indexNodesById(nodes))).toBe(false);
  });

  it("is true for a direct child of a collapsed node", () => {
    const nodes = [node("a", { collapsed: true }), node("b", { parentId: "a" })];
    expect(isHidden("b", indexNodesById(nodes))).toBe(true);
  });

  it("is true three levels down a collapsed ancestor chain", () => {
    const nodes = [
      node("a", { collapsed: true }),
      node("b", { parentId: "a" }),
      node("c", { parentId: "b" }),
    ];
    expect(isHidden("c", indexNodesById(nodes))).toBe(true);
  });

  it("is false when the ancestor chain has no collapsed node", () => {
    const nodes = [node("a"), node("b", { parentId: "a" }), node("c", { parentId: "b" })];
    expect(isHidden("c", indexNodesById(nodes))).toBe(false);
  });
});

describe("visibleAncestor", () => {
  it("returns the node itself when not hidden", () => {
    const nodes = [node("a")];
    expect(visibleAncestor("a", indexNodesById(nodes))).toBe("a");
  });

  it("returns the collapsed parent for a hidden child", () => {
    const nodes = [node("a", { collapsed: true }), node("b", { parentId: "a" })];
    expect(visibleAncestor("b", indexNodesById(nodes))).toBe("a");
  });

  it("walks past a hidden intermediate node to the collapsed ancestor", () => {
    const nodes = [
      node("a", { collapsed: true }),
      node("b", { parentId: "a" }),
      node("c", { parentId: "b" }),
    ];
    expect(visibleAncestor("c", indexNodesById(nodes))).toBe("a");
  });
});

describe("wouldCreateCycle", () => {
  it("rejects a node becoming its own parent", () => {
    const nodes = [node("a")];
    expect(wouldCreateCycle(indexNodesById(nodes), "a", "a")).toBe(true);
  });

  it("rejects parenting a node to its own descendant", () => {
    const nodes = [node("a"), node("b", { parentId: "a" }), node("c", { parentId: "b" })];
    // a -> c would make a a child of its own grandchild c.
    expect(wouldCreateCycle(indexNodesById(nodes), "a", "c")).toBe(true);
  });

  it("allows parenting to an unrelated node", () => {
    const nodes = [node("a"), node("b")];
    expect(wouldCreateCycle(indexNodesById(nodes), "a", "b")).toBe(false);
  });
});

describe("childCount", () => {
  it("is zero for a leaf node", () => {
    const nodes = [node("a")];
    expect(childCount("a", nodes)).toBe(0);
  });

  it("counts direct children only, not grandchildren", () => {
    const nodes = [node("a"), node("b", { parentId: "a" }), node("c", { parentId: "a" }), node("d", { parentId: "b" })];
    expect(childCount("a", nodes)).toBe(2);
  });
});

describe("descendantIds", () => {
  it("is empty for a leaf node", () => {
    const nodes = [node("a")];
    expect(descendantIds("a", nodes)).toEqual([]);
  });

  it("includes children and grandchildren, not the node itself", () => {
    const nodes = [
      node("a"),
      node("b", { parentId: "a" }),
      node("c", { parentId: "a" }),
      node("d", { parentId: "b" }),
    ];
    expect(new Set(descendantIds("a", nodes))).toEqual(new Set(["b", "c", "d"]));
  });
});
