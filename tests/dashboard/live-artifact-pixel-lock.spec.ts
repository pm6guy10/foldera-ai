import { test, expect, type Page, type Route } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const HAS_NEXTAUTH_SECRET = Boolean(process.env.NEXTAUTH_SECRET?.trim());
const describeWithAuth = HAS_NEXTAUTH_SECRET ? test.describe : test.describe.skip;

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT?.trim() || '3000';
const WEB_ORIGIN =
  process.env.PLAYWRIGHT_TEST_BASE_URL?.trim() ||
  process.env.BASE_URL?.trim() ||
  `http://127.0.0.1:${WEB_PORT}`;
const LONG_DOCUMENT_DIRECTIVE =
  'Darlene Craig (darlene.craig@esd.wa.gov) sent you interview questions for ESB Technician (2026-02344) on April 21. Here is your completed prep sheet built from those questions, your resume, and the job posting.';

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const SESSION_RESPONSE = {
  user: { id: MOCK_USER_ID, email: 'test@foldera.ai', name: 'Brandon Kapp' },
  expires: future,
};

type SetupOptions = {
  latestResponse: Record<string, unknown>;
  subscriptionResponse: Record<string, unknown>;
  onExecute?: (decision: string | null) => void;
  onCheckout?: () => void;
};

function json(data: unknown): string {
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

async function seedAuthenticatedSession(page: Page): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for authenticated dashboard tests.');

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

async function requiredBox(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`Missing visible box for ${testId}`);
  return box;
}

async function setupDashboardMocks(page: Page, options: SetupOptions): Promise<void> {
  await seedAuthenticatedSession(page);
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
  await page.route(
    matchApiPath('/api/integrations/status'),
    fulfillJson({
      integrations: [
        { provider: 'google', is_active: true, sync_email: 'test@gmail.com', last_synced_at: null, missing_scopes: [] },
      ],
    }),
  );
  await page.route(matchApiPath('/api/subscription/status'), fulfillJson(options.subscriptionResponse));
  await page.route(matchApiPath('/api/conviction/latest'), fulfillJson(options.latestResponse));
  await page.route(matchApiPath('/api/conviction/execute'), async (route) => {
    let decision: string | null = null;
    try {
      const payload = route.request().postDataJSON() as { decision?: unknown } | null;
      decision = typeof payload?.decision === 'string' ? payload.decision : null;
    } catch {
      decision = null;
    }
    options.onExecute?.(decision);
    await route.fulfill({ status: 200, contentType: 'application/json', body: json({ status: 'executed' }) });
  });
  await page.route(matchApiPath('/api/stripe/checkout'), async (route) => {
    options.onCheckout?.();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({ url: 'https://checkout.stripe.com/c/pay/cs_test_mock' }),
    });
  });
}

describeWithAuth('Dashboard pixel-lock live artifact', () => {
  test('shows write_document artifact in frame with type-correct actions and clickable hotspots', async ({ page }) => {
    let approveCalls = 0;
    let skipCalls = 0;
    await page.addInitScript(() => {
      const copied: string[] = [];
      const clipboard = {
        writeText: (value: string) => {
          copied.push(value);
          return Promise.resolve();
        },
      };
      Object.defineProperty(window.navigator, 'clipboard', {
        value: clipboard,
        configurable: true,
      });
      (window as Window & { __pixelLockCopied?: string[] }).__pixelLockCopied = copied;
    });

    await setupDashboardMocks(page, {
      latestResponse: {
        id: 'action-pixel-lock-001',
        directive: LONG_DOCUMENT_DIRECTIVE,
        action_type: 'write_document',
        confidence: 87,
        reason: 'Darlene Craig sent interview questions for 2026-02344 directly to you.',
        status: 'pending_approval',
        artifact: {
          type: 'document',
          title: 'MAS3 interview packet resolution',
          content: 'Assign Holly as final packet owner and confirm reference bundle by 4 PM PT.',
        },
        free_artifact_remaining: true,
        artifact_paywall_locked: false,
        approved_count: 0,
      },
      subscriptionResponse: { plan: 'free', status: 'inactive' },
      onExecute: (decision) => {
        if (decision === 'approve') approveCalls += 1;
        if (decision === 'skip') skipCalls += 1;
      },
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');

    await expect(page.getByTestId('pixel-lock-frame')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('pixel-lock-artifact-title')).toHaveText(LONG_DOCUMENT_DIRECTIVE);
    await expect(page.getByTestId('pixel-lock-artifact-body')).toContainText('Assign Holly as final packet owner');

    const directiveBox = await requiredBox(page, 'dashboard-brief-directive-section');
    const whyBox = await requiredBox(page, 'dashboard-brief-why-section');
    const draftBox = await requiredBox(page, 'dashboard-brief-draft-section');
    expect(directiveBox.y + directiveBox.height).toBeLessThanOrEqual(whyBox.y + 1);
    expect(whyBox.y + whyBox.height).toBeLessThanOrEqual(draftBox.y + 1);

    const noHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noHorizontalScroll).toBe(true);

    const desktopBodyOverflowHidden = await page.evaluate(() => {
      const style = window.getComputedStyle(document.body);
      return style.overflow === 'hidden' && style.overflowX === 'hidden';
    });
    expect(desktopBodyOverflowHidden).toBe(true);

    await expect(page.getByRole('button', { name: /copy draft/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^skip$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /snooze 24h/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^save$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /approve & send/i })).toHaveCount(0);
    await expect(page.getByTestId('dashboard-truth-stats')).toContainText('open threads');
    await expect(page.getByText(/Drop a folder or document/i)).toHaveCount(0);
    await expect(page.getByText(/Search Foldera/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /notifications/i })).toHaveCount(0);
    await expect(page.getByText(/^Upgrade to Pro$/i)).toHaveCount(0);

    await page.getByRole('button', { name: /copy draft/i }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          return (window as Window & { __pixelLockCopied?: string[] }).__pixelLockCopied?.length ?? 0;
        }),
      )
      .toBeGreaterThan(0);
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute(
      'data-status-id',
      'copy_succeeded',
    );

    await page.getByTestId('dashboard-primary-action').click();
    await expect.poll(() => approveCalls).toBeGreaterThan(0);
    expect(skipCalls).toBe(0);
  });

  test('preserves send_message labels and shows upgrade CTA overlay only when artifact is paywall-locked', async ({ page }) => {
    let checkoutCalls = 0;
    await setupDashboardMocks(page, {
      latestResponse: {
        id: 'action-pixel-lock-002',
        directive: 'Send follow-up email.',
        action_type: 'send_message',
        confidence: 84,
        reason: 'Time-bound ask with no recent reply.',
        status: 'pending_approval',
        artifact: {
          type: 'email',
          subject: 'Follow-up on packet owner confirmation',
          body: 'Hi Holly, can you confirm ownership by 4 PM PT?',
        },
        free_artifact_remaining: false,
        artifact_paywall_locked: true,
        approved_count: 4,
      },
      subscriptionResponse: { plan: 'free', status: 'inactive' },
      onCheckout: () => {
        checkoutCalls += 1;
      },
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');

    await expect(page.getByTestId('pixel-lock-frame')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /copy draft/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^approve$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /approve & send/i })).toHaveCount(0);
    await expect(page.getByText('Upgrade to Pro to keep receiving finished work.')).toBeVisible();
    await page.getByRole('button', { name: /^Upgrade to Pro$/i }).click();
    await expect.poll(() => checkoutCalls).toBeGreaterThan(0);
  });
});
