import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyDocument } from "@/domain";
import { GRAPH_DOCUMENT_VERSION, type GraphDocument } from "@/schema";
import { db } from "@/storage/db";
import { createGraphStore } from "@/storage/graph-store-dexie";
import { createRevisionStore } from "@/storage/revision-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

import { useAutosave } from "./useAutosave";

/** Debounce window used by the hook under test; kept in step with the
 *  constant in useAutosave.ts so the test does not hardcode a second copy
 *  that could silently drift. */
const AUTOSAVE_DEBOUNCE_MS = 1000;

// React 19's `act` warns unless the environment declares itself act-aware.
// There is no test-runner integration (e.g. React Testing Library) doing
// this for us, so it is set directly; @types/react has no ambient
// declaration for this global, hence the local augmentation.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Mounts a component that calls useAutosave() and returns a handle to tear
 *  the render down. There is no React Testing Library in this project's
 *  toolchain, so the hook is exercised through a minimal real React root. */
function mountAutosave(): { unmount: () => void } {
  const container = document.createElement("div");
  let root: Root | undefined;
  function TestComponent(): null {
    useAutosave();
    return null;
  }
  act(() => {
    root = createRoot(container);
    root.render(createElement(TestComponent));
  });
  return {
    unmount: () => {
      act(() => {
        root?.unmount();
      });
    },
  };
}

/**
 * Advances virtual time past the debounce window, then drains every timer
 * still pending. `persist()` chains several Dexie/fake-indexeddb calls, each
 * of which schedules its own internal `setTimeout(fn, 0)` (fake-indexeddb has
 * no `scheduler.postTask` under jsdom) once the previous one resolves — a
 * single `advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)` reaches the target
 * duration before those later, chained 0ms timers get scheduled, so it never
 * fires them. `runAllTimersAsync` drains that trailing chain. It must only
 * run once the debounce has already elapsed — called any earlier, it would
 * fast-forward through a still-pending debounce timer that a test is
 * deliberately holding short of firing. */
async function settleDebounce(): Promise<void> {
  await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
  await vi.runAllTimersAsync();
}

function testDocument(name: string): GraphDocument {
  return {
    version: GRAPH_DOCUMENT_VERSION,
    name,
    types: [],
    edgeTypes: [],
    nodes: [],
    edges: [],
  };
}

/** Seeds a StoredGraph row directly (real timers, ahead of the fake-timer
 *  window each test opens once it starts driving the debounce) so the
 *  hook's `graphStore.get(graphId)` finds an existing row to update. */
async function seedGraph(graphId: string): Promise<void> {
  const graphStore = createGraphStore(db);
  await graphStore.save(
    {
      id: graphId,
      name: "Test graph",
      document: testDocument("Test graph"),
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    new AbortController().signal,
  );
}

describe("useAutosave", () => {
  let unmount: (() => void) | undefined;

  beforeEach(async () => {
    await Promise.all([db.graphs.clear(), db.revisions.clear()]);
    useGraphStore.setState({ document: emptyDocument("Untitled graph"), graphId: undefined });
    useGraphStore.getState().markSaved();
  });

  afterEach(() => {
    unmount?.();
    unmount = undefined;
    // fake-indexeddb schedules its internal event dispatch via a bare
    // setTimeout(fn, 0) (there is no `scheduler.postTask` in jsdom), so fake
    // timers are enabled only for the window each test actually drives the
    // debounce in, never around the real-timer IDB setup calls, and are
    // torn down again here regardless of whether a given test enabled them.
    vi.useRealTimers();
    // db.graphs/db.revisions are a shared singleton across every test in
    // this file: without restoring, a later test's vi.spyOn call reuses the
    // still-installed spy from an earlier test, inheriting its call history.
    vi.restoreAllMocks();
  });

  it("saves and records a revision once the debounce settles, for a dirty document with a graphId", async () => {
    const graphId = crypto.randomUUID();
    await seedGraph(graphId);
    const graphStore = createGraphStore(db);
    const putSpy = vi.spyOn(db.graphs, "put");
    const recordSpy = vi.spyOn(db.revisions, "put");

    ({ unmount } = mountAutosave());
    useGraphStore.getState().setGraphId(graphId);

    vi.useFakeTimers();
    useGraphStore.setState({ document: testDocument("Edited graph"), dirty: true });
    await settleDebounce();

    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(useGraphStore.getState().dirty).toBe(false);

    vi.useRealTimers();
    const saved = await graphStore.get(graphId, new AbortController().signal);
    expect(saved?.document.name).toBe("Edited graph");

    const revisionStore = createRevisionStore(db);
    const history = await revisionStore.list(graphId, new AbortController().signal);
    expect(history).toHaveLength(1);
    expect(history[0]?.document.name).toBe("Edited graph");
    expect(history[0]?.origin).toBe("local");
  });

  it("does nothing while dirty but graphId is undefined", async () => {
    const putSpy = vi.spyOn(db.graphs, "put");
    const recordSpy = vi.spyOn(db.revisions, "put");

    ({ unmount } = mountAutosave());

    vi.useFakeTimers();
    useGraphStore.setState({ document: testDocument("Edited graph"), dirty: true });
    await settleDebounce();

    expect(putSpy).not.toHaveBeenCalled();
    expect(recordSpy).not.toHaveBeenCalled();
    expect(useGraphStore.getState().dirty).toBe(true);
  });

  it("collapses rapid successive changes into a single save and record after the debounce settles", async () => {
    const graphId = crypto.randomUUID();
    await seedGraph(graphId);
    const graphStore = createGraphStore(db);
    const putSpy = vi.spyOn(db.graphs, "put");
    const recordSpy = vi.spyOn(db.revisions, "put");

    ({ unmount } = mountAutosave());
    useGraphStore.getState().setGraphId(graphId);

    vi.useFakeTimers();
    useGraphStore.setState({ document: testDocument("Edit one"), dirty: true });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS / 2);
    useGraphStore.setState({ document: testDocument("Edit two"), dirty: true });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS / 2);
    useGraphStore.setState({ document: testDocument("Edit three"), dirty: true });
    await settleDebounce();

    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    const saved = await graphStore.get(graphId, new AbortController().signal);
    expect(saved?.document.name).toBe("Edit three");
  });

  it("saves on every debounced fire but records a revision only when the content actually changed", async () => {
    const graphId = crypto.randomUUID();
    await seedGraph(graphId);
    const putSpy = vi.spyOn(db.graphs, "put");
    const recordSpy = vi.spyOn(db.revisions, "put");

    ({ unmount } = mountAutosave());
    useGraphStore.getState().setGraphId(graphId);

    vi.useFakeTimers();

    // First edit settles: saved and recorded (no prior revision to match).
    useGraphStore.setState({ document: testDocument("Same content"), dirty: true });
    await settleDebounce();
    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledTimes(1);

    // Second edit round-trips back to the same document content: markSaved
    // makes the store clean after the first cycle, so mutate it again to
    // re-dirty before the next debounced cycle, producing identical
    // resulting content to what was just recorded.
    useGraphStore.setState({ document: testDocument("Different content"), dirty: true });
    useGraphStore.setState({ document: testDocument("Same content"), dirty: true });
    await settleDebounce();

    expect(putSpy).toHaveBeenCalledTimes(2);
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });
});
