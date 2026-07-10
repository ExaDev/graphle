import { beforeEach, describe, expect, it } from "vitest";

import { emptyDocument, type GraphDelta, type GraphOperation } from "@/domain";
import {
  GraphNodeSchema,
  type EdgeTypeDefinition,
  type GraphDocument,
  type GraphNode,
  type NodeTypeDefinition,
} from "@/schema";

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

/**
 * Exercises the ephemeral, session-only undo/redo stacks: every
 * document-mutating action snapshots the pre-mutation document onto
 * `undoStack` and clears `redoStack`, and `undo`/`redo` step between those
 * snapshots. This is distinct from the separate, persisted revision-history
 * mechanism — these stacks are lost on reload and never touch storage.
 */
describe("useGraphStore undo/redo", () => {
  beforeEach(() => {
    useGraphStore.getState().replaceDocument(emptyDocument("test"));
    useGraphStore.getState().markSaved();
    // The store is a process-wide singleton and `replaceDocument` itself
    // funnels through the undo/redo history (it is one of the seven
    // document-mutating actions), so it does not clear the stacks left by a
    // previous test. Reset them directly so each test starts from a
    // genuinely empty history.
    useGraphStore.setState({ undoStack: [], redoStack: [] });
  });

  function document(): GraphDocument {
    return useGraphStore.getState().document;
  }

  function addNodeOp(login: string): GraphOperation {
    return {
      type: "addNode",
      node: GraphNodeSchema.parse({
        id: crypto.randomUUID(),
        type: "org",
        position: { x: 0, y: 0 },
        data: { login },
      }),
    };
  }

  it("restores the state after the first apply once a second apply is undone", () => {
    useGraphStore.getState().apply(addNodeOp("first"));
    const afterFirst = document();

    useGraphStore.getState().apply(addNodeOp("second"));

    useGraphStore.getState().undo();

    expect(document()).toBe(afterFirst);
  });

  it("restores the second apply's result when a redo follows an undo", () => {
    useGraphStore.getState().apply(addNodeOp("first"));
    useGraphStore.getState().apply(addNodeOp("second"));
    const afterSecond = document();

    useGraphStore.getState().undo();
    useGraphStore.getState().redo();

    expect(document()).toBe(afterSecond);
  });

  it("does nothing when undo is called with an empty undo stack", () => {
    const before = document();

    useGraphStore.getState().undo();

    expect(document()).toBe(before);
    expect(useGraphStore.getState().dirty).toBe(false);
  });

  it("clears the redo stack once a fresh apply follows an undo", () => {
    useGraphStore.getState().apply(addNodeOp("first"));
    useGraphStore.getState().apply(addNodeOp("second"));
    useGraphStore.getState().undo();
    expect(useGraphStore.getState().redoStack).toHaveLength(1);

    useGraphStore.getState().apply(addNodeOp("third"));

    expect(useGraphStore.getState().redoStack).toEqual([]);
  });

  it("clears dirty once undo lands back on the document reference set by markSaved", () => {
    useGraphStore.getState().apply(addNodeOp("first"));
    useGraphStore.getState().markSaved();
    expect(useGraphStore.getState().dirty).toBe(false);

    useGraphStore.getState().apply(addNodeOp("second"));
    expect(useGraphStore.getState().dirty).toBe(true);

    useGraphStore.getState().undo();

    expect(useGraphStore.getState().dirty).toBe(false);
  });
});

/**
 * Exercises {@link useGraphStore.updateType}: merging a partial patch into an
 * existing node-type definition by name, keeping `name` unchanged, throwing
 * on an unknown name, and participating in the undo stack like every other
 * document-mutating action.
 */
describe("useGraphStore.updateType", () => {
  function nodeType(overrides: Partial<NodeTypeDefinition> = {}): NodeTypeDefinition {
    return {
      name: "custom",
      label: "Custom",
      color: "#123456",
      icon: "circle",
      labelField: "name",
      identityFields: ["name"],
      jsonSchema: {},
      ...overrides,
    };
  }

  beforeEach(() => {
    useGraphStore.getState().replaceDocument(emptyDocument("test"));
    useGraphStore.getState().addType(nodeType());
    useGraphStore.getState().markSaved();
    useGraphStore.setState({ undoStack: [], redoStack: [] });
  });

  function document(): GraphDocument {
    return useGraphStore.getState().document;
  }

  it("merges the patch into the existing type, leaving name unchanged", () => {
    useGraphStore.getState().updateType("custom", {
      label: "Renamed label",
      color: "#abcdef",
      jsonSchema: { type: "object" },
    });

    const updated = document().types.find((type) => type.name === "custom");
    expect(updated).toEqual(
      nodeType({ label: "Renamed label", color: "#abcdef", jsonSchema: { type: "object" } }),
    );
  });

  it("throws when the named type does not exist", () => {
    expect(() => useGraphStore.getState().updateType("missing", { label: "X" })).toThrow();
  });

  it("participates in undo, restoring the prior definition", () => {
    const before = document().types.find((type) => type.name === "custom");

    useGraphStore.getState().updateType("custom", { label: "Renamed label" });
    useGraphStore.getState().undo();

    expect(document().types.find((type) => type.name === "custom")).toEqual(before);
  });
});

/**
 * Mirrors `useGraphStore.updateType` for edge types.
 */
describe("useGraphStore.updateEdgeType", () => {
  function edgeType(overrides: Partial<EdgeTypeDefinition> = {}): EdgeTypeDefinition {
    return {
      name: "custom-edge",
      label: "Custom edge",
      color: "#123456",
      strokeStyle: "solid",
      labelField: "name",
      jsonSchema: {},
      ...overrides,
    };
  }

  beforeEach(() => {
    useGraphStore.getState().replaceDocument(emptyDocument("test"));
    useGraphStore.getState().addEdgeType(edgeType());
    useGraphStore.getState().markSaved();
    useGraphStore.setState({ undoStack: [], redoStack: [] });
  });

  function document(): GraphDocument {
    return useGraphStore.getState().document;
  }

  it("merges the patch into the existing edge type, leaving name unchanged", () => {
    useGraphStore.getState().updateEdgeType("custom-edge", {
      label: "Renamed label",
      color: "#abcdef",
      jsonSchema: { type: "object" },
    });

    const updated = document().edgeTypes.find((type) => type.name === "custom-edge");
    expect(updated).toEqual(
      edgeType({ label: "Renamed label", color: "#abcdef", jsonSchema: { type: "object" } }),
    );
  });

  it("throws when the named edge type does not exist", () => {
    expect(() =>
      useGraphStore.getState().updateEdgeType("missing", { label: "X" }),
    ).toThrow();
  });

  it("participates in undo, restoring the prior definition", () => {
    const before = document().edgeTypes.find((type) => type.name === "custom-edge");

    useGraphStore.getState().updateEdgeType("custom-edge", { label: "Renamed label" });
    useGraphStore.getState().undo();

    expect(document().edgeTypes.find((type) => type.name === "custom-edge")).toEqual(before);
  });
});
