import { z } from "zod";

import { GraphEdge } from "./edge";
import { GraphNode } from "./node";

/**
 * Schema version for the persisted graph document. Bump and migrate whenever
 * the document shape changes in a breaking way; the `version` field literal
 * lets a loader reject or migrate documents from the future.
 */
export const GRAPH_DOCUMENT_VERSION = 1 as const;

/** The top-level, versioned shape of a saved graph. */
export const GraphDocument = z.object({
  version: z.literal(GRAPH_DOCUMENT_VERSION),
  name: z.string(),
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
});
export type GraphDocument = z.infer<typeof GraphDocument>;
