import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockCreateServerClient = vi.fn();
const mockApiErrorForRoute = vi.fn();
const mockBuildContextGreeting = vi.fn();
const mockGetSubscriptionStatus = vi.fn();
const mockGetWinnerTruthReport = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: mockCreateServerClient }));
vi.mock('@/lib/utils/api-error', () => ({ apiErrorForRoute: mockApiErrorForRoute }));
vi.mock('@/lib/briefing/context-builder', () => ({ buildContextGreeting: mockBuildContextGreeting }));
vi.mock('@/lib/auth/subscription', () => ({ getSubscriptionStatus: mockGetSubscriptionStatus }));
vi.mock('@/lib/system/winner-truth', () => ({ getWinnerTruthReport: mockGetWinnerTruthReport }));

type SupabaseMockOptions = {
  pendingActions: Record<string, unknown>[];
  consumedCount: number;
  accountCreatedAt?: string | null;
  slateReceipts?: Record<string, unknown>[];
};

const PENDING_RANKING_SELECT = 'id, confidence, generated_at, status, brief_origin';
const PENDING_SUMMARY_SELECT =
  'id, status, action_type, confidence, generated_at, approved_at, executed_at, directive_text, reason, skip_reason, outcome_closed, artifact_type, artifact_title, brief_origin, artifact_preview, discrepancy_claim, discrepancy_contradiction, discrepancy_risk, discrepancy_evidence, discrepancy_next_action, discrepancy_why_now, discrepancy_source_refs, discrepancy_confidence, is_no_send, no_send_reason, generation_outcome, outcome_type';
const SLATE_RECEIPT_SELECT =
  'id, action_type, directive_text, reason, status, generated_at, is_no_send, no_send_reason, generation_outcome, outcome_type';

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
    brief_origin:
      action.execution_result &&
      typeof action.execution_result === 'object' &&
      typeof (action.execution_result as Record<string, unknown>).brief_origin === 'string'
        ? (action.execution_result as Record<string, unknown>).brief_origin
        : null,
  }));
  const pendingLimit = vi.fn().mockResolvedValue({ data: pendingRankingRows, error: null });
  const pendingOrderGenerated = vi.fn().mockReturnValue({ limit: pendingLimit });
  const pendingOrderConfidence = vi.fn().mockReturnValue({ order: pendingOrderGenerated });
  const pendingEqStatus = vi.fn().mockReturnValue({ order: pendingOrderConfidence });
  const pendingEqUser = vi.fn().mockReturnValue({ eq: pendingEqStatus });

  const pendingSummaries = options.pendingActions.map((action) => {
    const artifact =
      action.artifact && typeof action.artifact === 'object'
        ? (action.artifact as Record<string, unknown>)
        : null;
    const executionResult =
      action.execution_result && typeof action.execution_result === 'object'
        ? (action.execution_result as Record<string, unknown>)
        : null;
    const discrepancyCard =
      executionResult?.discrepancy_card && typeof executionResult.discrepancy_card === 'object'
        ? (executionResult.discrepancy_card as Record<string, unknown>)
        : null;

    return {
      id: action.id,
      status: action.status,
      action_type: action.action_type,
      confidence: action.confidence,
      generated_at: action.generated_at,
      approved_at: action.approved_at ?? null,
      executed_at: action.executed_at ?? null,
      directive_text: action.directive_text,
      reason: action.reason,
      skip_reason: action.skip_reason ?? null,
      outcome_closed: action.outcome_closed ?? false,
      artifact_type:
        (typeof artifact?.type === 'string' ? artifact.type : null) ??
        (typeof executionResult?.artifact === 'object' &&
        executionResult.artifact &&
        typeof (executionResult.artifact as Record<string, unknown>).type === 'string'
          ? ((executionResult.artifact as Record<string, unknown>).type as string)
          : null),
      artifact_title:
        (typeof artifact?.title === 'string' ? artifact.title : null) ??
        (typeof artifact?.subject === 'string' ? artifact.subject : null) ??
        (discrepancyCard && typeof discrepancyCard.claim === 'string' ? discrepancyCard.claim : null),
      brief_origin:
        typeof executionResult?.brief_origin === 'string' ? executionResult.brief_origin : null,
      artifact_preview:
        (typeof artifact?.content === 'string' ? artifact.content : null) ??
        (typeof artifact?.body === 'string' ? artifact.body : null),
      discrepancy_claim:
        (discrepancyCard && typeof discrepancyCard.claim === 'string' ? discrepancyCard.claim : null) ??
        action.directive_text,
      discrepancy_contradiction:
        discrepancyCard && typeof discrepancyCard.contradiction === 'string'
          ? discrepancyCard.contradiction
          : null,
      discrepancy_risk:
        discrepancyCard && typeof discrepancyCard.risk === 'string' ? discrepancyCard.risk : null,
      discrepancy_evidence:
        discrepancyCard && Array.isArray(discrepancyCard.evidence)
          ? discrepancyCard.evidence
          : Array.isArray(action.evidence)
            ? action.evidence
            : [],
      discrepancy_next_action:
        discrepancyCard && typeof discrepancyCard.next_action === 'string'
          ? discrepancyCard.next_action
          : null,
      discrepancy_why_now:
        discrepancyCard && typeof discrepancyCard.why_now === 'string'
          ? discrepancyCard.why_now
          : action.reason,
      discrepancy_source_refs:
        discrepancyCard && Array.isArray(discrepancyCard.source_refs)
          ? discrepancyCard.source_refs
          : [],
      discrepancy_confidence:
        discrepancyCard && typeof discrepancyCard.confidence === 'number'
          ? discrepancyCard.confidence
          : action.confidence,
      is_no_send:
        action.action_type === 'do_nothing' ||
        executionResult?.outcome_type === 'no_send' ||
        executionResult?.generation_log &&
          typeof executionResult.generation_log === 'object' &&
          (executionResult.generation_log as Record<string, unknown>).outcome === 'no_send',
      no_send_reason:
        typeof action.reason === 'string' ? action.reason : null,
      generation_outcome:
        executionResult?.generation_log &&
        typeof executionResult.generation_log === 'object' &&
        typeof (executionResult.generation_log as Record<string, unknown>).outcome === 'string'
          ? ((executionResult.generation_log as Record<string, unknown>).outcome as string)
          : null,
      outcome_type:
        typeof executionResult?.outcome_type === 'string' ? executionResult.outcome_type : null,
    };
  });

  let selectedPayloadId: unknown;
  const pendingSummaryMaybeSingle = vi.fn().mockImplementation(() =>
    Promise.resolve({
      data: pendingSummaries.find((action) => action.id === selectedPayloadId) ?? null,
      error: null,
    }),
  );
  const pendingSummaryEqId = vi.fn().mockImplementation((_column: string, value: unknown) => {
    selectedPayloadId = value;
    return { maybeSingle: pendingSummaryMaybeSingle };
  });
  const pendingSummaryEqStatus = vi.fn().mockReturnValue({ eq: pendingSummaryEqId });
  const pendingSummaryEqUser = vi.fn().mockReturnValue({ eq: pendingSummaryEqStatus });

  const slateSummaries = (options.slateReceipts ?? [LATEST_NO_SEND_RECEIPT]).map((receipt) => {
    const executionResult =
      receipt.execution_result && typeof receipt.execution_result === 'object'
        ? (receipt.execution_result as Record<string, unknown>)
        : null;
    const generationLog =
      executionResult?.generation_log && typeof executionResult.generation_log === 'object'
        ? (executionResult.generation_log as Record<string, unknown>)
        : null;

    return {
      id: receipt.id,
      action_type: receipt.action_type,
      directive_text: receipt.directive_text,
      reason: receipt.reason,
      status: receipt.status,
      generated_at: receipt.generated_at,
      is_no_send:
        receipt.action_type === 'do_nothing' ||
        executionResult?.outcome_type === 'no_send' ||
        generationLog?.outcome === 'no_send',
      no_send_reason:
        typeof receipt.reason === 'string'
          ? receipt.reason
          : typeof generationLog?.reason === 'string'
            ? generationLog.reason
            : null,
      generation_outcome: typeof generationLog?.outcome === 'string' ? generationLog.outcome : null,
      outcome_type:
        typeof executionResult?.outcome_type === 'string' ? executionResult.outcome_type : null,
    };
  });

  const tkgActionsSelect = vi
    .fn()
    .mockImplementation((columns: string, config?: { count?: string; head?: boolean }) => {
      if (config?.head) {
        return { eq: consumedCountEqUser };
      }
      if (columns === 'execution_result') {
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_column: string, value: unknown) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  execution_result:
                    options.pendingActions.find((action) => action.id === value)?.execution_result ?? null,
                },
                error: null,
              }),
            })),
          }),
        };
      }
      if (columns === PENDING_RANKING_SELECT) {
        return { eq: pendingEqUser };
      }
      return { eq: pendingEqUser };
    });

  const summarySelect = vi.fn().mockImplementation((columns: string) => {
    if (columns === PENDING_RANKING_SELECT) {
      return { eq: pendingEqUser };
    }
    if (columns === PENDING_SUMMARY_SELECT) {
      return { eq: pendingSummaryEqUser };
    }
    if (columns === SLATE_RECEIPT_SELECT) {
      return {
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: slateSummaries,
                error: null,
              }),
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
    if (table === 'tkg_action_summaries') return { select: summarySelect };
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
      pendingSummaryMaybeSingle,
      tkgActionsSelect,
      summarySelect,
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

function mockCurrentWinner(card = VALID_DISCREPANCY_CARD) {
  mockGetWinnerTruthReport.mockResolvedValue({
    current_winner: {
      verdict: 'selected',
      discrepancy_card: card,
    },
  });
}

async function callLatest() {
  const { GET } = await import('../route');
  return GET(new Request('http://localhost/api/conviction/latest'));
}

function expectReadCacheHeaders(response: Response) {
  expect(response.headers.get('cache-control')).toContain('private');
  expect(response.headers.get('cache-control')).toContain('max-age=20');
  expect(response.headers.get('cache-control')).toContain('stale-while-revalidate=40');
  expect(response.headers.get('cache-control')).not.toContain('no-store');
  expect(response.headers.get('vary')).toContain('Cookie');
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
    mockCurrentWinner();
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
    expectReadCacheHeaders(res);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.id).toBe('action-1');
    expect(body.approved_count).toBe(0);
    expect(body.free_artifact_remaining).toBe(true);
    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.artifact).toBeUndefined();
    expect(body.executionResult).toBeUndefined();
    expect(body.detail_required).toBe(true);
    expect(body.detail_url).toBe('/api/conviction/actions/action-1');
    expect(supabase.spies.inConsumedStatuses).toHaveBeenCalledWith('status', ['approved', 'executed', 'skipped']);
    expect(supabase.spies.summarySelect).toHaveBeenCalledWith(PENDING_RANKING_SELECT);
    expect(supabase.spies.pendingLimit).toHaveBeenCalledWith(5);
    expect(supabase.spies.summarySelect).toHaveBeenCalledWith(PENDING_SUMMARY_SELECT);
    expect(supabase.spies.pendingSummaryMaybeSingle).toHaveBeenCalledTimes(1);
    expect(mockBuildContextGreeting).not.toHaveBeenCalled();
    expect(supabase.spies.getUserById).not.toHaveBeenCalled();
  });

  it('shows a selected-move generated artifact below the normal send-confidence threshold', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [
        buildPendingAction({
          id: 'selected-move-action',
          confidence: 45,
          directive_text: 'Prepare WorkSourceWA account activity closeout.',
          artifact: {
            type: 'document',
            title: 'WorkSourceWA account activity closeout',
            content: 'Close out the WorkSourceWA account activity trail before the deadline.',
          },
          execution_result: {
            brief_origin: 'selected_move_generate',
            selected_winner_fingerprint:
              'claim:packet owner confirmation is ready for review.|refs:artifact:packet-metadata,signal:owner-confirmation',
            discrepancy_card: VALID_DISCREPANCY_CARD,
            discrepancy_quality: {
              passes: true,
              quality_score: 0.88,
              blocked_by: [],
              pattern_keys: VALID_DISCREPANCY_CARD.pattern_keys,
              rejection_reason: null,
            },
          },
        }),
      ],
      consumedCount: 0,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.id).toBe('selected-move-action');
    expect(body.confidence).toBe(45);
    expect(body.brief_origin).toBe('selected_move_generate');
    expect(body.finished_artifact_verdict).toBe('strict_artifact_selected');
    expect(body.detail_required).toBe(true);
    expect(body.detail_url).toBe('/api/conviction/actions/selected-move-action');
    expect(mockBuildContextGreeting).not.toHaveBeenCalled();
  });

  it('hides a stale selected-move artifact when it no longer matches the current winner', async () => {
    mockCurrentWinner({
      ...VALID_DISCREPANCY_CARD,
      claim: 'Commitment due in 0d: Submit high-quality .docx documents for document collection',
      source_refs: ['commitment:1d0e3ecb-899c-4ec1-96d0-748485678dfe'],
    });
    const supabase = buildSupabaseMock({
      pendingActions: [
        buildPendingAction({
          id: 'old-worksource-action',
          confidence: 45,
          directive_text: 'Prepare WorkSourceWA account activity closeout.',
          artifact: {
            type: 'document',
            title: 'WorkSourceWA account activity closeout',
            content: 'Close out the WorkSourceWA account activity trail before the deadline.',
          },
          execution_result: {
            brief_origin: 'selected_move_generate',
            selected_winner_fingerprint:
              'claim:deadline closing complete at least one account activity|refs:commitment:old-worksource',
            discrepancy_card: {
              ...VALID_DISCREPANCY_CARD,
              claim: 'Deadline closing: Complete at least one account activity',
              source_refs: ['commitment:old-worksource'],
            },
            discrepancy_quality: {
              passes: true,
              quality_score: 0.88,
              blocked_by: [],
              pattern_keys: VALID_DISCREPANCY_CARD.pattern_keys,
              rejection_reason: null,
            },
          },
        }),
      ],
      consumedCount: 0,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.id).toBeUndefined();
    expect(body.finished_artifact_verdict).toBe('no_finished_artifact');
    expect(body.daily_utility_slate).toEqual(
      expect.objectContaining({
        finished_artifact_verdict: 'no_finished_artifact',
      }),
    );
    expect(mockGetWinnerTruthReport).toHaveBeenCalledWith('u-test');
  });

  it('shows a current selected-move requirements-needed packet even when its blocker card is not a finished discrepancy', async () => {
    mockCurrentWinner({
      ...VALID_DISCREPANCY_CARD,
      claim: 'Commitment due in 0d: Submit high-quality .docx documents for document collection',
      source_refs: ['commitment:1d0e3ecb-899c-4ec1-96d0-748485678dfe'],
    });
    const packetContent = [
      'REQUIREMENTS-NEEDED PACKET',
      'KNOWN REQUIREMENTS FROM SOURCE',
      '- Files must be real .docx documents.',
      'MISSING BEFORE FINISHED .DOCX WORK',
      '- Owned candidate .docx files or source document bodies.',
      'ARTIFACT BEHAVIOR',
      'Foldera should produce this requirements-needed packet instead of pretending it can write or submit the documents.',
    ].join('\n');
    const supabase = buildSupabaseMock({
      pendingActions: [
        buildPendingAction({
          id: 'requirements-packet-action',
          confidence: 45,
          directive_text:
            'Write a decision memo that closes "Submit high-quality .docx documents for document collection" with the owner, next action, and deadline.',
          artifact: {
            type: 'document',
            title: 'Requirements needed: Submit high-quality .docx documents for document collection',
            content: packetContent,
          },
          execution_result: {
            brief_origin: 'selected_move_generate',
            selected_winner_fingerprint:
              'claim:commitment due in 0d: submit high-quality .docx documents for document collection|refs:commitment:1d0e3ecb-899c-4ec1-96d0-748485678dfe',
            discrepancy_card: {
              ...VALID_DISCREPANCY_CARD,
              claim:
                'Write a decision memo that closes "Submit high-quality .docx documents for document collection" with the owner, next action, and deadline.',
              risk: 'Source requirements are known, but owned .docx bodies and submission destination are missing.',
              next_action: 'Requirements needed: Submit high-quality .docx documents for document collection',
              source_refs: ['commitment:1'],
            },
            discrepancy_quality: {
              passes: false,
              quality_score: 0.8,
              blocked_by: ['weak_risk', 'reminder_without_risk'],
              pattern_keys: ['discrepancy:deadline_staleness', 'action:write_document'],
              rejection_reason: 'weak_risk; reminder_without_risk',
            },
          },
        }),
      ],
      consumedCount: 0,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'active' });

    const res = await callLatest();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.id).toBe('requirements-packet-action');
    expect(body.artifact_title).toBe('Requirements needed: Submit high-quality .docx documents for document collection');
    expect(body.finished_artifact_verdict).toBe('strict_artifact_selected');
    expect(body.daily_utility_slate).toBeNull();
    expect(mockBuildContextGreeting).not.toHaveBeenCalled();
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
    expectReadCacheHeaders(res);
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

  it('no action response keeps production no-send blockers visible without leaking internal terms', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [],
      consumedCount: 0,
      slateReceipts: [
        {
          id: 'production-no-send',
          action_type: 'do_nothing',
          directive_text: 'Nothing cleared the bar today after evaluating 9 candidates.',
          reason:
            'All 9 ranked candidates blocked after 1 model-backed attempt(s): "Goal drift: Build Foldera into a revenue-generating product. First paid " -> positive_winner_contract:missing_current_artifact_anchor | "Commitment due 2026-05-14 with no matching calendar block" -> positive_winner_contract:missing_schedule_resolution_context',
          status: 'skipped',
          generated_at: '2026-05-07T11:07:22.841Z',
          execution_result: { outcome_type: 'no_send' },
        },
      ],
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(body.daily_utility_slate);

    expect(body.daily_utility_slate).toEqual(
      expect.objectContaining({
        watch_item: expect.objectContaining({
          no_action_reason: expect.stringContaining(
            'Foldera does not have a current source artifact strong enough to anchor this.',
          ),
        }),
      }),
    );
    expect(serialized).not.toMatch(
      /ranked candidates|positive_winner_contract|missing_current_artifact_anchor|missing_schedule_resolution_context|model-backed/i,
    );
  });

  it('keeps the latest route on the narrow two-stage query contract', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../route.ts', import.meta.url), 'utf8'),
    );

    expect(source).not.toContain(".select('*')");
    expect(source).toContain("const PENDING_RANKING_LIMIT = 5");
    expect(source).toContain('const PENDING_RANKING_SELECT = ACTION_RANKING_SELECT;');
    expect(source).toContain('const PENDING_SUMMARY_SELECT =');
    expect(source).not.toContain('execution_result, artifact');
  });

  it('does not run winner-truth diagnostics for ordinary pending artifacts', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction()],
      consumedCount: 0,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    expect(res.status).toBe(200);
    expect(mockGetWinnerTruthReport).not.toHaveBeenCalled();
  });
});
