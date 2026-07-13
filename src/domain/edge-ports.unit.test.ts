import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION, type GraphDocument, type GraphEdge, type GraphNode } from "../schema";

import { computeEdgePorts, sideFacing } from "./edge-ports";

function node(id: string, x: number, y: number): GraphNode {
  return { id, type: "freeform", position: { x, y }, data: {} };
}

function edge(id: string, source: string, target: string): GraphEdge {
  return { id, source, target, type: "references", data: {} };
}

function documentWith(nodes: GraphNode[], edges: GraphEdge[]): GraphDocument {
  return { version: GRAPH_DOCUMENT_VERSION, name: "test", types: [], edgeTypes: [], nodes, edges };
}

describe("sideFacing", () => {
  it("picks right/left when the horizontal difference dominates", () => {
    expect(sideFacing({ x: 0, y: 0 }, { x: 100, y: 10 })).toBe("right");
    expect(sideFacing({ x: 0, y: 0 }, { x: -100, y: 10 })).toBe("left");
  });

  it("picks bottom/top when the vertical difference dominates", () => {
    expect(sideFacing({ x: 0, y: 0 }, { x: 10, y: 100 })).toBe("bottom");
    expect(sideFacing({ x: 0, y: 0 }, { x: 10, y: -100 })).toBe("top");
  });

  it("resolves an exact tie (|dx| === |dy|) to the horizontal axis, never top/bottom", () => {
    // Documented tie-break: the horizontal axis wins ties, so a perfectly
    // diagonal relationship always resolves to left/right.
    expect(sideFacing({ x: 0, y: 0 }, { x: 10, y: 10 })).toBe("right");
    expect(sideFacing({ x: 0, y: 0 }, { x: -10, y: -10 })).toBe("left");
    expect(sideFacing({ x: 0, y: 0 }, { x: 10, y: -10 })).toBe("right");
    expect(sideFacing({ x: 0, y: 0 }, { x: -10, y: 10 })).toBe("left");
  });
});

describe("computeEdgePorts", () => {
  it("gives a single edge on a side the centre of its direction's half, not the whole side's centre", () => {
    const a = node("a", 0, 0);
    const b = node("b", 1000, 0);
    const e = edge("e1", a.id, b.id);
    const doc = documentWith([a, b], [e]);

    const ports = computeEdgePorts(doc, { width: 200, height: 80 });
    const result = ports.get(e.id);
    expect(result).toBeDefined();
    if (result === undefined) return;

    // a faces right towards b: a is the source, so its offset lives in the
    // "out" half [0.5, 1) — its centre is 0.75, not 0.5 of the whole side.
    expect(result.sourceSide).toBe("right");
    expect(result.sourceOffset).toBe(0.75);
    // b faces left towards a: b is the target, so its offset lives in the
    // "in" half [0, 0.5) — its centre is 0.25.
    expect(result.targetSide).toBe("left");
    expect(result.targetOffset).toBe(0.25);
  });

  it("spreads 3 edges into the same node/side evenly when there is room, in the documented sort order", () => {
    // hub is far enough to the right of every source that the horizontal
    // difference always dominates, so every edge attaches to hub's "left"
    // side regardless of the sources' differing y positions.
    const hub = node("hub", 5000, 1000);
    const s1 = node("s1", 0, 0);
    const s2 = node("s2", 0, 500);
    const s3 = node("s3", 0, 1200);
    const e1 = edge("e1", s1.id, hub.id);
    const e2 = edge("e2", s2.id, hub.id);
    const e3 = edge("e3", s3.id, hub.id);
    const doc = documentWith([hub, s1, s2, s3], [e1, e2, e3]);

    // height=400 keeps the even-spacing gap (400/2/(3+1) = 50px) above
    // MIN_HANDLE_GAP_PX (16px), so each edge gets its own offset.
    const ports = computeEdgePorts(doc, { width: 200, height: 400 });
    const p1 = ports.get(e1.id);
    const p2 = ports.get(e2.id);
    const p3 = ports.get(e3.id);
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p3).toBeDefined();
    if (p1 === undefined || p2 === undefined || p3 === undefined) return;

    expect(p1.targetSide).toBe("left");
    expect(p2.targetSide).toBe("left");
    expect(p3.targetSide).toBe("left");

    // Sorted ascending by the other endpoint's document position.y
    // (s1=0 < s2=500 < s3=1200), so e1 < e2 < e3 in offset order, each
    // distinct, each within the "in" half [0, 0.5).
    expect(p1.targetOffset).toBeCloseTo(0.125);
    expect(p2.targetOffset).toBeCloseTo(0.25);
    expect(p3.targetOffset).toBeCloseTo(0.375);
    expect(p1.targetOffset).toBeLessThan(p2.targetOffset);
    expect(p2.targetOffset).toBeLessThan(p3.targetOffset);
  });

  it("collapses every edge in a group to the same offset once the side is too short for the minimum gap", () => {
    const hub = node("hub", 5000, 1000);
    const s1 = node("s1", 0, 0);
    const s2 = node("s2", 0, 500);
    const s3 = node("s3", 0, 1200);
    const e1 = edge("e1", s1.id, hub.id);
    const e2 = edge("e2", s2.id, hub.id);
    const e3 = edge("e3", s3.id, hub.id);
    const doc = documentWith([hub, s1, s2, s3], [e1, e2, e3]);

    // height=80 makes the even-spacing gap (80/2/(3+1) = 10px) fall below
    // MIN_HANDLE_GAP_PX (16px), forcing a full merge to the half's centre.
    const ports = computeEdgePorts(doc, { width: 200, height: 80 });
    const p1 = ports.get(e1.id);
    const p2 = ports.get(e2.id);
    const p3 = ports.get(e3.id);
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p3).toBeDefined();
    if (p1 === undefined || p2 === undefined || p3 === undefined) return;

    expect(p1.targetOffset).toBe(0.25);
    expect(p2.targetOffset).toBe(0.25);
    expect(p3.targetOffset).toBe(0.25);
  });

  it("keeps incoming and outgoing edges on the same node/side in separate, non-overlapping halves", () => {
    const hub = node("hub", 5000, 1000);
    const s1 = node("s1", 0, 0);
    const s2 = node("s2", 0, 500);
    const s3 = node("s3", 0, 900);
    const s4 = node("s4", 0, 1400);
    // s1, s2 -> hub: incoming. hub -> s3, s4: outgoing. All four neighbours
    // are far enough to the left that every edge attaches to hub's "left"
    // side, mixing both directions on the one side.
    const eIn1 = edge("eIn1", s1.id, hub.id);
    const eIn2 = edge("eIn2", s2.id, hub.id);
    const eOut1 = edge("eOut1", hub.id, s3.id);
    const eOut2 = edge("eOut2", hub.id, s4.id);
    const doc = documentWith([hub, s1, s2, s3, s4], [eIn1, eIn2, eOut1, eOut2]);

    const ports = computeEdgePorts(doc, { width: 200, height: 400 });
    const in1 = ports.get(eIn1.id);
    const in2 = ports.get(eIn2.id);
    const out1 = ports.get(eOut1.id);
    const out2 = ports.get(eOut2.id);
    expect(in1).toBeDefined();
    expect(in2).toBeDefined();
    expect(out1).toBeDefined();
    expect(out2).toBeDefined();
    if (in1 === undefined || in2 === undefined || out1 === undefined || out2 === undefined) return;

    expect(in1.targetSide).toBe("left");
    expect(in2.targetSide).toBe("left");
    expect(out1.sourceSide).toBe("left");
    expect(out2.sourceSide).toBe("left");

    const inOffsets = [in1.targetOffset, in2.targetOffset];
    const outOffsets = [out1.sourceOffset, out2.sourceOffset];
    const maxIn = Math.max(...inOffsets);
    const minOut = Math.min(...outOffsets);
    expect(maxIn).toBeLessThan(minOut);
  });
});
