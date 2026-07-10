import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION } from "../schema";

import {
  listGistFiles,
  parseAmbiguousGistUrl,
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

/** A gist API listing response with the given files' content inlined. */
function gistApiResponse(files: Record<string, { content: string; truncated?: boolean }>) {
  return {
    id: GIST_ID,
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
