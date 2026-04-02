import { defineConfig } from "@playwright/test";

/**
 * Default local Playwright: app on localhost (webServer).
 *
 * Excludes `tests/production/**` (real production + storageState — use `npm run test:prod`)
 * and `tests/audit/**` (flake-prone / disk writes).
 *
 * Production smoke needs `tests/production/auth-state.json` from `npm run test:prod:setup`
 * when you run `npm run test:prod` (separate config: playwright.prod.config.ts).
 *
 * Optional `PLAYWRIGHT_WEB_PORT` (e.g. 3011) when port 3000 is already in use — must match
 * `BASE_URL` / cookie `url` in authenticated-route tests (see tests/e2e/authenticated-routes.spec.ts).
 */
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT || "3000";
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/tests/production/**", "**/tests/audit/**"],
  timeout: 30000,
  // Run `npm run build` before e2e (CI does this in a separate step). A second `next build` here races `.next` on Windows and can ENOENT mid-build.
  webServer: {
    command: `npx next start -p ${WEB_PORT}`,
    url: WEB_ORIGIN,
    // GitHub Actions sets CI=true — always spawn a fresh server after `npm run build`. Locally, reuse avoids double `next start` on :3000.
    reuseExistingServer: process.env.CI !== "true" && process.env.CI !== "1",
    timeout: 120000,
  },
  // Use 127.0.0.1 — Node 22 on Windows often resolves `localhost` to ::1 while the server is IPv4-only → ECONNREFUSED.
  use: { baseURL: process.env.BASE_URL || WEB_ORIGIN, trace: "retain-on-failure" }
});
