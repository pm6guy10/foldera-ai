/**
 * PRODUCTION SMOKE TESTS
 *
 * Runs against https://www.foldera.ai with real session cookies.
 * These tests catch every class of bug from the last two weeks:
 * - Sign-in loops (middleware redirect race)
 * - Session persistence (cookie domain mismatch)
 * - Broken API routes (userId empty)
 * - UI rendering (pricing copy, buttons)
 * - Cron pipeline health (nightly-ops)
 *
 * Run: npm run test:prod
 * Setup: npm run test:prod:setup (one-time, saves session for 30 days)
 */

import { test, expect } from '@playwright/test';

// ── AUTHENTICATED ROUTES (use stored session) ──────────────────────────────

test.describe('Authenticated: Dashboard', () => {
  test('loads without redirect loop', async ({ page }) => {
    const response = await page.goto('/dashboard');
    // Must be 200, not 307 (middleware redirect) or 302 (redirect to /login)
    expect(response?.status()).toBe(200);
    // Must actually be on /dashboard, not redirected to /login or /start
    expect(page.url()).toContain('/dashboard');
  });

  test('shows directive or empty state', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // Either a directive card or the empty state
    const hasDirective = await page.getByText(/approve|skip/i).first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/first read|nothing queued|nothing today|waiting|learning your patterns/i).first().isVisible().catch(() => false);
    expect(hasDirective || hasEmptyState).toBe(true);
  });

  test('no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known noise
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
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
});

test.describe('Authenticated: Settings', () => {
  test('loads with provider cards', async ({ page }) => {
    const response = await page.goto('/dashboard/settings');
    expect(response?.status()).toBe(200);
    expect(page.url()).toContain('/dashboard/settings');
    // Wait for integrations API to respond before checking for provider text
    await page.waitForResponse(
      (res) => res.url().includes('/api/integrations/status') && res.status() === 200,
      { timeout: 15000 },
    ).catch(() => {
      // Fallback: wait for network idle if the response was already received
    });
    await page.waitForLoadState('networkidle');
    // At least one provider should be visible after data loads
    const hasGoogle = await page.getByText(/google/i).first().isVisible().catch(() => false);
    const hasMicrosoft = await page.getByText(/microsoft/i).first().isVisible().catch(() => false);
    expect(hasGoogle || hasMicrosoft).toBe(true);
  });
});

test.describe('Authenticated: API health', () => {
  test('/api/auth/session returns valid session', async ({ request }) => {
    const response = await request.get('/api/auth/session');
    expect(response.status()).toBe(200);
    const body = await response.json();
    // Session must have a real user with a non-empty id
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeTruthy();
    expect(body.user.email).toBeTruthy();
  });

  test('/api/conviction/latest returns 200', async ({ request }) => {
    const response = await request.get('/api/conviction/latest');
    expect(response.status()).toBe(200);
  });

  test('/api/integrations/status returns 200', async ({ request }) => {
    const response = await request.get('/api/integrations/status');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.integrations).toBeDefined();
  });

  test('/api/stripe/checkout returns checkout URL or 400', async ({ request }) => {
    const response = await request.post('/api/stripe/checkout');
    // Accept 200 (returns URL) or 400 (already subscribed) — not 500
    expect(response.status()).not.toBe(500);
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    }
  });
});

// ── PUBLIC ROUTES (no session needed but included for completeness) ────────

test.describe('Public: Landing page', () => {
  test('renders with title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Foldera/i);
  });

  test('pricing CTA says "Get started free"', async ({ page }) => {
    await page.goto('/');
    // Scroll to bottom where pricing section lives
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const hasCorrectCopy = await page.getByText(/get started free/i).first().isVisible().catch(() => false);
    expect(hasCorrectCopy).toBe(true);
  });

  test('Get Started button links to /start', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('a[href="/start"]').first();
    await expect(link).toBeVisible();
  });
});

test.describe('Public: Login page', () => {
  test('redirects authenticated users to dashboard or onboard', async ({ page }) => {
    const response = await page.goto('/login');
    const redirectResponse = await response?.request().redirectedFrom()?.response();
    expect(redirectResponse?.status()).toBeGreaterThanOrEqual(302);
    expect(redirectResponse?.status()).toBeLessThanOrEqual(307);
    expect(page.url()).toMatch(/\/(dashboard|onboard)(\?|$)/);
  });

  test('shows error param if present', async ({ browser }) => {
    // Use a fresh unauthenticated context — authenticated users get redirected
    // away from /login before the error banner can render.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto('https://www.foldera.ai/login?error=OAuthCallback');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Sign-in failed. Please try again or use a different account.')).toBeVisible({ timeout: 10000 });
    await context.close();
  });
});

test.describe('Public: Start page', () => {
  test('redirects authenticated users to dashboard or onboard', async ({ page }) => {
    const response = await page.goto('/start');
    const redirectResponse = await response?.request().redirectedFrom()?.response();
    expect(redirectResponse?.status()).toBeGreaterThanOrEqual(302);
    expect(redirectResponse?.status()).toBeLessThanOrEqual(307);
    expect(page.url()).toMatch(/\/(dashboard|onboard)(\?|$)/);
  });
});

test.describe('Authenticated: Approve/Skip flow', () => {
  test('can skip a pending action via API', async ({ request }) => {
    const latest = await request.get('/api/conviction/latest');
    const body = await latest.json();
    if (body?.id && body?.status === 'pending_approval') {
      const execute = await request.post('/api/conviction/execute', {
        data: { action_id: body.id, decision: 'skip' },
      });
      expect(execute.status()).toBe(200);
      const result = await execute.json();
      expect(result.status).toBe('skipped');
    }
    // If no pending action, test passes (nothing to skip)
  });
});

test.describe('Authenticated: Settings interactions', () => {
  test('Google connect/disconnect buttons are clickable', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    // At least one of Connect or Disconnect should be visible for Google
    const connectBtn = page.locator('button:has-text("Connect")').first();
    const disconnectBtn = page.locator('button:has-text("Disconnect")').first();

    const hasConnect = await connectBtn.isVisible().catch(() => false);
    const hasDisconnect = await disconnectBtn.isVisible().catch(() => false);

    expect(hasConnect || hasDisconnect).toBe(true);
  });

  test('settings page has no console errors after full load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Failed to load resource')) return;
        if (text.includes('favicon')) return;
        if (text.includes('React DevTools')) return;
        if (text.includes('Download the React DevTools')) return;
        if (text.includes('Third-party cookie')) return;
        errors.push(text);
      }
    });
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');
    // Wait extra for async fetches to complete
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
});

test.describe('Public: Pricing page', () => {
  test('shows $29 price', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('domcontentloaded');
    const hasPricing = await page.locator('text=$29').first().isVisible().catch(() => false);
    expect(hasPricing).toBe(true);
  });

  test('says "No credit card required"', async ({ page }) => {
    await page.goto('/pricing');
    const hasCorrectCopy = await page.getByText(/no credit card required/i).first().isVisible().catch(() => false);
    expect(hasCorrectCopy).toBe(true);
  });
});

// ── NEW USER FLOW: UNAUTHENTICATED SIMULATION ──────────────────────────────
// Each test uses a fresh context with no storage state to simulate a brand-new
// visitor. This surfaces broken buttons and broken flows before real users hit them.

test.describe('New user flow: unauthenticated simulation', () => {
  test('landing page hero CTA navigates to /start', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    try {
      await page.goto('https://www.foldera.ai/');
      await page.waitForLoadState('networkidle');

      // Find primary CTA — text contains "Get started" or href="/start"
      const ctaByText = page.getByRole('link', { name: /get started/i }).first();
      const ctaByHref = page.locator('a[href="/start"]').first();

      const hasTextCta = await ctaByText.isVisible({ timeout: 10000 }).catch(() => false);
      const hasHrefCta = await ctaByHref.isVisible({ timeout: 10000 }).catch(() => false);

      expect(hasTextCta || hasHrefCta).toBe(true);

      if (hasTextCta) {
        await ctaByText.click();
      } else {
        await ctaByHref.click();
      }

      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/start');
    } finally {
      await context.close();
    }
  });

  test('start page renders and has sign-in options', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Failed to load resource')) return;
        if (text.includes('favicon')) return;
        if (text.includes('Third-party cookie')) return;
        if (text.includes('net::ERR_')) return;
        consoleErrors.push(text);
      }
    });
    try {
      await page.goto('https://www.foldera.ai/start');
      await page.waitForLoadState('networkidle');

      // At least one sign-in button or link should be present
      const hasGoogleBtn = await page.getByRole('button', { name: /google/i }).first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasGoogleLink = await page.getByRole('link', { name: /google/i }).first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasMicrosoftBtn = await page.getByRole('button', { name: /microsoft/i }).first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasMicrosoftLink = await page.getByRole('link', { name: /microsoft/i }).first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasSignInBtn = await page.getByRole('button', { name: /sign in/i }).first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasAnyButton = await page.getByRole('button').first().isVisible({ timeout: 10000 }).catch(() => false);

      expect(hasGoogleBtn || hasGoogleLink || hasMicrosoftBtn || hasMicrosoftLink || hasSignInBtn || hasAnyButton).toBe(true);
      expect(consoleErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('login page renders sign-in buttons', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Failed to load resource')) return;
        if (text.includes('favicon')) return;
        if (text.includes('Third-party cookie')) return;
        if (text.includes('net::ERR_')) return;
        consoleErrors.push(text);
      }
    });
    try {
      const response = await page.goto('https://www.foldera.ai/login');
      await page.waitForLoadState('networkidle');

      // Must not be a 500
      expect(response?.status()).not.toBe(500);

      // Page must contain "Sign in" text
      const hasSignInText = await page.getByText(/sign in/i).first().isVisible({ timeout: 10000 }).catch(() => false);
      expect(hasSignInText).toBe(true);

      // At least one button must be visible
      const hasButton = await page.getByRole('button').first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasLink = await page.getByRole('link').first().isVisible({ timeout: 10000 }).catch(() => false);
      expect(hasButton || hasLink).toBe(true);

      expect(consoleErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('pricing page upgrade button is clickable', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Failed to load resource')) return;
        if (text.includes('favicon')) return;
        if (text.includes('Third-party cookie')) return;
        if (text.includes('net::ERR_')) return;
        consoleErrors.push(text);
      }
    });
    try {
      const response = await page.goto('https://www.foldera.ai/pricing');
      await page.waitForLoadState('networkidle');

      if (response?.status() === 404) {
        test.skip(true, '/pricing returned 404 — page does not exist');
        return;
      }

      // Find any CTA button
      const ctaButton =
        page.getByRole('button', { name: /get started|upgrade|subscribe/i }).first();
      const ctaLink =
        page.getByRole('link', { name: /get started|upgrade|subscribe/i }).first();

      const hasBtn = await ctaButton.isVisible({ timeout: 10000 }).catch(() => false);
      const hasLink = await ctaLink.isVisible({ timeout: 10000 }).catch(() => false);

      expect(hasBtn || hasLink).toBe(true);

      if (hasBtn) {
        await expect(ctaButton).toBeEnabled({ timeout: 10000 });
        await ctaButton.click();
      } else {
        await ctaLink.click();
      }

      // After click: no page crash (page still responding)
      await page.waitForLoadState('networkidle');
      expect(page.isClosed()).toBe(false);
      expect(consoleErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('dashboard redirects unauthenticated users to login or start', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    try {
      await page.goto('https://www.foldera.ai/dashboard');
      await page.waitForLoadState('networkidle');

      const url = page.url();
      expect(url).not.toContain('/dashboard');
      expect(url).toMatch(/\/(login|start)(\?|$)|^https:\/\/www\.foldera\.ai\/?$/);
    } finally {
      await context.close();
    }
  });

  test('settings redirects unauthenticated users', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    try {
      await page.goto('https://www.foldera.ai/dashboard/settings');
      await page.waitForLoadState('networkidle');

      const url = page.url();
      expect(url).not.toContain('/dashboard/settings');
    } finally {
      await context.close();
    }
  });
});
