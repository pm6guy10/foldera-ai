import { expect, test, type Page, type Route } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const HAS_NEXTAUTH_SECRET = Boolean(process.env.NEXTAUTH_SECRET?.trim());
const describeAuthMocked = HAS_NEXTAUTH_SECRET ? test.describe : test.describe.skip;
const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT?.trim() || '3000';
const WEB_ORIGIN =
  process.env.PLAYWRIGHT_TEST_BASE_URL?.trim() ||
  process.env.BASE_URL?.trim() ||
  `http://127.0.0.1:${WEB_PORT}`;

type MoneyShotState = 'finished' | 'requirements' | 'no-safe';

const future = '2026-06-15T15:00:00.000Z';
const SESSION_RESPONSE = {
  user: { id: MOCK_USER_ID, email: 'test@foldera.ai', name: 'Brandon Kapp' },
  expires: future,
};

const BANNED_VISIBLE_COPY = [
  'NO REAL PRESSURE',
  'stale_selected_move_artifact',
  'selected move',
  'receipt explains',
  'safety bar',
  'mock room',
  'backend',
  'GATE_9',
  'no-safe artifact',
  'graph stale',
  'source freshness',
  'blocker packet',
  'owner/test user',
  'deterministic fixture',
  'stored winner fingerprint',
  'current receipt',
];

const FINISHED_ACTION = {
  id: 'money-shot-finished-001',
  directive: 'Save the Project Mosaic payment decision packet before the review window closes.',
  action_type: 'write_document',
  confidence: 91,
  reason:
    'The vendor review is open, the payment decision is due today, and the source trail contains enough detail to save a finished packet.',
  status: 'pending_approval',
  approved_count: 1,
  is_subscribed: true,
  artifact_readiness_state: 'FINISHED_ARTIFACT_READY',
  finished_artifact_verdict: 'strict_artifact_selected',
  artifact: {
    type: 'document',
    title: 'Project Mosaic payment decision packet',
    content:
      '## Decision\nApprove payment after the document review owner confirms the final checklist.\n\n## Source-backed reason\nThe invoice review thread names the open checklist item, and the calendar hold sets the same-day decision window.\n\n## Safe next step\nSave this packet, then approve only after the owner confirms the checklist is complete.',
  },
  discrepancy_card: {
    claim: 'Project Mosaic payment decision packet is ready to save.',
    contradiction:
      'The payment is due today, but the review owner still needs the saved decision packet before the final approval step.',
    risk:
      'If the packet is not saved before the review window closes, the payment decision loses its source trail.',
    evidence: [
      'Invoice review thread names the open checklist item.',
      'Calendar hold marks the payment review window for today.',
      'Decision note says approval waits on the final checklist confirmation.',
    ],
    next_action: 'Save the decision packet before approving payment.',
    why_now: 'The review window closes today.',
    source_refs: ['email:project-mosaic-invoice-review', 'calendar:payment-review-window'],
    confidence: 0.91,
    pattern_keys: ['discrepancy:payment_review', 'action:write_document'],
  },
  discrepancy_quality: {
    passes: true,
    quality_score: 0.94,
    blocked_by: [],
    pattern_keys: ['discrepancy:payment_review', 'action:write_document'],
    rejection_reason: null,
  },
};

const MESSAGE_ACTION = {
  id: 'money-shot-message-001',
  directive: 'Send the follow-up to Alex Morgan before noon.',
  action_type: 'send_message',
  confidence: 85,
  reason:
    'You have an open thread with no reply, the ask is time-bound, and this is the cleanest unblocker today.',
  status: 'pending_approval',
  approved_count: 1,
  is_subscribed: true,
  artifact: {
    type: 'email',
    to: 'alex.morgan@example.com',
    subject: 'Alex Morgan follow-up',
    body:
      'Hi Alex -\n\nFollowing up on the update from yesterday.\nI pulled the latest status and can send the finalized version by noon.\n\nBest,\nBrandon',
  },
  discrepancy_card: {
    claim: 'Send the follow-up to Alex Morgan before noon.',
    contradiction:
      'The Alex Morgan thread still has no reply, but the calendar hold makes the ask time-bound today.',
    risk:
      'The noon window may slip and leave the approval blocked if Brandon waits for another cycle.',
    evidence: [
      'Email thread with Alex Morgan is still awaiting Brandon response.',
      'Calendar hold creates a noon decision window.',
    ],
    next_action: 'Send the prepared follow-up to Alex Morgan before noon.',
    why_now: 'The open thread and calendar hold are both active today.',
    source_refs: ['email:alex-morgan-thread', 'calendar:noon-hold'],
    confidence: 0.85,
    pattern_keys: ['discrepancy:meeting_open_thread', 'action:send_message'],
  },
};

const REQUIREMENTS_SUMMARY_ACTION = {
  id: 'money-shot-requirements-001',
  directive: 'Requirements needed: Submit high-quality .docx documents for document collection',
  action_type: 'write_document',
  confidence: 82,
  reason:
    'The document collection deadline is today, but Foldera needs Brandon-owned document inputs before it can finish real work.',
  status: 'pending_approval',
  approved_count: 1,
  is_subscribed: true,
  artifact_readiness_state: 'REQUIREMENTS_NEEDED',
  finished_artifact_verdict: 'strict_artifact_selected',
  artifact_title: 'Requirements needed: Submit high-quality .docx documents for document collection',
  detail_required: true,
  detail_url: '/api/conviction/actions/money-shot-requirements-001',
  discrepancy_card: {
    claim: 'Commitment due today: Submit high-quality .docx documents for document collection',
    contradiction:
      'The submission window is open, but no owned document bodies, document titles, or submission URL are captured.',
    risk:
      'Foldera can name the missing inputs, but it must not invent .docx bodies or a submission destination.',
    evidence: [
      '$50 per accepted document.',
      'Files must be real .docx documents.',
      'Do not submit AI-generated, confidential, employer/client-owned, NDA-covered, or identifying content.',
    ],
    next_action: 'Paste the submission link and list/upload the candidate documents.',
    why_now: 'The submission deadline is today.',
    source_refs: ['commitment:document-collection'],
    confidence: 0.82,
    pattern_keys: ['discrepancy:deadline_staleness', 'action:write_document'],
  },
  discrepancy_quality: {
    passes: true,
    quality_score: 0.9,
    blocked_by: [],
    pattern_keys: ['discrepancy:deadline_staleness', 'action:write_document'],
    rejection_reason: null,
  },
};

const REQUIREMENTS_DETAIL_ACTION = {
  ...REQUIREMENTS_SUMMARY_ACTION,
  detail_required: false,
  artifact: {
    type: 'document',
    title: 'Document collection requirements packet',
    content:
      '## Known requirements\n- Real .docx files only.\n- Owned source bodies only.\n- No confidential, employer-owned, client-owned, NDA-covered, identifying, or AI-generated submissions.\n\n## Missing inputs\n- Owned .docx/source files.\n- Document topics or titles.\n- Submission URL.\n\n## Brandon next action\nPaste the submission link and list or upload candidate documents before Foldera prepares finished work.',
  },
};

const HISTORY_RESPONSE = {
  items: [
    {
      id: 'hist-1',
      status: 'executed',
      action_type: 'write_document',
      generated_at: '2026-05-14T08:00:00.000Z',
      directive_preview: 'Saved Project Mosaic review packet.',
      has_artifact: true,
      artifact_preview: 'Decision packet saved with source trail.',
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

function matchApiPrefix(apiPrefix: string) {
  return (url: URL | string): boolean => {
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      return parsed.pathname.startsWith(apiPrefix);
    } catch {
      return false;
    }
  };
}

async function seedAuthenticatedSession(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for dashboard regression tests.');

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

async function setupMoneyShotDashboard(
  page: Page,
  state: MoneyShotState,
  options: { messageAction?: boolean; syncableSource?: boolean } = {},
) {
  await seedAuthenticatedSession(page);

  await page.addInitScript(() => {
    const fixedNow = new Date('2026-05-15T15:00:00.000Z').valueOf();
    const OriginalDate = Date;
    class FixedDate extends OriginalDate {
      constructor(value?: string | number | Date) {
        super(value ?? fixedNow);
      }
      static now() {
        return fixedNow;
      }
    }
    Object.defineProperty(window, 'Date', { configurable: true, value: FixedDate });

    const writes: string[] = [];
    Object.defineProperty(window, '__folderaClipboardWrites', {
      configurable: true,
      value: writes,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          writes.push(value);
        },
      },
    });
    try {
      sessionStorage.removeItem('foldera_pending_checkout');
    } catch {
      // ignore
    }
  });

  const latestResponse =
    state === 'no-safe'
      ? {
          artifact_readiness_state: 'NO_SAFE_ARTIFACT',
          finished_artifact_verdict: 'no_finished_artifact',
          no_safe_artifact_reason: 'Why Foldera stopped: NO REAL PRESSURE',
        }
      : state === 'requirements'
        ? REQUIREMENTS_SUMMARY_ACTION
        : options.messageAction
          ? MESSAGE_ACTION
          : FINISHED_ACTION;

  let signOutCallCount = 0;
  const executeDecisions: string[] = [];
  const detailCalls: string[] = [];
  const syncCalls: string[] = [];

  await page.route(matchApiPath('/api/auth/session'), fulfillJson(SESSION_RESPONSE));
  await page.route(matchApiPath('/api/auth/csrf'), fulfillJson({ csrfToken: 'mock-csrf-token' }));
  await page.route(matchApiPath('/api/auth/providers'), fulfillJson({ google: {}, 'azure-ad': {} }));
  await page.route(matchApiPath('/api/auth/signout'), async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    signOutCallCount += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({ url: '/login' }),
    });
  });
  await page.route(matchApiPath('/api/subscription/status'), fulfillJson({ plan: 'pro', status: 'active', can_manage_billing: true }));
  await page.route(matchApiPath('/api/onboard/check'), fulfillJson({ hasOnboarded: true }));
  await page.route(
    matchApiPath('/api/integrations/status'),
    fulfillJson({
      integrations: [
        {
          provider: 'google',
          is_active: true,
          sync_email: 'test@gmail.com',
          last_synced_at: '2026-05-15T14:30:00.000Z',
          missing_scopes: [],
          needs_reconnect: false,
          needs_reauth: false,
          needs_sync: options.syncableSource === true,
          sync_stale: options.syncableSource === true,
        },
        {
          provider: 'azure_ad',
          is_active: false,
          sync_email: null,
          last_synced_at: null,
          missing_scopes: [],
          needs_reconnect: false,
          needs_reauth: false,
          sync_stale: false,
        },
      ],
      newest_mail_signal_at: '2026-05-15T14:30:00.000Z',
      mail_ingest_looks_stale: false,
    }),
  );
  await page.route(
    matchApiPath('/api/graph/stats'),
    fulfillJson({
      signalsTotal: 12,
      commitmentsActive: 2,
      patternsActive: 1,
      lastSignalAt: '2026-05-15T14:30:00.000Z',
      lastSignalSource: 'google',
    }),
  );
  await page.route(matchApiPath('/api/onboard/set-goals'), fulfillJson({ buckets: [], freeText: null }));
  await page.route(matchApiPath('/api/conviction/latest'), fulfillJson(latestResponse));
  await page.route(matchApiPrefix('/api/conviction/actions/'), async (route) => {
    detailCalls.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json(REQUIREMENTS_DETAIL_ACTION),
    });
  });
  await page.route(matchApiPath('/api/conviction/daily-value'), fulfillJson({ daily_utility_slate: null }));
  await page.route(matchApiPath('/api/conviction/history'), fulfillJson(HISTORY_RESPONSE));
  await page.route(matchApiPath('/api/conviction/execute'), async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const parsed = route.request().postDataJSON() as { decision?: string };
    const decision = parsed.decision === 'skip' ? 'skip' : 'approve';
    executeDecisions.push(decision);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({ status: decision === 'skip' ? 'skipped' : 'executed' }),
    });
  });
  await page.route(matchApiPath('/api/google/sync-now'), async (route) => {
    syncCalls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: json({ ok: true }) });
  });
  await page.route(matchApiPath('/api/microsoft/sync-now'), fulfillJson({ ok: true }));
  await page.route(matchApiPath('/api/stripe/checkout'), fulfillJson({ error: 'mock_checkout_disabled' }));
  await page.route(matchApiPath('/api/stripe/portal'), fulfillJson({ error: 'mock_portal_disabled' }));

  return {
    executeDecisions,
    detailCalls,
    syncCalls,
    getSignOutCallCount: () => signOutCallCount,
  };
}

async function assertMoneyShotIntegrity(page: Page, state: MoneyShotState) {
  const shell = page.getByTestId('dashboard-route-shell');
  await expect(shell).toBeVisible();
  await expect(page.getByTestId('dashboard-loading-card')).toHaveCount(0);

  const visibleText = await page.locator('body').innerText();
  for (const banned of BANNED_VISIBLE_COPY) {
    expect(visibleText.toLowerCase()).not.toContain(banned.toLowerCase());
  }

  const overflow = await page.evaluate(() => ({
    htmlOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    bodyOverflow: document.body.scrollWidth > document.body.clientWidth + 1,
  }));
  expect(overflow.htmlOverflow).toBe(false);
  expect(overflow.bodyOverflow).toBe(false);

  if (state === 'no-safe') {
    await expect(page.getByTestId('dashboard-daily-utility-slate')).toContainText('Held back safely');
    await expect(page.getByRole('button', { name: /copy read/i })).toBeVisible();
    return;
  }

  await expect(page.getByTestId('dashboard-brief-directive-section')).toBeVisible();
  await expect(page.getByTestId('dashboard-brief-why-section')).toBeVisible();
  await expect(page.getByTestId('dashboard-brief-source-section')).toContainText(/Source trail/i);
  if (page.viewportSize()?.width && page.viewportSize()!.width >= 1100) {
    await expect(page.getByTestId('dashboard-source-trail-panel')).toBeVisible();
  }

  const primaryAction = page.getByTestId('dashboard-primary-action');
  await expect(primaryAction).toBeVisible();
  await expect(page.getByRole('button', { name: /^skip$/i })).toBeVisible();

  const stageFit = await page.evaluate(() => {
    const card = document.querySelector('.foldera-dashboard-stage-brief') as HTMLElement | null;
    const body = card?.querySelector('.foldera-dashboard-stage-brief-body') as HTMLElement | null;
    const footer = card?.querySelector('footer') as HTMLElement | null;
    const bodyBox = body?.getBoundingClientRect();
    const footerBox = footer?.getBoundingClientRect();
    return {
      hasStage: Boolean(card && body && footer),
      bodyBottom: bodyBox?.bottom ?? 0,
      footerTop: footerBox?.top ?? 0,
      footerBottom: footerBox?.bottom ?? 0,
      viewportHeight: window.innerHeight,
    };
  });
  if (stageFit.hasStage) {
    expect(stageFit.bodyBottom).toBeLessThanOrEqual(stageFit.footerTop + 1);
    expect(stageFit.footerBottom).toBeLessThanOrEqual(stageFit.viewportHeight + 1);
  }
}

describeAuthMocked('Dashboard money-shot regression lock', () => {
  for (const state of ['finished', 'requirements', 'no-safe'] as const) {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ] as const) {
      test(`${state} visual baseline ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setupMoneyShotDashboard(page, state);
        await page.goto('/dashboard');
        await assertMoneyShotIntegrity(page, state);
        await expect(page.getByTestId('dashboard-route-shell')).toHaveScreenshot(
          `money-shot-${state}-${viewport.name}.png`,
          { animations: 'disabled', maxDiffPixelRatio: 0.01 },
        );
      });
    }
  }

  test('all visible controls are labeled and links have destinations', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupMoneyShotDashboard(page, 'finished');
    await page.goto('/dashboard');

    const controls = await page.evaluate(() => {
      const visible = (element: Element) => {
        const box = (element as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      return Array.from(document.querySelectorAll('button, a')).filter(visible).map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? '').trim(),
        aria: element.getAttribute('aria-label') ?? '',
        title: element.getAttribute('title') ?? '',
        href: element instanceof HTMLAnchorElement ? element.getAttribute('href') ?? '' : '',
        disabled: element instanceof HTMLButtonElement ? element.disabled : false,
      }));
    });

    for (const control of controls) {
      expect(`${control.text}${control.aria}${control.title}`.trim().length).toBeGreaterThan(0);
      if (control.tag === 'a') expect(control.href).not.toBe('');
      if (control.disabled) expect(`${control.aria} ${control.title}`.trim().length).toBeGreaterThan(0);
    }
  });

  test('desktop navigation, account menu, disabled bell, learn-more, and upgrade controls are real', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const refs = await setupMoneyShotDashboard(page, 'finished');
    await page.goto('/dashboard');

    await expect(page.getByRole('button', { name: /notifications unavailable/i })).toBeDisabled();
    await expect(page.getByRole('status', { name: /current dashboard section: today/i })).toBeVisible();

    await page.getByTestId('dashboard-sidebar-item-history').click();
    await expect(page.getByTestId('dashboard-panel-history')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBe('history');

    await page.getByTestId('dashboard-sidebar-item-sources').click();
    await expect(page.getByTestId('dashboard-panel-sources')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBe('sources');

    await page.getByTestId('dashboard-sidebar-item-account').click();
    await expect(page.getByTestId('dashboard-panel-account')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBe('account');

    await page.getByTestId('dashboard-sidebar-item-today').click();
    await expect(page.getByTestId('dashboard-panel-today')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('panel')).toBeNull();

    await expect(page.getByRole('link', { name: /learn more/i })).toHaveAttribute('href', '/#product');
    await expect(page.getByTestId('dashboard-upgrade-pro')).toHaveAttribute('href', '/pricing');

    const accountMenu = page.getByRole('button', { name: /account menu/i });
    await accountMenu.click();
    await expect(page.getByRole('menuitem', { name: /^account$/i })).toBeVisible();
    await page.getByRole('menuitem', { name: /^account$/i }).click();
    await expect(page.getByTestId('dashboard-panel-account')).toBeVisible();
    await accountMenu.click();
    await page.getByRole('menuitem', { name: /^sign out$/i }).click();
    await expect.poll(() => refs.getSignOutCallCount()).toBe(1);
  });

  test('source and upload cards are honest non-controls while source sync gives feedback', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupMoneyShotDashboard(page, 'finished');
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-source-trail-panel')).toBeVisible();

    const sourceCardContract = await page.evaluate(() => {
      const sourcePanel = document.querySelector('[data-testid="dashboard-source-trail-panel"]');
      const upload = document.querySelector('.foldera-dashboard-upload-panel');
      const cardLooksClickable = (element: Element | null) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return Boolean(element.querySelector('button, a')) || style.cursor === 'pointer';
      };
      return {
        sourcePanelHasReadableText: (sourcePanel?.textContent ?? '').trim().length > 40,
        sourceCardsClickable: cardLooksClickable(sourcePanel),
        uploadClickable: cardLooksClickable(upload),
      };
    });
    expect(sourceCardContract.sourcePanelHasReadableText).toBe(true);
    expect(sourceCardContract.sourceCardsClickable).toBe(false);
    expect(sourceCardContract.uploadClickable).toBe(false);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const refs = await setupMoneyShotDashboard(page, 'finished', { syncableSource: true });
    await page.goto('/dashboard');
    await page.getByTestId('dashboard-sidebar-item-sources').click();
    await page.getByRole('button', { name: /sync google/i }).click();
    await expect(page.getByText(/Google sync complete/i)).toBeVisible();
    expect(refs.syncCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('copy, skip, save, approve, and requirements packet controls give feedback', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let refs = await setupMoneyShotDashboard(page, 'finished');
    await page.goto('/dashboard');

    await page.getByRole('button', { name: /copy draft/i }).click();
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute('data-status-id', 'copy_succeeded');

    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute('data-status-id', 'approve_saved_document');
    expect(refs.executeDecisions).toContain('approve');

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await setupMoneyShotDashboard(page, 'finished');
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /^skip$/i }).click();
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute('data-status-id', 'skip_snoozed');

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    refs = await setupMoneyShotDashboard(page, 'requirements');
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /open requirements packet/i }).click();
    await expect(page.getByTestId('document-collection-intake')).toContainText('To finish this, provide');
    expect(refs.detailCalls).toHaveLength(1);
    await page.getByRole('button', { name: /save packet/i }).click();
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute('data-status-id', 'approve_saved_document');
  });

  test('approve control gives safe no-send feedback', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const refs = await setupMoneyShotDashboard(page, 'finished', { messageAction: true });
    await page.goto('/dashboard');

    await page.getByRole('button', { name: /^approve(?: & send)?$/i }).click();
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute(
      'data-status-id',
      /approve_recorded|approve_sent/,
    );
    expect(refs.executeDecisions).toContain('approve');
  });

  test('no-safe Copy read and mobile Today/Account pill are safe and human-readable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupMoneyShotDashboard(page, 'no-safe');
    await page.goto('/dashboard');

    await expect(page.getByRole('button', { name: /notifications unavailable/i })).toBeDisabled();
    await expect(page.getByRole('status', { name: /current dashboard section: today/i })).toBeVisible();
    await expect(page.getByText(/Held back safely/i)).toBeVisible();
    await page.getByRole('button', { name: /copy read/i }).click();
    await expect(page.getByTestId('dashboard-status-notice')).toHaveAttribute('data-status-id', 'copy_daily_value_succeeded');

    await page.getByTestId('dashboard-mobile-tab-account').click();
    await expect(page.getByRole('status', { name: /current dashboard section: account/i })).toBeVisible();
    await expect(page.getByTestId('dashboard-panel-account')).toBeVisible();
  });
});
