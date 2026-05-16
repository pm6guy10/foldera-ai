import { test, expect, type Page, type Route } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const OWNER_USER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
const TEST_USER_ID = '22222222-2222-2222-2222-222222222222';
const NON_OWNER_BETA_USER_ID = '33333333-3333-4333-8333-333333333333';
const E2E_PORT = process.env.PLAYWRIGHT_WEB_PORT?.trim() || '3000';
const E2E_ORIGIN =
  process.env.PLAYWRIGHT_TEST_BASE_URL?.trim() ||
  process.env.BASE_URL?.trim() ||
  `http://127.0.0.1:${E2E_PORT}`;

const HAS_NEXTAUTH_SECRET = Boolean(process.env.NEXTAUTH_SECRET?.trim());
const describeAuthMocked = HAS_NEXTAUTH_SECRET ? test.describe : test.describe.skip;

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const SESSION_RESPONSE = {
  user: {
    id: NON_OWNER_BETA_USER_ID,
    email: 'beta-harness@foldera.example',
    name: 'Beta Harness',
  },
  expires: future,
};

const GOOGLE_CONNECTED = {
  integrations: [
    {
      provider: 'google',
      is_active: true,
      sync_email: 'beta-harness@gmail.example',
      last_synced_at: '2026-05-13T14:00:00.000Z',
      needs_reconnect: false,
      needs_reauth: false,
      needs_sync: false,
      sync_stale: false,
      missing_scopes: [],
    },
  ],
  newest_mail_signal_at: '2026-05-13T13:45:00.000Z',
  mail_ingest_looks_stale: false,
};

const GOOGLE_FIRST_RUN_CONNECTED = {
  integrations: [
    {
      provider: 'google',
      is_active: true,
      sync_email: 'beta-harness@gmail.example',
      last_synced_at: null,
      needs_reconnect: false,
      needs_reauth: false,
      needs_sync: true,
      sync_stale: false,
      status: 'never_synced',
      missing_scopes: [],
    },
  ],
  newest_mail_signal_at: '2026-05-13T13:45:00.000Z',
  mail_ingest_looks_stale: false,
};

const FIRST_RUN_READINESS = {
  status: 'connected_but_not_enough_evidence',
  connected: true,
  providers: ['Google'],
  signal_count: 1,
  processed_signal_count: 0,
  unprocessed_signal_count: 1,
  action_count: 0,
  pipeline_run_count: 0,
  last_checked_at: '2026-05-13T13:45:00.000Z',
  newest_signal_at: '2026-05-13T13:45:00.000Z',
  next_check_timing: 'Next check: use Check sources now, or wait for the next scheduled source refresh.',
  headline: 'Foldera connected Google, but only found 1 usable item so far.',
  reason: 'Foldera has 1 source item: 0 processed, 1 waiting. That is not enough evidence for a safe move yet.',
  next_action: 'Check sources now to process waiting metadata, or connect another source.',
  metadata_summary: 'Metadata says Google is connected and 1 Gmail/calendar item has arrived.',
  why_no_finished_move:
    'No finished move exists because 0 source items have been processed and no action or pipeline run exists yet.',
  value_unlock_next:
    'Check sources now to process the waiting item, or connect another source if this inbox is too thin.',
  nothing_sent_label: 'Nothing was sent.',
  can_check_now: true,
  value_proof_ready: true,
};

const MICROSOFT_CONNECTED = {
  integrations: [
    {
      provider: 'azure_ad',
      is_active: true,
      sync_email: 'beta-harness@outlook.example',
      last_synced_at: '2026-05-13T14:00:00.000Z',
      needs_reconnect: false,
      needs_reauth: false,
      needs_sync: false,
      sync_stale: false,
      missing_scopes: [],
    },
  ],
  newest_mail_signal_at: '2026-05-13T13:45:00.000Z',
  mail_ingest_looks_stale: false,
};

const NO_SAFE_MOVE = {
  daily_utility_slate: {
    finished_artifact_verdict: 'no_finished_artifact',
    primary_move: null,
    open_loops: [],
    changed_since_yesterday: [],
    blocked_but_real: null,
    watch_item: {
      title: 'No safe finished action today',
      status: 'watch_item',
      evidence: ['Latest connected source check found fresh signals but no safe finished move.'],
      why_it_matters: 'Foldera checked the current facts before inventing work.',
      no_action_reason: 'Current evidence did not prove one safe next action.',
      source_refs: ['persisted:no_send_receipt'],
    },
  },
};

const SOURCE_BACKED_ACTION = {
  id: 'beta-source-backed-action',
  directive: 'Save the benefit packet deadline note before tomorrow.',
  action_type: 'write_document',
  confidence: 82,
  reason:
    'The benefits packet has a deadline tomorrow, but the source trail still has no saved closeout note.',
  status: 'pending_approval',
  approved_count: 0,
  is_subscribed: true,
  free_artifact_remaining: true,
  artifact_paywall_locked: false,
  artifact: {
    type: 'document',
    title: 'Benefit packet deadline note',
    body: [
      '## Situation',
      'The benefits packet deadline is tomorrow and the account note is not saved.',
      '',
      '## Decision',
      'Save the packet deadline note now so the next review has the deadline, owner, and source trail in one place.',
      '',
      '## Source trail',
      'Gmail shows the benefits packet deadline. Microsoft calendar shows the review window tomorrow.',
    ].join('\n'),
  },
  discrepancy_card: {
    claim: 'Save the benefit packet deadline note before tomorrow.',
    contradiction:
      'The benefits packet has a deadline tomorrow, but no saved closeout note exists in the source trail.',
    risk: 'The deadline can be missed if the packet note is not saved before tomorrow.',
    evidence: [
      'Gmail: benefits packet deadline is tomorrow.',
      'Microsoft calendar: review window is tomorrow morning.',
    ],
    next_action: 'Save the benefit packet deadline note today.',
    why_now: 'The review window is tomorrow morning.',
    source_refs: ['gmail:benefits-deadline', 'calendar:review-window'],
    confidence: 0.82,
    pattern_keys: ['discrepancy:admin_deadline', 'action:write_document'],
  },
  discrepancy_quality: {
    passes: true,
    quality_score: 0.9,
    blocked_by: [],
    pattern_keys: ['discrepancy:admin_deadline', 'action:write_document'],
    rejection_reason: null,
  },
};

const HISTORY_AFTER_SAVE = {
  items: [
    {
      id: SOURCE_BACKED_ACTION.id,
      status: 'executed',
      action_type: 'write_document',
      generated_at: '2026-05-13T14:05:00.000Z',
      directive_preview: SOURCE_BACKED_ACTION.directive,
      has_artifact: true,
      artifact_preview: 'Benefit packet deadline note - deadline, owner, and source trail saved.',
    },
  ],
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

async function seedSession(page: Page, options: { hasOnboarded: boolean }) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for non-owner beta harness tests.');

  const sessionToken = await encode({
    secret,
    token: {
      sub: NON_OWNER_BETA_USER_ID,
      userId: NON_OWNER_BETA_USER_ID,
      email: SESSION_RESPONSE.user.email,
      name: SESSION_RESPONSE.user.name,
      hasOnboarded: options.hasOnboarded,
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

async function attachCommonMocks(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem('foldera_pending_checkout');
    } catch {
      // ignore
    }
  });
  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(matchApiPath('/api/subscription/status'), fulfillJson({
    plan: 'free',
    status: 'active_trial',
    current_period_end: null,
    can_manage_billing: false,
  }));
  await page.route(matchApiPath('/api/stripe/checkout'), fulfillJson({ error: 'mock_checkout_disabled' }));
  await page.route(matchApiPath('/api/stripe/portal'), fulfillJson({ error: 'mock_portal_disabled' }));
  await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
  await page.route(matchApiPath('/api/graph/stats'), fulfillJson({
    signalsTotal: 4,
    commitmentsActive: 1,
    patternsActive: 1,
    lastSignalAt: '2026-05-13T13:45:00.000Z',
    lastSignalSource: 'google',
  }));
  await page.route(matchApiPath('/api/source-readiness'), fulfillJson({
    ...FIRST_RUN_READINESS,
    status: 'connected_with_usable_signals',
    processed_signal_count: 4,
    unprocessed_signal_count: 0,
    headline: 'Foldera connected Google and found 4 processed source items.',
    reason: 'Foldera has processed source evidence, but no safe action exists yet.',
  }));
}

test.describe('Non-owner beta harness map', () => {
  test('reserved proof ids stay out of the simulated non-owner identity', () => {
    expect(NON_OWNER_BETA_USER_ID).not.toBe(OWNER_USER_ID);
    expect(NON_OWNER_BETA_USER_ID).not.toBe(TEST_USER_ID);
  });
});

test.describe('Non-owner beta /start smoke', () => {
  test('new unauthenticated visitor reaches start/login choices', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/start');
    await expect(page.getByRole('heading', { name: /get started with foldera/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with microsoft/i })).toBeVisible();
  });
});

describeAuthMocked('Non-owner beta simulated first path', () => {
  test('no-token user is stopped at source connection before dashboard', async ({ page }) => {
    await seedSession(page, { hasOnboarded: false });
    await attachCommonMocks(page);
    await page.route(matchApiPath('/api/integrations/status'), fulfillJson({
      integrations: [],
      newest_mail_signal_at: null,
      mail_ingest_looks_stale: false,
    }));

    await page.goto('/onboard');
    await expect(page.getByRole('heading', { name: /connect one source/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: /continue to dashboard/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /skip for now/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /connect google/i })).toHaveAttribute(
      'href',
      '/api/google/connect',
    );
    await expect(page.getByRole('link', { name: /connect microsoft/i })).toHaveAttribute(
      'href',
      '/api/microsoft/connect',
    );
  });

  test('connected non-owner can see waiting, source-backed work, disabled-send approval, and history readback', async ({ page }) => {
    await seedSession(page, { hasOnboarded: false });
    await attachCommonMocks(page);

    let integrationState: unknown = GOOGLE_FIRST_RUN_CONNECTED;
    let sourceReadinessState: unknown = FIRST_RUN_READINESS;
    let latestState: unknown = {};
    let dailyValueState: unknown = NO_SAFE_MOVE;
    let executeCalls = 0;
    let outboundSendAttempts = 0;
    let sourceCheckCalls = 0;

    await page.route(matchApiPath('/api/integrations/status'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: json(integrationState) }),
    );
    await page.route(matchApiPath('/api/source-readiness'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: json(sourceReadinessState) }),
    );
    await page.route(matchApiPath('/api/google/sync-now'), (route) => {
      sourceCheckCalls += 1;
      sourceReadinessState = {
        ...FIRST_RUN_READINESS,
        processed_signal_count: 1,
        unprocessed_signal_count: 0,
        headline: 'Foldera connected Google and found 1 processed source item.',
        reason: 'Foldera has processed source evidence, but no safe action exists yet.',
      };
      integrationState = GOOGLE_CONNECTED;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ ok: true, total: 1, gmail_signals: 1, calendar_signals: 0, drive_signals: 0 }),
      });
    });
    await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ ok: true, count: 2 }));
    await page.route(matchApiPath('/api/conviction/latest'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: json(latestState) }),
    );
    await page.route(matchApiPath('/api/conviction/daily-value'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: json(dailyValueState) }),
    );
    await page.route(matchApiPath('/api/conviction/history'), fulfillJson(HISTORY_AFTER_SAVE));
    await page.route(matchApiPath('/api/conviction/execute'), async (route) => {
      executeCalls += 1;
      const body = route.request().postDataJSON() as { decision?: string; action_id?: string };
      expect(body.action_id).toBe(SOURCE_BACKED_ACTION.id);
      expect(['approve', 'skip']).toContain(body.decision);
      if (body.decision === 'approve') {
        latestState = {};
        dailyValueState = NO_SAFE_MOVE;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          status: body.decision === 'skip' ? 'skipped' : 'executed',
          action_id: SOURCE_BACKED_ACTION.id,
          action_type: SOURCE_BACKED_ACTION.action_type,
          result: {
            saved: true,
            document_ready_email: {
              sent: false,
              reason: 'email_send_disabled',
              email_send_disabled: true,
            },
          },
        }),
      });
    });
    await page.route(/\/api\/(?:google|microsoft)\/send|\/api\/resend|\/api\/cron\/daily-send/, (route) => {
      outboundSendAttempts += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: json({ error: 'unexpected_send' }) });
    });

    await page.goto('/onboard');
    await expect(page.getByRole('button', { name: /continue to dashboard/i })).toBeEnabled({
      timeout: 15000,
    });
    const setupSaved = page.waitForResponse((response) => {
      try {
        return new URL(response.url()).pathname === '/api/onboard/set-goals';
      } catch {
        return false;
      }
    });
    await page.getByRole('button', { name: /continue to dashboard/i }).click();
    await setupSaved;

    // The real app refreshes the NextAuth session after setup. The mocked JWT cookie
    // cannot be mutated by the mocked API response, so reseed the same user as onboarded.
    await seedSession(page, { hasOnboarded: true });
    await page.goto('/dashboard');

    await expect(page.getByText(/Foldera checked today/i)).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole('heading', { name: /Foldera connected Google, but only found 1 usable item so far\./i }),
    ).toBeVisible();
    await expect(page.getByText(/1 source item: 0 processed, 1 waiting/i).first()).toBeVisible();
    await expect(page.getByText(/Newest signal/i).first()).toBeVisible();
    await expect(page.getByText(/Metadata says Google is connected/i).first()).toBeVisible();
    await expect(page.getByText(/No finished move exists because 0 source items have been processed/i).first()).toBeVisible();
    await expect(page.getByText(/Nothing was sent\./i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /check sources now/i })).toBeVisible();
    await expect(page.getByText(/What Foldera protected/i)).toBeVisible();
    await expect(page.getByText(/No safe artifact/i)).toHaveCount(0);

    await page.getByRole('link', { name: /check sources now/i }).click();
    await expect(page.getByTestId('dashboard-panel-sources')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => sourceCheckCalls).toBe(1);

    integrationState = MICROSOFT_CONNECTED;
    await page.goto('/dashboard?panel=sources');
    await expect(page.getByTestId('dashboard-panel-sources')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Microsoft/i).first()).toBeVisible();
    await expect(page.getByText(/Connected/i).first()).toBeVisible();

    latestState = SOURCE_BACKED_ACTION;
    dailyValueState = { daily_utility_slate: null };
    integrationState = GOOGLE_CONNECTED;
    await page.goto('/dashboard');

    await expect(
      page.getByRole('heading', { name: /Save the benefit packet deadline note before tomorrow/i }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('dashboard-document-body')).toContainText(
      /Gmail shows the benefits packet deadline/i,
    );
    await expect(page.getByTestId('dashboard-source-trail-panel')).toContainText(/Email thread|Connected source evidence/i);
    await expect(page.getByRole('button', { name: /copy draft/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^skip$/i })).toBeVisible();
    await expect(page.getByTestId('dashboard-primary-action')).toContainText(/^Save$/);

    await page.getByTestId('dashboard-primary-action').click();
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute(
      'data-status-id',
      'approve_saved_document',
    );
    await expect.poll(() => executeCalls).toBe(1);
    await expect.poll(() => outboundSendAttempts).toBe(0);

    await page.getByTestId('dashboard-sidebar-item-history').click();
    const historyPanel = page.getByTestId('dashboard-panel-history');
    await expect(historyPanel).toBeVisible();
    await expect(historyPanel).toContainText(/Benefit packet deadline note/i);
  });
});
