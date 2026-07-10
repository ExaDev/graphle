import { describe, expect, it } from "vitest";

import { BUILT_IN_TYPES_BY_NAME } from "./built-in-types";
import type { NodeTypeDefinition } from "./node-type";
import { resolveType, zodSchemaForType } from "./type-registry";

const repoBuiltIn = BUILT_IN_TYPES_BY_NAME.get("repo");
if (repoBuiltIn === undefined) throw new Error("fixture: repo built-in missing");

/** A custom type definition whose jsonSchema is independent of the registry. */
const customService: NodeTypeDefinition = {
  name: "my-service",
  label: "Service",
  color: "grape",
  icon: "IconServer",
  labelField: "name",
  identityFields: ["name"],
  jsonSchema: {
    type: "object",
    properties: { name: { type: "string" }, uptime: { type: "number" } },
    required: ["name"],
    additionalProperties: false,
  },
};

describe("resolveType", () => {
  it("prefers a document-carried definition over the built-in registry", () => {
    const override: NodeTypeDefinition = {
      name: "repo",
      label: "Custom Repo",
      color: "red",
      icon: "IconBox",
      labelField: "name",
      identityFields: ["owner", "name"],
      jsonSchema: { type: "object" },
    };
    expect(resolveType([override], "repo")?.label).toBe("Custom Repo");
  });

  it("falls back to the built-in registry when the document has no match", () => {
    expect(resolveType([], "repo")?.name).toBe("repo");
  });

  it("returns undefined for an unknown type with no built-in fallback", () => {
    expect(resolveType([], "nope")).toBeUndefined();
  });
});

describe("zodSchemaForType", () => {
  it("returns the live Zod schema for a built-in type", () => {
    const schema = zodSchemaForType(repoBuiltIn);
    // The original repo schema requires both owner and name.
    expect(schema.safeParse({ owner: "exadev" }).success).toBe(false);
    expect(schema.safeParse({ owner: "exadev", name: "graphle" }).success).toBe(true);
  });

  it("reconstructs a Zod schema from a custom type's jsonSchema", () => {
    const schema = zodSchemaForType(customService);
    expect(schema.safeParse({ name: "api" }).success).toBe(true);
    expect(schema.safeParse({ uptime: 99 }).success).toBe(false);
  });

  it("caches the reconstructed schema by name (referential equality)", () => {
    expect(zodSchemaForType(customService)).toBe(zodSchemaForType(customService));
  });
});
