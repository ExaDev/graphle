import { beforeEach, describe, expect, it } from "vitest";

import { emptyDocument, type GraphDelta } from "@/domain";
import { GraphNodeSchema, type GraphDocument, type GraphNode } from "@/schema";

import { useGraphStore } from "./graph-store";

/**
 * Exercises the {@link useGraphStore.mergeDelta} wiring: it folds a delta via
 * `applyDelta`, marks the document dirty, and returns the ids of the nodes that
 * were actually added. The store is a process-wide singleton, so each test
 * resets it to a fresh empty document (and clears the dirty flag) first.
 *
 * The dedup behaviour itself is `applyDelta`'s responsibility and is covered by
 * its own tests; here we assert only the store integration.
 */
describe("useGraphStore.mergeDelta", () => {
  beforeEach(() => {
    useGraphStore.getState().replaceDocument(emptyDocument("test"));
    useGraphStore.getState().markSaved();
  });

  function makeOrg(login: string): GraphNode {
    return GraphNodeSchema.parse({
      id: crypto.randomUUID(),
      type: "org",
      position: { x: 0, y: 0 },
      data: { login },
    });
  }

  function makeRepo(owner: string, name: string): GraphNode {
    return GraphNodeSchema.parse({
      id: crypto.randomUUID(),
      type: "repo",
      position: { x: 0, y: 0 },
      data: { owner, name },
    });
  }

  function document(): GraphDocument {
    return useGraphStore.getState().document;
  }

  it("folds a delta's nodes into the document and returns their ids", () => {
    const org = makeOrg("exadev");
    const delta: GraphDelta = { nodes: [org], edges: [] };

    const added = useGraphStore.getState().mergeDelta(delta);

    expect(added).toEqual([org.id]);
    expect(document().nodes.map((n) => n.id)).toEqual([org.id]);
  });

  it("marks the document dirty after a merge", () => {
    expect(useGraphStore.getState().dirty).toBe(false);

    useGraphStore.getState().mergeDelta({ nodes: [makeOrg("exadev")], edges: [] });

    expect(useGraphStore.getState().dirty).toBe(true);
  });

  it("returns only newly added ids, deduping nodes already present", () => {
    const first = makeOrg("exadev");
    useGraphStore.getState().mergeDelta({ nodes: [first], edges: [] });

    // A second delta with a node representing the same org (same identity key)
    // plus a brand-new repo. The org is deduped; the repo is added.
    const dupOrg = makeOrg("Exadev"); // case-insensitive identity key
    const repo = makeRepo("exadev", "graphle");
    const added = useGraphStore.getState().mergeDelta({
      nodes: [dupOrg, repo],
      edges: [],
    });

    expect(added).toEqual([repo.id]);
    // The document still holds exactly one org plus the repo.
    expect(document().nodes).toHaveLength(2);
  });

  it("leaves the ephemeral selection untouched by the merge", () => {
    useGraphStore.getState().setSelection({ nodeId: "selected", edgeId: undefined });

    useGraphStore.getState().mergeDelta({ nodes: [makeOrg("exadev")], edges: [] });

    // Selection is ephemeral session state; merging a delta must not touch it.
    expect(useGraphStore.getState().selection).toEqual({
      nodeId: "selected",
      edgeId: undefined,
    });
    // And it never leaks into the document.
    expect(document().nodes.some((n) => n.id === "selected")).toBe(false);
  });
});
