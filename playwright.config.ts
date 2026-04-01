import { defineConfig } from "@playwright/test";

/**
 * Default local Playwright: app on localhost (webServer).
 *
 * Excludes `tests/production/**` (real production + storageState — use `npm run test:prod`)
 * and `tests/audit/**` (flake-prone / disk writes).
 *
 * Production smoke needs `tests/production/auth-state.json` from `npm run test:prod:setup`
 * when you run `npm run test:prod` (separate config: playwright.prod.config.ts).
 */
export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/tests/production/**", "**/tests/audit/**"],
  timeout: 30000,
  // Run `npm run build` before e2e (CI does this in a separate step). A second `next build` here races `.next` on Windows and can ENOENT mid-build.
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    // GitHub Actions sets CI=true — always spawn a fresh server after `npm run build`. Locally, reuse avoids double `next start` on :3000.
    reuseExistingServer: process.env.CI !== "true" && process.env.CI !== "1",
    timeout: 120000,
  },
  // Use 127.0.0.1 — Node 22 on Windows often resolves `localhost` to ::1 while the server is IPv4-only → ECONNREFUSED.
  use: { baseURL: process.env.BASE_URL || "http://127.0.0.1:3000", trace: "retain-on-failure" }
});
