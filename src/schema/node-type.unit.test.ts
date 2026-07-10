import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineBuiltInType, NodeTypeDefinitionSchema } from "./node-type";

const validDefinition = {
  name: "service",
  label: "Service",
  color: "grape",
  icon: "IconServer",
  labelField: "name",
  identityFields: ["name"],
  jsonSchema: { type: "object", properties: { name: { type: "string" } } },
};

describe("NodeTypeDefinitionSchema", () => {
  it("accepts a fully populated definition", () => {
    const result = NodeTypeDefinitionSchema.safeParse(validDefinition);
    expect(result.success).toBe(true);
  });

  it("accepts a definition with empty identityFields", () => {
    const result = NodeTypeDefinitionSchema.safeParse({
      ...validDefinition,
      identityFields: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a definition missing the jsonSchema field", () => {
    const result = NodeTypeDefinitionSchema.safeParse({
      name: "service",
      label: "Service",
      color: "grape",
      icon: "IconServer",
      labelField: "name",
      identityFields: ["name"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a definition whose identityFields contains a non-string", () => {
    const result = NodeTypeDefinitionSchema.safeParse({
      ...validDefinition,
      identityFields: ["name", 7],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a definition missing labelField", () => {
    const result = NodeTypeDefinitionSchema.safeParse({
      name: "service",
      label: "Service",
      color: "grape",
      icon: "IconServer",
      identityFields: ["name"],
      jsonSchema: { type: "object" },
    });
    expect(result.success).toBe(false);
  });
});

describe("defineBuiltInType", () => {
  it("derives a JSON Schema from the supplied Zod object schema", () => {
    const type = defineBuiltInType({
      name: "widget",
      label: "Widget",
      color: "indigo",
      icon: "IconBuilding",
      labelField: "name",
      identityFields: ["name"],
      schema: z.object({ name: z.string(), count: z.number().int().optional() }),
    });

    expect(type.name).toBe("widget");
    expect(type.jsonSchema).toMatchObject({
      type: "object",
      properties: { name: { type: "string" } },
    });
    expect(Array.isArray(type.jsonSchema.required)).toBe(true);
    expect(type.jsonSchema.required).toContain("name");
  });

  it("carries the live Zod schema for runtime validation", () => {
    const type = defineBuiltInType({
      name: "widget",
      label: "Widget",
      color: "indigo",
      icon: "IconBuilding",
      labelField: "name",
      identityFields: ["name"],
      schema: z.object({ name: z.string().min(1) }),
    });

    expect(type.schema.safeParse({ name: "x" }).success).toBe(true);
    expect(type.schema.safeParse({ name: "" }).success).toBe(false);
  });

  it("produces a definition that itself parses as a NodeTypeDefinition", () => {
    const type = defineBuiltInType({
      name: "widget",
      label: "Widget",
      color: "indigo",
      icon: "IconBuilding",
      labelField: "name",
      identityFields: ["name"],
      schema: z.object({ name: z.string() }),
    });

    const result = NodeTypeDefinitionSchema.safeParse(type);
    expect(result.success).toBe(true);
  });
});
