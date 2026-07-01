import { test, expect, type Page, type Route } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

/**
 * Dashboard Right Now loop contract.
 *
 * /dashboard is the presence surface per the Bible's day-one lock:
 * 1. Foldera knows the current workday state (or asks for one anchor).
 * 2. One source-backed move or safe silence — never a panel tour.
 * 3. The user answers with one click (Done / View Draft / Snooze / Dismiss).
 * 4. State updates without manual routing.
 */

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

const SETUP_PROMPT = 'What are you trying to move forward today?';

const SETUP_CARD_PAYLOAD = {
  state: null,
  resolution: { verdict: 'CLEAR', rule: 'no_saved_state' },
  card: {
    mode: 'setup',
    prompt: SETUP_PROMPT,
    verdict_line:
      'Trusted verdict: No justified move yet. Save one focus and Foldera will hold the re-entry point.',
  },
};

function activeCardPayload(overrides: Record<string, unknown> = {}) {
  return {
    state: { current_focus: 'Close ACME renewal decision' },
    resolution: { verdict: 'CLEAR', rule: 'no_justified_command' },
    card: {
      mode: 'active',
      heading: 'Right now.',
      return_here: 'Return here: Close ACME renewal decision',
      next_move: 'Next move: Send owner confirmation note',
      why_this_matters: 'Why this matters: The renewal window closes at 4 PM PT.',
      verdict_line:
        'Trusted verdict: Anchor saved. Foldera will hold this until connected work proves a clearer move.',
      source_line: 'Source: your saved focus. Foldera will stay quiet until something grounded is ready.',
      do_not_touch: null,
      stop_when_done: 'Stop when this is done: Close ACME renewal decision moved forward.',
      last_interaction: null,
      draft_ready: null,
      draft_expanded: null,
      ...overrides,
    },
  };
}

const CONNECTED_INTEGRATIONS = {
  integrations: [{ provider: 'google', is_active: true }],
};

const NO_INTEGRATIONS = { integrations: [] };

/** Copy that must never render on the presence surface. */
const BANNED_VISIBLE_COPY = [
  "isn't wired",
  'Slack buddy',
  'Executive Briefing',
  'Open next move',
  'deterministic fixture',
  'owner/test user',
  'backend',
];

const LEGACY_TESTIDS = [
  'dashboard-app-shell',
  'dashboard-panel-today',
  'dashboard-primary-action',
  'dashboard-degraded-state',
  'dashboard-daily-utility-slate',
  'dashboard-sidebar-item-today',
];

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

type RightNowMockController = {
  setCardPayload: (payload: unknown) => void;
  getActionPosts: () => Array<Record<string, unknown>>;
  getPutBodies: () => Array<Record<string, unknown>>;
};

async function setupRightNowMocks(
  page: Page,
  options: {
    initialCardPayload?: unknown;
    integrationStatusResponse?: unknown;
    onPut?: (body: Record<string, unknown>) => unknown;
    onAction?: (body: Record<string, unknown>) => void;
  } = {},
): Promise<RightNowMockController> {
  await seedAuthenticatedSession(page);

  let cardPayload: unknown = options.initialCardPayload ?? SETUP_CARD_PAYLOAD;
  const actionPosts: Array<Record<string, unknown>> = [];
  const putBodies: Array<Record<string, unknown>> = [];

  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(
    matchApiPath('/api/auth/providers'),
    fulfillJson({ google: {}, 'azure-ad': {} }),
  );
  await page.route(
    matchApiPath('/api/integrations/status'),
    fulfillJson(options.integrationStatusResponse ?? CONNECTED_INTEGRATIONS),
  );

  await page.route(matchApiPath('/api/workday-presence'), async (route) => {
    const request = route.request();
    if (request.method() === 'PUT') {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      putBodies.push(body);
      const response = options.onPut ? options.onPut(body) : activeCardPayload();
      cardPayload = response;
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(response) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: json(cardPayload) });
  });

  await page.route(matchApiPath('/api/workday-presence/message-action'), async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    actionPosts.push(body);
    options.onAction?.(body);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({ state: {}, payload: { kind: 'right_now' } }),
    });
  });

  return {
    setCardPayload: (payload: unknown) => {
      cardPayload = payload;
    },
    getActionPosts: () => actionPosts,
    getPutBodies: () => putBodies,
  };
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

describeAuthMocked('Dashboard Right Now loop', () => {
  test('cold user sees the anchor setup card with trust rail — no panel tour', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupRightNowMocks(page);
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: SETUP_PROMPT })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Trusted verdict: No justified move yet/i)).toBeVisible();
    await expect(page.getByTestId('trust-rail')).toBeVisible();
    await expect(page.getByTestId('trust-rail')).toContainText(/Nothing sends without your explicit approval/i);
    await expect(page.getByRole('link', { name: /^Sources$/ })).toHaveAttribute(
      'href',
      '/dashboard/settings',
    );
  });

  test('quiet day with fresh run evidence renders the all-clear closure, not the setup prompt', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupRightNowMocks(page, {
      initialCardPayload: {
        ...SETUP_CARD_PAYLOAD,
        surface_state: 'clear',
        all_clear: {
          checked_count: 14,
          completed_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
      },
    });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'All clear.' })).toBeVisible({ timeout: 15000 });
    const evidence = page.getByTestId('right-now-all-clear');
    await expect(evidence).toBeVisible();
    await expect(evidence).toContainText(/Checked 14 open loops at .+ — nothing needs you\./);
    await expect(page.getByRole('heading', { name: SETUP_PROMPT })).toHaveCount(0);
  });

  test('missing source shows the connect strip; connected source stays quiet', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupRightNowMocks(page, { integrationStatusResponse: NO_INTEGRATIONS });
    await page.goto('/dashboard');

    const strip = page.getByTestId('dashboard-connect-strip');
    await expect(strip).toBeVisible({ timeout: 15000 });
    await expect(strip.getByRole('link', { name: /Connect Google/i })).toHaveAttribute(
      'href',
      '/api/google/connect',
    );
    await expect(strip.getByRole('link', { name: /Connect Microsoft/i })).toHaveAttribute(
      'href',
      '/api/microsoft/connect',
    );
  });

  test('connected source renders no connect strip', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupRightNowMocks(page);
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: SETUP_PROMPT })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('dashboard-connect-strip')).toHaveCount(0);
  });

  test('anchoring one focus saves state and renders the active Right Now card', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const mocks = await setupRightNowMocks(page);
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: SETUP_PROMPT })).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder(SETUP_PROMPT).fill('Close ACME renewal decision');
    await page.getByRole('button', { name: /Set Morning Anchor/i }).click();

    await expect(page.getByRole('heading', { name: /^Right now\.$/ })).toBeVisible();
    await expect(page.getByTestId('right-now-card')).toContainText('Close ACME renewal decision');
    expect(mocks.getPutBodies()).toHaveLength(1);
    expect(mocks.getPutBodies()[0]?.current_focus).toBe('Close ACME renewal decision');
  });

  test('active card answers with one click: Dismiss posts the interaction and re-renders', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const mocks = await setupRightNowMocks(page, { initialCardPayload: activeCardPayload() });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: /^Right now\.$/ })).toBeVisible({ timeout: 15000 });
    mocks.setCardPayload(
      activeCardPayload({ last_interaction: 'Last interaction: dismiss at 2026-06-12T18:00:00.000Z' }),
    );
    await page.getByRole('button', { name: /^Dismiss$/ }).click();

    await expect(page.getByTestId('right-now-card')).toContainText(/Last interaction: dismiss/i);
    expect(mocks.getActionPosts()).toEqual([{ action_id: 'dismiss' }]);
  });

  test('active card shows the full one-click loop without homework language', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupRightNowMocks(page, { initialCardPayload: activeCardPayload() });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: /^Right now\.$/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /^Dismiss$/ })).toBeVisible();
    await expect(page.getByText(/Trusted verdict: Anchor saved/i)).toBeVisible();
    await expect(page.getByTestId('right-now-card')).not.toContainText(/write the next|smallest (next|concrete) step/i);
  });

  test('resolver-backed quiet state stays honest instead of inventing a next move', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupRightNowMocks(page, {
      initialCardPayload: activeCardPayload({
        next_move: 'Next move: Stay quiet until connected work proves something is ready.',
        verdict_line:
          'Trusted verdict: Clear right now. Foldera checked the current state and nothing is ready for action yet.',
        source_line: 'Source: gmail commitment.',
      }),
    });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: /^Right now\.$/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Trusted verdict: Clear right now/i)).toBeVisible();
    await expect(page.getByTestId('right-now-card')).toContainText(
      'Next move: Stay quiet until connected work proves something is ready.',
    );
    await expect(page.getByTestId('right-now-card')).not.toContainText('Send owner confirmation note');
  });

  test('prepared draft surfaces View Draft and expands the artifact in place', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const draftReady = activeCardPayload({
      draft_ready: 'Draft ready (send_message): Confirm ACME renewal terms',
    });
    const mocks = await setupRightNowMocks(page, { initialCardPayload: draftReady });
    await page.goto('/dashboard');

    await expect(page.getByTestId('right-now-draft-ready')).toBeVisible({ timeout: 15000 });
    mocks.setCardPayload(
      activeCardPayload({
        draft_ready: 'Draft ready (send_message): Confirm ACME renewal terms',
        draft_expanded:
          'To: dana@acme.example\nSubject: Confirm ACME renewal terms\nHi Dana — confirming the renewal terms we discussed.',
        last_interaction: 'Last interaction: view_draft at 2026-06-12T18:00:00.000Z',
      }),
    );
    await page.getByRole('button', { name: /View Draft/i }).click();

    await expect(page.getByTestId('right-now-draft-expanded')).toBeVisible();
    await expect(page.getByTestId('right-now-draft-expanded')).toContainText('Confirm ACME renewal terms');
    expect(mocks.getActionPosts()).toEqual([{ action_id: 'view_draft' }]);
  });

  test('no banned copy, no dev notes, no legacy dashboard shell', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupRightNowMocks(page);
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: SETUP_PROMPT })).toBeVisible({ timeout: 15000 });
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const banned of BANNED_VISIBLE_COPY) {
      expect(bodyText).not.toContain(banned.toLowerCase());
    }
    for (const testId of LEGACY_TESTIDS) {
      await expect(page.getByTestId(testId)).toHaveCount(0);
    }
  });

  test('brand link returns to the public landing page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupRightNowMocks(page);
    await page.goto('/dashboard');

    const brandLink = page.getByRole('link', { name: /^Foldera$/ });
    await expect(brandLink).toHaveAttribute('href', '/');
  });

  test('mobile 390px renders the loop without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupRightNowMocks(page, { initialCardPayload: activeCardPayload() });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: /^Right now\.$/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /^Dismiss$/ })).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
  });

  test('no actionable console errors on the presence surface', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = collectConsoleErrors(page);
    await setupRightNowMocks(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: SETUP_PROMPT })).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });
});
