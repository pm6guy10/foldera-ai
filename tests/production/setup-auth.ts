import { chromium } from '@playwright/test';
import path from 'path';

async function setupAuth() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Opening https://foldera.ai/login');
  console.log('Sign in manually. The script will save your session after you reach /dashboard.');

  await page.goto('https://foldera.ai/login');

  // Wait for the user to complete OAuth and land on dashboard
  await page.waitForURL('**/dashboard**', { timeout: 120000 });
  console.log('Signed in successfully. Saving session state...');

  const statePath = path.join(__dirname, 'auth-state.json');
  await context.storageState({ path: statePath });
  console.log(`Session saved to ${statePath}`);

  await browser.close();
}

setupAuth().catch(console.error);
