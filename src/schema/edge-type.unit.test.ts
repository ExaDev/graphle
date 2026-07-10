import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  defineBuiltInEdgeType,
  EdgeTypeDefinitionSchema,
  toPortableEdgeTypeDefinition,
} from "./edge-type";

const validDefinition = {
  name: "depends-on",
  label: "Depends on",
  color: "red",
  strokeStyle: "dashed",
  labelField: "reason",
  jsonSchema: { type: "object", properties: { reason: { type: "string" } } },
};

describe("EdgeTypeDefinitionSchema", () => {
  it("accepts a fully populated definition", () => {
    const result = EdgeTypeDefinitionSchema.safeParse(validDefinition);
    expect(result.success).toBe(true);
  });

  it("rejects a definition missing the jsonSchema field", () => {
    const result = EdgeTypeDefinitionSchema.safeParse({
      name: "depends-on",
      label: "Depends on",
      color: "red",
      strokeStyle: "dashed",
      labelField: "reason",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a definition with an invalid strokeStyle", () => {
    const result = EdgeTypeDefinitionSchema.safeParse({
      ...validDefinition,
      strokeStyle: "wavy",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a definition missing labelField", () => {
    const result = EdgeTypeDefinitionSchema.safeParse({
      name: "depends-on",
      label: "Depends on",
      color: "red",
      strokeStyle: "dashed",
      jsonSchema: { type: "object" },
    });
    expect(result.success).toBe(false);
  });
});

describe("defineBuiltInEdgeType", () => {
  it("derives a JSON Schema from the supplied Zod object schema", () => {
    const type = defineBuiltInEdgeType({
      name: "widget-link",
      label: "Widget link",
      color: "indigo",
      strokeStyle: "solid",
      labelField: "label",
      schema: z.object({ label: z.string().optional() }),
    });

    expect(type.name).toBe("widget-link");
    expect(type.jsonSchema).toMatchObject({
      type: "object",
      properties: { label: { type: "string" } },
    });
  });

  it("carries the live Zod schema for runtime validation", () => {
    const type = defineBuiltInEdgeType({
      name: "widget-link",
      label: "Widget link",
      color: "indigo",
      strokeStyle: "solid",
      labelField: "reason",
      schema: z.object({ reason: z.string().min(1) }),
    });

    expect(type.schema.safeParse({ reason: "x" }).success).toBe(true);
    expect(type.schema.safeParse({ reason: "" }).success).toBe(false);
  });

  it("produces a definition that itself parses as an EdgeTypeDefinition", () => {
    const type = defineBuiltInEdgeType({
      name: "widget-link",
      label: "Widget link",
      color: "indigo",
      strokeStyle: "solid",
      labelField: "label",
      schema: z.object({ label: z.string().optional() }),
    });

    const result = EdgeTypeDefinitionSchema.safeParse(type);
    expect(result.success).toBe(true);
  });
});

describe("toPortableEdgeTypeDefinition", () => {
  it("drops the live Zod schema, keeping every other field", () => {
    const type = defineBuiltInEdgeType({
      name: "widget-link",
      label: "Widget link",
      color: "indigo",
      strokeStyle: "solid",
      labelField: "label",
      schema: z.object({ label: z.string().optional() }),
    });

    const portable = toPortableEdgeTypeDefinition(type);
    expect(portable).not.toHaveProperty("schema");
    expect(portable).toEqual({
      name: "widget-link",
      label: "Widget link",
      color: "indigo",
      strokeStyle: "solid",
      labelField: "label",
      jsonSchema: type.jsonSchema,
    });
  });
});
