/**
 * CI Playwright config — merge-blocking flow gate.
 *
 * Lane strategy (see .github/workflows/ci.yml):
 *   smoke  (public-routes)          — fail fast, no mocks, unauthenticated only
 *   flow   (authenticated + flow)   — heavy mocked journeys, gated behind smoke
 *
 * The lane is selected via E2E_LANE (smoke|flow|all). Default is `all` so that
 * local dev + the legacy `npm run test:ci:e2e` script keep running the full suite.
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
const IS_CI = Boolean(process.env.CI);

const LANE = (process.env.E2E_LANE || "all").toLowerCase();
const SMOKE_MATCH = ["**/tests/e2e/public-routes.spec.ts"];
const FLOW_MATCH = [
  "**/tests/e2e/authenticated-routes.spec.ts",
  "**/tests/e2e/flow-routes.spec.ts",
];
const ALL_MATCH = [...SMOKE_MATCH, ...FLOW_MATCH];
const testMatch = LANE === "smoke" ? SMOKE_MATCH : LANE === "flow" ? FLOW_MATCH : ALL_MATCH;

/**
 * Reporter strategy:
 *   - `list`      — human-readable log in the GitHub Actions step
 *   - `html`      — uploaded as an artifact; full trace-viewer per failure
 *   - `blob`      — machine-mergeable blob (future: merge sharded runs)
 *   - `github`    — GitHub Actions annotations on the PR diff when applicable
 * Local dev: keep only `list` so there's no surprise HTML report opening in the browser.
 */
const reporter = IS_CI
  ? ([
      ["list"],
      ["html", { outputFolder: "playwright-report", open: "never" }],
      ["blob", { outputDir: "blob-report" }],
      ["github"],
    ] as const)
  : ([["list"]] as const);

export default defineConfig({
  testMatch,
  timeout: 30000,
  workers: 1,
  /**
   * Retry once in CI for genuine flake (network jitter, slow cold Next start).
   * Assertion bugs fail on both attempts, so this does not hide real regressions —
   * it only prevents a single-timeout blip from blocking a push to main.
   */
  retries: IS_CI ? 1 : 0,
  forbidOnly: IS_CI,
  reporter: reporter as unknown as import("@playwright/test").ReporterDescription[],
  webServer: {
    command: `npx next start -p ${WEB_PORT}`,
    url: WEB_ORIGIN,
    // Reusing a stale dev/prod server on :3000 serves HTML that points at old chunk hashes → 400 on /_next/static and blank client pages.
    reuseExistingServer: false,
    timeout: 60000,
  },
  use: {
    baseURL: WEB_ORIGIN,
    /** Keep a retry's trace; CI uploads it as an artifact for one-click debugging. */
    trace: "retain-on-failure",
    /** Screenshot + video only on failure — cheap storage, massive diagnostic win. */
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
