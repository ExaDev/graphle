import { describe, expect, it } from "vitest";

import type { TypeLibraryDocument } from "../schema";

import { decodeTypeLibraryFromJson, serialiseTypeLibrary } from "./type-library-json";

const library: TypeLibraryDocument = {
  version: 1,
  nodeTypes: [
    {
      name: "service",
      label: "Service",
      color: "grape",
      icon: "IconServer",
      labelField: "name",
      identityFields: ["name"],
      jsonSchema: { type: "object", properties: { name: { type: "string" } } },
    },
  ],
  edgeTypes: [
    {
      name: "depends-on",
      label: "Depends on",
      color: "red",
      strokeStyle: "dashed",
      labelField: "reason",
      jsonSchema: { type: "object", properties: { reason: { type: "string" } } },
    },
  ],
};

describe("serialiseTypeLibrary", () => {
  it("pretty-prints the library as JSON that round-trips through decodeTypeLibraryFromJson", () => {
    const json = serialiseTypeLibrary(library);
    expect(json).toContain("\n");
    expect(decodeTypeLibraryFromJson(JSON.parse(json))).toEqual(library);
  });
});

describe("decodeTypeLibraryFromJson", () => {
  it("parses a valid type library document", () => {
    expect(decodeTypeLibraryFromJson(JSON.parse(JSON.stringify(library)))).toEqual(library);
  });

  it("throws on a document with the wrong version", () => {
    expect(() =>
      decodeTypeLibraryFromJson({ version: 2, nodeTypes: [], edgeTypes: [] }),
    ).toThrow();
  });

  it("throws on a document with a malformed node type", () => {
    expect(() =>
      decodeTypeLibraryFromJson({
        version: 1,
        nodeTypes: [{ name: "service" }],
        edgeTypes: [],
      }),
    ).toThrow();
  });

  it("throws on input that is not an object", () => {
    expect(() => decodeTypeLibraryFromJson("not an object")).toThrow();
  });
});
