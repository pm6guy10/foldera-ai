import { expect, test, type Page, type Route } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';
import fs from 'node:fs';
import path from 'node:path';

loadEnv({ path: '.env.local' });

const HAS_NEXTAUTH_SECRET = Boolean(process.env.NEXTAUTH_SECRET?.trim());
const describeWithAuth = HAS_NEXTAUTH_SECRET ? test.describe : test.describe.skip;

const OUT_DIR = path.join(process.cwd(), '.screenshots', 'landing-hero');
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
  discrepancy_card: {
    claim: 'Send the follow-up to Alex Morgan before noon.',
    contradiction:
      'The Alex Morgan thread still has no reply, but the calendar hold makes the ask time-bound today.',
    risk: 'The noon window may slip if the prepared response is not approved during this session.',
    evidence: [
      'Email thread with Alex Morgan is still awaiting a response.',
      'Calendar hold creates a noon decision window.',
    ],
    next_action: 'Send the prepared follow-up to Alex Morgan before noon.',
    why_now: 'The open thread and calendar hold are both active today.',
    source_refs: ['email:alex-morgan-thread', 'calendar:noon-hold'],
    confidence: 0.85,
    pattern_keys: ['discrepancy:meeting_open_thread', 'action:send_message'],
  },
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
  test('capture landing storyboard at required breakpoints', async ({ page }) => {
    await ensureOutDir();

    const captures = [
      { width: 390, height: 844, file: 'landing-hero-390x844.png' },
      { width: 768, height: 1024, file: 'landing-hero-768x1024.png' },
      { width: 1440, height: 1600, file: 'landing-hero-1440x1600.png' },
    ] as const;

    for (const capture of captures) {
      await page.setViewportSize({ width: capture.width, height: capture.height });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Workday Presence Layer/i })).toBeVisible();
      await page.screenshot({ path: path.join(OUT_DIR, capture.file), fullPage: true });
    }
  });
});

describeWithAuth('Visual system dashboard screenshots', () => {
  test('capture dashboard desktop and mobile', async ({ page }) => {
    await ensureOutDir();
    await setupDashboardMocks(page);
    const captures = [
      { width: 1440, height: 1200, file: 'dashboard-1440.png', minBriefWidth: 760 },
      { width: 1920, height: 1200, file: 'dashboard-1920.png', minBriefWidth: 760 },
      { width: 1280, height: 1200, file: 'dashboard-1280.png', maxBriefWidth: 940 },
      { width: 1024, height: 1200, file: 'dashboard-1024.png', maxBriefWidth: 1024, rightRailVisible: false },
      { width: 390, height: 1180, file: 'dashboard-390.png', maxBriefWidth: 390, rightRailVisible: false },
    ] as const;

    for (const capture of captures) {
      await page.setViewportSize({ width: capture.width, height: capture.height });
      await page.goto('/dashboard');

      await expect(
        page.getByRole('heading', {
          name: /Send the follow-up to Alex Morgan before noon\.|No safe artifact today\./i,
        }),
      ).toBeVisible();
      await expect(page.getByText(/FOLDERA DESIGN SYSTEM/i)).toHaveCount(0);
      await expect(page.getByText(/DASHBOARD — PRODUCT VIEWS/i)).toHaveCount(0);
      await expect(page.getByText(/No live brief is queued right now/i)).toHaveCount(0);
      await expect(page.getByText(/Your Microsoft connection needs a quick refresh/i)).toHaveCount(0);
      await expect(page.getByText(/Foldera will post your next source-backed brief here/i)).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Run first read now/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Reconnect Microsoft/i })).toHaveCount(0);

      const briefCard = page.locator('[data-testid="dashboard-figma-card-frame"], .foldera-brief-shell').first();
      await expect(briefCard).toBeVisible();
      const briefWidth = await briefCard.evaluate((node) =>
        Math.round((node as HTMLElement).getBoundingClientRect().width),
      );
      if ('minBriefWidth' in capture) {
        expect(briefWidth).toBeGreaterThanOrEqual(capture.minBriefWidth);
      } else {
        expect(briefWidth).toBeLessThanOrEqual(capture.maxBriefWidth);
      }

      const rightRailLabel = page
        .getByRole('heading', { name: /Context behind the current move|Evidence behind today's move/i })
        .first();
      if (capture.rightRailVisible === false) {
        await expect(rightRailLabel).not.toBeVisible();
      } else {
        await expect(rightRailLabel).toBeVisible();
      }

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasOverflow).toBe(false);

      await page.screenshot({ path: path.join(OUT_DIR, capture.file), fullPage: true });
      if (capture.file === 'dashboard-1440.png') {
        await page.screenshot({ path: path.join(OUT_DIR, 'dashboard-1440-static.png'), fullPage: true });
        await page.screenshot({ path: path.join(OUT_DIR, 'dashboard-1440-corrected.png'), fullPage: true });
      }
    }
  });
});

