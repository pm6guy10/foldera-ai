import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockCreateServerClient = vi.fn();
const mockApiErrorForRoute = vi.fn();
const mockBuildContextGreeting = vi.fn();
const mockGetSubscriptionStatus = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: mockCreateServerClient }));
vi.mock('@/lib/utils/api-error', () => ({ apiErrorForRoute: mockApiErrorForRoute }));
vi.mock('@/lib/briefing/context-builder', () => ({ buildContextGreeting: mockBuildContextGreeting }));
vi.mock('@/lib/auth/subscription', () => ({ getSubscriptionStatus: mockGetSubscriptionStatus }));

type SupabaseMockOptions = {
  pendingActions: Record<string, unknown>[];
  consumedCount: number;
  accountCreatedAt?: string | null;
};

const VALID_DISCREPANCY_CARD = {
  claim: 'Packet owner confirmation is ready for review.',
  contradiction:
    'The owner confirmation is due today, but the packet still has no confirmed owner in the source trail.',
  risk: 'The packet may miss today\'s same-day handoff window if the owner is not confirmed.',
  evidence: [
    'Source trail: owner confirmation due today.',
    'Packet metadata: confirmed owner is still missing.',
  ],
  next_action: 'Confirm the packet owner before 4 PM PT today.',
  why_now: 'The same-day handoff window closes today.',
  source_refs: ['signal:owner-confirmation', 'artifact:packet-metadata'],
  confidence: 0.88,
  pattern_keys: ['discrepancy:admin_deadline', 'action:write_document'],
};

const LATEST_NO_SEND_RECEIPT = {
  id: 'no-send-1',
  action_type: 'do_nothing',
  directive_text: 'Nothing cleared the bar today after evaluating 2 candidates.',
  reason: 'Selected candidate failed discrepancy-card quality: weak_next_action',
  status: 'skipped',
  generated_at: '2026-05-06T13:43:52.405Z',
  execution_result: {
    outcome_type: 'no_send',
    generation_log: {
      outcome: 'no_send',
      stage: 'validation',
      reason: 'Selected candidate failed discrepancy-card quality: weak_next_action',
      candidateDiscovery: {
        candidateCount: 2,
        suppressedCandidateCount: 0,
        selectionMargin: null,
        selectionReason: null,
        failureReason: 'Selected candidate failed discrepancy-card quality: weak_next_action',
        topCandidates: [],
      },
    },
  },
};

function buildSupabaseMock(options: SupabaseMockOptions) {
  const inConsumedStatuses = vi.fn().mockResolvedValue({ count: options.consumedCount });

  const consumedCountEqUser = vi.fn().mockReturnValue({ in: inConsumedStatuses });
  const pendingRankingRows = options.pendingActions.map((action) => ({
    id: action.id,
    confidence: action.confidence,
    generated_at: action.generated_at,
    status: action.status,
  }));
  const pendingLimit = vi.fn().mockResolvedValue({ data: pendingRankingRows, error: null });
  const pendingOrderGenerated = vi.fn().mockReturnValue({ limit: pendingLimit });
  const pendingOrderConfidence = vi.fn().mockReturnValue({ order: pendingOrderGenerated });
  const pendingEqStatus = vi.fn().mockReturnValue({ order: pendingOrderConfidence });
  const pendingEqUser = vi.fn().mockReturnValue({ eq: pendingEqStatus });

  let selectedPayloadId: unknown;
  const pendingPayloadMaybeSingle = vi.fn().mockImplementation(() =>
    Promise.resolve({
      data: options.pendingActions.find((action) => action.id === selectedPayloadId) ?? null,
      error: null,
    }),
  );
  const pendingPayloadEqId = vi.fn().mockImplementation((_column: string, value: unknown) => {
    selectedPayloadId = value;
    return { maybeSingle: pendingPayloadMaybeSingle };
  });
  const pendingPayloadEqStatus = vi.fn().mockReturnValue({ eq: pendingPayloadEqId });
  const pendingPayloadEqUser = vi.fn().mockReturnValue({ eq: pendingPayloadEqStatus });

  const tkgActionsSelect = vi
    .fn()
    .mockImplementation((columns: string, config?: { count?: string; head?: boolean }) => {
      if (config?.head) {
        return { eq: consumedCountEqUser };
      }
      if (columns === 'id, confidence, generated_at, status') {
        return { eq: pendingEqUser };
      }
      if (
        columns ===
        'id, action_type, directive_text, reason, confidence, evidence, status, generated_at, approved_at, executed_at, execution_result, artifact'
      ) {
        return { eq: pendingPayloadEqUser };
      }
      if (
        columns ===
        'id, action_type, directive_text, reason, status, generated_at, execution_result'
      ) {
        return {
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [LATEST_NO_SEND_RECEIPT], error: null }),
              }),
            }),
          }),
        };
      }
      return { eq: pendingEqUser };
    });

  const userSubscriptionUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const userSubscriptionUpdate = vi.fn().mockReturnValue({ eq: userSubscriptionUpdateEq });
  const getUserById = vi.fn().mockResolvedValue({
    data: { user: { created_at: options.accountCreatedAt ?? '2026-01-02T00:00:00.000Z' } },
    error: null,
  });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'tkg_actions') return { select: tkgActionsSelect };
    if (table === 'user_subscriptions') return { update: userSubscriptionUpdate };
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from,
    auth: {
      admin: {
        getUserById,
      },
    },
    spies: {
      inConsumedStatuses,
      pendingLimit,
      pendingPayloadMaybeSingle,
      tkgActionsSelect,
      getUserById,
    },
  };
}

function buildPendingAction(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 'action-1',
    directive_text: 'Finalize packet owner outreach.',
    action_type: 'write_document',
    confidence: 92,
    reason: 'Owner confirmation is due today.',
    status: 'pending_approval',
    generated_at: new Date().toISOString(),
    evidence: [],
    artifact: { type: 'document', title: 'Packet owner confirmation', content: 'Owner must confirm by 4 PM PT.' },
    execution_result: {
      discrepancy_card: VALID_DISCREPANCY_CARD,
      discrepancy_quality: {
        passes: true,
        quality_score: 0.92,
        blocked_by: [],
        pattern_keys: VALID_DISCREPANCY_CARD.pattern_keys,
        rejection_reason: null,
      },
    },
    ...(overrides ?? {}),
  };
}

async function callLatest() {
  const { GET } = await import('../route');
  return GET(new Request('http://localhost/api/conviction/latest'));
}

function expectNoStoreHeaders(response: Response) {
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('cache-control')).toContain('must-revalidate');
}

describe('GET /api/conviction/latest free artifact allowance contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockApiErrorForRoute.mockImplementation((err: unknown) =>
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }),
    );
    mockResolveUser.mockResolvedValue({ userId: 'u-test' });
    mockBuildContextGreeting.mockResolvedValue('Today. 0 active commitments. Top priority: None set.');
  });

  it('pending_approval alone does not consume the free artifact', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction()],
      consumedCount: 0,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    expect(res.status).toBe(200);
    expectNoStoreHeaders(res);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.id).toBe('action-1');
    expect(body.approved_count).toBe(0);
    expect(body.free_artifact_remaining).toBe(true);
    expect(body.artifact_paywall_locked).toBe(false);
    expect(supabase.spies.inConsumedStatuses).toHaveBeenCalledWith('status', ['approved', 'executed', 'skipped']);
    expect(supabase.spies.tkgActionsSelect).toHaveBeenCalledWith('id, confidence, generated_at, status');
    expect(supabase.spies.pendingLimit).toHaveBeenCalledWith(5);
    expect(supabase.spies.tkgActionsSelect).toHaveBeenCalledWith(
      'id, action_type, directive_text, reason, confidence, evidence, status, generated_at, approved_at, executed_at, execution_result, artifact',
    );
    expect(supabase.spies.pendingPayloadMaybeSingle).toHaveBeenCalledTimes(1);
    expect(mockBuildContextGreeting).not.toHaveBeenCalled();
    expect(supabase.spies.getUserById).not.toHaveBeenCalled();
  });

  it('hides a pending artifact that cannot prove a discrepancy card frame', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [
        buildPendingAction({
          id: 'weak-action',
          directive_text: 'Follow up with Keri.',
          reason: 'It has been a while.',
          evidence: [],
          artifact: { type: 'email', subject: 'Checking in', body: 'Hi Keri, just checking in.' },
          execution_result: {},
        }),
      ],
      consumedCount: 0,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.id).toBeUndefined();
    expect(body.no_safe_artifact_reason).toContain('missing_contradiction');
    expect(body.blocked_latest_action).toEqual(
      expect.objectContaining({
        id: 'weak-action',
        rejection_reason: expect.stringContaining('missing_contradiction'),
      }),
    );
    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.finished_artifact_verdict).toBe('no_finished_artifact');
    expect(body.daily_utility_slate).toEqual(
      expect.objectContaining({
        finished_artifact_verdict: 'no_finished_artifact',
        blocked_but_real: null,
        watch_item: expect.objectContaining({
          title: 'No safe finished action today',
        }),
      }),
    );
  });

  it('the first finished artifact still leaves free access for free users', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-approved' })],
      consumedCount: 1,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.approved_count).toBe(1);
    expect(body.free_artifact_remaining).toBe(true);
    expect(body.artifact_paywall_locked).toBe(false);
  });

  it('the second finished artifact still leaves free access for free users', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-executed' })],
      consumedCount: 2,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.approved_count).toBe(2);
    expect(body.free_artifact_remaining).toBe(true);
    expect(body.artifact_paywall_locked).toBe(false);
  });

  it('the fourth artifact is paywalled after three finished artifacts for free users', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-skipped' })],
      consumedCount: 3,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.approved_count).toBe(3);
    expect(body.free_artifact_remaining).toBe(false);
    expect(body.artifact_paywall_locked).toBe(true);
  });

  it('active never locks artifact', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-active' })],
      consumedCount: 3,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'active' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.free_artifact_remaining).toBe(false);
    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.is_subscribed).toBe(true);
  });

  it('active_trial never locks artifact', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-trial' })],
      consumedCount: 2,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'active_trial' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.is_subscribed).toBe(true);
  });

  it('past_due never locks artifact', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-past-due' })],
      consumedCount: 5,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'past_due' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.is_subscribed).toBe(true);
  });

  it('no action response includes explicit allowance fields with unlocked paywall', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [],
      consumedCount: 0,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    expect(res.status).toBe(200);
    expectNoStoreHeaders(res);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.context_greeting).toBeTypeOf('string');
    expect(body.account_created_at).toBeTypeOf('string');
    expect(body.approved_count).toBe(0);
    expect(body.is_subscribed).toBe(false);
    expect(body.free_artifact_remaining).toBe(true);
    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.finished_artifact_verdict).toBe('no_finished_artifact');
    expect(body.daily_utility_slate).toEqual(
      expect.objectContaining({
        blocked_but_real: null,
        watch_item: expect.objectContaining({
          title: 'No safe finished action today',
        }),
      }),
    );
    expect(body.id).toBeUndefined();
    expect(mockBuildContextGreeting).toHaveBeenCalledWith('u-test');
    expect(supabase.spies.getUserById).toHaveBeenCalledWith('u-test');
  });

  it('keeps the latest route on the narrow two-stage query contract', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../route.ts', import.meta.url), 'utf8'),
    );

    expect(source).not.toContain(".select('*')");
    expect(source).toContain("const PENDING_RANKING_LIMIT = 5");
    expect(source).toContain("const PENDING_RANKING_SELECT = 'id, confidence, generated_at, status'");
    expect(source).toContain('const PENDING_PAYLOAD_SELECT =');
  });

  it('does not run winner-truth diagnostics on the normal dashboard latest route', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../route.ts', import.meta.url), 'utf8'),
    );

    expect(source).not.toContain('@/lib/system/winner-truth');
    expect(source).not.toContain('getWinnerTruthReport');
  });
});
