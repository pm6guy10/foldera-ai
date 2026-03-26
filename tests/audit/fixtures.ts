/**
 * Shared fixtures for the Foldera UX audit suite.
 *
 * Provides mock session setup, screenshot capture, text extraction,
 * and clickable element mapping helpers.
 */

import { type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ── Constants ────────────────────────────────────────────────────────────────

export const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

export const SESSION_RESPONSE = {
  user: { id: MOCK_USER_ID, email: 'test@foldera.ai', name: 'Test User' },
  expires: future,
};

export const DIRECTIVE_RESPONSE = {
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

export const INTEGRATIONS_RESPONSE = {
  integrations: [
    { provider: 'google', is_active: true, sync_email: 'test@gmail.com', scopes: 'gmail.readonly calendar drive.readonly' },
    { provider: 'azure_ad', is_active: true, sync_email: 'test@outlook.com', scopes: 'Mail.Read Calendars.Read Files.Read Tasks.Read' },
  ],
};

export const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

export const UNAUTHENTICATED_ROUTES = ['/', '/start', '/login', '/pricing'];
export const AUTHENTICATED_ROUTES = ['/dashboard', '/dashboard/settings', '/dashboard/briefings'];

const OUTPUT_DIR = path.resolve(process.cwd(), 'audit-output');

// ── Console error collector ──────────────────────────────────────────────────

const IGNORED_PATTERNS = [
  'Failed to load resource',
  'favicon',
  'React DevTools',
  'Download the React DevTools',
  'Third-party cookie',
  'NEXT_REDIRECT',
  'net::ERR_',
  'next-auth',
  'CLIENT_FETCH_ERROR',
];

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (IGNORED_PATTERNS.some(p => text.includes(p))) return;
      errors.push(text);
    }
  });
  return errors;
}

export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });
  return errors;
}

// ── Mock setup ───────────────────────────────────────────────────────────────

function json(data: unknown) {
  return JSON.stringify(data);
}

export async function setupAuthenticatedMocks(page: Page) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(SESSION_RESPONSE) }),
  );
  await page.route('**/api/auth/csrf', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ csrfToken: 'mock-csrf-token' }) }),
  );
  await page.route('**/api/auth/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ google: {}, 'azure-ad': {} }) }),
  );
  await page.route('**/api/subscription/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ plan: 'pro', status: 'active' }) }),
  );
  await page.route('**/api/conviction/latest', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(DIRECTIVE_RESPONSE) }),
  );
  await page.route('**/api/conviction/execute', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({ status: 'ok' }) }),
  );
  await page.route('**/api/integrations/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(INTEGRATIONS_RESPONSE) }),
  );
  await page.route('**/api/briefing/latest', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json({}) }),
  );
}

// ── Data capture helpers ─────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeFilename(route: string, viewport: string): string {
  const clean = route.replace(/\//g, '_').replace(/^_/, '') || 'root';
  return `${clean}--${viewport}`;
}

/** Capture a full-page screenshot. */
export async function captureScreenshot(page: Page, route: string, viewport: string): Promise<string> {
  const dir = path.join(OUTPUT_DIR, 'screenshots');
  ensureDir(dir);
  const filename = `${sanitizeFilename(route, viewport)}.png`;
  const filepath = path.join(dir, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return filename;
}

/** Extract all visible text from the page. */
export async function captureVisibleText(page: Page, route: string, viewport: string): Promise<string> {
  const dir = path.join(OUTPUT_DIR, 'snapshots');
  ensureDir(dir);

  const text = await page.evaluate(() => {
    return document.body.innerText || '';
  });

  const filename = `${sanitizeFilename(route, viewport)}.txt`;
  fs.writeFileSync(path.join(dir, filename), text, 'utf-8');
  return text;
}

export interface ClickableElement {
  tag: string;
  role: string;
  text: string;
  href: string | null;
  ariaLabel: string | null;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Extract all clickable elements with their labels and positions. */
export async function captureClickableElements(page: Page, route: string, viewport: string): Promise<ClickableElement[]> {
  const dir = path.join(OUTPUT_DIR, 'elements');
  ensureDir(dir);

  const elements = await page.evaluate(() => {
    const clickable: any[] = [];
    const selectors = 'a, button, [role="button"], [onclick], input[type="submit"], input[type="button"]';
    const els = document.querySelectorAll(selectors);

    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const visible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';

      clickable.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 100),
        href: (el as HTMLAnchorElement).href || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        visible,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    });

    return clickable;
  });

  const filename = `${sanitizeFilename(route, viewport)}.json`;
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(elements, null, 2), 'utf-8');
  return elements;
}

/** Check if page has content (not blank). */
export async function isNotBlank(page: Page): Promise<boolean> {
  const text = await page.evaluate(() => (document.body.innerText || '').trim());
  return text.length > 10;
}

/** Find primary CTA on the page. */
export async function findPrimaryCTA(page: Page): Promise<{ text: string; tag: string } | null> {
  return page.evaluate(() => {
    // Look for prominent buttons and links
    const candidates = [
      ...Array.from(document.querySelectorAll('button')),
      ...Array.from(document.querySelectorAll('a')),
    ].filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none';
    });

    // Prefer buttons with action-oriented text
    const actionWords = /get started|sign in|connect|start|try|approve|upgrade|subscribe|continue/i;
    const primary = candidates.find((el) => actionWords.test(el.textContent || ''));
    if (primary) {
      return { text: (primary.textContent || '').trim().slice(0, 80), tag: primary.tagName.toLowerCase() };
    }

    // Fall back to first visible button
    const first = candidates.find((el) => el.tagName === 'BUTTON');
    if (first) {
      return { text: (first.textContent || '').trim().slice(0, 80), tag: 'button' };
    }

    return null;
  });
}

/** Save audit result JSON for a route+viewport combo. */
export function saveAuditResult(route: string, viewport: string, result: Record<string, any>) {
  const dir = path.join(OUTPUT_DIR, 'results');
  ensureDir(dir);
  const filename = `${sanitizeFilename(route, viewport)}.json`;
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(result, null, 2), 'utf-8');
}
