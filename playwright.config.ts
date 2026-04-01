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
  webServer: {
    command: "npm run build && npm run start",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  use: { baseURL: process.env.BASE_URL || "http://localhost:3000", trace: "retain-on-failure" }
});
