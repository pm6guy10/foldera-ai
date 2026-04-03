/**
 * Part 2 — Clickflow Audit
 *
 * Optional harness: run with `npm run audit:smoke` (playwright.audit.config.ts), not CI or `test:local:e2e`.
 * Uses domcontentloaded (not networkidle) on first paint to avoid landing-page timeouts on busy dev servers.
 *
 * Scripted click explorer that:
 * - identifies primary interactive elements on each page
 * - clicks through safe user-facing actions
 * - records resulting route changes/modals/errors
 * - detects dead ends, confusing duplicate CTAs, no-op buttons
 * - logs whether a user can understand what to do next after each click
 */

import { test, expect } from '@playwright/test';
import {
  VIEWPORTS,
  UNAUTHENTICATED_ROUTES,
  AUTHENTICATED_ROUTES,
  collectConsoleErrors,
  collectPageErrors,
  setupAuthenticatedMocks,
  type ClickableElement,
} from './fixtures';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve(process.cwd(), 'audit-output', 'clickflow');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

interface ClickResult {
  element: { text: string; tag: string; href: string | null };
  action: string;
  resultUrl: string;
  routeChanged: boolean;
  modalAppeared: boolean;
  errorAppeared: boolean;
  newContent: string;
  deadEnd: boolean;
}

interface ClickflowReport {
  route: string;
  viewport: string;
  totalInteractive: number;
  clickResults: ClickResult[];
  duplicateCTAs: Array<{ text: string; count: number }>;
  deadEnds: string[];
  noOpButtons: string[];
}

/** Detect if a modal/dialog appeared after clicking. */
async function checkForModal(page: any): Promise<boolean> {
  return page.evaluate(() => {
    const modals = document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal, [data-state="open"]');
    return modals.length > 0;
  });
}

/** Get current visible action buttons/links (for "what next?" analysis). */
async function getVisibleActions(page: any): Promise<string[]> {
  return page.evaluate(() => {
    const actions: string[] = [];
    const els = document.querySelectorAll('a, button, [role="button"]');
    els.forEach((el: any) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
        const text = (el.textContent || '').trim().slice(0, 80);
        if (text) actions.push(text);
      }
    });
    return actions;
  });
}

/** Safe links/buttons to click (won't navigate to external or destructive URLs). */
function isSafeToClick(el: ClickableElement): boolean {
  // Skip external links
  if (el.href && !el.href.includes('localhost') && !el.href.startsWith('/')) return false;
  // Skip OAuth redirect links
  if (el.href && (el.href.includes('google') || el.href.includes('microsoft') || el.href.includes('stripe'))) return false;
  // Skip destructive actions
  const text = el.text.toLowerCase();
  if (text.includes('delete') || text.includes('sign out') || text.includes('disconnect')) return false;
  // Skip invisible
  if (!el.visible) return false;
  // Skip empty
  if (!el.text.trim()) return false;
  return true;
}

// ── Clickflow for unauthenticated routes ─────────────────────────────────────

for (const route of UNAUTHENTICATED_ROUTES) {
  test.describe(`Clickflow: ${route}`, () => {
    test('explore interactive elements', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      const pageErrors = collectPageErrors(page);

      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Gather interactive elements
      const elements: ClickableElement[] = await page.evaluate(() => {
        const clickable: any[] = [];
        const selectors = 'a, button, [role="button"], input[type="submit"]';
        document.querySelectorAll(selectors).forEach((el: any) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          clickable.push({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 100),
            href: el.href || null,
            ariaLabel: el.getAttribute('aria-label') || null,
            visible: rect.width > 0 && rect.height > 0 && style.display !== 'none',
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        });
        return clickable;
      });

      const safeElements = elements.filter(isSafeToClick);

      // Detect duplicate CTAs
      const textCounts = new Map<string, number>();
      for (const el of elements.filter(e => e.visible)) {
        const key = el.text.toLowerCase().trim();
        if (key) textCounts.set(key, (textCounts.get(key) || 0) + 1);
      }
      const duplicateCTAs = Array.from(textCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([text, count]) => ({ text, count }));

      // Click each safe element and record result
      const clickResults: ClickResult[] = [];
      const noOpButtons: string[] = [];
      const deadEnds: string[] = [];

      for (const el of safeElements.slice(0, 10)) { // cap at 10 to avoid long runs
        try {
          // Navigate back to the route first
          await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 });

          const beforeUrl = page.url();
          const beforeContent = await page.evaluate(() => document.body.innerText.slice(0, 200));

          // Click the element by text
          const locator = el.tag === 'a'
            ? page.getByRole('link', { name: new RegExp(el.text.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first()
            : page.getByRole('button', { name: new RegExp(el.text.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();

          const isVisible = await locator.isVisible().catch(() => false);
          if (!isVisible) continue;

          await locator.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(1500);

          const afterUrl = page.url();
          const afterContent = await page.evaluate(() => document.body.innerText.slice(0, 200));
          const routeChanged = beforeUrl !== afterUrl;
          const modalAppeared = await checkForModal(page);
          const errorAppeared = await page.evaluate(() => {
            const errorEls = document.querySelectorAll('[role="alert"], .error, .text-red-400, .text-red-500');
            return errorEls.length > 0;
          });

          const contentChanged = beforeContent !== afterContent;
          const isDeadEnd = !routeChanged && !modalAppeared && !contentChanged;
          const isNoOp = el.tag === 'button' && !routeChanged && !modalAppeared && !contentChanged;

          if (isDeadEnd) deadEnds.push(el.text);
          if (isNoOp) noOpButtons.push(el.text);

          clickResults.push({
            element: { text: el.text, tag: el.tag, href: el.href },
            action: routeChanged ? 'navigated' : modalAppeared ? 'modal' : contentChanged ? 'content_changed' : 'no_effect',
            resultUrl: afterUrl,
            routeChanged,
            modalAppeared,
            errorAppeared,
            newContent: afterContent.slice(0, 100),
            deadEnd: isDeadEnd,
          });
        } catch {
          // Element interaction failed — skip
        }
      }

      const report: ClickflowReport = {
        route,
        viewport: 'desktop',
        totalInteractive: elements.filter(e => e.visible).length,
        clickResults,
        duplicateCTAs,
        deadEnds,
        noOpButtons,
      };

      ensureDir(OUTPUT_DIR);
      const filename = `${route.replace(/\//g, '_').replace(/^_/, '') || 'root'}--clickflow.json`;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(report, null, 2), 'utf-8');

      // Assertions
      expect(pageErrors).toHaveLength(0);
    });
  });
}

// ── Clickflow for authenticated routes ───────────────────────────────────────

for (const route of AUTHENTICATED_ROUTES) {
  test.describe(`Clickflow: ${route} — authenticated`, () => {
    test('explore interactive elements', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      const pageErrors = collectPageErrors(page);

      await setupAuthenticatedMocks(page);
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);

      const elements: ClickableElement[] = await page.evaluate(() => {
        const clickable: any[] = [];
        const selectors = 'a, button, [role="button"], input[type="submit"]';
        document.querySelectorAll(selectors).forEach((el: any) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          clickable.push({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 100),
            href: el.href || null,
            ariaLabel: el.getAttribute('aria-label') || null,
            visible: rect.width > 0 && rect.height > 0 && style.display !== 'none',
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        });
        return clickable;
      });

      const safeElements = elements.filter(isSafeToClick);

      const textCounts = new Map<string, number>();
      for (const el of elements.filter(e => e.visible)) {
        const key = el.text.toLowerCase().trim();
        if (key) textCounts.set(key, (textCounts.get(key) || 0) + 1);
      }
      const duplicateCTAs = Array.from(textCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([text, count]) => ({ text, count }));

      const clickResults: ClickResult[] = [];
      const noOpButtons: string[] = [];
      const deadEnds: string[] = [];

      for (const el of safeElements.slice(0, 8)) {
        try {
          await setupAuthenticatedMocks(page);
          await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForTimeout(1500);

          const beforeUrl = page.url();
          const beforeContent = await page.evaluate(() => document.body.innerText.slice(0, 200));

          const locator = el.tag === 'a'
            ? page.getByRole('link', { name: new RegExp(el.text.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first()
            : page.getByRole('button', { name: new RegExp(el.text.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();

          const isVisible = await locator.isVisible().catch(() => false);
          if (!isVisible) continue;

          await locator.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(1500);

          const afterUrl = page.url();
          const afterContent = await page.evaluate(() => document.body.innerText.slice(0, 200));
          const routeChanged = beforeUrl !== afterUrl;
          const modalAppeared = await checkForModal(page);
          const errorAppeared = await page.evaluate(() => {
            const errorEls = document.querySelectorAll('[role="alert"], .error, .text-red-400, .text-red-500');
            return errorEls.length > 0;
          });
          const contentChanged = beforeContent !== afterContent;
          const isDeadEnd = !routeChanged && !modalAppeared && !contentChanged;
          const isNoOp = el.tag === 'button' && !routeChanged && !modalAppeared && !contentChanged;

          if (isDeadEnd) deadEnds.push(el.text);
          if (isNoOp) noOpButtons.push(el.text);

          clickResults.push({
            element: { text: el.text, tag: el.tag, href: el.href },
            action: routeChanged ? 'navigated' : modalAppeared ? 'modal' : contentChanged ? 'content_changed' : 'no_effect',
            resultUrl: afterUrl,
            routeChanged,
            modalAppeared,
            errorAppeared,
            newContent: afterContent.slice(0, 100),
            deadEnd: isDeadEnd,
          });
        } catch {
          // skip
        }
      }

      const report: ClickflowReport = {
        route,
        viewport: 'desktop',
        totalInteractive: elements.filter(e => e.visible).length,
        clickResults,
        duplicateCTAs,
        deadEnds,
        noOpButtons,
      };

      ensureDir(OUTPUT_DIR);
      const filename = `${route.replace(/\//g, '_').replace(/^_/, '') || 'root'}--authenticated--clickflow.json`;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(report, null, 2), 'utf-8');

      expect(pageErrors).toHaveLength(0);
    });
  });
}
