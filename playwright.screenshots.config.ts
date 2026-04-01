/**
 * Public-page screenshot sweep — no auth. Writes PNGs under tests/production/screenshots/
 * Run: npx playwright test --config playwright.screenshots.config.ts
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/production',
  testMatch: '**/public-screenshots.spec.ts',
  timeout: 60000,
  use: {
    baseURL: 'https://www.foldera.ai',
    trace: 'off',
  },
  reporter: [['list']],
});
