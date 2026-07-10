/**
 * Autosaves the current document to IndexedDB once it is dirty and backed by
 * a previously-saved graph. A document with no `graphId` has never been
 * explicitly saved (the user's first Save/Save as in `GraphsDrawer` creates
 * the row and sets `graphId`); autosave has nowhere to write until then, so
 * it stays inert.
 *
 * On each debounced fire:
 *
 * 1. Persist the live document into the existing StoredGraph row (via
 *    `GraphStore.save`), then `markSaved()`. This always happens while dirty
 *    and saved, independent of whether the content actually changed since
 *    the last revision.
 * 2. Separately, append a `GraphRevision` (via `RevisionStore.record`) only
 *    if the document differs from the most recently recorded revision for
 *    this graph. This decouples "persist current state" (every debounced
 *    fire) from "append a history entry" (only on real content change), so
 *    autosaving the same content repeatedly does not spam the history list.
 *
 * If the backing row has been deleted elsewhere (e.g. another tab), the
 * cycle is skipped rather than silently creating a new graph — autosave has
 * no UI to prompt for a name the way Save as does.
 */
import { useEffect } from "react";

import type { GraphRevision } from "@/schema";
import { db } from "@/storage/db";
import { createGraphStore } from "@/storage/graph-store-dexie";
import { createRevisionStore } from "@/storage/revision-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

/** Debounce window before a dirty, saved document is autosaved. */
const AUTOSAVE_DEBOUNCE_MS = 1000;

export function useAutosave(): void {
  useEffect(() => {
    const graphStore = createGraphStore(db);
    const revisionStore = createRevisionStore(db);
    const controller = new AbortController();
    let saveTimer: ReturnType<typeof setTimeout> | undefined;

    async function persist(graphId: string): Promise<void> {
      const existing = await graphStore.get(graphId, controller.signal);
      if (existing === undefined) return;

      const document = useGraphStore.getState().document;
      await graphStore.save(
        { ...existing, document, updatedAt: new Date().toISOString() },
        controller.signal,
      );
      useGraphStore.getState().markSaved();

      const history = await revisionStore.list(graphId, controller.signal);
      const latest = history[0];
      const unchanged =
        latest !== undefined && JSON.stringify(latest.document) === JSON.stringify(document);
      if (unchanged) return;

      const revision: GraphRevision = {
        id: crypto.randomUUID(),
        graphId,
        document,
        createdAt: new Date().toISOString(),
        origin: "local",
      };
      await revisionStore.record(revision, controller.signal);
    }

    const unsubscribe = useGraphStore.subscribe(
      (state) => state.document,
      () => {
        const { dirty, graphId } = useGraphStore.getState();
        if (!dirty || graphId === undefined) return;
        if (saveTimer !== undefined) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const currentGraphId = useGraphStore.getState().graphId;
          if (currentGraphId === undefined) return;
          persist(currentGraphId).catch((error: unknown) => {
            if (controller.signal.aborted) return;
            throw error;
          });
        }, AUTOSAVE_DEBOUNCE_MS);
      },
    );

    return () => {
      unsubscribe();
      controller.abort();
      if (saveTimer !== undefined) clearTimeout(saveTimer);
    };
  }, []);
}
