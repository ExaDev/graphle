import { describe, expect, it } from "vitest";

import { BUILT_IN_TYPES_BY_NAME } from "./built-in-types";
import { GraphDocumentSchema } from "./graph";
import { migrateV1Document } from "./migration";

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

/** Run the migration and parse the result into a typed v2 document. */
const migrate = () => GraphDocumentSchema.parse(migrateV1Document(v1Document));

describe("migrateV1Document", () => {
  it("throws on input that is not a valid v1 document", () => {
    expect(() => migrateV1Document({ version: 2, name: "x", nodes: [], edges: [] })).toThrow();
    expect(() => migrateV1Document({ version: 1, name: "x" })).toThrow();
  });

  it("bumps the version to 2", () => {
    expect(migrate().version).toBe(2);
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

  it("injects the five original built-in type definitions and no others", () => {
    const types = migrate().types;
    expect(types.map((t) => t.name).sort()).toEqual(["freeform", "issue", "org", "project", "repo"]);
    // The serialisable definition must not carry the live Zod schema object.
    for (const t of types) {
      expect(t).not.toHaveProperty("schema");
    }
  });

  it("carries edges through unchanged", () => {
    expect(migrate().edges).toEqual([{ id: "e1", source: "n2", target: "n3", relation: "tracks" }]);
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
});
