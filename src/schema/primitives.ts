import { z } from "zod";

/**
 * Unique identifier for a graph node or edge. Any non-empty string; in
 * practice a UUID, but the schema only constrains length so callers may use
 * any opaque key.
 */
export const NodeId = z.string().min(1);
export type NodeId = z.infer<typeof NodeId>;

/** 2D canvas position in pixel coordinates. */
export const Position = z.object({
  x: z.number(),
  y: z.number(),
});
export type Position = z.infer<typeof Position>;

/**
 * ISO 8601 date-time string, e.g. "2024-01-15T10:30:00Z". Used for audit
 * timestamps on stored graphs. Implemented with the Zod 4 `z.iso.datetime`
 * helper (the `z.string().datetime()` chain is deprecated in Zod 4); it
 * validates the same set of date-time strings and infers to `string`.
 */
export const IsoTimestamp = z.iso.datetime();
export type IsoTimestamp = z.infer<typeof IsoTimestamp>;
