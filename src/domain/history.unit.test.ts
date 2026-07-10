import { describe, expect, it } from "vitest";

import { MAX_UNDO_DEPTH, pushHistory } from "./history";

describe("pushHistory", () => {
  it("keeps every entry when the stack is below the cap", () => {
    const stack = [1, 2, 3];
    const next = pushHistory(stack, 4);
    expect(next).toEqual([1, 2, 3, 4]);
  });

  it("drops the oldest entries once the cap is exceeded", () => {
    const stack = Array.from({ length: MAX_UNDO_DEPTH }, (_, i) => i);
    const next = pushHistory(stack, MAX_UNDO_DEPTH);

    expect(next).toHaveLength(MAX_UNDO_DEPTH);
    // The oldest entry (0) is dropped; the newest (MAX_UNDO_DEPTH) survives at the end.
    expect(next[0]).toBe(1);
    expect(next[next.length - 1]).toBe(MAX_UNDO_DEPTH);
  });

  it("drops multiple oldest entries when pushed values overshoot the cap by more than one", () => {
    // Simulates a caller that somehow hands in an already-oversized stack; the
    // result must still be capped, trimming from the front.
    const stack = Array.from({ length: MAX_UNDO_DEPTH + 5 }, (_, i) => i);
    const next = pushHistory(stack, MAX_UNDO_DEPTH + 5);

    expect(next).toHaveLength(MAX_UNDO_DEPTH);
    expect(next[0]).toBe(6);
    expect(next[next.length - 1]).toBe(MAX_UNDO_DEPTH + 5);
  });

  it("never mutates the input array", () => {
    const stack = [1, 2, 3];
    const originalStack = stack;
    const originalLength = stack.length;
    const originalContents = [...stack];

    pushHistory(stack, 4);

    expect(stack).toBe(originalStack);
    expect(stack).toHaveLength(originalLength);
    expect(stack).toEqual(originalContents);
  });

  it("never mutates the input array even when the cap is exceeded", () => {
    const stack = Array.from({ length: MAX_UNDO_DEPTH }, (_, i) => i);
    const originalStack = stack;
    const originalContents = [...stack];

    pushHistory(stack, MAX_UNDO_DEPTH);

    expect(stack).toBe(originalStack);
    expect(stack).toEqual(originalContents);
  });

  it("returns a new array reference, distinct from the input", () => {
    const stack = [1, 2, 3];
    const next = pushHistory(stack, 4);

    expect(next).not.toBe(stack);
  });
});
