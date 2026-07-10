import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION, type GraphDocument } from "../schema";

import { encodeDocument } from "./codec";
import {
  buildRemoteShareUrl,
  buildShareUrl,
  HASH_KEY,
  readDocumentFromLocation,
  readRemoteUrlFromLocation,
  REMOTE_HASH_KEY,
  writeDocumentToLocation,
  writeRemoteUrlToLocation,
} from "./url";

const doc: GraphDocument = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Share me",
  types: [],
  edgeTypes: [],
  nodes: [
    {
      id: "n1",
      type: "freeform",
      position: { x: 5, y: 6 },
      data: { label: "hello" },
    },
  ],
  edges: [],
};

describe("share url", () => {
  it("HASH_KEY is the single-letter g fragment key", () => {
    expect(HASH_KEY).toBe("g");
  });

  it("REMOTE_HASH_KEY is the url fragment key", () => {
    expect(REMOTE_HASH_KEY).toBe("url");
  });

  describe("buildShareUrl", () => {
    it("builds an origin + pathname + #g=payload URL", () => {
      const loc = { origin: "https://example.com", pathname: "/graphle/", hash: "" };
      const url = buildShareUrl(doc, loc);
      const prefix = "https://example.com/graphle/#g=";
      expect(url.startsWith(prefix)).toBe(true);
      // The payload after the key must decode back to the document.
      const payload = url.slice(prefix.length);
      expect(decodePayload(url)).toBe(payload);
    });
  });

  describe("readDocumentFromLocation", () => {
    it("returns undefined when no #g= fragment is present", () => {
      expect(readDocumentFromLocation({ hash: "" })).toBeUndefined();
      expect(readDocumentFromLocation({ hash: "#other=foo" })).toBeUndefined();
    });

    it("reads and decodes a #g= payload from the hash", () => {
      const payload = encodeDocument(doc);
      const result = readDocumentFromLocation({ hash: `#${HASH_KEY}=${payload}` });
      expect(result).toBeDefined();
      if (result !== undefined) {
        expect(result.document.name).toBe("Share me");
        expect(result.document.nodes).toHaveLength(1);
        const node = result.document.nodes[0];
        if (node === undefined) throw new Error("node missing");
        expect(node.type).toBe("freeform");
      }
    });
  });

  describe("writeDocumentToLocation", () => {
    it("invokes replace with a URL built from the document and location", () => {
      const loc = { origin: "https://example.com", pathname: "/app", hash: "" };
      const replaced: string[] = [];
      writeDocumentToLocation(doc, loc, (url) => {
        replaced.push(url);
      });
      expect(replaced).toHaveLength(1);
      const [url] = replaced;
      if (url === undefined) throw new Error("replace was not called");
      expect(url.startsWith("https://example.com/app#g=")).toBe(true);
    });
  });

  describe("readRemoteUrlFromLocation", () => {
    it("returns undefined when no #url= fragment is present", () => {
      expect(readRemoteUrlFromLocation({ hash: "" })).toBeUndefined();
      expect(readRemoteUrlFromLocation({ hash: "#g=payload" })).toBeUndefined();
    });

    it("reads the target URL from a #url= fragment raw, unmodified", () => {
      const target = "https://example.com/graph.json?x=1&y=2";
      const hash = `#url=${target}`;
      expect(readRemoteUrlFromLocation({ hash })).toBe(target);
    });
  });

  describe("buildRemoteShareUrl", () => {
    it("builds an origin + pathname + #url= URL with the target embedded raw", () => {
      const target = "https://example.com/graph.json?x=1&y=2";
      const loc = { origin: "https://example.com", pathname: "/graphle/", hash: "" };
      const url = buildRemoteShareUrl(target, loc);
      expect(url).toBe(`https://example.com/graphle/#url=${target}`);
      expect(readRemoteUrlFromLocation({ hash: url.slice(url.indexOf("#")) })).toBe(target);
    });
  });

  describe("writeRemoteUrlToLocation", () => {
    it("invokes replace with a #url= URL built from the target and location", () => {
      const loc = { origin: "https://example.com", pathname: "/app", hash: "" };
      const target = "https://example.com/graph.json";
      const replaced: string[] = [];
      writeRemoteUrlToLocation(target, loc, (url) => {
        replaced.push(url);
      });
      expect(replaced).toHaveLength(1);
      const [url] = replaced;
      if (url === undefined) throw new Error("replace was not called");
      expect(url).toBe(`https://example.com/app#url=${target}`);
    });
  });
});

/** Helper: pull the payload portion out of a built share URL. */
function decodePayload(url: string): string {
  const marker = "#g=";
  const at = url.indexOf(marker);
  return url.slice(at + marker.length);
}
