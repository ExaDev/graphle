import { describe, expect, it } from "vitest";

import { canonicalProjectUrl, parseProjectUrl } from "./project-url";

describe("parseProjectUrl", () => {
  it("parses an org-owned project URL", () => {
    expect(parseProjectUrl("https://github.com/orgs/TeamAcelo/projects/1")).toEqual({
      ownerType: "org",
      login: "TeamAcelo",
      number: 1,
    });
  });

  it("parses a user-owned project URL", () => {
    expect(parseProjectUrl("https://github.com/users/octocat/projects/42")).toEqual({
      ownerType: "user",
      login: "octocat",
      number: 42,
    });
  });

  it("discards a trailing /views/{N} segment", () => {
    expect(parseProjectUrl("https://github.com/orgs/TeamAcelo/projects/1/views/4")).toEqual({
      ownerType: "org",
      login: "TeamAcelo",
      number: 1,
    });
  });

  it("discards a trailing query string (the view filter/sort DSL)", () => {
    const url =
      "https://github.com/orgs/TeamAcelo/projects/1/views/4?query=sort%3Aupdated-desc+state%3Aopen";
    expect(parseProjectUrl(url)).toEqual({ ownerType: "org", login: "TeamAcelo", number: 1 });
  });

  it("discards a trailing query string using the filterQuery param name", () => {
    const url = "https://github.com/orgs/TeamAcelo/projects/1/views/5?filterQuery=assignee%3A%40me";
    expect(parseProjectUrl(url)).toEqual({ ownerType: "org", login: "TeamAcelo", number: 1 });
  });

  it("discards a query string with no views segment", () => {
    expect(parseProjectUrl("https://github.com/orgs/TeamAcelo/projects/1?query=is%3Aopen")).toEqual({
      ownerType: "org",
      login: "TeamAcelo",
      number: 1,
    });
  });

  it("returns undefined for a repo URL", () => {
    expect(parseProjectUrl("https://github.com/TeamAcelo/some-repo")).toBeUndefined();
  });

  it("returns undefined for a gist URL", () => {
    expect(
      parseProjectUrl("https://gist.github.com/Mearman/454a3b1ab947648baff720ec35cfd4e5"),
    ).toBeUndefined();
  });

  it("returns undefined for a non-numeric project id", () => {
    expect(parseProjectUrl("https://github.com/orgs/TeamAcelo/projects/abc")).toBeUndefined();
  });

  it("returns undefined for a project URL missing the owner-type segment", () => {
    expect(parseProjectUrl("https://github.com/TeamAcelo/projects/1")).toBeUndefined();
  });

  it("returns undefined for an unrelated URL", () => {
    expect(parseProjectUrl("https://example.com/graph.json")).toBeUndefined();
  });
});

describe("canonicalProjectUrl", () => {
  it("rebuilds the stripped project URL from a parsed org-owned project", () => {
    expect(canonicalProjectUrl({ ownerType: "org", login: "TeamAcelo", number: 1 })).toBe(
      "https://github.com/orgs/TeamAcelo/projects/1",
    );
  });

  it("rebuilds the stripped project URL from a parsed user-owned project", () => {
    expect(canonicalProjectUrl({ ownerType: "user", login: "octocat", number: 42 })).toBe(
      "https://github.com/users/octocat/projects/42",
    );
  });
});
