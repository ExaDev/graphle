import { describe, expect, it } from "vitest";

import { GraphEdge, GraphNodeSchema, GRAPH_DOCUMENT_VERSION } from "../schema";
import type { GraphDocument, GraphNode } from "../schema";

import {
  parseCanvasDocument,
  parseCanvasFromUnknown,
  serialiseCanvasDocument,
  toCanvasDocument,
} from "./jsoncanvas";

const position = { x: 10, y: 20 };

/**
 * Build a document with no declared types. Built-in node types still resolve
 * (the type registry falls back to the built-in registry), so this is the
 * minimal valid document for exercising the canvas transforms.
 */
function makeDoc(name: string, nodes: GraphNode[], edges: GraphEdge[] = []): GraphDocument {
  return { version: GRAPH_DOCUMENT_VERSION, name, types: [], edgeTypes: [], nodes, edges };
}

function freeform(label: string): GraphNode {
  return GraphNodeSchema.parse({
    id: crypto.randomUUID(),
    type: "freeform",
    position,
    data: { label },
  });
}

function org(login: string): GraphNode {
  return GraphNodeSchema.parse({
    id: crypto.randomUUID(),
    type: "org",
    position,
    data: { login },
  });
}

function repo(owner: string, name: string): GraphNode {
  return GraphNodeSchema.parse({
    id: crypto.randomUUID(),
    type: "repo",
    position,
    data: { owner, name },
  });
}

function edgeBetween(sourceId: string, targetId: string, label?: string): GraphEdge {
  return GraphEdge.parse({
    id: crypto.randomUUID(),
    source: sourceId,
    target: targetId,
    type: "owns",
    data: label === undefined ? {} : { label },
  });
}

describe("toCanvasDocument", () => {
  it("maps each node to a text node labelled by its type's labelField", () => {
    const doc = makeDoc("test", [org("exadev"), repo("exadev", "graphle")]);
    const canvas = toCanvasDocument(doc);
    expect(canvas.nodes).toHaveLength(2);
    expect(canvas.nodes?.[0]).toMatchObject({
      type: "text",
      x: 10,
      y: 20,
      width: 250,
      height: 120,
      text: "exadev",
    });
    expect(canvas.nodes?.[1]).toMatchObject({ text: "graphle" });
  });

  it("maps edges with the resolved type's labelField data as the canvas label", () => {
    const a = freeform("A");
    const b = freeform("B");
    const doc = makeDoc("test", [a, b], [edgeBetween(a.id, b.id, "owns it")]);
    const canvas = toCanvasDocument(doc);
    expect(canvas.edges).toHaveLength(1);
    expect(canvas.edges?.[0]).toMatchObject({
      fromNode: a.id,
      toNode: b.id,
      label: "owns it",
    });
  });

  it("omits the canvas label entirely for an edge with no label data", () => {
    const a = freeform("A");
    const b = freeform("B");
    const doc = makeDoc("test", [a, b], [edgeBetween(a.id, b.id)]);
    const canvas = toCanvasDocument(doc);
    const edge = canvas.edges?.[0];
    if (edge === undefined) throw new Error("edge missing");
    expect("label" in edge).toBe(false);
  });
});

describe("canvas -> graphle transform", () => {
  it("maps canvas text/file/link/group nodes to freeform nodes", () => {
    const doc = parseCanvasFromUnknown({
      nodes: [
        { id: "n1", type: "text", x: 0, y: 0, width: 250, height: 120, text: "Hello" },
        { id: "n2", type: "file", x: 100, y: 100, width: 250, height: 120, file: "note.md" },
        { id: "n3", type: "link", x: 200, y: 200, width: 250, height: 120, url: "https://example.com" },
        { id: "n4", type: "group", x: 300, y: 300, width: 500, height: 300, label: "My group" },
      ],
      edges: [],
    });
    expect(doc.nodes).toHaveLength(4);
    const labels = doc.nodes.map((n) => (n.type === "freeform" ? n.data.label : "<wrong type>"));
    expect(labels).toEqual(["Hello", "note.md", "https://example.com", "My group"]);
  });

  it("maps canvas edges to graphle edges with the references type", () => {
    const doc = parseCanvasFromUnknown({
      nodes: [],
      edges: [{ id: "e1", fromNode: "a", toNode: "b", label: "depends on" }],
    });
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0]?.source).toBe("a");
    expect(doc.edges[0]?.target).toBe("b");
    expect(doc.edges[0]?.type).toBe("references");
    expect(doc.edges[0]?.data.label).toBe("depends on");
  });

  it("maps a labelless canvas edge to an edge with empty data", () => {
    const doc = parseCanvasFromUnknown({
      nodes: [],
      edges: [{ id: "e1", fromNode: "a", toNode: "b" }],
    });
    expect(doc.edges[0]?.data).toEqual({});
  });

  it("injects the freeform node type and references edge type definitions so the result is self-describing", () => {
    const doc = parseCanvasFromUnknown({
      nodes: [{ id: "n1", type: "text", x: 0, y: 0, width: 250, height: 120, text: "Hi" }],
      edges: [{ id: "e1", fromNode: "n1", toNode: "n1" }],
    });
    expect(doc.types).toHaveLength(1);
    expect(doc.types[0]?.name).toBe("freeform");
    expect(doc.edgeTypes).toHaveLength(1);
    expect(doc.edgeTypes[0]?.name).toBe("references");
  });
});

describe("round-trip (freeform only — lossy for other types)", () => {
  it("preserves freeform label and position through canvas export then import", () => {
    const original = makeDoc("test", [freeform("My note")]);

    const canvasJson = serialiseCanvasDocument(original);
    const imported = parseCanvasFromUnknown(JSON.parse(canvasJson));

    expect(imported.nodes).toHaveLength(1);
    const first = imported.nodes[0];
    if (first === undefined) throw new Error("expected one node");
    expect(first.type).toBe("freeform");
    expect(first.position).toEqual(position);
    expect(first.data.label).toBe("My note");
  });
});

describe("parseCanvasDocument", () => {
  it("accepts a valid canvas with text nodes and edges", () => {
    const canvas = parseCanvasDocument({
      nodes: [{ id: "n1", type: "text", x: 0, y: 0, width: 250, height: 120, text: "OK" }],
      edges: [{ id: "e1", fromNode: "n1", toNode: "n1" }],
    });
    expect(canvas.nodes).toHaveLength(1);
    expect(canvas.edges).toHaveLength(1);
  });

  it("accepts an empty canvas (both arrays optional)", () => {
    const canvas = parseCanvasDocument({});
    expect(canvas.nodes).toBeUndefined();
    expect(canvas.edges).toBeUndefined();
  });

  it("rejects a node missing required fields", () => {
    expect(() =>
      parseCanvasDocument({ nodes: [{ id: "n1", type: "text" }] }),
    ).toThrow();
  });

  it("rejects an unknown node type", () => {
    expect(() =>
      parseCanvasDocument({
        nodes: [{ id: "n1", type: "unknown", x: 0, y: 0, width: 1, height: 1 }],
      }),
    ).toThrow();
  });
});
