import { test, expect, type Page, type Route } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const HAS_NEXTAUTH_SECRET = Boolean(process.env.NEXTAUTH_SECRET?.trim());
const describeAuthMocked = HAS_NEXTAUTH_SECRET ? test.describe : test.describe.skip;
const E2E_PORT = process.env.PLAYWRIGHT_WEB_PORT?.trim() || '3000';
const E2E_ORIGIN =
  process.env.PLAYWRIGHT_TEST_BASE_URL?.trim() ||
  process.env.BASE_URL?.trim() ||
  `http://127.0.0.1:${E2E_PORT}`;
const OWNER_USER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

const DEFAULT_USER = {
  id: '00000000-0000-0000-0000-000000000111',
  email: 'test@foldera.ai',
  name: 'Test User',
};

function json(data: unknown) {
  return JSON.stringify(data);
}

function fulfillJson(data: unknown) {
  return (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(data) });
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

async function seedSession(page: Page, user = DEFAULT_USER) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for authenticated route tests.');
  }

  const sessionToken = await encode({
    secret,
    token: {
      sub: user.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      hasOnboarded: true,
    },
  });

  await page.context().addCookies([
    {
      name: 'next-auth.session-token',
      value: sessionToken,
      url: new URL('/', E2E_ORIGIN).href,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function setupSessionApis(page: Page, user = DEFAULT_USER) {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await page.route(
    matchApiPath('/api/auth/session'),
    fulfillJson({ user, expires: future }),
  );
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
}

describeAuthMocked('CPU reduction surfaces', () => {
  test('settings reconnect refreshes status without auto-calling sync-now', async ({ page }) => {
    await seedSession(page);
    await setupSessionApis(page);

    let syncNowRequests = 0;
    let integrationsStatusRequests = 0;

    await page.route(matchApiPath('/api/subscription/status'), fulfillJson({ plan: 'pro', status: 'active' }));
    await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ buckets: [], freeText: null }));
    await page.route(matchApiPath('/api/google/sync-now'), async (route) => {
      syncNowRequests += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: json({ error: 'unexpected' }) });
    });
    await page.route(matchApiPath('/api/microsoft/sync-now'), async (route) => {
      syncNowRequests += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: json({ error: 'unexpected' }) });
    });
    await page.route(matchApiPath('/api/integrations/status'), async (route) => {
      integrationsStatusRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          integrations: [
            {
              provider: 'google',
              is_active: true,
              sync_email: 'test@gmail.com',
              last_synced_at: null,
              missing_scopes: [],
            },
          ],
        }),
      });
    });

    await page.goto('/dashboard/settings?google_connected=true');
    await expect(
      page.getByText(/Google connected\. Scheduled sync will pick this up shortly\./i),
    ).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    expect(syncNowRequests).toBe(0);
    expect(integrationsStatusRequests).toBeGreaterThan(0);
  });

  test('owner system generate uses run-brief without requiring sync stages', async ({ page }) => {
    const ownerUser = {
      id: OWNER_USER_ID,
      email: 'owner@foldera.ai',
      name: 'Owner',
    };

    await seedSession(page, ownerUser);
    await setupSessionApis(page, ownerUser);

    let runBriefRequests = 0;

    await page.route(matchApiPath('/api/settings/agents'), fulfillJson({ enabled: true }));
    await page.route(matchApiPath('/api/settings/run-brief'), async (route) => {
      runBriefRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          ok: true,
          stages: {
            daily_brief: {
              ok: true,
              signal_processing: { status: 'ok', results: [] },
              generate: { status: 'ok', results: [] },
              send: { status: 'ok', results: [] },
              manual_send_fallback_attempted: false,
            },
          },
        }),
      });
    });
    await page.route(matchApiPath('/api/subscription/status'), fulfillJson({ plan: 'pro', status: 'active' }));
    await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
    await page.route(matchApiPath('/api/integrations/status'), fulfillJson({
      integrations: [
        { provider: 'google', is_active: true, sync_email: 'owner@gmail.com', last_synced_at: null, missing_scopes: [] },
      ],
    }));
    await page.route(matchApiPath('/api/system/winner-truth'), fulfillJson({
      current_winner: {
        verdict: 'no_safe_artifact_today',
        title: null,
        tier: null,
        artifact_family: null,
        note: null,
        discrepancy_card: null,
        no_safe_artifact_reason: 'No current candidate could prove every trust condition.',
      },
      sync_health: {
        providers: [
          { provider: 'google', stale: false, age_hours: 2 },
          { provider: 'microsoft', stale: true, age_hours: 80 },
        ],
        graph: {
          graph_stale: false,
          stale_entity_count: 0,
        },
        decrypt_fallback_count: 0,
      },
      top_viable_candidates: [],
      blocked_candidates: [
        {
          candidate_id: 'cwu-thin',
          title: 'Deadline closing: CWU interview #2',
          blockers: ['missing_role_fit_source_bundle'],
        },
      ],
      graph_drift: [],
      polluted_entities: [],
      three_day_consistency: {
        passes: false,
        days: [
          { day: '2026-05-05', classification: 'garbage_regression', summary: 'Old stale MACSC output' },
        ],
      },
      action_needed: ['Refresh stale provider sync before trusting silence or deadline pressure from that source.'],
      future_findings: [
        {
          classification: 'future_backlog',
          finding: 'mail_sync_stores_preview_not_full_raw_body',
          evidence: 'Current mail sync persists headers plus body preview text.',
          smallest_next_move: 'Add artifact-family-specific evidence hydration where preview-only context is too thin.',
        },
      ],
    }));
    await page.route(matchApiPath('/api/conviction/latest'), fulfillJson({}));

    await page.goto('/dashboard/system');
    await expect(page.getByRole('heading', { name: /System tools/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: /Winner truth/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/What Foldera believes/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/What contradicted it/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Good candidates present/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Deeper findings/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Run pipeline \(dry run\)/i }).click();
    await expect(page.getByText(/Dry run finished\./i)).toBeVisible({ timeout: 15000 });

    expect(runBriefRequests).toBe(1);
  });
});
