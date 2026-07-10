import { z } from "zod";

import { NodeId } from "./primitives";

/**
 * A directed relationship from `source` to `target`. `type` names the
 * edge-type definition (built-in or custom, declared in the document's
 * `edgeTypes` array) that governs the shape of `data`; the type registry
 * resolves it to a Zod schema for runtime validation. The document-level
 * schema keeps `data` as an opaque record so a document can be loaded without
 * the registry, then validated per-type once the registry is available.
 */
export const GraphEdge = z.object({
  id: NodeId,
  source: NodeId,
  target: NodeId,
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

/** Per-edge data bag. Keyed by field name; shape defined by the edge type. */
export type EdgeData = Record<string, unknown>;
