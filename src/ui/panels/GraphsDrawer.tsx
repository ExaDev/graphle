/**
 * Drawer listing saved graphs (IndexedDB via the storage contract) with
 * Save / Save as / Load / Rename / Delete, plus JSON export and import.
 *
 * The list is live: `useLiveQuery` re-runs whenever the underlying Dexie table
 * changes, so a save or delete in this drawer (or anywhere) refreshes the list
 * without manual invalidation. All storage goes through `createGraphStore(db)`
 * — the UI never touches Dexie directly, keeping the storage boundary clean.
 *
 * Import parses through `importDocument` (the Zod-validated codec), so a
 * malformed file is reported as a notification and leaves the current document
 * untouched rather than silently producing an invalid graph.
 *
 * "Load from URL" resolves a remote document via `resolveRemoteUrl` (the same
 * JSON-shape detection as `#url=` share fragments and file import, plus gist
 * disambiguation — see `@/sharing/gist`) and, on success, points the address
 * bar at the resolved URL via `writeRemoteUrlToLocation` so the resulting
 * share link stays a live pointer rather than a frozen snapshot — mirroring
 * how `useUrlSync` handles a `#url=` fragment on load. An ambiguous gist
 * (more than one file looks like a graph) opens `GistPickerModal` instead of
 * loading anything, via the shared `store.gistPicker` state.
 *
 * A GitHub Projects (v2) URL takes a different, authenticated path instead:
 * see `handleLoadFromUrl`'s branch on `parseProjectUrl`, which mirrors
 * `useUrlSync`'s identical branch for the `#url=` case. A GitHub repo issues
 * or pull-requests list URL (see `@/github/repo-list-url`) takes a similar
 * authenticated path — the branch on `parseRepoIssuesUrl`/
 * `parseRepoPullRequestsUrl`, mirroring `useUrlSync`'s identical branch. A
 * GitHub repo-file URL (a `blob` page or a raw-host URL, see
 * `@/sharing/github-file-url`) takes a fourth path, through the Contents API —
 * see the branch on `parseGithubFileUrl`, which mirrors `useUrlSync`'s
 * identical branch.
 *
 * "Remote sync" (shown only for a graph whose stored record carries a
 * `linkedRemote` with `syncMode !== "off"`) offers manual Push/Pull against
 * that gist or repo file, alongside the automatic background sync
 * `useGistAutoSync`/`useGithubFileAutoSync` run for `syncMode: "automatic"`
 * graphs — the two share the same provider API calls and PAT-resume
 * mechanism (see `handlePushToGist`/`handlePushToGithubFile`) but this pair
 * is always user-triggered, regardless of `syncMode`.
 */
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Drawer,
  FileInput,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCloudDownload,
  IconCloudUpload,
  IconDownload,
  IconHistory,
  IconPencil,
  IconTrash,
  IconUpload,
  IconWorldDownload,
} from "@tabler/icons-react";
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
import { fetchGistRevision, listGistHistory, pushGistFile, resolveRemoteUrl } from "@/sharing/gist";
import {
  fetchGithubBlobRevision,
  fetchGithubFileRevision,
  fetchGithubFileSha,
  listGithubFileHistory,
  pushGithubFileContent,
  type GithubFileHistoryEntry,
} from "@/sharing/github-file";
import {
  canonicalGithubFileUrl,
  parseGithubFileUrl,
  type ParsedGithubFileUrl,
} from "@/sharing/github-file-url";
import { exportCanvasDocument, exportDocument, importDocument, serialiseDocument } from "@/sharing/json";
import { RemoteLoadError } from "@/sharing/remote";
import { writeRemoteUrlToLocation } from "@/sharing/url";
import { type LinkedRemoteSource, type StoredGraphSummary } from "@/schema";
import { db } from "@/storage/db";
import { createGraphStore } from "@/storage/graph-store-dexie";
import { createRevisionStore } from "@/storage/revision-store-dexie";
import { createSecretStore } from "@/storage/secret-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

import { graphRow, selectedGraphRow } from "./GraphsDrawer.css";

/** The `linkedRemote` shapes this drawer's manual sync actions act on, one
 *  per provider. */
type GistLinkedRemote = Extract<LinkedRemoteSource, { provider: "gist" }>;
type GithubFileLinkedRemote = Extract<LinkedRemoteSource, { provider: "githubFile" }>;

export interface GraphsDrawerProps {
  opened: boolean;
  onClose: () => void;
}

/** Stable empty list used as the `useLiveQuery` default before the first read. */
const EMPTY_SUMMARIES: StoredGraphSummary[] = [];

export function GraphsDrawer({ opened, onClose }: GraphsDrawerProps) {
  // The store is created once; `db` is a process-wide singleton.
  const store = useMemo(() => createGraphStore(db), []);

  const document = useGraphStore((state) => state.document);
  const graphId = useGraphStore((state) => state.graphId);
  const dirty = useGraphStore((state) => state.dirty);
  const apply = useGraphStore((state) => state.apply);
  const replaceDocument = useGraphStore((state) => state.replaceDocument);
  const setGraphId = useGraphStore((state) => state.setGraphId);
  const markSaved = useGraphStore((state) => state.markSaved);
  const setGistPicker = useGraphStore((state) => state.setGistPicker);
  const openGitHubPanel = useGraphStore((state) => state.openGitHubPanel);
  const closeGitHubPanel = useGraphStore((state) => state.closeGitHubPanel);

  const summaries = useLiveQuery(
    async () => store.list(new AbortController().signal),
    [],
    EMPTY_SUMMARIES,
  );

  // The live store only tracks the current document, not the persisted
  // StoredGraph row that carries `linkedRemote` — re-read it live so the
  // Remote sync section reflects the current graph's link (or its absence)
  // without a manual refresh.
  const currentGraph = useLiveQuery(
    async () =>
      graphId === undefined ? undefined : store.get(graphId, new AbortController().signal),
    [graphId],
  );
  const linkedGist: GistLinkedRemote | undefined =
    currentGraph?.linkedRemote?.provider === "gist" ? currentGraph.linkedRemote : undefined;
  const linkedGithubFile: GithubFileLinkedRemote | undefined =
    currentGraph?.linkedRemote?.provider === "githubFile"
      ? currentGraph.linkedRemote
      : undefined;

  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  // A linked repo file's commit history, shown on demand via a "History"
  // toggle rather than fetched eagerly — it is keyed to whichever graph is
  // currently open, so switching graphs while it's shown must not leave a
  // stale list attributed to the new graph's (possibly unrelated) link. Reset
  // DURING RENDER (the React-recommended "adjust state when a prop changes"
  // pattern, already used by ExpandMenu's per-node tails) rather than in an
  // effect, which would trip the set-state-in-effect rule.
  const [fileHistory, setFileHistory] = useState<GithubFileHistoryEntry[] | undefined>(
    undefined,
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [fileHistoryGraphId, setFileHistoryGraphId] = useState(currentGraph?.id);
  if (fileHistoryGraphId !== currentGraph?.id) {
    setFileHistoryGraphId(currentGraph?.id);
    setFileHistory(undefined);
  }

  async function handleSave(): Promise<void> {
    if (graphId === undefined) {
      void handleSaveAs();
      return;
    }
    const controller = new AbortController();
    const existing = await store.get(graphId, controller.signal);
    if (existing === undefined) {
      // The backing graph was deleted (e.g. another tab). Save the live
      // document as a new graph instead of dropping the user's work silently.
      void handleSaveAs();
      return;
    }
    await store.save(
      { ...existing, document, updatedAt: new Date().toISOString() },
      controller.signal,
    );
    markSaved();
  }

  async function handleSaveAs(): Promise<void> {
    const name = window.prompt("Save graph as", document.name);
    if (name === null) return; // user cancelled
    const finalName = name === "" ? document.name : name;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const controller = new AbortController();
    await store.save(
      { id, name: finalName, document, createdAt: now, updatedAt: now },
      controller.signal,
    );
    setGraphId(id);
    apply({ type: "renameGraph", name: finalName });
    markSaved();
  }

  async function handleLoad(id: string): Promise<void> {
    const controller = new AbortController();
    const graph = await store.get(id, controller.signal);
    if (graph === undefined) return;
    replaceDocument(graph.document);
    setGraphId(graph.id);
    // replaceDocument already clears the dirty flag.
  }

  async function handleRename(id: string): Promise<void> {
    const controller = new AbortController();
    const graph = await store.get(id, controller.signal);
    if (graph === undefined) return;
    const name = window.prompt("Rename graph", graph.name);
    if (name === null || name === "") return;
    const isCurrent = id === graphId;
    // Persist the LIVE document for the current graph so any unsaved edits are
    // written (not the stale stored snapshot); markSaved then matches disk.
    const documentToSave = isCurrent ? document : graph.document;
    await store.save(
      {
        ...graph,
        name,
        document: { ...documentToSave, name },
        updatedAt: new Date().toISOString(),
      },
      controller.signal,
    );
    if (isCurrent) {
      apply({ type: "renameGraph", name });
      markSaved();
    }
  }

  async function handleDelete(id: string): Promise<void> {
    const controller = new AbortController();
    await store.remove(id, controller.signal);
    if (id === graphId) setGraphId(undefined);
  }

  function handleExport(): void {
    exportDocument(document);
  }

  function handleExportCanvas(): void {
    exportCanvasDocument(document);
  }

  async function handleImport(file: File): Promise<void> {
    try {
      const text = await file.text();
      replaceDocument(importDocument(text));
      setGraphId(undefined);
      notifications.show({ color: "green", message: "Graph imported" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /**
   * Load a GitHub Projects URL with an already-authenticated client, applying
   * the result or reporting the failure itself — this is also handed to
   * `openGitHubPanel` as a fire-and-forget pending action (no surrounding
   * try/catch there), so it cannot leave an error unhandled.
   */
  async function loadGitHubProject(
    parsed: ParsedProjectUrl,
    client: GitHubClient,
  ): Promise<void> {
    try {
      const result = await loadProjectDocument(parsed, client, new AbortController().signal);
      replaceDocument(result.document);
      setGraphId(undefined);
      writeRemoteUrlToLocation(result.canonicalUrl);
      notifications.show({ color: "green", message: "GitHub project loaded" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not load the GitHub project: ${
          error instanceof GitHubError
            ? githubErrorMessage(error)
            : error instanceof Error
              ? error.message
              : String(error)
        }`,
      });
    }
  }

  /**
   * Load a GitHub repo issues or pull-requests list URL with an
   * already-authenticated client, applying the result or reporting the
   * failure itself — mirrors `loadGitHubProject`, including its use as a
   * fire-and-forget `openGitHubPanel` pending action.
   */
  async function loadGitHubRepoList(
    parsed: ParsedRepoListUrl,
    loader: (
      parsed: ParsedRepoListUrl,
      client: GitHubClient,
      signal: AbortSignal,
    ) => Promise<RepoListLoadResult>,
    client: GitHubClient,
  ): Promise<void> {
    try {
      const result = await loader(parsed, client, new AbortController().signal);
      replaceDocument(result.document);
      setGraphId(undefined);
      writeRemoteUrlToLocation(result.canonicalUrl);
      notifications.show({ color: "green", message: "GitHub repo loaded" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not load the GitHub repo: ${
          error instanceof GitHubError
            ? githubErrorMessage(error)
            : error instanceof Error
              ? error.message
              : String(error)
        }`,
      });
    }
  }

  /** Load a GitHub repo-file URL, using a stored PAT if there is one but
   *  never prompting for one — a repo-file read works unauthenticated for a
   *  public repo, mirroring `useUrlSync`'s identical branch. */
  /**
   * Load a GitHub repo-file URL. Tries unauthenticated first (works for any
   * public repo); only on an auth-shaped failure with no token yet tried does
   * this escalate to `GitHubPanel` and retry once a PAT is validated —
   * mirroring `handleLoadFromUrl`'s existing GitHub Projects branch, and
   * `useUrlSync`'s identical repo-file branch for the `#url=` case. A private
   * repo's Contents API returns a 404 to an anonymous request rather than a
   * 401/403, to avoid leaking the repo's existence, hence `notFound` is
   * treated as auth-shaped here alongside `unauthorised`/`forbidden`.
   */
  async function loadGithubFile(parsed: ParsedGithubFileUrl): Promise<void> {
    const secretStore = createSecretStore(db);
    const token = await secretStore.getGitHubToken(new AbortController().signal);
    try {
      const revision = await fetchGithubFileRevision(
        parsed.owner,
        parsed.repo,
        parsed.branch,
        parsed.path,
        token,
        new AbortController().signal,
      );
      replaceDocument(revision.document);
      setGraphId(undefined);
      writeRemoteUrlToLocation(canonicalGithubFileUrl(parsed));
      notifications.show({ color: "green", message: "Graph loaded from GitHub" });
    } catch (error) {
      const authShaped =
        error instanceof RemoteLoadError &&
        (error.kind.type === "unauthorised" ||
          error.kind.type === "forbidden" ||
          error.kind.type === "notFound");
      if (token === undefined && authShaped) {
        openGitHubPanel(() => {
          secretStore
            .getGitHubToken(new AbortController().signal)
            .then((resumedToken) => {
              if (resumedToken === undefined) return undefined;
              return loadGithubFile(parsed).then(closeGitHubPanel);
            })
            .catch((tokenError: unknown) => {
              notifications.show({
                color: "red",
                message: `Could not read the stored GitHub token: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`,
              });
            });
        });
        return;
      }
      throw error;
    }
  }

  async function handleLoadFromUrl(): Promise<void> {
    const trimmed = remoteUrl.trim();
    if (trimmed === "") return;
    setRemoteLoading(true);
    try {
      const parsedProject = parseProjectUrl(trimmed);
      if (parsedProject !== undefined) {
        const secretStore = createSecretStore(db);
        const token = await secretStore.getGitHubToken(new AbortController().signal);
        if (token !== undefined) {
          await loadGitHubProject(parsedProject, createGitHubClient({ token }));
        } else {
          openGitHubPanel((client) => {
            void loadGitHubProject(parsedProject, client).then(closeGitHubPanel);
          });
        }
        return;
      }

      const parsedRepoIssues = parseRepoIssuesUrl(trimmed);
      const parsedRepoList = parsedRepoIssues ?? parseRepoPullRequestsUrl(trimmed);
      if (parsedRepoList !== undefined) {
        const loader = parsedRepoIssues !== undefined ? loadRepoIssuesDocument : loadRepoPullRequestsDocument;
        const secretStore = createSecretStore(db);
        const token = await secretStore.getGitHubToken(new AbortController().signal);
        if (token !== undefined) {
          await loadGitHubRepoList(parsedRepoList, loader, createGitHubClient({ token }));
        } else {
          openGitHubPanel((client) => {
            void loadGitHubRepoList(parsedRepoList, loader, client).then(closeGitHubPanel);
          });
        }
        return;
      }

      const parsedGithubFile = parseGithubFileUrl(trimmed);
      if (parsedGithubFile !== undefined) {
        await loadGithubFile(parsedGithubFile);
        return;
      }

      const result = await resolveRemoteUrl(trimmed, new AbortController().signal);
      if (result.kind === "ambiguousGist") {
        setGistPicker({ candidates: result.candidates });
        return;
      }
      replaceDocument(result.document);
      setGraphId(undefined);
      // Point the address bar at the resolved URL so the resulting link
      // stays a live pointer, shareable the same way #g= links are — and, for
      // a gist that auto-resolved to its one graph file, points at that
      // specific file rather than the ambiguous gist URL the user pasted.
      writeRemoteUrlToLocation(result.resolvedUrl);
      notifications.show({ color: "green", message: "Graph loaded from URL" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not load from URL: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setRemoteLoading(false);
    }
  }

  /**
   * Push the current document to the linked gist, guarding against a remote
   * that moved since the last recorded sync by reporting a conflict instead
   * of overwriting it — mirroring `useGistAutoSync`'s `attemptPush`, since a
   * manual push must respect the same never-silently-overwrite invariant as
   * the automatic path.
   */
  async function pushToGist(remote: GistLinkedRemote, token: string): Promise<void> {
    if (currentGraph === undefined) return;
    const controller = new AbortController();
    const history = await listGistHistory(remote.gistId, controller.signal);
    const remoteHead = history[0];
    if (remoteHead === undefined) {
      throw new Error(`Gist ${remote.gistId} has no revision history`);
    }
    if (
      remote.lastSyncedRevision !== undefined &&
      remoteHead.version !== remote.lastSyncedRevision
    ) {
      notifications.show({
        color: "orange",
        message: "The gist has changed since the last sync — pull first, then push.",
      });
      return;
    }
    const newSha = await pushGistFile(
      remote.gistId,
      remote.filename,
      serialiseDocument(currentGraph.document),
      token,
      controller.signal,
    );
    const syncedRemote: GistLinkedRemote = {
      ...remote,
      lastSyncedRevision: newSha,
      lastSyncedAt: new Date().toISOString(),
    };
    await store.save({ ...currentGraph, linkedRemote: syncedRemote }, controller.signal);
    notifications.show({ color: "green", message: "Pushed to gist" });
  }

  async function handlePushToGist(): Promise<void> {
    if (linkedGist === undefined) return;
    setSyncLoading(true);
    try {
      const secretStore = createSecretStore(db);
      const token = await secretStore.getGitHubToken(new AbortController().signal);
      if (token !== undefined) {
        await pushToGist(linkedGist, token);
        return;
      }
      // No stored PAT: the panel only ever gives back a GitHubClient, which
      // never exposes its own token (SECURITY, see GitHubPanel.tsx); re-read
      // the token from the SecretStore once validation has saved it, exactly
      // as useGistAutoSync's runPush does for the automatic path.
      openGitHubPanel(() => {
        secretStore
          .getGitHubToken(new AbortController().signal)
          .then((resumedToken) => {
            if (resumedToken === undefined) return undefined;
            return pushToGist(linkedGist, resumedToken).then(closeGitHubPanel);
          })
          .catch((error: unknown) => {
            notifications.show({
              color: "red",
              message: `Could not push to gist: ${error instanceof Error ? error.message : String(error)}`,
            });
          });
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not push to gist: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setSyncLoading(false);
    }
  }

  async function handlePullFromGist(): Promise<void> {
    if (linkedGist === undefined || currentGraph === undefined) return;
    setSyncLoading(true);
    try {
      const controller = new AbortController();
      const history = await listGistHistory(linkedGist.gistId, controller.signal);
      const remoteHead = history[0];
      if (remoteHead === undefined) {
        throw new Error(`Gist ${linkedGist.gistId} has no revision history`);
      }
      const pulled = await fetchGistRevision(
        linkedGist.gistId,
        remoteHead.version,
        linkedGist.filename,
        controller.signal,
      );
      replaceDocument(pulled);
      const syncedRemote: GistLinkedRemote = {
        ...linkedGist,
        lastSyncedRevision: remoteHead.version,
        lastSyncedAt: new Date().toISOString(),
      };
      await store.save(
        { ...currentGraph, document: pulled, linkedRemote: syncedRemote },
        controller.signal,
      );
      // The extension point the local revision-history design reserved for
      // exactly this case: a pull is recorded like any other revision, but
      // tagged with its provenance rather than looking like a local edit.
      const revisionStore = createRevisionStore(db);
      await revisionStore.record(
        {
          id: crypto.randomUUID(),
          graphId: currentGraph.id,
          document: pulled,
          createdAt: new Date().toISOString(),
          origin: "remote-pull",
        },
        controller.signal,
      );
      notifications.show({ color: "green", message: "Pulled latest from gist" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not pull from gist: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setSyncLoading(false);
    }
  }

  /**
   * Push the current document to the linked repo file, guarding against a
   * remote that moved since the last recorded sync by reporting a conflict
   * instead of overwriting it — mirroring `pushToGist` and
   * `useGithubFileAutoSync`'s `attemptPush`.
   */
  async function pushToGithubFile(remote: GithubFileLinkedRemote, token: string): Promise<void> {
    if (currentGraph === undefined) return;
    const controller = new AbortController();
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
      notifications.show({
        color: "orange",
        message: "The repo file has changed since the last sync — pull first, then push.",
      });
      return;
    }
    const newSha = await pushGithubFileContent(
      remote.owner,
      remote.repo,
      remote.branch,
      remote.path,
      serialiseDocument(currentGraph.document),
      currentSha,
      token,
      controller.signal,
    );
    const syncedRemote: GithubFileLinkedRemote = {
      ...remote,
      lastSyncedRevision: newSha,
      lastSyncedAt: new Date().toISOString(),
    };
    await store.save({ ...currentGraph, linkedRemote: syncedRemote }, controller.signal);
    notifications.show({ color: "green", message: "Pushed to repo file" });
  }

  async function handlePushToGithubFile(): Promise<void> {
    if (linkedGithubFile === undefined) return;
    setSyncLoading(true);
    try {
      const secretStore = createSecretStore(db);
      const token = await secretStore.getGitHubToken(new AbortController().signal);
      if (token !== undefined) {
        await pushToGithubFile(linkedGithubFile, token);
        return;
      }
      openGitHubPanel(() => {
        secretStore
          .getGitHubToken(new AbortController().signal)
          .then((resumedToken) => {
            if (resumedToken === undefined) return undefined;
            return pushToGithubFile(linkedGithubFile, resumedToken).then(closeGitHubPanel);
          })
          .catch((error: unknown) => {
            notifications.show({
              color: "red",
              message: `Could not push to the repo file: ${error instanceof Error ? error.message : String(error)}`,
            });
          });
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not push to the repo file: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setSyncLoading(false);
    }
  }

  async function handlePullFromGithubFile(): Promise<void> {
    if (linkedGithubFile === undefined || currentGraph === undefined) return;
    setSyncLoading(true);
    try {
      const controller = new AbortController();
      const secretStore = createSecretStore(db);
      const token = await secretStore.getGitHubToken(controller.signal);
      const revision = await fetchGithubFileRevision(
        linkedGithubFile.owner,
        linkedGithubFile.repo,
        linkedGithubFile.branch,
        linkedGithubFile.path,
        token,
        controller.signal,
      );
      replaceDocument(revision.document);
      const syncedRemote: GithubFileLinkedRemote = {
        ...linkedGithubFile,
        lastSyncedRevision: revision.sha,
        lastSyncedAt: new Date().toISOString(),
      };
      await store.save(
        { ...currentGraph, document: revision.document, linkedRemote: syncedRemote },
        controller.signal,
      );
      const revisionStore = createRevisionStore(db);
      await revisionStore.record(
        {
          id: crypto.randomUUID(),
          graphId: currentGraph.id,
          document: revision.document,
          createdAt: new Date().toISOString(),
          origin: "remote-pull",
        },
        controller.signal,
      );
      notifications.show({ color: "green", message: "Pulled latest from the repo file" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not pull from the repo file: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setSyncLoading(false);
    }
  }

  /**
   * Toggle a linked repo file's commit history — fetched fresh each time it
   * opens rather than cached, so a second push/pull elsewhere doesn't leave a
   * stale list showing. This is what makes the file's history browsable even
   * when the current PAT (or none at all) has no write access to the repo:
   * `listGithubFileHistory` is unauthenticated-capable for a public repo, the
   * same tier as every other read in `@/sharing/github-file`.
   */
  async function handleToggleGithubFileHistory(): Promise<void> {
    if (linkedGithubFile === undefined) return;
    if (fileHistory !== undefined) {
      setFileHistory(undefined);
      return;
    }
    setHistoryLoading(true);
    try {
      const secretStore = createSecretStore(db);
      const token = await secretStore.getGitHubToken(new AbortController().signal);
      const history = await listGithubFileHistory(
        linkedGithubFile.owner,
        linkedGithubFile.repo,
        linkedGithubFile.branch,
        linkedGithubFile.path,
        token,
        new AbortController().signal,
      );
      setFileHistory(history);
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not load repo file history: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setHistoryLoading(false);
    }
  }

  /**
   * Load one historical commit's content into the live document — a preview/
   * restore, not a sync action: it never touches `linkedRemote.lastSyncedRevision`
   * (a subsequent push still checks against the file's actual current sha, via
   * `fetchGithubFileSha`, not whatever old revision was loaded here), mirroring
   * `HistoryDrawer`'s local "Restore" — replace the live document and record
   * the swap, leave persistence to autosave rather than writing to storage
   * immediately.
   */
  async function handleLoadGithubFileHistoryRevision(sha: string): Promise<void> {
    if (linkedGithubFile === undefined || currentGraph === undefined) return;
    setSyncLoading(true);
    try {
      const controller = new AbortController();
      const secretStore = createSecretStore(db);
      const token = await secretStore.getGitHubToken(controller.signal);
      const document = await fetchGithubBlobRevision(
        linkedGithubFile.owner,
        linkedGithubFile.repo,
        sha,
        token,
        controller.signal,
      );
      replaceDocument(document);
      await createRevisionStore(db).record(
        {
          id: crypto.randomUUID(),
          graphId: currentGraph.id,
          document,
          createdAt: new Date().toISOString(),
          origin: "remote-pull",
        },
        controller.signal,
      );
      notifications.show({ color: "green", message: "Loaded historical revision" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not load that revision: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setSyncLoading(false);
    }
  }

  return (
    <Drawer opened={opened} onClose={onClose} title="Graphs" position="right" size="md">
      <Stack gap="md">
        <Group gap="xs">
          <Button variant="default" onClick={() => void handleSave()}>
            Save
          </Button>
          <Button variant="default" onClick={() => void handleSaveAs()}>
            Save as
          </Button>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            onClick={handleExport}
          >
            Export
          </Button>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            onClick={handleExportCanvas}
          >
            Canvas
          </Button>
        </Group>
        <FileInput
          label="Import"
          placeholder="graphle-export.json or .canvas"
          accept="application/json,.json,.canvas"
          leftSection={<IconUpload size={16} />}
          onChange={(file) => {
            if (file !== null) void handleImport(file);
          }}
        />
        <Group gap="xs" align="flex-end">
          <TextInput
            label="Load from URL"
            description="A hosted graphle document or JSON Canvas file (must allow cross-origin requests)"
            placeholder="https://example.com/graph.json"
            style={{ flex: 1 }}
            value={remoteUrl}
            onChange={(event) => setRemoteUrl(event.currentTarget.value)}
          />
          <Button
            variant="default"
            leftSection={<IconWorldDownload size={16} />}
            loading={remoteLoading}
            onClick={() => void handleLoadFromUrl()}
          >
            Load
          </Button>
        </Group>
        {dirty && (
          <Badge color="orange" variant="light" w="fit-content">
            Unsaved changes
          </Badge>
        )}
        {linkedGist !== undefined && (
          <Stack gap="xs">
            <Divider label="Remote sync" labelPosition="center" />
            <Group gap="xs" justify="space-between">
              <Text size="xs" c="dimmed">
                Linked to gist <Text span fw={600}>{linkedGist.filename}</Text> ({linkedGist.syncMode})
              </Text>
              <Group gap="xs">
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconCloudUpload size={14} />}
                  loading={syncLoading}
                  onClick={() => void handlePushToGist()}
                >
                  Push
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconCloudDownload size={14} />}
                  loading={syncLoading}
                  onClick={() => void handlePullFromGist()}
                >
                  Pull
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
        {linkedGithubFile !== undefined && (
          <Stack gap="xs">
            <Divider label="Remote sync" labelPosition="center" />
            <Group gap="xs" justify="space-between">
              <Text size="xs" c="dimmed">
                Linked to{" "}
                <Text span fw={600}>
                  {linkedGithubFile.owner}/{linkedGithubFile.repo}/{linkedGithubFile.path}
                </Text>{" "}
                ({linkedGithubFile.syncMode})
              </Text>
              <Group gap="xs">
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconCloudUpload size={14} />}
                  loading={syncLoading}
                  onClick={() => void handlePushToGithubFile()}
                >
                  Push
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconCloudDownload size={14} />}
                  loading={syncLoading}
                  onClick={() => void handlePullFromGithubFile()}
                >
                  Pull
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconHistory size={14} />}
                  loading={historyLoading}
                  onClick={() => void handleToggleGithubFileHistory()}
                >
                  {fileHistory === undefined ? "History" : "Hide history"}
                </Button>
              </Group>
            </Group>
            {fileHistory !== undefined && (
              <ScrollArea.Autosize mah="30vh" type="scroll">
                <Stack gap={4}>
                  {fileHistory.length === 0 ? (
                    <Text size="xs" c="dimmed">
                      No commit history found for this file.
                    </Text>
                  ) : (
                    fileHistory.map((entry) => (
                      <Group key={entry.sha} justify="space-between" gap="xs" wrap="nowrap">
                        <Stack gap={0} style={{ minWidth: 0 }}>
                          <Text size="xs" truncate>
                            {entry.message}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {new Date(entry.committedAt).toLocaleString()}
                            {entry.authorLogin !== undefined ? ` · ${entry.authorLogin}` : ""}
                          </Text>
                        </Stack>
                        <Button
                          variant="subtle"
                          size="xs"
                          onClick={() => void handleLoadGithubFileHistoryRevision(entry.sha)}
                        >
                          Load
                        </Button>
                      </Group>
                    ))
                  )}
                </Stack>
              </ScrollArea.Autosize>
            )}
          </Stack>
        )}
        <Divider label="Saved graphs" labelPosition="center" />
        <ScrollArea.Autosize mah="60vh" type="scroll">
          <Stack gap="xs">
            {summaries.length === 0 ? (
              <Text size="sm" c="dimmed">
                No saved graphs yet.
              </Text>
            ) : (
              summaries.map((summary) => (
                <Group
                  key={summary.id}
                  className={`${graphRow}${summary.id === graphId ? ` ${selectedGraphRow}` : ""}`}
                  justify="space-between"
                  gap="xs"
                  px="sm"
                  py="xs"
                >
                  <Stack gap={2}>
                    <UnstyledButton
                      fw={600}
                      onClick={() => {
                        void handleLoad(summary.id);
                      }}
                    >
                      {summary.name}
                    </UnstyledButton>
                    <Text size="xs" c="dimmed">
                      {new Date(summary.updatedAt).toLocaleString()}
                    </Text>
                  </Stack>
                  <Group gap={4}>
                    <ActionIcon
                      variant="subtle"
                      aria-label="Rename"
                      onClick={() => {
                        void handleRename(summary.id);
                      }}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Delete"
                      onClick={() => {
                        void handleDelete(summary.id);
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              ))
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    </Drawer>
  );
}
