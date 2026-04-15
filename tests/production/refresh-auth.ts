import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

async function refreshAuth() {
  const statePath = path.join(__dirname, 'auth-state.json');

  if (!fs.existsSync(statePath)) {
    console.error('No auth-state.json found. Run npm run test:prod:setup first.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();

  const response = await page.goto('https://foldera.ai/api/auth/session');
  const body = await response?.json().catch(() => null);

  if (body?.user?.id) {
    await context.storageState({ path: statePath });
    console.log('Auth state refreshed successfully.');
    await browser.close();
    process.exit(0);
  } else {
    console.error('Session expired. Run npm run test:prod:setup to re-authenticate.');
    await browser.close();
    process.exit(1);
  }
}

refreshAuth();
