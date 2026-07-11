import { describe, expect, it } from "vitest";

import {
  canonicalRepoIssuesUrl,
  canonicalRepoPullRequestsUrl,
  parseRepoIssuesUrl,
  parseRepoPullRequestsUrl,
} from "./repo-list-url";

describe("parseRepoIssuesUrl", () => {
  it("parses a repo issues URL with no query string", () => {
    expect(parseRepoIssuesUrl("https://github.com/TeamAcelo/graphle/issues")).toEqual({
      owner: "TeamAcelo",
      repo: "graphle",
    });
  });

  it("discards a ?q=... search/sort/filter query string", () => {
    const url = "https://github.com/TeamAcelo/graphle/issues?q=is%3Aopen+label%3Abug";
    expect(parseRepoIssuesUrl(url)).toEqual({ owner: "TeamAcelo", repo: "graphle" });
  });

  it("returns undefined for a single-issue page", () => {
    expect(parseRepoIssuesUrl("https://github.com/TeamAcelo/graphle/issues/42")).toBeUndefined();
  });

  it("returns undefined for a gist URL", () => {
    expect(
      parseRepoIssuesUrl("https://gist.github.com/Mearman/454a3b1ab947648baff720ec35cfd4e5"),
    ).toBeUndefined();
  });

  it("returns undefined for a Projects URL", () => {
    expect(
      parseRepoIssuesUrl("https://github.com/orgs/TeamAcelo/projects/1"),
    ).toBeUndefined();
  });

  it("returns undefined for a repo file (blob) URL", () => {
    expect(
      parseRepoIssuesUrl("https://github.com/TeamAcelo/graphle/blob/main/README.md"),
    ).toBeUndefined();
  });
});

describe("parseRepoPullRequestsUrl", () => {
  it("parses a repo pull-requests URL with no query string", () => {
    expect(parseRepoPullRequestsUrl("https://github.com/TeamAcelo/graphle/pulls")).toEqual({
      owner: "TeamAcelo",
      repo: "graphle",
    });
  });

  it("discards a ?q=... search/sort/filter query string", () => {
    const url = "https://github.com/TeamAcelo/graphle/pulls?q=is%3Aopen+review%3Aapproved";
    expect(parseRepoPullRequestsUrl(url)).toEqual({ owner: "TeamAcelo", repo: "graphle" });
  });

  it("returns undefined for a single-PR page", () => {
    expect(parseRepoPullRequestsUrl("https://github.com/TeamAcelo/graphle/pulls/7")).toBeUndefined();
  });

  it("returns undefined for a gist URL", () => {
    expect(
      parseRepoPullRequestsUrl("https://gist.github.com/Mearman/454a3b1ab947648baff720ec35cfd4e5"),
    ).toBeUndefined();
  });

  it("returns undefined for a Projects URL", () => {
    expect(
      parseRepoPullRequestsUrl("https://github.com/orgs/TeamAcelo/projects/1"),
    ).toBeUndefined();
  });

  it("returns undefined for a repo file (blob) URL", () => {
    expect(
      parseRepoPullRequestsUrl("https://github.com/TeamAcelo/graphle/blob/main/README.md"),
    ).toBeUndefined();
  });
});

describe("canonicalRepoIssuesUrl", () => {
  it("rebuilds the bare issues URL from a parsed result, round-tripping a filtered URL", () => {
    const url = "https://github.com/TeamAcelo/graphle/issues?q=is%3Aopen+label%3Abug";
    const parsed = parseRepoIssuesUrl(url);
    if (parsed === undefined) throw new Error("expected a parsed result");
    expect(canonicalRepoIssuesUrl(parsed)).toBe("https://github.com/TeamAcelo/graphle/issues");
  });
});

describe("canonicalRepoPullRequestsUrl", () => {
  it("rebuilds the bare pulls URL from a parsed result, round-tripping a filtered URL", () => {
    const url = "https://github.com/TeamAcelo/graphle/pulls?q=is%3Aopen+review%3Aapproved";
    const parsed = parseRepoPullRequestsUrl(url);
    if (parsed === undefined) throw new Error("expected a parsed result");
    expect(canonicalRepoPullRequestsUrl(parsed)).toBe("https://github.com/TeamAcelo/graphle/pulls");
  });
});
