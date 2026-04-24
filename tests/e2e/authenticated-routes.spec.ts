/**
 * Authenticated route smoke tests — mocked NextAuth session.
 * Covers: /dashboard, /dashboard/settings, /dashboard/briefings, /dashboard/signals
 * Tests: directive card, approve/skip buttons, provider cards, console errors
 * Viewports: 390px (mobile) and 1280px (desktop)
 *
 * NextAuth uses /api/auth/session to determine auth state.
 * We intercept that request AND /api/auth/csrf to provide a complete
 * mock session. We also mock all downstream API calls.
 *
 * Requires NEXTAUTH_SECRET in .env.local (generate with openssl).
 * Production smoke with a real browser session: npm run test:prod:setup then npm run test:prod.
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';
import fs from 'node:fs';
import path from 'node:path';

loadEnv({ path: '.env.local' });

const HAS_NEXTAUTH_SECRET = Boolean(process.env.NEXTAUTH_SECRET?.trim());
const describeAuthMocked = HAS_NEXTAUTH_SECRET ? test.describe : test.describe.skip;

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
const E2E_PORT = process.env.PLAYWRIGHT_WEB_PORT?.trim() || '3000';
/** Must match Playwright `use.baseURL`. Empty `PLAYWRIGHT_TEST_BASE_URL` must not win — addCookies requires a valid url. */
const E2E_ORIGIN =
  process.env.PLAYWRIGHT_TEST_BASE_URL?.trim() ||
  process.env.BASE_URL?.trim() ||
  `http://127.0.0.1:${E2E_PORT}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('Failed to load resource')) return;
      if (text.includes('favicon')) return;
      if (text.includes('React DevTools')) return;
      if (text.includes('Download the React DevTools')) return;
      if (text.includes('Third-party cookie')) return;
      if (text.includes('NEXT_REDIRECT')) return;
      if (text.includes('net::ERR_')) return;
      errors.push(text);
    }
  });
  return errors;
}

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const SESSION_RESPONSE = {
  user: { id: MOCK_USER_ID, email: 'test@foldera.ai', name: 'Test User' },
  expires: future,
};

const DIRECTIVE_RESPONSE = {
  id: 'action-001',
  directive: 'Send a follow-up email to Keri Nopens about the MAS3 timeline.',
  action_type: 'send_message',
  confidence: 85,
  reason: 'Last contact was 5 days ago and the hiring window closes next week.',
  status: 'pending_approval',
  approved_count: 1,
  is_subscribed: true,
  evidence: [{ type: 'signal', description: 'Email from Keri on March 14' }],
  artifact: {
    type: 'email',
    to: 'keri.nopens@example.com',
    subject: 'MAS3 timeline follow-up',
    body: 'Hi Keri,\n\nI wanted to follow up on the MAS3 timeline.\n\nBest,\nBrandon',
    draft_type: 'email_compose',
  },
};

/** write_document-style pending row — dashboard must render document body (not an empty artifact panel). */
const DOCUMENT_DIRECTIVE_RESPONSE = {
  id: 'action-doc-001',
  directive: 'Finalize the MAS3 interview packet owner by 2026-04-02.',
  action_type: 'write_document',
  confidence: 74,
  reason: 'The interview packet stalls unless one owner confirms the final reference bundle today.',
  status: 'pending_approval',
  is_subscribed: true,
  evidence: [],
  artifact: {
    type: 'document',
    title: 'MAS3 interview packet resolution - 2026-04-02',
    body: [
      '## Situation',
      'The MAS3 interview packet is still missing a committed owner for the final reference bundle on 2026-04-02.',
      '',
      '## Blocking risk',
      'If ownership stays unresolved through 2026-04-02, the packet slips and the interview loop loses momentum.',
      '',
      '## Recommendation / decision',
      'Assign Holly as final packet owner and have her confirm whether the two missing reference talking points will land today.',
      'Ask: confirm the owner and send/no-send decision by 2026-04-02 at 4 PM PT.',
      'Consequence: if unresolved by 4 PM PT, the packet misses the same-day handoff and the interview loop slips.',
      '',
      '## Owner / next step',
      'Holly replies with the named owner, confirms whether the reference bundle ships today, and updates the shared packet thread immediately.',
      '',
      '## Timing / deadline',
      'Decide by 4 PM PT on 2026-04-02 so the packet can still go out the same day.',
    ].join('\n'),
  },
};

const STALE_EMAIL_DIRECTIVE = {
  ...DIRECTIVE_RESPONSE,
  id: 'stale-action-for-skip-test',
};

function findDocumentLine(body: string, prefix: string): string {
  const line = body.split('\n').find((entry) => entry.startsWith(prefix));
  if (!line) throw new Error(`Missing document line with prefix: ${prefix}`);
  return line;
}

const DOCUMENT_DIRECTIVE_TITLE = DOCUMENT_DIRECTIVE_RESPONSE.directive.replace(/\.$/, '');
const DOCUMENT_DIRECTIVE_BODY = DOCUMENT_DIRECTIVE_RESPONSE.artifact.body;
const DOCUMENT_DIRECTIVE_ASK = findDocumentLine(DOCUMENT_DIRECTIVE_BODY, 'Ask:');
const DOCUMENT_DIRECTIVE_CONSEQUENCE = findDocumentLine(DOCUMENT_DIRECTIVE_BODY, 'Consequence:');

/**
 * Assert the dashboard document body rendered Markdown (via ReactMarkdown), not raw text.
 *
 * Rationale: the dashboard passes artifact.body through ReactMarkdown, so `## Situation`
 * becomes an <h2>Situation</h2> — asserting raw `##` syntax against the DOM is structurally
 * broken and was the root cause of three CI failures on 2026-04-22. Always assert on
 * rendered headings (role=heading) + visible body text; never on raw markdown syntax.
 *
 * NOTE: If this helper changes shape, update lessons-learned entry "Rendered Markdown vs Raw
 * Markdown" in LESSONS_LEARNED.md so future agents don't reintroduce the bug.
 */
async function expectRenderedDocumentMarkdown(
  body: import('@playwright/test').Locator,
  opts: { headings: string[]; bodyLines: string[] },
): Promise<void> {
  await expect(body).toBeVisible();
  for (const heading of opts.headings) {
    await expect(
      body.getByRole('heading', { name: new RegExp(`^${heading}$`, 'i') }),
    ).toBeVisible();
  }
  for (const line of opts.bodyLines) {
    await expect(body).toContainText(line);
  }
}

async function expectDashboardStatus(page: Page, expectedStatusId: string): Promise<void> {
  const notice = page.getByTestId('dashboard-status-notice');
  await expect(notice).toBeVisible({ timeout: 8000 });
  await expect(notice).toHaveAttribute('data-status-id', expectedStatusId);
}

const INTEGRATIONS_RESPONSE = {
  integrations: [
    { provider: 'google', is_active: true, sync_email: 'test@gmail.com', last_synced_at: null, missing_scopes: [] },
    { provider: 'azure_ad', is_active: true, sync_email: 'test@outlook.com', last_synced_at: '2026-04-13T10:00:00.000Z', missing_scopes: [] },
  ],
};

const INTEGRATIONS_SYNCING_RESPONSE = {
  integrations: [
    { provider: 'google', is_active: true, sync_email: 'test@gmail.com', last_synced_at: null, missing_scopes: [] },
  ],
};

const INTEGRATIONS_MISSING_SCOPES_RESPONSE = {
  integrations: [
    {
      provider: 'google',
      is_active: true,
      sync_email: 'test@gmail.com',
      last_synced_at: '2026-04-13T10:00:00.000Z',
      missing_scopes: ['Gmail read access', 'send access'],
    },
  ],
};

const INTEGRATIONS_GOOGLE_REAUTH_RESPONSE = {
  integrations: [
    {
      provider: 'google',
      is_active: false,
      sync_email: 'test@gmail.com',
      last_synced_at: '2026-04-13T10:00:00.000Z',
      needs_reauth: true,
      missing_scopes: [],
    },
  ],
};

const INTEGRATIONS_MICROSOFT_REAUTH_RESPONSE = {
  integrations: [
    {
      provider: 'azure_ad',
      is_active: false,
      sync_email: 'test@outlook.com',
      last_synced_at: '2026-04-13T10:00:00.000Z',
      needs_reauth: true,
      missing_scopes: [],
    },
  ],
};

const PRO_SUBSCRIPTION_RESPONSE = {
  plan: 'pro',
  status: 'active',
  current_period_end: null,
  can_manage_billing: true,
};

const FREE_SUBSCRIPTION_RESPONSE = {
  plan: 'free',
  status: 'inactive',
  current_period_end: null,
  can_manage_billing: false,
};

const GRAPH_STATS_RESPONSE = {
  signalsTotal: 24,
  commitmentsActive: 3,
  patternsActive: 2,
  lastSignalAt: '2026-04-20T08:30:00.000Z',
  lastSignalSource: 'azure_ad',
};

function json(data: unknown) {
  return JSON.stringify(data);
}

function fulfillJson(data: unknown) {
  return (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(data) });
}

/**
 * Match same-origin API requests by pathname (ignores query string).
 * Playwright URL globs do not match paths that include a query string, so unmocked fetches hit the real API (401).
 */
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

async function seedAuthenticatedSession(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for authenticated route tests.');
  }

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

  // Matches getAuthOptions(): local `next start` (no VERCEL) uses `next-auth.session-token` without __Secure-.
  // Avoid setExtraHTTPHeaders(Cookie): it breaks /_next/static chunk loading.
  // Playwright: use `url` OR `path` (not both) — see playwright-core network.js assert.
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

/** Prevent dashboard post-auth Stripe redirect from hijacking Playwright when .env has real Stripe keys. */
async function attachCheckoutGuards(page: Page) {
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
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: json({ error: 'mock' }),
    });
  });
}

/** Set up all mocks for an authenticated dashboard with a directive. */
async function setupDashboardMocks(
  page: Page,
  options: {
    latestResponse?: Record<string, unknown>;
    subscriptionResponse?: Record<string, unknown>;
  } = {},
) {
  await seedAuthenticatedSession(page);
  await attachCheckoutGuards(page);
  // NextAuth session + CSRF
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson(options.subscriptionResponse ?? PRO_SUBSCRIPTION_RESPONSE),
  );
  await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(INTEGRATIONS_RESPONSE));
  await page.route(matchApiPath('/api/conviction/latest'), fulfillJson(options.latestResponse ?? DIRECTIVE_RESPONSE));
  await page.route(matchApiPath('/api/conviction/execute'), async (route) => {
    let decision: string | undefined;
    try {
      decision = route.request().postDataJSON()?.decision as string | undefined;
    } catch {
      decision = undefined;
    }
    const status = decision === 'skip' ? 'skipped' : 'executed';
    await route.fulfill({ status: 200, contentType: 'application/json', body: json({ status }) });
  });
}

/** Set up mocks for dashboard with no directive (empty state). */
async function setupEmptyDashboardMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await attachCheckoutGuards(page);
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson({ plan: 'pro', status: 'active' }),
  );
  await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(INTEGRATIONS_RESPONSE));
  await page.route(matchApiPath('/api/conviction/latest'), fulfillJson({}));
}

/** Set up mocks for settings page. */
async function setupSettingsMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await attachCheckoutGuards(page);
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson({ plan: 'pro', status: 'active', can_manage_billing: true }),
  );
  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(INTEGRATIONS_RESPONSE));
  await page.route(matchApiPath('/api/graph/stats'), fulfillJson(GRAPH_STATS_RESPONSE));
  await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ buckets: [], freeText: null }));
}

async function setupSettingsSyncingMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await attachCheckoutGuards(page);
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson({ plan: 'pro', status: 'active', can_manage_billing: true }),
  );
  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(INTEGRATIONS_SYNCING_RESPONSE));
  await page.route(matchApiPath('/api/graph/stats'), fulfillJson(GRAPH_STATS_RESPONSE));
  await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ buckets: [], freeText: null }));
}

async function setupSettingsMissingScopesMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await attachCheckoutGuards(page);
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson({ plan: 'pro', status: 'active', can_manage_billing: true }),
  );
  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(INTEGRATIONS_MISSING_SCOPES_RESPONSE));
  await page.route(matchApiPath('/api/graph/stats'), fulfillJson(GRAPH_STATS_RESPONSE));
  await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ buckets: [], freeText: null }));
}

async function setupSettingsMicrosoftReauthMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await attachCheckoutGuards(page);
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson({ plan: 'pro', status: 'active', can_manage_billing: true }),
  );
  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(INTEGRATIONS_MICROSOFT_REAUTH_RESPONSE));
  await page.route(matchApiPath('/api/graph/stats'), fulfillJson(GRAPH_STATS_RESPONSE));
  await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ buckets: [], freeText: null }));
}

async function setupSettingsGoogleReauthMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await attachCheckoutGuards(page);
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson({ plan: 'pro', status: 'active', can_manage_billing: true }),
  );
  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(INTEGRATIONS_GOOGLE_REAUTH_RESPONSE));
  await page.route(matchApiPath('/api/graph/stats'), fulfillJson(GRAPH_STATS_RESPONSE));
  await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ buckets: [], freeText: null }));
}

async function setupSettingsManageBillingMocks(page: Page) {
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
  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson({ plan: 'pro', status: 'active', can_manage_billing: true }),
  );
  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(INTEGRATIONS_RESPONSE));
  await page.route(matchApiPath('/api/graph/stats'), fulfillJson(GRAPH_STATS_RESPONSE));
  await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ buckets: [], freeText: null }));
  await page.route(matchApiPath('/api/stripe/portal'), (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({ url: 'https://billing.stripe.com/p/session_test_123' }),
    });
  });
  await page.route(matchApiPath('/api/stripe/checkout'), (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({ error: 'mock_checkout_disabled' }),
    });
  });
}

/** Past directives list — mocks `GET /api/conviction/history`. */
async function setupBriefingsMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await attachCheckoutGuards(page);
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(
    matchApiPath('/api/conviction/history'),
    fulfillJson({
      items: [
        {
          id: 'h1',
          status: 'executed',
          action_type: 'send_message',
          confidence: 80,
          generated_at: '2026-04-01T10:00:00.000Z',
          directive_preview: 'First directive preview text for e2e.',
        },
      ],
    }),
  );
}

/** Sources page — mocks `GET /api/graph/stats` + integrations (same as settings). */
async function setupSignalsPageMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await attachCheckoutGuards(page);
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson({ plan: 'pro', status: 'active', current_period_end: null, can_manage_billing: true }),
  );
  await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
  await page.route(
    matchApiPath('/api/graph/stats'),
    fulfillJson({
      signalsTotal: 0,
      commitmentsActive: 0,
      patternsActive: 0,
      lastSignalAt: null,
      lastSignalSource: null,
    }),
  );
  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(INTEGRATIONS_RESPONSE));
}

// ── Dashboard tests ─────────────────────────────────────────────────────────

describeAuthMocked('Dashboard /dashboard — authenticated', () => {
  test('loads and shows directive card — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');
    await expect(page.getByText(/follow-up email/i)).toBeVisible({ timeout: 15000 });
  });

  test('approve button is clickable', async ({ page }) => {
    await setupDashboardMocks(page);
    await page.goto('/dashboard');
    await expect(page.getByText(/follow-up email/i)).toBeVisible({ timeout: 15000 });
    const approveBtn = page.getByRole('button', { name: /approve/i });
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();
    await expectDashboardStatus(page, 'approve_sent');
    await expect(page.getByText(/sent|check your outbox/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('skip button is clickable', async ({ page }) => {
    await setupDashboardMocks(page);
    await page.goto('/dashboard');
    await expect(page.getByText(/follow-up email/i)).toBeVisible({ timeout: 15000 });
    const skipBtn = page.getByRole('button', { name: /snooze 24h|skip/i });
    await expect(skipBtn).toBeVisible();
    await skipBtn.click();
    await expectDashboardStatus(page, 'skip_snoozed');
    await expect(page.getByText(/snoozed|adjust/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('loads dashboard contract card when no directive — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupEmptyDashboardMocks(page);
    await page.goto('/dashboard');
    await expect(
      page.getByRole('heading', { name: /Send the follow-up to Alex Morgan before noon\./i }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/No live brief is queued right now/i)).toHaveCount(0);
    await expect(page.getByText(/Your Microsoft connection needs a quick refresh/i)).toHaveCount(0);
    await expect(page.getByText(/Foldera will post your next source-backed brief here/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Run first read now/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Reconnect Microsoft/i })).toHaveCount(0);
  });

  test('no actionable console errors — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = collectConsoleErrors(page);
    await setupDashboardMocks(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('loads directive card — mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');
    await expect(page.getByText(/follow-up email/i)).toBeVisible({ timeout: 15000 });
  });

  test('no actionable console errors — mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectConsoleErrors(page);
    await setupDashboardMocks(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('non-Pro users still see the first 3 approved or pending artifacts @payments', async ({ page }) => {
    await setupDashboardMocks(page, {
      latestResponse: {
        ...DIRECTIVE_RESPONSE,
        approved_count: 3,
        is_subscribed: false,
      },
      subscriptionResponse: FREE_SUBSCRIPTION_RESPONSE,
    });
    await page.goto('/dashboard');
    await expect(page.getByText(/follow-up email/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Hi Keri,/i)).toBeVisible();
    await expect(page.getByTestId('dashboard-pro-blur')).toHaveCount(0);
  });

  test('non-Pro users see the blur starting with artifact 4 @payments', async ({ page }) => {
    await setupDashboardMocks(page, {
      latestResponse: {
        ...DIRECTIVE_RESPONSE,
        approved_count: 4,
        is_subscribed: false,
      },
      subscriptionResponse: FREE_SUBSCRIPTION_RESPONSE,
    });
    await page.goto('/dashboard');
    await expect(page.getByText(/follow-up email/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('dashboard-pro-blur')).toBeVisible();
    await expect(
      page.getByText('Upgrade to Pro to keep receiving finished work.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /upgrade to pro/i })).toBeVisible();
  });

  test('write_document journey: document preview, save action, saved status', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedAuthenticatedSession(page);
    await attachCheckoutGuards(page);
    await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
    await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
    await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
    await page.route(
      matchApiPath('/api/subscription/status'),
      fulfillJson({ plan: 'pro', status: 'active', current_period_end: null, can_manage_billing: true }),
    );
    await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
    await page.route(matchApiPath('/api/integrations/status'), fulfillJson(INTEGRATIONS_RESPONSE));
    await page.route(matchApiPath('/api/conviction/latest'), fulfillJson(DOCUMENT_DIRECTIVE_RESPONSE));
    await page.route(matchApiPath('/api/conviction/execute'), async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          status: 'executed',
          action_id: DOCUMENT_DIRECTIVE_RESPONSE.id,
          action_type: 'write_document',
          result: { saved: true },
        }),
      });
    });
    await page.goto('/dashboard');
    const documentBody = page.getByTestId('dashboard-document-body');
    await expect(
      page.getByRole('heading', { name: new RegExp(DOCUMENT_DIRECTIVE_TITLE, 'i') }),
    ).toBeVisible({ timeout: 15000 });
    await expectRenderedDocumentMarkdown(documentBody, {
      headings: ['Situation', 'Blocking risk', 'Recommendation / decision'],
      bodyLines: [DOCUMENT_DIRECTIVE_ASK, DOCUMENT_DIRECTIVE_CONSEQUENCE],
    });
    await expect(page.getByText(/^DOCUMENT$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /save document/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /skip and adjust/i })).toBeVisible();
    const screenshotPath = path.join(process.cwd(), '.screenshots', 'write-document-journey-1280.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    await page.getByTestId('dashboard-primary-action').click();
    await expectDashboardStatus(page, 'approve_saved_document');
    await expect(page.getByText(/Saved\. Your document is in Foldera Signals/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/It worked/i)).toBeVisible();
  });

  test('stale email deep-link skip reconciles after execute 404 (query params cleared)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedAuthenticatedSession(page);
    await attachCheckoutGuards(page);
    await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
    await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
    await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
    await page.route(
      matchApiPath('/api/subscription/status'),
      fulfillJson({ plan: 'pro', status: 'active', current_period_end: null, can_manage_billing: true }),
    );
    await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
    let latestCalls = 0;
    await page.route(matchApiPath('/api/conviction/latest'), async (route) => {
      latestCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: json(DOCUMENT_DIRECTIVE_RESPONSE) });
    });
    await page.route(matchApiPath('/api/conviction/execute'), async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: json({ error: 'Action already claimed by another request or not found' }),
      });
    });
    await page.goto(
      '/dashboard?action=skip&id=00000000-0000-0000-0000-000000000099',
    );
    const documentBody = page.getByTestId('dashboard-document-body');
    await expectDashboardStatus(page, 'reconciled_stale_action');
    await expect(page.getByText(/already handled or replaced/i)).toBeVisible({ timeout: 15000 });
    await expect.poll(() => latestCalls).toBe(2);
    await expect(
      page.getByRole('heading', { name: new RegExp(DOCUMENT_DIRECTIVE_TITLE, 'i') }),
    ).toBeVisible();
    await expectRenderedDocumentMarkdown(documentBody, {
      headings: ['Situation', 'Blocking risk', 'Recommendation / decision'],
      bodyLines: [DOCUMENT_DIRECTIVE_ASK, DOCUMENT_DIRECTIVE_CONSEQUENCE],
    });
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('skip on stale client action id reloads latest directive', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedAuthenticatedSession(page);
    await attachCheckoutGuards(page);
    await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
    await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
    await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
    await page.route(
      matchApiPath('/api/subscription/status'),
      fulfillJson({ plan: 'pro', status: 'active', current_period_end: null, can_manage_billing: true }),
    );
    await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
    let latestCalls = 0;
    await page.route(matchApiPath('/api/conviction/latest'), (route) => {
      latestCalls += 1;
      const payload = latestCalls === 1 ? STALE_EMAIL_DIRECTIVE : DOCUMENT_DIRECTIVE_RESPONSE;
      route.fulfill({ status: 200, contentType: 'application/json', body: json(payload) });
    });
    await page.route(matchApiPath('/api/conviction/execute'), async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: json({ error: 'Action already claimed by another request or not found' }),
      });
    });
    await page.goto('/dashboard');
    const documentBody = page.getByTestId('dashboard-document-body');
    await expect(page.getByText(/follow-up email/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /snooze 24h|skip/i }).click();
    await expectDashboardStatus(page, 'reconciled_stale_action');
    await expect(page.getByText(/already handled or replaced/i)).toBeVisible({ timeout: 10000 });
    await expect.poll(() => latestCalls).toBe(2);
    await expect(
      page.getByRole('heading', { name: new RegExp(DOCUMENT_DIRECTIVE_TITLE, 'i') }),
    ).toBeVisible();
    await expectRenderedDocumentMarkdown(documentBody, {
      headings: ['Situation', 'Blocking risk', 'Recommendation / decision'],
      bodyLines: [DOCUMENT_DIRECTIVE_ASK, DOCUMENT_DIRECTIVE_CONSEQUENCE],
    });
  });
});

// ── Settings tests ──────────────────────────────────────────────────────────

describeAuthMocked('Settings /dashboard/settings — authenticated', () => {
  test('loads with provider cards visible — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupSettingsMocks(page);
    await page.goto('/dashboard/settings');
    await expect(page.getByRole('heading', { name: /connected accounts/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/google/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/microsoft/i).first()).toBeVisible();
  });

  test('loads with provider cards visible — mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupSettingsMocks(page);
    await page.goto('/dashboard/settings');
    await expect(page.getByText(/google/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/microsoft/i).first()).toBeVisible();
  });

  test('no actionable console errors — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = collectConsoleErrors(page);
    await setupSettingsMocks(page);
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('shows first-run sync and next-step guidance — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupSettingsSyncingMocks(page);
    await page.goto('/dashboard/settings');
    await expect(page.getByText(/Foldera is reading your connected sources and looking for the one thing silently blocking your real goal/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/No extra setup required/i)).toBeVisible();
    await expect(page.getByText(/Latest source signal/i)).toBeVisible();
    await expect(page.getByText(/Open legacy signals view/i)).toBeVisible();
    await expect(page.getByText(/signed in as/i)).toBeVisible();
  });

  test('shows missing-scope reconnect guidance — mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupSettingsMissingScopesMocks(page);
    await page.goto('/dashboard/settings');
    await expect(page.getByText(/one more consent step to keep reading/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/reconnect required/i).first()).toBeVisible();
    await expect(page.getByText(/Gmail read access/i).first()).toBeVisible();
  });

  test('shows Google reconnect state without auto-refresh failure blame', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupSettingsGoogleReauthMocks(page);
    await page.goto('/dashboard/settings');
    const googleReconnectCopy = page.getByText(
      /Google needs a quick reconnect to resume background sync/i,
    );
    const googleReconnectCard = page
      .locator('div.rounded-2xl')
      .filter({ has: googleReconnectCopy })
      .first();
    await expect(googleReconnectCopy).toBeVisible({
      timeout: 15000,
    });
    await expect(googleReconnectCard.getByRole('button', { name: /^Connect$/i })).toBeVisible();
  });

  test('shows Microsoft reconnect state without auto-refresh failure blame', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupSettingsMicrosoftReauthMocks(page);
    await page.goto('/dashboard/settings');
    const microsoftReconnectCopy = page.getByText(
      /Microsoft needs a quick reconnect to resume background sync/i,
    );
    const microsoftReconnectCard = page
      .locator('div.rounded-2xl')
      .filter({ has: microsoftReconnectCopy })
      .first();
    await expect(microsoftReconnectCopy).toBeVisible({
      timeout: 15000,
    });
    await expect(microsoftReconnectCard.getByRole('button', { name: /^Connect$/i })).toBeVisible();
  });

  test('Manage subscription redirects to the Stripe billing portal URL returned by the Settings API @payments', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupSettingsManageBillingMocks(page);
    await page.goto('/dashboard/settings');

    await page.getByRole('button', { name: /Manage subscription/i }).click();
    await page.waitForURL('https://billing.stripe.com/p/session_test_123', {
      timeout: 15000,
    });
  });

  test('Google Connect redirects from Settings into the Google OAuth authorize URL', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupSettingsGoogleReauthMocks(page);
    let googleConnectHit = false;
    await page.route(matchApiPath('/api/google/connect'), (route) =>
      {
        googleConnectHit = true;
        return route.fulfill({
          status: 307,
          headers: {
            location:
              'https://accounts.google.com/o/oauth2/v2/auth?client_id=mock-client&redirect_uri=https%3A%2F%2Fwww.foldera.ai%2Fapi%2Fgoogle%2Fcallback',
          },
        });
      },
    );
    await page.goto('/dashboard/settings');

    const googleReconnectCopy = page.getByText(
      /Google needs a quick reconnect to resume background sync/i,
    );
    const googleReconnectCard = page
      .locator('div.rounded-2xl')
      .filter({ has: googleReconnectCopy })
      .first();

    const googleConnectRequest = page.waitForRequest(
      (request) => {
        try {
          return new URL(request.url()).pathname === '/api/google/connect';
        } catch {
          return false;
        }
      },
      {
        timeout: 15000,
      },
    );

    await googleReconnectCard.getByRole('button', { name: /^Connect$/i }).click({ noWaitAfter: true });
    await googleConnectRequest;
    expect(googleConnectHit).toBe(true);
  });

  test('Microsoft Connect redirects from Settings into the Microsoft OAuth authorize URL', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupSettingsMicrosoftReauthMocks(page);
    await page.route(matchApiPath('/api/microsoft/connect'), (route) =>
      route.fulfill({
        status: 307,
        headers: {
          location:
            'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=mock-client&redirect_uri=https%3A%2F%2Fwww.foldera.ai%2Fapi%2Fmicrosoft%2Fcallback',
        },
      }),
    );
    await page.goto('/dashboard/settings');

    const microsoftReconnectCopy = page.getByText(
      /Microsoft needs a quick reconnect to resume background sync/i,
    );
    const microsoftReconnectCard = page
      .locator('div.rounded-2xl')
      .filter({ has: microsoftReconnectCopy })
      .first();

    await microsoftReconnectCard.getByRole('button', { name: /^Connect$/i }).click();
    await page.waitForURL(/https:\/\/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize/i, {
      timeout: 15000,
    });
  });
});

test.describe('Beta loop /start smoke', () => {
  test('unauthenticated user can reach start/login', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/start');
    await expect(page.getByRole('heading', { name: /get started with foldera/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with microsoft/i })).toBeVisible();
    await expect(page.getByText(/first read arrives tomorrow morning/i)).toBeVisible();
  });
});

describeAuthMocked('Briefings /dashboard/briefings — authenticated', () => {
  test('loads history list — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupBriefingsMocks(page);
    await page.goto('/dashboard/briefings');
    await expect(page.getByRole('heading', { name: /past directives/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/First directive preview text/i)).toBeVisible();
  });
});

describeAuthMocked('Signals /dashboard/signals — authenticated', () => {
  test('shows the legacy-source notice and settings handoff — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupSignalsPageMocks(page);
    await page.goto('/dashboard/signals');
    await expect(page.getByRole('heading', { name: /source status moved to settings/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/route stays available for older links/i)).toBeVisible();
    await expect(page.getByText(/Open connected accounts/i)).toBeVisible();
  });
});

test.describe('Settings /dashboard/settings — unauthenticated smoke', () => {
  test('unauthenticated settings page renders without crash', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });
});
