import { test, expect, type Page, type Route } from '@playwright/test';
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

function json(data: unknown) {
  return JSON.stringify(data);
}

function fulfillJson(data: unknown) {
  return (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(data) });
}

function matchApiPath(apiPath: string) {
  return (url: URL | string): boolean => {
    try {
      const u = typeof url === 'string' ? new URL(url) : url;
      const p = u.pathname;
      return p === apiPath || p === `${apiPath}/`;
    } catch {
      return false;
    }
  };
}

const FLOW_INTEGRATIONS = {
  integrations: [
    { provider: 'google', is_active: true, sync_email: 'flow@gmail.com', needs_reauth: false },
    { provider: 'azure_ad', is_active: true, sync_email: 'flow@outlook.com', needs_reauth: false },
  ],
};

/** DB-free API stubs so /dashboard (integrations banner) and settings/briefings settle under `networkidle`. */
async function attachFlowApiMocks(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem('foldera_pending_checkout');
    } catch {
      /* ignore */
    }
  });
  await page.route(matchApiPath('/api/stripe/checkout'), (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({ error: 'mock_checkout_disabled' }),
    });
  });
  await page.route(matchApiPath('/api/stripe/portal'), (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({ status: 400, contentType: 'application/json', body: json({ error: 'mock' }) });
  });
  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(FLOW_INTEGRATIONS));
  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson({ plan: 'free', status: 'active', current_period_end: null, can_manage_billing: false }),
  );
  await page.route(matchApiPath('/api/conviction/latest'), fulfillJson({}));
  await page.route(matchApiPath('/api/conviction/history'), fulfillJson({ items: [] }));
  await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ buckets: [], freeText: null }));
  await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
}

test.describe('Flow routes', () => {
  test('no page performs client-side redirect after load', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await attachFlowApiMocks(page);

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
    await attachFlowApiMocks(page);

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
