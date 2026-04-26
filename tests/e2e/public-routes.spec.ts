/**
 * Public route smoke tests — unauthenticated visitor.
 * Covers: /, /start, /login, /pricing
 * Viewports: 390px (mobile) and 1280px (desktop)
 */

import { test, expect, type Page } from '@playwright/test';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Collect actionable console errors (ignores network 400s, favicon, devtools). */
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

// ── Public API (middleware request id) ───────────────────────────────────────

test.describe('Public API', () => {
  test('/api/health returns 200 and echoes x-request-id', async ({ request }) => {
    const id = '6ba7b812-9dad-11d1-80b4-00c04fd430c8';
    const res = await request.get('/api/health', {
      headers: { 'x-request-id': id },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['x-request-id']).toBe(id);
  });

  test('/api/health sets x-request-id when absent', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const rid = res.headers()['x-request-id'];
    expect(rid).toBeTruthy();
    expect(rid).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test('/api/health includes deploy revision block (local in CI)', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.revision).toEqual({
      git_sha: null,
      git_sha_short: null,
      git_ref: null,
      deployment_id: null,
      vercel_env: null,
    });
    expect(body.build).toBe('local');
  });
});

// ── Landing page (/) ────────────────────────────────────────────────────────

test.describe('Landing page /', () => {
  test('loads with Foldera title — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page).toHaveTitle(/Foldera/i);
  });

  test('hero text is visible — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByText('Foldera').first()).toBeVisible();
  });

  test('no actionable console errors — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('loads at mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page).toHaveTitle(/Foldera/i);
    // Viewport 390px + tolerance for scrollbar / subpixel layout (nav + grid)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(410);
  });

  test('no actionable console errors — mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('blog renders public nav at 375px (unauthenticated)', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: undefined,
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    try {
      const res = await page.goto('/blog');
      expect(res?.status()).toBe(200);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('navigation')).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('link', { name: /foldera/i }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('nav and footer expose real public destinations', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Security' }).first()).toHaveAttribute(
      'href',
      '/security',
    );
    await expect(page.getByRole('link', { name: 'About' }).first()).toHaveAttribute(
      'href',
      '/about',
    );
    await expect(page.getByRole('link', { name: 'Status' }).first()).toHaveAttribute(
      'href',
      '/status',
    );
    await expect(page.locator('footer a[href="#"]')).toHaveCount(0);
  });
});

// ── Start page (/start) ────────────────────────────────────────────────────

test.describe('Start page /start', () => {
  test('loads with both OAuth buttons — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/start');
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /microsoft/i })).toBeVisible();
  });

  test('loads with both OAuth buttons — mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/start');
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /microsoft/i })).toBeVisible();
  });

  test('Google sign-in button calls the NextAuth Google endpoint', async ({ page }) => {
    await page.route(matchApiPath('/api/auth/csrf'), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'mock-csrf-token' }),
      }),
    );
    await page.route(matchApiPath('/api/auth/providers'), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          google: { id: 'google', type: 'oauth', name: 'Google' },
          'azure-ad': { id: 'azure-ad', type: 'oauth', name: 'Microsoft' },
        }),
      }),
    );

    let signInPath = '';
    await page.route(/\/api\/auth\/signin\/.*/, (route) => {
      signInPath = new URL(route.request().url()).pathname;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, status: 200, error: null, url: '/start?oauth=ok' }),
      });
    });

    await page.goto('/start');
    await Promise.all([
      page.waitForURL(/\/start\?oauth=ok$/),
      page.getByRole('button', { name: /continue with google/i }).click(),
    ]);
    expect(signInPath).toBe('/api/auth/signin/google');
  });

  test('no actionable console errors — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = collectConsoleErrors(page);
    await page.goto('/start');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });
});

// ── Login page (/login) ────────────────────────────────────────────────────

test.describe('Login page /login', () => {
  test('loads with both OAuth buttons — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /microsoft/i })).toBeVisible();
  });

  test('loads with both OAuth buttons — mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /microsoft/i })).toBeVisible();
  });

  test('sign-in heading is visible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/sign in/i).first()).toBeVisible();
  });

  test('Microsoft sign-in button calls the NextAuth Microsoft endpoint', async ({ page }) => {
    await page.route(matchApiPath('/api/auth/csrf'), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'mock-csrf-token' }),
      }),
    );
    await page.route(matchApiPath('/api/auth/providers'), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          google: { id: 'google', type: 'oauth', name: 'Google' },
          'azure-ad': { id: 'azure-ad', type: 'oauth', name: 'Microsoft' },
        }),
      }),
    );

    let signInPath = '';
    await page.route(/\/api\/auth\/signin\/.*/, (route) => {
      signInPath = new URL(route.request().url()).pathname;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, status: 200, error: null, url: '/login?oauth=ok' }),
      });
    });

    await page.goto('/login');
    await Promise.all([
      page.waitForURL(/\/login\?oauth=ok$/),
      page.getByRole('button', { name: /continue with microsoft/i }).click(),
    ]);
    expect(signInPath).toBe('/api/auth/signin/azure-ad');
  });

  test('no actionable console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });
});

// ── Pricing page (/pricing) ────────────────────────────────────────────────

test.describe('Pricing page /pricing', () => {
  test('loads with price visible — desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pricing');
    await expect(page.getByText('$29', { exact: true })).toBeVisible();
  });

  test('CTA button is visible', async ({ page }) => {
    await page.goto('/pricing');
    // Unauthenticated: CTA is an <a> link; authenticated: CTA is a <button>.
    // Match either role with the expected text.
    const ctaLink = page.getByRole('link', { name: /get started free/i }).first();
    const ctaButton = page.getByRole('button', { name: /continue to checkout/i });
    const linkVisible = await ctaLink.isVisible().catch(() => false);
    const buttonVisible = await ctaButton.isVisible().catch(() => false);
    expect(linkVisible || buttonVisible).toBe(true);
  });

  test('loads with price visible — mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pricing');
    await expect(page.getByText('$29', { exact: true })).toBeVisible();
  });

  test('no actionable console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });
});

// ── Try / legal (CI gate: public-routes) ────────────────────────────────────

test.describe('Try page /try', () => {
  test('loads with primary heading', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const res = await page.goto('/try');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /^Try Foldera$/i })).toBeVisible();
  });
});

test.describe('Terms page /terms', () => {
  test('loads with Terms of Service heading', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const res = await page.goto('/terms');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /^Terms of Service$/i })).toBeVisible();
  });
});

test.describe('Privacy page /privacy', () => {
  test('loads with Privacy Policy heading', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const res = await page.goto('/privacy');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /^Privacy Policy$/i })).toBeVisible();
  });
});

// ── Blog routes (/blog, /blog/[slug]) ──────────────────────────────────────

test.describe('Blog routes', () => {
  test('blog index loads with the post list', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/blog');
    await expect(
      page.getByRole('heading', { name: /AI that reduces work instead of creating more of it/i }),
    ).toBeVisible();
  });

  test('blog post renders markdown elements as HTML', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/blog/ai-email-assistant');

    await expect(page.locator('h2', { hasText: 'The Problem with an AI Email Assistant That Writes Emails for Me' })).toBeVisible();
    await expect(page.locator('li', { hasText: 'A drafted email ready to send' })).toBeVisible();
    await expect(page.locator('p', { hasText: "This started as a personal problem." })).toBeVisible();
  });

  test('busy professionals post renders the comparison table', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/blog/ai-assistant-busy-professionals');

    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th', { hasText: 'Tool' })).toBeVisible();
    await expect(page.locator('td', { hasText: 'Foldera' })).toBeVisible();
  });

  test('blog post loads on mobile without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/blog/ai-email-assistant');
    await expect(
      page.getByRole('heading', { name: /AI That Reads My Email and Tells Me What to Do Every Morning/i }),
    ).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(400);
  });

  test('busy professionals table stays readable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/blog/ai-assistant-busy-professionals');
    await expect(page.locator('table')).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(400);
  });

  test('blog post author link points to the founder page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/blog/ai-email-assistant');

    await page.getByRole('link', { name: 'Brandon Kapp' }).click();
    await expect(page).toHaveURL(/\/brandon-kapp$/);
    await expect(page.getByRole('heading', { name: 'Brandon Kapp', exact: true })).toBeVisible();
  });
});

test.describe('About page /about', () => {
  test('loads with About Foldera heading', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const res = await page.goto('/about');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /^About Foldera$/i })).toBeVisible();
  });
});

test.describe('Security page /security', () => {
  test('loads with Security heading', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const res = await page.goto('/security');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /^Security$/i })).toBeVisible();
  });
});

test.describe('Status page /status', () => {
  test('loads with System Status heading', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const res = await page.goto('/status');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /^System Status$/i })).toBeVisible();
  });
});

test.describe('Founder page /brandon-kapp', () => {
  test('renders the founder page with canonical metadata and profile links', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const res = await page.goto('/brandon-kapp');
    expect(res?.status()).toBe(200);

    await expect(page).toHaveTitle('Brandon Kapp | Founder of Foldera');
    await expect(page.getByRole('heading', { name: 'Brandon Kapp', exact: true })).toBeVisible();
    await expect(
      page.getByText('Founder of Foldera | Program Operations | Healthcare & Public Sector Workflows'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'LinkedIn' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Foldera Home' })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/brandon-kapp$/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /Brandon Kapp is the founder of Foldera/i,
    );
  });

  test('loads on mobile without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/brandon-kapp');
    await expect(page.getByRole('heading', { name: 'Brandon Kapp', exact: true })).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(400);
  });
});
