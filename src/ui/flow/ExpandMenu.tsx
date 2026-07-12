/**
 * Expansion menu for the currently selected node. Reads the available
 * expansions for the node's type ({@link expansionsForType}) and renders one
 * item per expansion. Selecting one resolves the best-matching stored GitHub
 * token for the node's owner ({@link resolveGithubClient}), runs the
 * expansion, folds the resulting delta into the document via
 * `store.mergeDelta`, and reports how many nodes were added. Pagination tails
 * are tracked per expansion so a "Load more" item appears while the connection
 * has a next page.
 *
 * A token is resolved fresh on every click (a cheap Dexie read) rather than
 * cached in component state, so a token added or edited after the menu first
 * rendered is picked up on the very next click. When no token resolves for
 * the node's owner, the menu opens the GitHub panel with that owner
 * pre-suggested and the triggering expansion queued as the panel's pending
 * action, so validating a token there resumes the exact expansion the user
 * clicked.
 *
 * SECURITY: like {@link GitHubPanel}, a token lives only in the token store
 * and the Authorization header. It is resolved here solely to build a
 * client; it is never rendered, logged, or stored in component state.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { Button, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconPlaylistAdd } from "@tabler/icons-react";

import {
  expansionsForType,
  GitHubError,
  githubErrorMessage,
  resolveGithubClient,
  type Expansion,
  type GitHubClient,
} from "@/github";
import type { GraphNode } from "@/schema";
import { useGraphStore } from "@/ui/store/graph-store";

export interface ExpandMenuProps {
  /** The node whose expansions are offered. Its type selects the expansion set. */
  node: GraphNode;
}

/** The pagination tail remembered per expansion id, for "Load more". */
interface ExpansionTail {
  cursor: string | undefined;
  hasNextPage: boolean;
}

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

export function ExpandMenu({ node }: ExpandMenuProps) {
  const expansions = expansionsForType(node.type);

  const mergeDelta = useGraphStore((state) => state.mergeDelta);
  const openGitHubPanel = useGraphStore((state) => state.openGitHubPanel);

  /** Per-expansion pagination tails, keyed by expansion id. */
  const [tails, setTails] = useState<Record<string, ExpansionTail>>({});
  const [runningId, setRunningId] = useState<string | undefined>(undefined);

  // The in-flight run's AbortController; aborted when a new run starts or the
  // selected node changes, so a slow fetch cannot write into a different node.
  const abortRef = useRef<AbortController | undefined>(undefined);

  // Remember the node id the current tails belong to. When the selection moves
  // to a different node, reset tails DURING RENDER (the React-recommended
  // "adjust state when a prop changes" pattern) rather than in an effect, which
  // would trip the set-state-in-effect rule and trigger a cascading render.
  const [tailsForNodeId, setTailsForNodeId] = useState(node.id);
  if (tailsForNodeId !== node.id) {
    setTailsForNodeId(node.id);
    setTails({});
    // The previous node's in-flight run was aborted by the cleanup effect; its
    // finally won't clear runningId (abortRef.current no longer matches the
    // controller), so clear it here to avoid a stuck loading state.
    setRunningId(undefined);
  }

  // Abort any in-flight run when the selected node changes (or on unmount) so a
  // stale fetch cannot resolve into the new node. Cleanup-only: no setState
  // here, which keeps it clear of the set-state-in-effect rule.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = undefined;
    };
  }, [node.id]);

  async function runExpansionWith(
    expansion: Expansion,
    loadMore: boolean,
    client: GitHubClient,
  ): Promise<void> {
    const tail = tails[expansion.id];
    const cursor = loadMore && tail !== undefined ? tail.cursor : undefined;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunningId(expansion.id);
    try {
      const result = await expansion.run(node, client, cursor, controller.signal);
      const added = mergeDelta(result.delta);
      const count = added.length;
      notifications.show({
        color: "green",
        message:
          count === 0
            ? "Nothing new to add"
            : `Added ${String(count)} node${count === 1 ? "" : "s"}`,
      });
      setTails((prev) => ({
        ...prev,
        [expansion.id]: { cursor: result.endCursor, hasNextPage: result.hasNextPage },
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof GitHubError
          ? githubErrorMessage(error)
          : error instanceof Error
            ? error.message
            : String(error);
      notifications.show({ color: "red", message });
    } finally {
      // Only clear the running flag if this run is still the active one; a
      // newer run may have since started and owns the indicator.
      if (abortRef.current === controller) {
        setRunningId(undefined);
      }
    }
  }

  async function runExpansion(expansion: Expansion, loadMore: boolean): Promise<void> {
    const owner = ownerForNode(node);
    const client = await resolveGithubClient(owner, new AbortController().signal);
    if (client === undefined) {
      openGitHubPanel({
        ...(owner === undefined ? {} : { suggestedOwner: owner }),
        pendingAction: (resumedClient) => void runExpansionWith(expansion, loadMore, resumedClient),
      });
      return;
    }
    await runExpansionWith(expansion, loadMore, client);
  }

  // Issue and freeform nodes have nothing to expand into; render nothing so the
  // inspector does not show an empty menu.
  if (expansions.length === 0) return null;

  const running = runningId !== undefined;

  return (
    <Menu position="bottom-end" withinPortal shadow="sm">
      <Menu.Target>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconPlaylistAdd size={14} />}
          rightSection={<IconChevronDown size={14} />}
          loading={running}
        >
          Expand
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {expansions.map((expansion) => {
          const tail = tails[expansion.id];
          const more = tail !== undefined && tail.hasNextPage;
          return (
            <Fragment key={expansion.id}>
              <Menu.Item onClick={() => void runExpansion(expansion, false)}>
                {expansion.label}
              </Menu.Item>
              {more && (
                <Menu.Item onClick={() => void runExpansion(expansion, true)}>
                  Load more {expansion.label.toLowerCase()}
                </Menu.Item>
              )}
            </Fragment>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
