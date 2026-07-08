import { describe, expect, it } from "vitest";

import {
  EXPANSION_ANGLE_STEP,
  EXPANSION_RADIUS,
  placeAround,
} from "./layout";

describe("placeAround", () => {
  it("returns an empty array for a count of zero", () => {
    expect(placeAround({ x: 0, y: 0 }, 0)).toEqual([]);
  });

  it("returns exactly `count` positions", () => {
    expect(placeAround({ x: 0, y: 0 }, 1)).toHaveLength(1);
    expect(placeAround({ x: 0, y: 0 }, 5)).toHaveLength(5);
    expect(placeAround({ x: 0, y: 0 }, 10)).toHaveLength(10);
  });

  it("places the first slot directly to the right of the origin (angle 0)", () => {
    const [first] = placeAround({ x: 0, y: 0 }, 1);
    expect(first).toEqual({ x: EXPANSION_RADIUS, y: 0 });
  });

  it("applies the origin offset to every position", () => {
    const positions = placeAround({ x: 100, y: -50 }, 1);
    expect(positions[0]).toEqual({ x: 100 + EXPANSION_RADIUS, y: -50 });
  });

  it("advances each slot by EXPANSION_ANGLE_STEP", () => {
    const [first, second] = placeAround({ x: 0, y: 0 }, 2);
    if (first === undefined || second === undefined) {
      throw new Error("expected two positions");
    }
    expect(second.x).toBeCloseTo(
      EXPANSION_RADIUS * Math.cos(EXPANSION_ANGLE_STEP),
    );
    expect(second.y).toBeCloseTo(
      EXPANSION_RADIUS * Math.sin(EXPANSION_ANGLE_STEP),
    );
  });

  it("is deterministic: the same inputs always produce the same output", () => {
    const origin = { x: 42, y: -7 };
    expect(placeAround(origin, 8)).toEqual(placeAround(origin, 8));
  });

  it("produces distinct positions for a single ring (count <= 8)", () => {
    const positions = placeAround({ x: 0, y: 0 }, 8);
    const keys = new Set(positions.map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(8);
  });
});
