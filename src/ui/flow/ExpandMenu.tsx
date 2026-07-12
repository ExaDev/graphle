/**
 * Expansion menu for the currently selected node. Reads the available
 * expansions for the node's type ({@link expansionsForType}) and renders one
 * item per expansion. Selecting one runs {@link runNodeExpansion} (token
 * resolution/escalation, the fetch, merging the delta, and notifying) and
 * records the returned pagination cursor so a "Load more" item appears
 * while the connection has a next page.
 *
 * SECURITY: like {@link GitHubPanel}, a token lives only in the token store
 * and the Authorization header — never rendered, logged, or stored in
 * component state. See {@link runNodeExpansion}'s own doc comment for how
 * it's resolved.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { Button, Menu } from "@mantine/core";
import { IconChevronDown, IconPlaylistAdd } from "@tabler/icons-react";

import { expansionsForType, type Expansion } from "@/github";
import type { GraphNode } from "@/schema";

import { runNodeExpansion } from "./run-node-expansion";

export interface ExpandMenuProps {
  /** The node whose expansions are offered. Its type selects the expansion set. */
  node: GraphNode;
}

/** The pagination tail remembered per expansion id, for "Load more". */
interface ExpansionTail {
  cursor: string | undefined;
  hasNextPage: boolean;
}

export function ExpandMenu({ node }: ExpandMenuProps) {
  const expansions = expansionsForType(node.type);

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

  async function runExpansion(expansion: Expansion, loadMore: boolean): Promise<void> {
    const tail = tails[expansion.id];
    const cursor = loadMore && tail !== undefined ? tail.cursor : undefined;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunningId(expansion.id);
    try {
      await runNodeExpansion(node, expansion, cursor, controller.signal, (result) => {
        setTails((prev) => ({
          ...prev,
          [expansion.id]: { cursor: result.endCursor, hasNextPage: result.hasNextPage },
        }));
      });
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
