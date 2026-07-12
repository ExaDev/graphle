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
 *
 * "GitHub filters" is a separate, unrelated section: shown whenever
 * `store.remoteGithubSource` is set (the current document was loaded from a
 * GitHub Project/Issues/PRs URL and hasn't been edited since — see
 * `graph-store.ts`'s doc comment on `RemoteGithubSource`), it lets state/
 * sort/labels (or, for a project, a client-side title search) be edited and
 * re-applied via `handleApplyGithubSource`, which re-issues the load through
 * the same `loadGitHubProject`/`loadGitHubRepoIssues`/
 * `loadGitHubRepoPullRequests` functions the initial load used — keeping the
 * address bar a live GitHub pointer rather than forking into a `#g=`
 * snapshot, since `dirty` stays `false`. This has nothing to do with
 * `linkedRemote`/`StoredGraph` — it works on an unsaved document exactly as
 * well as a saved one, and disappears the moment an actual edit clears
 * `remoteGithubSource`.
 */
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ActionIcon,
  Badge,
  Button,
  Chip,
  Divider,
  Drawer,
  FileInput,
  Group,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  TagsInput,
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
  DEFAULT_REPO_ISSUES_FILTERS,
  DEFAULT_REPO_PULL_REQUESTS_FILTERS,
  GitHubError,
  githubErrorMessage,
  isIssueSortField,
  isIssueState,
  isPullRequestSortField,
  isPullRequestState,
  isSortDirection,
  loadProjectDocument,
  loadRepoIssuesDocument,
  loadRepoPullRequestsDocument,
  parseProjectFilterQuery,
  parseProjectUrl,
  parseRepoIssuesFilters,
  parseRepoIssuesUrl,
  parseRepoPullRequestsFilters,
  parseRepoPullRequestsUrl,
  resolveGithubClient,
  resolveGithubToken,
  type GitHubClient,
  type ParsedProjectUrl,
  type ParsedRepoListUrl,
  type RepoIssuesFilters,
  type RepoPullRequestsFilters,
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
import { importCsv } from "@/sharing/csv";
import { exportCanvasDocument, exportDocument, importDocument, serialiseDocument } from "@/sharing/json";
import { RemoteLoadError } from "@/sharing/remote";
import { writeRemoteUrlToLocation } from "@/sharing/url";
import { type LinkedRemoteSource, type StoredGraphSummary } from "@/schema";
import { db } from "@/storage/db";
import { createGraphStore } from "@/storage/graph-store-dexie";
import { createRevisionStore } from "@/storage/revision-store-dexie";
import { useGraphStore, type RemoteGithubSource } from "@/ui/store/graph-store";

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
  const remoteGithubSource = useGraphStore((state) => state.remoteGithubSource);
  const setRemoteGithubSource = useGraphStore((state) => state.setRemoteGithubSource);

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

  // Editable draft of the current GitHub source's filters, reset whenever
  // `remoteGithubSource` itself changes (a fresh load, an Apply, or an edit
  // clearing it) — same "adjust state during render" pattern as
  // `fileHistoryGraphId` above, rather than an effect.
  const [draftSource, setDraftSource] = useState(remoteGithubSource);
  const [draftSourceOrigin, setDraftSourceOrigin] = useState(remoteGithubSource);
  if (draftSourceOrigin !== remoteGithubSource) {
    setDraftSourceOrigin(remoteGithubSource);
    setDraftSource(remoteGithubSource);
  }
  const [filterApplying, setFilterApplying] = useState(false);

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
   * Imports a `source,target[,label]` adjacency-list CSV via {@link importCsv}
   * and folds the resulting delta into the *current* document with
   * `mergeDelta` — unlike `handleImport` above, this adds to the existing
   * graph rather than replacing it, matching a CSV's role as a batch of new
   * relationships rather than a full document. Reports both counts since a
   * CSV import routinely adds edges between already-existing nodes (e.g. a
   * second CSV reusing labels from a first import currently mid-session), not
   * just newly-created ones — `mergeDelta`'s return value only tracks added
   * node ids, so the edge count is read as the document's edge-count delta
   * across the merge.
   */
  async function handleImportCsv(file: File): Promise<void> {
    try {
      const text = await file.text();
      const delta = importCsv(text);
      const edgeCountBefore = document.edges.length;
      const addedNodeIds = useGraphStore.getState().mergeDelta(delta);
      const addedEdgeCount = useGraphStore.getState().document.edges.length - edgeCountBefore;
      const addedNodeCount = addedNodeIds.length;
      notifications.show({
        color: "green",
        message:
          addedNodeCount === 0 && addedEdgeCount === 0
            ? "Nothing new to add"
            : `Added ${String(addedNodeCount)} node${addedNodeCount === 1 ? "" : "s"}, ${String(addedEdgeCount)} edge${addedEdgeCount === 1 ? "" : "s"}`,
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `CSV import failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /**
   * Load a GitHub Projects URL with an already-authenticated client, applying
   * the result or reporting the failure itself — this is also handed to
   * `openGitHubPanel` as a fire-and-forget pending action (no surrounding
   * try/catch there), so it cannot leave an error unhandled. `searchText` is
   * graphle's own client-side title filter (`project-loader.ts`); also used
   * by the "Remote sync" filter controls below to re-issue this same load
   * with a new search term.
   */
  async function loadGitHubProject(
    parsed: ParsedProjectUrl,
    searchText: string,
    client: GitHubClient,
  ): Promise<void> {
    try {
      const result = await loadProjectDocument(parsed, searchText, client, new AbortController().signal);
      replaceDocument(result.document);
      setGraphId(undefined);
      writeRemoteUrlToLocation(result.canonicalUrl);
      setRemoteGithubSource({ kind: "project", parsed, searchText });
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
   * Load a GitHub repo issues list URL with an already-authenticated client,
   * applying the result or reporting the failure itself — mirrors
   * `loadGitHubProject`, including its use as a fire-and-forget
   * `openGitHubPanel` pending action, and its re-use by the "Remote sync"
   * filter controls below to re-issue this same load with new filters.
   */
  async function loadGitHubRepoIssues(
    parsed: ParsedRepoListUrl,
    filters: RepoIssuesFilters,
    client: GitHubClient,
  ): Promise<void> {
    try {
      const result = await loadRepoIssuesDocument(parsed, filters, client, new AbortController().signal);
      replaceDocument(result.document);
      setGraphId(undefined);
      writeRemoteUrlToLocation(result.canonicalUrl);
      setRemoteGithubSource({ kind: "repoIssues", parsed, filters });
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

  /** Mirrors {@link loadGitHubRepoIssues} for a repo pull-requests list URL. */
  async function loadGitHubRepoPullRequests(
    parsed: ParsedRepoListUrl,
    filters: RepoPullRequestsFilters,
    client: GitHubClient,
  ): Promise<void> {
    try {
      const result = await loadRepoPullRequestsDocument(
        parsed,
        filters,
        client,
        new AbortController().signal,
      );
      replaceDocument(result.document);
      setGraphId(undefined);
      writeRemoteUrlToLocation(result.canonicalUrl);
      setRemoteGithubSource({ kind: "repoPullRequests", parsed, filters });
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

  /** Re-issues `source`'s load with its (possibly just-edited) filters using
   *  an already-authenticated client — dispatches to whichever of
   *  `loadGitHubProject`/`loadGitHubRepoIssues`/`loadGitHubRepoPullRequests`
   *  matches `source.kind`, so this is a "load", not an "edit": it goes
   *  through the same `replaceDocument`/`writeRemoteUrlToLocation`/
   *  `setRemoteGithubSource` path as the initial load, keeping the address
   *  bar a live GitHub pointer. */
  async function applyGithubSourceWith(source: RemoteGithubSource, client: GitHubClient): Promise<void> {
    switch (source.kind) {
      case "project":
        await loadGitHubProject(source.parsed, source.searchText, client);
        return;
      case "repoIssues":
        await loadGitHubRepoIssues(source.parsed, source.filters, client);
        return;
      case "repoPullRequests":
        await loadGitHubRepoPullRequests(source.parsed, source.filters, client);
        return;
    }
  }

  /** Apply the "Remote sync" filter controls' current draft, using a stored
   *  PAT if there is one or prompting for one otherwise — mirrors
   *  `handleLoadFromUrl`'s GitHub branches. */
  async function handleApplyGithubSource(): Promise<void> {
    if (draftSource === undefined) return;
    setFilterApplying(true);
    try {
      const owner = draftSource.kind === "project" ? draftSource.parsed.login : draftSource.parsed.owner;
      const client = await resolveGithubClient(owner, new AbortController().signal);
      if (client !== undefined) {
        await applyGithubSourceWith(draftSource, client);
      } else {
        openGitHubPanel({
          suggestedOwner: owner,
          pendingAction: (resumedClient) => {
            void applyGithubSourceWith(draftSource, resumedClient).then(closeGitHubPanel);
          },
        });
      }
    } finally {
      setFilterApplying(false);
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
    const resolved = await resolveGithubToken(parsed.owner, new AbortController().signal);
    const token = resolved?.token;
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
        openGitHubPanel({
          suggestedOwner: parsed.owner,
          pendingAction: () => {
            resolveGithubToken(parsed.owner, new AbortController().signal)
              .then((resumedResolved) => {
                if (resumedResolved === undefined) return undefined;
                return loadGithubFile(parsed).then(closeGitHubPanel);
              })
              .catch((tokenError: unknown) => {
                notifications.show({
                  color: "red",
                  message: `Could not resolve a GitHub token: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`,
                });
              });
          },
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
        const searchText = parseProjectFilterQuery(trimmed);
        const client = await resolveGithubClient(parsedProject.login, new AbortController().signal);
        if (client !== undefined) {
          await loadGitHubProject(parsedProject, searchText, client);
        } else {
          openGitHubPanel({
            suggestedOwner: parsedProject.login,
            pendingAction: (resumedClient) => {
              void loadGitHubProject(parsedProject, searchText, resumedClient).then(closeGitHubPanel);
            },
          });
        }
        return;
      }

      const parsedRepoIssues = parseRepoIssuesUrl(trimmed);
      const parsedRepoPullRequests =
        parsedRepoIssues === undefined ? parseRepoPullRequestsUrl(trimmed) : undefined;
      if (parsedRepoIssues !== undefined) {
        const filters = parseRepoIssuesFilters(trimmed, DEFAULT_REPO_ISSUES_FILTERS);
        const client = await resolveGithubClient(parsedRepoIssues.owner, new AbortController().signal);
        if (client !== undefined) {
          await loadGitHubRepoIssues(parsedRepoIssues, filters, client);
        } else {
          openGitHubPanel({
            suggestedOwner: parsedRepoIssues.owner,
            pendingAction: (resumedClient) => {
              void loadGitHubRepoIssues(parsedRepoIssues, filters, resumedClient).then(closeGitHubPanel);
            },
          });
        }
        return;
      }
      if (parsedRepoPullRequests !== undefined) {
        const filters = parseRepoPullRequestsFilters(trimmed, DEFAULT_REPO_PULL_REQUESTS_FILTERS);
        const client = await resolveGithubClient(
          parsedRepoPullRequests.owner,
          new AbortController().signal,
        );
        if (client !== undefined) {
          await loadGitHubRepoPullRequests(parsedRepoPullRequests, filters, client);
        } else {
          openGitHubPanel({
            suggestedOwner: parsedRepoPullRequests.owner,
            pendingAction: (resumedClient) => {
              void loadGitHubRepoPullRequests(parsedRepoPullRequests, filters, resumedClient).then(
                closeGitHubPanel,
              );
            },
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
  async function pushToGist(remote: GistLinkedRemote, tokenId: string, token: string): Promise<void> {
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
      lastUsedTokenId: tokenId,
    };
    await store.save({ ...currentGraph, linkedRemote: syncedRemote }, controller.signal);
    notifications.show({ color: "green", message: "Pushed to gist" });
  }

  async function handlePushToGist(): Promise<void> {
    if (linkedGist === undefined) return;
    setSyncLoading(true);
    try {
      const resolved = await resolveGithubToken(
        undefined,
        new AbortController().signal,
        linkedGist.lastUsedTokenId,
      );
      if (resolved !== undefined) {
        await pushToGist(linkedGist, resolved.id, resolved.token);
        return;
      }
      // No token resolves: the panel only ever gives back a GitHubClient,
      // which never exposes its own token (SECURITY, see GitHubPanel.tsx);
      // re-resolve once validation has saved a token, exactly as
      // useGistAutoSync's runPush does for the automatic path.
      openGitHubPanel({
        pendingAction: () => {
          resolveGithubToken(undefined, new AbortController().signal, linkedGist.lastUsedTokenId)
            .then((resumedResolved) => {
              if (resumedResolved === undefined) return undefined;
              return pushToGist(linkedGist, resumedResolved.id, resumedResolved.token).then(
                closeGitHubPanel,
              );
            })
            .catch((error: unknown) => {
              notifications.show({
                color: "red",
                message: `Could not push to gist: ${error instanceof Error ? error.message : String(error)}`,
              });
            });
        },
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
  async function pushToGithubFile(
    remote: GithubFileLinkedRemote,
    tokenId: string,
    token: string,
  ): Promise<void> {
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
      lastUsedTokenId: tokenId,
    };
    await store.save({ ...currentGraph, linkedRemote: syncedRemote }, controller.signal);
    notifications.show({ color: "green", message: "Pushed to repo file" });
  }

  async function handlePushToGithubFile(): Promise<void> {
    if (linkedGithubFile === undefined) return;
    setSyncLoading(true);
    try {
      const resolved = await resolveGithubToken(
        linkedGithubFile.owner,
        new AbortController().signal,
        linkedGithubFile.lastUsedTokenId,
      );
      if (resolved !== undefined) {
        await pushToGithubFile(linkedGithubFile, resolved.id, resolved.token);
        return;
      }
      openGitHubPanel({
        suggestedOwner: linkedGithubFile.owner,
        pendingAction: () => {
          resolveGithubToken(
            linkedGithubFile.owner,
            new AbortController().signal,
            linkedGithubFile.lastUsedTokenId,
          )
            .then((resumedResolved) => {
              if (resumedResolved === undefined) return undefined;
              return pushToGithubFile(linkedGithubFile, resumedResolved.id, resumedResolved.token).then(
                closeGitHubPanel,
              );
            })
            .catch((error: unknown) => {
              notifications.show({
                color: "red",
                message: `Could not push to the repo file: ${error instanceof Error ? error.message : String(error)}`,
              });
            });
        },
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
      const resolved = await resolveGithubToken(linkedGithubFile.owner, controller.signal);
      const revision = await fetchGithubFileRevision(
        linkedGithubFile.owner,
        linkedGithubFile.repo,
        linkedGithubFile.branch,
        linkedGithubFile.path,
        resolved?.token,
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
      const resolved = await resolveGithubToken(linkedGithubFile.owner, new AbortController().signal);
      const history = await listGithubFileHistory(
        linkedGithubFile.owner,
        linkedGithubFile.repo,
        linkedGithubFile.branch,
        linkedGithubFile.path,
        resolved?.token,
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
      const resolved = await resolveGithubToken(linkedGithubFile.owner, controller.signal);
      const document = await fetchGithubBlobRevision(
        linkedGithubFile.owner,
        linkedGithubFile.repo,
        sha,
        resolved?.token,
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
        <FileInput
          label="Import CSV"
          description="A source,target[,label] adjacency list, added to the current graph"
          placeholder="edges.csv"
          accept="text/csv,.csv"
          leftSection={<IconUpload size={16} />}
          onChange={(file) => {
            if (file !== null) void handleImportCsv(file);
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
        {draftSource?.kind === "repoIssues" && (
          <Stack gap="xs">
            <Divider label="GitHub filters" labelPosition="center" />
            <Text size="xs" c="dimmed">
              Loaded from{" "}
              <Text span fw={600}>
                {draftSource.parsed.owner}/{draftSource.parsed.repo}
              </Text>{" "}
              issues
            </Text>
            <Chip.Group
              multiple
              value={[...draftSource.filters.states]}
              onChange={(values) =>
                setDraftSource({
                  ...draftSource,
                  filters: { ...draftSource.filters, states: values.filter(isIssueState) },
                })
              }
            >
              <Group gap="xs">
                <Chip value="open" size="xs">
                  Open
                </Chip>
                <Chip value="closed" size="xs">
                  Closed
                </Chip>
              </Group>
            </Chip.Group>
            <Group gap="xs" align="flex-end">
              <Select
                size="xs"
                label="Sort by"
                data={[
                  { value: "updated", label: "Updated" },
                  { value: "created", label: "Created" },
                  { value: "comments", label: "Comments" },
                ]}
                value={draftSource.filters.sort.field}
                allowDeselect={false}
                onChange={(value) => {
                  if (value !== null && isIssueSortField(value)) {
                    setDraftSource({
                      ...draftSource,
                      filters: { ...draftSource.filters, sort: { ...draftSource.filters.sort, field: value } },
                    });
                  }
                }}
              />
              <SegmentedControl
                size="xs"
                data={[
                  { value: "desc", label: "Newest" },
                  { value: "asc", label: "Oldest" },
                ]}
                value={draftSource.filters.sort.direction}
                onChange={(value) => {
                  if (isSortDirection(value)) {
                    setDraftSource({
                      ...draftSource,
                      filters: {
                        ...draftSource.filters,
                        sort: { ...draftSource.filters.sort, direction: value },
                      },
                    });
                  }
                }}
              />
            </Group>
            <TagsInput
              size="xs"
              label="Labels"
              value={[...draftSource.filters.labels]}
              onChange={(labels) =>
                setDraftSource({ ...draftSource, filters: { ...draftSource.filters, labels } })
              }
            />
            <Button
              variant="default"
              size="xs"
              loading={filterApplying}
              onClick={() => void handleApplyGithubSource()}
            >
              Apply filters
            </Button>
          </Stack>
        )}
        {draftSource?.kind === "repoPullRequests" && (
          <Stack gap="xs">
            <Divider label="GitHub filters" labelPosition="center" />
            <Text size="xs" c="dimmed">
              Loaded from{" "}
              <Text span fw={600}>
                {draftSource.parsed.owner}/{draftSource.parsed.repo}
              </Text>{" "}
              pull requests
            </Text>
            <Chip.Group
              multiple
              value={[...draftSource.filters.states]}
              onChange={(values) =>
                setDraftSource({
                  ...draftSource,
                  filters: { ...draftSource.filters, states: values.filter(isPullRequestState) },
                })
              }
            >
              <Group gap="xs">
                <Chip value="open" size="xs">
                  Open
                </Chip>
                <Chip value="closed" size="xs">
                  Closed
                </Chip>
                <Chip value="merged" size="xs">
                  Merged
                </Chip>
              </Group>
            </Chip.Group>
            <Group gap="xs" align="flex-end">
              <Select
                size="xs"
                label="Sort by"
                data={[
                  { value: "updated", label: "Updated" },
                  { value: "created", label: "Created" },
                ]}
                value={draftSource.filters.sort.field}
                allowDeselect={false}
                onChange={(value) => {
                  if (value !== null && isPullRequestSortField(value)) {
                    setDraftSource({
                      ...draftSource,
                      filters: { ...draftSource.filters, sort: { ...draftSource.filters.sort, field: value } },
                    });
                  }
                }}
              />
              <SegmentedControl
                size="xs"
                data={[
                  { value: "desc", label: "Newest" },
                  { value: "asc", label: "Oldest" },
                ]}
                value={draftSource.filters.sort.direction}
                onChange={(value) => {
                  if (isSortDirection(value)) {
                    setDraftSource({
                      ...draftSource,
                      filters: {
                        ...draftSource.filters,
                        sort: { ...draftSource.filters.sort, direction: value },
                      },
                    });
                  }
                }}
              />
            </Group>
            <TagsInput
              size="xs"
              label="Labels"
              value={[...draftSource.filters.labels]}
              onChange={(labels) =>
                setDraftSource({ ...draftSource, filters: { ...draftSource.filters, labels } })
              }
            />
            <Button
              variant="default"
              size="xs"
              loading={filterApplying}
              onClick={() => void handleApplyGithubSource()}
            >
              Apply filters
            </Button>
          </Stack>
        )}
        {draftSource?.kind === "project" && (
          <Stack gap="xs">
            <Divider label="GitHub filter" labelPosition="center" />
            <Text size="xs" c="dimmed">
              Loaded from{" "}
              <Text span fw={600}>
                {draftSource.parsed.login}
              </Text>{" "}
              project #{draftSource.parsed.number}
            </Text>
            <TextInput
              size="xs"
              label="Filter items (matches title)"
              value={draftSource.searchText}
              onChange={(event) =>
                setDraftSource({ ...draftSource, searchText: event.currentTarget.value })
              }
            />
            <Button
              variant="default"
              size="xs"
              loading={filterApplying}
              onClick={() => void handleApplyGithubSource()}
            >
              Apply filter
            </Button>
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
