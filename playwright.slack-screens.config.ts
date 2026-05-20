import { defineConfig } from '@playwright/test';

export default defineConfig({
  testMatch: ['**/tests/e2e/slack-test-mode-right-now.screenshots.spec.ts'],
  timeout: 60000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  webServer: {
    command: 'npx next start -p 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 120000,
  },
});

