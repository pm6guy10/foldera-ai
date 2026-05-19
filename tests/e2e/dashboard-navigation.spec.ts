import { test, expect, type Page, type Route } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const HAS_NEXTAUTH_SECRET = Boolean(process.env.NEXTAUTH_SECRET?.trim());
const describeAuthMocked = HAS_NEXTAUTH_SECRET ? test.describe : test.describe.skip;
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
  id: 'action-nav-001',
  directive: 'Send the follow-up to Alex Morgan before noon.',
  action_type: 'send_message',
  confidence: 85,
  reason:
    'You have an open thread with no reply, the ask is time-bound, and this is the cleanest unblocker today.',
  status: 'pending_approval',
  approved_count: 1,
  is_subscribed: true,
  evidence: [{ type: 'signal', description: 'Email thread with Alex Morgan' }],
  discrepancy_card: {
    claim: 'Send the follow-up to Alex Morgan before noon.',
    contradiction:
      'The Alex Morgan thread still has no reply, but the calendar hold makes the ask time-bound today.',
    risk:
      'The noon window may slip and leave the approval blocked if Brandon waits for another cycle.',
    evidence: [
      'Email thread with Alex Morgan is still awaiting Brandon response.',
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
    body:
      'Hi Alex -\n\nFollowing up on the update from yesterday.\nI pulled the latest status and can send the finalized version by noon.\n\nBest,\nBrandon',
  },
};

const HISTORY_RESPONSE = {
  items: [
    {
      id: 'hist-1',
      status: 'pending_approval',
      action_type: 'send_message',
      generated_at: '2026-04-24T08:00:00.000Z',
      directive_preview: 'Confirm launch timeline with Alex and request final sign-off.',
      has_artifact: true,
      artifact_preview: 'Hi Alex - confirming launch timeline and final sign-off.',
    },
    {
      id: 'hist-2',
      status: 'executed',
      action_type: 'write_document',
      generated_at: '2026-04-23T08:00:00.000Z',
      directive_preview: 'Draft onboarding handoff notes for the customer success team.',
      has_artifact: true,
      artifact_preview: 'Handoff summary and checklist prepared.',
    },
  ],
};

const NAV_CONTRACT = [
  { panel: 'today', label: 'Today' },
  { panel: 'history', label: 'Recent Work' },
  { panel: 'sources', label: 'Sources' },
  { panel: 'account', label: 'Account' },
] as const;

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

function matchApiPrefix(apiPrefix: string) {
  return (url: URL | string): boolean => {
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      return parsed.pathname.startsWith(apiPrefix);
    } catch {
      return false;
    }
  };
}

async function seedAuthenticatedSession(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for dashboard navigation tests.');
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

async function setupDashboardMocks(
  page: Page,
  options: {
    mockClipboard?: boolean;
    latestResponse?: unknown;
    detailResponse?: unknown;
    dailyValueResponse?: unknown;
    hangDailyValue?: boolean;
    integrationStatusResponse?: unknown;
    documentCollectionIntakeBodies?: unknown[];
  } = {},
) {
  await seedAuthenticatedSession(page);

  if (options.mockClipboard) {
    await page.addInitScript(() => {
      const writes: string[] = [];
      const clipboard = {
        writeText: async (text: string) => {
          writes.push(text);
        },
        readText: async () => writes[writes.length - 1] ?? '',
      };
      Object.defineProperty(window, '__clipboardWrites', {
        configurable: true,
        value: writes,
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        get: () => clipboard,
      });
    });
  }

  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem('foldera_pending_checkout');
    } catch {
      // ignore
    }
  });

  let signOutCallCount = 0;
  let isSignedIn = true;
  const executeDecisions: string[] = [];
  let detailRequestCount = 0;

  await page.route(matchApiPath('/api/auth/session'), (route) =>
    fulfillJson(isSignedIn ? SESSION_RESPONSE : { user: null, expires: future })(route),
  );
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(matchApiPath('/api/auth/signout'), async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    signOutCallCount += 1;
    isSignedIn = false;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'set-cookie': 'next-auth.session-token=; Max-Age=0; Path=/; SameSite=Lax',
      },
      body: json({ url: '/login' }),
    });
  });

  await page.route(
    matchApiPath('/api/subscription/status'),
    fulfillJson({ plan: 'pro', status: 'active', can_manage_billing: true }),
  );
  await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
  const integrationStatusResponse =
    options.integrationStatusResponse ?? {
      integrations: [
        {
          provider: 'google',
          is_active: true,
          sync_email: 'test@gmail.com',
          last_synced_at: '2026-04-25T08:30:00.000Z',
          missing_scopes: [],
          needs_reconnect: false,
          needs_reauth: false,
          sync_stale: false,
        },
        {
          provider: 'azure_ad',
          is_active: false,
          sync_email: null,
          last_synced_at: null,
          missing_scopes: [],
          needs_reconnect: false,
          needs_reauth: false,
          sync_stale: false,
        },
      ],
      newest_mail_signal_at: '2026-04-25T08:30:00.000Z',
      mail_ingest_looks_stale: false,
    };

  await page.route(matchApiPath('/api/integrations/status'), fulfillJson(integrationStatusResponse));
  await page.route(
    matchApiPath('/api/graph/stats'),
    fulfillJson({
      signalsTotal: 12,
      commitmentsActive: 2,
      patternsActive: 1,
      lastSignalAt: '2026-04-20T08:30:00.000Z',
      lastSignalSource: 'google',
    }),
  );
  await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ buckets: [], freeText: null }));
  await page.route(matchApiPath('/api/conviction/latest'), fulfillJson(options.latestResponse ?? DIRECTIVE_RESPONSE));
  await page.route(matchApiPrefix('/api/conviction/actions/'), async (route) => {
    if (
      new URL(route.request().url()).pathname.endsWith('/document-collection-intake') &&
      route.request().method() === 'POST'
    ) {
      options.documentCollectionIntakeBodies?.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          ok: true,
          action_id: 'action-doc-collection',
          intake_status: 'inputs_provided',
        }),
      });
    }
    detailRequestCount += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json(options.detailResponse ?? DIRECTIVE_RESPONSE),
    });
  });
  await page.route(matchApiPath('/api/conviction/daily-value'), async (route) => {
    if (options.hangDailyValue) {
      await new Promise(() => undefined);
      return;
    }
    return fulfillJson(options.dailyValueResponse ?? { daily_utility_slate: null })(route);
  });
  await page.route(matchApiPath('/api/conviction/history'), fulfillJson(HISTORY_RESPONSE));
  await page.route(matchApiPath('/api/conviction/execute'), async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    let decision = 'approve';
    try {
      const parsed = route.request().postDataJSON() as { decision?: string };
      if (parsed?.decision === 'skip') {
        decision = 'skip';
      }
    } catch {
      decision = 'approve';
    }
    executeDecisions.push(decision);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({ status: decision === 'skip' ? 'skipped' : 'executed' }),
    });
  });
  await page.route(
    matchApiPath('/api/stripe/checkout'),
    fulfillJson({ error: 'mock_checkout_disabled' }),
  );
  await page.route(
    matchApiPath('/api/stripe/portal'),
    fulfillJson({ error: 'mock_portal_disabled' }),
  );

  return {
    executeDecisions,
    getSignOutCallCount: () => signOutCallCount,
    getDetailRequestCount: () => detailRequestCount,
  };
}

describeAuthMocked('Dashboard navigation and action wiring', () => {
  test('desktop dashboard fills the viewport as a real app shell', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    for (const item of NAV_CONTRACT) {
      const button = page.getByTestId(`dashboard-sidebar-item-${item.panel}`);
      await expect(button).toBeVisible();
      await expect(button).toContainText(item.label);
    }

    const shell = await page.getByTestId('dashboard-app-shell').boundingBox();
    expect(shell?.x ?? 999).toBeLessThanOrEqual(4);
    expect(shell?.y ?? 999).toBeLessThanOrEqual(4);
    expect(shell?.width ?? 0).toBeGreaterThan(1430);
    expect(shell?.height ?? 0).toBeGreaterThan(890);
    const viewportFit = await page.evaluate(() => ({
      htmlClientHeight: document.documentElement.clientHeight,
      htmlScrollHeight: document.documentElement.scrollHeight,
      bodyClientHeight: document.body.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
    }));
    expect(viewportFit.htmlScrollHeight).toBeLessThanOrEqual(viewportFit.htmlClientHeight + 1);
    expect(viewportFit.bodyScrollHeight).toBeLessThanOrEqual(viewportFit.bodyClientHeight + 1);

    const appFit = await page.evaluate(() => {
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const card = document.querySelector('.foldera-dashboard-stage-brief') as HTMLElement | null;
      const footer = card?.querySelector('footer') as HTMLElement | null;
      const body = card?.querySelector('.foldera-dashboard-stage-brief-body') as HTMLElement | null;
      const rightRail = document.querySelector('.foldera-dashboard-right-rail') as HTMLElement | null;
      const upload = document.querySelector('.foldera-dashboard-upload-panel') as HTMLElement | null;
      const cardBox = card?.getBoundingClientRect();
      const footerBox = footer?.getBoundingClientRect();
      const bodyBox = body?.getBoundingClientRect();
      const railBox = rightRail?.getBoundingClientRect();
      const uploadBox = upload?.getBoundingClientRect();
      return {
        viewportHeight,
        viewportWidth,
        cardHeight: cardBox?.height ?? 0,
        cardWidth: cardBox?.width ?? 0,
        cardBottom: cardBox?.bottom ?? 0,
        bodyBottom: bodyBox?.bottom ?? 0,
        footerTop: footerBox?.top ?? 0,
        footerBottom: footerBox?.bottom ?? 0,
        railBottom: railBox?.bottom ?? 0,
        uploadBottom: uploadBox?.bottom ?? 0,
        uploadVisible: upload ? getComputedStyle(upload).display !== 'none' : false,
      };
    });
    expect(appFit.cardWidth).toBeGreaterThan(appFit.viewportWidth * 0.55);
    expect(appFit.cardHeight).toBeGreaterThan(appFit.viewportHeight * 0.62);
    expect(appFit.cardBottom).toBeLessThanOrEqual(appFit.viewportHeight + 1);
    expect(appFit.bodyBottom).toBeLessThanOrEqual(appFit.footerTop + 1);
    expect(appFit.footerBottom).toBeLessThanOrEqual(appFit.viewportHeight + 1);
    expect(appFit.railBottom).toBeLessThanOrEqual(appFit.viewportHeight + 1);
    if (appFit.uploadVisible) {
      expect(appFit.uploadBottom).toBeLessThanOrEqual(appFit.viewportHeight + 1);
    }

    await expect(page.getByTestId('dashboard-figma-card-frame')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-brief-directive-section')).toContainText(/Finished work/i);
    await expect(page.getByTestId('dashboard-brief-why-section')).toContainText(/Why it matters/i);
    await expect(page.getByTestId('dashboard-brief-draft-section')).toContainText('Ready text');
    await expect(page.getByTestId('dashboard-brief-source-section')).toContainText(/Source trail/i);
    await expect(page.getByTestId('dashboard-brief-source-section')).toContainText('Email thread');
    await expect(page.getByTestId('dashboard-brief-source-section')).toContainText('Calendar event');
    await expect(page.getByTestId('dashboard-brief-source-section')).not.toContainText(/email:|calendar:/i);
    const sourceTrailPanel = page.getByTestId('dashboard-source-trail-panel');
    await expect(sourceTrailPanel).toBeVisible();
    await expect(sourceTrailPanel).toContainText(/Evidence behind today's move/i);
    await expect(sourceTrailPanel).toContainText('Email thread');
    await expect(sourceTrailPanel).toContainText('Calendar event');
    await expect(sourceTrailPanel).toContainText(
      'Email thread with Alex Morgan is still awaiting Brandon response.',
    );
    await expect(sourceTrailPanel).toContainText('Calendar hold creates a noon decision window.');
    await expect(sourceTrailPanel).not.toContainText(/email:|calendar:/i);
    await expect(page.getByText(/Uploads coming later/i)).toBeVisible();
    await expect(page.getByText(/Drop a folder or document\./i)).toHaveCount(0);
  });

  test('clicking each sidebar item keeps the app shell on /dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    for (const item of NAV_CONTRACT) {
      await page.getByTestId(`dashboard-sidebar-item-${item.panel}`).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
      if (item.panel === 'today') {
        await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBeNull();
        await expect(page.getByTestId('dashboard-panel-today')).toBeVisible();
      } else {
        await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBe(item.panel);
        await expect(page.getByTestId(`dashboard-panel-${item.panel}`)).toBeVisible();
      }
    }
  });

  test('default dashboard keeps Today as the primary surface and routes support panels behind navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    await expect(page.getByTestId('dashboard-panel-today')).toBeVisible();
    await expect(page.getByTestId('dashboard-panel-history')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-panel-sources')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-panel-account')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-source-trail-panel')).toContainText(
      /Evidence behind today's move/i,
    );
    await expect(page.getByText(/Uploads coming later/i)).toBeVisible();
    await expect(page.getByText(/Drop a folder or document\./i)).toHaveCount(0);

    await page.getByTestId('dashboard-sidebar-item-history').click();
    await expect(page.getByTestId('dashboard-panel-history')).toBeVisible();

    await page.getByTestId('dashboard-sidebar-item-sources').click();
    await expect(page.getByTestId('dashboard-panel-sources')).toBeVisible();
    await expect(page.getByText(/Source readiness/i)).toBeVisible();

    await page.getByTestId('dashboard-sidebar-item-account').click();
    const accountPanel = page.getByTestId('dashboard-panel-account');
    await expect(accountPanel).toBeVisible();
    await expect(accountPanel).toContainText(/Trust controls/i);
  });

  test('dashboard brand mark returns to the public landing page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    const brandLink = page.getByRole('link', { name: /^Foldera$/ });
    await expect(brandLink).toHaveAttribute('href', '/');

    await brandLink.click();

    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
    await expect(page.getByTestId('landing-hero-heading')).toContainText(/One finished move/i);
  });

  test('stale Microsoft source auto-recovers and keeps manual sync as fallback', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let microsoftSyncCalls = 0;
    await setupDashboardMocks(page, {
      integrationStatusResponse: {
        integrations: [
          {
            provider: 'google',
            is_active: true,
            sync_email: 'test@gmail.com',
            last_synced_at: '2026-04-25T08:30:00.000Z',
            missing_scopes: [],
            needs_reconnect: false,
            needs_reauth: false,
            needs_sync: false,
            sync_stale: false,
          },
          {
            provider: 'azure_ad',
            is_active: true,
            sync_email: 'test@outlook.com',
            last_synced_at: '2026-04-21T10:00:00.000Z',
            missing_scopes: [],
            needs_reconnect: false,
            needs_reauth: false,
            needs_sync: true,
            sync_stale: false,
          },
        ],
        newest_mail_signal_at: '2026-04-25T08:30:00.000Z',
        mail_ingest_looks_stale: false,
      },
    });
    await page.route(matchApiPath('/api/microsoft/sync-now'), async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      microsoftSyncCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ ok: true, mail_signals: 3, calendar_signals: 1 }),
      });
    });
    await page.goto('/dashboard?panel=sources');

    const sourcesPanel = page.getByTestId('dashboard-panel-sources');
    await expect(sourcesPanel).toContainText('Needs sync');
    await expect(sourcesPanel).toContainText('Fresh sync needed');
    await expect.poll(() => microsoftSyncCalls).toBe(1);
    await expect(sourcesPanel).toContainText('Microsoft sync complete');
    await expect(sourcesPanel.getByRole('button', { name: /sync microsoft/i })).toBeVisible();
  });

  test('legacy product-shell routes point primary nav back into the live dashboard shell', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard/signals');

    const headerNav = page.locator('header nav');
    await expect(headerNav.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/dashboard');
    await expect(headerNav.getByRole('link', { name: 'Recent Work' })).toHaveAttribute('href', '/dashboard?panel=history');
    await expect(headerNav.getByRole('link', { name: 'Sources' })).toHaveAttribute('href', '/dashboard?panel=sources');
    await expect(headerNav.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/dashboard?panel=account');
    await expect(headerNav.getByRole('link', { name: 'Signals' })).toHaveCount(0);
    await expect(headerNav.getByRole('link', { name: 'Audit Log' })).toHaveCount(0);
    await expect(headerNav.getByRole('link', { name: 'Integrations' })).toHaveCount(0);
    await expect(headerNav.getByRole('link', { name: 'Playbooks' })).toHaveCount(0);
  });

  test('deep-link /dashboard?panel=settings opens the unified dashboard with account controls visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard?panel=settings');

    await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
    await expect(page.getByTestId('dashboard-panel-account')).toBeVisible();
    await expect(page.getByTestId('dashboard-panel-sources')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-panel-account')).toContainText(/Account/i);
  });

  test('deep-link /dashboard?panel=signals opens Sources', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard?panel=signals');

    await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
    await expect(page.getByTestId('dashboard-panel-sources')).toBeVisible();
  });

  test('deep-link /dashboard?panel=audit-log opens History', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard?panel=audit-log');

    await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
    await expect(page.getByTestId('dashboard-panel-history')).toBeVisible();
  });

  test('primary action records approve decision without sending email by default', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const refs = await setupDashboardMocks(page);
    await page.goto('/dashboard');

    await page.getByTestId('dashboard-primary-action').click();
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute(
      'data-status-id',
      'approve_recorded',
    );
    await expect.poll(() => refs.executeDecisions.filter((decision) => decision === 'approve').length).toBe(1);
  });

  test('summary-only latest payload stays cheap until the user opens the finished artifact detail', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const refs = await setupDashboardMocks(page, {
      latestResponse: {
        id: DIRECTIVE_RESPONSE.id,
        directive: DIRECTIVE_RESPONSE.directive,
        action_type: DIRECTIVE_RESPONSE.action_type,
        confidence: DIRECTIVE_RESPONSE.confidence,
        reason: DIRECTIVE_RESPONSE.reason,
        status: DIRECTIVE_RESPONSE.status,
        approved_count: 1,
        is_subscribed: true,
        free_artifact_remaining: true,
        artifact_paywall_locked: false,
        finished_artifact_verdict: 'strict_artifact_selected',
        discrepancy_card: DIRECTIVE_RESPONSE.discrepancy_card,
        discrepancy_quality: DIRECTIVE_RESPONSE.discrepancy_quality,
        detail_required: true,
        detail_url: `/api/conviction/actions/${DIRECTIVE_RESPONSE.id}`,
      },
      detailResponse: DIRECTIVE_RESPONSE,
    });
    await page.goto('/dashboard');

    await expect.poll(() => refs.getDetailRequestCount()).toBe(0);
    await expect(page.getByText(/Open the finished artifact to inspect the exact draft before acting/i)).toBeVisible();
    await page.getByRole('button', { name: /open finished work/i }).click();
    await expect.poll(() => refs.getDetailRequestCount()).toBe(1);
    await expect(page.getByTestId('dashboard-brief-draft-section')).toContainText('Ready text');
    await expect(page.getByTestId('dashboard-document-body')).toContainText(
      'Following up on the update from yesterday.',
    );
  });

  test('document collection requirements packet shows no-schema intake capture', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const intakeBodies: unknown[] = [];
    await setupDashboardMocks(page, {
      documentCollectionIntakeBodies: intakeBodies,
      latestResponse: {
        id: 'action-doc-collection',
        directive:
          'Requirements needed: Submit high-quality .docx documents for document collection',
        action_type: 'write_document',
        confidence: 82,
        reason:
          'Deadline is in 0 day(s) with zero artifacts; missing the submission window risks losing the accepted commitment opportunity.',
        status: 'pending_approval',
        approved_count: 1,
        is_subscribed: true,
        free_artifact_remaining: true,
        artifact_paywall_locked: false,
        finished_artifact_verdict: 'strict_artifact_selected',
        artifact_title:
          'Requirements needed: Submit high-quality .docx documents for document collection',
        detail_required: true,
        detail_url: '/api/conviction/actions/action-doc-collection',
        discrepancy_card: {
          claim:
            'Commitment due in 0d: Submit high-quality .docx documents for document collection',
          contradiction:
            'The document collection deadline is now, but no owned document sources or submission destination are captured.',
          risk: 'Source requirements are known, but owned .docx bodies and submission destination are missing.',
          evidence: [
            '$50 per accepted document.',
            'Files must be real .docx documents.',
            'Do not submit AI-generated, confidential, employer/client-owned, NDA-covered, or identifying content.',
          ],
          next_action: 'Paste the submission link and list/upload the candidate documents.',
          why_now: 'The submission deadline is today.',
          source_refs: ['commitment:document-collection'],
          confidence: 0.82,
          pattern_keys: ['discrepancy:deadline_staleness', 'action:write_document'],
        },
        discrepancy_quality: {
          passes: true,
          quality_score: 0.9,
          blocked_by: [],
          pattern_keys: ['discrepancy:deadline_staleness', 'action:write_document'],
          rejection_reason: null,
        },
      },
    });
    await page.goto('/dashboard');

    const intake = page.getByTestId('document-collection-intake');
    await expect(intake).toContainText(
      'To finish this, provide',
    );
    await expect(intake).toContainText(
      'owned .docx/source files, document topics/titles, and submission URL.',
    );
    await expect(intake).toContainText(
      'Paste the submission link and list/upload the candidate documents.',
    );

    await intake.getByLabel('Submission link').fill('https://forms.gle/submission');
    await intake
      .getByLabel('Candidate documents / source bodies')
      .fill('1. Owned benefits appeal memo - source body pasted. 2. Owned resume review checklist.');
    await intake.getByRole('button', { name: /save inputs/i }).click();

    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute(
      'data-status-id',
      'document_collection_intake_saved',
    );
    expect(intakeBodies).toEqual([
      {
        submission_url: 'https://forms.gle/submission',
        candidate_documents:
          '1. Owned benefits appeal memo - source body pasted. 2. Owned resume review checklist.',
      },
    ]);
  });

  test('no-safe latest state does not get stuck when daily value fallback stalls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupDashboardMocks(page, {
      hangDailyValue: true,
      latestResponse: {
        artifact_readiness_state: 'NO_SAFE_ARTIFACT',
        finished_artifact_verdict: 'no_finished_artifact',
        no_safe_artifact_reason:
          'stale_selected_move_artifact: stored winner fingerprint no longer matches current winner.',
      },
    });
    await page.goto('/dashboard');

    const slate = page.getByTestId('dashboard-daily-utility-slate');
    await expect(slate).toBeVisible({ timeout: 7000 });
    await expect(page.getByTestId('dashboard-loading-card')).toHaveCount(0);
    await expect(slate.getByText(/Right now/i)).toBeVisible();
    await expect(slate.getByText(/Held back safely/i)).toBeVisible();
    await expect(slate.getByText(/stored artifact no longer matches the current work/i).first()).toBeVisible();
    await expect(slate.getByText(/Source trail/i)).toBeVisible();
    await expect(slate.getByText(/Foldera held back/i).first()).toBeVisible();
  });

  test('snooze action posts skip decision', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const refs = await setupDashboardMocks(page);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: /snooze 24h|skip/i }).click();
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute('data-status-id', 'skip_snoozed');
    await expect.poll(() => refs.executeDecisions.filter((decision) => decision === 'skip').length).toBe(1);
  });

  test('copy draft copies artifact text when artifact exists', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupDashboardMocks(page, { mockClipboard: true });
    await page.goto('/dashboard');

    await page.getByRole('button', { name: /copy draft|copy full text/i }).click();
    const clipboardText = await page.evaluate(() => {
      const writes = (window as { __clipboardWrites?: string[] }).__clipboardWrites ?? [];
      return writes[writes.length - 1] ?? '';
    });

    expect(clipboardText).toContain('To: alex.morgan@example.com');
    expect(clipboardText).toContain('Subject: Alex Morgan follow-up');
    expect(clipboardText).toContain('Following up on the update from yesterday.');
  });

  test('mobile 390px fills the viewport with no horizontal overflow or phone frame', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    await expect(page.getByText('9:41')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-mobile-tab-today')).toBeVisible();

    const layout = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const shell = document.querySelector('[data-testid="dashboard-route-shell"]') as HTMLElement | null;
      return {
        htmlScrollWidth: html.scrollWidth,
        htmlClientWidth: html.clientWidth,
        htmlScrollHeight: html.scrollHeight,
        htmlClientHeight: html.clientHeight,
        bodyScrollWidth: body.scrollWidth,
        bodyScrollHeight: body.scrollHeight,
        bodyClientHeight: body.clientHeight,
        shellWidth: shell?.getBoundingClientRect().width ?? 0,
        shellHeight: shell?.getBoundingClientRect().height ?? 0,
      };
    });

    const maxScrollWidth = Math.max(layout.htmlScrollWidth, layout.bodyScrollWidth);
    expect(maxScrollWidth).toBeLessThanOrEqual(layout.htmlClientWidth + 1);
    expect(layout.htmlScrollHeight).toBeLessThanOrEqual(layout.htmlClientHeight + 1);
    expect(layout.bodyScrollHeight).toBeLessThanOrEqual(layout.bodyClientHeight + 1);
    expect(layout.shellWidth).toBeGreaterThanOrEqual(389);
    expect(layout.shellHeight).toBeGreaterThanOrEqual(844);

    const mobileFit = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="dashboard-route-shell"]') as HTMLElement | null;
      const stage = document.querySelector('.foldera-dashboard-mobile-stage') as HTMLElement | null;
      const nav = document.querySelector('.foldera-dashboard-mobile-nav') as HTMLElement | null;
      const card = document.querySelector('.foldera-dashboard-current-brief') as HTMLElement | null;
      const cardFooter = card?.querySelector('footer') as HTMLElement | null;
      const shellBox = shell?.getBoundingClientRect();
      const stageBox = stage?.getBoundingClientRect();
      const navBox = nav?.getBoundingClientRect();
      const cardBox = card?.getBoundingClientRect();
      const footerBox = cardFooter?.getBoundingClientRect();
      return {
        viewportHeight: window.innerHeight,
        shellBottom: shellBox?.bottom ?? 0,
        stageBottom: stageBox?.bottom ?? 0,
        navTop: navBox?.top ?? 0,
        navBottom: navBox?.bottom ?? 0,
        cardHeight: cardBox?.height ?? 0,
        cardBottom: cardBox?.bottom ?? 0,
        footerBottom: footerBox?.bottom ?? 0,
      };
    });
    expect(mobileFit.shellBottom).toBeLessThanOrEqual(mobileFit.viewportHeight + 1);
    expect(mobileFit.navBottom).toBeLessThanOrEqual(mobileFit.viewportHeight + 1);
    expect(mobileFit.stageBottom).toBeLessThanOrEqual(mobileFit.navTop + 1);
    expect(mobileFit.cardHeight).toBeGreaterThan(540);
    expect(mobileFit.cardBottom).toBeLessThanOrEqual(mobileFit.navTop + 1);
    expect(mobileFit.footerBottom).toBeLessThanOrEqual(mobileFit.navTop + 1);

    const sourceTrailFit = await page.evaluate(() => {
      const source = document.querySelector(
        '[data-testid="dashboard-brief-source-section"]',
      ) as HTMLElement | null;
      const box = source?.getBoundingClientRect();
      return {
        visible:
          Boolean(box) &&
          (box?.top ?? 0) < window.innerHeight &&
          (box?.bottom ?? 0) > 0,
      };
    });
    expect(sourceTrailFit.visible).toBe(true);
  });

  test('mobile bottom nav swaps dashboard panels in-shell', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    for (const item of NAV_CONTRACT) {
      await expect(page.getByTestId(`dashboard-mobile-tab-${item.panel}`)).toContainText(item.label);
    }

    await page.getByTestId('dashboard-mobile-tab-sources').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
    await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBe('sources');
    await expect(page.getByTestId('dashboard-panel-sources')).toBeVisible();

    await page.getByTestId('dashboard-mobile-tab-history').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBe('history');
    await expect(page.getByTestId('dashboard-panel-history')).toBeVisible();

    await page.getByTestId('dashboard-mobile-tab-today').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBeNull();
    await expect(page.getByTestId('dashboard-panel-today')).toBeVisible();
  });

  test('no-artifact dashboard still shows daily value instead of a dead empty state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupDashboardMocks(page, {
      latestResponse: {
        daily_utility_slate: {
          finished_artifact_verdict: 'no_finished_artifact',
          watch_item: {
            title: 'No safe finished action today',
            status: 'watch_item',
            evidence: ['Latest run stopped because source data is stale.'],
            why_it_matters: 'Foldera checked the current facts before turning this into finished work.',
            no_action_reason: 'stale_status_without_current_artifact_facts',
            source_refs: ['persisted:no_send_receipt'],
          },
        },
      },
    });
    await page.goto('/dashboard');

    await expect(page.getByText(/Right now/i)).toBeVisible();
    await expect(page.getByText(/What changed/i)).toBeVisible();
    await expect(page.getByText(/What Foldera protected/i)).toBeVisible();
    await expect(page.getByText(/Smallest unlock/i)).toBeVisible();
    await expect(page.getByText(/No safe finished work today/i)).toHaveCount(0);
    await expect(page.getByText(/No safe artifact/i)).toHaveCount(0);
    await expect(page.getByText(/stale_status_without_current_artifact_facts/i)).toHaveCount(0);
  });

  test('no-safe dashboard humanizes weak pressure receipt text', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page, {
      latestResponse: {
        artifact_readiness_state: 'NO_SAFE_ARTIFACT',
        finished_artifact_verdict: 'no_finished_artifact',
        no_safe_artifact_reason: 'NO REAL PRESSURE',
      },
    });
    await page.goto('/dashboard');

    const slate = page.getByTestId('dashboard-daily-utility-slate');
    await expect(slate).toBeVisible({ timeout: 7000 });
    await expect(slate).toContainText('Held back safely');
    await expect(slate).toContainText(
      'The current source trail does not show enough real pressure for finished work.',
    );
    await expect(slate).not.toContainText('NO REAL PRESSURE');
  });

  test('empty latest state promotes the current best move from deterministic daily value', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as unknown as { __folderaCopiedText?: string }).__folderaCopiedText = text;
          },
        },
      });
    });
    await setupDashboardMocks(page, {
      latestResponse: {},
      dailyValueResponse: {
        daily_utility_slate: {
          finished_artifact_verdict: 'no_finished_artifact',
          primary_move: {
            title: 'Commitment due in 5d: Save job seeker account information',
            status: 'primary_move',
            evidence: ['Save job seeker account information before the website transition.'],
            why_it_matters:
              'The account transition may happen before the saved records are packaged.',
            next_action:
              'Write a decision memo that closes the account transition with the owner, next action, and deadline.',
            source_refs: ['commitment:8c9e725a-a5ce-461d-84c4-a9fec4338d70'],
          },
        },
      },
    });
    await page.goto('/dashboard');

    await expect(page.getByText(/Right now/i)).toBeVisible();
    await expect(page.getByText(/^Do this$/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Commitment due in 5d: Save job seeker account information/i }),
    ).toBeVisible();
    await expect(page.getByText(/has not sent, saved, or claimed/i)).toBeVisible();
    await expect(page.getByText(/Evidence behind this move/i)).toBeVisible();
    await expect(page.getByText(/One thing Foldera needs/i)).toHaveCount(0);
    await page.getByTestId('dashboard-daily-value-copy').click();
    await expect(page.getByTestId('dashboard-status-notice')).toContainText(/Copied today's read/i);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __folderaCopiedText?: string }).__folderaCopiedText ?? ''),
      )
      .toContain('Safe next action:');
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __folderaCopiedText?: string }).__folderaCopiedText ?? ''),
      )
      .toContain('Saved commitment');
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __folderaCopiedText?: string }).__folderaCopiedText ?? ''),
      )
      .not.toMatch(/commitment:[0-9a-f-]+|8c9e725a/i);
    await expect(page.getByText(/No safe artifact/i)).toHaveCount(0);
  });

  test('disconnected or stale sources show a waiting-for-sources brief instead of a blank state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page, {
      latestResponse: {},
      dailyValueResponse: { daily_utility_slate: null },
      integrationStatusResponse: {
        integrations: [
          {
            provider: 'google',
            is_active: false,
            sync_email: null,
            last_synced_at: null,
            missing_scopes: [],
            needs_reconnect: false,
            needs_reauth: false,
            sync_stale: false,
          },
          {
            provider: 'azure_ad',
            is_active: false,
            sync_email: null,
            last_synced_at: null,
            missing_scopes: [],
            needs_reconnect: false,
            needs_reauth: false,
            sync_stale: false,
          },
        ],
        newest_mail_signal_at: null,
        mail_ingest_looks_stale: false,
      },
    });
    await page.goto('/dashboard');

    await expect(page.getByText(/WAITING FOR SOURCES/i)).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: /Connect sources so Foldera can find today’s finished move\./i,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Foldera needs recent email, calendar, and draft context before it can safely recommend a source-backed action\./i,
      ),
    ).toBeVisible();
    await expect(page.getByTestId('dashboard-connect-sources')).toBeVisible();
    await expect(page.getByRole('link', { name: /View demo/i })).toHaveAttribute('href', '/demo');
  });

  test('account menu opens and sign out remains wired', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const refs = await setupDashboardMocks(page);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: /account menu/i }).click();
    const signOutButton = page.getByRole('menuitem', { name: /sign out/i });
    await expect(signOutButton).toBeVisible();
    await signOutButton.click();
    await expect.poll(() => refs.getSignOutCallCount()).toBe(1);

    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: /continue with microsoft/i })).toBeVisible();

    await page.goto('/dashboard');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
    await expect(page.getByText(/Brandon Kapp|test@foldera\.ai/i)).toHaveCount(0);
    await expect(page.getByText(/choose an account/i)).toBeVisible();
  });
});
