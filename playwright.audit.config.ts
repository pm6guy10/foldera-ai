import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/audit',
  timeout: 60000,
  outputDir: './audit-output/test-results',
  webServer: {
    command: 'npm run build && npm run start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'off', // we take our own full-page screenshots
  },
  reporter: [
    ['list'],
    ['json', { outputFile: './audit-output/playwright-results.json' }],
  ],
});
