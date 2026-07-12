import { describe, expect, it } from "vitest";

import { GraphEdge, GraphNodeSchema, GRAPH_DOCUMENT_VERSION } from "../schema";
import type { GraphDocument, GraphNode } from "../schema";

import { documentToMermaid } from "./mermaid";

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

describe("documentToMermaid", () => {
  it("produces just the flowchart header for an empty document", () => {
    const doc = makeDoc("Empty", []);
    expect(documentToMermaid(doc)).toBe("flowchart TD");
  });

  it("emits one bracketed node line per node, using id and resolved label", () => {
    const doc = makeDoc("Nodes", [freeform("n1", "First"), freeform("n2", "Second")]);
    expect(documentToMermaid(doc)).toBe(
      ['flowchart TD', '    n1["First"]', '    n2["Second"]'].join("\n"),
    );
  });

  it("emits an arrow line per edge, piped with the resolved label when present", () => {
    const doc = makeDoc(
      "Edges",
      [freeform("n1", "First"), freeform("n2", "Second")],
      [edgeBetween("e1", "n1", "n2", "owns it")],
    );
    expect(documentToMermaid(doc)).toBe(
      [
        "flowchart TD",
        '    n1["First"]',
        '    n2["Second"]',
        "    n1 -->|owns it| n2",
      ].join("\n"),
    );
  });

  it("emits a bare arrow line when the edge has no resolvable label", () => {
    const doc = makeDoc(
      "Unlabelled edge",
      [freeform("n1", "First"), freeform("n2", "Second")],
      [edgeBetween("e1", "n1", "n2")],
    );
    expect(documentToMermaid(doc)).toBe(
      ["flowchart TD", '    n1["First"]', '    n2["Second"]', "    n1 --> n2"].join("\n"),
    );
  });

  it("escapes a literal double-quote character in a node label", () => {
    const doc = makeDoc("Quoted label", [freeform("n1", 'Say "hi"')]);
    expect(documentToMermaid(doc)).toBe(
      ['flowchart TD', '    n1["Say #quot;hi#quot;"]'].join("\n"),
    );
  });

  it("escapes a literal double-quote character in an edge label", () => {
    const doc = makeDoc(
      "Quoted edge label",
      [freeform("n1", "First"), freeform("n2", "Second")],
      [edgeBetween("e1", "n1", "n2", 'says "hi"')],
    );
    expect(documentToMermaid(doc)).toBe(
      [
        "flowchart TD",
        '    n1["First"]',
        '    n2["Second"]',
        "    n1 -->|says #quot;hi#quot;| n2",
      ].join("\n"),
    );
  });
});
