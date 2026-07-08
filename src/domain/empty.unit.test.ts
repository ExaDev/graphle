import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION } from "../schema";

import { emptyDocument } from "./empty";

describe("emptyDocument", () => {
  it("returns a document stamped with the current schema version", () => {
    expect(emptyDocument("Untitled").version).toBe(GRAPH_DOCUMENT_VERSION);
  });

  it("uses the given name", () => {
    expect(emptyDocument("My graph").name).toBe("My graph");
  });

  it("starts with no nodes or edges", () => {
    const doc = emptyDocument("Untitled");
    expect(doc.nodes).toEqual([]);
    expect(doc.edges).toEqual([]);
  });
});
