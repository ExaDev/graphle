/**
 * Resolves a `store.syncConflict` — set by `useGistAutoSync` or
 * `useGithubFileAutoSync` when a push or a periodic check finds a linked
 * gist's remote HEAD, or a linked repo file's blob sha, has moved since the
 * graph's last recorded sync, so an automatic push is never silently
 * overwritten. Opens whenever `syncConflict` is set, regardless of which
 * trigger set it, mirroring `GistPickerModal`'s "one modal driven entirely by
 * a store field" pattern. `syncConflict` itself carries no provider — the
 * conflicted graph's currently-stored `linkedRemote` is re-read fresh (see
 * `withLinkedRemote`) and each resolution branches on its `provider`.
 *
 * "Keep mine" force-pushes the local document, overwriting the remote.
 * "Take theirs" pulls the remote revision named by `syncConflict.remoteSha`,
 * discarding local edits — recoverable afterwards via the persisted revision
 * history, since this only replaces the live document, never deletes a row.
 * Either path records a revision (`origin: "local"` or `"remote-restore"`)
 * and updates the linked source's `lastSyncedRevision` before clearing the
 * conflict, so the next auto-sync check sees a resolved state.
 */
import { useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCloudDownload, IconCloudUpload } from "@tabler/icons-react";

import { resolveGithubToken } from "@/github";
import type { GraphDocument, LinkedRemoteSource } from "@/schema";
import { fetchGistRevision, pushGistFile } from "@/sharing/gist";
import { fetchGithubBlobRevision, fetchGithubFileSha, pushGithubFileContent } from "@/sharing/github-file";
import { serialiseDocument } from "@/sharing/json";
import { db } from "@/storage/db";
import { createGraphStore } from "@/storage/graph-store-dexie";
import { createRevisionStore } from "@/storage/revision-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

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
    // auto-sync conflict check re-reports it rather than the modal silently
    // forgetting it, since neither side has actually been reconciled.
    setResolving(false);
  }

  /** Re-read the conflicted graph's stored `linkedRemote` fresh and run
   *  `action` against it, whichever provider it turns out to be — a gist or
   *  a githubFile link both reach here, since `syncConflict` itself carries
   *  no provider. */
  async function withLinkedRemote(
    action: (
      graphStore: ReturnType<typeof createGraphStore>,
      remote: LinkedRemoteSource,
    ) => Promise<void>,
  ): Promise<void> {
    if (syncConflict === undefined) return;
    setResolving(true);
    try {
      const graphStore = createGraphStore(db);
      const controller = new AbortController();
      const stored = await graphStore.get(syncConflict.graphId, controller.signal);
      if (stored === undefined || stored.linkedRemote === undefined) {
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
    void withLinkedRemote(async (graphStore, remote) => {
      if (syncConflict === undefined) return;
      const controller = new AbortController();
      const owner = remote.provider === "githubFile" ? remote.owner : undefined;
      const resolved = await resolveGithubToken(owner, controller.signal, remote.lastUsedTokenId);
      if (resolved === undefined) {
        notifications.show({
          color: "red",
          message: "No GitHub token stored — open the GitHub panel to add one, then retry.",
        });
        return;
      }
      const token = resolved.token;

      let newSha: string;
      let successMessage: string;
      if (remote.provider === "githubFile") {
        // The Contents API's PUT needs the file's CURRENT blob sha to detect
        // a concurrent write, not `syncConflict.remoteSha` (the sha that was
        // divergent when the conflict was first detected) — the two can
        // differ if the remote moved again in the meantime, which a fresh
        // read catches rather than silently overwriting.
        const currentSha = await fetchGithubFileSha(
          remote.owner,
          remote.repo,
          remote.branch,
          remote.path,
          token,
          controller.signal,
        );
        newSha = await pushGithubFileContent(
          remote.owner,
          remote.repo,
          remote.branch,
          remote.path,
          serialiseDocument(syncConflict.localDocument),
          currentSha,
          token,
          controller.signal,
        );
        successMessage = "Kept your changes, pushed to the repo file";
      } else {
        newSha = await pushGistFile(
          remote.gistId,
          remote.filename,
          serialiseDocument(syncConflict.localDocument),
          token,
          controller.signal,
        );
        successMessage = "Kept your changes, pushed to the gist";
      }

      const stored = await graphStore.get(syncConflict.graphId, controller.signal);
      if (stored === undefined) return;
      const syncedRemote: LinkedRemoteSource = {
        ...remote,
        lastSyncedRevision: newSha,
        lastSyncedAt: new Date().toISOString(),
        lastUsedTokenId: resolved.id,
      };
      await graphStore.save({ ...stored, linkedRemote: syncedRemote }, controller.signal);
      notifications.show({ color: "green", message: successMessage });
    });
  }

  function handleTakeTheirs(): void {
    void withLinkedRemote(async (graphStore, remote) => {
      if (syncConflict === undefined) return;
      const controller = new AbortController();

      let pulled: GraphDocument;
      let successMessage: string;
      if (remote.provider === "githubFile") {
        const resolved = await resolveGithubToken(remote.owner, controller.signal, remote.lastUsedTokenId);
        pulled = await fetchGithubBlobRevision(
          remote.owner,
          remote.repo,
          syncConflict.remoteSha,
          resolved?.token,
          controller.signal,
        );
        successMessage = "Took the repo file's changes";
      } else {
        pulled = await fetchGistRevision(
          remote.gistId,
          syncConflict.remoteSha,
          remote.filename,
          controller.signal,
        );
        successMessage = "Took the gist's changes";
      }

      const stored = await graphStore.get(syncConflict.graphId, controller.signal);
      if (stored === undefined) return;
      const syncedRemote: LinkedRemoteSource = {
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
      notifications.show({ color: "green", message: successMessage });
    });
  }

  return (
    <Modal
      opened={syncConflict !== undefined}
      onClose={handleClose}
      title="Sync conflict"
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">
          This graph and its linked remote have both changed since the last sync. Choose which
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
