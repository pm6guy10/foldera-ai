import { test, expect, type Page, type Route } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const HAS_NEXTAUTH_SECRET = Boolean(process.env.NEXTAUTH_SECRET?.trim());
const describeWithAuth = HAS_NEXTAUTH_SECRET ? test.describe : test.describe.skip;

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT?.trim() || '3000';
const WEB_ORIGIN =
  process.env.PLAYWRIGHT_TEST_BASE_URL?.trim() ||
  process.env.BASE_URL?.trim() ||
  `http://127.0.0.1:${WEB_PORT}`;

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const SESSION_RESPONSE = {
  user: { id: MOCK_USER_ID, email: 'test@foldera.ai', name: 'Test User' },
  expires: future,
};

function json(data: unknown): string {
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

async function seedAuthenticatedSession(page: Page): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for authenticated dashboard tests.');

  const sessionToken = await encode({
    secret,
    token: {
      sub: MOCK_USER_ID,
      userId: MOCK_USER_ID,
      email: SESSION_RESPONSE.user.email,
      name: SESSION_RESPONSE.user.name,
      hasOnboarded: true,
    },
  });

  await page.context().addCookies([
    {
      name: 'next-auth.session-token',
      value: sessionToken,
      url: new URL('/', WEB_ORIGIN).href,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

describeWithAuth('Dashboard empty-state first-read trigger', () => {
  test('connected user can trigger first read from an empty dashboard shell', async ({ page }) => {
    await seedAuthenticatedSession(page);

    let latestCalls = 0;
    let runBriefCalls = 0;

    await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
    await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
    await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
    await page.route(
      matchApiPath('/api/integrations/status'),
      fulfillJson({
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
    );
    await page.route(matchApiPath('/api/stripe/checkout'), fulfillJson({ error: 'mock' }));
    await page.route(matchApiPath('/api/conviction/latest'), async (route) => {
      latestCalls += 1;
      const payload =
        latestCalls === 1
          ? {}
          : {
              id: 'action-empty-first-read-001',
              directive: 'Send the follow-up to Holly before 4 PM PT.',
              action_type: 'send_message',
              confidence: 83,
              reason: 'The reference packet still needs a named owner today.',
              status: 'pending_approval',
              artifact_paywall_locked: false,
              artifact: {
                type: 'email',
                to: 'holly@example.com',
                subject: 'Packet owner confirmation by 4 PM PT',
                body: 'Hi Holly,\n\nCan you confirm whether you own the final packet handoff by 4 PM PT today?\n\nThanks,\nBrandon',
              },
            };

      await route.fulfill({ status: 200, contentType: 'application/json', body: json(payload) });
    });
    await page.route(matchApiPath('/api/settings/run-brief'), async (route) => {
      runBriefCalls += 1;
      const url = new URL(route.request().url());
      expect(url.searchParams.get('force')).toBe('true');
      expect(url.searchParams.get('use_llm')).toBe('true');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          ok: true,
          spend_policy: {
            pipeline_dry_run: false,
            paid_llm_requested: true,
            paid_llm_effective: true,
          },
          stages: {
            daily_brief: {
              ok: true,
            },
          },
        }),
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');

    await expect(page.getByTestId('dashboard-empty-state')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/You're set until tomorrow morning\./i)).toBeVisible();
    await expect(page.getByTestId('dashboard-run-first-read')).toBeVisible();

    await page.getByTestId('dashboard-run-first-read').click();

    await expect.poll(() => runBriefCalls).toBe(1);
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute(
      'data-status-id',
      'first_read_generated',
    );
    await expect(page.getByTestId('pixel-lock-artifact-title')).toHaveText(
      'Send the follow-up to Holly before 4 PM PT.',
    );
    await expect(page.getByTestId('pixel-lock-artifact-body')).toContainText(
      'Can you confirm whether you own the final packet handoff by 4 PM PT today?',
    );
    await expect.poll(() => latestCalls).toBeGreaterThan(1);
  });
});
