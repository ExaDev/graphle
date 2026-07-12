/**
 * Keeps a graph's document synchronised with its linked gist when
 * `linkedRemote.syncMode === "automatic"`. A no-op for any other graph: no
 * store id, a graph with no `linkedRemote`, a linked source pointing at a
 * provider other than `"gist"` (a `"githubFile"` link is {@link
 * useGithubFileAutoSync}'s job, not this hook's), or `syncMode` set to
 * `"off"`/`"manual"`.
 *
 * The live `useGraphStore` only tracks the current document, not the
 * persisted `StoredGraph` row that carries `linkedRemote`, so every decision
 * here re-reads the row fresh via `createGraphStore(db).get` rather than
 * trusting a value captured earlier in the session — the row can change
 * (e.g. `lastSyncedRevision` advancing after a push) between one trigger and
 * the next.
 *
 * PUSH: debounced `WRITE_DEBOUNCE_MS` after a `dirty` document change (the
 * same debounce window and dirty-gating {@link useUrlSync} uses for the URL
 * fragment). Before pushing, the live remote HEAD (`listGistHistory`'s
 * newest entry) is compared against `linkedRemote.lastSyncedRevision`: a
 * match (or no prior sync at all) proceeds to `pushGistFile` and records the
 * new HEAD; a mismatch means the remote moved since the last sync, so the
 * push is skipped and `store.syncConflict` is set instead — this hook never
 * pushes over an unseen remote change. With no PAT stored, `openGitHubPanel`
 * prompts for one and the push resumes once validated, mirroring exactly how
 * {@link useUrlSync} resumes a GitHub Projects load after PAT entry.
 *
 * PULL/conflict check: runs once on mount and again every time the tab's
 * `visibilitychange` fires to `"visible"` — not a polling interval, since
 * there is no backend to push notifications and polling an idle tab only
 * burns rate limit. Either trigger compares the live remote HEAD against
 * `lastSyncedRevision`; a mismatch sets `syncConflict`. This hook never pulls
 * or overwrites the local document itself — resolving a conflict is a
 * later-phase UI's job.
 */
import { useEffect } from "react";
import { notifications } from "@mantine/notifications";

import { resolveGithubToken } from "@/github";
import { listGistHistory, pushGistFile } from "@/sharing/gist";
import { serialiseDocument } from "@/sharing/json";
import type { GraphDocument, LinkedRemoteSource, StoredGraph } from "@/schema";
import { db } from "@/storage/db";
import { createGraphStore } from "@/storage/graph-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

/** Debounce window before a dirty document change triggers a gist push.
 *  Matches {@link WRITE_DEBOUNCE_MS} in `useUrlSync.ts`. */
const PUSH_DEBOUNCE_MS = 300;

/** The `linkedRemote` shape this hook acts on. */
type GistLinkedRemote = Extract<LinkedRemoteSource, { provider: "gist" }>;

/** Render any thrown value as a message string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useGistAutoSync(): void {
  const graphId = useGraphStore((s) => s.graphId);
  const openGitHubPanel = useGraphStore((s) => s.openGitHubPanel);
  const closeGitHubPanel = useGraphStore((s) => s.closeGitHubPanel);
  const setSyncConflict = useGraphStore((s) => s.setSyncConflict);

  useEffect(() => {
    if (graphId === undefined) return;
    // Rebind to a plain `string`: TypeScript does not carry the narrowing
    // above into the function declarations below, since they are captured by
    // reference rather than typed from a narrowed control-flow snapshot.
    const activeGraphId = graphId;

    const controller = new AbortController();
    const graphStore = createGraphStore(db);

    let unsubscribeDocument: (() => void) | undefined;
    let pushTimer: ReturnType<typeof setTimeout> | undefined;
    let handleVisibilityChange: (() => void) | undefined;

    /** Report a failure unless it is just this effect's own cleanup aborting
     *  the in-flight request. */
    function notifyFailure(prefix: string): (error: unknown) => void {
      return (error: unknown) => {
        if (controller.signal.aborted) return;
        notifications.show({ color: "red", message: `${prefix}: ${describe(error)}` });
      };
    }

    /** Re-read the StoredGraph row fresh and narrow it to an active
     *  (automatic, gist-provider) linked remote, or `undefined` when this
     *  graph is not eligible for auto-sync right now. */
    async function readActiveLinkedRemote(): Promise<
      { stored: StoredGraph; remote: GistLinkedRemote } | undefined
    > {
      const stored = await graphStore.get(activeGraphId, controller.signal);
      if (stored === undefined) return undefined;
      const remote = stored.linkedRemote;
      if (remote === undefined) return undefined;
      if (remote.provider !== "gist") return undefined;
      if (remote.syncMode !== "automatic") return undefined;
      return { stored, remote };
    }

    /** Push `currentDocument` to the linked gist, guarding against a remote
     *  that moved since the last recorded sync by setting `syncConflict`
     *  instead of overwriting it. `onSuccess` fires only after the push and
     *  the bookkeeping write both land, mirroring `useUrlSync`'s
     *  `loadProjectWith(..., onSuccess)` pattern for closing the GitHub
     *  panel once a resumed action completes. */
    async function attemptPush(
      currentDocument: GraphDocument,
      tokenId: string,
      token: string,
      onSuccess?: () => void,
    ): Promise<void> {
      const active = await readActiveLinkedRemote();
      if (active === undefined) return;
      const { stored, remote } = active;

      const history = await listGistHistory(remote.gistId, controller.signal);
      const remoteHead = history[0];
      if (remoteHead === undefined) {
        throw new Error(`Gist ${remote.gistId} has no revision history`);
      }

      if (
        remote.lastSyncedRevision !== undefined &&
        remoteHead.version !== remote.lastSyncedRevision
      ) {
        setSyncConflict({
          graphId: activeGraphId,
          localDocument: currentDocument,
          remoteSha: remoteHead.version,
        });
        return;
      }

      const newSha = await pushGistFile(
        remote.gistId,
        remote.filename,
        serialiseDocument(currentDocument),
        token,
        controller.signal,
      );
      const syncedRemote: GistLinkedRemote = {
        ...remote,
        lastSyncedRevision: newSha,
        lastSyncedAt: new Date().toISOString(),
        lastUsedTokenId: tokenId,
      };
      await graphStore.save({ ...stored, linkedRemote: syncedRemote }, controller.signal);
      onSuccess?.();
    }

    /** Compare the live remote HEAD against `lastSyncedRevision`, setting
     *  `syncConflict` on a mismatch. Never pulls the remote content itself. */
    async function checkForConflict(): Promise<void> {
      const active = await readActiveLinkedRemote();
      if (active === undefined) return;
      const { remote } = active;
      if (remote.lastSyncedRevision === undefined) return;

      const history = await listGistHistory(remote.gistId, controller.signal);
      const remoteHead = history[0];
      if (remoteHead === undefined) {
        throw new Error(`Gist ${remote.gistId} has no revision history`);
      }
      if (remoteHead.version === remote.lastSyncedRevision) return;

      setSyncConflict({
        graphId: activeGraphId,
        localDocument: useGraphStore.getState().document,
        remoteSha: remoteHead.version,
      });
    }

    /** Push the current document, prompting for a PAT via the GitHub panel
     *  and resuming once validated when none is stored yet. */
    async function runPush(): Promise<void> {
      const currentDocument = useGraphStore.getState().document;
      const active = await readActiveLinkedRemote();
      if (controller.signal.aborted || active === undefined) return;
      const pinnedTokenId = active.remote.lastUsedTokenId;
      const resolved = await resolveGithubToken(undefined, controller.signal, pinnedTokenId);
      if (controller.signal.aborted) return;

      if (resolved !== undefined) {
        await attemptPush(currentDocument, resolved.id, resolved.token);
        return;
      }

      // No token resolves: prompt via the shared drawer and resume once the
      // user validates one, exactly like useUrlSync's pending GitHub
      // Projects load. The panel only ever gives back a GitHubClient, which
      // never exposes its own token (SECURITY, see GitHubPanel.tsx);
      // pushGistFile needs the raw token, so the resumed callback re-resolves
      // it rather than pulling it off the client.
      openGitHubPanel({
        pendingAction: () => {
          resolveGithubToken(undefined, controller.signal, pinnedTokenId)
            .then((resumedResolved) => {
              if (controller.signal.aborted || resumedResolved === undefined) return undefined;
              return attemptPush(
                useGraphStore.getState().document,
                resumedResolved.id,
                resumedResolved.token,
                closeGitHubPanel,
              );
            })
            .catch(notifyFailure("Could not sync to gist"));
        },
      });
    }

    function schedulePush(): void {
      if (!useGraphStore.getState().dirty) return;
      if (pushTimer !== undefined) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        runPush().catch(notifyFailure("Could not sync to gist"));
      }, PUSH_DEBOUNCE_MS);
    }

    function runConflictCheck(): void {
      checkForConflict().catch(notifyFailure("Could not check for gist changes"));
    }

    // Gate the whole hook on one fresh read: only a graph currently linked
    // for automatic gist sync gets a document subscription and a
    // visibilitychange listener at all, so an unlinked or manually-synced
    // graph never triggers so much as an IndexedDB read on every edit.
    readActiveLinkedRemote()
      .then((active) => {
        if (controller.signal.aborted || active === undefined) return;

        unsubscribeDocument = useGraphStore.subscribe(
          (state) => state.document,
          schedulePush,
        );

        runConflictCheck();

        handleVisibilityChange = () => {
          if (globalThis.document.visibilityState === "visible") runConflictCheck();
        };
        globalThis.document.addEventListener("visibilitychange", handleVisibilityChange);
      })
      .catch(notifyFailure("Could not read the linked gist"));

    return () => {
      controller.abort();
      unsubscribeDocument?.();
      if (pushTimer !== undefined) clearTimeout(pushTimer);
      if (handleVisibilityChange !== undefined) {
        globalThis.document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [graphId, openGitHubPanel, closeGitHubPanel, setSyncConflict]);
}
