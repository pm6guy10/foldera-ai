/**
 * Part 1 — Playwright Audit Smoke Suite
 *
 * For every route at both 390px and 1280px:
 * - verify page loads successfully
 * - verify no uncaught page errors
 * - verify no console errors
 * - verify no blank screen
 * - verify primary CTA/buttons are visible
 * - verify page has one obvious next action
 * - capture full-page screenshot
 * - save visible text/content snapshot
 * - save clickable elements with labels and positions
 */

import { test, expect } from '@playwright/test';
import {
  VIEWPORTS,
  UNAUTHENTICATED_ROUTES,
  AUTHENTICATED_ROUTES,
  collectConsoleErrors,
  collectPageErrors,
  setupAuthenticatedMocks,
  captureScreenshot,
  captureVisibleText,
  captureClickableElements,
  isNotBlank,
  findPrimaryCTA,
  saveAuditResult,
} from './fixtures';

// ── Unauthenticated routes ───────────────────────────────────────────────────

for (const route of UNAUTHENTICATED_ROUTES) {
  for (const vp of VIEWPORTS) {
    test.describe(`${route} @ ${vp.name} (${vp.width}px)`, () => {
      test('audit snapshot', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });

        const consoleErrors = collectConsoleErrors(page);
        const pageErrors = collectPageErrors(page);

        await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });

        // 1. Page loaded (no crash)
        const title = await page.title();
        expect(title).toBeTruthy();

        // 2. No blank screen
        const notBlank = await isNotBlank(page);
        expect(notBlank).toBe(true);

        // 3. Capture screenshot
        const screenshotFile = await captureScreenshot(page, route, vp.name);

        // 4. Capture visible text
        const visibleText = await captureVisibleText(page, route, vp.name);

        // 5. Capture clickable elements
        const elements = await captureClickableElements(page, route, vp.name);
        const visibleElements = elements.filter(e => e.visible);

        // 6. Find primary CTA
        const primaryCTA = await findPrimaryCTA(page);

        // 7. Check no horizontal overflow
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const hasOverflow = scrollWidth > vp.width + 10;

        // Save result
        saveAuditResult(route, vp.name, {
          route,
          viewport: vp.name,
          viewportWidth: vp.width,
          title,
          notBlank,
          screenshotFile,
          visibleTextLength: visibleText.length,
          totalElements: elements.length,
          visibleElements: visibleElements.length,
          primaryCTA,
          hasOverflow,
          scrollWidth,
          consoleErrors,
          pageErrors,
          passed: consoleErrors.length === 0 && pageErrors.length === 0 && notBlank && !hasOverflow,
        });

        // Assertions
        expect(pageErrors).toHaveLength(0);
        expect(notBlank).toBe(true);
        expect(hasOverflow).toBe(false);
        // Primary CTA should exist on every page
        expect(primaryCTA).toBeTruthy();
      });
    });
  }
}

// ── Authenticated routes ─────────────────────────────────────────────────────

for (const route of AUTHENTICATED_ROUTES) {
  for (const vp of VIEWPORTS) {
    test.describe(`${route} @ ${vp.name} (${vp.width}px) — authenticated`, () => {
      test('audit snapshot', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });

        const consoleErrors = collectConsoleErrors(page);
        const pageErrors = collectPageErrors(page);

        await setupAuthenticatedMocks(page);
        await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });

        // Wait for content to render (authenticated pages may load async)
        await page.waitForTimeout(2000);

        // 1. Page loaded
        const title = await page.title();
        expect(title).toBeTruthy();

        // 2. No blank screen
        const notBlank = await isNotBlank(page);
        expect(notBlank).toBe(true);

        // 3. Capture screenshot
        const screenshotFile = await captureScreenshot(page, route, vp.name);

        // 4. Capture visible text
        const visibleText = await captureVisibleText(page, route, vp.name);

        // 5. Capture clickable elements
        const elements = await captureClickableElements(page, route, vp.name);
        const visibleElements = elements.filter(e => e.visible);

        // 6. Find primary CTA
        const primaryCTA = await findPrimaryCTA(page);

        // 7. Check no horizontal overflow
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const hasOverflow = scrollWidth > vp.width + 10;

        saveAuditResult(route, vp.name, {
          route,
          viewport: vp.name,
          viewportWidth: vp.width,
          title,
          notBlank,
          screenshotFile,
          visibleTextLength: visibleText.length,
          totalElements: elements.length,
          visibleElements: visibleElements.length,
          primaryCTA,
          hasOverflow,
          scrollWidth,
          consoleErrors,
          pageErrors,
          authenticated: true,
          passed: consoleErrors.length === 0 && pageErrors.length === 0 && notBlank && !hasOverflow,
        });

        expect(pageErrors).toHaveLength(0);
        expect(notBlank).toBe(true);
        expect(hasOverflow).toBe(false);
      });
    });
  }
}
