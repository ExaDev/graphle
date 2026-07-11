import { defineConfig, devices } from "@playwright/test";

import "./src/test/load-env";

/**
 * Mirrors `vite.config.ts`'s own base-path split (GitHub Pages serves the
 * site at /graphle/, local dev/preview is nicer at /) so the same config
 * works unchanged locally and in CI.
 */
const base = process.env.CI ? "/graphle/" : "/";
const PORT = 4173;
const baseURL = `http://localhost:${String(PORT)}${base}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Production-parity: the same build CI deploys, not the dev server.
    command: "pnpm build && pnpm preview",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
