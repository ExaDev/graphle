/**
 * Keeps the singleton type library synchronised with its linked gist or repo
 * file when `linkedRemote.syncMode === "automatic"`. A no-op when no library
 * has been saved yet, the library has no `linkedRemote`, or `syncMode` is
 * `"off"`/`"manual"`. Mirrors {@link useGistAutoSync}/{@link
 * useGithubFileAutoSync} in spirit -- fresh-row re-reads that never trust a
 * value captured earlier in the session, the mismatch-vs-match branch on the
 * live remote head, and the PAT-resume flow through the shared GitHub panel
 * -- but adapts the trigger model to a materially different resource.
 *
 * The graph hooks subscribe to `useGraphStore.document`, which changes on
 * every canvas edit, and debounce a push after each change. The type library
 * has no equivalent live, continuously-edited document: it only changes when
 * the user explicitly saves an edit via the type editor UI (a later phase),
 * so there is no per-keystroke signal to debounce a push off in the first
 * place. Wiring up an unused subscription would be solving a problem this
 * resource doesn't have.
 *
 * Instead this hook triggers ONCE on mount and again on every tab
 * `visibilitychange` to `"visible"` -- the same opportunistic timing the
 * graph hooks already use for their read-only pull-side conflict check,
 * reused here as the ONLY trigger, covering both roles at once: each firing
 * compares the live remote head against `linkedRemote.lastSyncedRevision`
 * and either pushes (on a match, or no prior sync at all) or sets
 * `syncConflict` (on a mismatch). "Automatic" mode for the type library
 * therefore means opportunistic sync on load/tab-focus, not continuous
 * debounced push on every edit. Manual Push (a later phase's UI) remains the
 * primary way an edit actually reaches the remote; automatic mode is a
 * convenience that catches a still-matching remote up on load without
 * requiring the user to remember to push by hand.
 *
 * With no PAT stored, `openGitHubPanel` prompts for one and the sync resumes
 * once validated, exactly like the graph hooks' PAT-resume flow.
 */
import { useEffect } from "react";
import { notifications } from "@mantine/notifications";

import { resolveGithubToken } from "@/github";
import { fetchGithubFileSha, pushGithubFileContent } from "@/sharing/github-file";
import { listGistHistory, pushGistFile } from "@/sharing/gist";
import { serialiseTypeLibrary } from "@/sharing/type-library-json";
import type { LinkedRemoteSource, StoredTypeLibrary } from "@/schema";
import { db } from "@/storage/db";
import { createTypeLibraryStore } from "@/storage/type-library-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";
import { useTypeLibraryStore } from "@/ui/store/type-library-store";

/** Render any thrown value as a message string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The live remote HEAD for a linked type library, whatever provider it is
 *  linked through -- a gist's newest history entry's version, or a repo
 *  file's current blob sha. */
async function fetchRemoteHead(
  remote: LinkedRemoteSource,
  token: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  if (remote.provider === "gist") {
    const history = await listGistHistory(remote.gistId, signal);
    const head = history[0];
    if (head === undefined) {
      throw new Error(`Gist ${remote.gistId} has no revision history`);
    }
    return head.version;
  }
  return fetchGithubFileSha(
    remote.owner,
    remote.repo,
    remote.branch,
    remote.path,
    token,
    signal,
  );
}

/** Push `content` to whichever provider `remote` links to, returning the new
 *  remote head. `currentRemoteHead` is the blob sha `pushGithubFileContent`
 *  needs to detect a concurrent write against the Contents API -- always
 *  available here, since every call site fetches it via {@link
 *  fetchRemoteHead} immediately beforehand. */
async function pushToRemote(
  remote: LinkedRemoteSource,
  content: string,
  currentRemoteHead: string,
  token: string,
  signal: AbortSignal,
): Promise<string> {
  if (remote.provider === "gist") {
    return pushGistFile(remote.gistId, remote.filename, content, token, signal);
  }
  return pushGithubFileContent(
    remote.owner,
    remote.repo,
    remote.branch,
    remote.path,
    content,
    currentRemoteHead,
    token,
    signal,
  );
}

export function useTypeLibraryAutoSync(): void {
  const openGitHubPanel = useGraphStore((s) => s.openGitHubPanel);
  const closeGitHubPanel = useGraphStore((s) => s.closeGitHubPanel);
  const setSyncConflict = useTypeLibraryStore((s) => s.setSyncConflict);

  useEffect(() => {
    const controller = new AbortController();
    const typeLibraryStore = createTypeLibraryStore(db);

    let handleVisibilityChange: (() => void) | undefined;

    /** Report a failure unless it is just this effect's own cleanup aborting
     *  the in-flight request. */
    function notifyFailure(prefix: string): (error: unknown) => void {
      return (error: unknown) => {
        if (controller.signal.aborted) return;
        notifications.show({ color: "red", message: `${prefix}: ${describe(error)}` });
      };
    }

    /** Re-read the stored type library fresh and narrow it to an active
     *  (automatic-syncMode, linked) remote, or `undefined` when the library
     *  is not eligible for auto-sync right now. */
    async function readActiveLinkedRemote(): Promise<
      { stored: StoredTypeLibrary; remote: LinkedRemoteSource } | undefined
    > {
      const stored = await typeLibraryStore.get(controller.signal);
      if (stored === undefined) return undefined;
      const remote = stored.linkedRemote;
      if (remote === undefined) return undefined;
      if (remote.syncMode !== "automatic") return undefined;
      return { stored, remote };
    }

    /** Compare the live remote head against `lastSyncedRevision`: on a match
     *  (or no prior sync at all) push the current library and record the new
     *  head; on a mismatch, set `syncConflict` instead of pushing. This is
     *  the whole of "automatic" mode for the type library -- see the module
     *  doc for why there is no separate debounced-on-edit push the way the
     *  graph hooks have one. */
    async function attemptSync(tokenId: string, token: string, onSuccess?: () => void): Promise<void> {
      const active = await readActiveLinkedRemote();
      if (active === undefined) return;
      const { stored, remote } = active;

      const remoteHead = await fetchRemoteHead(remote, token, controller.signal);

      if (
        remote.lastSyncedRevision !== undefined &&
        remoteHead !== remote.lastSyncedRevision
      ) {
        setSyncConflict({ localDocument: stored.document, remoteSha: remoteHead });
        return;
      }

      const newSha = await pushToRemote(
        remote,
        serialiseTypeLibrary(stored.document),
        remoteHead,
        token,
        controller.signal,
      );
      const syncedRemote: LinkedRemoteSource = {
        ...remote,
        lastSyncedRevision: newSha,
        lastSyncedAt: new Date().toISOString(),
        lastUsedTokenId: tokenId,
      };
      await typeLibraryStore.save({ ...stored, linkedRemote: syncedRemote }, controller.signal);
      onSuccess?.();
    }

    /** Sync now, prompting for a PAT via the GitHub panel and resuming once
     *  validated when none is stored yet. */
    async function runSync(): Promise<void> {
      const active = await readActiveLinkedRemote();
      if (controller.signal.aborted || active === undefined) return;
      const owner = active.remote.provider === "githubFile" ? active.remote.owner : undefined;
      const pinnedTokenId = active.remote.lastUsedTokenId;
      const resolved = await resolveGithubToken(owner, controller.signal, pinnedTokenId);
      if (controller.signal.aborted) return;

      if (resolved !== undefined) {
        await attemptSync(resolved.id, resolved.token);
        return;
      }

      // No token resolves: prompt via the shared drawer and resume once the
      // user validates one, mirroring useGistAutoSync's identical fallback.
      openGitHubPanel({
        ...(owner === undefined ? {} : { suggestedOwner: owner }),
        pendingAction: () => {
          resolveGithubToken(owner, controller.signal, pinnedTokenId)
            .then((resumedResolved) => {
              if (controller.signal.aborted || resumedResolved === undefined) return undefined;
              return attemptSync(resumedResolved.id, resumedResolved.token, closeGitHubPanel);
            })
            .catch(notifyFailure("Could not sync the type library"));
        },
      });
    }

    function triggerSync(): void {
      runSync().catch(notifyFailure("Could not sync the type library"));
    }

    // Gate the whole hook on one fresh read: only a library currently linked
    // for automatic sync gets a visibilitychange listener at all, so an
    // unlinked or manually-synced library never triggers so much as an
    // IndexedDB read on tab focus.
    readActiveLinkedRemote()
      .then((active) => {
        if (controller.signal.aborted || active === undefined) return;

        triggerSync();

        handleVisibilityChange = () => {
          if (globalThis.document.visibilityState === "visible") triggerSync();
        };
        globalThis.document.addEventListener("visibilitychange", handleVisibilityChange);
      })
      .catch(notifyFailure("Could not read the linked type library"));

    return () => {
      controller.abort();
      if (handleVisibilityChange !== undefined) {
        globalThis.document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [openGitHubPanel, closeGitHubPanel, setSyncConflict]);
}
