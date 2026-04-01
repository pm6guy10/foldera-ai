/**
 * Mobile visual QA — 375×812: horizontal overflow, hamburger overlay, full-page screenshots.
 * Writes PNGs to tests/screenshots/mobile and tests/screenshots/mobile-after (same capture = post-QA proof).
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const VIEW = { width: 375, height: 812 } as const;

const SCREENSHOT_DIRS = [
  path.join(process.cwd(), 'tests', 'screenshots', 'mobile'),
  path.join(process.cwd(), 'tests', 'screenshots', 'mobile-after'),
];

const PUBLIC_PATHS: { name: string; path: string }[] = [
  { name: 'home', path: '/' },
  { name: 'start', path: '/start' },
  { name: 'login', path: '/login' },
  { name: 'pricing', path: '/pricing' },
  { name: 'blog', path: '/blog' },
  { name: 'blog-first', path: '/blog/ai-email-assistant' },
  { name: 'try', path: '/try' },
  { name: 'privacy', path: '/privacy' },
  { name: 'terms', path: '/terms' },
];

test.describe('Mobile 375px — no horizontal overflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEW);
  });

  for (const { name, path: urlPath } of PUBLIC_PATHS) {
    test(`scrollWidth ≤ viewport: ${name}`, async ({ page }) => {
      await page.goto(urlPath, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => page.goto(urlPath));
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `${name} scrollWidth`).toBeLessThanOrEqual(375);
    });
  }
});

test.describe('Mobile hamburger (/)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEW);
  });

  test('opens full-screen overlay, closes on X', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => page.goto('/'));
    const toggle = page.getByTestId('nav-mobile-menu-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();
    const dialog = page.getByRole('dialog', { name: 'Site menu' });
    await expect(dialog).toBeVisible();
    const backdrop = dialog.locator('[role="presentation"]').first();
    await expect(backdrop).toBeVisible();
    await dialog.getByRole('button', { name: 'Close menu' }).click();
    await expect(dialog).toBeHidden();

    await toggle.click();
    await expect(page.getByRole('dialog', { name: 'Site menu' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Site menu' }).locator('[role="presentation"]').click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole('dialog', { name: 'Site menu' })).toBeHidden();
  });
});

test.describe('Mobile screenshots', () => {
  test.beforeAll(() => {
    for (const dir of SCREENSHOT_DIRS) fs.mkdirSync(dir, { recursive: true });
  });

  test('capture all public pages at 375px (mobile + mobile-after)', async ({ page }) => {
    await page.setViewportSize(VIEW);
    for (const { name, path: urlPath } of PUBLIC_PATHS) {
      await page.goto(urlPath, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => page.goto(urlPath));
      for (const dir of SCREENSHOT_DIRS) {
        await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
      }
    }
  });
});
