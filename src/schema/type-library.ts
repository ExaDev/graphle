import { z } from "zod";

import { EdgeTypeDefinitionSchema } from "./edge-type";
import { NodeTypeDefinitionSchema } from "./node-type";

/**
 * The user's personal library of custom node and edge type definitions,
 * independent of any one graph. This is the payload synced to a gist or
 * repo file as a single JSON document, analogous to how {@link GraphDocument}
 * is graphle's per-graph document.
 */
export const TypeLibraryDocument = z.object({
  version: z.literal(1),
  nodeTypes: z.array(NodeTypeDefinitionSchema),
  edgeTypes: z.array(EdgeTypeDefinitionSchema),
});
export type TypeLibraryDocument = z.infer<typeof TypeLibraryDocument>;
