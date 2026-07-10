/**
 * Expansion menu for the currently selected node. Reads the available
 * expansions for the node's type ({@link expansionsForType}) and renders one
 * item per expansion. Selecting one builds a client from the stored PAT, runs the
 * expansion, folds the resulting delta into the document via
 * `store.mergeDelta`, and reports how many nodes were added. Pagination tails
 * are tracked per expansion so a "Load more" item appears while the connection
 * has a next page.
 *
 * The GitHub client is created on demand from the PAT held in the SecretStore
 * (never in component state as a string the UI could leak). When no PAT is
 * stored, the menu offers a single item that opens the GitHub panel rather
 * than silently failing. Each run carries an AbortSignal that is aborted when a
 * new run starts or the selected node changes, so a stale fetch can never
 * resolve into the wrong node.
 *
 * SECURITY: like {@link GitHubPanel}, the PAT lives only in the SecretStore and
 * the Authorization header. It is read here solely to build a client; it is
 * never rendered, logged, or stored in component state.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { Button, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconPlaylistAdd } from "@tabler/icons-react";

import {
  createGitHubClient,
  expansionsForType,
  GitHubError,
  type Expansion,
} from "@/github";
import type { GraphNode } from "@/schema";
import { db } from "@/storage/db";
import { createSecretStore } from "@/storage/secret-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

export interface ExpandMenuProps {
  /** The node whose expansions are offered. Its type selects the expansion set. */
  node: GraphNode;
  /** Opens the GitHub panel so the user can supply a PAT when none is stored. */
  onOpenGitHub: () => void;
}

/** Discriminator for the asynchronous PAT load: loading, absent, or ready. */
type TokenState =
  | { status: "loading" }
  | { status: "absent" }
  | { status: "ready"; token: string };

/** The pagination tail remembered per expansion id, for "Load more". */
interface ExpansionTail {
  cursor: string | undefined;
  hasNextPage: boolean;
}

/** Maps a {@link GitHubError} to a short notification message. */
function expansionErrorMessage(error: GitHubError): string {
  switch (error.kind.type) {
    case "unauthorised":
      return "Unauthorised — check your PAT scopes";
    case "rateLimited":
      return error.kind.resetAt === undefined
        ? "GitHub rate limit exceeded"
        : `GitHub rate limit exceeded; resets at ${error.kind.resetAt}`;
    case "network":
      return "Network error";
    case "forbidden":
      return `Forbidden: ${error.kind.message}`;
    case "notFound":
      return "Not found";
    case "invalidResponse":
      return `Invalid response: ${error.kind.message}`;
  }
}

export function ExpandMenu({ node, onOpenGitHub }: ExpandMenuProps) {
  const expansions = expansionsForType(node.type);

  const mergeDelta = useGraphStore((state) => state.mergeDelta);

  const [tokenState, setTokenState] = useState<TokenState>({ status: "loading" });
  /** Per-expansion pagination tails, keyed by expansion id. */
  const [tails, setTails] = useState<Record<string, ExpansionTail>>({});
  const [runningId, setRunningId] = useState<string | undefined>(undefined);

  // The in-flight run's AbortController; aborted when a new run starts or the
  // selected node changes, so a slow fetch cannot write into a different node.
  const abortRef = useRef<AbortController | undefined>(undefined);

  // Load the stored PAT once. The SecretStore is created on demand; the token
  // is read into a discriminated state so the menu can distinguish "still
  // loading" from "no token" rather than treating both as absent.
  useEffect(() => {
    const secretStore = createSecretStore(db);
    const controller = new AbortController();
    void secretStore
      .getGitHubToken(controller.signal)
      .then((token) => {
        if (controller.signal.aborted) return;
        setTokenState(token === undefined ? { status: "absent" } : { status: "ready", token });
      })
      // withAbort rejects with AbortError when the menu unmounts mid-read
      // (expected control flow -> no-op); a non-abort read failure degrades
      // to "absent" so the menu can still prompt for a PAT.
      .catch(() => {
        if (controller.signal.aborted) return;
        setTokenState({ status: "absent" });
      });
    return () => controller.abort();
  }, []);

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

  async function runExpansion(expansion: Expansion, loadMore: boolean): Promise<void> {
    // No stored PAT: hand the user to the GitHub panel rather than running a
    // request that would just fail as unauthorised.
    if (tokenState.status !== "ready") {
      onOpenGitHub();
      return;
    }
    const tail = tails[expansion.id];
    const cursor = loadMore && tail !== undefined ? tail.cursor : undefined;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunningId(expansion.id);
    try {
      const client = createGitHubClient({ token: tokenState.token });
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
          ? expansionErrorMessage(error)
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

  // Issue and freeform nodes have nothing to expand into; render nothing so the
  // inspector does not show an empty menu.
  if (expansions.length === 0) return null;

  const disabled = tokenState.status === "loading";
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
          disabled={disabled}
        >
          Expand
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {tokenState.status === "absent" && (
          <Menu.Item onClick={onOpenGitHub}>
            Connect GitHub to expand…
          </Menu.Item>
        )}
        {tokenState.status === "ready" &&
          expansions.map((expansion) => {
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
