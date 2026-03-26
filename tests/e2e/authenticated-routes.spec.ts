/**
 * Authenticated route smoke tests — mocked NextAuth session.
 * Covers: /dashboard, /dashboard/settings
 * Tests: directive card, approve/skip buttons, provider cards, console errors
 * Viewports: 390px (mobile) and 1280px (desktop)
 *
 * NextAuth uses /api/auth/session to determine auth state.
 * We intercept that request AND /api/auth/csrf to provide a complete
 * mock session. We also mock all downstream API calls.
 */

import { test, expect, type Page } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const MOCK_USER_ID = 'test-user-00000000-0000-0000-0000-000000000001';
const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
];

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
  evidence: [{ type: 'signal', description: 'Email from Keri on March 14' }],
  artifact: {
    type: 'email',
    to: 'keri.nopens@example.com',
    subject: 'MAS3 timeline follow-up',
    body: 'Hi Keri,\n\nI wanted to follow up on the MAS3 timeline.\n\nBest,\nBrandon',
    draft_type: 'email_compose',
  },
};

const INTEGRATIONS_RESPONSE = {
  integrations: [
    { provider: 'google', is_active: true, sync_email: 'test@gmail.com' },
    { provider: 'azure_ad', is_active: true, sync_email: 'test@outlook.com' },
  ],
};

function json(data: unknown) {
  return JSON.stringify(data);
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
    },
  });

  await page.context().setExtraHTTPHeaders({
    cookie: SESSION_COOKIE_NAMES.map((name) => `${name}=${sessionToken}`).join('; '),
  });
}

/** Set up all mocks for an authenticated dashboard with a directive. */
async function setupDashboardMocks(page: Page) {
  await seedAuthenticatedSession(page);
  // NextAuth session + CSRF
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(SESSION_RESPONSE) }),
  );
  await page.route('**/api/auth/csrf', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ csrfToken: 'mock-csrf-token' }) }),
  );
  await page.route('**/api/auth/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ google: {}, 'azure-ad': {} }) }),
  );
  // App API
  await page.route('**/api/subscription/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ plan: 'pro', status: 'active' }) }),
  );
  await page.route('**/api/onboard/check', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ hasOnboarded: true }) }),
  );
  await page.route('**/api/conviction/latest', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(DIRECTIVE_RESPONSE) }),
  );
  await page.route('**/api/conviction/execute', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ status: 'ok' }) }),
  );
}

/** Set up mocks for dashboard with no directive (empty state). */
async function setupEmptyDashboardMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(SESSION_RESPONSE) }),
  );
  await page.route('**/api/auth/csrf', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ csrfToken: 'mock-csrf-token' }) }),
  );
  await page.route('**/api/subscription/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ plan: 'pro', status: 'active' }) }),
  );
  await page.route('**/api/onboard/check', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ hasOnboarded: true }) }),
  );
  await page.route('**/api/conviction/latest', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({}) }),
  );
}

/** Set up mocks for settings page. */
async function setupSettingsMocks(page: Page) {
  await seedAuthenticatedSession(page);
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(SESSION_RESPONSE) }),
  );
  await page.route('**/api/auth/csrf', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ csrfToken: 'mock-csrf-token' }) }),
  );
  await page.route('**/api/subscription/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ plan: 'pro', status: 'active' }) }),
  );
  await page.route('**/api/integrations/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(INTEGRATIONS_RESPONSE) }),
  );
  await page.route('**/api/onboard/set-goals', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ buckets: [], freeText: null }) }),
  );
}

// ── Dashboard tests ─────────────────────────────────────────────────────────

test.describe('Dashboard /dashboard — authenticated', () => {
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
    await expect(page.getByText(/executed|done/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('skip button is clickable', async ({ page }) => {
    await setupDashboardMocks(page);
    await page.goto('/dashboard');
    await expect(page.getByText(/follow-up email/i)).toBeVisible({ timeout: 15000 });
    const skipBtn = page.getByRole('button', { name: /skip/i });
    await expect(skipBtn).toBeVisible();
    await skipBtn.click();
    await expect(page.getByText(/skipped|adjust/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('loads empty state when no directive — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupEmptyDashboardMocks(page);
    await page.goto('/dashboard');
    await expect(page.getByText(/first read|nothing queued|no directive/i).first()).toBeVisible({ timeout: 15000 });
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
});

// ── Settings tests ──────────────────────────────────────────────────────────

test.describe('Settings /dashboard/settings — authenticated', () => {
  test('loads with provider cards visible — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupSettingsMocks(page);
    await page.goto('/dashboard/settings');
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

  test('unauthenticated settings page renders without crash', async ({ page }) => {
    // Without session mock, page should render something (sign-in prompt, redirect, or loading)
    // It must NOT crash or show a blank white page
    await page.goto('/dashboard/settings');
    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText();
    // Page rendered something (not blank)
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('no actionable console errors — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = collectConsoleErrors(page);
    await setupSettingsMocks(page);
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });
});
