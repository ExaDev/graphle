import { expect, test } from "@playwright/test";

/**
 * Drives the real GitHub auth flow end to end: types a real token into the
 * PAT field, submits via Enter (the fix that prompted writing this test —
 * previously the password field wasn't inside a form and Enter did nothing),
 * and confirms the app actually signs in and loads the viewer's
 * organisations against the live GitHub API. Skipped when no
 * `GITHUB_TEST_PAT` is configured (see `.env.example`).
 */
const token = process.env.GITHUB_TEST_PAT;

test("signs in with a real PAT and loads organisations", async ({ page }) => {
  test.skip(token === undefined, "no GITHUB_TEST_PAT configured");
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
