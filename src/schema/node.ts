import { z } from "zod";

import { NodeId, Position } from "./primitives";

/**
 * A single graph node. `type` names the node-type definition (built-in or
 * custom, declared in the document's `types` array) that governs the shape of
 * `data`; the type registry resolves it to a Zod schema for runtime validation.
 * The document-level schema keeps `data` as an opaque record so a document can
 * be loaded without the registry, then validated per-type once the registry is
 * available.
 */
export const GraphNodeSchema = z.object({
  id: NodeId,
  type: z.string(),
  position: Position,
  data: z.record(z.string(), z.unknown()),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

/** Per-node data bag. Keyed by field name; shape defined by the node type. */
export type NodeData = Record<string, unknown>;
