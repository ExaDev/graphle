import { describe, expect, it } from "vitest";

import { BUILT_IN_TYPES, type GraphNode, type NodeTypeDefinition } from "../schema";

import { nodeIdentityKey } from "./identity";

const position = { x: 0, y: 0 };

/** The built-in types as a document would carry them (portable form). */
const types: NodeTypeDefinition[] = BUILT_IN_TYPES.map((type) => ({
  name: type.name,
  label: type.label,
  color: type.color,
  icon: type.icon,
  labelField: type.labelField,
  identityFields: type.identityFields,
  jsonSchema: type.jsonSchema,
}));

function node(type: string, data: GraphNode["data"]): GraphNode {
  return { id: crypto.randomUUID(), type, position, data };
}

describe("nodeIdentityKey", () => {
  it("returns undefined for a type whose identityFields is empty", () => {
    expect(nodeIdentityKey(node("freeform", { label: "A note" }), types)).toBeUndefined();
  });

  it("returns an org key based on the login (single identity field)", () => {
    expect(nodeIdentityKey(node("org", { login: "exadev" }), types)).toBe("org:exadev");
  });

  it("lowercases an org key so case variants collapse together", () => {
    expect(nodeIdentityKey(node("org", { login: "ExaDev" }), types)).toBe("org:exadev");
  });

  it("joins multiple identity fields with '/' for a repo", () => {
    expect(
      nodeIdentityKey(node("repo", { owner: "exadev", name: "graphle" }), types),
    ).toBe("repo:exadev/graphle");
  });

  it("lowercases every segment of a multi-field key", () => {
    expect(
      nodeIdentityKey(node("repo", { owner: "ExaDev", name: "Graphle" }), types),
    ).toBe("repo:exadev/graphle");
  });

  it("renders a numeric identity field via String()", () => {
    expect(
      nodeIdentityKey(
        node("issue", { owner: "exadev", repo: "graphle", number: 42, title: "Bug" }),
        types,
      ),
    ).toBe("issue:exadev/graphle/42");
  });

  it("returns undefined for a type that cannot be resolved", () => {
    expect(
      nodeIdentityKey(node("custom", { name: "x" }), types),
    ).toBeUndefined();
  });

  it("returns undefined for a custom type whose identityFields is empty", () => {
    const customTypes: NodeTypeDefinition[] = [
      ...types,
      {
        name: "custom",
        label: "Custom",
        color: "gray",
        icon: "IconDot",
        labelField: "name",
        identityFields: [],
        jsonSchema: { type: "object", properties: { name: { type: "string" } } },
      },
    ];
    expect(nodeIdentityKey(node("custom", { name: "x" }), customTypes)).toBeUndefined();
  });

  it("builds a key from a custom type's identityFields", () => {
    const customTypes: NodeTypeDefinition[] = [
      ...types,
      {
        name: "custom",
        label: "Custom",
        color: "gray",
        icon: "IconDot",
        labelField: "name",
        identityFields: ["name"],
        jsonSchema: { type: "object", properties: { name: { type: "string" } } },
      },
    ];
    expect(nodeIdentityKey(node("custom", { name: "Widget" }), customTypes)).toBe(
      "custom:widget",
    );
  });
});
