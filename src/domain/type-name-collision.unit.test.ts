import { describe, expect, it } from "vitest";

import type { EdgeTypeDefinition, NodeTypeDefinition } from "../schema";

import { edgeTypeNameTaken, nodeTypeNameTaken } from "./type-name-collision";

/** A document-authored node type, independent of the built-in registry. */
const customService: NodeTypeDefinition = {
  name: "my-service",
  label: "Service",
  color: "grape",
  icon: "IconServer",
  labelField: "name",
  identityFields: ["name"],
  jsonSchema: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  },
};

/** A document-authored edge type, independent of the built-in registry. */
const customDependsOn: EdgeTypeDefinition = {
  name: "depends-on",
  label: "Depends on",
  color: "blue",
  strokeStyle: "solid",
  labelField: "note",
  jsonSchema: {
    type: "object",
    properties: { note: { type: "string" } },
    required: [],
    additionalProperties: false,
  },
};

describe("nodeTypeNameTaken", () => {
  it("is true for a name matching a document type", () => {
    expect(nodeTypeNameTaken("my-service", [customService])).toBe(true);
  });

  it("is true for a name matching a built-in type", () => {
    expect(nodeTypeNameTaken("repo", [customService])).toBe(true);
  });

  it("is false for a name matching neither", () => {
    expect(nodeTypeNameTaken("unused-name", [customService])).toBe(false);
  });

  it("is case-sensitive, exact string match", () => {
    expect(nodeTypeNameTaken("Repo", [customService])).toBe(false);
    expect(nodeTypeNameTaken("My-Service", [customService])).toBe(false);
  });
});

describe("edgeTypeNameTaken", () => {
  it("is true for a name matching a document edge type", () => {
    expect(edgeTypeNameTaken("depends-on", [customDependsOn])).toBe(true);
  });

  it("is true for a name matching a built-in edge type", () => {
    expect(edgeTypeNameTaken("owns", [customDependsOn])).toBe(true);
  });

  it("is false for a name matching neither", () => {
    expect(edgeTypeNameTaken("unused-name", [customDependsOn])).toBe(false);
  });

  it("is case-sensitive, exact string match", () => {
    expect(edgeTypeNameTaken("Owns", [customDependsOn])).toBe(false);
    expect(edgeTypeNameTaken("Depends-On", [customDependsOn])).toBe(false);
  });
});
