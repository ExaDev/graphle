import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION } from "../schema";

import {
  fetchGithubBlobRevision,
  fetchGithubFileRevision,
  fetchGithubFileSha,
  listGithubFileHistory,
  pushGithubFileContent,
} from "./github-file";
import { RemoteLoadError } from "./remote";

const OWNER = "exadev";
const REPO = "graphle";
const BRANCH = "main";
const PATH = "graphs/demo.json";
const SHA = "abc123def456";

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

const graphUnicode = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Gráph Ünïcode 🎉",
  types: [],
  edgeTypes: [],
  nodes: [
    {
      id: "n1",
      type: "freeform",
      position: { x: 0, y: 0 },
      data: { label: "Café — 日本語 🚀" },
    },
  ],
  edges: [],
};

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function contentsResponse(document: unknown, sha: string) {
  return {
    sha,
    content: encodeBase64(JSON.stringify(document)),
    encoding: "base64",
  };
}

/** Parse a fetch `init.body` as JSON, or `undefined` when it isn't a string
 *  (this test suite only ever sends `JSON.stringify`d string bodies). */
function parseJsonBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
}

describe("fetchGithubFileRevision", () => {
  it("decodes a repo file's current content and sha", async () => {
    const fetchStub: typeof globalThis.fetch = (input) => {
      const url = requestUrl(input);
      expect(url).toBe(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}?ref=${BRANCH}`,
      );
      return Promise.resolve(jsonResponse(contentsResponse(graphA, SHA)));
    };
    const revision = await fetchGithubFileRevision(
      OWNER,
      REPO,
      BRANCH,
      PATH,
      undefined,
      new AbortController().signal,
      fetchStub,
    );
    expect(revision.document.name).toBe("Graph A");
    expect(revision.sha).toBe(SHA);
  });

  it("encodes each path segment and preserves internal slashes", async () => {
    const url = requestUrl(
      new Request(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${["graphs", "demo one.json"]
          .map(encodeURIComponent)
          .join("/")}?ref=${BRANCH}`,
      ),
    );
    const fetchStub: typeof globalThis.fetch = (input) => {
      expect(requestUrl(input)).toBe(url);
      return Promise.resolve(jsonResponse(contentsResponse(graphA, SHA)));
    };
    const revision = await fetchGithubFileRevision(
      OWNER,
      REPO,
      BRANCH,
      "graphs/demo one.json",
      undefined,
      new AbortController().signal,
      fetchStub,
    );
    expect(revision.document.name).toBe("Graph A");
  });

  it("sends an Authorization header when a token is supplied", async () => {
    let sawAuth: string | null = null;
    const fetchStub: typeof globalThis.fetch = (_input, init) => {
      sawAuth =
        init?.headers !== undefined ? new Headers(init.headers).get("Authorization") : null;
      return Promise.resolve(jsonResponse(contentsResponse(graphA, SHA)));
    };
    await fetchGithubFileRevision(
      OWNER,
      REPO,
      BRANCH,
      PATH,
      "my-token",
      new AbortController().signal,
      fetchStub,
    );
    expect(sawAuth).toBe("Bearer my-token");
  });

  it("throws RemoteLoadError with kind network on a fetch rejection", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.reject(new Error("boom"));
    await expect(
      fetchGithubFileRevision(
        OWNER,
        REPO,
        BRANCH,
        PATH,
        undefined,
        new AbortController().signal,
        fetchStub,
      ),
    ).rejects.toThrow(RemoteLoadError);
  });

  it("throws RemoteLoadError with kind notFound on a 404", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse({}, 404));
    try {
      await fetchGithubFileRevision(
        OWNER,
        REPO,
        BRANCH,
        PATH,
        undefined,
        new AbortController().signal,
        fetchStub,
      );
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind).toEqual({ type: "notFound" });
      }
    }
  });

  it("decodes multi-byte UTF-8 content correctly (not mojibake)", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(jsonResponse(contentsResponse(graphUnicode, SHA)));
    const revision = await fetchGithubFileRevision(
      OWNER,
      REPO,
      BRANCH,
      PATH,
      undefined,
      new AbortController().signal,
      fetchStub,
    );
    expect(revision.document.name).toBe("Gráph Ünïcode 🎉");
    expect(revision.document.nodes[0]?.data).toMatchObject({ label: "Café — 日本語 🚀" });
  });

  it("throws RemoteLoadError with kind invalidGithubFileResponse when the body doesn't match the API shape", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(jsonResponse({ foo: "bar" }));
    try {
      await fetchGithubFileRevision(
        OWNER,
        REPO,
        BRANCH,
        PATH,
        undefined,
        new AbortController().signal,
        fetchStub,
      );
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind.type).toBe("invalidGithubFileResponse");
      }
    }
  });
});

describe("fetchGithubFileSha", () => {
  it("returns just the blob sha", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(jsonResponse(contentsResponse(graphA, SHA)));
    const sha = await fetchGithubFileSha(
      OWNER,
      REPO,
      BRANCH,
      PATH,
      undefined,
      new AbortController().signal,
      fetchStub,
    );
    expect(sha).toBe(SHA);
  });
});

describe("fetchGithubBlobRevision", () => {
  it("fetches by blob sha via the git Blob API, not the Contents API", async () => {
    const fetchStub: typeof globalThis.fetch = (input) => {
      const url = requestUrl(input);
      expect(url).toBe(`https://api.github.com/repos/${OWNER}/${REPO}/git/blobs/${SHA}`);
      return Promise.resolve(jsonResponse(contentsResponse(graphA, SHA)));
    };
    const document = await fetchGithubBlobRevision(
      OWNER,
      REPO,
      SHA,
      undefined,
      new AbortController().signal,
      fetchStub,
    );
    expect(document.name).toBe("Graph A");
  });
});

describe("pushGithubFileContent", () => {
  it("PUTs base64 content with the given sha and returns the new sha", async () => {
    const NEW_SHA = "newsha789";
    let sawBody: unknown;
    let sawMethod: string | undefined;
    const fetchStub: typeof globalThis.fetch = (_input, init) => {
      sawMethod = init?.method;
      sawBody = parseJsonBody(init);
      return Promise.resolve(jsonResponse({ content: { sha: NEW_SHA } }));
    };
    const newSha = await pushGithubFileContent(
      OWNER,
      REPO,
      BRANCH,
      PATH,
      JSON.stringify(graphA),
      SHA,
      "my-token",
      new AbortController().signal,
      fetchStub,
    );
    expect(newSha).toBe(NEW_SHA);
    expect(sawMethod).toBe("PUT");
    expect(sawBody).toMatchObject({ branch: BRANCH, sha: SHA });
  });

  it("omits sha from the request body when creating a new file", async () => {
    let sawBody: unknown;
    const fetchStub: typeof globalThis.fetch = (_input, init) => {
      sawBody = parseJsonBody(init);
      return Promise.resolve(jsonResponse({ content: { sha: "newsha" } }));
    };
    await pushGithubFileContent(
      OWNER,
      REPO,
      BRANCH,
      PATH,
      JSON.stringify(graphA),
      undefined,
      "my-token",
      new AbortController().signal,
      fetchStub,
    );
    expect(sawBody).not.toHaveProperty("sha");
  });

  it("throws RemoteLoadError with kind forbidden on a 403", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse({}, 403));
    try {
      await pushGithubFileContent(
        OWNER,
        REPO,
        BRANCH,
        PATH,
        JSON.stringify(graphA),
        SHA,
        "my-token",
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

  it("encodes multi-byte UTF-8 content correctly so it round-trips", async () => {
    let sawBody: unknown;
    const fetchStub: typeof globalThis.fetch = (_input, init) => {
      sawBody = parseJsonBody(init);
      return Promise.resolve(jsonResponse({ content: { sha: "newsha" } }));
    };
    const text = JSON.stringify(graphUnicode);
    await pushGithubFileContent(
      OWNER,
      REPO,
      BRANCH,
      PATH,
      text,
      SHA,
      "my-token",
      new AbortController().signal,
      fetchStub,
    );
    if (
      typeof sawBody !== "object" ||
      sawBody === null ||
      !("content" in sawBody) ||
      typeof sawBody.content !== "string"
    ) {
      throw new Error("expected a request body with a string content field");
    }
    const binary = atob(sawBody.content);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe(text);
  });
});

describe("listGithubFileHistory", () => {
  it("parses a commits response into history entries, newest first as returned", async () => {
    const commits = [
      {
        sha: "sha2",
        commit: { message: "Second commit", author: { date: "2024-02-01T00:00:00Z" } },
        author: { login: "alice" },
      },
      {
        sha: "sha1",
        commit: { message: "First commit", author: { date: "2024-01-01T00:00:00Z" } },
        author: null,
      },
    ];
    const fetchStub: typeof globalThis.fetch = (input) => {
      const url = requestUrl(input);
      expect(url).toBe(
        `https://api.github.com/repos/${OWNER}/${REPO}/commits?path=${encodeURIComponent(PATH)}&sha=${BRANCH}`,
      );
      return Promise.resolve(jsonResponse(commits));
    };
    const history = await listGithubFileHistory(
      OWNER,
      REPO,
      BRANCH,
      PATH,
      undefined,
      new AbortController().signal,
      fetchStub,
    );
    expect(history).toEqual([
      { sha: "sha2", committedAt: "2024-02-01T00:00:00Z", message: "Second commit", authorLogin: "alice" },
      { sha: "sha1", committedAt: "2024-01-01T00:00:00Z", message: "First commit", authorLogin: undefined },
    ]);
  });

  it("sends an Authorization header when a token is supplied", async () => {
    let sawAuth: string | null = null;
    const fetchStub: typeof globalThis.fetch = (_input, init) => {
      sawAuth =
        init?.headers !== undefined ? new Headers(init.headers).get("Authorization") : null;
      return Promise.resolve(jsonResponse([]));
    };
    await listGithubFileHistory(
      OWNER,
      REPO,
      BRANCH,
      PATH,
      "my-token",
      new AbortController().signal,
      fetchStub,
    );
    expect(sawAuth).toBe("Bearer my-token");
  });

  it("throws RemoteLoadError with kind notFound on a 404", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse({}, 404));
    try {
      await listGithubFileHistory(
        OWNER,
        REPO,
        BRANCH,
        PATH,
        undefined,
        new AbortController().signal,
        fetchStub,
      );
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind).toEqual({ type: "notFound" });
      }
    }
  });
});
