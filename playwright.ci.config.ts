/**
 * CI Playwright config — merge-blocking flow gate.
 *
 * Runs only the three deterministic, DB-free test files:
 *   public-routes   — unauthenticated, no DB required
 *   authenticated-routes — all APIs mocked via page.route()
 *   flow-routes     — URL-stability only (no redirect loops)
 *
 * Excluded from this config (observational / production-coupled):
 *   safety-gates            — real DB calls (conviction/latest, integrations/status)
 *   backend-safety-gates    — real DB calls + CRON_SECRET dependent
 *   tests/audit/*           — writes to disk, clickflow timeouts on /
 *   tests/production/*      — requires auth-state.json + live foldera.ai
 *
 * Requires: NEXTAUTH_SECRET, NEXTAUTH_URL must match the server origin (see WEB_ORIGIN below).
 *   Use http://127.0.0.1:${WEB_PORT} (not http://localhost:…) so it matches Playwright’s baseURL — mismatch can yield HTTP 500 on /login locally.
 * The build step runs before this step in CI, so webServer uses `next start` on WEB_PORT.
 *
 * Optional PLAYWRIGHT_WEB_PORT (e.g. 3011) when :3000 is in use locally — same as playwright.config.ts.
 */
import { defineConfig } from "@playwright/test";

const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT || "3000";
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testMatch: [
    "**/tests/e2e/public-routes.spec.ts",
    "**/tests/e2e/authenticated-routes.spec.ts",
    "**/tests/e2e/flow-routes.spec.ts",
  ],
  timeout: 30000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  webServer: {
    command: `npx next start -p ${WEB_PORT}`,
    url: WEB_ORIGIN,
    // Reusing a stale dev/prod server on :3000 serves HTML that points at old chunk hashes → 400 on /_next/static and blank client pages.
    reuseExistingServer: false,
    timeout: 60000,
  },
  use: {
    baseURL: WEB_ORIGIN,
    trace: "retain-on-failure",
  },
});
