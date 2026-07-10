/**
 * Undo/redo support for the graph editor, implemented as whole-document
 * snapshotting rather than per-operation inverses. {@link GraphOperation}
 * variants in `./operations` do not carry enough prior state to invert (e.g.
 * `removeNode` cascades to delete touching edges but only carries `{ id }`),
 * so the store keeps stacks of full `GraphDocument` snapshots instead.
 */

/**
 * Caps how many snapshots an undo or redo stack retains. Unbounded history
 * would let a long editing session grow the stack (and the memory it holds,
 * since each entry is a full document snapshot) without limit; 50 keeps
 * memory bounded while covering realistic undo depth.
 */
export const MAX_UNDO_DEPTH = 50 as const;

/**
 * Returns a NEW array with `value` appended to `stack`, capped at
 * {@link MAX_UNDO_DEPTH} entries by dropping the oldest ones. `stack` is never
 * mutated, so callers (e.g. a zustand store) can rely on reference equality
 * to detect that history changed.
 */
export function pushHistory<T>(stack: T[], value: T): T[] {
  const next = [...stack, value];
  if (next.length <= MAX_UNDO_DEPTH) {
    return next;
  }
  return next.slice(next.length - MAX_UNDO_DEPTH);
}
