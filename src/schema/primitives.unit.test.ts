import { describe, expect, it } from "vitest";

import { IsoTimestamp, NodeId, Position } from "./primitives";

describe("NodeId", () => {
  it("accepts a non-empty string", () => {
    expect(NodeId.safeParse("node-1").success).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(NodeId.safeParse("").success).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(NodeId.safeParse(42).success).toBe(false);
  });
});

describe("Position", () => {
  it("accepts numeric x and y", () => {
    expect(Position.safeParse({ x: 0, y: 1.5 }).success).toBe(true);
  });

  it("rejects a missing coordinate", () => {
    expect(Position.safeParse({ x: 0 }).success).toBe(false);
  });

  it("rejects a non-numeric coordinate", () => {
    expect(Position.safeParse({ x: "0", y: 0 }).success).toBe(false);
  });
});

describe("IsoTimestamp", () => {
  it("accepts a UTC ISO 8601 datetime", () => {
    expect(IsoTimestamp.safeParse("2024-01-15T10:30:00Z").success).toBe(true);
  });

  it("rejects a malformed datetime", () => {
    expect(IsoTimestamp.safeParse("15 January 2024").success).toBe(false);
  });

  it("rejects a date-only string", () => {
    expect(IsoTimestamp.safeParse("2024-01-15").success).toBe(false);
  });
});
