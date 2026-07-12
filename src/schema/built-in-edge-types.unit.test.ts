import { describe, expect, it } from "vitest";

import { BUILT_IN_EDGE_TYPES, BUILT_IN_EDGE_TYPES_BY_NAME } from "./built-in-edge-types";

const EXPECTED_NAMES = [
  "owns",
  "contains",
  "tracks",
  "references",
  "custom",
  "blocks",
  "headBranch",
  "baseBranch",
] as const;

/** Expected colour + strokeStyle pairing per built-in edge type, per the plan. */
const EXPECTED_PRESENTATION: Record<
  (typeof EXPECTED_NAMES)[number],
  { color: string; strokeStyle: "solid" | "dashed" | "dotted" }
> = {
  owns: { color: "green", strokeStyle: "solid" },
  contains: { color: "blue", strokeStyle: "solid" },
  tracks: { color: "orange", strokeStyle: "dashed" },
  references: { color: "gray", strokeStyle: "dotted" },
  custom: { color: "gray", strokeStyle: "solid" },
  blocks: { color: "red", strokeStyle: "dashed" },
  headBranch: { color: "cyan", strokeStyle: "solid" },
  baseBranch: { color: "indigo", strokeStyle: "dashed" },
};

describe("BUILT_IN_EDGE_TYPES", () => {
  it("registers the original five EdgeRelation types plus later additions, in registration order", () => {
    expect(BUILT_IN_EDGE_TYPES.map((t) => t.name)).toEqual([...EXPECTED_NAMES]);
  });

  it("gives every type non-empty metadata", () => {
    for (const type of BUILT_IN_EDGE_TYPES) {
      expect(type.label.length).toBeGreaterThan(0);
      expect(type.color.length).toBeGreaterThan(0);
      expect(type.labelField.length).toBeGreaterThan(0);
      expect(type.jsonSchema).toEqual(expect.objectContaining({ type: "object" }));
    }
  });

  it("matches the plan's colour/strokeStyle pairing for each built-in type", () => {
    for (const [name, expected] of Object.entries(EXPECTED_PRESENTATION)) {
      const type = BUILT_IN_EDGE_TYPES_BY_NAME.get(name);
      if (type === undefined) throw new Error(`fixture: ${name} must exist`);
      expect(type.color).toBe(expected.color);
      expect(type.strokeStyle).toBe(expected.strokeStyle);
    }
  });
});

describe("BUILT_IN_EDGE_TYPES_BY_NAME", () => {
  it("contains an entry for every registered type", () => {
    for (const name of EXPECTED_NAMES) {
      expect(BUILT_IN_EDGE_TYPES_BY_NAME.has(name)).toBe(true);
    }
    expect(BUILT_IN_EDGE_TYPES_BY_NAME.size).toBe(EXPECTED_NAMES.length);
  });

  it("returns undefined for an unknown type name", () => {
    expect(BUILT_IN_EDGE_TYPES_BY_NAME.get("nope")).toBeUndefined();
  });
});

describe("built-in edge data schemas (runtime validation)", () => {
  it("every built-in edge type accepts empty data", () => {
    for (const type of BUILT_IN_EDGE_TYPES) {
      expect(type.schema.safeParse({}).success).toBe(true);
    }
  });

  it("every built-in edge type accepts a string label", () => {
    for (const type of BUILT_IN_EDGE_TYPES) {
      expect(type.schema.safeParse({ label: "custom label" }).success).toBe(true);
    }
  });

  it("rejects a non-string label", () => {
    const owns = BUILT_IN_EDGE_TYPES_BY_NAME.get("owns");
    if (owns === undefined) throw new Error("fixture");
    expect(owns.schema.safeParse({ label: 123 }).success).toBe(false);
  });
});
