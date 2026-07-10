import { describe, expect, it } from "vitest";

import { GraphEdge, GraphNode } from "../schema";
import { emptyDocument } from "../domain/empty";

import {
  parseCanvasDocument,
  parseCanvasFromUnknown,
  serialiseCanvasDocument,
  toCanvasDocument,
} from "./jsoncanvas";

const position = { x: 10, y: 20 };

function freeform(label: string): GraphNode {
  return GraphNode.parse({
    id: crypto.randomUUID(),
    kind: "freeform",
    position,
    data: { label },
  });
}

function org(login: string): GraphNode {
  return GraphNode.parse({
    id: crypto.randomUUID(),
    kind: "org",
    position,
    data: { login },
  });
}

function repo(owner: string, name: string): GraphNode {
  return GraphNode.parse({
    id: crypto.randomUUID(),
    kind: "repo",
    position,
    data: { owner, name },
  });
}

function edgeBetween(sourceId: string, targetId: string): GraphEdge {
  return GraphEdge.parse({
    id: crypto.randomUUID(),
    source: sourceId,
    target: targetId,
    relation: "owns",
  });
}

describe("toCanvasDocument", () => {
  it("maps each node kind to a text node with the primary label", () => {
    const doc = emptyDocument("test");
    const o = org("exadev");
    const r = repo("exadev", "graphle");
    doc.nodes.push(o, r);
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

  it("maps edges with the relation as the canvas label", () => {
    const doc = emptyDocument("test");
    const a = freeform("A");
    const b = freeform("B");
    doc.nodes.push(a, b);
    doc.edges.push(edgeBetween(a.id, b.id));
    const canvas = toCanvasDocument(doc);
    expect(canvas.edges).toHaveLength(1);
    expect(canvas.edges?.[0]).toMatchObject({
      fromNode: a.id,
      toNode: b.id,
      label: "owns",
    });
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
    const labels = doc.nodes.map((n) =>
      n.kind === "freeform" ? n.data.label : "<wrong kind>",
    );
    expect(labels).toEqual(["Hello", "note.md", "https://example.com", "My group"]);
  });

  it("maps canvas edges to graphle edges with references relation", () => {
    const doc = parseCanvasFromUnknown({
      nodes: [],
      edges: [{ id: "e1", fromNode: "a", toNode: "b", label: "depends on" }],
    });
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0]?.source).toBe("a");
    expect(doc.edges[0]?.target).toBe("b");
    expect(doc.edges[0]?.relation).toBe("references");
    expect(doc.edges[0]?.label).toBe("depends on");
  });
});

describe("round-trip (freeform only — lossy for kinds)", () => {
  it("preserves freeform label and position through canvas export then import", () => {
    const original = emptyDocument("test");
    const node = freeform("My note");
    original.nodes.push(node);

    const canvasJson = serialiseCanvasDocument(original);
    const imported = parseCanvasFromUnknown(JSON.parse(canvasJson));

    expect(imported.nodes).toHaveLength(1);
    const first = imported.nodes[0];
    if (first === undefined) throw new Error("expected one node");
    expect(first.kind).toBe("freeform");
    expect(first.position).toEqual(position);
    if (first.kind === "freeform") {
      expect(first.data.label).toBe("My note");
    }
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
