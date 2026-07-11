import { describe, expect, it } from "vitest";

import { computeAutoLayout, type NodeSize } from "./auto-layout";

const SIZE: NodeSize = { width: 200, height: 80 };

function sizesFor(ids: string[]): Map<string, NodeSize> {
  return new Map(ids.map((id) => [id, SIZE]));
}

describe("computeAutoLayout", () => {
  it("ranks a child strictly below its parent for a top-to-bottom layout", () => {
    const nodes = [
      { id: "parent", position: { x: 0, y: 0 } },
      { id: "child", position: { x: 0, y: 0 } },
    ];
    const edges = [{ source: "parent", target: "child" }];

    const positions = computeAutoLayout(nodes, edges, sizesFor(["parent", "child"]), "TB");

    const parent = positions.get("parent");
    const child = positions.get("child");
    if (parent === undefined || child === undefined) throw new Error("fixture: both nodes must be positioned");
    expect(child.y).toBeGreaterThan(parent.y);
  });

  it("ranks a child strictly to the right of its parent for a left-to-right layout", () => {
    const nodes = [
      { id: "parent", position: { x: 0, y: 0 } },
      { id: "child", position: { x: 0, y: 0 } },
    ];
    const edges = [{ source: "parent", target: "child" }];

    const positions = computeAutoLayout(nodes, edges, sizesFor(["parent", "child"]), "LR");

    const parent = positions.get("parent");
    const child = positions.get("child");
    if (parent === undefined || child === undefined) throw new Error("fixture: both nodes must be positioned");
    expect(child.x).toBeGreaterThan(parent.x);
  });

  it("positions every input node", () => {
    const nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 0, y: 0 } },
      { id: "c", position: { x: 0, y: 0 } },
    ];
    const edges = [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
    ];

    const positions = computeAutoLayout(nodes, edges, sizesFor(["a", "b", "c"]), "TB");

    expect([...positions.keys()].sort()).toEqual(["a", "b", "c"]);
  });

  it("is deterministic: the same graph laid out twice produces identical positions", () => {
    const nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 0, y: 0 } },
      { id: "c", position: { x: 0, y: 0 } },
      { id: "d", position: { x: 0, y: 0 } },
    ];
    const edges = [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
      { source: "b", target: "d" },
      { source: "c", target: "d" },
    ];
    const sizes = sizesFor(["a", "b", "c", "d"]);

    const first = computeAutoLayout(nodes, edges, sizes, "TB");
    const second = computeAutoLayout(nodes, edges, sizes, "TB");

    expect([...second]).toEqual([...first]);
  });

  it("throws when a node has no matching size", () => {
    const nodes = [{ id: "a", position: { x: 0, y: 0 } }];

    expect(() => computeAutoLayout(nodes, [], new Map(), "TB")).toThrow(
      'missing size for node "a"',
    );
  });
});
