import { describe, expect, it } from "vitest";

import { createGitHubClient } from "./graphql-adapter";

/**
 * Hits the real GitHub GraphQL API with a real token — not a mock. Skipped
 * entirely wherever `GITHUB_TEST_PAT` isn't set (a developer without a local
 * `.env`, or the existing mocked-only CI `test` job); runs for real in the
 * dedicated CI job that supplies the secret, and locally once `.env` is set
 * up (see `.env.example`).
 *
 * Assertions are deliberately independent of the token's own org
 * memberships — `viewer` resolves whoever the token belongs to, and
 * `octocat/Hello-World` is GitHub's own stable, public, canonical demo repo
 * — so this stays low-flake regardless of which account issued the token.
 */
const token = process.env.GITHUB_TEST_PAT;

describe.skipIf(token === undefined)("GitHub API integration", () => {
  it("resolves the authenticated viewer", async () => {
    if (token === undefined) throw new Error("unreachable: describe.skipIf guards this");
    const client = createGitHubClient({ token });
    const viewer = await client.viewer(new AbortController().signal);
    expect(viewer.login.length).toBeGreaterThan(0);
  });

  it("resolves a known public repository", async () => {
    if (token === undefined) throw new Error("unreachable: describe.skipIf guards this");
    const client = createGitHubClient({ token });
    const repo = await client.getRepo("octocat", "Hello-World", new AbortController().signal);
    expect(repo.name).toBe("Hello-World");
    expect(repo.owner.login).toBe("octocat");
  });
});
