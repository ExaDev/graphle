/**
 * Ephemeral UI store for the graph editor. A thin zustand wrapper around the
 * pure domain reducer ({@link applyOperation}): every action funnels through
 * `apply`, so the document only ever changes via the single, validated domain
 * path.
 *
 * The document is the persistent, shareable state (it is what the URL codec
 * serialises). `selection` and `graphId` are EPHEMERAL: they belong to the
 * current editing session only and must never enter the document or the URL.
 */
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import {
  applyDelta,
  applyOperation,
  emptyDocument,
  pushHistory,
  type GraphDelta,
  type GraphOperation,
} from "@/domain";
import type {
  GitHubClient,
  ParsedProjectUrl,
  ParsedRepoListUrl,
  RateLimit,
  RepoIssuesFilters,
  RepoPullRequestsFilters,
} from "@/github";
import type { GistFileCandidate } from "@/sharing/gist";
import type { EdgeTypeDefinition, GraphDocument, NodeTypeDefinition } from "@/schema";

/** The node or edge currently selected on the canvas, if any. */
export interface GraphSelection {
  nodeId: string | undefined;
  edgeId: string | undefined;
}

/**
 * An ambiguous gist's graph-file candidates, awaiting a pick from {@link
 * GistPickerModal}. Ephemeral, like `selection` — set by whichever entry
 * point (page-load `#url=`, the Graphs drawer's "Load from URL") called
 * `resolveRemoteUrl` and got back more than one candidate.
 */
export interface GistPicker {
  candidates: GistFileCandidate[];
}

/**
 * A detected divergence between the local document and its linked gist's
 * remote HEAD, set by `useGistAutoSync` when a push or a conflict check finds
 * the remote has moved since the graph's last recorded sync. Ephemeral, like
 * `gistPicker` — a later phase's conflict-resolution UI consumes and clears
 * it; this store only carries the fact that a conflict exists.
 */
export interface SyncConflict {
  graphId: string;
  localDocument: GraphDocument;
  remoteSha: string;
}

/**
 * What the current document was last loaded from, if it was a GitHub
 * Project/repo-issues/repo-pull-requests URL and hasn't been edited since —
 * ephemeral, like `selection`/`graphId`, never persisted or written to the
 * URL's `#g=` payload. Lets the "Remote sync" filter controls in
 * `GraphsDrawer` re-issue the same load with new filter values through
 * `replaceDocument`/`writeRemoteUrlToLocation`, the same path the initial
 * load used — which is what keeps the address bar a live GitHub pointer
 * rather than forking into an inline share snapshot. Cleared unconditionally
 * by every document-mutating commit (`commitDocument`, `undo`, `redo`): an
 * actual edit — including an Expand-menu click — always severs the link.
 */
export type RemoteGithubSource =
  | { kind: "project"; parsed: ParsedProjectUrl; searchText: string }
  | { kind: "repoIssues"; parsed: ParsedRepoListUrl; filters: RepoIssuesFilters }
  | { kind: "repoPullRequests"; parsed: ParsedRepoListUrl; filters: RepoPullRequestsFilters };

interface GraphState {
  /** The live document; the single source of truth for graph contents. */
  document: GraphDocument;
  /** Storage id when the document is backed by IndexedDB; `undefined` for an
   *  unsaved or share-only document. */
  graphId: string | undefined;
  /** True when the document has unsaved edits. Reset by `markSaved` and by
   *  loading a fresh document via `replaceDocument`. */
  dirty: boolean;
  /** Ephemeral canvas selection — never persisted. */
  selection: GraphSelection;
  /**
   * Every currently multi-selected node id (React Flow's own marquee/shift
   * -click selection, which already worked before this field existed —
   * `GraphCanvas`'s `onSelectionChange` previously read only the first
   * selected node into `selection.nodeId` and discarded the rest). Distinct
   * from `selection`, which the inspector uses for single-item editing:
   * `selectedNodeIds` exists for bulk actions (`ContextMenu`'s "Group N
   * nodes"), and can hold 0, 1, or many ids independently of `selection`.
   * Ephemeral — never persisted.
   */
  selectedNodeIds: string[];
  /**
   * Undo history: document snapshots taken immediately before each
   * document-mutating action, oldest first, capped by `pushHistory` (see
   * `MAX_UNDO_DEPTH` in `@/domain`). Session-only — never persisted to
   * storage, the URL, or an export, and lost on reload. A separate, persisted
   * revision-history mechanism (`storage/revision-store-dexie.ts`) covers
   * durable checkpoints; this stack exists purely for in-session Ctrl+Z.
   */
  undoStack: GraphDocument[];
  /**
   * Redo history: documents popped off `undoStack` by `undo`, most recently
   * undone last. Cleared by every fresh document-mutating action so redoing
   * can never resurrect a branch abandoned by a subsequent edit. Session-only,
   * same as `undoStack`.
   */
  redoStack: GraphDocument[];
  /**
   * The document reference as of the last `markSaved` call, or `undefined`
   * before any save has happened. `undo`/`redo` compare the restored document
   * against this by reference to decide whether `dirty` should be `false` —
   * landing back on the exact saved snapshot means there is nothing unsaved,
   * even though the document has been mutated and reverted since.
   */
  savedDocument: GraphDocument | undefined;
  /** Apply a domain operation, producing a new document and marking it dirty. */
  apply: (op: GraphOperation) => void;
  /**
   * Fold a batch of nodes and edges (e.g. from a GitHub expansion) into the
   * document via {@link applyDelta}, marking it dirty. Returns the ids of the
   * delta nodes that were actually added (freeform nodes and first occurrences
   * of keyed entities) so callers can report "Added N nodes".
   *
   * `onExistingMatch` (default `"keep"`, per {@link applyDelta}) governs a
   * delta node that dedupes against an existing node: `"keep"` for a normal
   * expansion that must not clobber a user's manual edits, `"overwrite"` for
   * an explicit refresh action that should reflect the current fetched state.
   */
  mergeDelta: (delta: GraphDelta, onExistingMatch?: "keep" | "overwrite") => string[];
  /** Replace the document wholesale (URL/storage load) and clear dirty. */
  replaceDocument: (doc: GraphDocument) => void;
  /**
   * Add a node-type definition to the document's `types` (used by the type
   * editor to register a user-defined type). Marks the document dirty so the
   * new type is persisted.
   */
  addType: (typeDef: NodeTypeDefinition) => void;
  /**
   * Remove a node-type definition by name. Throws if any node still references
   * the type, so a removal can never orphan nodes against an unresolvable type.
   */
  removeType: (name: string) => void;
  /**
   * Merge a partial update into an existing node-type definition by name.
   * `name` itself is excluded from `patch` at the type level — renaming a
   * type isn't supported here because `name` is the identity nodes reference
   * (`node.type === name`); changing it in place would silently orphan every
   * node currently pointing at the old name. Throws if the type doesn't
   * exist, since this should only ever be called against a type the UI knows
   * is present. Deliberately does not re-validate existing nodes against a
   * changed `jsonSchema`: node data is only ever checked against its type
   * schema at the point of write (node creation, or `updateNodeData` in the
   * domain reducer), never continuously or on load, so an edit here cannot
   * retroactively corrupt already-persisted node data.
   */
  updateType: (name: string, patch: Partial<Omit<NodeTypeDefinition, "name">>) => void;
  /**
   * Add an edge-type definition to the document's `edgeTypes` (used by the
   * edge-type editor to register a user-defined type). Marks the document
   * dirty so the new type is persisted.
   */
  addEdgeType: (typeDef: EdgeTypeDefinition) => void;
  /**
   * Remove an edge-type definition by name. Throws if any edge still
   * references the type, so a removal can never orphan edges against an
   * unresolvable type.
   */
  removeEdgeType: (name: string) => void;
  /**
   * Merge a partial update into an existing edge-type definition by name.
   * Mirrors `updateType`: `name` is excluded from `patch` for the same
   * reason (it's the identity `edge.type` references), and existing edges'
   * data is deliberately left unvalidated against a changed `jsonSchema` for
   * the same reason — edge data is only checked at write time
   * (`updateEdge` in the domain reducer), never on load.
   */
  updateEdgeType: (
    name: string,
    patch: Partial<Omit<EdgeTypeDefinition, "name">>,
  ) => void;
  /** Update the ephemeral canvas selection. */
  setSelection: (selection: GraphSelection) => void;
  /** Replace the full multi-selected node id list — see {@link selectedNodeIds}. */
  setSelectedNodeIds: (ids: string[]) => void;
  /** Set the storage id backing the current document. */
  setGraphId: (id: string | undefined) => void;
  /**
   * Mark the current document as saved: clears `dirty` and records the
   * current document reference as `savedDocument`, so a later `undo`/`redo`
   * that lands back on this exact snapshot can recognise it as saved again.
   */
  markSaved: () => void;
  /**
   * Step the document back to the previous entry on `undoStack`, pushing the
   * current document onto `redoStack` so the step can be replayed. A no-op
   * when `undoStack` is empty — there is nothing before the current document
   * to step back to.
   */
  undo: () => void;
  /**
   * The mirror of `undo`: step the document forward to the most recently
   * undone entry on `redoStack`, pushing the current document back onto
   * `undoStack`. A no-op when `redoStack` is empty.
   */
  redo: () => void;
  /** Ambiguous-gist candidates awaiting a pick, or `undefined` when no picker
   *  is pending. Ephemeral — never persisted. */
  gistPicker: GistPicker | undefined;
  /** Open or close the gist picker. */
  setGistPicker: (picker: GistPicker | undefined) => void;
  /** Whether the GitHub PAT-entry/browse drawer is open. Lives in the store
   *  (rather than local component state) so a non-component caller — the
   *  page-mount `useUrlSync` hook, which has no JSX of its own — can open it
   *  without prop drilling, the same reason `gistPicker` lives here. */
  githubPanelOpened: boolean;
  /**
   * A one-shot callback to run with the freshly authenticated {@link
   * GitHubClient} once the user validates a PAT, or `undefined` when the
   * panel was opened for plain browsing. The callback owns its own async
   * work, error handling, and notifications — `GitHubPanel` only ever calls
   * it once and clears it; it never inspects what the callback does, so the
   * panel stays a general auth+browse drawer rather than coupling to any one
   * caller's use case (e.g. resuming a pending GitHub Projects URL load).
   */
  pendingGitHubAction: ((client: GitHubClient) => void) | undefined;
  /** The owner (org login or user login) the caller that opened the panel
   *  was resolving a token for, or `undefined` when the panel was opened
   *  for plain browsing. Lets `GitHubPanel` default its "acting as"
   *  selector to a token already scoped to that owner, or jump straight to
   *  the Add-token form with the owner pre-filled when none resolves. */
  suggestedGithubOwner: string | undefined;
  /** Open the GitHub panel, optionally with a pending action to run once a
   *  token is selected/validated, and/or the owner the caller was
   *  resolving a token for. Omit both for plain browsing. */
  openGitHubPanel: (options?: {
    pendingAction?: (client: GitHubClient) => void;
    suggestedOwner?: string;
  }) => void;
  /** Close the GitHub panel. Always clears `pendingGitHubAction` and
   *  `suggestedGithubOwner` too, so cancelling without validating can never
   *  leave a stale callback or hint to apply to some later, unrelated
   *  validation. */
  closeGitHubPanel: () => void;
  /** A detected local/remote gist divergence awaiting resolution, or
   *  `undefined` when none is pending. Ephemeral — never persisted. */
  syncConflict: SyncConflict | undefined;
  /** Set or clear the pending sync conflict. */
  setSyncConflict: (conflict: SyncConflict | undefined) => void;
  /** What the current document was last loaded from, if a GitHub URL and
   *  unedited since — see {@link RemoteGithubSource}. */
  remoteGithubSource: RemoteGithubSource | undefined;
  /** Set or clear the current GitHub source. Callers set it explicitly right
   *  after their own `replaceDocument` + `writeRemoteUrlToLocation` pair —
   *  every document-mutating commit already clears it unconditionally, so
   *  only a successful GitHub load ever needs to set it. */
  setRemoteGithubSource: (source: RemoteGithubSource | undefined) => void;
  /** The most recent GitHub client's rate-limit budget, or `undefined` before
   *  any GitHub call has completed. Ephemeral, like `selection` — never
   *  persisted or written to the URL/document. */
  rateLimit: RateLimit | undefined;
  /** Set or clear the current rate-limit reading. */
  setRateLimit: (rateLimit: RateLimit | undefined) => void;
}

export const useGraphStore = create<GraphState>()(
  // subscribeWithSelector enables the `subscribe(selector, listener)` overload
  // used by useUrlSync to watch the document slice without re-rendering.
  subscribeWithSelector((set, get) => {
    /**
     * The single path by which any of the document-mutating actions commits
     * a new document. Before the swap, it snapshots the CURRENT
     * (pre-mutation) document onto `undoStack` — capped by `pushHistory` —
     * and clears `redoStack`, since a fresh edit invalidates whatever branch
     * a pending redo would have replayed.
     */
    const commitDocument = (nextDocument: GraphDocument, dirty: boolean): void => {
      const state = get();
      set({
        document: nextDocument,
        dirty,
        undoStack: pushHistory(state.undoStack, state.document),
        redoStack: [],
        remoteGithubSource: undefined,
      });
    };

    return {
      document: emptyDocument("Untitled graph"),
      graphId: undefined,
      dirty: false,
      selection: { nodeId: undefined, edgeId: undefined },
      selectedNodeIds: [],
      undoStack: [],
      redoStack: [],
      savedDocument: undefined,
      apply: (op) => commitDocument(applyOperation(get().document, op), true),
      mergeDelta: (delta, onExistingMatch) => {
        // Read-then-commit: applyDelta is pure and returns the merged document
        // plus the ids actually added. Computing against `get().document`
        // first keeps the action free of `set`'s inability to return a value
        // to the caller.
        const result = applyDelta(get().document, delta, onExistingMatch);
        commitDocument(result.document, true);
        return result.addedNodeIds;
      },
      replaceDocument: (doc) => commitDocument(doc, false),
      addType: (typeDef) => {
        const doc = get().document;
        commitDocument({ ...doc, types: [...doc.types, typeDef] }, true);
      },
      removeType: (name) => {
        // Read-then-commit: the guard must read the current document before
        // the write. Removing a type that nodes still reference would leave
        // those nodes against an unresolvable type, so fail loudly rather
        // than orphan.
        const doc = get().document;
        if (doc.nodes.some((node) => node.type === name)) {
          throw new Error(
            `Cannot remove type "${name}": one or more nodes still use it`,
          );
        }
        commitDocument(
          { ...doc, types: doc.types.filter((type) => type.name !== name) },
          true,
        );
      },
      updateType: (name, patch) => {
        const doc = get().document;
        const existing = doc.types.find((type) => type.name === name);
        if (existing === undefined) {
          throw new Error(`Cannot update type "${name}": no such type exists`);
        }
        commitDocument(
          {
            ...doc,
            types: doc.types.map((type) =>
              type.name === name ? { ...existing, ...patch } : type,
            ),
          },
          true,
        );
      },
      addEdgeType: (typeDef) => {
        const doc = get().document;
        commitDocument({ ...doc, edgeTypes: [...doc.edgeTypes, typeDef] }, true);
      },
      removeEdgeType: (name) => {
        const doc = get().document;
        if (doc.edges.some((edge) => edge.type === name)) {
          throw new Error(
            `Cannot remove edge type "${name}": one or more edges still use it`,
          );
        }
        commitDocument(
          { ...doc, edgeTypes: doc.edgeTypes.filter((type) => type.name !== name) },
          true,
        );
      },
      updateEdgeType: (name, patch) => {
        const doc = get().document;
        const existing = doc.edgeTypes.find((type) => type.name === name);
        if (existing === undefined) {
          throw new Error(`Cannot update edge type "${name}": no such type exists`);
        }
        commitDocument(
          {
            ...doc,
            edgeTypes: doc.edgeTypes.map((type) =>
              type.name === name ? { ...existing, ...patch } : type,
            ),
          },
          true,
        );
      },
      setSelection: (selection) => set({ selection }),
      setSelectedNodeIds: (selectedNodeIds) => set({ selectedNodeIds }),
      setGraphId: (graphId) => set({ graphId }),
      markSaved: () =>
        set((state) => ({ dirty: false, savedDocument: state.document })),
      undo: () => {
        const state = get();
        const previous = state.undoStack.at(-1);
        if (previous === undefined) {
          return;
        }
        set({
          document: previous,
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, state.document],
          dirty: previous !== state.savedDocument,
          remoteGithubSource: undefined,
        });
      },
      redo: () => {
        const state = get();
        const next = state.redoStack.at(-1);
        if (next === undefined) {
          return;
        }
        set({
          document: next,
          redoStack: state.redoStack.slice(0, -1),
          undoStack: [...state.undoStack, state.document],
          dirty: next !== state.savedDocument,
          remoteGithubSource: undefined,
        });
      },
      gistPicker: undefined,
      setGistPicker: (gistPicker) => set({ gistPicker }),
      githubPanelOpened: false,
      pendingGitHubAction: undefined,
      suggestedGithubOwner: undefined,
      openGitHubPanel: (options) =>
        set({
          githubPanelOpened: true,
          pendingGitHubAction: options?.pendingAction,
          suggestedGithubOwner: options?.suggestedOwner,
        }),
      closeGitHubPanel: () =>
        set({
          githubPanelOpened: false,
          pendingGitHubAction: undefined,
          suggestedGithubOwner: undefined,
        }),
      syncConflict: undefined,
      setSyncConflict: (syncConflict) => set({ syncConflict }),
      remoteGithubSource: undefined,
      setRemoteGithubSource: (remoteGithubSource) => set({ remoteGithubSource }),
      rateLimit: undefined,
      setRateLimit: (rateLimit) => set({ rateLimit }),
    };
  }),
);

/** Select just the document; re-renders only when the document reference changes. */
export const useDocument = (): GraphDocument => useGraphStore((s) => s.document);

/** Select just the ephemeral canvas selection. */
export const useSelection = (): GraphSelection =>
  useGraphStore((s) => s.selection);
