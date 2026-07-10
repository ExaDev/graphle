import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION } from "../schema";

import {
  fetchGistRevision,
  listGistFiles,
  listGistHistory,
  parseAmbiguousGistUrl,
  pushGistFile,
  resolveRemoteUrl,
} from "./gist";
import { RemoteLoadError } from "./remote";

const GIST_ID = "7c802f7d943c56d72b26373d66037136";

function jsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Extract a plain URL string from a fetch `input`, whatever form it took. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const graphA = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Graph A",
  types: [],
  edgeTypes: [],
  nodes: [{ id: "n1", type: "freeform", position: { x: 0, y: 0 }, data: { label: "A" } }],
  edges: [],
};
const graphB = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Graph B",
  types: [],
  edgeTypes: [],
  nodes: [{ id: "n1", type: "freeform", position: { x: 0, y: 0 }, data: { label: "B" } }],
  edges: [],
};

/**
 * A gist API listing response with the given files' content inlined. Carries
 * an empty `history` by default since {@link GistApiResponseSchema} requires
 * the field; pass `history` explicitly for tests that inspect it.
 */
function gistApiResponse(
  files: Record<string, { content: string; truncated?: boolean }>,
  history: ReturnType<typeof gistHistoryEntry>[] = [],
) {
  return {
    id: GIST_ID,
    history,
    files: Object.fromEntries(
      Object.entries(files).map(([filename, { content, truncated }]) => [
        filename,
        {
          filename,
          raw_url: `https://gist.githubusercontent.com/user/${GIST_ID}/raw/abc123/${filename}`,
          truncated: truncated ?? false,
          content,
        },
      ]),
    ),
  };
}

/** One realistic entry for a gist API response's `history` array. */
function gistHistoryEntry(version: string, login: string, additions: number, deletions: number) {
  return {
    version,
    committed_at: "2026-07-01T12:00:00Z",
    change_status: { additions, deletions },
    url: `${GIST_API_ENDPOINT}/${GIST_ID}/${version}`,
    user: { login },
  };
}

const GIST_API_ENDPOINT = "https://api.github.com/gists";

describe("parseAmbiguousGistUrl", () => {
  it("matches a gist page URL with a username", () => {
    expect(parseAmbiguousGistUrl(`https://gist.github.com/Mearman/${GIST_ID}`)).toBe(GIST_ID);
  });

  it("matches a gist page URL without a username", () => {
    expect(parseAmbiguousGistUrl(`https://gist.github.com/${GIST_ID}`)).toBe(GIST_ID);
  });

  it("matches the filename-less raw prefix, with or without a trailing slash", () => {
    expect(
      parseAmbiguousGistUrl(`https://gist.githubusercontent.com/Mearman/${GIST_ID}/raw`),
    ).toBe(GIST_ID);
    expect(
      parseAmbiguousGistUrl(`https://gist.githubusercontent.com/Mearman/${GIST_ID}/raw/`),
    ).toBe(GIST_ID);
  });

  it("does not match a raw URL that already names a specific file", () => {
    expect(
      parseAmbiguousGistUrl(
        `https://gist.githubusercontent.com/Mearman/${GIST_ID}/raw/abc123/graph.json`,
      ),
    ).toBeUndefined();
  });

  it("does not match an unrelated URL", () => {
    expect(parseAmbiguousGistUrl("https://example.com/graph.json")).toBeUndefined();
    expect(parseAmbiguousGistUrl("https://github.com/orgs/Acme/projects/1")).toBeUndefined();
  });
});

describe("listGistFiles", () => {
  it("classifies each file: valid graph JSON gets a document, everything else gets an error", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(
        jsonResponse(
          gistApiResponse({
            "graph-a.json": { content: JSON.stringify(graphA) },
            "notes.md": { content: "# Notes\nnot json" },
          }),
        ),
      );
    const files = await listGistFiles(GIST_ID, new AbortController().signal, fetchStub);
    expect(files).toHaveLength(2);
    const graphFile = files.find((f) => f.filename === "graph-a.json");
    const notesFile = files.find((f) => f.filename === "notes.md");
    expect(graphFile?.document?.name).toBe("Graph A");
    expect(graphFile?.error).toBeUndefined();
    expect(notesFile?.document).toBeUndefined();
    expect(notesFile?.error).toBeDefined();
  });

  it("re-fetches raw_url for a truncated file's full content", async () => {
    let rawFetched = false;
    const fetchStub: typeof globalThis.fetch = (input) => {
      const url = requestUrl(input);
      if (url.endsWith("/gists/" + GIST_ID)) {
        return Promise.resolve(
          jsonResponse(
            gistApiResponse({ "big.json": { content: '{"version": 3', truncated: true } }),
          ),
        );
      }
      rawFetched = true;
      return Promise.resolve(new Response(JSON.stringify(graphA)));
    };
    const files = await listGistFiles(GIST_ID, new AbortController().signal, fetchStub);
    expect(rawFetched).toBe(true);
    expect(files[0]?.document?.name).toBe("Graph A");
  });

  it("throws RemoteLoadError with kind network on a fetch rejection", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.reject(new Error("boom"));
    await expect(
      listGistFiles(GIST_ID, new AbortController().signal, fetchStub),
    ).rejects.toThrow(RemoteLoadError);
  });

  it("throws RemoteLoadError with kind httpError on a non-2xx response", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse({}, 404));
    try {
      await listGistFiles(GIST_ID, new AbortController().signal, fetchStub);
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind).toEqual({ type: "httpError", status: 404 });
      }
    }
  });

  it("throws RemoteLoadError with kind invalidGistResponse when the body doesn't match the API shape", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse({ foo: "bar" }));
    try {
      await listGistFiles(GIST_ID, new AbortController().signal, fetchStub);
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind.type).toBe("invalidGistResponse");
      }
    }
  });
});

describe("resolveRemoteUrl", () => {
  it("loads a fully-qualified single-file URL straight through, unchanged", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse(graphA));
    const result = await resolveRemoteUrl(
      "https://example.com/graph.json",
      new AbortController().signal,
      fetchStub,
    );
    expect(result.kind).toBe("loaded");
    if (result.kind === "loaded") {
      expect(result.document.name).toBe("Graph A");
      expect(result.resolvedUrl).toBe("https://example.com/graph.json");
    }
  });

  it("auto-resolves an ambiguous gist URL when exactly one file is a valid graph", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(
        jsonResponse(
          gistApiResponse({
            "graph-a.json": { content: JSON.stringify(graphA) },
            "notes.md": { content: "not json" },
          }),
        ),
      );
    const result = await resolveRemoteUrl(
      `https://gist.github.com/user/${GIST_ID}`,
      new AbortController().signal,
      fetchStub,
    );
    expect(result.kind).toBe("loaded");
    if (result.kind === "loaded") {
      expect(result.document.name).toBe("Graph A");
      expect(result.resolvedUrl).toContain("graph-a.json");
    }
  });

  it("reports ambiguousGist when more than one file is a valid graph", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(
        jsonResponse(
          gistApiResponse({
            "graph-a.json": { content: JSON.stringify(graphA) },
            "graph-b.json": { content: JSON.stringify(graphB) },
          }),
        ),
      );
    const result = await resolveRemoteUrl(
      `https://gist.githubusercontent.com/user/${GIST_ID}/raw`,
      new AbortController().signal,
      fetchStub,
    );
    expect(result.kind).toBe("ambiguousGist");
    if (result.kind === "ambiguousGist") {
      expect(result.gistId).toBe(GIST_ID);
      expect(result.candidates.map((c) => c.filename).sort()).toEqual([
        "graph-a.json",
        "graph-b.json",
      ]);
    }
  });

  it("throws RemoteLoadError with kind noGistGraphFiles when nothing in the gist is a valid graph", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(
        jsonResponse(gistApiResponse({ "notes.md": { content: "not json" } })),
      );
    try {
      await resolveRemoteUrl(
        `https://gist.github.com/${GIST_ID}`,
        new AbortController().signal,
        fetchStub,
      );
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind).toEqual({ type: "noGistGraphFiles", filenames: ["notes.md"] });
      }
    }
  });
});

describe("listGistHistory", () => {
  it("parses a realistic history array, newest first", async () => {
    const history = [
      gistHistoryEntry("sha-2", "Mearman", 3, 1),
      gistHistoryEntry("sha-1", "Mearman", 5, 0),
    ];
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(
        jsonResponse(gistApiResponse({ "graph.json": { content: JSON.stringify(graphA) } }, history)),
      );
    const result = await listGistHistory(GIST_ID, new AbortController().signal, fetchStub);
    expect(result).toEqual(history);
  });
});

describe("fetchGistRevision", () => {
  it("fetches and decodes a specific sha's content", async () => {
    let requestedUrl = "";
    const fetchStub: typeof globalThis.fetch = (input) => {
      requestedUrl = requestUrl(input);
      return Promise.resolve(
        jsonResponse({
          id: GIST_ID,
          files: { "graph.json": { filename: "graph.json", raw_url: "unused", truncated: false, content: JSON.stringify(graphB) } },
        }),
      );
    };
    const document = await fetchGistRevision(
      GIST_ID,
      "sha-1",
      "graph.json",
      new AbortController().signal,
      fetchStub,
    );
    expect(document.name).toBe("Graph B");
    expect(requestedUrl).toBe(`${GIST_API_ENDPOINT}/${GIST_ID}/sha-1`);
  });

  it("throws RemoteLoadError with kind gistFileNotFound when the filename is absent from that revision", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(
        jsonResponse({
          id: GIST_ID,
          files: { "other.json": { filename: "other.json", raw_url: "unused", truncated: false, content: "{}" } },
        }),
      );
    try {
      await fetchGistRevision(
        GIST_ID,
        "sha-1",
        "graph.json",
        new AbortController().signal,
        fetchStub,
      );
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind).toEqual({ type: "gistFileNotFound", filename: "graph.json" });
      }
    }
  });
});

describe("pushGistFile", () => {
  it("sends the correct PATCH request and returns the new sha", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchStub: typeof globalThis.fetch = (input, init) => {
      capturedUrl = requestUrl(input);
      capturedInit = init;
      return Promise.resolve(
        jsonResponse(
          gistApiResponse(
            { "graph.json": { content: JSON.stringify(graphA) } },
            [gistHistoryEntry("sha-new", "Mearman", 1, 0)],
          ),
        ),
      );
    };
    const sha = await pushGistFile(
      GIST_ID,
      "graph.json",
      JSON.stringify(graphA),
      "test-token",
      new AbortController().signal,
      fetchStub,
    );
    expect(sha).toBe("sha-new");
    expect(capturedUrl).toBe(`${GIST_API_ENDPOINT}/${GIST_ID}`);
    expect(capturedInit?.method).toBe("PATCH");
    expect(new Headers(capturedInit?.headers).get("Authorization")).toBe("Bearer test-token");
    expect(capturedInit?.body).toBe(
      JSON.stringify({ files: { "graph.json": { content: JSON.stringify(graphA) } } }),
    );
  });

  it("throws a classified RemoteLoadError on a 403", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse({}, 403));
    try {
      await pushGistFile(
        GIST_ID,
        "graph.json",
        JSON.stringify(graphA),
        "test-token",
        new AbortController().signal,
        fetchStub,
      );
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind).toEqual({ type: "forbidden" });
      }
    }
  });
});
