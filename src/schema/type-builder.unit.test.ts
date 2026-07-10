import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildJsonSchemaFromFields,
  fieldsFromJsonSchema,
  type FieldDefinition,
  type JsonObject,
} from "./type-builder";

/**
 * Narrows `unknown` to a string-indexed record without a cast (the same guard
 * the rendering layer uses to read a JSON Schema's `properties`).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("buildJsonSchemaFromFields", () => {
  it("produces a strict object schema with every field required", () => {
    const fields: FieldDefinition[] = [
      { name: "title", type: "string" },
      { name: "count", type: "number" },
      { name: "active", type: "boolean" },
      { name: "status", type: "enum", options: ["running", "stopped"] },
    ];

    const schema: JsonObject = buildJsonSchemaFromFields(fields);

    expect(schema["type"]).toBe("object");
    expect(schema["additionalProperties"]).toBe(false);

    const required = schema["required"];
    expect(Array.isArray(required)).toBe(true);
    expect(required).toEqual(["title", "count", "active", "status"]);
  });

  it("maps each field type to the correct JSON Schema subschema", () => {
    const schema = buildJsonSchemaFromFields([
      { name: "name", type: "string" },
      { name: "age", type: "number" },
      { name: "alive", type: "boolean" },
      { name: "kind", type: "enum", options: ["a", "b"] },
    ]);

    const properties = schema["properties"];
    if (!isRecord(properties)) throw new Error("properties missing");
    const name = properties["name"];
    const age = properties["age"];
    const alive = properties["alive"];
    const kind = properties["kind"];
    if (!isRecord(name) || !isRecord(age) || !isRecord(alive) || !isRecord(kind)) {
      throw new Error("subschema missing");
    }

    expect(name["type"]).toBe("string");
    expect(age["type"]).toBe("number");
    expect(alive["type"]).toBe("boolean");
    expect(kind["type"]).toBe("string");
    expect(kind["enum"]).toEqual(["a", "b"]);
  });

  it("round-trips through z.fromJSONSchema, validating data like a real type", () => {
    const jsonSchema = buildJsonSchemaFromFields([
      { name: "name", type: "string" },
      { name: "status", type: "enum", options: ["running", "stopped"] },
    ]);

    const zodSchema = z.fromJSONSchema(jsonSchema);

    expect(zodSchema.safeParse({ name: "api", status: "running" }).success).toBe(true);
    // Missing a required field fails.
    expect(zodSchema.safeParse({ status: "running" }).success).toBe(false);
    // An enum value outside the options fails.
    expect(zodSchema.safeParse({ name: "api", status: "nope" }).success).toBe(false);
    // An additional property fails (the schema is strict).
    expect(zodSchema.safeParse({ name: "api", status: "running", extra: 1 }).success)
      .toBe(false);
  });

  it("throws when an enum field declares no options", () => {
    expect(() =>
      buildJsonSchemaFromFields([
        { name: "name", type: "string" },
        { name: "kind", type: "enum", options: [] },
      ]),
    ).toThrow();
  });

  it("throws when an enum field omits options entirely", () => {
    expect(() =>
      buildJsonSchemaFromFields([{ name: "kind", type: "enum" }]),
    ).toThrow();
  });
});

describe("fieldsFromJsonSchema", () => {
  it("round-trips every field type through buildJsonSchemaFromFields", () => {
    const original: FieldDefinition[] = [
      { name: "title", type: "string" },
      { name: "count", type: "number" },
      { name: "active", type: "boolean" },
      { name: "status", type: "enum", options: ["running", "stopped"] },
    ];

    const recovered = fieldsFromJsonSchema(buildJsonSchemaFromFields(original));

    expect(recovered).toEqual(original);
  });

  it("preserves field order", () => {
    const original: FieldDefinition[] = [
      { name: "third", type: "boolean" },
      { name: "first", type: "string" },
      { name: "second", type: "number" },
    ];

    const recovered = fieldsFromJsonSchema(buildJsonSchemaFromFields(original));

    expect(recovered.map((field) => field.name)).toEqual([
      "third",
      "first",
      "second",
    ]);
  });

  it("returns an empty list for a JSON Schema with no properties", () => {
    expect(fieldsFromJsonSchema({})).toEqual([]);
    expect(fieldsFromJsonSchema({ type: "object" })).toEqual([]);
  });
});
