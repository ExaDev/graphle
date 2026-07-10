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
  type GraphDelta,
  type GraphOperation,
} from "@/domain";
import type { GitHubClient } from "@/github";
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
  /** Apply a domain operation, producing a new document and marking it dirty. */
  apply: (op: GraphOperation) => void;
  /**
   * Fold a batch of nodes and edges (e.g. from a GitHub expansion) into the
   * document via {@link applyDelta}, marking it dirty. Returns the ids of the
   * delta nodes that were actually added (freeform nodes and first occurrences
   * of keyed entities) so callers can report "Added N nodes".
   */
  mergeDelta: (delta: GraphDelta) => string[];
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
  /** Update the ephemeral canvas selection. */
  setSelection: (selection: GraphSelection) => void;
  /** Set the storage id backing the current document. */
  setGraphId: (id: string | undefined) => void;
  /** Mark the current document as saved (dirty = false). */
  markSaved: () => void;
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
  /** Open the GitHub panel, optionally with a pending action to run once a
   *  PAT is validated. Omit the argument for plain browsing. */
  openGitHubPanel: (pendingAction?: (client: GitHubClient) => void) => void;
  /** Close the GitHub panel. Always clears `pendingGitHubAction` too, so
   *  cancelling without validating can never leave a stale callback to fire
   *  on some later, unrelated validation. */
  closeGitHubPanel: () => void;
}

export const useGraphStore = create<GraphState>()(
  // subscribeWithSelector enables the `subscribe(selector, listener)` overload
  // used by useUrlSync to watch the document slice without re-rendering.
  subscribeWithSelector((set, get) => ({
    document: emptyDocument("Untitled graph"),
    graphId: undefined,
    dirty: false,
    selection: { nodeId: undefined, edgeId: undefined },
    apply: (op) =>
      set((state) => ({
        document: applyOperation(state.document, op),
        dirty: true,
      })),
    mergeDelta: (delta) => {
      // Read-then-set: applyDelta is pure and returns the merged document plus
      // the ids actually added. Computing against `get().document` before
      // `set` keeps the action free of the `set` callback's inability to
      // return a value to the caller.
      const result = applyDelta(get().document, delta);
      set({ document: result.document, dirty: true });
      return result.addedNodeIds;
    },
    replaceDocument: (doc) => set({ document: doc, dirty: false }),
    addType: (typeDef) =>
      set((state) => ({
        document: { ...state.document, types: [...state.document.types, typeDef] },
        dirty: true,
      })),
    removeType: (name) => {
      // Read-then-set: the guard must read the current document before the
      // write. Removing a type that nodes still reference would leave those
      // nodes against an unresolvable type, so fail loudly rather than orphan.
      const doc = get().document;
      if (doc.nodes.some((node) => node.type === name)) {
        throw new Error(
          `Cannot remove type "${name}": one or more nodes still use it`,
        );
      }
      set({
        document: { ...doc, types: doc.types.filter((type) => type.name !== name) },
        dirty: true,
      });
    },
    addEdgeType: (typeDef) =>
      set((state) => ({
        document: {
          ...state.document,
          edgeTypes: [...state.document.edgeTypes, typeDef],
        },
        dirty: true,
      })),
    removeEdgeType: (name) => {
      const doc = get().document;
      if (doc.edges.some((edge) => edge.type === name)) {
        throw new Error(
          `Cannot remove edge type "${name}": one or more edges still use it`,
        );
      }
      set({
        document: {
          ...doc,
          edgeTypes: doc.edgeTypes.filter((type) => type.name !== name),
        },
        dirty: true,
      });
    },
    setSelection: (selection) => set({ selection }),
    setGraphId: (graphId) => set({ graphId }),
    markSaved: () => set({ dirty: false }),
    gistPicker: undefined,
    setGistPicker: (gistPicker) => set({ gistPicker }),
    githubPanelOpened: false,
    pendingGitHubAction: undefined,
    openGitHubPanel: (pendingAction) =>
      set({ githubPanelOpened: true, pendingGitHubAction: pendingAction }),
    closeGitHubPanel: () => set({ githubPanelOpened: false, pendingGitHubAction: undefined }),
  })),
);

/** Select just the document; re-renders only when the document reference changes. */
export const useDocument = (): GraphDocument => useGraphStore((s) => s.document);

/** Select just the ephemeral canvas selection. */
export const useSelection = (): GraphSelection =>
  useGraphStore((s) => s.selection);
