import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION, type GraphDocument } from "../schema";

import { importDocument, serialiseDocument } from "./json";

const v3Document: GraphDocument = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Current",
  types: [],
  edgeTypes: [],
  nodes: [
    { id: "n1", type: "freeform", position: { x: 1, y: 2 }, data: { label: "A" } },
  ],
  edges: [],
};

describe("serialiseDocument", () => {
  it("pretty-prints the document as JSON that round-trips through importDocument", () => {
    const json = serialiseDocument(v3Document);
    expect(json).toContain("\n");
    expect(importDocument(json)).toEqual(v3Document);
  });
});

describe("importDocument", () => {
  it("parses a v3 document directly", () => {
    expect(importDocument(JSON.stringify(v3Document))).toEqual(v3Document);
  });

  it("migrates a v1 document (kind -> type, injects built-in types)", () => {
    const v1 = {
      version: 1,
      name: "Legacy",
      nodes: [{ id: "n1", kind: "org", position: { x: 0, y: 0 }, data: { login: "exadev" } }],
      edges: [],
    };
    const imported = importDocument(JSON.stringify(v1));
    expect(imported.version).toBe(GRAPH_DOCUMENT_VERSION);
    expect(imported.nodes[0]?.type).toBe("org");
    expect(imported.edgeTypes.length).toBeGreaterThan(0);
  });

  it("migrates a v2 document (relation/label -> type/data, injects edge types)", () => {
    const v2 = {
      version: 2,
      name: "v2 export",
      types: [],
      nodes: [
        { id: "n1", type: "freeform", position: { x: 0, y: 0 }, data: { label: "A" } },
        { id: "n2", type: "freeform", position: { x: 1, y: 1 }, data: { label: "B" } },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", relation: "owns", label: "owns it" }],
    };
    const imported = importDocument(JSON.stringify(v2));
    expect(imported.version).toBe(GRAPH_DOCUMENT_VERSION);
    expect(imported.edges[0]).toEqual({
      id: "e1",
      source: "n1",
      target: "n2",
      type: "owns",
      data: { label: "owns it" },
    });
  });

  it("imports a JSON Canvas file as freeform nodes and a references edge type", () => {
    const canvas = {
      nodes: [{ id: "n1", type: "text", x: 0, y: 0, width: 250, height: 120, text: "Hello" }],
      edges: [],
    };
    const imported = importDocument(JSON.stringify(canvas));
    expect(imported.nodes).toHaveLength(1);
    expect(imported.nodes[0]?.type).toBe("freeform");
    expect(imported.edgeTypes[0]?.name).toBe("references");
  });

  it("throws on a file that is neither a graphle document nor a canvas", () => {
    expect(() => importDocument(JSON.stringify({ foo: "bar" }))).toThrow();
  });

  it("throws on invalid JSON", () => {
    expect(() => importDocument("not json")).toThrow();
  });
});
