import { describe, expect, it } from "vitest";

import { computeAutoLayout, IN_LAYER_NODE_SPACING_PX, type NodeSize } from "./auto-layout";

const SIZE: NodeSize = { width: 200, height: 80 };

function sizesFor(ids: string[]): Map<string, NodeSize> {
  return new Map(ids.map((id) => [id, SIZE]));
}

/** A 2D line segment between two node centres, for the crossing test below. */
type Segment = { x1: number; y1: number; x2: number; y2: number };

// Standard segment-segment intersection test via orientation of ordered
// triples: returns true when segments (p1,p2) and (p3,p4) cross at an
// interior point (shared endpoints — e.g. two edges leaving the same node —
// are not counted as a crossing).
function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (value === 0) return 0;
  return value > 0 ? 1 : -1;
}

function pointsEqual(ax: number, ay: number, bx: number, by: number): boolean {
  return ax === bx && ay === by;
}

function segmentsCross(a: Segment, b: Segment): boolean {
  // Two edges leaving (or arriving at) the same node share an endpoint —
  // that is a fan-out/fan-in, not a crossing. Without this guard, the
  // orientation test below reports a spurious crossing for any shared
  // endpoint (the shared point sits exactly on both segments, so the
  // orientation flips across it).
  if (
    pointsEqual(a.x1, a.y1, b.x1, b.y1) ||
    pointsEqual(a.x1, a.y1, b.x2, b.y2) ||
    pointsEqual(a.x2, a.y2, b.x1, b.y1) ||
    pointsEqual(a.x2, a.y2, b.x2, b.y2)
  ) {
    return false;
  }

  const o1 = orientation(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const o2 = orientation(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const o3 = orientation(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const o4 = orientation(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  return o1 !== o2 && o3 !== o4;
}

describe("computeAutoLayout", () => {
  it("ranks a child strictly below its parent for a top-to-bottom layout", async () => {
    const nodes = [
      { id: "parent", position: { x: 0, y: 0 } },
      { id: "child", position: { x: 0, y: 0 } },
    ];
    const edges = [{ source: "parent", target: "child" }];

    const positions = await computeAutoLayout(nodes, edges, sizesFor(["parent", "child"]), "TB");

    const parent = positions.get("parent");
    const child = positions.get("child");
    if (parent === undefined || child === undefined) throw new Error("fixture: both nodes must be positioned");
    expect(child.y).toBeGreaterThan(parent.y);
  });

  it("ranks a child strictly to the right of its parent for a left-to-right layout", async () => {
    const nodes = [
      { id: "parent", position: { x: 0, y: 0 } },
      { id: "child", position: { x: 0, y: 0 } },
    ];
    const edges = [{ source: "parent", target: "child" }];

    const positions = await computeAutoLayout(nodes, edges, sizesFor(["parent", "child"]), "LR");

    const parent = positions.get("parent");
    const child = positions.get("child");
    if (parent === undefined || child === undefined) throw new Error("fixture: both nodes must be positioned");
    expect(child.x).toBeGreaterThan(parent.x);
  });

  it("positions every input node", async () => {
    const nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 0, y: 0 } },
      { id: "c", position: { x: 0, y: 0 } },
    ];
    const edges = [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
    ];

    const positions = await computeAutoLayout(nodes, edges, sizesFor(["a", "b", "c"]), "TB");

    expect([...positions.keys()].sort()).toEqual(["a", "b", "c"]);
  });

  it("is deterministic: the same graph laid out twice produces identical positions", async () => {
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

    const first = await computeAutoLayout(nodes, edges, sizes, "TB");
    const second = await computeAutoLayout(nodes, edges, sizes, "TB");

    expect([...second]).toEqual([...first]);
  });

  it("throws when a node has no matching size", async () => {
    const nodes = [{ id: "a", position: { x: 0, y: 0 } }];

    await expect(computeAutoLayout(nodes, [], new Map(), "TB")).rejects.toThrow(
      'missing size for node "a"',
    );
  });

  it("produces zero pairwise straight-line crossings for a fixture that would cross under naive ordering", async () => {
    // Two layers of two nodes each, with edges deliberately crossed relative
    // to input order (a->d, b->c rather than a->c, b->d) — a naive
    // left-to-right placement of c,d in input order would leave a->d and
    // b->c crossing. ELK's crossing minimisation should reorder the second
    // layer so the rendered straight-line segments between node centres
    // don't cross.
    const nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 0, y: 0 } },
      { id: "c", position: { x: 0, y: 0 } },
      { id: "d", position: { x: 0, y: 0 } },
    ];
    const edges = [
      { source: "a", target: "d" },
      { source: "b", target: "c" },
    ];
    const sizes = sizesFor(["a", "b", "c", "d"]);

    const positions = await computeAutoLayout(nodes, edges, sizes, "TB");

    function centreOf(id: string): { x: number; y: number } {
      const position = positions.get(id);
      if (position === undefined) throw new Error(`fixture: "${id}" must be positioned`);
      return { x: position.x + SIZE.width / 2, y: position.y + SIZE.height / 2 };
    }

    const segments: Segment[] = edges.map((edge) => {
      const source = centreOf(edge.source);
      const target = centreOf(edge.target);
      return { x1: source.x, y1: source.y, x2: target.x, y2: target.y };
    });

    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        const first = segments[i];
        const second = segments[j];
        if (first === undefined || second === undefined) throw new Error("fixture: segment must exist");
        expect(segmentsCross(first, second)).toBe(false);
      }
    }
  });

  it("does not overlap any two laid-out node rectangles, and respects the in-layer spacing constant", async () => {
    // A single root fanning out to three children puts all three children
    // in the same layer, side by side — exactly the arrangement the
    // in-layer spacing constant governs.
    const allNodes = [
      { id: "root", position: { x: 0, y: 0 } },
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 0, y: 0 } },
      { id: "c", position: { x: 0, y: 0 } },
    ];
    const allEdges = [
      { source: "root", target: "a" },
      { source: "root", target: "b" },
      { source: "root", target: "c" },
    ];
    const sizes = sizesFor(["root", "a", "b", "c"]);

    const positions = await computeAutoLayout(allNodes, allEdges, sizes, "TB");

    const rectangles = allNodes.map((node) => {
      const position = positions.get(node.id);
      if (position === undefined) throw new Error(`fixture: "${node.id}" must be positioned`);
      return {
        id: node.id,
        left: position.x,
        right: position.x + SIZE.width,
        top: position.y,
        bottom: position.y + SIZE.height,
      };
    });

    function horizontalGap(
      first: (typeof rectangles)[number],
      second: (typeof rectangles)[number],
    ): number | undefined {
      // Only meaningful for rectangles that occupy (roughly) the same rows —
      // i.e. share a layer — which is what the in-layer spacing constant
      // governs. Rectangles in different layers are separated by the larger
      // between-layers constant instead, so they're excluded here.
      const verticalOverlap = first.top < second.bottom && second.top < first.bottom;
      if (!verticalOverlap) return undefined;
      if (first.right <= second.left) return second.left - first.right;
      if (second.right <= first.left) return first.left - second.right;
      return undefined; // overlapping — reported as a failure by the assertion below.
    }

    for (let i = 0; i < rectangles.length; i += 1) {
      for (let j = i + 1; j < rectangles.length; j += 1) {
        const first = rectangles[i];
        const second = rectangles[j];
        if (first === undefined || second === undefined) throw new Error("fixture: rectangle must exist");

        const overlaps =
          first.left < second.right &&
          second.left < first.right &&
          first.top < second.bottom &&
          second.top < first.bottom;
        expect(overlaps).toBe(false);

        const gap = horizontalGap(first, second);
        if (gap !== undefined) {
          expect(gap).toBeGreaterThanOrEqual(IN_LAYER_NODE_SPACING_PX);
        }
      }
    }
  });
});
