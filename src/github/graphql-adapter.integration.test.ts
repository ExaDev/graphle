import { describe, expect, it } from "vitest";

import { DEFAULT_REPO_ISSUES_FILTERS, DEFAULT_REPO_PULL_REQUESTS_FILTERS } from "./filters";
import { createGitHubClient } from "./graphql-adapter";

/**
 * Hits the real GitHub GraphQL API with a real token — not a mock. Runs once
 * per configured token type (classic, fine-grained), since graphle supports
 * both and they have different scope models (see `GitHubPanel.tsx`'s own
 * scope guidance). Skipped entirely wherever neither `GH_TEST_PAT_CLASSIC`
 * nor `GH_TEST_PAT_FINE_GRAINED` is set (a developer without a local `.env`,
 * or the existing mocked-only CI `test` job); runs for real, for whichever
 * of the two is configured, in the dedicated CI job that supplies the
 * secrets, and locally once `.env` is set up (see `.env.example`). Named
 * `GH_` rather than `GITHUB_` because GitHub Actions rejects any repository
 * secret name starting with `GITHUB_` (reserved for its own built-ins).
 *
 * A token counts as "configured" only when non-empty: GitHub Actions always
 * sets an `env:` var sourced from `secrets.X`, as an empty string rather
 * than leaving it unset, when the secret doesn't exist — treating merely
 * "defined" as configured would attempt a doomed empty-token request instead
 * of skipping.
 *
 * Assertions are deliberately independent of the token's own org
 * memberships — `viewer` resolves whoever the token belongs to, and
 * `octocat/Hello-World` is GitHub's own stable, public, canonical demo repo,
 * readable by both token types with no elevated scope — so this stays
 * low-flake regardless of which account or token type issued it.
 */
const TOKEN_TYPES = [
  { label: "classic", token: process.env.GH_TEST_PAT_CLASSIC },
  { label: "fine-grained", token: process.env.GH_TEST_PAT_FINE_GRAINED },
].filter(
  (entry): entry is { label: string; token: string } =>
    entry.token !== undefined && entry.token !== "",
);

describe.skipIf(TOKEN_TYPES.length === 0)("GitHub API integration", () => {
  describe.each(TOKEN_TYPES)("with a $label token", ({ token }) => {
    it("resolves the authenticated viewer", async () => {
      const client = createGitHubClient({ token });
      const viewer = await client.viewer(new AbortController().signal);
      expect(viewer.login.length).toBeGreaterThan(0);
    });

    it("resolves a known public repository", async () => {
      const client = createGitHubClient({ token });
      const repo = await client.getRepo("octocat", "Hello-World", new AbortController().signal);
      expect(repo.name).toBe("Hello-World");
      expect(repo.owner.login).toBe("octocat");
    });
  });
});

/**
 * `searchAccounts` specifically needs the `read:org` scope (confirmed via a
 * real CI failure: "The 'login' field requires one of the following scopes:
 * ['read:org']"), which `GH_TEST_PAT_CLASSIC` deliberately doesn't carry — it
 * was scoped to nothing at all, since ordinary public-repo reads need no
 * scope. `GH_TEST_PAT_FINE_GRAINED` already covers it (fine-grained tokens
 * aren't subject to this classic-scope check), so account search is
 * exercised there rather than widening the classic token — the same
 * asymmetric-by-design coverage the private-token block below already
 * documents. Account search never touches private data, so this belongs on
 * the public token pool; octocat is GitHub's own stable, public, well-known
 * account, matching this file's low-flake convention.
 */
const ACCOUNT_SEARCH_TOKEN_TYPES = TOKEN_TYPES.filter((entry) => entry.label === "fine-grained");

describe.skipIf(ACCOUNT_SEARCH_TOKEN_TYPES.length === 0)("GitHub API integration - account search", () => {
  describe.each(ACCOUNT_SEARCH_TOKEN_TYPES)("with a $label token", ({ token }) => {
    it("searches accounts, finding octocat", async () => {
      const client = createGitHubClient({ token });
      const page = await client.searchAccounts("octocat", undefined, new AbortController().signal);
      expect(page.items.some((account) => account.login === "octocat")).toBe(true);
    });
  });
});

/**
 * Private-repo access, using SEPARATE tokens from `TOKEN_TYPES` above
 * (`GH_TEST_PAT_CLASSIC_PRIVATE`/`GH_TEST_PAT_FINE_GRAINED_PRIVATE`) rather
 * than widening those — the public-access tokens stay minimally scoped, and
 * these more-privileged ones are dedicated to reading two otherwise-unused
 * fixture repos created solely for this purpose
 * (`Mearman/graphle-test-private`, `ExaDev/graphle-test-private`). Each
 * fixture repo has: three issues (a parent with a sub-issue, and a third
 * issue the parent blocks), two pull requests (#5 stacked on #4 — #5's base
 * branch is #4's head branch, for testing stacked-PR detection), and a
 * Projects v2 board (linked to the repo) with two of the issues added as
 * items.
 *
 * Coverage is asymmetric by design, not oversight: a fine-grained token can
 * only target one resource owner, so `GH_TEST_PAT_FINE_GRAINED_PRIVATE` is
 * scoped to the ExaDev org only (the more product-relevant case — see
 * `GitHubPanel.tsx`'s note that fine-grained tokens can't read a personal
 * account's own Projects boards) — `ownerType: "user"`-only checks (like
 * `getUserProject`) are skipped for it via the `it.each` filter on each
 * token's own `fixtures` list, not a separate guard. `GH_TEST_PAT_CLASSIC_PRIVATE`'s
 * `repo`/`read:project` scopes aren't owner-restricted, so it covers both
 * fixture repos and both project types.
 *
 * Both private tokens need explicit repository permissions beyond the
 * auto-included Metadata-only default that's enough for public access (see
 * `.env.example` for the full story of how that was confirmed): Contents
 * (to read the repo at all), Issues, and Pull requests; the fine-grained
 * token additionally needs the organization-level Projects permission for
 * `getOrgProject`/`listOrgProjects`.
 */
type PrivateFixture = {
  owner: string;
  repo: string;
  ownerType: "user" | "org";
  parentIssue: number;
  subIssue: number;
  blockedIssue: number;
  pr: number;
  stackedPr: number;
  projectNumber: number;
  projectNodeId: string;
};

const MEARMAN_FIXTURE: PrivateFixture = {
  owner: "Mearman",
  repo: "graphle-test-private",
  ownerType: "user",
  parentIssue: 1,
  subIssue: 2,
  blockedIssue: 3,
  pr: 4,
  stackedPr: 5,
  projectNumber: 8,
  projectNodeId: "PVT_kwHOABRSoM4BdIcn",
};

const EXADEV_FIXTURE: PrivateFixture = {
  owner: "ExaDev",
  repo: "graphle-test-private",
  ownerType: "org",
  parentIssue: 1,
  subIssue: 2,
  blockedIssue: 3,
  pr: 4,
  stackedPr: 5,
  projectNumber: 13,
  projectNodeId: "PVT_kwDOCFoIAs4BdIco",
};

const PRIVATE_TOKEN_TYPES = [
  {
    label: "classic",
    token: process.env.GH_TEST_PAT_CLASSIC_PRIVATE,
    fixtures: [MEARMAN_FIXTURE, EXADEV_FIXTURE],
  },
  {
    label: "fine-grained",
    token: process.env.GH_TEST_PAT_FINE_GRAINED_PRIVATE,
    fixtures: [EXADEV_FIXTURE],
  },
].filter(
  (entry): entry is { label: string; token: string; fixtures: PrivateFixture[] } =>
    entry.token !== undefined && entry.token !== "",
);

describe.skipIf(PRIVATE_TOKEN_TYPES.length === 0)("GitHub API integration - private repos, issues, PRs", () => {
  describe.each(PRIVATE_TOKEN_TYPES)("with a $label token", ({ token, fixtures }) => {
    it.each(fixtures)("resolves the private repository $owner/$repo", async ({ owner, repo }) => {
      const client = createGitHubClient({ token });
      const result = await client.getRepo(owner, repo, new AbortController().signal);
      expect(result.name).toBe(repo);
      expect(result.owner.login).toBe(owner);
    });

    it.each(fixtures)("lists issues for $owner/$repo", async ({ owner, repo }) => {
      const client = createGitHubClient({ token });
      const page = await client.listRepoIssues(
        owner,
        repo,
        undefined,
        DEFAULT_REPO_ISSUES_FILTERS,
        new AbortController().signal,
      );
      expect(page.items.length).toBeGreaterThanOrEqual(3);
    });

    it.each(fixtures)("lists pull requests for $owner/$repo", async ({ owner, repo }) => {
      const client = createGitHubClient({ token });
      const page = await client.listRepoPullRequests(
        owner,
        repo,
        undefined,
        DEFAULT_REPO_PULL_REQUESTS_FILTERS,
        new AbortController().signal,
      );
      expect(page.items.length).toBeGreaterThanOrEqual(1);
    });

    it.each(fixtures)(
      "resolves the stacked PR relationship for $owner/$repo",
      async ({ owner, repo, pr, stackedPr }) => {
        const client = createGitHubClient({ token });
        const page = await client.listRepoPullRequests(
          owner,
          repo,
          undefined,
          DEFAULT_REPO_PULL_REQUESTS_FILTERS,
          new AbortController().signal,
        );
        const base = page.items.find((item) => item.number === pr);
        const stacked = page.items.find((item) => item.number === stackedPr);
        if (base === undefined || stacked === undefined) throw new Error("fixture: both PRs must exist");
        expect(stacked.baseRefName).toBe(base.headRefName);
        expect(stacked.isCrossRepository).toBe(false);
      },
    );

    it.each(fixtures)(
      "resolves the sub-issue of the parent issue in $owner/$repo",
      async ({ owner, repo, parentIssue, subIssue }) => {
        const client = createGitHubClient({ token });
        const page = await client.listIssueSubIssues(owner, repo, parentIssue, undefined, new AbortController().signal);
        expect(page.items.map((issue) => issue.number)).toContain(subIssue);
      },
    );

    it.each(fixtures)(
      "resolves what blocks the blocked issue in $owner/$repo",
      async ({ owner, repo, parentIssue, blockedIssue }) => {
        const client = createGitHubClient({ token });
        const page = await client.listIssueBlockedBy(owner, repo, blockedIssue, undefined, new AbortController().signal);
        expect(page.items.map((issue) => issue.number)).toContain(parentIssue);
      },
    );

    it.each(fixtures)(
      "resolves what the parent issue blocks in $owner/$repo",
      async ({ owner, repo, parentIssue, blockedIssue }) => {
        const client = createGitHubClient({ token });
        const page = await client.listIssueBlocking(owner, repo, parentIssue, undefined, new AbortController().signal);
        expect(page.items.map((issue) => issue.number)).toContain(blockedIssue);
      },
    );
  });
});

describe.skipIf(PRIVATE_TOKEN_TYPES.length === 0)("GitHub API integration - private projects", () => {
  describe.each(PRIVATE_TOKEN_TYPES)("with a $label token", ({ token, fixtures }) => {
    it.each(fixtures)("lists projects linked to $owner/$repo", async ({ owner, repo, projectNumber }) => {
      const client = createGitHubClient({ token });
      const page = await client.listRepoProjects(owner, repo, undefined, new AbortController().signal);
      expect(page.items.map((project) => project.number)).toContain(projectNumber);
    });

    it.each(fixtures)("lists items on the project for $owner/$repo", async ({ projectNodeId }) => {
      const client = createGitHubClient({ token });
      const page = await client.listProjectItems(projectNodeId, undefined, new AbortController().signal);
      expect(page.items.length).toBeGreaterThanOrEqual(1);
    });

    it.each(fixtures.filter((fixture) => fixture.ownerType === "org"))(
      "resolves the $owner org project by number",
      async ({ owner, projectNumber }) => {
        const client = createGitHubClient({ token });
        const project = await client.getOrgProject(owner, projectNumber, new AbortController().signal);
        expect(project.number).toBe(projectNumber);
      },
    );

    it.each(fixtures.filter((fixture) => fixture.ownerType === "org"))(
      "lists projects for the $owner org",
      async ({ owner, projectNumber }) => {
        const client = createGitHubClient({ token });
        const page = await client.listOrgProjects(owner, undefined, new AbortController().signal);
        expect(page.items.map((project) => project.number)).toContain(projectNumber);
      },
    );

    it.each(fixtures.filter((fixture) => fixture.ownerType === "user"))(
      "resolves the $owner user project by number",
      async ({ owner, projectNumber }) => {
        const client = createGitHubClient({ token });
        const project = await client.getUserProject(owner, projectNumber, new AbortController().signal);
        expect(project.number).toBe(projectNumber);
      },
    );

    it.each(fixtures.filter((fixture) => fixture.ownerType === "user"))(
      "lists $owner's own repositories via listUserRepos",
      async ({ owner, repo }) => {
        const client = createGitHubClient({ token });
        const page = await client.listUserRepos(owner, undefined, new AbortController().signal);
        expect(page.items.map((r) => r.name)).toContain(repo);
      },
    );

    it.each(fixtures.filter((fixture) => fixture.ownerType === "user"))(
      "lists $owner's own projects via listUserProjects",
      async ({ owner, projectNumber }) => {
        const client = createGitHubClient({ token });
        const page = await client.listUserProjects(owner, undefined, new AbortController().signal);
        expect(page.items.map((p) => p.number)).toContain(projectNumber);
      },
    );
  });
});

describe.skipIf(PRIVATE_TOKEN_TYPES.length === 0)("GitHub API integration - search", () => {
  describe.each(PRIVATE_TOKEN_TYPES)("with a $label token", ({ token, fixtures }) => {
    // Every query is scoped with a repo:/org:/user: qualifier so results are
    // deterministic rather than depending on GitHub's global search index.
    it.each(fixtures)(
      "searches repositories, finding $owner/$repo",
      async ({ owner, repo, ownerType }) => {
        const client = createGitHubClient({ token });
        const qualifier = ownerType === "user" ? `user:${owner}` : `org:${owner}`;
        const page = await client.searchRepositories(
          `${qualifier} ${repo} in:name`,
          undefined,
          new AbortController().signal,
        );
        expect(page.items.some((r) => r.owner.login === owner && r.name === repo)).toBe(true);
      },
    );

    it.each(fixtures)(
      "searches issues, finding the parent issue in $owner/$repo",
      async ({ owner, repo, parentIssue }) => {
        const client = createGitHubClient({ token });
        const page = await client.searchIssues(
          `repo:${owner}/${repo} Parent issue`,
          undefined,
          new AbortController().signal,
        );
        expect(page.items.some((i) => i.number === parentIssue)).toBe(true);
      },
    );

    it.each(fixtures)(
      "searches pull requests, finding the stacked fixture PR in $owner/$repo",
      async ({ owner, repo, stackedPr }) => {
        const client = createGitHubClient({ token });
        const page = await client.searchPullRequests(
          `repo:${owner}/${repo} Stacked fixture`,
          undefined,
          new AbortController().signal,
        );
        expect(page.items.some((p) => p.number === stackedPr)).toBe(true);
      },
    );
    // searchAccounts is covered against the public token pool in the
    // "GitHub API integration" describe block above — it needs the
    // read:org scope, which isn't part of these deliberately narrower
    // private-access tokens, and account search never touches private
    // data anyway.
  });
});
