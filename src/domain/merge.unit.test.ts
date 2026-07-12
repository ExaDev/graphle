import { describe, expect, it } from "vitest";

import {
  BUILT_IN_EDGE_TYPES,
  BUILT_IN_TYPES,
  GRAPH_DOCUMENT_VERSION,
  toPortableEdgeTypeDefinition,
  toPortableTypeDefinition,
  type EdgeTypeDefinition,
  type GraphEdge,
  type GraphDocument,
  type GraphNode,
  type NodeTypeDefinition,
} from "../schema";

import { applyDelta, type GraphDelta } from "./merge";

const position = { x: 0, y: 0 };

/** The built-in types as a document would carry them (portable form). */
const types: NodeTypeDefinition[] = BUILT_IN_TYPES.map(toPortableTypeDefinition);
/** The built-in edge types as a document would carry them (portable form). */
const edgeTypes: EdgeTypeDefinition[] = BUILT_IN_EDGE_TYPES.map(toPortableEdgeTypeDefinition);

function orgNode(login: string): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "org",
    position,
    data: { login },
  };
}

function repoNode(owner: string, name: string): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "repo",
    position,
    data: { owner, name },
  };
}

function freeformNode(label: string): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "freeform",
    position,
    data: { label },
  };
}

function edge(
  source: string,
  target: string,
  type: GraphEdge["type"],
  label?: string,
): GraphEdge {
  return {
    id: crypto.randomUUID(),
    source,
    target,
    type,
    data: label === undefined ? {} : { label },
  };
}

function documentWith(nodes: GraphNode[]): GraphDocument {
  return { version: GRAPH_DOCUMENT_VERSION, name: "test", types, edgeTypes, nodes, edges: [] };
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
    expect(mergedEdge?.type).toBe("owns");
  });

  it("always adds nodes whose type has no identity key, even if they share a label", () => {
    const doc = documentWith([]);
    const a = freeformNode("Note");
    const b = freeformNode("Note");
    const delta: GraphDelta = { nodes: [a, b], edges: [] };

    const { document: next, addedNodeIds } = applyDelta(doc, delta);

    expect(next.nodes).toEqual([a, b]);
    expect(addedNodeIds).toEqual([a.id, b.id]);
  });

  it("backfills a surviving node's missing parentId from a dropped duplicate", () => {
    const existing = repoNode("exadev", "graphle"); // no parentId — reached without an owner yet
    const org = orgNode("exadev");
    const doc = documentWith([existing, org]);

    const dup = { ...repoNode("exadev", "graphle"), parentId: org.id }; // same identity, now with a true owner
    const delta: GraphDelta = { nodes: [dup], edges: [] };

    const { document: next } = applyDelta(doc, delta);

    const survivor = next.nodes.find((n) => n.id === existing.id);
    expect(survivor?.parentId).toBe(org.id);
  });

  it("never overrides an already-assigned parentId with a later duplicate's parentId", () => {
    const orgA = orgNode("exadev-a");
    const orgB = orgNode("exadev-b");
    const existing = { ...repoNode("exadev", "graphle"), parentId: orgA.id };
    const doc = documentWith([existing, orgA, orgB]);

    const dup = { ...repoNode("exadev", "graphle"), parentId: orgB.id };
    const delta: GraphDelta = { nodes: [dup], edges: [] };

    const { document: next } = applyDelta(doc, delta);

    const survivor = next.nodes.find((n) => n.id === existing.id);
    expect(survivor?.parentId).toBe(orgA.id);
  });
});

describe("applyDelta - edge dedup by (source, target, type)", () => {
  it("drops a delta edge whose re-pointed triple already exists in the document", () => {
    const org = orgNode("exadev");
    const repo = repoNode("exadev", "graphle");
    const existing = edge(org.id, repo.id, "owns");
    const doc: GraphDocument = {
      version: GRAPH_DOCUMENT_VERSION,
      name: "test",
      types,
      edgeTypes,
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
    expect(next.edges[0]?.data.label).toBe("first");
    expect(next.edges[0]?.source).toBe(existing.id);
    expect(next.edges[0]?.target).toBe(repo.id);
  });
});

describe("applyDelta - onExistingMatch: \"overwrite\"", () => {
  it("replaces an existing node's data with the delta node's data", () => {
    const existing = { ...orgNode("exadev"), data: { login: "exadev", stars: 1 } };
    const doc = documentWith([existing]);

    const refreshed = { ...orgNode("exadev"), id: existing.id, data: { login: "exadev", stars: 2 } };
    const delta: GraphDelta = { nodes: [refreshed], edges: [] };

    const { document: next } = applyDelta(doc, delta, "overwrite");

    const survivor = next.nodes.find((n) => n.id === existing.id);
    expect(survivor?.data).toEqual({ login: "exadev", stars: 2 });
  });

  it("updates fetchedAt from the delta node's value", () => {
    const existing = { ...orgNode("exadev"), fetchedAt: "2024-01-01T00:00:00Z" };
    const doc = documentWith([existing]);

    const refreshed = { ...orgNode("exadev"), id: existing.id, fetchedAt: "2024-06-01T00:00:00Z" };
    const delta: GraphDelta = { nodes: [refreshed], edges: [] };

    const { document: next } = applyDelta(doc, delta, "overwrite");

    const survivor = next.nodes.find((n) => n.id === existing.id);
    expect(survivor?.fetchedAt).toBe("2024-06-01T00:00:00Z");
  });

  it("does not re-add the node and still applies the parentId backfill alongside the overwrite", () => {
    const existing = { ...repoNode("exadev", "graphle"), data: { owner: "exadev", name: "graphle", stars: 1 } }; // no parentId yet
    const org = orgNode("exadev");
    const doc = documentWith([existing, org]);

    const refreshed = {
      ...repoNode("exadev", "graphle"),
      id: existing.id,
      parentId: org.id,
      data: { owner: "exadev", name: "graphle", stars: 5 },
    };
    const delta: GraphDelta = { nodes: [refreshed], edges: [] };

    const { document: next, addedNodeIds } = applyDelta(doc, delta, "overwrite");

    expect(addedNodeIds).toEqual([]);
    expect(next.nodes.map((n) => n.id)).toEqual([existing.id, org.id]);

    const survivor = next.nodes.find((n) => n.id === existing.id);
    expect(survivor?.data).toEqual({ owner: "exadev", name: "graphle", stars: 5 });
    expect(survivor?.parentId).toBe(org.id);
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
