import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredGithubToken, StoredTypeLibrary } from "@/schema";
import { db } from "@/storage/db";
import { createGithubTokenStore } from "@/storage/github-token-store-dexie";
import { createTypeLibraryStore } from "@/storage/type-library-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";
import { useTypeLibraryStore } from "@/ui/store/type-library-store";

import { useTypeLibraryAutoSync } from "./useTypeLibraryAutoSync";

const GIST_API_ENDPOINT = "https://api.github.com/gists";
const GIST_ID = "gist-under-test";
const FILENAME = "type-library.json";

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

/** A gist API listing/history response naming the given revisions, newest first. */
function gistApiResponse(historyVersions: string[]): unknown {
  return {
    id: GIST_ID,
    files: {
      [FILENAME]: {
        filename: FILENAME,
        raw_url: `https://gist.githubusercontent.com/user/${GIST_ID}/raw/${FILENAME}`,
        truncated: false,
        content: "{}",
      },
    },
    history: historyVersions.map((version) => ({
      version,
      committed_at: "2026-07-01T12:00:00Z",
      change_status: { additions: 1, deletions: 0 },
      url: `${GIST_API_ENDPOINT}/${GIST_ID}/${version}`,
      user: { login: "octocat" },
    })),
  };
}

function jsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeStoredTypeLibrary(
  overrides: Partial<StoredTypeLibrary> = {},
): StoredTypeLibrary {
  return {
    id: "library",
    document: { version: 1, nodeTypes: [], edgeTypes: [] },
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
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

/** Resets every store field this hook (or a test) touches, mirroring
 *  `useGistAutoSync.unit.test.ts`'s `resetStore` — both stores are
 *  process-wide singletons, so leftover state from one test would otherwise
 *  leak into the next. */
function resetStores(): void {
  useGraphStore.setState({
    githubPanelOpened: false,
    pendingGitHubAction: undefined,
    suggestedGithubOwner: undefined,
  });
  useTypeLibraryStore.setState({ syncConflict: undefined });
}

/** Renders a component that does nothing but mount the hook, so its effect
 *  (mount-time sync, visibilitychange listener, cleanup) runs against a
 *  real React lifecycle. */
function TestHarness(): null {
  useTypeLibraryAutoSync();
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

describe("useTypeLibraryAutoSync", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

  beforeEach(async () => {
    await Promise.all([db.typeLibrary.clear(), db.githubTokens.clear()]);
    resetStores();

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

  it("pushes and advances lastSyncedRevision when the remote HEAD matches the last sync", async () => {
    const stored = makeStoredTypeLibrary({
      linkedRemote: {
        provider: "gist",
        gistId: GIST_ID,
        filename: FILENAME,
        syncMode: "automatic",
        lastSyncedRevision: "sha-1",
      },
    });
    await createTypeLibraryStore(db).save(stored, freshSignal());
    await createGithubTokenStore(db).save(makeToken(), freshSignal());

    // The pre-flight read and the PATCH both hit the same endpoint; only the
    // PATCH response carries the new sha the push should record.
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(jsonResponse(gistApiResponse(["sha-2", "sha-1"])));
      }
      expect(requestUrl(input)).toBe(`${GIST_API_ENDPOINT}/${GIST_ID}`);
      return Promise.resolve(jsonResponse(gistApiResponse(["sha-1"])));
    });

    mount();
    await waitMs(200); // let the mount-time sync run to completion

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patchCalls).toHaveLength(1);

    const saved = await createTypeLibraryStore(db).get(freshSignal());
    expect(saved?.linkedRemote?.lastSyncedRevision).toBe("sha-2");
    expect(saved?.linkedRemote?.lastSyncedAt).toBeDefined();
    expect(useTypeLibraryStore.getState().syncConflict).toBeUndefined();
  });

  it("skips the push and sets syncConflict when the remote HEAD moved since the last sync", async () => {
    const stored = makeStoredTypeLibrary({
      linkedRemote: {
        provider: "gist",
        gistId: GIST_ID,
        filename: FILENAME,
        syncMode: "automatic",
        lastSyncedRevision: "sha-1",
      },
    });
    await createTypeLibraryStore(db).save(stored, freshSignal());
    await createGithubTokenStore(db).save(makeToken(), freshSignal());

    fetchMock.mockImplementation((input, init) => {
      expect(init?.method).not.toBe("PATCH");
      expect(requestUrl(input)).toBe(`${GIST_API_ENDPOINT}/${GIST_ID}`);
      return Promise.resolve(jsonResponse(gistApiResponse(["sha-remote-moved"])));
    });

    mount();
    await waitMs(200);

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patchCalls).toHaveLength(0);

    const saved = await createTypeLibraryStore(db).get(freshSignal());
    expect(saved?.linkedRemote?.lastSyncedRevision).toBe("sha-1");

    expect(useTypeLibraryStore.getState().syncConflict).toEqual({
      localDocument: stored.document,
      remoteSha: "sha-remote-moved",
    });
  });

  it.each(["manual", "off"] as const)(
    "is a complete no-op when syncMode is %s",
    async (syncMode) => {
      const stored = makeStoredTypeLibrary({
        linkedRemote: {
          provider: "gist",
          gistId: GIST_ID,
          filename: FILENAME,
          syncMode,
          lastSyncedRevision: "sha-1",
        },
      });
      await createTypeLibraryStore(db).save(stored, freshSignal());
      await createGithubTokenStore(db).save(makeToken(), freshSignal());

      fetchMock.mockImplementation(() =>
        Promise.resolve(jsonResponse(gistApiResponse(["sha-remote-moved"]))),
      );

      mount();
      await waitMs(200);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(useTypeLibraryStore.getState().syncConflict).toBeUndefined();
      expect(useGraphStore.getState().githubPanelOpened).toBe(false);
    },
  );

  it("escalates via openGitHubPanel instead of fetching when no PAT is stored", async () => {
    const stored = makeStoredTypeLibrary({
      linkedRemote: {
        provider: "gist",
        gistId: GIST_ID,
        filename: FILENAME,
        syncMode: "automatic",
        lastSyncedRevision: "sha-1",
      },
    });
    await createTypeLibraryStore(db).save(stored, freshSignal());
    // Deliberately no stored PAT.

    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(gistApiResponse(["sha-1"]))),
    );

    mount();
    await waitMs(200);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useGraphStore.getState().githubPanelOpened).toBe(true);
    expect(useGraphStore.getState().pendingGitHubAction).toBeDefined();
    expect(useTypeLibraryStore.getState().syncConflict).toBeUndefined();
  });
});
