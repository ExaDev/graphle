import { expect, test } from "@playwright/test";

/**
 * Drives the real GitHub auth flow end to end: types a real token into the
 * PAT field, submits via Enter (the fix that prompted writing this test —
 * previously the password field wasn't inside a form and Enter did nothing),
 * and confirms the app actually signs in and loads the viewer's
 * organisations against the live GitHub API. Runs once per configured token
 * type (classic, fine-grained) — graphle supports both, with different scope
 * models (see `GitHubPanel.tsx`'s own scope guidance) — and each is skipped
 * independently when its env var isn't set (see `.env.example`).
 */
const TOKEN_TYPES = [
  { label: "classic", envVar: "GITHUB_TEST_PAT_CLASSIC", token: process.env.GITHUB_TEST_PAT_CLASSIC },
  {
    label: "fine-grained",
    envVar: "GITHUB_TEST_PAT_FINE_GRAINED",
    token: process.env.GITHUB_TEST_PAT_FINE_GRAINED,
  },
] as const;

for (const { label, envVar, token } of TOKEN_TYPES) {
  test(`signs in with a real ${label} PAT and loads organisations`, async ({ page }) => {
    test.skip(token === undefined, `${envVar} not configured`);
    if (token === undefined) throw new Error("unreachable: test.skip guards this");

    await page.goto("/");
    await page.getByRole("button", { name: "GitHub" }).click();

    await page.getByLabel("Personal access token").fill(token);
    await page.keyboard.press("Enter");

    // Successful validation reveals the browse section — content-independent
    // of the specific token's login or org memberships.
    await expect(page.getByText("Your organisations")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Loading…")).toBeHidden({ timeout: 15_000 });
  });
}
