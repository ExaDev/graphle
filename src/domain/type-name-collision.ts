import {
  BUILT_IN_EDGE_TYPES_BY_NAME,
  BUILT_IN_TYPES_BY_NAME,
  type EdgeTypeDefinition,
  type NodeTypeDefinition,
} from "../schema";

/**
 * True when `name` is already used by a node type — either one the document
 * carries or a built-in. Built-ins are checked because `resolveType` prefers a
 * document-carried definition over the registry, so a user type reusing a
 * built-in name would silently shadow it and re-resolve every existing node of
 * that type against the new shape. Exact string match, case-sensitive: type
 * names are keys, not display text, so no normalisation is applied.
 */
export function nodeTypeNameTaken(
  name: string,
  documentTypes: NodeTypeDefinition[],
): boolean {
  return (
    documentTypes.some((type) => type.name === name) ||
    BUILT_IN_TYPES_BY_NAME.has(name)
  );
}

/**
 * True when `name` is already used by an edge type — either one the document
 * carries or a built-in. Mirrors {@link nodeTypeNameTaken}: built-ins are
 * checked because `resolveEdgeType` prefers a document-carried definition over
 * the registry, so a user type reusing a built-in name would silently shadow
 * it and re-resolve every existing edge of that type against the new shape.
 */
export function edgeTypeNameTaken(
  name: string,
  documentEdgeTypes: EdgeTypeDefinition[],
): boolean {
  return (
    documentEdgeTypes.some((type) => type.name === name) ||
    BUILT_IN_EDGE_TYPES_BY_NAME.has(name)
  );
}
