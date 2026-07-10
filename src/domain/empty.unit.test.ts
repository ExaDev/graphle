import { describe, expect, it } from "vitest";

import {
  BUILT_IN_TYPES,
  GRAPH_DOCUMENT_VERSION,
  toPortableTypeDefinition,
} from "../schema";

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

  it("carries every built-in type definition so the document is self-describing", () => {
    const doc = emptyDocument("Untitled");
    expect(doc.types).toEqual(BUILT_IN_TYPES.map(toPortableTypeDefinition));
  });

  it("carries only the portable type shape (no live Zod schema)", () => {
    const doc = emptyDocument("Untitled");
    for (const type of doc.types) {
      expect(type).not.toHaveProperty("schema");
    }
  });
});
