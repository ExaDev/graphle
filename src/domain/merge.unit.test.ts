import { describe, expect, it } from "vitest";

import {
  GRAPH_DOCUMENT_VERSION,
  type GraphEdge,
  type GraphDocument,
  type GraphNode,
} from "../schema";

import { applyDelta, type GraphDelta } from "./merge";

const position = { x: 0, y: 0 };

function orgNode(login: string): GraphNode {
  return {
    id: crypto.randomUUID(),
    kind: "org",
    position,
    data: { login },
  };
}

function repoNode(owner: string, name: string): GraphNode {
  return {
    id: crypto.randomUUID(),
    kind: "repo",
    position,
    data: { owner, name },
  };
}

function freeformNode(label: string): GraphNode {
  return {
    id: crypto.randomUUID(),
    kind: "freeform",
    position,
    data: { label },
  };
}

function edge(
  source: string,
  target: string,
  relation: GraphEdge["relation"],
  label?: string,
): GraphEdge {
  const base = {
    id: crypto.randomUUID(),
    source,
    target,
    relation,
  };
  return label === undefined ? base : { ...base, label };
}

function documentWith(nodes: GraphNode[]): GraphDocument {
  return { version: GRAPH_DOCUMENT_VERSION, name: "test", nodes, edges: [] };
}

describe("applyDelta - new nodes and edges", () => {
  it("adds delta nodes and edges that have no existing match", () => {
    const org = orgNode("exadev");
    const doc = documentWith([org]);

    const repo = repoNode("exadev", "graphle");
    const delta: GraphDelta = {
      nodes: [repo],
      edges: [edge(org.id, repo.id, "owns")],
    };

    const { document: next, addedNodeIds } = applyDelta(doc, delta);

    expect(next.nodes.map((n) => n.id)).toEqual([org.id, repo.id]);
    expect(next.edges).toHaveLength(1);
    expect(addedNodeIds).toEqual([repo.id]);
  });
});

describe("applyDelta - node dedup by identity key", () => {
  it("collapses two incoming nodes that share an identity key into one", () => {
    const doc = documentWith([]);

    const first = orgNode("ExaDev");
    const second = orgNode("exadev"); // same key after lowercasing
    const delta: GraphDelta = { nodes: [first, second], edges: [] };

    const { document: next, addedNodeIds } = applyDelta(doc, delta);

    expect(next.nodes).toEqual([first]);
    expect(addedNodeIds).toEqual([first.id]);
  });

  it("dedupes an incoming node against an existing document node and re-points its edges", () => {
    const existing = orgNode("ExaDev");
    const doc = documentWith([existing]);

    const dup = orgNode("exadev"); // same identity key as `existing`
    const repo = repoNode("exadev", "graphle");
    const delta: GraphDelta = {
      nodes: [dup, repo],
      edges: [edge(dup.id, repo.id, "owns", "a")],
    };

    const { document: next, addedNodeIds } = applyDelta(doc, delta);

    // Only the repo is newly added; `dup` collapsed into `existing`.
    expect(addedNodeIds).toEqual([repo.id]);
    expect(next.nodes.map((n) => n.id)).toEqual([existing.id, repo.id]);

    // The edge was re-pointed from the deduped id to the surviving existing id.
    expect(next.edges).toHaveLength(1);
    const mergedEdge = next.edges[0];
    expect(mergedEdge?.source).toBe(existing.id);
    expect(mergedEdge?.target).toBe(repo.id);
    expect(mergedEdge?.relation).toBe("owns");
  });

  it("always adds freeform nodes, even if they share a label", () => {
    const doc = documentWith([]);
    const a = freeformNode("Note");
    const b = freeformNode("Note");
    const delta: GraphDelta = { nodes: [a, b], edges: [] };

    const { document: next, addedNodeIds } = applyDelta(doc, delta);

    expect(next.nodes).toEqual([a, b]);
    expect(addedNodeIds).toEqual([a.id, b.id]);
  });
});

describe("applyDelta - edge dedup by (source, target, relation)", () => {
  it("drops a delta edge whose re-pointed triple already exists in the document", () => {
    const org = orgNode("exadev");
    const repo = repoNode("exadev", "graphle");
    const existing = edge(org.id, repo.id, "owns");
    const doc: GraphDocument = {
      version: GRAPH_DOCUMENT_VERSION,
      name: "test",
      nodes: [org, repo],
      edges: [existing],
    };

    const delta: GraphDelta = {
      nodes: [],
      edges: [edge(org.id, repo.id, "owns", "different label")],
    };

    const { document: next } = applyDelta(doc, delta);

    expect(next.edges).toEqual([existing]);
  });

  it("drops a delta edge whose triple duplicates another delta edge after re-pointing", () => {
    const existing = orgNode("ExaDev");
    const doc = documentWith([existing]);

    const dup = orgNode("exadev"); // re-points to `existing`
    const repo = repoNode("exadev", "graphle");
    const delta: GraphDelta = {
      nodes: [dup, repo],
      edges: [
        edge(dup.id, repo.id, "owns", "first"), // re-points to existing -> repo
        edge(dup.id, repo.id, "owns", "second"), // same triple -> dropped
      ],
    };

    const { document: next } = applyDelta(doc, delta);

    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]?.label).toBe("first");
    expect(next.edges[0]?.source).toBe(existing.id);
    expect(next.edges[0]?.target).toBe(repo.id);
  });
});

describe("applyDelta - immutability", () => {
  it("does not mutate the input document", () => {
    const org = orgNode("exadev");
    const doc = documentWith([org]);
    const delta: GraphDelta = { nodes: [repoNode("exadev", "graphle")], edges: [] };

    applyDelta(doc, delta);

    expect(doc.nodes).toEqual([org]);
    expect(doc.edges).toEqual([]);
  });
});
