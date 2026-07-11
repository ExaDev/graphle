import { describe, expect, it } from "vitest";

import { DEFAULT_REPO_ISSUES_FILTERS, DEFAULT_REPO_PULL_REQUESTS_FILTERS } from "./filters";
import {
  canonicalRepoIssuesUrl,
  canonicalRepoPullRequestsUrl,
  parseRepoIssuesFilters,
  parseRepoIssuesUrl,
  parseRepoPullRequestsFilters,
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
  it("rebuilds the bare issues URL with default filters", () => {
    const parsed = { owner: "TeamAcelo", repo: "graphle" };
    expect(canonicalRepoIssuesUrl(parsed, DEFAULT_REPO_ISSUES_FILTERS)).toBe(
      "https://github.com/TeamAcelo/graphle/issues",
    );
  });

  it("encodes non-default filters using graphle's own query params", () => {
    const parsed = { owner: "TeamAcelo", repo: "graphle" };
    const filters = {
      states: ["open", "closed"] as const,
      sort: { field: "created" as const, direction: "asc" as const },
      labels: ["bug", "P1"],
    };
    expect(canonicalRepoIssuesUrl(parsed, filters)).toBe(
      "https://github.com/TeamAcelo/graphle/issues?state=open%2Cclosed&sort=created&direction=asc&labels=bug%2CP1",
    );
  });
});

describe("canonicalRepoPullRequestsUrl", () => {
  it("rebuilds the bare pulls URL with default filters", () => {
    const parsed = { owner: "TeamAcelo", repo: "graphle" };
    expect(canonicalRepoPullRequestsUrl(parsed, DEFAULT_REPO_PULL_REQUESTS_FILTERS)).toBe(
      "https://github.com/TeamAcelo/graphle/pulls",
    );
  });
});

describe("parseRepoIssuesFilters", () => {
  it("returns the defaults when neither own-scheme nor q= params are present", () => {
    const parsed = parseRepoIssuesFilters(
      "https://github.com/TeamAcelo/graphle/issues",
      DEFAULT_REPO_ISSUES_FILTERS,
    );
    expect(parsed).toEqual(DEFAULT_REPO_ISSUES_FILTERS);
  });

  it("round-trips graphle's own query params exactly", () => {
    const url =
      "https://github.com/TeamAcelo/graphle/issues?state=open%2Cclosed&sort=created&direction=asc&labels=bug%2CP1";
    const parsed = parseRepoIssuesFilters(url, DEFAULT_REPO_ISSUES_FILTERS);
    expect(parsed).toEqual({
      states: ["open", "closed"],
      sort: { field: "created", direction: "asc" },
      labels: ["bug", "P1"],
    });
  });

  it("best-effort translates GitHub's q= search DSL", () => {
    const url = "https://github.com/TeamAcelo/graphle/issues?q=sort%3Aupdated-desc+is%3Aopen+label%3Abug";
    const parsed = parseRepoIssuesFilters(url, DEFAULT_REPO_ISSUES_FILTERS);
    expect(parsed).toEqual({
      states: ["open"],
      sort: { field: "updated", direction: "desc" },
      labels: ["bug"],
    });
  });

  it("recognises state:open/closed as well as is:open/closed", () => {
    const url = "https://github.com/TeamAcelo/graphle/issues?q=state%3Aclosed";
    const parsed = parseRepoIssuesFilters(url, DEFAULT_REPO_ISSUES_FILTERS);
    expect(parsed.states).toEqual(["closed"]);
  });

  it("ignores unrecognised q= tokens and falls back to defaults for those fields", () => {
    const url = "https://github.com/TeamAcelo/graphle/issues?q=assignee%3A%40me";
    const parsed = parseRepoIssuesFilters(url, DEFAULT_REPO_ISSUES_FILTERS);
    expect(parsed).toEqual(DEFAULT_REPO_ISSUES_FILTERS);
  });
});

describe("parseRepoPullRequestsFilters", () => {
  it("recognises the merged state, only valid for pull requests", () => {
    const url = "https://github.com/TeamAcelo/graphle/pulls?q=is%3Amerged";
    const parsed = parseRepoPullRequestsFilters(url, DEFAULT_REPO_PULL_REQUESTS_FILTERS);
    expect(parsed.states).toEqual(["merged"]);
  });

  it("round-trips graphle's own query params exactly", () => {
    const url = "https://github.com/TeamAcelo/graphle/pulls?state=merged&sort=created&direction=asc";
    const parsed = parseRepoPullRequestsFilters(url, DEFAULT_REPO_PULL_REQUESTS_FILTERS);
    expect(parsed).toEqual({
      states: ["merged"],
      sort: { field: "created", direction: "asc" },
      labels: [],
    });
  });
});
