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

import { applyOperation, emptyDocument, type GraphOperation } from "@/domain";
import type { GraphDocument } from "@/schema";

/** The node or edge currently selected on the canvas, if any. */
export interface GraphSelection {
  nodeId: string | undefined;
  edgeId: string | undefined;
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
  /** Replace the document wholesale (URL/storage load) and clear dirty. */
  replaceDocument: (doc: GraphDocument) => void;
  /** Update the ephemeral canvas selection. */
  setSelection: (selection: GraphSelection) => void;
  /** Set the storage id backing the current document. */
  setGraphId: (id: string | undefined) => void;
  /** Mark the current document as saved (dirty = false). */
  markSaved: () => void;
}

export const useGraphStore = create<GraphState>()(
  // subscribeWithSelector enables the `subscribe(selector, listener)` overload
  // used by useUrlSync to watch the document slice without re-rendering.
  subscribeWithSelector((set) => ({
    document: emptyDocument("Untitled graph"),
    graphId: undefined,
    dirty: false,
    selection: { nodeId: undefined, edgeId: undefined },
    apply: (op) =>
      set((state) => ({
        document: applyOperation(state.document, op),
        dirty: true,
      })),
    replaceDocument: (doc) => set({ document: doc, dirty: false }),
    setSelection: (selection) => set({ selection }),
    setGraphId: (graphId) => set({ graphId }),
    markSaved: () => set({ dirty: false }),
  })),
);

/** Select just the document; re-renders only when the document reference changes. */
export const useDocument = (): GraphDocument => useGraphStore((s) => s.document);

/** Select just the ephemeral canvas selection. */
export const useSelection = (): GraphSelection =>
  useGraphStore((s) => s.selection);
