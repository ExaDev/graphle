import { describe, expect, it } from "vitest";

import { GraphEdge, GraphNodeSchema, GRAPH_DOCUMENT_VERSION } from "../schema";
import type { GraphDocument, GraphNode } from "../schema";

import { documentToDot } from "./dot";

const position = { x: 10, y: 20 };

function makeDoc(name: string, nodes: GraphNode[], edges: GraphEdge[] = []): GraphDocument {
  return { version: GRAPH_DOCUMENT_VERSION, name, types: [], edgeTypes: [], nodes, edges };
}

function freeform(id: string, label: string): GraphNode {
  return GraphNodeSchema.parse({
    id,
    type: "freeform",
    position,
    data: { label },
  });
}

function edgeBetween(id: string, sourceId: string, targetId: string, label?: string): GraphEdge {
  return GraphEdge.parse({
    id,
    source: sourceId,
    target: targetId,
    type: "owns",
    data: label === undefined ? {} : { label },
  });
}

describe("documentToDot", () => {
  it("produces just the digraph header and footer for an empty document", () => {
    const doc = makeDoc("Empty", []);
    expect(documentToDot(doc)).toBe(["digraph G {", "}"].join("\n"));
  });

  it("emits one quoted node statement per node, using id and resolved label", () => {
    const doc = makeDoc("Nodes", [freeform("n1", "First"), freeform("n2", "Second")]);
    expect(documentToDot(doc)).toBe(
      [
        "digraph G {",
        '    "n1" [label="First"];',
        '    "n2" [label="Second"];',
        "}",
      ].join("\n"),
    );
  });

  it("emits a quoted arrow statement per edge, with a label attribute when present", () => {
    const doc = makeDoc(
      "Edges",
      [freeform("n1", "First"), freeform("n2", "Second")],
      [edgeBetween("e1", "n1", "n2", "owns it")],
    );
    expect(documentToDot(doc)).toBe(
      [
        "digraph G {",
        '    "n1" [label="First"];',
        '    "n2" [label="Second"];',
        '    "n1" -> "n2" [label="owns it"];',
        "}",
      ].join("\n"),
    );
  });

  it("emits a bare arrow statement when the edge has no resolvable label", () => {
    const doc = makeDoc(
      "Unlabelled edge",
      [freeform("n1", "First"), freeform("n2", "Second")],
      [edgeBetween("e1", "n1", "n2")],
    );
    expect(documentToDot(doc)).toBe(
      [
        "digraph G {",
        '    "n1" [label="First"];',
        '    "n2" [label="Second"];',
        '    "n1" -> "n2";',
        "}",
      ].join("\n"),
    );
  });

  it("escapes a literal double-quote character in a node label", () => {
    const doc = makeDoc("Quoted label", [freeform("n1", 'Say "hi"')]);
    expect(documentToDot(doc)).toBe(
      ["digraph G {", '    "n1" [label="Say \\"hi\\""];', "}"].join("\n"),
    );
  });

  it("escapes a literal double-quote character in an edge label", () => {
    const doc = makeDoc(
      "Quoted edge label",
      [freeform("n1", "First"), freeform("n2", "Second")],
      [edgeBetween("e1", "n1", "n2", 'says "hi"')],
    );
    expect(documentToDot(doc)).toBe(
      [
        "digraph G {",
        '    "n1" [label="First"];',
        '    "n2" [label="Second"];',
        '    "n1" -> "n2" [label="says \\"hi\\""];',
        "}",
      ].join("\n"),
    );
  });
});
