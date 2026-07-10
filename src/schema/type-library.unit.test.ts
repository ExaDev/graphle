import { describe, expect, it } from "vitest";

import { TypeLibraryDocument } from "./type-library";

const nodeType = {
  name: "service",
  label: "Service",
  color: "grape",
  icon: "IconServer",
  labelField: "name",
  identityFields: ["name"],
  jsonSchema: { type: "object", properties: { name: { type: "string" } } },
};

const edgeType = {
  name: "depends-on",
  label: "Depends on",
  color: "red",
  strokeStyle: "dashed",
  labelField: "reason",
  jsonSchema: { type: "object", properties: { reason: { type: "string" } } },
};

describe("TypeLibraryDocument", () => {
  it("accepts a document with node and edge types", () => {
    const result = TypeLibraryDocument.safeParse({
      version: 1,
      nodeTypes: [nodeType],
      edgeTypes: [edgeType],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a document with empty type arrays", () => {
    const result = TypeLibraryDocument.safeParse({
      version: 1,
      nodeTypes: [],
      edgeTypes: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a document with the wrong version", () => {
    const result = TypeLibraryDocument.safeParse({
      version: 2,
      nodeTypes: [],
      edgeTypes: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a document with a malformed node type", () => {
    const result = TypeLibraryDocument.safeParse({
      version: 1,
      nodeTypes: [{ name: "service" }],
      edgeTypes: [],
    });
    expect(result.success).toBe(false);
  });
});
