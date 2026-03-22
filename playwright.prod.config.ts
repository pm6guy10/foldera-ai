import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/production',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'https://www.foldera.ai',
    storageState: './tests/production/auth-state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: './tests/production/results.json' }],
  ],
  // No webServer block. This runs against live production.
});
