import { describe, expect, it } from "vitest";

import { GraphNode } from "../schema";

import { nodeIdentityKey } from "./identity";

const position = { x: 0, y: 0 };

describe("nodeIdentityKey", () => {
  it("returns undefined for freeform nodes", () => {
    const node = GraphNode.parse({
      id: crypto.randomUUID(),
      kind: "freeform",
      position,
      data: { label: "A note" },
    });
    expect(nodeIdentityKey(node)).toBeUndefined();
  });

  it("returns an org key based on the login", () => {
    const node = GraphNode.parse({
      id: crypto.randomUUID(),
      kind: "org",
      position,
      data: { login: "exadev" },
    });
    expect(nodeIdentityKey(node)).toBe("org:exadev");
  });

  it("lowercases an org key so case variants collapse together", () => {
    const node = GraphNode.parse({
      id: crypto.randomUUID(),
      kind: "org",
      position,
      data: { login: "ExaDev" },
    });
    expect(nodeIdentityKey(node)).toBe("org:exadev");
  });

  it("returns a repo key based on owner and name", () => {
    const node = GraphNode.parse({
      id: crypto.randomUUID(),
      kind: "repo",
      position,
      data: { owner: "exadev", name: "graphle" },
    });
    expect(nodeIdentityKey(node)).toBe("repo:exadev/graphle");
  });

  it("lowercases a repo key including both segments", () => {
    const node = GraphNode.parse({
      id: crypto.randomUUID(),
      kind: "repo",
      position,
      data: { owner: "ExaDev", name: "Graphle" },
    });
    expect(nodeIdentityKey(node)).toBe("repo:exadev/graphle");
  });

  it("returns an issue key rendering the number with String()", () => {
    const node = GraphNode.parse({
      id: crypto.randomUUID(),
      kind: "issue",
      position,
      data: { owner: "exadev", repo: "graphle", number: 42, title: "Bug" },
    });
    expect(nodeIdentityKey(node)).toBe("issue:exadev/graphle#42");
  });

  it("returns a project key rendering the number with String()", () => {
    const node = GraphNode.parse({
      id: crypto.randomUUID(),
      kind: "project",
      position,
      data: { owner: "exadev", number: 7, title: "Roadmap" },
    });
    expect(nodeIdentityKey(node)).toBe("project:exadev/7");
  });
});
