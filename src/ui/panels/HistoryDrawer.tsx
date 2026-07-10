/**
 * Drawer listing the persisted revision history (IndexedDB via the storage
 * contract) for the currently loaded graph. This is distinct from the
 * ephemeral undo/redo stacks on `graph-store.ts`: revisions are durable
 * checkpoints recorded over time, independent of the current session.
 *
 * The list is live: `useLiveQuery` re-runs whenever the underlying Dexie
 * table changes or `graphId` changes, so tagging, untagging, or restoring a
 * revision refreshes the list without manual invalidation. All storage goes
 * through `createRevisionStore(db)` — the UI never touches Dexie directly.
 *
 * Restoring a revision calls `replaceDocument`, which pushes the pre-restore
 * document onto the undo stack (so the restore itself is undoable), and then
 * explicitly records a *new* revision for the now-current restored document.
 * The restored-from row is never mutated or deleted — the restore becomes a
 * fresh, visible entry at the top of the timeline instead.
 */
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ActionIcon, Badge, Drawer, Group, ScrollArea, Stack, Text } from "@mantine/core";
import { IconPencil, IconRestore, IconTagOff, IconTagPlus } from "@tabler/icons-react";

import { type GraphRevision } from "@/schema";
import { db } from "@/storage/db";
import { createRevisionStore } from "@/storage/revision-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

export interface HistoryDrawerProps {
  opened: boolean;
  onClose: () => void;
}

/** Stable empty list used as the `useLiveQuery` default before the first read, and when no graph is loaded. */
const EMPTY_REVISIONS: GraphRevision[] = [];

export function HistoryDrawer({ opened, onClose }: HistoryDrawerProps) {
  // The store is created once; `db` is a process-wide singleton.
  const store = useMemo(() => createRevisionStore(db), []);

  const graphId = useGraphStore((state) => state.graphId);
  const replaceDocument = useGraphStore((state) => state.replaceDocument);

  const revisions = useLiveQuery(
    async () => {
      if (graphId === undefined) return EMPTY_REVISIONS;
      return store.list(graphId, new AbortController().signal);
    },
    [graphId],
    EMPTY_REVISIONS,
  );

  async function handleRestore(revision: GraphRevision): Promise<void> {
    if (graphId === undefined) return;
    replaceDocument(revision.document);
    const controller = new AbortController();
    await store.record(
      {
        id: crypto.randomUUID(),
        graphId,
        document: revision.document,
        createdAt: new Date().toISOString(),
        origin: "local",
      },
      controller.signal,
    );
  }

  async function handleTag(revision: GraphRevision): Promise<void> {
    const label = window.prompt(
      revision.label === undefined ? "Tag this revision" : "Rename tag",
      revision.label === undefined ? "" : revision.label,
    );
    if (label === null || label === "") return;
    const controller = new AbortController();
    await store.tag(revision.id, label, controller.signal);
  }

  async function handleUntag(revision: GraphRevision): Promise<void> {
    const controller = new AbortController();
    await store.untag(revision.id, controller.signal);
  }

  return (
    <Drawer opened={opened} onClose={onClose} title="History" position="right" size="md">
      {graphId === undefined ? (
        <Text size="sm" c="dimmed">
          Save this graph to start tracking its history.
        </Text>
      ) : (
        <ScrollArea.Autosize mah="70vh" type="scroll">
          <Stack gap="xs">
            {revisions.length === 0 ? (
              <Text size="sm" c="dimmed">
                No history yet.
              </Text>
            ) : (
              revisions.map((revision) => (
                <Group key={revision.id} justify="space-between" gap="xs" px="sm" py="xs">
                  <Stack gap={2}>
                    <Group gap={6}>
                      <Text size="sm" fw={600}>
                        {new Date(revision.createdAt).toLocaleString()}
                      </Text>
                      {revision.label !== undefined && (
                        <Badge variant="light" size="sm">
                          {revision.label}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {`${String(revision.document.nodes.length)} nodes, ${String(revision.document.edges.length)} edges`}
                    </Text>
                  </Stack>
                  <Group gap={4}>
                    <ActionIcon
                      variant="subtle"
                      aria-label="Restore"
                      onClick={() => {
                        void handleRestore(revision);
                      }}
                    >
                      <IconRestore size={16} />
                    </ActionIcon>
                    {revision.label === undefined ? (
                      <ActionIcon
                        variant="subtle"
                        aria-label="Tag"
                        onClick={() => {
                          void handleTag(revision);
                        }}
                      >
                        <IconTagPlus size={16} />
                      </ActionIcon>
                    ) : (
                      <>
                        <ActionIcon
                          variant="subtle"
                          aria-label="Rename tag"
                          onClick={() => {
                            void handleTag(revision);
                          }}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label="Remove tag"
                          onClick={() => {
                            void handleUntag(revision);
                          }}
                        >
                          <IconTagOff size={16} />
                        </ActionIcon>
                      </>
                    )}
                  </Group>
                </Group>
              ))
            )}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Drawer>
  );
}
