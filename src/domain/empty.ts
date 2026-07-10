import {
  BUILT_IN_TYPES,
  GRAPH_DOCUMENT_VERSION,
  toPortableTypeDefinition,
  type GraphDocument,
} from "../schema";

/**
 * Returns a fresh, empty graph document stamped with the current
 * {@link GRAPH_DOCUMENT_VERSION}, the given `name`, every built-in node-type
 * definition (so a new document is immediately self-describing), and no nodes
 * or edges. The type definitions are projected to their portable form (the live
 * Zod `schema` is stripped; only `jsonSchema` is carried).
 */
export function emptyDocument(name: string): GraphDocument {
  return {
    version: GRAPH_DOCUMENT_VERSION,
    name,
    types: BUILT_IN_TYPES.map(toPortableTypeDefinition),
    nodes: [],
    edges: [],
  };
}
