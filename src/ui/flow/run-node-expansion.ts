/**
 * The core "run a GitHub expansion against a node" action, shared by
 * {@link ExpandMenu} (the inspector's persistent expand dropdown, which
 * layers pagination-tail and loading-spinner state on top) and
 * {@link ContextMenu}'s one-shot right-click "Expand" entries (which don't
 * need either — a context-menu action just fetches page 1 and toasts the
 * result).
 */
import { notifications } from "@mantine/notifications";

import {
  GitHubError,
  githubErrorMessage,
  resolveGithubClient,
  type Expansion,
  type ExpansionResult,
  type GitHubClient,
} from "@/github";
import type { GraphNode } from "@/schema";
import { useGraphStore } from "@/ui/store/graph-store";

/** An {@link ExpansionResult} plus the count of nodes actually merged into
 *  the document (post-dedup, via `mergeDelta`'s returned array) — a caller
 *  that reports how many nodes an expansion added (e.g. a bulk-expand
 *  summary across several nodes) needs this rather than `delta.nodes.length`,
 *  which counts nodes fetched from GitHub before dedup against the existing
 *  document. */
export type RunNodeExpansionResult = ExpansionResult & { addedCount: number };

/** Derives the GitHub owner (org or user login) a node belongs to, for token
 *  resolution — org nodes store it under `login`, every other expandable
 *  node type stores it under `owner`. */
function ownerForNode(node: GraphNode): string | undefined {
  switch (node.type) {
    case "org": {
      const login = node.data["login"];
      return typeof login === "string" ? login : undefined;
    }
    case "repo":
    case "issue":
    case "pullRequest":
    case "project": {
      const owner = node.data["owner"];
      return typeof owner === "string" ? owner : undefined;
    }
    default:
      return undefined;
  }
}

async function runWithClient(
  node: GraphNode,
  expansion: Expansion,
  cursor: string | undefined,
  client: GitHubClient,
  signal: AbortSignal,
  onResult?: (result: ExpansionResult) => void,
  opts?: { silent?: boolean; onExistingMatch?: "keep" | "overwrite" },
): Promise<RunNodeExpansionResult | undefined> {
  try {
    const result = await expansion.run(node, client, cursor, signal);
    const stampedDelta = {
      ...result.delta,
      nodes: result.delta.nodes.map((n) => ({
        ...n,
        fetchedAt: new Date().toISOString(),
      })),
    };
    const added = useGraphStore
      .getState()
      .mergeDelta(stampedDelta, opts?.onExistingMatch);
    const count = added.length;
    if (opts?.silent !== true) {
      notifications.show({
        color: "green",
        message:
          count === 0
            ? "Nothing new to add"
            : `Added ${String(count)} node${count === 1 ? "" : "s"}`,
      });
    }
    onResult?.(result);
    return { ...result, addedCount: count };
  } catch (error) {
    if (signal.aborted) return undefined;
    const message =
      error instanceof GitHubError
        ? githubErrorMessage(error)
        : error instanceof Error
          ? error.message
          : String(error);
    if (opts?.silent !== true) {
      notifications.show({ color: "red", message });
    }
    return undefined;
  } finally {
    useGraphStore.getState().setRateLimit(client.lastRateLimit);
  }
}

/**
 * Resolves the best-matching stored GitHub token for `node`'s owner
 * (escalating to the GitHub panel and resuming automatically once one is
 * validated, if none resolves), runs `expansion`, merges the resulting
 * delta into the document, and shows a success/failure notification.
 * Returns the result on a direct (non-escalated) run so a caller that
 * tracks pagination (`ExpandMenu`) can record the new cursor; on an
 * escalated run this resolves once the panel opens, before the resumed
 * fetch completes — that result reaches the caller only via `onResult`,
 * called from both the direct and resumed paths.
 */
export async function runNodeExpansion(
  node: GraphNode,
  expansion: Expansion,
  cursor: string | undefined,
  signal: AbortSignal,
  onResult?: (result: ExpansionResult) => void,
  opts?: { silent?: boolean; onExistingMatch?: "keep" | "overwrite" },
): Promise<RunNodeExpansionResult | undefined> {
  const owner = ownerForNode(node);
  const client = await resolveGithubClient(owner, signal);
  if (client === undefined) {
    useGraphStore.getState().openGitHubPanel({
      ...(owner === undefined ? {} : { suggestedOwner: owner }),
      pendingAction: (resumedClient) => {
        void runWithClient(
          node,
          expansion,
          cursor,
          resumedClient,
          new AbortController().signal,
          onResult,
          opts,
        );
      },
    });
    return undefined;
  }
  return runWithClient(node, expansion, cursor, client, signal, onResult, opts);
}
