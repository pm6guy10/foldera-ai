import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const MOCK_USER_ID = '33333333-3333-4333-8333-333333333333';
const MOCK_USER_EMAIL = 'safety-gate@foldera.ai';
const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
];

async function buildCookieHeader() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for safety gate tests.');
  }

  const sessionToken = await encode({
    secret,
    token: {
      sub: MOCK_USER_ID,
      userId: MOCK_USER_ID,
      email: MOCK_USER_EMAIL,
      name: 'Safety Gate User',
      hasOnboarded: true,
    },
  });

  return SESSION_COOKIE_NAMES.map((name) => `${name}=${sessionToken}`).join('; ');
}

async function seedAuthenticatedSession(page: Page) {
  const cookieHeader = await buildCookieHeader();
  await page.context().setExtraHTTPHeaders({ cookie: cookieHeader });
}

async function getJson(request: APIRequestContext, path: string) {
  const cookieHeader = await buildCookieHeader();
  const response = await request.get(path, {
    headers: {
      cookie: cookieHeader,
    },
  });

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }

  return { response, body, text };
}

function extractEmails(value: unknown): string[] {
  const matches = JSON.stringify(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches ?? [];
}

test.describe('Safety gates', () => {
  test('no client-side redirects after page load', async ({ page }) => {
    await seedAuthenticatedSession(page);

    for (const route of ['/dashboard', '/dashboard/settings', '/onboard']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const stableUrl = page.url();

      await page.waitForTimeout(3000);

      await expect(page).toHaveURL(stableUrl);
    }
  });

  test('authenticated user not looped between routes', async ({ page }) => {
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

  test('API responses include correct user context', async ({ request }) => {
    const session = await getJson(request, '/api/auth/session');
    expect(session.response.status()).toBe(200);
    expect(session.body).toMatchObject({
      user: {
        id: MOCK_USER_ID,
      },
    });

    const conviction = await getJson(request, '/api/conviction/latest');
    expect(conviction.response.status()).toBe(200);
    if (conviction.body && typeof conviction.body === 'object' && 'id' in conviction.body) {
      expect(conviction.body).toMatchObject({ userId: MOCK_USER_ID });

      const folderaEmails = extractEmails(conviction.body)
        .filter((email) => email.toLowerCase().endsWith('@foldera.ai'));

      expect(folderaEmails.every((email) => email.toLowerCase() === MOCK_USER_EMAIL)).toBe(true);
    }

    const integrations = await getJson(request, '/api/integrations/status');
    expect(integrations.response.status()).toBe(200);
  });

  test('pricing consistency', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('$29', { exact: true })).toBeVisible();
    await expect(page.getByText('$19', { exact: false })).toHaveCount(0);

    await page.goto('/');
    await expect(page.getByText('$19', { exact: false })).toHaveCount(0);
  });

  test('no mobile overflow on key routes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ['/', '/pricing', '/login', '/start']) {
      await page.goto(route);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(400);
    }
  });

  test('encrypted round-trip canary', async ({ request }) => {
    const integrations = await getJson(request, '/api/integrations/status');

    expect(integrations.response.status()).toBe(200);
    expect(integrations.body).not.toBeNull();
    expect(integrations.text.trim().startsWith('{')).toBe(true);
  });
});
