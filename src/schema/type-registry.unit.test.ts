import { describe, expect, it } from "vitest";

import { BUILT_IN_EDGE_TYPES_BY_NAME } from "./built-in-edge-types";
import { BUILT_IN_TYPES_BY_NAME } from "./built-in-types";
import type { EdgeTypeDefinition } from "./edge-type";
import type { NodeTypeDefinition } from "./node-type";
import {
  resolveEdgeType,
  resolveType,
  zodSchemaForEdgeType,
  zodSchemaForType,
} from "./type-registry";

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

const ownsBuiltIn = BUILT_IN_EDGE_TYPES_BY_NAME.get("owns");
if (ownsBuiltIn === undefined) throw new Error("fixture: owns built-in must exist");

/** A custom edge type definition whose jsonSchema is independent of the registry. */
const customDependsOn: EdgeTypeDefinition = {
  name: "depends-on",
  label: "Depends on",
  color: "red",
  strokeStyle: "dashed",
  labelField: "reason",
  jsonSchema: {
    type: "object",
    properties: { reason: { type: "string" }, weight: { type: "number" } },
    required: ["reason"],
    additionalProperties: false,
  },
};

describe("resolveEdgeType", () => {
  it("prefers a document-carried definition over the built-in registry", () => {
    const override: EdgeTypeDefinition = {
      name: "owns",
      label: "Custom Owns",
      color: "red",
      strokeStyle: "dotted",
      labelField: "label",
      jsonSchema: { type: "object" },
    };
    expect(resolveEdgeType([override], "owns")?.label).toBe("Custom Owns");
  });

  it("falls back to the built-in registry when the document has no match", () => {
    expect(resolveEdgeType([], "owns")?.name).toBe("owns");
  });

  it("returns undefined for an unknown type with no built-in fallback", () => {
    expect(resolveEdgeType([], "nope")).toBeUndefined();
  });
});

describe("zodSchemaForEdgeType", () => {
  it("returns the live Zod schema for a built-in type", () => {
    const schema = zodSchemaForEdgeType(ownsBuiltIn);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ label: "x" }).success).toBe(true);
    expect(schema.safeParse({ label: 1 }).success).toBe(false);
  });

  it("reconstructs a Zod schema from a custom type's jsonSchema", () => {
    const schema = zodSchemaForEdgeType(customDependsOn);
    expect(schema.safeParse({ reason: "build order" }).success).toBe(true);
    expect(schema.safeParse({ weight: 1 }).success).toBe(false);
  });

  it("caches the reconstructed schema by name (referential equality)", () => {
    expect(zodSchemaForEdgeType(customDependsOn)).toBe(zodSchemaForEdgeType(customDependsOn));
  });
});
