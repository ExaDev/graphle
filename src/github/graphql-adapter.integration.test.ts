import { describe, expect, it } from "vitest";

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
 * Private-repo access, using SEPARATE tokens from `TOKEN_TYPES` above
 * (`GH_TEST_PAT_CLASSIC_PRIVATE`/`GH_TEST_PAT_FINE_GRAINED_PRIVATE`) rather
 * than widening those — the public-access tokens stay minimally scoped, and
 * these more-privileged ones are dedicated to reading two otherwise-unused
 * fixture repos created solely for this purpose
 * (`Mearman/graphle-test-private`, `ExaDev/graphle-test-private`).
 *
 * Coverage is asymmetric by design, not oversight: a fine-grained token can
 * only target one resource owner, so `GH_TEST_PAT_FINE_GRAINED_PRIVATE` is
 * scoped to the ExaDev org only (the more product-relevant case — see
 * `GitHubPanel.tsx`'s note that fine-grained tokens can't read a personal
 * account's own Projects boards). `GH_TEST_PAT_CLASSIC_PRIVATE`'s `repo`
 * scope isn't owner-restricted, so it covers both fixture repos.
 *
 * Unlike the public tokens above, `GH_TEST_PAT_FINE_GRAINED_PRIVATE` needs
 * an explicit "Contents: Read-only" repository permission — a private repo
 * isn't readable on the auto-included Metadata-only default the way a
 * public one unconditionally is (see `.env.example` for the full story of
 * how that was confirmed).
 */
const PRIVATE_TOKEN_TYPES = [
  {
    label: "classic",
    token: process.env.GH_TEST_PAT_CLASSIC_PRIVATE,
    repos: [
      { owner: "Mearman", name: "graphle-test-private" },
      { owner: "ExaDev", name: "graphle-test-private" },
    ],
  },
  {
    label: "fine-grained",
    token: process.env.GH_TEST_PAT_FINE_GRAINED_PRIVATE,
    repos: [{ owner: "ExaDev", name: "graphle-test-private" }],
  },
].filter(
  (entry): entry is { label: string; token: string; repos: { owner: string; name: string }[] } =>
    entry.token !== undefined && entry.token !== "",
);

describe.skipIf(PRIVATE_TOKEN_TYPES.length === 0)("GitHub API integration - private access", () => {
  describe.each(PRIVATE_TOKEN_TYPES)("with a $label token", ({ token, repos }) => {
    it.each(repos)("resolves the private repository $owner/$name", async ({ owner, name }) => {
      const client = createGitHubClient({ token });
      const repo = await client.getRepo(owner, name, new AbortController().signal);
      expect(repo.name).toBe(name);
      expect(repo.owner.login).toBe(owner);
    });
  });
});
