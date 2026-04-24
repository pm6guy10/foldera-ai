import { test, expect, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const HAS_NEXTAUTH_SECRET = Boolean(process.env.NEXTAUTH_SECRET?.trim());
const describeWithAuth = HAS_NEXTAUTH_SECRET ? test.describe : test.describe.skip;
const OUT_DIR = path.join(process.cwd(), '.screenshots', 'dashboard-seam');
const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT?.trim() || '3000';
const WEB_ORIGIN =
  process.env.PLAYWRIGHT_TEST_BASE_URL?.trim() ||
  process.env.BASE_URL?.trim() ||
  `http://127.0.0.1:${WEB_PORT}`;

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const SESSION_RESPONSE = {
  user: { id: MOCK_USER_ID, email: 'test@foldera.ai', name: 'Brandon Kapp' },
  expires: future,
};

const DIRECTIVE_RESPONSE = {
  id: 'action-visual-001',
  directive: 'Send the follow-up to Alex Morgan before noon.',
  action_type: 'send_message',
  confidence: 85,
  reason:
    'You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar makes this the cleanest unblocker today.',
  status: 'pending_approval',
  approved_count: 1,
  is_subscribed: true,
  evidence: [{ type: 'signal', description: 'Email thread with Alex Morgan' }],
  artifact: {
    type: 'email',
    to: 'alex.morgan@example.com',
    subject: 'Alex Morgan follow-up',
    body: 'Hi Alex —\n\nFollowing up on the update from yesterday.\nI pulled the latest status and can send the finalized version by noon unless you want one adjustment first.\n\nBest,\nBrandon',
  },
};

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
      const parsed = typeof url === 'string' ? new URL(url) : url;
      return parsed.pathname === apiPath || parsed.pathname === `${apiPath}/`;
    } catch {
      return false;
    }
  };
}

async function seedAuthenticatedSession(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for dashboard visual capture.');

  const sessionToken = await encode({
    secret,
    token: {
      sub: MOCK_USER_ID,
      userId: MOCK_USER_ID,
      email: SESSION_RESPONSE.user.email,
      name: SESSION_RESPONSE.user.name,
      hasOnboarded: true,
    },
  });

  await page.context().addCookies([
    {
      name: 'next-auth.session-token',
      value: sessionToken,
      url: new URL('/', WEB_ORIGIN).href,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function setupDashboardMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem('foldera_pending_checkout');
    } catch {
      /* ignore */
    }
  });
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(matchApiPath('/api/subscription/status'), fulfillJson({ plan: 'pro', status: 'active' }));
  await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
  await page.route(
    matchApiPath('/api/integrations/status'),
    fulfillJson({
      integrations: [
        { provider: 'google', is_active: true, sync_email: 'test@gmail.com', last_synced_at: null, missing_scopes: [] },
      ],
    }),
  );
  await page.route(matchApiPath('/api/conviction/latest'), fulfillJson(DIRECTIVE_RESPONSE));
  await page.route(matchApiPath('/api/conviction/execute'), fulfillJson({ status: 'executed' }));
  await page.route(matchApiPath('/api/stripe/checkout'), fulfillJson({ error: 'mock_checkout_disabled' }));
}

async function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

test.describe('Visual system screenshots', () => {
  test('capture landing desktop and mobile', async ({ page }) => {
    await ensureOutDir();

    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /One finished move\. Every morning\./i })).toBeVisible();
    await expect(page.getByText(/FOLDERA DESIGN SYSTEM/i)).toHaveCount(0);
    await expect(page.getByText(/DASHBOARD — PRODUCT VIEWS/i)).toHaveCount(0);
    await page.screenshot({ path: path.join(OUT_DIR, 'landing-desktop-clean.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 1200 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /One finished move\. Every morning\./i })).toBeVisible();
    await expect(page.getByText(/FOLDERA DESIGN SYSTEM/i)).toHaveCount(0);
    await expect(page.getByText(/DASHBOARD — PRODUCT VIEWS/i)).toHaveCount(0);
    await page.screenshot({ path: path.join(OUT_DIR, 'landing-mobile-clean.png'), fullPage: true });
  });
});

describeWithAuth('Visual system dashboard screenshots', () => {
  test('capture dashboard desktop and mobile', async ({ page }) => {
    await ensureOutDir();
    await setupDashboardMocks(page);
    const captures = [
      { width: 1440, height: 1200, file: 'dashboard-1440.png', maxBriefWidth: 980, rightRailVisible: true },
      { width: 1920, height: 1200, file: 'dashboard-1920.png', maxBriefWidth: 980, rightRailVisible: true },
      { width: 1280, height: 1200, file: 'dashboard-1280.png', maxBriefWidth: 960, rightRailVisible: true },
      { width: 1024, height: 1200, file: 'dashboard-1024.png', maxBriefWidth: 920, rightRailVisible: false },
      { width: 390, height: 1180, file: 'dashboard-390.png', maxBriefWidth: 390, rightRailVisible: false },
    ] as const;

    for (const capture of captures) {
      await page.setViewportSize({ width: capture.width, height: capture.height });
      await page.goto('/dashboard');

      await expect(page.getByRole('heading', { name: /Send the follow-up to Alex Morgan before noon\./i })).toBeVisible();
      await expect(page.getByText(/FOLDERA DESIGN SYSTEM/i)).toHaveCount(0);
      await expect(page.getByText(/DASHBOARD — PRODUCT VIEWS/i)).toHaveCount(0);
      await expect(page.getByText(/No live brief is queued right now/i)).toHaveCount(0);
      await expect(page.getByText(/Your Microsoft connection needs a quick refresh/i)).toHaveCount(0);
      await expect(page.getByText(/Foldera will post your next source-backed brief here/i)).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Run first read now/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Reconnect Microsoft/i })).toHaveCount(0);

      const briefCard = page.locator('article.foldera-brief-shell').first();
      await expect(briefCard).toBeVisible();
      const briefWidth = await briefCard.evaluate((node) =>
        Math.round((node as HTMLElement).getBoundingClientRect().width),
      );
      expect(briefWidth).toBeLessThanOrEqual(capture.maxBriefWidth);

      const rightRailLabel = page.getByText(/How this brief works/i).first();
      if (capture.rightRailVisible) {
        await expect(rightRailLabel).toBeVisible();
      } else {
        await expect(rightRailLabel).not.toBeVisible();
      }

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasOverflow).toBe(false);

      await page.screenshot({ path: path.join(OUT_DIR, capture.file), fullPage: true });
    }
  });
});
