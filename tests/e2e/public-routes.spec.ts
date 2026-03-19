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
    // Allow up to 10px tolerance for scrollbar/minor overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(400);
  });

  test('no actionable console errors — mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
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
    await expect(page.getByText(/\$19/)).toBeVisible();
  });

  test('CTA button is visible', async ({ page }) => {
    await page.goto('/pricing');
    const cta = page.getByRole('button', { name: /trial|checkout/i });
    await expect(cta).toBeVisible();
    // Button may be disabled until session resolves — just verify it renders
  });

  test('loads with price visible — mobile 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pricing');
    await expect(page.getByText(/\$19/)).toBeVisible();
  });

  test('no actionable console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });
});
