import { describe, expect, it } from "vitest";

import { canonicalGithubFileUrl, parseGithubFileUrl } from "./github-file-url";

describe("parseGithubFileUrl", () => {
  it("parses a github.com blob URL", () => {
    expect(
      parseGithubFileUrl("https://github.com/TeamAcelo/graphle/blob/main/src/schema/index.ts"),
    ).toEqual({
      owner: "TeamAcelo",
      repo: "graphle",
      branch: "main",
      path: "src/schema/index.ts",
    });
  });

  it("parses a raw.githubusercontent.com URL with the refs/heads/ prefix", () => {
    expect(
      parseGithubFileUrl(
        "https://raw.githubusercontent.com/TeamAcelo/graphle/refs/heads/main/src/schema/index.ts",
      ),
    ).toEqual({
      owner: "TeamAcelo",
      repo: "graphle",
      branch: "main",
      path: "src/schema/index.ts",
    });
  });

  it("parses a raw.githubusercontent.com URL without the refs/heads/ prefix", () => {
    expect(
      parseGithubFileUrl(
        "https://raw.githubusercontent.com/TeamAcelo/graphle/main/src/schema/index.ts",
      ),
    ).toEqual({
      owner: "TeamAcelo",
      repo: "graphle",
      branch: "main",
      path: "src/schema/index.ts",
    });
  });

  it("strips a trailing query string before matching", () => {
    expect(
      parseGithubFileUrl(
        "https://github.com/TeamAcelo/graphle/blob/main/src/schema/index.ts?plain=1",
      ),
    ).toEqual({
      owner: "TeamAcelo",
      repo: "graphle",
      branch: "main",
      path: "src/schema/index.ts",
    });
  });

  it("strips a trailing fragment before matching", () => {
    expect(
      parseGithubFileUrl(
        "https://github.com/TeamAcelo/graphle/blob/main/src/schema/index.ts#L10-L20",
      ),
    ).toEqual({
      owner: "TeamAcelo",
      repo: "graphle",
      branch: "main",
      path: "src/schema/index.ts",
    });
  });

  it("returns undefined for a gist URL", () => {
    expect(
      parseGithubFileUrl("https://gist.github.com/Mearman/454a3b1ab947648baff720ec35cfd4e5"),
    ).toBeUndefined();
  });

  it("returns undefined for a GitHub Projects URL", () => {
    expect(parseGithubFileUrl("https://github.com/orgs/TeamAcelo/projects/1")).toBeUndefined();
  });

  it("returns undefined for a GitHub issues page", () => {
    expect(parseGithubFileUrl("https://github.com/TeamAcelo/graphle/issues/1")).toBeUndefined();
  });

  it("returns undefined for an unrelated URL", () => {
    expect(parseGithubFileUrl("https://example.com/graph.json")).toBeUndefined();
  });
});

describe("canonicalGithubFileUrl", () => {
  it("round-trips a parsed blob URL back to the github.com/.../blob/... form", () => {
    const parsed = parseGithubFileUrl(
      "https://github.com/TeamAcelo/graphle/blob/main/src/schema/index.ts",
    );
    expect(parsed).toBeDefined();
    if (parsed === undefined) return;
    expect(canonicalGithubFileUrl(parsed)).toBe(
      "https://github.com/TeamAcelo/graphle/blob/main/src/schema/index.ts",
    );
  });

  it("round-trips a parsed raw URL to the same canonical github.com/.../blob/... form", () => {
    const parsed = parseGithubFileUrl(
      "https://raw.githubusercontent.com/TeamAcelo/graphle/refs/heads/main/src/schema/index.ts",
    );
    expect(parsed).toBeDefined();
    if (parsed === undefined) return;
    expect(canonicalGithubFileUrl(parsed)).toBe(
      "https://github.com/TeamAcelo/graphle/blob/main/src/schema/index.ts",
    );
  });
});
