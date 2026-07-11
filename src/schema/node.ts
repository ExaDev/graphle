import { z } from "zod";

import { NodeId, Position } from "./primitives";

/**
 * A single graph node. `type` names the node-type definition (built-in or
 * custom, declared in the document's `types` array) that governs the shape of
 * `data`; the type registry resolves it to a Zod schema for runtime validation.
 * The document-level schema keeps `data` as an opaque record so a document can
 * be loaded without the registry, then validated per-type once the registry is
 * available.
 *
 * `parentId`/`collapsed` model subgraphs: `parentId` names another node in
 * the same document that this node is nested under (any node can be a
 * parent — a real `repo`/`issue` node collapsing its own fetched children is
 * the common case, not just the dedicated `"group"` built-in type used for
 * grouping otherwise-unrelated nodes). `collapsed` on a node hides every
 * node reachable from it via `parentId`. Both optional — a document with
 * neither present is a flat graph, unchanged from before this field existed,
 * so no `GRAPH_DOCUMENT_VERSION` bump was needed to add them. See
 * `src/domain/hierarchy.ts` for the traversal helpers and
 * `src/ui/flow/to-flow.ts` for how a collapsed node's descendants are hidden
 * from the canvas and their boundary-crossing edges rerouted.
 */
export const GraphNodeSchema = z.object({
  id: NodeId,
  type: z.string(),
  position: Position,
  data: z.record(z.string(), z.unknown()),
  parentId: NodeId.optional(),
  collapsed: z.boolean().optional(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

/** Per-node data bag. Keyed by field name; shape defined by the node type. */
export type NodeData = Record<string, unknown>;
