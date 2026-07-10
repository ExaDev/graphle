import { describe, expect, it } from "vitest";

import { BUILT_IN_TYPES, BUILT_IN_TYPES_BY_NAME } from "./built-in-types";

const EXPECTED_NAMES = [
  "freeform",
  "org",
  "repo",
  "issue",
  "project",
  "service",
  "person",
  "task",
  "note",
  "link",
  "database",
  "decision",
] as const;

describe("BUILT_IN_TYPES", () => {
  it("registers exactly the twelve expected types in order", () => {
    expect(BUILT_IN_TYPES.map((t) => t.name)).toEqual([...EXPECTED_NAMES]);
  });

  it("gives every type non-empty metadata", () => {
    for (const type of BUILT_IN_TYPES) {
      expect(type.label.length).toBeGreaterThan(0);
      expect(type.color.length).toBeGreaterThan(0);
      expect(type.icon.length).toBeGreaterThan(0);
      expect(type.labelField.length).toBeGreaterThan(0);
      expect(type.jsonSchema).toEqual(expect.objectContaining({ type: "object" }));
    }
  });

  it("preserves the original GitHub colours for the five legacy types", () => {
    const byName = BUILT_IN_TYPES_BY_NAME;
    expect(byName.get("freeform")?.color).toBe("gray");
    expect(byName.get("org")?.color).toBe("blue");
    expect(byName.get("repo")?.color).toBe("grape");
    expect(byName.get("issue")?.color).toBe("orange");
    expect(byName.get("project")?.color).toBe("teal");
  });
});

describe("BUILT_IN_TYPES_BY_NAME", () => {
  it("contains an entry for every registered type", () => {
    for (const name of EXPECTED_NAMES) {
      expect(BUILT_IN_TYPES_BY_NAME.has(name)).toBe(true);
    }
    expect(BUILT_IN_TYPES_BY_NAME.size).toBe(EXPECTED_NAMES.length);
  });

  it("returns undefined for an unknown type name", () => {
    expect(BUILT_IN_TYPES_BY_NAME.get("nope")).toBeUndefined();
  });
});

describe("built-in data schemas (runtime validation)", () => {
  const byName = BUILT_IN_TYPES_BY_NAME;

  it("rejects a repo node missing a required field", () => {
    const repo = byName.get("repo");
    if (repo === undefined) throw new Error("fixture");
    expect(repo.schema.safeParse({ owner: "exadev" }).success).toBe(false);
  });

  it("validates an issue node and preserves integer parsing", () => {
    const issue = byName.get("issue");
    if (issue === undefined) throw new Error("fixture");
    expect(
      issue.schema.safeParse({ owner: "exadev", repo: "graphle", number: 1.5, title: "Bug" })
        .success,
    ).toBe(false);
    expect(
      issue.schema.safeParse({ owner: "exadev", repo: "graphle", number: 1, title: "Bug" }).success,
    ).toBe(true);
  });

  it("validates the service status enum", () => {
    const service = byName.get("service");
    if (service === undefined) throw new Error("fixture");
    expect(service.schema.safeParse({ name: "api", status: "up" }).success).toBe(false);
    expect(service.schema.safeParse({ name: "api", status: "degraded" }).success).toBe(true);
  });
});
