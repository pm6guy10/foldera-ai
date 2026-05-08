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
    dailyValueResponse?: unknown;
    integrationStatusResponse?: unknown;
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
  const executeDecisions: string[] = [];

  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(matchApiPath('/api/auth/signout'), async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    signOutCallCount += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
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
  await page.route(
    matchApiPath('/api/conviction/daily-value'),
    fulfillJson(options.dailyValueResponse ?? { daily_utility_slate: null }),
  );
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
  };
}

describeAuthMocked('Dashboard navigation and action wiring', () => {
  test('sidebar exposes the finished-work inbox labels on /dashboard desktop shell', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    for (const item of NAV_CONTRACT) {
      const button = page.getByTestId(`dashboard-sidebar-item-${item.panel}`);
      await expect(button).toBeVisible();
      await expect(button).toContainText(item.label);
    }

    await expect(page.getByTestId('dashboard-sidebar-item-playbooks')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-sidebar-item-signals')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-sidebar-item-audit-log')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-truth-stats')).toHaveCount(0);
    await expect(page.getByText('open threads')).toHaveCount(0);
    await expect(page.getByText('need attention')).toHaveCount(0);
    await expect(page.getByText('ready to move')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-brief-directive-section')).toContainText(/Finished work/i);
    await expect(page.getByTestId('dashboard-brief-why-section')).toContainText(/Why it matters/i);
    await expect(page.getByTestId('dashboard-brief-draft-section')).toContainText('Ready text');
    await expect(page.getByTestId('dashboard-brief-source-section')).toContainText(/Source trail/i);
    const figmaFrame = await page.getByTestId('dashboard-figma-card-frame').boundingBox();
    expect(figmaFrame?.width).toBeGreaterThan(1080);
    await expect(page.getByText(/How this brief works/i)).toHaveCount(0);
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

  test('default dashboard renders Today, Recent Work, Sources, and Account as one workspace', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    await expect(page.getByTestId('dashboard-panel-today')).toBeVisible();
    await expect(page.getByTestId('dashboard-panel-history')).toBeVisible();
    await expect(page.getByTestId('dashboard-panel-sources')).toBeVisible();
    await expect(page.getByTestId('dashboard-panel-account')).toBeVisible();
    await expect(page.getByTestId('dashboard-panel-history')).toContainText(/Recent work/i);
    await expect(page.getByText(/Source readiness/i)).toBeVisible();
    await expect(page.getByTestId('dashboard-sources-source-status')).toBeVisible();
    await expect(page.getByTestId('dashboard-sources-connected-count')).toHaveText('1');
    await expect(page.getByText(/Confirm launch timeline with Alex/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Open full history/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Open full settings/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Manage connected accounts/i })).toHaveCount(0);
  });

  test('dashboard brand mark returns to the public landing page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    const brandLink = page.getByRole('link', { name: /^Foldera$/ });
    await expect(brandLink).toHaveAttribute('href', '/');

    await brandLink.click();

    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
    await expect(page.getByRole('heading', { name: /work that matters today/i })).toBeVisible();
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
    await expect(page.getByTestId('dashboard-panel-sources')).toBeVisible();
    await expect(page.getByTestId('dashboard-panel-account')).toBeVisible();
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

  test('mobile 390px has no horizontal overflow on /dashboard shell', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    await expect(page.getByTestId('dashboard-mobile-menu-button')).toBeVisible();

    const layout = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      return {
        htmlScrollWidth: html.scrollWidth,
        htmlClientWidth: html.clientWidth,
        bodyScrollWidth: body.scrollWidth,
      };
    });

    const maxScrollWidth = Math.max(layout.htmlScrollWidth, layout.bodyScrollWidth);
    expect(maxScrollWidth).toBeLessThanOrEqual(layout.htmlClientWidth + 1);
  });

  test('mobile menu exposes dashboard sections and swaps panels in-shell', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    const menuButton = page.getByTestId('dashboard-mobile-menu-button');
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('dashboard-mobile-menu')).toHaveCount(0);

    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByTestId('dashboard-mobile-menu');
    await expect(menu).toBeVisible();

    for (const item of NAV_CONTRACT) {
      await expect(page.getByTestId(`dashboard-mobile-menu-item-${item.panel}`)).toContainText(
        item.label,
      );
    }

    await page.getByTestId('dashboard-mobile-menu-item-sources').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
    await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBe('sources');
    await expect(page.getByTestId('dashboard-panel-sources')).toBeVisible();
    await expect(page.getByTestId('dashboard-mobile-menu')).toHaveCount(0);

    await menuButton.click();
    await page.getByTestId('dashboard-mobile-menu-item-today').click();
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

    await expect(page.getByText(/Foldera checked today/i)).toBeVisible();
    await expect(page.getByText(/What changed/i)).toBeVisible();
    await expect(page.getByText(/What Foldera protected/i)).toBeVisible();
    await expect(page.getByText(/Smallest unlock/i)).toBeVisible();
    await expect(page.getByText(/No safe finished work today/i)).toHaveCount(0);
    await expect(page.getByText(/No safe artifact/i)).toHaveCount(0);
    await expect(page.getByText(/stale_status_without_current_artifact_facts/i)).toHaveCount(0);
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
            source_refs: ['commitment:account-transition'],
          },
        },
      },
    });
    await page.goto('/dashboard');

    await expect(page.getByText(/Foldera found the next move/i)).toBeVisible();
    await expect(page.getByText(/Current best move/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Commitment due in 5d: Save job seeker account information/i }),
    ).toBeVisible();
    await expect(page.getByText(/has not sent, saved, or claimed/i)).toBeVisible();
    await expect(page.getByText(/Evidence behind this move/i)).toBeVisible();
    await page.getByTestId('dashboard-daily-value-copy').click();
    await expect(page.getByTestId('dashboard-status-notice')).toContainText(/Copied today's read/i);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __folderaCopiedText?: string }).__folderaCopiedText ?? ''),
      )
      .toContain('Safe next action:');
    await expect(page.getByText(/No safe artifact/i)).toHaveCount(0);
  });

  test('account menu opens and sign out remains wired', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const refs = await setupDashboardMocks(page);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: /account menu/i }).click();
    const signOutButton = page.getByRole('menuitem', { name: /sign out/i });
    await expect(signOutButton).toBeVisible();
    await signOutButton.click();
    await expect.poll(() => refs.getSignOutCallCount()).toBe(1);
  });
});
