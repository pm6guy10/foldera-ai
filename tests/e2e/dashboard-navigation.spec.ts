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
  { panel: 'briefing', label: 'Executive Briefing' },
  { panel: 'playbooks', label: 'Playbooks' },
  { panel: 'signals', label: 'Signals' },
  { panel: 'audit-log', label: 'Audit Log' },
  { panel: 'integrations', label: 'Integrations' },
  { panel: 'settings', label: 'Settings' },
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
  await page.route(
    matchApiPath('/api/integrations/status'),
    fulfillJson({
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
    }),
  );
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
  await page.route(matchApiPath('/api/conviction/latest'), fulfillJson(DIRECTIVE_RESPONSE));
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
  test('sidebar exposes all six labels on /dashboard desktop shell', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    for (const item of NAV_CONTRACT) {
      const button = page.getByTestId(`dashboard-sidebar-item-${item.panel}`);
      await expect(button).toBeVisible();
      await expect(button).toContainText(item.label);
    }

    await expect(page.getByTestId('dashboard-truth-stats')).toContainText('open threads');
    await expect(page.getByTestId('dashboard-truth-stats')).toContainText('need attention');
    await expect(page.getByTestId('dashboard-truth-stats')).toContainText('ready to move');
    await expect(page.getByTestId('dashboard-brief-directive-section')).toContainText(/Directive/i);
    await expect(page.getByTestId('dashboard-brief-why-section')).toContainText(/Why This Now/i);
    await expect(page.getByTestId('dashboard-brief-draft-section')).toContainText('DRAFT');
    await expect(page.getByTestId('dashboard-brief-source-section')).toContainText(/Source Basis/i);
    await expect(page.getByTestId('dashboard-brief-work-panel')).toContainText(/How this brief works/i);
    await expect(page.getByTestId('dashboard-brief-work-panel')).toContainText('Source trail');
  });

  test('clicking each sidebar item keeps the app shell on /dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    for (const item of NAV_CONTRACT) {
      await page.getByTestId(`dashboard-sidebar-item-${item.panel}`).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
      if (item.panel === 'briefing') {
        await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBeNull();
        await expect(page.getByTestId('dashboard-panel-briefing')).toBeVisible();
      } else {
        await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBe(item.panel);
        await expect(page.getByTestId(`dashboard-panel-${item.panel}`)).toBeVisible();
      }
    }
  });

  test('shell panels render panel-specific compact card content', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard');

    await page.getByTestId('dashboard-sidebar-item-settings').click();
    await expect(page.getByTestId('dashboard-panel-settings')).toBeVisible();
    await expect(page.getByRole('link', { name: /Open full settings/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Open connected accounts/i })).toBeVisible();

    await page.getByTestId('dashboard-sidebar-item-integrations').click();
    await expect(page.getByTestId('dashboard-panel-integrations')).toBeVisible();
    await expect(page.getByText(/Connected account health/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Manage connected accounts/i })).toBeVisible();

    await page.getByTestId('dashboard-sidebar-item-signals').click();
    await expect(page.getByTestId('dashboard-panel-signals')).toBeVisible();
    await expect(page.getByText(/Source status summary/i)).toBeVisible();
    await expect(page.getByTestId('dashboard-signals-source-status')).toBeVisible();
    await expect(page.getByTestId('dashboard-signals-connected-count')).toHaveText('1');
    await expect(page.getByRole('link', { name: /Open full signals/i })).toBeVisible();

    await page.getByTestId('dashboard-sidebar-item-audit-log').click();
    await expect(page.getByTestId('dashboard-panel-audit-log')).toBeVisible();
    await expect(page.getByText(/Recent directives history/i)).toBeVisible();
    await expect(page.getByText(/Confirm launch timeline with Alex/i)).toBeVisible();

    await page.getByTestId('dashboard-sidebar-item-playbooks').click();
    await expect(page.getByTestId('dashboard-panel-playbooks')).toBeVisible();
    await expect(page.getByText(/Playbook library in progress/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Open full playbooks/i })).toBeVisible();
  });

  test('deep-link /dashboard?panel=settings opens settings shell panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard?panel=settings');

    await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
    await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBe('settings');
    await expect(page.getByTestId('dashboard-panel-settings')).toBeVisible();
  });

  test('deep-link /dashboard?panel=signals opens signals shell panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupDashboardMocks(page);
    await page.goto('/dashboard?panel=signals');

    await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
    await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBe('signals');
    await expect(page.getByTestId('dashboard-panel-signals')).toBeVisible();
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
