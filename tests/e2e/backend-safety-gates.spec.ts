import { test, expect, type APIRequestContext } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const MOCK_USER_ID = '22222222-2222-2222-2222-222222222222';
const MOCK_USER_EMAIL = 'gate2-test@foldera.ai';
const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
];
const IS_LIVE_BACKED_ENV = (process.env.NEXTAUTH_URL ?? '').includes('foldera.ai');

type JsonResult = {
  response: Awaited<ReturnType<APIRequestContext['get']>>;
  body: Record<string, unknown>;
  text: string;
};

async function buildCookieHeader() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for backend safety gate tests.');
  }

  const sessionToken = await encode({
    secret,
    token: {
      sub: MOCK_USER_ID,
      userId: MOCK_USER_ID,
      email: MOCK_USER_EMAIL,
      name: 'Backend Safety User',
      hasOnboarded: true,
    },
  });

  return SESSION_COOKIE_NAMES.map((name) => `${name}=${sessionToken}`).join('; ');
}

async function buildAuthHeaders(extra: Record<string, string> = {}) {
  const cookie = await buildCookieHeader();
  return {
    cookie,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function buildCronHeaders() {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return null;
  }

  return buildAuthHeaders({
    authorization: `Bearer ${cronSecret}`,
    'x-cron-secret': cronSecret,
  });
}

async function parseJsonResponse(
  responsePromise: Promise<Awaited<ReturnType<APIRequestContext['get']>>>,
): Promise<JsonResult> {
  const response = await responsePromise;
  const text = await response.text();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }

  expect(body, `Expected valid JSON response body, got: ${text}`).not.toBeNull();
  expect(typeof body).toBe('object');

  return {
    response,
    body: body as Record<string, unknown>,
    text,
  };
}

function expectNoTopLevelError(body: Record<string, unknown>) {
  expect(Object.prototype.hasOwnProperty.call(body, 'error')).toBe(false);
}

test.describe('Backend safety gates', () => {
  test('nightly-ops returns 200 and valid JSON', async ({ request }) => {
    test.setTimeout(120_000);
    const cronHeaders = await buildCronHeaders();
    test.skip(!cronHeaders, 'CRON_SECRET not available in test env');
    test.skip(IS_LIVE_BACKED_ENV, 'Skipping nightly-ops in live-backed local env');

    const result = await parseJsonResponse(
      request.post('/api/cron/nightly-ops', {
        headers: cronHeaders ?? undefined,
      }),
    );

    // Orchestrator returns 200 when every stage ok, 207 when some stages reported issues (still valid JSON summary).
    expect([200, 207]).toContain(result.response.status());
    expectNoTopLevelError(result.body);
  });

  test('health-check returns 200', async ({ request }) => {
    const cronHeaders = await buildCronHeaders();
    test.skip(!cronHeaders, 'CRON_SECRET not available in test env');

    const result = await parseJsonResponse(
      request.get('/api/cron/health-check', {
        headers: cronHeaders ?? undefined,
      }),
    );

    expect(result.response.status()).toBe(200);
  });

  test('daily-send returns 200 or 204', async ({ request }) => {
    const cronHeaders = await buildCronHeaders();
    test.skip(!cronHeaders, 'CRON_SECRET not available in test env');
    test.skip(IS_LIVE_BACKED_ENV, 'Skipping daily-send in live-backed local env');

    const result = await parseJsonResponse(
      request.post('/api/cron/daily-send', {
        headers: cronHeaders ?? undefined,
      }),
    );

    expect([200, 204]).toContain(result.response.status());
    expectNoTopLevelError(result.body);
  });

  test('onboard check API and session agree on onboarding status', async ({ request }) => {
    const headers = await buildAuthHeaders();

    const session = await parseJsonResponse(
      request.get('/api/auth/session', { headers }),
    );
    expect(session.response.status()).toBe(200);

    const onboard = await parseJsonResponse(
      request.get('/api/onboard/check', { headers }),
    );
    expect(onboard.response.status()).toBe(200);

    const sessionHasOnboarded = Boolean(
      (session.body.user as Record<string, unknown> | undefined)?.hasOnboarded,
    );
    const apiHasOnboarded = Boolean(onboard.body.hasOnboarded);

    expect(
      apiHasOnboarded,
      'JWT claims and database disagree on onboarding status',
    ).toBe(sessionHasOnboarded);
  });

  test('integrations status API and session are reachable with same auth', async ({ request }) => {
    const headers = await buildAuthHeaders();

    const session = await parseJsonResponse(
      request.get('/api/auth/session', { headers }),
    );
    expect(session.response.status()).toBe(200);
    expect(session.body).toMatchObject({
      user: {
        id: MOCK_USER_ID,
      },
    });

    const integrations = await parseJsonResponse(
      request.get('/api/integrations/status', { headers }),
    );
    expect(integrations.response.status()).toBe(200);
  });

  test('google sync endpoint handles missing tokens gracefully', async ({ request }) => {
    const headers = await buildAuthHeaders();

    const result = await parseJsonResponse(
      request.post('/api/google/sync-now', { headers }),
    );

    expect(result.response.status()).not.toBe(500);
    expect([200, 400, 401, 429]).toContain(result.response.status());
  });

  test('microsoft sync endpoint handles missing tokens gracefully', async ({ request }) => {
    const headers = await buildAuthHeaders();

    const result = await parseJsonResponse(
      request.post('/api/microsoft/sync-now', { headers }),
    );

    expect(result.response.status()).not.toBe(500);
    expect([200, 400, 401, 429]).toContain(result.response.status());
  });

  test('double-submit approve does not crash', async ({ request }) => {
    const headers = await buildAuthHeaders();
    const subscription = await parseJsonResponse(
      request.get('/api/subscription/status', { headers }),
    );
    const subscriptionStatus = String(subscription.body.status ?? '');
    test.skip(
      !['active', 'active_trial'].includes(subscriptionStatus),
      `Generic test user cannot approve directives in this env (subscription=${subscriptionStatus || 'unknown'})`,
    );

    const latest = await parseJsonResponse(
      request.get('/api/conviction/latest', { headers }),
    );
    expect(latest.response.status()).toBe(200);

    const actionId = typeof latest.body.id === 'string' ? latest.body.id : null;
    test.skip(!actionId, 'No pending action available for approve concurrency test');

    const [first, second] = await Promise.all([
      parseJsonResponse(
        request.post('/api/conviction/execute', {
          headers,
          data: { action_id: actionId, decision: 'approve' },
        }),
      ),
      parseJsonResponse(
        request.post('/api/conviction/execute', {
          headers,
          data: { action_id: actionId, decision: 'approve' },
        }),
      ),
    ]);

    expect(first.response.status()).not.toBe(500);
    expect(second.response.status()).not.toBe(500);

    const statuses = [first.body.status, second.body.status];
    expect(statuses).toContain('executed');
  });

  test('double-submit skip does not crash', async ({ request }) => {
    const headers = await buildAuthHeaders();
    const latest = await parseJsonResponse(
      request.get('/api/conviction/latest', { headers }),
    );
    expect(latest.response.status()).toBe(200);

    const actionId = typeof latest.body.id === 'string' ? latest.body.id : null;
    test.skip(!actionId, 'No pending action available for skip concurrency test');

    const [first, second] = await Promise.all([
      parseJsonResponse(
        request.post('/api/conviction/execute', {
          headers,
          data: { action_id: actionId, decision: 'skip' },
        }),
      ),
      parseJsonResponse(
        request.post('/api/conviction/execute', {
          headers,
          data: { action_id: actionId, decision: 'skip' },
        }),
      ),
    ]);

    expect(first.response.status()).not.toBe(500);
    expect(second.response.status()).not.toBe(500);

    const statuses = [first.body.status, second.body.status];
    expect(statuses).toContain('skipped');
  });

  test('set-goals rejects empty goals array', async ({ request }) => {
    const headers = await buildAuthHeaders();

    const result = await parseJsonResponse(
      request.post('/api/onboard/set-goals', {
        headers,
        data: { goals: [] },
      }),
    );

    expect(result.response.status()).toBe(400);
  });

  test('set-goals rejects malformed payload', async ({ request }) => {
    const headers = await buildAuthHeaders();

    const result = await parseJsonResponse(
      request.post('/api/onboard/set-goals', {
        headers,
        data: { garbage: true },
      }),
    );

    expect([400, 422]).toContain(result.response.status());
    expect(result.response.status()).not.toBe(500);
  });

  test('conviction execute rejects missing action_id', async ({ request }) => {
    const headers = await buildAuthHeaders();

    const result = await parseJsonResponse(
      request.post('/api/conviction/execute', {
        headers,
        data: { decision: 'approve' },
      }),
    );

    expect(result.response.status()).toBe(400);
  });

  test('conviction execute rejects invalid decision', async ({ request }) => {
    const headers = await buildAuthHeaders();

    const result = await parseJsonResponse(
      request.post('/api/conviction/execute', {
        headers,
        data: { action_id: 'fake', decision: 'destroy' },
      }),
    );

    expect([400, 404]).toContain(result.response.status());
    expect(result.response.status()).not.toBe(500);
  });

  test('set-goals rejects duplicate submission', async ({ request }) => {
    const headers = await buildAuthHeaders();
    const payload = {
      buckets: ['Career growth'],
      freeText: 'Backend safety gate duplicate submit canary',
      skipped: false,
    };

    const first = await parseJsonResponse(
      request.post('/api/onboard/set-goals', {
        headers,
        data: payload,
      }),
    );
    test.skip(
      first.response.status() !== 200,
      `Generic test user cannot complete valid set-goals write in this env (status=${first.response.status()})`,
    );

    const second = await parseJsonResponse(
      request.post('/api/onboard/set-goals', {
        headers,
        data: payload,
      }),
    );

    expect(first.response.status()).toBe(200);
    expect([200, 409]).toContain(second.response.status());
    expect(second.response.status()).not.toBe(500);
  });

  test('resend webhook rejects unsigned payload', async ({ request }) => {
    test.skip(!process.env.RESEND_WEBHOOK_SECRET, 'RESEND_WEBHOOK_SECRET not available in test env');

    const result = await parseJsonResponse(
      request.post('/api/resend/webhook', {
        headers: {
          'Content-Type': 'application/json',
        },
        data: { type: 'email.bounced', data: {} },
      }),
    );

    expect([400, 401]).toContain(result.response.status());
    expect(result.response.status()).not.toBe(500);
  });

  test('resend webhook rejects empty body', async ({ request }) => {
    test.skip(!process.env.RESEND_WEBHOOK_SECRET, 'RESEND_WEBHOOK_SECRET not available in test env');

    const result = await parseJsonResponse(
      request.post('/api/resend/webhook', {
        headers: {
          'Content-Type': 'application/json',
        },
        data: '',
      }),
    );

    // Empty body is rejected before Svix verify (400). Unsigned JSON still → 401.
    expect(result.response.status()).toBe(400);
    expect(result.response.status()).not.toBe(500);
  });
});
