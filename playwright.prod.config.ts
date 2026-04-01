import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const authPath = path.join(__dirname, 'tests/production/auth-state.json');
const useAuthState = fs.existsSync(authPath);

export default defineConfig({
  testDir: './tests/production',
  testMatch: [
    '**/smoke.spec.ts',
    '**/audit.spec.ts',
    '**/mobile-prod-layout.spec.ts',
    '**/mobile-journey.spec.ts',
  ],
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'https://www.foldera.ai',
    ...(useAuthState ? { storageState: authPath } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: './tests/production/results.json' }],
  ],
  // No webServer block. This runs against live production.
});
