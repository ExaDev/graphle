import { z } from "zod";

import { NodeId } from "./primitives";

/** The semantic relationship an edge represents between two nodes. */
export const EdgeRelation = z.enum([
  "owns",
  "contains",
  "tracks",
  "references",
  "custom",
]);
export type EdgeRelation = z.infer<typeof EdgeRelation>;

/** A directed relationship from `source` to `target`. */
export const GraphEdge = z.object({
  id: NodeId,
  source: NodeId,
  target: NodeId,
  relation: EdgeRelation,
  label: z.string().optional(),
});
export type GraphEdge = z.infer<typeof GraphEdge>;
