import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION, type GraphDocument } from "../schema";

import { encodeDocument } from "./codec";
import {
  buildShareUrl,
  HASH_KEY,
  readDocumentFromLocation,
  writeDocumentToLocation,
} from "./url";

const doc: GraphDocument = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Share me",
  types: [],
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
});

/** Helper: pull the payload portion out of a built share URL. */
function decodePayload(url: string): string {
  const marker = "#g=";
  const at = url.indexOf(marker);
  return url.slice(at + marker.length);
}
