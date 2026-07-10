/**
 * Resolves a `store.syncConflict` — set by `useGistAutoSync` when a push or a
 * periodic check finds a linked gist's remote HEAD has moved since the
 * graph's last recorded sync, so an automatic push is never silently
 * overwritten. Opens whenever `syncConflict` is set, regardless of which
 * trigger set it, mirroring `GistPickerModal`'s "one modal driven entirely by
 * a store field" pattern.
 *
 * "Keep mine" force-pushes the local document, overwriting the remote.
 * "Take theirs" pulls the remote revision named by `syncConflict.remoteSha`,
 * discarding local edits — recoverable afterwards via the persisted revision
 * history, since this only replaces the live document, never deletes a row.
 * Either path records a revision (`origin: "local"` or `"remote-restore"`)
 * and updates the linked source's `lastSyncedRevision` before clearing the
 * conflict, so the next `useGistAutoSync` check sees a resolved state.
 */
import { useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCloudDownload, IconCloudUpload } from "@tabler/icons-react";

import type { LinkedRemoteSource } from "@/schema";
import { fetchGistRevision, pushGistFile } from "@/sharing/gist";
import { serialiseDocument } from "@/sharing/json";
import { db } from "@/storage/db";
import { createGraphStore } from "@/storage/graph-store-dexie";
import { createRevisionStore } from "@/storage/revision-store-dexie";
import { createSecretStore } from "@/storage/secret-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

/** The `linkedRemote` shape this modal resolves conflicts for; `"githubFile"`
 *  is reserved but has no sync implementation to call here yet. */
type GistLinkedRemote = Extract<LinkedRemoteSource, { provider: "gist" }>;

/** Render any thrown value as a message string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SyncConflictModal() {
  const syncConflict = useGraphStore((state) => state.syncConflict);
  const setSyncConflict = useGraphStore((state) => state.setSyncConflict);
  const replaceDocument = useGraphStore((state) => state.replaceDocument);
  const graphId = useGraphStore((state) => state.graphId);

  const [resolving, setResolving] = useState(false);

  function handleClose(): void {
    // Dismissing without choosing leaves the conflict in place — the next
    // useGistAutoSync check re-reports it rather than the modal silently
    // forgetting it, since neither side has actually been reconciled.
    setResolving(false);
  }

  async function withLinkedGist(
    action: (
      graphStore: ReturnType<typeof createGraphStore>,
      remote: GistLinkedRemote,
    ) => Promise<void>,
  ): Promise<void> {
    if (syncConflict === undefined) return;
    setResolving(true);
    try {
      const graphStore = createGraphStore(db);
      const controller = new AbortController();
      const stored = await graphStore.get(syncConflict.graphId, controller.signal);
      if (stored === undefined || stored.linkedRemote?.provider !== "gist") {
        // The graph was deleted or unlinked while the conflict was pending —
        // nothing left to reconcile against.
        setSyncConflict(undefined);
        return;
      }
      await action(graphStore, stored.linkedRemote);
      setSyncConflict(undefined);
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not resolve the sync conflict: ${describe(error)}`,
      });
    } finally {
      setResolving(false);
    }
  }

  function handleKeepMine(): void {
    void withLinkedGist(async (graphStore, remote) => {
      if (syncConflict === undefined) return;
      const controller = new AbortController();
      const secretStore = createSecretStore(db);
      const token = await secretStore.getGitHubToken(controller.signal);
      if (token === undefined) {
        notifications.show({
          color: "red",
          message: "No GitHub token stored — open the GitHub panel to add one, then retry.",
        });
        return;
      }
      const newSha = await pushGistFile(
        remote.gistId,
        remote.filename,
        serialiseDocument(syncConflict.localDocument),
        token,
        controller.signal,
      );
      const stored = await graphStore.get(syncConflict.graphId, controller.signal);
      if (stored === undefined) return;
      const syncedRemote: GistLinkedRemote = {
        ...remote,
        lastSyncedRevision: newSha,
        lastSyncedAt: new Date().toISOString(),
      };
      await graphStore.save({ ...stored, linkedRemote: syncedRemote }, controller.signal);
      notifications.show({ color: "green", message: "Kept your changes, pushed to the gist" });
    });
  }

  function handleTakeTheirs(): void {
    void withLinkedGist(async (graphStore, remote) => {
      if (syncConflict === undefined) return;
      const controller = new AbortController();
      const pulled = await fetchGistRevision(
        remote.gistId,
        syncConflict.remoteSha,
        remote.filename,
        controller.signal,
      );
      const stored = await graphStore.get(syncConflict.graphId, controller.signal);
      if (stored === undefined) return;
      const syncedRemote: GistLinkedRemote = {
        ...remote,
        lastSyncedRevision: syncConflict.remoteSha,
        lastSyncedAt: new Date().toISOString(),
      };
      await graphStore.save(
        { ...stored, document: pulled, linkedRemote: syncedRemote },
        controller.signal,
      );
      // Discarding local edits is recoverable: nothing is deleted, the
      // superseded local state simply stops being the live document. Record
      // the swap with its provenance rather than as an ordinary local edit.
      await createRevisionStore(db).record(
        {
          id: crypto.randomUUID(),
          graphId: syncConflict.graphId,
          document: pulled,
          createdAt: new Date().toISOString(),
          origin: "remote-restore",
        },
        controller.signal,
      );
      // Only touch the live document if the conflicted graph is still the one
      // open — resolving a conflict for a graph the user has since navigated
      // away from must not yank the canvas out from under them.
      if (syncConflict.graphId === graphId) replaceDocument(pulled);
      notifications.show({ color: "green", message: "Took the gist's changes" });
    });
  }

  return (
    <Modal
      opened={syncConflict !== undefined}
      onClose={handleClose}
      title="Gist sync conflict"
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">
          This graph and its linked gist have both changed since the last sync. Choose which
          version to keep — the other is not lost, it stays in this graph&apos;s history.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button
            variant="default"
            leftSection={<IconCloudDownload size={16} />}
            loading={resolving}
            onClick={handleTakeTheirs}
          >
            Take theirs
          </Button>
          <Button
            leftSection={<IconCloudUpload size={16} />}
            loading={resolving}
            onClick={handleKeepMine}
          >
            Keep mine
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
