import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION } from "../schema";

import { loadDocumentFromUrl, RemoteLoadError } from "./remote";

function jsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

const v3Document = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Remote",
  types: [],
  edgeTypes: [],
  nodes: [{ id: "n1", type: "freeform", position: { x: 0, y: 0 }, data: { label: "A" } }],
  edges: [],
};

describe("loadDocumentFromUrl - success", () => {
  it("fetches and decodes a full v3 document", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse(v3Document));
    const doc = await loadDocumentFromUrl(
      "https://example.com/graph.json",
      new AbortController().signal,
      fetchStub,
    );
    expect(doc.name).toBe("Remote");
    expect(doc.nodes).toHaveLength(1);
  });

  it("fetches and decodes a JSON Canvas document", async () => {
    const canvas = {
      nodes: [{ id: "n1", type: "text", x: 0, y: 0, width: 250, height: 120, text: "Hi" }],
      edges: [],
    };
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse(canvas));
    const doc = await loadDocumentFromUrl(
      "https://example.com/board.canvas",
      new AbortController().signal,
      fetchStub,
    );
    expect(doc.nodes[0]?.type).toBe("freeform");
  });

  it("migrates a v1 document fetched from the remote URL", async () => {
    const v1 = {
      version: 1,
      name: "Legacy",
      nodes: [{ id: "n1", kind: "org", position: { x: 0, y: 0 }, data: { login: "exadev" } }],
      edges: [],
    };
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse(v1));
    const doc = await loadDocumentFromUrl(
      "https://example.com/legacy.json",
      new AbortController().signal,
      fetchStub,
    );
    expect(doc.version).toBe(GRAPH_DOCUMENT_VERSION);
    expect(doc.nodes[0]?.type).toBe("org");
  });
});

describe("loadDocumentFromUrl - failure", () => {
  it("throws a RemoteLoadError with kind network when fetch rejects", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.reject(new Error("boom"));
    await expect(
      loadDocumentFromUrl("https://example.com/x", new AbortController().signal, fetchStub),
    ).rejects.toThrow(RemoteLoadError);
    try {
      await loadDocumentFromUrl("https://example.com/x", new AbortController().signal, fetchStub);
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind.type).toBe("network");
      }
    }
  });

  it("throws a RemoteLoadError with kind httpError on a non-2xx response", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(jsonResponse({ message: "not found" }, 404));
    try {
      await loadDocumentFromUrl("https://example.com/x", new AbortController().signal, fetchStub);
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind).toEqual({ type: "httpError", status: 404 });
      }
    }
  });

  it("throws a RemoteLoadError with kind invalidJson on a non-JSON body", async () => {
    const fetchStub: typeof globalThis.fetch = () =>
      Promise.resolve(textResponse("<html>not json</html>"));
    try {
      await loadDocumentFromUrl("https://example.com/x", new AbortController().signal, fetchStub);
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind.type).toBe("invalidJson");
      }
    }
  });

  it("throws a RemoteLoadError with kind decodeError on JSON that decodes to neither a document nor a canvas", async () => {
    const fetchStub: typeof globalThis.fetch = () => Promise.resolve(jsonResponse({ foo: "bar" }));
    try {
      await loadDocumentFromUrl("https://example.com/x", new AbortController().signal, fetchStub);
      throw new Error("expected RemoteLoadError");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteLoadError);
      if (error instanceof RemoteLoadError) {
        expect(error.kind.type).toBe("decodeError");
      }
    }
  });

  it("RemoteLoadError carries a descriptive message per kind", () => {
    const httpError = new RemoteLoadError({ type: "httpError", status: 500 });
    expect(httpError.name).toBe("RemoteLoadError");
    expect(httpError.message).toContain("500");
  });
});
