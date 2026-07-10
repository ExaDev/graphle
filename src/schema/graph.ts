import { z } from "zod";

import { EdgeTypeDefinitionSchema } from "./edge-type";
import { GraphEdge } from "./edge";
import { GraphNodeSchema } from "./node";
import { NodeTypeDefinitionSchema } from "./node-type";

/**
 * Schema version for the persisted graph document. Bump and migrate whenever
 * the document shape changes in a breaking way; the `version` field literal
 * lets a loader reject or migrate documents from the future. Version 2
 * introduced the dynamic `types` array and renamed node `kind` to `type`.
 * Version 3 introduced the dynamic `edgeTypes` array and replaced edge
 * `relation`/`label` with `type`/`data`.
 */
export const GRAPH_DOCUMENT_VERSION = 3 as const;

/** The top-level, versioned shape of a saved graph. */
export const GraphDocumentSchema = z.object({
  version: z.literal(GRAPH_DOCUMENT_VERSION),
  name: z.string(),
  types: z.array(NodeTypeDefinitionSchema),
  edgeTypes: z.array(EdgeTypeDefinitionSchema),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdge),
});
export type GraphDocument = z.infer<typeof GraphDocumentSchema>;
