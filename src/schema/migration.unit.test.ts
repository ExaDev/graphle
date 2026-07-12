import { describe, expect, it } from "vitest";

import { BUILT_IN_EDGE_TYPES_BY_NAME } from "./built-in-edge-types";
import { BUILT_IN_TYPES_BY_NAME } from "./built-in-types";
import { GraphDocumentSchema } from "./graph";
import { migrateV1Document, migrateV2Document } from "./migration";

const position = { x: 5, y: 7 };

/** A representative v1 document exercising several node kinds. */
const v1Document = {
  version: 1,
  name: "Legacy graph",
  nodes: [
    { id: "n1", kind: "freeform", position, data: { label: "A note" } },
    {
      id: "n2",
      kind: "repo",
      position,
      data: { owner: "exadev", name: "graphle" },
    },
    {
      id: "n3",
      kind: "issue",
      position,
      data: { owner: "exadev", repo: "graphle", number: 42, title: "Bug" },
    },
  ],
  edges: [{ id: "e1", source: "n2", target: "n3", relation: "tracks" }],
};

/** Run the v1 migration and parse the result into a typed v3 document. */
const migrate = () => GraphDocumentSchema.parse(migrateV1Document(v1Document));

describe("migrateV1Document", () => {
  it("throws on input that is not a valid v1 document", () => {
    expect(() => migrateV1Document({ version: 2, name: "x", nodes: [], edges: [] })).toThrow();
    expect(() => migrateV1Document({ version: 1, name: "x" })).toThrow();
  });

  it("bumps the version to 3 (chaining through v2)", () => {
    expect(migrate().version).toBe(3);
  });

  it("maps each node's `kind` to `type` and preserves the rest of the node", () => {
    expect(migrate().nodes).toEqual([
      { id: "n1", type: "freeform", position, data: { label: "A note" } },
      { id: "n2", type: "repo", position, data: { owner: "exadev", name: "graphle" } },
      {
        id: "n3",
        type: "issue",
        position,
        data: { owner: "exadev", repo: "graphle", number: 42, title: "Bug" },
      },
    ]);
  });

  it("injects the five original built-in node type definitions and no others", () => {
    const types = migrate().types;
    expect(types.map((t) => t.name).sort()).toEqual(["freeform", "issue", "org", "project", "repo"]);
    // The serialisable definition must not carry the live Zod schema object.
    for (const t of types) {
      expect(t).not.toHaveProperty("schema");
    }
  });

  it("injects the built-in edge type definitions", () => {
    const edgeTypes = migrate().edgeTypes;
    expect(edgeTypes.map((t) => t.name).sort()).toEqual([
      "baseBranch",
      "blocks",
      "contains",
      "custom",
      "headBranch",
      "owns",
      "references",
      "tracks",
    ]);
    for (const t of edgeTypes) {
      expect(t).not.toHaveProperty("schema");
    }
  });

  it("folds each edge's relation/label into type/data", () => {
    expect(migrate().edges).toEqual([{ id: "e1", source: "n2", target: "n3", type: "tracks", data: {} }]);
  });

  it("produces an object that GraphDocumentSchema accepts", () => {
    const result = GraphDocumentSchema.safeParse(migrateV1Document(v1Document));
    expect(result.success).toBe(true);
  });

  it("round-trips each migrated node's data against its resolved built-in schema", () => {
    const migrated = migrate();
    for (const node of migrated.nodes) {
      const type = BUILT_IN_TYPES_BY_NAME.get(node.type);
      if (type === undefined) throw new Error(`no built-in for ${node.type}`);
      expect(type.schema.safeParse(node.data).success).toBe(true);
    }
  });

  it("round-trips each migrated edge's data against its resolved built-in schema", () => {
    const migrated = migrate();
    for (const edge of migrated.edges) {
      const type = BUILT_IN_EDGE_TYPES_BY_NAME.get(edge.type);
      if (type === undefined) throw new Error(`no built-in for ${edge.type}`);
      expect(type.schema.safeParse(edge.data).success).toBe(true);
    }
  });
});

describe("migrateV2Document", () => {
  const v2Document = {
    version: 2,
    name: "v2 graph",
    types: [],
    nodes: [{ id: "n1", type: "org", position, data: { login: "exadev" } }],
    edges: [
      { id: "e1", source: "n1", target: "n1", relation: "owns", label: "self-owns" },
      { id: "e2", source: "n1", target: "n1", relation: "references" },
    ],
  };

  it("throws on input that is not a valid v2 document", () => {
    expect(() => migrateV2Document({ version: 3, name: "x", nodes: [], edges: [] })).toThrow();
  });

  it("bumps the version to 3", () => {
    expect(GraphDocumentSchema.parse(migrateV2Document(v2Document)).version).toBe(3);
  });

  it("moves a labelled edge's `label` into `data.label`", () => {
    const migrated = GraphDocumentSchema.parse(migrateV2Document(v2Document));
    expect(migrated.edges[0]).toEqual({
      id: "e1",
      source: "n1",
      target: "n1",
      type: "owns",
      data: { label: "self-owns" },
    });
  });

  it("gives a labelless edge an empty `data`", () => {
    const migrated = GraphDocumentSchema.parse(migrateV2Document(v2Document));
    expect(migrated.edges[1]).toEqual({
      id: "e2",
      source: "n1",
      target: "n1",
      type: "references",
      data: {},
    });
  });

  it("injects the built-in edge type definitions", () => {
    const migrated = GraphDocumentSchema.parse(migrateV2Document(v2Document));
    expect(migrated.edgeTypes.map((t) => t.name).sort()).toEqual([
      "baseBranch",
      "blocks",
      "contains",
      "custom",
      "headBranch",
      "owns",
      "references",
      "tracks",
    ]);
  });

  it("carries node types/nodes through unchanged", () => {
    const migrated = GraphDocumentSchema.parse(migrateV2Document(v2Document));
    expect(migrated.nodes).toEqual(v2Document.nodes);
  });
});
