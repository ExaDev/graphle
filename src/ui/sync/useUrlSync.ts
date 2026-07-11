/**
 * Keeps the share fragment in sync with the document, in both directions.
 *
 * On mount: an inline `#g=` payload takes precedence and is decoded
 * synchronously; a malformed payload throws {@link ShareDecodeError}, which we
 * surface as a red notification and leave the current document untouched.
 * Otherwise the `#url=` target is resolved asynchronously, in order:
 *
 * 1. A GitHub Projects (v2) URL ({@link parseProjectUrl}) loads via the
 *    authenticated GraphQL client — a stored PAT is used directly; with none
 *    stored, `GitHubPanel` opens (via `store.openGitHubPanel`) with a pending
 *    action that resumes the load once the user validates one. Either way,
 *    on success the address bar is normalised to the project's canonical URL
 *    (stripped of any `/views/{N}` or `?query=` the user pasted — this
 *    codec never tracks a view's filter/sort, it always loads every item).
 * 2. A GitHub repo issues or pull-requests list URL ({@link parseRepoIssuesUrl}/
 *    {@link parseRepoPullRequestsUrl}) loads every open item via the
 *    authenticated GraphQL client, mirroring the Projects branch above (same
 *    stored-PAT-or-prompt flow, same canonical-URL normalisation on success).
 * 3. A GitHub repo-file URL ({@link parseGithubFileUrl}) — either the
 *    human-facing `blob` page or a raw-host URL — loads via the Contents API
 *    ({@link fetchGithubFileRevision}), since the human-facing page is an
 *    HTML document `resolveRemoteUrl`'s plain fetch cannot parse as JSON. A
 *    stored PAT is sent if there is one (higher rate limit, and required for
 *    a private repo); with none stored the fetch proceeds unauthenticated
 *    first, same as a public gist read. Only if that unauthenticated attempt
 *    fails with an auth-shaped kind (`unauthorised`/`forbidden`/`notFound` —
 *    a private repo's Contents API returns a 404 to an anonymous request
 *    rather than a 401/403, to avoid leaking the repo's existence) does this
 *    escalate to `GitHubPanel` and retry once a PAT is validated, mirroring
 *    the Projects branch above; a failure of any other kind (the file existed
 *    but wasn't valid JSON, say) is reported directly without escalating. On
 *    success the address bar is normalised to the file's canonical `blob` URL.
 * 4. Otherwise, {@link resolveRemoteUrl} — a plain remote fetch, or gist
 *    disambiguation when the URL names a gist as a whole rather than one
 *    file (opens `GistPickerModal` via `store.gistPicker` when more than one
 *    file in the gist looks like a graph).
 *
 * Any failure ({@link RemoteLoadError} or {@link GitHubError}) is surfaced as
 * a red notification rather than left to reject silently. The in-flight
 * fetch is aborted on unmount.
 *
 * While mounted: subscribe to document changes and, debounced, write the
 * document back to the URL via `history.replaceState` (no extra history step).
 *
 * The guard against clobbering the just-loaded link is the store's `dirty`
 * flag: loading via `replaceDocument` leaves `dirty = false`, so the load's own
 * document change is skipped by the subscriber. Only edits (`apply`, which sets
 * `dirty = true`) ever reach the URL — including a document that arrived via
 * `#url=`, so a remote pointer is only ever overwritten by a `#g=` snapshot
 * once the user actually changes something; an unedited load, inline or
 * remote, is never needlessly re-serialised or rewritten.
 */
import { useEffect } from "react";
import { notifications } from "@mantine/notifications";

import {
  createGitHubClient,
  GitHubError,
  githubErrorMessage,
  loadProjectDocument,
  loadRepoIssuesDocument,
  loadRepoPullRequestsDocument,
  parseProjectUrl,
  parseRepoIssuesUrl,
  parseRepoPullRequestsUrl,
  type GitHubClient,
  type ParsedProjectUrl,
  type ParsedRepoListUrl,
  type RepoListLoadResult,
} from "@/github";
import { ShareDecodeError } from "@/sharing/codec";
import { resolveRemoteUrl } from "@/sharing/gist";
import { fetchGithubFileRevision } from "@/sharing/github-file";
import {
  canonicalGithubFileUrl,
  parseGithubFileUrl,
  type ParsedGithubFileUrl,
} from "@/sharing/github-file-url";
import { RemoteLoadError } from "@/sharing/remote";
import {
  readDocumentFromLocation,
  readRemoteUrlFromLocation,
  writeDocumentToLocation,
  writeRemoteUrlToLocation,
} from "@/sharing/url";
import { db } from "@/storage/db";
import { createSecretStore } from "@/storage/secret-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

/** Debounce window before a document change is written to the URL fragment. */
const WRITE_DEBOUNCE_MS = 300;

/** Render any thrown value as a message string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A message covering both `GitHubError` (kind-specific guidance) and
 *  `RemoteLoadError`/anything else (its own `.message`). */
function remoteLoadFailureMessage(error: unknown): string {
  if (error instanceof GitHubError) return githubErrorMessage(error);
  return describe(error);
}

export function useUrlSync(): void {
  const replaceDocument = useGraphStore((s) => s.replaceDocument);
  const setGistPicker = useGraphStore((s) => s.setGistPicker);
  const openGitHubPanel = useGraphStore((s) => s.openGitHubPanel);
  const closeGitHubPanel = useGraphStore((s) => s.closeGitHubPanel);

  useEffect(() => {
    // Subscribe before loading so the load's own document change is observed
    // (and skipped, since loading leaves dirty = false).
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useGraphStore.subscribe(
      (state) => state.document,
      () => {
        // Only persist edited documents; the initial document and freshly
        // loaded shares (inline or remote) are clean and must not overwrite
        // the URL.
        if (!useGraphStore.getState().dirty) return;
        if (writeTimer !== undefined) clearTimeout(writeTimer);
        writeTimer = setTimeout(() => {
          writeDocumentToLocation(useGraphStore.getState().document);
        }, WRITE_DEBOUNCE_MS);
      },
    );

    const controller = new AbortController();

    /** Load a GitHub Projects URL with an already-authenticated client,
     *  applying the result or reporting the failure. Shared by the
     *  token-already-stored path and the pending-action resumed after a
     *  fresh PAT validation. */
    function loadProjectWith(
      parsed: ParsedProjectUrl,
      client: GitHubClient,
      onSuccess?: () => void,
    ): void {
      loadProjectDocument(parsed, client, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          replaceDocument(result.document);
          writeRemoteUrlToLocation(result.canonicalUrl);
          onSuccess?.();
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          notifications.show({
            color: "red",
            message: `Could not load the GitHub project: ${remoteLoadFailureMessage(error)}`,
          });
        });
    }

    /** Load a GitHub repo issues or pull-requests list URL with an
     *  already-authenticated client, applying the result or reporting the
     *  failure. Shared by the token-already-stored path and the
     *  pending-action resumed after a fresh PAT validation, mirroring
     *  `loadProjectWith`. */
    function loadRepoListWith(
      parsed: ParsedRepoListUrl,
      loader: (
        parsed: ParsedRepoListUrl,
        client: GitHubClient,
        signal: AbortSignal,
      ) => Promise<RepoListLoadResult>,
      client: GitHubClient,
      onSuccess?: () => void,
    ): void {
      loader(parsed, client, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          replaceDocument(result.document);
          writeRemoteUrlToLocation(result.canonicalUrl);
          onSuccess?.();
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          notifications.show({
            color: "red",
            message: `Could not load the GitHub repo: ${remoteLoadFailureMessage(error)}`,
          });
        });
    }

    /** Whether a failure means "this repo needs auth we don't have yet"
     *  (worth prompting for a PAT and retrying) rather than a genuine failure
     *  (wrong content, network error, etc.) not worth escalating for. */
    function isAuthShapedFailure(error: unknown): boolean {
      if (!(error instanceof RemoteLoadError)) return false;
      return (
        error.kind.type === "unauthorised" ||
        error.kind.type === "forbidden" ||
        error.kind.type === "notFound"
      );
    }

    /** Load a GitHub repo-file URL. Tries unauthenticated first (works for
     *  any public repo, same tier as a gist read); only on an auth-shaped
     *  failure with no token yet tried does this escalate to `GitHubPanel`
     *  and retry once a PAT is validated, mirroring `loadProjectWith`. */
    function loadGithubFileWith(parsed: ParsedGithubFileUrl, token: string | undefined): void {
      fetchGithubFileRevision(parsed.owner, parsed.repo, parsed.branch, parsed.path, token, controller.signal)
        .then((revision) => {
          if (controller.signal.aborted) return;
          replaceDocument(revision.document);
          writeRemoteUrlToLocation(canonicalGithubFileUrl(parsed));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (token === undefined && isAuthShapedFailure(error)) {
            openGitHubPanel(() => {
              const secretStore = createSecretStore(db);
              secretStore
                .getGitHubToken(controller.signal)
                .then((resumedToken) => {
                  if (controller.signal.aborted || resumedToken === undefined) return;
                  loadGithubFileWith(parsed, resumedToken);
                  closeGitHubPanel();
                })
                .catch((tokenError: unknown) => {
                  if (controller.signal.aborted) return;
                  notifications.show({
                    color: "red",
                    message: `Could not read the stored GitHub token: ${describe(tokenError)}`,
                  });
                });
            });
            return;
          }
          notifications.show({
            color: "red",
            message: `Could not load the GitHub file: ${remoteLoadFailureMessage(error)}`,
          });
        });
    }

    // Load: an inline `#g=` share takes precedence and decodes synchronously.
    // A bad payload is reported and the current document is left in place;
    // anything unexpected is rethrown.
    try {
      const loaded = readDocumentFromLocation();
      if (loaded !== undefined) {
        replaceDocument(loaded.document);
      } else {
        // No inline share: fall back to a `#url=` target, if present.
        const remoteUrl = readRemoteUrlFromLocation();
        if (remoteUrl !== undefined) {
          const parsedProject = parseProjectUrl(remoteUrl);
          // Only one of these can match a given URL, but parseRepoIssuesUrl
          // is tried first so parseRepoPullRequestsUrl is never called on a
          // URL that already matched as an issues list.
          const parsedRepoIssues = parseRepoIssuesUrl(remoteUrl);
          const parsedRepoList = parsedRepoIssues ?? parseRepoPullRequestsUrl(remoteUrl);
          if (parsedProject !== undefined) {
            const secretStore = createSecretStore(db);
            secretStore
              .getGitHubToken(controller.signal)
              .then((token) => {
                if (controller.signal.aborted) return;
                if (token !== undefined) {
                  loadProjectWith(parsedProject, createGitHubClient({ token }));
                } else {
                  openGitHubPanel((client) =>
                    loadProjectWith(parsedProject, client, closeGitHubPanel),
                  );
                }
              })
              .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                notifications.show({
                  color: "red",
                  message: `Could not read the stored GitHub token: ${describe(error)}`,
                });
              });
          } else if (parsedRepoList !== undefined) {
            const loader =
              parsedRepoIssues !== undefined ? loadRepoIssuesDocument : loadRepoPullRequestsDocument;
            const secretStore = createSecretStore(db);
            secretStore
              .getGitHubToken(controller.signal)
              .then((token) => {
                if (controller.signal.aborted) return;
                if (token !== undefined) {
                  loadRepoListWith(parsedRepoList, loader, createGitHubClient({ token }));
                } else {
                  openGitHubPanel((client) =>
                    loadRepoListWith(parsedRepoList, loader, client, closeGitHubPanel),
                  );
                }
              })
              .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                notifications.show({
                  color: "red",
                  message: `Could not read the stored GitHub token: ${describe(error)}`,
                });
              });
          } else {
            const parsedGithubFile = parseGithubFileUrl(remoteUrl);
            if (parsedGithubFile !== undefined) {
              const secretStore = createSecretStore(db);
              secretStore
                .getGitHubToken(controller.signal)
                .then((token) => {
                  if (controller.signal.aborted) return;
                  loadGithubFileWith(parsedGithubFile, token);
                })
                .catch((error: unknown) => {
                  if (controller.signal.aborted) return;
                  notifications.show({
                    color: "red",
                    message: `Could not read the stored GitHub token: ${describe(error)}`,
                  });
                });
            } else {
              resolveRemoteUrl(remoteUrl, controller.signal)
                .then((result) => {
                  if (controller.signal.aborted) return;
                  if (result.kind === "ambiguousGist") {
                    setGistPicker({ candidates: result.candidates });
                    return;
                  }
                  replaceDocument(result.document);
                  // Normalise the address bar to the resolved single-file URL
                  // so a reload skips re-resolving an ambiguous gist URL.
                  if (result.resolvedUrl !== remoteUrl) {
                    writeRemoteUrlToLocation(result.resolvedUrl);
                  }
                })
                .catch((error: unknown) => {
                  if (controller.signal.aborted) return;
                  notifications.show({
                    color: "red",
                    message:
                      error instanceof RemoteLoadError
                        ? `Could not load the remote graph: ${error.message}`
                        : `Could not load the remote graph: ${describe(error)}`,
                  });
                });
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof ShareDecodeError) {
        notifications.show({
          color: "red",
          message: `Could not open the shared graph: ${error.message}`,
        });
      } else {
        throw error;
      }
    }

    return () => {
      unsubscribe();
      controller.abort();
      if (writeTimer !== undefined) clearTimeout(writeTimer);
    };
  }, [replaceDocument, setGistPicker, openGitHubPanel, closeGitHubPanel]);
}
