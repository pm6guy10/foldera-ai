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
 * Requires: NEXTAUTH_SECRET, NEXTAUTH_URL=http://127.0.0.1:3000 (or localhost if IPv6 works)
 * The build step runs before this step in CI, so webServer uses `npm run start`.
 */
import { defineConfig } from "@playwright/test";

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
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    // Reusing a stale dev/prod server on :3000 serves HTML that points at old chunk hashes → 400 on /_next/static and blank client pages.
    reuseExistingServer: false,
    timeout: 60000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
});
