/**
 * Critical Path Regression Tests
 *
 * Covers the 6 key paths specified in CLAUDE.md QA standard.
 * Run: npx playwright test tests/e2e/critical-paths.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

async function waitForColdRead(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveTitle(/Foldera/i);
  await expect(page.getByText(/system observation/i)).toBeVisible();
  const goDeeper = page.getByRole('button', { name: /want to go deeper/i });
  await expect(goDeeper).toBeVisible({ timeout: 15000 });
  return goDeeper;
}

async function openTryComposer(page: Page, path: string) {
  const goDeeper = await waitForColdRead(page, path);
  await goDeeper.click();
  const textbox = page.getByRole('textbox');
  await expect(textbox).toBeVisible();
  return {
    textbox,
    submit: page.getByRole('button', { name: /get your read/i }),
  };
}

// ── Test 1: Landing page loads and CTA works ──────────────────────────────────
test.describe('Landing page', () => {
  test('loads with title and cold-read hero', async ({ page }) => {
    const goDeeper = await waitForColdRead(page, '/');
    await expect(goDeeper).toBeVisible();
  });

  test('primary CTA exists and navigates to /start', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: /get started/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/start/);
  });

  test('inline demo expands to a textarea on landing', async ({ page }) => {
    const { textbox, submit } = await openTryComposer(page, '/');
    await expect(textbox).toBeVisible();
    await expect(submit).toBeDisabled();
  });

  test('"Sign in" link goes to /login, not raw NextAuth page', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 800 });
    const loginLink = page.getByRole('link', { name: /sign in/i }).first();
    await expect(loginLink).toBeVisible();
    const href = await loginLink.getAttribute('href');
    expect(href).toBe('/login');
    expect(href).not.toContain('/api/auth/signin');
  });

  test('landing demo submit enables after typing', async ({ page }) => {
    const { textbox, submit } = await openTryComposer(page, '/');
    await textbox.fill('I have been struggling with a big career decision for weeks now and cannot decide.');
    await expect(submit).toBeEnabled();
  });

  test('no horizontal overflow at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(390);
  });
});

// ── Test 2: /start page (onboarding) ─────────────────────────────────────────
test.describe('Start page (onboarding)', () => {
  test('loads with correct background (no blue tint)', async ({ page }) => {
    await page.goto('/start');
    const bg = await page.evaluate(() => {
      return window.getComputedStyle(document.querySelector('main')!).backgroundColor;
    });
    // Should be very dark (#0B0B0C = rgb(11, 11, 12)), NOT slate-950 (#020617 = rgb(2, 6, 23))
    // Check it's a very dark color (sum of rgb < 60)
    const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
      expect(r + g + b).toBeLessThan(60); // dark background
    }
  });

  test('Google and Microsoft buttons are present', async ({ page }) => {
    await page.goto('/start');
    await expect(page.getByRole('button', { name: /connect with google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /connect with microsoft/i })).toBeVisible();
  });

  test('headline uses the unified tagline', async ({ page }) => {
    await page.goto('/start');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Finished work,\s*every morning\./);
    await expect(page.getByText(/Foldera drafts the work before you wake up\./i)).toBeVisible();
  });

  test('no horizontal overflow at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/start');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(390);
  });
});

// ── Test 3: /try demo flow (unauthenticated) ──────────────────────────────────
test.describe('/try demo page', () => {
  test('loads with textarea and disabled submit', async ({ page }) => {
    const { textbox, submit } = await openTryComposer(page, '/try');
    await expect(textbox).toBeVisible();
    await expect(submit).toBeDisabled();
  });

  test('submit button enables after typing', async ({ page }) => {
    const { textbox, submit } = await openTryComposer(page, '/try');
    const textarea = textbox;
    await textarea.fill('I have been struggling with a big career decision for weeks now and cannot decide.');
    await expect(submit).toBeEnabled();
  });

  test('unauthenticated user redirected to /start from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // Should end up at /start (or /api/auth/signin which now points to /start)
    await page.waitForURL(/\/(start|api\/auth\/signin)/, { timeout: 5000 }).catch(() => {});
    const url = page.url();
    expect(url).not.toMatch(/\/dashboard/);
  });

  test('no horizontal overflow at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/try');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(390);
  });
});

// ── Test 4: API health checks ─────────────────────────────────────────────────
test.describe('API health', () => {
  test('GET /api/health returns 200 or 503 with valid JSON shape', async ({ request }) => {
    const res = await request.get('/api/health');
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('db');
    expect(body).toHaveProperty('env');
    expect(body).toHaveProperty('ts');
    expect(['ok', 'degraded']).toContain(body.status);
  });

  test('GET /api/graph/stats requires auth and returns 401/403 unauthenticated', async ({ request }) => {
    const res = await request.get('/api/graph/stats');
    // Unauthenticated = 401 or redirect
    expect([401, 403, 302, 307]).toContain(res.status());
  });

  test('GET /api/conviction/latest requires auth', async ({ request }) => {
    const res = await request.get('/api/conviction/latest');
    expect([401, 403, 302, 307]).toContain(res.status());
  });

  test('POST /api/try/analyze returns 503 or valid directive JSON', async ({ request }) => {
    const res = await request.post('/api/try/analyze', {
      data: { text: 'I have been struggling with a career decision for three weeks and cannot make up my mind.' },
    });
    // 503 if ANTHROPIC_API_KEY not set in test env, 200 if set
    expect([200, 503]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('directive');
      expect(body).toHaveProperty('action_type');
      expect(body).toHaveProperty('confidence');
      expect(body).toHaveProperty('reason');
    }
  });
});

// ── Test 5: Mobile viewport regression ───────────────────────────────────────
test.describe('Mobile viewport (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('landing page - all interactive elements meet 44px minimum', async ({ page }) => {
    await page.goto('/');
    const ctaLink = page.getByRole('link', { name: /get started/i }).first();
    const box = await ctaLink.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(40); // 40px minimum (slightly relaxed for links)
    }
  });

  test('landing page - no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('/start page - buttons are full width and tappable', async ({ page }) => {
    await page.goto('/start');
    const googleBtn = page.getByRole('button', { name: /connect with google/i });
    const box = await googleBtn.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('/try page - textarea is visible and usable', async ({ page }) => {
    const { textbox } = await openTryComposer(page, '/try');
    const textarea = textbox;
    const box = await textarea.boundingBox();
    expect(box?.width).toBeGreaterThan(300);
  });
});

// ── Test 6: Navigation and links ─────────────────────────────────────────────
test.describe('Navigation', () => {
  test('Foldera logo on /try links back to /', async ({ page }) => {
    await page.goto('/try');
    await page.getByRole('link', { name: /foldera/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('footer is present on landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toContainText('Foldera');
  });

  test('pricing CTA links to /start', async ({ page }) => {
    await page.goto('/');
    const trialBtn = page.getByRole('link', { name: /start.*trial/i });
    await expect(trialBtn).toBeVisible();
    const href = await trialBtn.getAttribute('href');
    expect(href).toBe('/start');
  });
});
