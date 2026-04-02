/**
 * One-time (or refresh): save owner session cookies for LOCAL dev so agents can call
 * POST /api/dev/brain-receipt and GET /api/dev/email-preview?action_id= without a browser.
 *
 * Prereq: npm run dev (or next dev) on LOCAL_BASE_URL with .env.local OAuth + NextAuth.
 * Output: tests/local/auth-state-owner.json (gitignored)
 */
import { chromium } from '@playwright/test';
import path from 'path';

const baseURL =
  process.env.LOCAL_BASE_URL?.replace(/\/$/, '')
  ?? process.env.NEXTAUTH_URL?.replace(/\/$/, '')
  ?? 'http://localhost:3000';

const statePath = path.join(__dirname, 'auth-state-owner.json');

async function setupAuthLocalhost() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  console.log(`Opening ${baseURL}/login`);
  console.log('Sign in as OWNER (same user as OWNER_USER_ID). Session saves after /dashboard loads.');
  console.log(`If Next dev uses another port, set LOCAL_BASE_URL (e.g. http://localhost:3001).`);

  await page.goto('/login');

  await page.waitForURL('**/dashboard**', { timeout: 180000 });
  console.log('Signed in. Saving storage state...');

  await context.storageState({ path: statePath });
  console.log(`Saved: ${statePath}`);

  await browser.close();
}

setupAuthLocalhost().catch((err) => {
  console.error(err);
  process.exit(1);
});
