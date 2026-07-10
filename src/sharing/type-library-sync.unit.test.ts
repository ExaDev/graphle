import { describe, expect, it } from "vitest";

import type { TypeLibraryDocument } from "../schema";

import { RemoteLoadError } from "./remote";
import {
  fetchGistTypeLibraryRevision,
  fetchGithubBlobTypeLibraryRevision,
} from "./type-library-sync";

const GIST_ID = "7c802f7d943c56d72b26373d66037136";
const OWNER = "exadev";
const REPO = "graphle";
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

const library: TypeLibraryDocument = {
  version: 1,
  nodeTypes: [
    {
      name: "service",
      label: "Service",
      color: "grape",
      icon: "IconServer",
      labelField: "name",
      identityFields: ["name"],
      jsonSchema: { type: "object", properties: { name: { type: "string" } } },
    },
  ],
  edgeTypes: [],
};

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

describe("fetchGistTypeLibraryRevision", () => {
  it("fetches and decodes a specific sha's content as a type library", async () => {
    let requestedUrl = "";
    const fetchStub: typeof globalThis.fetch = (input) => {
      requestedUrl = requestUrl(input);
      return Promise.resolve(
        jsonResponse({
          id: GIST_ID,
          files: {
            "library.json": {
              filename: "library.json",
              raw_url: "unused",
              truncated: false,
              content: JSON.stringify(library),
            },
          },
        }),
      );
    };
    const document = await fetchGistTypeLibraryRevision(
      GIST_ID,
      "sha-1",
      "library.json",
      new AbortController().signal,
      fetchStub,
    );
    expect(document).toEqual(library);
    expect(requestedUrl).toBe(`https://api.github.com/gists/${GIST_ID}/sha-1`);
  });

  it("throws RemoteLoadError with kind gistFileNotFound when the filename is absent from that revision", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(
        jsonResponse({
          id: GIST_ID,
          files: {
            "other.json": {
              filename: "other.json",
              raw_url: "unused",
              truncated: false,
              content: "{}",
            },
          },
        }),
      );
    try {
      await fetchGistTypeLibraryRevision(
        GIST_ID,
        "sha-1",
        "library.json",
        new AbortController().signal,
        fetchStub,
      );
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind).toEqual({ type: "gistFileNotFound", filename: "library.json" });
      }
    }
  });

  it("throws on content that isn't a valid type library document", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(
        jsonResponse({
          id: GIST_ID,
          files: {
            "library.json": {
              filename: "library.json",
              raw_url: "unused",
              truncated: false,
              content: JSON.stringify({ foo: "bar" }),
            },
          },
        }),
      );
    await expect(
      fetchGistTypeLibraryRevision(
        GIST_ID,
        "sha-1",
        "library.json",
        new AbortController().signal,
        fetchStub,
      ),
    ).rejects.toThrow();
  });
});

describe("fetchGithubBlobTypeLibraryRevision", () => {
  it("fetches by blob sha via the git Blob API and decodes it as a type library", async () => {
    const fetchStub: typeof globalThis.fetch = (input) => {
      const url = requestUrl(input);
      expect(url).toBe(`https://api.github.com/repos/${OWNER}/${REPO}/git/blobs/${SHA}`);
      return Promise.resolve(
        jsonResponse({
          sha: SHA,
          content: encodeBase64(JSON.stringify(library)),
          encoding: "base64",
        }),
      );
    };
    const document = await fetchGithubBlobTypeLibraryRevision(
      OWNER,
      REPO,
      SHA,
      undefined,
      new AbortController().signal,
      fetchStub,
    );
    expect(document).toEqual(library);
  });

  it("sends an Authorization header when a token is supplied", async () => {
    let sawAuth: string | null = null;
    const fetchStub: typeof globalThis.fetch = (_input, init) => {
      sawAuth =
        init?.headers !== undefined ? new Headers(init.headers).get("Authorization") : null;
      return Promise.resolve(
        jsonResponse({
          sha: SHA,
          content: encodeBase64(JSON.stringify(library)),
          encoding: "base64",
        }),
      );
    };
    await fetchGithubBlobTypeLibraryRevision(
      OWNER,
      REPO,
      SHA,
      "my-token",
      new AbortController().signal,
      fetchStub,
    );
    expect(sawAuth).toBe("Bearer my-token");
  });

  it("throws RemoteLoadError with kind notFound on a 404", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse({}, 404));
    try {
      await fetchGithubBlobTypeLibraryRevision(
        OWNER,
        REPO,
        SHA,
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

  it("throws on content that isn't a valid type library document", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(
        jsonResponse({
          sha: SHA,
          content: encodeBase64(JSON.stringify({ foo: "bar" })),
          encoding: "base64",
        }),
      );
    await expect(
      fetchGithubBlobTypeLibraryRevision(
        OWNER,
        REPO,
        SHA,
        undefined,
        new AbortController().signal,
        fetchStub,
      ),
    ).rejects.toThrow();
  });
});
