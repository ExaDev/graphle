import { resolveType, type GraphNode, type NodeTypeDefinition } from "../schema";

/**
 * A stable, case-insensitive key that identifies a node by the external entity
 * it represents, rather than by its ephemeral graph id. Two nodes that point at
 * the same entity (e.g. the same repository fetched twice) share a key, which
 * lets the merge layer collapse them instead of creating duplicates.
 *
 * The key is built generically from the node type's `identityFields`:
 * `typeName` followed by the `/`-joined values of those fields. Returns
 * `undefined` when the type has no `identityFields` (every such node is treated
 * as distinct and is always added) or when the node's type cannot be resolved.
 * The whole key is lowercased so case variants of the same entity collapse
 * together.
 *
 * `types` is the document's type definitions; {@link resolveType} additionally
 * falls back to the built-in registry, so a node whose type is absent from the
 * document still resolves when it names a built-in.
 */
export function nodeIdentityKey(
  node: GraphNode,
  types: NodeTypeDefinition[],
): string | undefined {
  const type = resolveType(types, node.type);
  if (type === undefined || type.identityFields.length === 0) {
    return undefined;
  }
  const segments = type.identityFields.map((field) => String(node.data[field]));
  return `${type.name}:${segments.join("/")}`.toLowerCase();
}
