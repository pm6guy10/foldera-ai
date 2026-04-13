/**
 * End-to-end mobile journey on production (real flow, screenshots, overflow).
 * Viewport 412×915 primary; 390×844 secondary.
 * Requires tests/production/auth-state.json for signed-in steps (skipped if missing/expired).
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

const SHOT_ROOT = path.join(__dirname, 'screenshots', 'mobile-journey');

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
  test.describe(`Mobile journey anonymous ${tag}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('landing → menu → login → start → logout nav state', async ({ browser }) => {
      const dir = ensureShotDir(`${tag}-anon`);
      const context = await browser.newContext({ storageState: undefined });
      const page = await context.newPage();
      try {
        await page.goto('/', { waitUntil: 'networkidle', timeout: 60000 });
        await assertNoHorizontalOverflow(page);
        await page.screenshot({ path: path.join(dir, '01-home.png'), fullPage: true });

        await page.getByTestId('nav-mobile-menu-toggle').click();
        await expect(page.getByRole('dialog', { name: 'Site menu' })).toBeVisible();
        await page.screenshot({ path: path.join(dir, '02-menu-open.png'), fullPage: true });
        await assertNoHorizontalOverflow(page);

        await page.getByTestId('nav-mobile-overlay-close').click();
        await expect(page.getByRole('dialog', { name: 'Site menu' })).toBeHidden();

        await page.goto('/login', { waitUntil: 'networkidle', timeout: 45000 });
        await assertNoHorizontalOverflow(page);
        await page.screenshot({ path: path.join(dir, '03-login.png'), fullPage: true });

        await page.goto('/start', { waitUntil: 'networkidle', timeout: 45000 });
        await assertNoHorizontalOverflow(page);
        await page.screenshot({ path: path.join(dir, '04-start.png'), fullPage: true });

        await page.goto('/pricing', { waitUntil: 'networkidle', timeout: 45000 });
        await assertNoHorizontalOverflow(page);
        await page.screenshot({ path: path.join(dir, '05-pricing-anon.png'), fullPage: true });
      } finally {
        await context.close();
      }
    });
  });
}

for (const { w, h, tag } of VIEWPORTS) {
  describeAuth(`Mobile journey signed-in ${tag}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('dashboard → settings → back → pricing → upgrade path → sign out → public nav', async ({
      page,
    }) => {
      const dir = ensureShotDir(`${tag}-auth`);

      await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 60000 });
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: path.join(dir, '10-dashboard.png'), fullPage: true });

      const upgradeBlur = page.getByRole('button', { name: 'Upgrade to Pro' });
      if (await upgradeBlur.isVisible().catch(() => false)) {
        await upgradeBlur.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(dir, '10b-blur-upgrade-visible.png'), fullPage: true });
      }

      await page.goto('/dashboard/settings', { waitUntil: 'networkidle', timeout: 60000 });
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: path.join(dir, '11-settings.png'), fullPage: true });

      await page.getByRole('link', { name: 'Back to dashboard' }).click();
      await page.waitForURL('**/dashboard', { timeout: 30000 });
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: path.join(dir, '12-dashboard-back.png'), fullPage: true });

      await page.goto('/onboard', { waitUntil: 'networkidle', timeout: 45000 });
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: path.join(dir, '13-onboard.png'), fullPage: true });

      await page.goto('/pricing', { waitUntil: 'networkidle', timeout: 45000 });
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: path.join(dir, '14-pricing.png'), fullPage: true });

      const upgradePricing = page.getByRole('link', { name: 'Upgrade to Pro' }).first();
      const checkoutBtn = page.getByRole('button', { name: 'Continue to checkout' });
      if (await upgradePricing.isVisible().catch(() => false)) {
        await upgradePricing.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(dir, '15-pricing-upgrade-cta.png'), fullPage: true });
      } else if (await checkoutBtn.isVisible().catch(() => false)) {
        await checkoutBtn.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(dir, '15-pricing-checkout-cta.png'), fullPage: true });
      }

      // Sign out lives under Settings (dashboard home has no Sign out after IA refresh).
      await page.goto('/dashboard/settings', { waitUntil: 'networkidle', timeout: 45000 });
      const signOutBtn = page.getByRole('button', { name: 'Sign out' }).first();
      await signOutBtn.scrollIntoViewIfNeeded();
      await signOutBtn.click();
      await page.waitForURL((url) => url.pathname === '/' || url.pathname === '', {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      });

      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: path.join(dir, '16-after-signout-home.png'), fullPage: true });

      await page.getByTestId('nav-mobile-menu-toggle').click();
      await expect(
        page.getByRole('dialog', { name: 'Site menu' }).getByRole('link', { name: 'Dashboard' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('dialog', { name: 'Site menu' }).getByRole('link', { name: 'Get started free' }),
      ).toBeVisible();
      await page.screenshot({ path: path.join(dir, '17-menu-signed-out.png'), fullPage: true });
      await assertNoHorizontalOverflow(page);
    });
  });
}
