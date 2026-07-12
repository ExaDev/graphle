import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyDocument, type GraphOperation } from "@/domain";
import { GraphNodeSchema, type StoredGithubToken, type StoredGraph } from "@/schema";
import { db } from "@/storage/db";
import { createGithubTokenStore } from "@/storage/github-token-store-dexie";
import { createGraphStore } from "@/storage/graph-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

import { useGithubFileAutoSync } from "./useGithubFileAutoSync";

const OWNER = "exadev";
const REPO = "graphle";
const BRANCH = "main";
const PATH = "graphs/demo.json";
const CONTENTS_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
const PUT_URL_PREFIX = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;

/** A fresh, never-aborted signal for setup calls that should run to completion. */
function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

/** Extract a plain URL string from a fetch `input`, whatever form it took. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/** A Contents API response at the given blob sha, carrying `{}` as content. */
function contentsResponse(sha: string): unknown {
  return { sha, content: encodeBase64("{}"), encoding: "base64" };
}

function jsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeStoredGraph(overrides: Partial<StoredGraph> = {}): StoredGraph {
  const now = "2026-01-01T00:00:00Z";
  return {
    id: crypto.randomUUID(),
    name: "Test graph",
    document: emptyDocument("Test graph"),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function addNodeOp(label: string): GraphOperation {
  return {
    type: "addNode",
    node: GraphNodeSchema.parse({
      id: crypto.randomUUID(),
      type: "freeform",
      position: { x: 0, y: 0 },
      data: { label },
    }),
  };
}

function makeToken(overrides: Partial<StoredGithubToken> = {}): StoredGithubToken {
  return {
    id: crypto.randomUUID(),
    label: "Test token",
    tokenType: "classic",
    token: "test-token",
    scope: { kind: "any" },
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Resets every store field this hook (or a test) touches, mirroring the
 *  full initial state `create<GraphState>()` seeds — the store is a
 *  process-wide singleton, so leftover state from one test would otherwise
 *  leak into the next. */
function resetStore(): void {
  useGraphStore.setState({
    document: emptyDocument("Untitled graph"),
    graphId: undefined,
    dirty: false,
    selection: { nodeId: undefined, edgeId: undefined },
    undoStack: [],
    redoStack: [],
    savedDocument: undefined,
    gistPicker: undefined,
    githubPanelOpened: false,
    pendingGitHubAction: undefined,
    suggestedGithubOwner: undefined,
    syncConflict: undefined,
  });
}

/** Renders a component that does nothing but mount the hook, so its effect
 *  (subscription, listeners, cleanup) runs against a real React lifecycle. */
function TestHarness(): null {
  useGithubFileAutoSync();
  return null;
}

async function waitMs(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** The fetch signature stubbed for every test: injectable enough to record
 *  calls with a concrete argument type, so `.mock.calls` needs no cast to
 *  filter by request method. */
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("useGithubFileAutoSync", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

  beforeEach(async () => {
    await Promise.all([db.graphs.clear(), db.githubTokens.clear(), db.revisions.clear()]);
    resetStore();

    fetchMock = vi.fn<FetchFn>();
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  function mount(): void {
    root = createRoot(container);
    act(() => {
      root.render(createElement(TestHarness));
    });
  }

  it("pushes and advances lastSyncedRevision when the remote blob sha matches the last sync", async () => {
    const stored = makeStoredGraph({
      linkedRemote: {
        provider: "githubFile",
        owner: OWNER,
        repo: REPO,
        branch: BRANCH,
        path: PATH,
        syncMode: "automatic",
        lastSyncedRevision: "sha-1",
      },
    });
    await createGraphStore(db).save(stored, freshSignal());
    await createGithubTokenStore(db).save(makeToken(), freshSignal());

    // Every GET (the mount-time conflict check and the push's own pre-flight
    // check) sees the same, still-matching sha; only the PUT response
    // carries the new sha the push should record.
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === "PUT") {
        return Promise.resolve(jsonResponse({ content: { sha: "sha-2" } }));
      }
      expect(requestUrl(input)).toBe(`${CONTENTS_URL}?ref=${BRANCH}`);
      return Promise.resolve(jsonResponse(contentsResponse("sha-1")));
    });

    useGraphStore.getState().replaceDocument(stored.document);
    useGraphStore.getState().setGraphId(stored.id);
    useGraphStore.getState().markSaved();

    mount();
    await waitMs(50); // let the mount-time conflict check settle first

    act(() => {
      useGraphStore.getState().apply(addNodeOp("new node"));
    });
    await waitMs(500); // past the 300ms push debounce plus the async push chain

    const putCalls = fetchMock.mock.calls.filter(
      ([input, init]) => init?.method === "PUT" && requestUrl(input).startsWith(PUT_URL_PREFIX),
    );
    expect(putCalls).toHaveLength(1);

    const saved = await createGraphStore(db).get(stored.id, freshSignal());
    expect(saved?.linkedRemote?.lastSyncedRevision).toBe("sha-2");
    expect(saved?.linkedRemote?.lastSyncedAt).toBeDefined();
    expect(useGraphStore.getState().syncConflict).toBeUndefined();
  });

  it("skips the push and sets syncConflict when the remote blob sha moved since the last sync", async () => {
    const stored = makeStoredGraph({
      linkedRemote: {
        provider: "githubFile",
        owner: OWNER,
        repo: REPO,
        branch: BRANCH,
        path: PATH,
        syncMode: "automatic",
        lastSyncedRevision: "sha-1",
      },
    });
    await createGraphStore(db).save(stored, freshSignal());
    await createGithubTokenStore(db).save(makeToken(), freshSignal());

    // Starts matching so the mount-time conflict check passes cleanly; the
    // remote is nudged forward only once the push's own pre-flight check runs.
    let remoteSha = "sha-1";
    fetchMock.mockImplementation((input, init) => {
      expect(init?.method).not.toBe("PUT");
      expect(requestUrl(input)).toBe(`${CONTENTS_URL}?ref=${BRANCH}`);
      return Promise.resolve(jsonResponse(contentsResponse(remoteSha)));
    });

    useGraphStore.getState().replaceDocument(stored.document);
    useGraphStore.getState().setGraphId(stored.id);
    useGraphStore.getState().markSaved();

    mount();
    await waitMs(50);

    remoteSha = "sha-remote-moved";
    act(() => {
      useGraphStore.getState().apply(addNodeOp("new node"));
    });
    await waitMs(500);

    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(putCalls).toHaveLength(0);

    const saved = await createGraphStore(db).get(stored.id, freshSignal());
    expect(saved?.linkedRemote?.lastSyncedRevision).toBe("sha-1");

    expect(useGraphStore.getState().syncConflict).toEqual({
      graphId: stored.id,
      localDocument: useGraphStore.getState().document,
      remoteSha: "sha-remote-moved",
    });
  });

  it.each(["manual", "off"] as const)(
    "is a complete no-op when syncMode is %s",
    async (syncMode) => {
      const stored = makeStoredGraph({
        linkedRemote: {
          provider: "githubFile",
          owner: OWNER,
          repo: REPO,
          branch: BRANCH,
          path: PATH,
          syncMode,
          lastSyncedRevision: "sha-1",
        },
      });
      await createGraphStore(db).save(stored, freshSignal());
      await createGithubTokenStore(db).save(makeToken(), freshSignal());

      fetchMock.mockImplementation(() =>
        Promise.resolve(jsonResponse(contentsResponse("sha-remote-moved"))),
      );

      useGraphStore.getState().replaceDocument(stored.document);
      useGraphStore.getState().setGraphId(stored.id);
      useGraphStore.getState().markSaved();

      mount();
      await waitMs(50);

      act(() => {
        useGraphStore.getState().apply(addNodeOp("new node"));
      });
      await waitMs(500);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(useGraphStore.getState().syncConflict).toBeUndefined();
    },
  );

  it("sets syncConflict from a visibilitychange conflict check that finds drift", async () => {
    const stored = makeStoredGraph({
      linkedRemote: {
        provider: "githubFile",
        owner: OWNER,
        repo: REPO,
        branch: BRANCH,
        path: PATH,
        syncMode: "automatic",
        lastSyncedRevision: "sha-1",
      },
    });
    await createGraphStore(db).save(stored, freshSignal());
    await createGithubTokenStore(db).save(makeToken(), freshSignal());

    let remoteSha = "sha-1";
    fetchMock.mockImplementation((input, init) => {
      expect(init?.method).not.toBe("PUT");
      expect(requestUrl(input)).toBe(`${CONTENTS_URL}?ref=${BRANCH}`);
      return Promise.resolve(jsonResponse(contentsResponse(remoteSha)));
    });

    useGraphStore.getState().replaceDocument(stored.document);
    useGraphStore.getState().setGraphId(stored.id);
    useGraphStore.getState().markSaved();

    mount();
    await waitMs(50);
    // The mount-time check found a match; no edit ever happened, so the
    // document stays clean and only the visibility trigger is under test.
    expect(useGraphStore.getState().syncConflict).toBeUndefined();
    expect(useGraphStore.getState().dirty).toBe(false);

    remoteSha = "sha-drifted";
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitMs(100);

    expect(useGraphStore.getState().syncConflict).toEqual({
      graphId: stored.id,
      localDocument: useGraphStore.getState().document,
      remoteSha: "sha-drifted",
    });

    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(putCalls).toHaveLength(0);
  });
});
