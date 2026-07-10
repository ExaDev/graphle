/**
 * Keeps a graph's document synchronised with its linked repo file when
 * `linkedRemote.syncMode === "automatic"`. A no-op for any other graph: no
 * store id, a graph with no `linkedRemote`, a linked source pointing at a
 * provider other than `"githubFile"`, or `syncMode` set to `"off"`/`"manual"`.
 * Mirrors {@link useGistAutoSync} exactly, substituting the Contents API
 * (`@/sharing/github-file`) for the Gist API — see that hook's doc for the
 * shared design: fresh-row re-reads (never trusting a value captured earlier
 * in the session), the debounced dirty-triggered push, the mount/visibility
 * pull-side conflict check, and the PAT-resume flow through the shared GitHub
 * panel.
 *
 * PUSH: debounced `PUSH_DEBOUNCE_MS` after a `dirty` document change. Before
 * pushing, the file's live blob sha ({@link fetchGithubFileSha}) is compared
 * against `linkedRemote.lastSyncedRevision`: a match (or no prior sync at
 * all) proceeds to {@link pushGithubFileContent} using that same live sha —
 * which the Contents API's PUT requires to detect a concurrent write — and
 * records the new sha; a mismatch means the remote moved since the last
 * sync, so the push is skipped and `store.syncConflict` is set instead.
 *
 * PULL/conflict check: runs once on mount and again on every
 * `visibilitychange` to `"visible"`, comparing the live blob sha against
 * `lastSyncedRevision`. Never pulls or overwrites the local document itself —
 * resolving a conflict is `SyncConflictModal`'s job.
 */
import { useEffect } from "react";
import { notifications } from "@mantine/notifications";

import { fetchGithubFileSha, pushGithubFileContent } from "@/sharing/github-file";
import { serialiseDocument } from "@/sharing/json";
import type { GraphDocument, LinkedRemoteSource, StoredGraph } from "@/schema";
import { db } from "@/storage/db";
import { createGraphStore } from "@/storage/graph-store-dexie";
import { createSecretStore } from "@/storage/secret-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

/** Debounce window before a dirty document change triggers a push. Matches
 *  {@link PUSH_DEBOUNCE_MS} in `useGistAutoSync.ts`. */
const PUSH_DEBOUNCE_MS = 300;

/** The `linkedRemote` shape this hook acts on. */
type GithubFileLinkedRemote = Extract<LinkedRemoteSource, { provider: "githubFile" }>;

/** Render any thrown value as a message string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useGithubFileAutoSync(): void {
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
    const secretStore = createSecretStore(db);

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
     *  (automatic, githubFile-provider) linked remote, or `undefined` when
     *  this graph is not eligible for auto-sync right now. */
    async function readActiveLinkedRemote(): Promise<
      { stored: StoredGraph; remote: GithubFileLinkedRemote } | undefined
    > {
      const stored = await graphStore.get(activeGraphId, controller.signal);
      if (stored === undefined) return undefined;
      const remote = stored.linkedRemote;
      if (remote === undefined) return undefined;
      if (remote.provider !== "githubFile") return undefined;
      if (remote.syncMode !== "automatic") return undefined;
      return { stored, remote };
    }

    /** Push `currentDocument` to the linked repo file, guarding against a
     *  remote that moved since the last recorded sync by setting
     *  `syncConflict` instead of overwriting it. */
    async function attemptPush(
      currentDocument: GraphDocument,
      token: string,
      onSuccess?: () => void,
    ): Promise<void> {
      const active = await readActiveLinkedRemote();
      if (active === undefined) return;
      const { stored, remote } = active;

      const currentSha = await fetchGithubFileSha(
        remote.owner,
        remote.repo,
        remote.branch,
        remote.path,
        token,
        controller.signal,
      );

      if (
        remote.lastSyncedRevision !== undefined &&
        currentSha !== remote.lastSyncedRevision
      ) {
        setSyncConflict({
          graphId: activeGraphId,
          localDocument: currentDocument,
          remoteSha: currentSha,
        });
        return;
      }

      const newSha = await pushGithubFileContent(
        remote.owner,
        remote.repo,
        remote.branch,
        remote.path,
        serialiseDocument(currentDocument),
        currentSha,
        token,
        controller.signal,
      );
      const syncedRemote: GithubFileLinkedRemote = {
        ...remote,
        lastSyncedRevision: newSha,
        lastSyncedAt: new Date().toISOString(),
      };
      await graphStore.save({ ...stored, linkedRemote: syncedRemote }, controller.signal);
      onSuccess?.();
    }

    /** Compare the live blob sha against `lastSyncedRevision`, setting
     *  `syncConflict` on a mismatch. Never pulls the remote content itself. */
    async function checkForConflict(): Promise<void> {
      const active = await readActiveLinkedRemote();
      if (active === undefined) return;
      const { remote } = active;
      if (remote.lastSyncedRevision === undefined) return;

      const token = await secretStore.getGitHubToken(controller.signal);
      if (controller.signal.aborted) return;

      const currentSha = await fetchGithubFileSha(
        remote.owner,
        remote.repo,
        remote.branch,
        remote.path,
        token,
        controller.signal,
      );
      if (currentSha === remote.lastSyncedRevision) return;

      setSyncConflict({
        graphId: activeGraphId,
        localDocument: useGraphStore.getState().document,
        remoteSha: currentSha,
      });
    }

    /** Push the current document, prompting for a PAT via the GitHub panel
     *  and resuming once validated when none is stored yet. */
    async function runPush(): Promise<void> {
      const currentDocument = useGraphStore.getState().document;
      const token = await secretStore.getGitHubToken(controller.signal);
      if (controller.signal.aborted) return;

      if (token !== undefined) {
        await attemptPush(currentDocument, token);
        return;
      }

      // No stored PAT: prompt via the shared drawer and resume once the user
      // validates one, mirroring useGistAutoSync's identical fallback.
      openGitHubPanel(() => {
        secretStore
          .getGitHubToken(controller.signal)
          .then((resumedToken) => {
            if (controller.signal.aborted || resumedToken === undefined) return undefined;
            return attemptPush(
              useGraphStore.getState().document,
              resumedToken,
              closeGitHubPanel,
            );
          })
          .catch(notifyFailure("Could not sync to the repo file"));
      });
    }

    function schedulePush(): void {
      if (!useGraphStore.getState().dirty) return;
      if (pushTimer !== undefined) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        runPush().catch(notifyFailure("Could not sync to the repo file"));
      }, PUSH_DEBOUNCE_MS);
    }

    function runConflictCheck(): void {
      checkForConflict().catch(notifyFailure("Could not check for repo file changes"));
    }

    // Gate the whole hook on one fresh read: only a graph currently linked
    // for automatic githubFile sync gets a document subscription and a
    // visibilitychange listener at all.
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
      .catch(notifyFailure("Could not read the linked repo file"));

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
