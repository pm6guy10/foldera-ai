/**
 * Production mobile layout: no horizontal overflow, full-page screenshots.
 * Viewports: 412×915 (Pixel-class), 390×844 (fallback).
 * Run via: npm run test:prod (included in playwright.prod.config.ts).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect } from '@playwright/test';

function productionAuthStateReady(): boolean {
  const p = path.join(__dirname, 'auth-state.json');
  if (!fs.existsSync(p)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8')) as {
      cookies?: Array<{ name?: string; expires?: number }>;
    };
    const now = Date.now() / 1000;
    const sessionCookies = (data.cookies ?? []).filter(
      (c) =>
        typeof c.name === 'string' &&
        (c.name.includes('session-token') || c.name.includes('authjs')),
    );
    if (sessionCookies.length === 0) return false;
    for (const c of sessionCookies) {
      if (typeof c.expires === 'number' && c.expires > 0 && c.expires < now) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const describeAuth = productionAuthStateReady() ? test.describe : test.describe.skip;

const SHOT_ROOT = path.join(__dirname, 'screenshots', 'mobile-prod');

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const delta = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(delta, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(1);
}

function ensureShotDir(sub: string) {
  const dir = path.join(SHOT_ROOT, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const VIEWPORTS = [
  { w: 412, h: 915, tag: '412x915' },
  { w: 390, h: 844, tag: '390x844' },
] as const;

for (const { w, h, tag } of VIEWPORTS) {
  test.describe(`Mobile prod ${tag}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test(`anonymous: /login and /start — no overflow + screenshots`, async ({ browser }) => {
      const dir = ensureShotDir(tag);
      const context = await browser.newContext({ storageState: undefined });
      const page = await context.newPage();
      try {
        for (const name of ['login', 'start'] as const) {
          await page.goto(`/${name}`, { waitUntil: 'networkidle', timeout: 45000 });
          await assertNoHorizontalOverflow(page);
          await page.screenshot({
            path: path.join(dir, `${name}.png`),
            fullPage: true,
          });
        }
      } finally {
        await context.close();
      }
    });

    test(`public marketing: /, /pricing — no overflow + screenshots`, async ({ page }) => {
      const dir = ensureShotDir(tag);
      for (const [file, url] of [
        ['home', '/'],
        ['pricing', '/pricing'],
      ] as const) {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await assertNoHorizontalOverflow(page);
        await page.screenshot({ path: path.join(dir, `${file}.png`), fullPage: true });
      }
    });
  });
}

for (const { w, h, tag } of VIEWPORTS) {
  describeAuth(`Mobile prod authenticated ${tag}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('dashboard + settings + onboard — no overflow + screenshots', async ({ page }) => {
      const dir = ensureShotDir(`${tag}-auth`);
      for (const [file, url] of [
        ['dashboard', '/dashboard'],
        ['settings', '/dashboard/settings'],
        ['onboard', '/onboard'],
      ] as const) {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await assertNoHorizontalOverflow(page);
        await page.screenshot({ path: path.join(dir, `${file}.png`), fullPage: true });
      }
    });
  });
}
