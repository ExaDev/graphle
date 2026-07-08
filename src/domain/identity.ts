import { type GraphNode } from "../schema";

/**
 * A stable, case-insensitive key that identifies a node by the external GitHub
 * entity it represents, rather than by its ephemeral graph id. Two nodes that
 * point at the same entity (e.g. the same repository fetched twice) share a key,
 * which lets the merge layer collapse them instead of creating duplicates.
 *
 * Returns `undefined` for freeform nodes: they carry no external identity, so
 * every freeform node is treated as distinct and is always added.
 *
 * The key prefixes mirror the node `kind` so the source of a key is readable at
 * a glance. All string segments are lowercased because GitHub logins, owners,
 * and repo names are case-insensitive.
 */
export function nodeIdentityKey(node: GraphNode): string | undefined {
  switch (node.kind) {
    case "freeform":
      return undefined;
    case "org":
      return `org:${node.data.login}`.toLowerCase();
    case "repo":
      return `repo:${node.data.owner}/${node.data.name}`.toLowerCase();
    case "issue":
      return `issue:${node.data.owner}/${node.data.repo}#${String(
        node.data.number,
      )}`.toLowerCase();
    case "project":
      return `project:${node.data.owner}/${String(node.data.number)}`.toLowerCase();
  }
}
