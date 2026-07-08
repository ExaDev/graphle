import { GRAPH_DOCUMENT_VERSION, type GraphDocument } from "../schema";

/**
 * Returns a fresh, empty graph document stamped with the current
 * {@link GRAPH_DOCUMENT_VERSION}, the given `name`, and no nodes or edges.
 */
export function emptyDocument(name: string): GraphDocument {
  return {
    version: GRAPH_DOCUMENT_VERSION,
    name,
    nodes: [],
    edges: [],
  };
}
