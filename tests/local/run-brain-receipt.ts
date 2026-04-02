/**
 * POST /api/dev/brain-receipt using saved localhost owner cookies.
 * Prereq: tests/local/auth-state-owner.json from npm run test:local:setup
 * Prereq: dev server + ALLOW_DEV_ROUTES=true
 *
 * Usage:
 *   LOCAL_BASE_URL=http://localhost:3001 npx tsx tests/local/run-brain-receipt.ts
 *   npx tsx tests/local/run-brain-receipt.ts --screenshot artifacts/brief.png
 */
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'path';
import { chromium } from '@playwright/test';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const baseURL =
  process.env.LOCAL_BASE_URL?.replace(/\/$/, '')
  ?? process.env.NEXTAUTH_URL?.replace(/\/$/, '')
  ?? 'http://localhost:3000';

const statePath = path.join(__dirname, 'auth-state-owner.json');

async function main() {
  if (!fs.existsSync(statePath)) {
    console.error(`Missing ${statePath}. Run: npm run test:local:setup`);
    process.exit(1);
  }

  const wantShot = process.argv.includes('--screenshot');
  const shotIdx = process.argv.indexOf('--screenshot');
  const shotPath =
    wantShot && process.argv[shotIdx + 1] && !process.argv[shotIdx + 1].startsWith('-')
      ? process.argv[shotIdx + 1]
      : wantShot
        ? path.join(process.cwd(), 'artifacts', 'brain-receipt-email.png')
        : null;

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    storageState: statePath,
  });
  const page = await context.newPage();

  const res = await page.request.post(`${baseURL}/api/dev/brain-receipt`, {
    headers: { Accept: 'application/json' },
  });

  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    console.error('Non-JSON response', res.status(), text.slice(0, 500));
    await browser.close();
    process.exit(1);
    return;
  }

  console.log(JSON.stringify(body, null, 2));

  const fa = body.final_action as Record<string, unknown> | undefined;
  const actionId = typeof fa?.action_id === 'string' ? fa.action_id : null;

  if (shotPath && actionId) {
    const url = `${baseURL}/api/dev/email-preview?action_id=${encodeURIComponent(actionId)}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: shotPath, fullPage: true });
    console.error(`Screenshot: ${shotPath}`);
  } else if (shotPath && !actionId) {
    console.error('No action_id in response; skip screenshot.');
  }

  await browser.close();
  process.exit(res.ok() ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
