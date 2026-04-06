import { test, expect, type Page } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000002';
const E2E_PORT = process.env.PLAYWRIGHT_WEB_PORT?.trim() || '3000';
/** Must match Playwright `use.baseURL` / `playwright.ci.config` WEB_ORIGIN. */
const E2E_ORIGIN =
  process.env.PLAYWRIGHT_TEST_BASE_URL?.trim() ||
  process.env.BASE_URL?.trim() ||
  `http://127.0.0.1:${E2E_PORT}`;

async function seedAuthenticatedSession(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for flow route tests.');
  }

  const sessionToken = await encode({
    secret,
    token: {
      sub: MOCK_USER_ID,
      userId: MOCK_USER_ID,
      email: 'flow-test@foldera.ai',
      name: 'Flow Test User',
      hasOnboarded: true,
    },
  });

  // Matches middleware + getAuthOptions(): local `next start` (no VERCEL) uses `next-auth.session-token`.
  // Avoid setExtraHTTPHeaders(Cookie): it breaks /_next/static chunk loading → networkidle never settles (CI timeout).
  const cookieUrl = new URL('/', E2E_ORIGIN).href;
  await page.context().addCookies([
    {
      name: 'next-auth.session-token',
      value: sessionToken,
      url: cookieUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

test.describe('Flow routes', () => {
  test('no page performs client-side redirect after load', async ({ page }) => {
    await seedAuthenticatedSession(page);

    for (const route of ['/dashboard', '/dashboard/settings', '/dashboard/briefings', '/onboard']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const stableUrl = page.url();

      await page.waitForTimeout(3000);

      await expect(page).toHaveURL(stableUrl);
    }
  });

  test('authenticated user is not looped between dashboard and onboard', async ({ page }) => {
    await seedAuthenticatedSession(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    let navigationCount = 1;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigationCount += 1;
      }
    });

    await page.waitForTimeout(5000);

    expect(navigationCount).toBe(1);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
