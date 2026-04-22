/**
 * CI Playwright config — merge-blocking flow gate.
 *
 * Lane strategy (see .github/workflows/ci.yml):
 *   smoke       public-routes only, no auth, fast-fail
 *   flow        authenticated + flow routes, @quarantine excluded
 *   payments    authenticated subset (only @payments), @quarantine excluded —
 *               runs on stripe-only PRs so we don't pay full-flow cost
 *   quarantine  ONLY @quarantine-tagged tests, non-blocking reporter
 *   all         every spec in the CI bucket (local convenience)
 *
 * The lane is selected via E2E_LANE. Default is `all` so that local dev and
 * the legacy `npm run test:ci:e2e` script keep running the full suite.
 *
 * ── QUARANTINE PROTOCOL ────────────────────────────────────────────────────
 * A test becomes quarantined by adding `{ tag: '@quarantine' }` to its
 * declaration:
 *
 *     test('flaky payment checkout', { tag: '@quarantine' }, async ({ page }) => {
 *       // …
 *     });
 *
 * Main lanes automatically exclude it via --grep-invert. The quarantine lane
 * runs ONLY those tests, reports results, and DOES NOT BLOCK CI. Fix the test,
 * remove the tag, and it rejoins the blocking lane. Leaving a test quarantined
 * for >14 days is a code smell — either delete or fix.
 *
 * Excluded from this config (observational / production-coupled):
 *   safety-gates            — real DB calls
 *   backend-safety-gates    — real DB calls + CRON_SECRET dependent
 *   tests/audit/*           — writes to disk, clickflow timeouts on /
 *   tests/production/*      — requires auth-state.json + live foldera.ai
 *
 * Requires NEXTAUTH_SECRET; NEXTAUTH_URL must match `use.baseURL` origin.
 * `next start` consumes the `.next/` produced either by the upstream `build`
 * job (CI) or by `npm run build` locally.
 *
 * Optional PLAYWRIGHT_WEB_PORT (e.g. 3011) when :3000 is in use locally.
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

const testMatch =
  LANE === "smoke"
    ? SMOKE_MATCH
    : LANE === "flow"
      ? FLOW_MATCH
      : LANE === "payments"
        // All `@payments`-tagged tests live in authenticated-routes.spec.ts today.
        // Restrict the match so Playwright does not spend time loading the other
        // specs just to filter them out.
        ? ["**/tests/e2e/authenticated-routes.spec.ts"]
        : ALL_MATCH; // `quarantine` and `all` both scan every CI spec.

/**
 * Tag filtering.
 *   smoke / flow / all → grepInvert /@quarantine/ (skip flaky)
 *   payments           → grep /@payments/ AND grepInvert /@quarantine/
 *                        (only tagged payment tests, still skip flake)
 *   quarantine         → grep /@quarantine/ (only flaky)
 *
 * Tag conventions are plain regex matches against the effective test title, so
 * both `test('name @payments', ...)` and `test('name', { tag: '@payments' }, …)`
 * are picked up.
 */
const grep =
  LANE === "quarantine"
    ? /@quarantine/
    : LANE === "payments"
      ? /@payments/
      : undefined;
const grepInvert = LANE === "quarantine" ? undefined : /@quarantine/;

/**
 * Reporter strategy:
 *   list    human-readable log in the GitHub Actions step
 *   html    uploaded as an artifact; full trace-viewer per failure
 *   blob    machine-mergeable blob (future: merge sharded runs)
 *   github  GitHub Actions annotations on the PR diff
 * Local dev keeps only `list` so no surprise HTML report opens in the browser.
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
  grep,
  grepInvert,
  timeout: 30000,
  workers: 1,
  /**
   * Retry once in CI for genuine flake (network jitter, slow cold Next start).
   * Assertion bugs fail on both attempts, so this does not hide real regressions —
   * it only prevents a single-timeout blip from blocking a push to main.
   * The quarantine lane retries twice since it is non-blocking.
   */
  retries: IS_CI ? (LANE === "quarantine" ? 2 : 1) : 0,
  forbidOnly: IS_CI,
  reporter: reporter as unknown as import("@playwright/test").ReporterDescription[],
  webServer: {
    command: `npx next start -p ${WEB_PORT}`,
    url: WEB_ORIGIN,
    // Reusing a stale dev/prod server on :3000 serves HTML pointing at old chunk hashes → 400 on /_next/static and blank client pages.
    reuseExistingServer: false,
    timeout: 60000,
    // Pipe server stdout/stderr into Playwright's own output so a crash during
    // `next start` in CI produces a diagnosable log instead of the cryptic
    // "Process from config.webServer was not able to start. Exit code: 1".
    stdout: "pipe",
    stderr: "pipe",
  },
  use: {
    baseURL: WEB_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
