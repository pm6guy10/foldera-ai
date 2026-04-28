/**
 * ADVERSARIAL PRODUCTION AUDIT SUITE
 *
 * Bug reporter, not a pass/fail suite.
 * Every test collects findings and continues — no hard failures on individual issues.
 * Findings are written to:
 *   tests/production/audit-report.json   (machine-readable)
 *   tests/production/audit-summary.md    (human-readable)
 *
 * Run: npm run test:audit
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────

type Severity = 'ERROR' | 'WARNING' | 'INFO';

interface Finding {
  severity: Severity;
  category: string;
  page: string;
  description: string;
  detail?: string;
}

const findings: Finding[] = [];

function record(severity: Severity, category: string, page: string, description: string, detail?: string) {
  findings.push({ severity, category, page, description, detail });
}

// ── Screenshot helper ──────────────────────────────────────────────────────

const screenshotsDir = path.join(__dirname, 'screenshots');

function ensureScreenshotsDir() {
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
}

async function screenshot(page: Page, name: string) {
  ensureScreenshotsDir();
  try {
    await page.screenshot({ path: path.join(screenshotsDir, `${name}.png`), fullPage: false });
  } catch (e) {
    // Non-fatal
  }
}

// ── Context builders ───────────────────────────────────────────────────────

async function unauthContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: undefined });
}

function productionAuthStateReady(): boolean {
  const statePath = process.env.PLAYWRIGHT_AUTH_STATE_PATH ?? path.join(__dirname, 'auth-state.json');
  if (!fs.existsSync(statePath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
      cookies?: Array<{ name?: string; expires?: number }>;
    };
    const now = Date.now() / 1000;
    const sessionCookies = (data.cookies ?? []).filter(
      (cookie) =>
        typeof cookie.name === 'string' &&
        (cookie.name.includes('session-token') || cookie.name.includes('authjs')),
    );
    if (sessionCookies.length === 0) return false;
    for (const cookie of sessionCookies) {
      if (typeof cookie.expires === 'number' && cookie.expires > 0 && cookie.expires < now) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function authContext(browser: Browser): Promise<BrowserContext> {
  const statePath = process.env.PLAYWRIGHT_AUTH_STATE_PATH ?? 'tests/production/auth-state.json';
  return browser.newContext({ storageState: statePath });
}

const includeAuthenticatedProdAudit = process.env.FOLDERA_INCLUDE_AUTH_PROD_SMOKE === 'true';
const describeAuth = includeAuthenticatedProdAudit && productionAuthStateReady()
  ? test.describe
  : test.describe.skip;

// ── Console / request listeners ────────────────────────────────────────────

function attachListeners(page: Page, pageFindings: Finding[], pageLabel: string) {
  const NOISE = [
    'Failed to load resource',
    'favicon',
    'React DevTools',
    'Download the React DevTools',
    'Third-party cookie',
    'NEXT_REDIRECT',
    'net::ERR_',
  ];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (NOISE.some((n) => text.includes(n))) return;
      pageFindings.push({
        severity: 'ERROR',
        category: 'console',
        page: pageLabel,
        description: 'Console error',
        detail: text,
      });
    }
  });

  page.on('requestfailed', (req) => {
    pageFindings.push({
      severity: 'WARNING',
      category: 'network',
      page: pageLabel,
      description: `Request failed: ${req.method()} ${req.url()}`,
      detail: req.failure()?.errorText,
    });
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      pageFindings.push({
        severity: res.status() >= 500 ? 'ERROR' : 'WARNING',
        category: 'http',
        page: pageLabel,
        description: `HTTP ${res.status()} on ${res.url()}`,
      });
    }
  });
}

// ── Slug helper ────────────────────────────────────────────────────────────

function slugify(route: string): string {
  return route.replace(/^\//, '').replace(/\//g, '-') || 'home';
}

// ── SECTION 1: Public route crawl ──────────────────────────────────────────

test.describe('Section 1 — Public route crawl', () => {
  const PUBLIC_ROUTES = [
    '/',
    '/login',
    '/start',
    '/pricing',
    '/blog',
    '/blog/ai-email-assistant',
    '/blog/ai-task-prioritization',
    '/blog/best-ai-tools-solopreneurs-2026',
    '/blog/reduce-email-overwhelm',
    '/blog/ai-assistant-busy-professionals',
  ];

  for (const route of PUBLIC_ROUTES) {
    test(`crawl ${route}`, async ({ browser }) => {
      const isBlogIndex = route === '/blog';
      // /blog index can stay "busy" (analytics/fonts); networkidle flakes on prod.
      test.setTimeout(isBlogIndex ? 60_000 : 30_000);
      const ctx = await unauthContext(browser);
      const page = await ctx.newPage();
      const pageLabel = `public${route}`;
      const localFindings: Finding[] = [];
      attachListeners(page, localFindings, pageLabel);

      try {
        await page.goto(route, {
          waitUntil: isBlogIndex ? 'domcontentloaded' : 'networkidle',
          timeout: isBlogIndex ? 55_000 : 28_000,
        });
        if (isBlogIndex) {
          await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {
            /* best-effort; title + link audit still runs */
          });
        }

        // Page title
        const title = await page.title();
        record('INFO', 'meta', pageLabel, `Page title: "${title}"`);

        // Internal link audit
        const hrefs: string[] = await page.$$eval(
          'a[href]',
          (els) =>
            (els as HTMLAnchorElement[])
              .map((a) => a.getAttribute('href') ?? '')
              .filter((h) => h.startsWith('/')),
        );

        const uniqueHrefs = Array.from(new Set(hrefs));
        for (const href of uniqueHrefs) {
          try {
            const res = await page.request.head(href);
            if (res.status() === 404) {
              record('ERROR', 'dead-link', pageLabel, `Internal 404: ${href}`);
            }
          } catch {
            // Ignore fetch errors for link check
          }
        }

        // Visible buttons
        const buttons = await page.$$eval('button', (els) =>
          (els as HTMLButtonElement[]).map((b) => ({
            text: b.innerText.trim(),
            disabled: b.disabled,
          })),
        );
        for (const btn of buttons) {
          record('INFO', 'button', pageLabel, `Button: "${btn.text || '(no text)'}" disabled=${btn.disabled}`);
        }

        await screenshot(page, slugify(route));
      } catch (err: unknown) {
        record('ERROR', 'navigation', pageLabel, `Failed to load ${route}`, String(err));
      } finally {
        findings.push(...localFindings);
        await ctx.close();
      }

      // Always pass — this is a reporter
      expect(true).toBe(true);
    });
  }
});

// ── SECTION 2: Public button interaction ──────────────────────────────────

test.describe('Section 2 — Public button interaction', () => {
  const INTERACTIVE_ROUTES = ['/', '/login', '/start', '/pricing'];
  const SKIP_TEXT = /sign.?in|connect|google|microsoft|get.?started|upgrade/i;

  for (const route of INTERACTIVE_ROUTES) {
    test(`button interactions on ${route}`, async ({ browser }) => {
      const ctx = await unauthContext(browser);
      const page = await ctx.newPage();
      const pageLabel = `interact${route}`;
      const localFindings: Finding[] = [];

      try {
        await page.goto(route, { waitUntil: 'networkidle' });
        const initialUrl = page.url();

        const buttons = await page.$$('button');
        for (const btn of buttons) {
          const text = (await btn.innerText()).trim();
          const isVisible = await btn.isVisible().catch(() => false);
          const isDisabled = await btn.isDisabled().catch(() => false);

          if (!isVisible || isDisabled) continue;
          if (SKIP_TEXT.test(text)) continue;

          const clickErrors: string[] = [];
          const cleanup = page.on('console', (msg) => {
            if (msg.type() === 'error') clickErrors.push(msg.text());
          });

          const textBefore = await page.innerText('body').catch(() => '');
          try {
            await btn.click({ timeout: 3000 });
            await page.waitForTimeout(800);
          } catch {
            // Click may navigate or fail — that's fine
          }

          // Check for navigation away
          const afterUrl = page.url();
          if (afterUrl !== initialUrl) {
            record('INFO', 'button-nav', pageLabel, `Button "${text}" navigated to ${afterUrl}`);
            await page.goto(route, { waitUntil: 'networkidle' });
          } else {
            const textAfter = await page.innerText('body').catch(() => '');
            if (textBefore !== textAfter) {
              record('INFO', 'button-effect', pageLabel, `Button "${text}" changed page content`);
            }
          }

          if (clickErrors.length > 0) {
            record('WARNING', 'button-error', pageLabel, `Button "${text}" triggered console errors`, clickErrors.join('; '));
          } else {
            record('INFO', 'button-ok', pageLabel, `Button "${text}" clicked — no errors`);
          }

          void cleanup as unknown;
        }
      } catch (err: unknown) {
        record('ERROR', 'interaction', pageLabel, `Interaction test failed for ${route}`, String(err));
      } finally {
        await ctx.close();
      }

      expect(true).toBe(true);
    });
  }
});

// ── SECTION 3: Authenticated dashboard audit ──────────────────────────────

describeAuth('Section 3 — Authenticated dashboard audit', () => {
  const AUTH_ROUTES = ['/dashboard', '/dashboard/settings', '/onboard?edit=true'];

  for (const route of AUTH_ROUTES) {
    test(`authenticated ${route}`, async ({ browser }) => {
      const ctx = await authContext(browser);
      const page = await ctx.newPage();
      const slug = slugify(route.replace('?', '--'));
      const pageLabel = `auth${route}`;
      const localFindings: Finding[] = [];
      attachListeners(page, localFindings, pageLabel);

      try {
        await page.goto(route, { waitUntil: 'networkidle' });
        const finalUrl = page.url();

        if (finalUrl.includes('/login') || finalUrl.includes('/start')) {
          record('INFO', 'auth-guard', pageLabel, `Auth guard redirect from ${route} → ${finalUrl}`);
          await ctx.close();
          expect(true).toBe(true);
          return;
        }

        await screenshot(page, `auth-${slug}`);
      } catch (err: unknown) {
        record('ERROR', 'navigation', pageLabel, `Failed to load ${route}`, String(err));
      } finally {
        findings.push(...localFindings);
        await ctx.close();
      }

      expect(true).toBe(true);
    });
  }
});

// ── SECTION 4: API health check ───────────────────────────────────────────

async function getWithRetry(
  get: (path: string) => Promise<{ status: () => number; json: () => Promise<unknown> }>,
  path: string,
  attempts = 3,
) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await get(path);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

describeAuth('Section 4 — API health check', () => {
  interface ApiCheck {
    method: 'GET';
    path: string;
    shapeValidator?: (body: unknown) => boolean;
    shapeDescription: string;
  }

  const API_CHECKS: ApiCheck[] = [
    {
      method: 'GET',
      path: '/api/auth/session',
      shapeValidator: (b) => {
        const body = b as Record<string, unknown>;
        const user = body?.user as Record<string, unknown> | undefined;
        return !!(user?.id && user?.email);
      },
      shapeDescription: '{ user: { id, email } }',
    },
    {
      method: 'GET',
      path: '/api/integrations/status',
      shapeValidator: (b) => Array.isArray((b as Record<string, unknown>)?.integrations),
      shapeDescription: '{ integrations: [] }',
    },
    {
      method: 'GET',
      path: '/api/conviction/latest',
      shapeDescription: 'status 200 (any body)',
    },
    {
      method: 'GET',
      path: '/api/subscription/status',
      shapeValidator: (b) => typeof (b as Record<string, unknown>)?.status === 'string',
      shapeDescription: '{ status: string }',
    },
    {
      method: 'GET',
      path: '/api/onboard/set-goals',
      shapeDescription: 'status 200',
    },
  ];

  for (const check of API_CHECKS) {
    test(`${check.method} ${check.path}`, async ({ browser }) => {
      const ctx = await authContext(browser);

      try {
        const start = Date.now();
        const res = await getWithRetry((p) => ctx.request.get(p), check.path);
        const elapsed = Date.now() - start;
        const status = res.status();

        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // not JSON
        }

        const shapeOk = check.shapeValidator ? check.shapeValidator(body) : status === 200;

        record(
          status >= 400 ? 'ERROR' : shapeOk ? 'INFO' : 'WARNING',
          'api-health',
          check.path,
          `${status} in ${elapsed}ms — shape ${shapeOk ? 'OK' : 'MISMATCH'} (expected: ${check.shapeDescription})`,
          body ? JSON.stringify(body).slice(0, 200) : undefined,
        );
      } catch (err: unknown) {
        record('ERROR', 'api-health', check.path, `Request failed`, String(err));
      } finally {
        await ctx.close();
      }

      expect(true).toBe(true);
    });
  }
});

// ── SECTION 5: Generate now button ────────────────────────────────────────

describeAuth('Section 5 — Generate now button', () => {
  test('click Generate now on /dashboard/system', async ({ browser }) => {
    test.setTimeout(180_000);

    const ctx = await authContext(browser);
    const page = await ctx.newPage();
    const pageLabel = 'system/generate-now';
    const localFindings: Finding[] = [];

    try {
      await page.goto('/dashboard/system', { waitUntil: 'networkidle' });

      const finalUrl = page.url();
      if (finalUrl.includes('/login') || finalUrl.includes('/start')) {
        record('INFO', 'auth-guard', pageLabel, `Redirected to ${finalUrl} — skipping Generate now test`);
        await ctx.close();
        expect(true).toBe(true);
        return;
      }
      if (!finalUrl.includes('/dashboard/system')) {
        record('INFO', 'generate-now', pageLabel, `Not on system tools (owner-only) — got ${finalUrl}`);
        await ctx.close();
        expect(true).toBe(true);
        return;
      }

      // Attach console error listener
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!['Failed to load resource', 'favicon', 'React DevTools', 'Third-party cookie'].some((n) => text.includes(n))) {
            localFindings.push({ severity: 'WARNING', category: 'console', page: pageLabel, description: 'Console error during generate', detail: text });
          }
        }
      });

      const generateBtn = page.getByRole('button', { name: /run pipeline.*dry run/i }).first();
      const btnVisible = await generateBtn.isVisible({ timeout: 5000 }).catch(() => false);

      if (!btnVisible) {
        record('INFO', 'generate-now', pageLabel, 'Run pipeline (dry run) button not found on /dashboard/system');
        await ctx.close();
        expect(true).toBe(true);
        return;
      }

      const isDisabled = await generateBtn.isDisabled().catch(() => false);
      if (isDisabled) {
        record('INFO', 'generate-now', pageLabel, 'Run pipeline (dry run) button is disabled — skipping click');
        await ctx.close();
        expect(true).toBe(true);
        return;
      }

      const clickTime = Date.now();
      await generateBtn.click();

      // Wait up to 90s for a status message to appear
      let statusText: string | null = null;
      try {
        await page.waitForFunction(
          () => {
            const body = document.body.innerText;
            return (
              body.includes('generated and sent') ||
              body.includes('Brief generation failed') ||
              body.includes('already sent') ||
              body.includes('do_nothing') ||
              body.includes('Generating') ||
              body.includes('dry run') ||
              body.includes('Redirecting')
            );
          },
          { timeout: 115_000 },
        );
        statusText = await page.innerText('body');
      } catch {
        statusText = null;
      }

      const elapsed = Date.now() - clickTime;

      if (!statusText) {
        record('WARNING', 'generate-now', pageLabel, `No status message appeared after ${elapsed}ms`);
      } else if (statusText.includes('Brief generation failed')) {
        record('WARNING', 'generate-now', pageLabel, `"Brief generation failed" appeared after ${elapsed}ms — known false positive for do_nothing outcomes`);
      } else if (statusText.includes('generated and sent')) {
        record('INFO', 'generate-now', pageLabel, `Success: "generated and sent" appeared after ${elapsed}ms`);
      } else if (statusText.includes('already sent')) {
        record('INFO', 'generate-now', pageLabel, `Brief already sent today — appeared after ${elapsed}ms`);
      } else {
        record('INFO', 'generate-now', pageLabel, `Status after ${elapsed}ms: ${statusText.slice(0, 200)}`);
      }
    } catch (err: unknown) {
      record('ERROR', 'generate-now', pageLabel, `Generate now test failed`, String(err));
    } finally {
      findings.push(...localFindings);
      await ctx.close();
    }

    expect(true).toBe(true);
  });
});

// ── REPORT WRITER ─────────────────────────────────────────────────────────

test.describe('Report writer', () => {
  test('write audit-report.json and audit-summary.md', async () => {
    const timestamp = new Date().toISOString();

    const errors = findings.filter((f) => f.severity === 'ERROR').length;
    const warnings = findings.filter((f) => f.severity === 'WARNING').length;
    const info = findings.filter((f) => f.severity === 'INFO').length;

    const report = {
      timestamp,
      summary: { total: findings.length, errors, warnings, info },
      findings,
    };

    const reportDir = path.join(__dirname);
    fs.writeFileSync(path.join(reportDir, 'audit-report.json'), JSON.stringify(report, null, 2));

    // Build markdown summary
    const lines: string[] = [
      `# Foldera Production Audit`,
      ``,
      `**Generated:** ${timestamp}`,
      `**Total findings:** ${findings.length} (${errors} errors, ${warnings} warnings, ${info} info)`,
      ``,
    ];

    const bySeverity: Severity[] = ['ERROR', 'WARNING', 'INFO'];
    for (const sev of bySeverity) {
      const group = findings.filter((f) => f.severity === sev);
      if (group.length === 0) continue;
      lines.push(`## ${sev} (${group.length})`);
      lines.push('');
      for (const f of group) {
        lines.push(`- **[${f.category}]** \`${f.page}\` — ${f.description}${f.detail ? `\n  > ${f.detail.slice(0, 300)}` : ''}`);
      }
      lines.push('');
    }

    fs.writeFileSync(path.join(reportDir, 'audit-summary.md'), lines.join('\n'));

    // Log summary to stdout so it appears in CI
    console.log(`\n=== AUDIT SUMMARY ===`);
    console.log(`Errors: ${errors} | Warnings: ${warnings} | Info: ${info}`);
    if (errors > 0) {
      console.log('\nERRORS:');
      findings.filter((f) => f.severity === 'ERROR').forEach((f) => console.log(`  [${f.category}] ${f.page}: ${f.description}`));
    }
    if (warnings > 0) {
      console.log('\nWARNINGS:');
      findings.filter((f) => f.severity === 'WARNING').forEach((f) => console.log(`  [${f.category}] ${f.page}: ${f.description}`));
    }

    expect(true).toBe(true);
  });
});
