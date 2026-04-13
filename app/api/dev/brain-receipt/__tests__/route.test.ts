import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockRunDailyGenerate = vi.fn();
const mockIsSendWorthy = vi.fn();
const mockApiError = vi.fn();
const mockGetLastScorerDiagnostics = vi.fn();

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/cron/daily-brief-generate', () => ({
  runDailyGenerate: mockRunDailyGenerate,
  isSendWorthy: mockIsSendWorthy,
  evaluateBottomGate: () => ({ pass: true, blocked_reasons: [] as string[] }),
  effectiveDiscrepancyClassForGates: () => null as string | null,
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockSupabase,
}));

vi.mock('@/lib/utils/request-id', () => ({
  getRequestId: vi.fn(() => undefined),
  REQUEST_ID_HEADER: 'x-request-id',
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiError: mockApiError,
}));

vi.mock('@/lib/briefing/scorer', () => ({
  getLastScorerDiagnostics: mockGetLastScorerDiagnostics,
}));

vi.mock('@/lib/briefing/generator', () => ({
  getDecisionEnforcementIssues: () => [],
}));

describe('POST /api/dev/brain-receipt', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetLastScorerDiagnostics.mockReturnValue(null);
    mockIsSendWorthy.mockReturnValue({ worthy: true, reasons: [] });
    mockApiError.mockImplementation((error: unknown) =>
      NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }));
  });

  it('rejects authenticated non-owner users', async () => {
    mockResolveUser.mockResolvedValue({ userId: '11111111-1111-1111-1111-111111111111' });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/dev/brain-receipt', { method: 'POST' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('calls runDailyGenerate with skipManualCallLimit for owner brain-receipt', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'e40b7cd8-4925-42f7-bc99-5022969f1d22' });
    mockRunDailyGenerate.mockResolvedValue({ results: [] });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    const { POST } = await import('../route');
    await POST(new Request('http://localhost:3000/api/dev/brain-receipt', { method: 'POST' }));
    expect(mockRunDailyGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        skipManualCallLimit: true,
        skipSpendCap: true,
        forceFreshRun: true,
        skipStaleGate: true,
        briefInvocationSource: 'dev_brain_receipt',
      }),
    );
  });

  it('returns diagnostics even when no action is persisted', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'e40b7cd8-4925-42f7-bc99-5022969f1d22' });
    mockRunDailyGenerate.mockResolvedValue({
      results: [{
        userId: 'e40b7cd8-4925-42f7-bc99-5022969f1d22',
        code: 'no_valid_candidates',
        success: false,
      }],
    });
    mockGetLastScorerDiagnostics.mockReturnValue({
      sourceCounts: { commitments_raw: 5, signals_raw: 10, entities_raw: 3, goals_raw: 4, goals_after_filter: 3 },
      candidatePool: { commitment: 2, signal: 3, relationship: 0 },
      filterStages: [],
      discrepancies: [],
      convergenceBoosts: [],
      survivors: [],
      finalWinner: null,
      finalOutcome: 'no_valid_action',
    });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/dev/brain-receipt', { method: 'POST' }));
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.blocker).toBe('no_fresh_action_persisted');
    expect(body.scorer_diagnostics).toBeTruthy();
    expect(body.scorer_diagnostics.sourceCounts.commitments_raw).toBe(5);
  });

  it('returns generation_log, winner_selection_trace, and active_goals when a fresh action exists', async () => {
    const ownerId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
    const actionId = 'bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee';
    mockResolveUser.mockResolvedValue({ userId: ownerId });
    mockRunDailyGenerate.mockResolvedValue({
      results: [{ userId: ownerId, code: 'pending_approval_persisted', success: true }],
    });
    mockGetLastScorerDiagnostics.mockReturnValue({
      sourceCounts: {
        commitments_raw: 1,
        commitments_after_dedup: 1,
        signals_raw: 5,
        signals_after_decrypt: 5,
        entities_raw: 2,
        goals_raw: 2,
        goals_after_filter: 2,
      },
      candidatePool: { commitment: 1, signal: 2, relationship: 0, relationship_skipped_no_thread: 0 },
      filterStages: [],
      discrepancies: [],
      convergenceBoosts: [],
      survivors: [],
      finalWinner: { candidateId: 'w1', type: 'signal', title: 'T', score: 4, breakdown: {} as never, matchedGoal: null, invariantReasons: [] },
      finalOutcome: 'winner_selected',
    });
    const winnerTrace = {
      finalWinnerId: 'cand-1',
      finalWinnerType: 'discrepancy',
      finalWinnerReason: 'test',
      scorerTopId: 'cand-1',
      scorerTopType: 'discrepancy',
      scorerTopDisplacementReason: null,
    };
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: actionId,
                    generated_at: '2099-01-01T00:00:00.000Z',
                    action_type: 'send_message',
                    directive_text: 'Reconnect with Cheryl on DSHS thread',
                    reason: 'Decay pattern',
                    confidence: 82,
                    evidence: [],
                    artifact: { body: 'Hi Cheryl — following up on the HCLA application…' },
                    execution_result: {
                      generation_log: {
                        outcome: 'selected',
                        stage: 'generation',
                        reason: 'ok',
                        candidateFailureReasons: [],
                        candidateDiscovery: {
                          candidateCount: 2,
                          suppressedCandidateCount: 0,
                          selectionMargin: 0.5,
                          selectionReason: 'top score',
                          failureReason: null,
                          topCandidates: [],
                        },
                        brief_context_debug: { active_goals: ['[career, p1] DSHS applications'] },
                      },
                      inspection: {
                        winner_selection_trace: winnerTrace,
                        accepted_causal_diagnosis: null,
                        causal_diagnosis_source: null,
                      },
                    },
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost:3000/api/dev/brain-receipt', { method: 'POST' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.final_action.action_id).toBe(actionId);
    expect(body.generation_log?.brief_context_debug?.active_goals).toEqual(['[career, p1] DSHS applications']);
    expect(body.winner_selection_trace).toEqual(winnerTrace);
    expect(body.active_goals).toEqual(['[career, p1] DSHS applications']);
  });

  it('passes verification stub and golden-path flags to runDailyGenerate from JSON body', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'e40b7cd8-4925-42f7-bc99-5022969f1d22' });
    mockRunDailyGenerate.mockResolvedValue({ results: [] });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    const { POST } = await import('../route');
    await POST(
      new Request('http://localhost:3000/api/dev/brain-receipt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          verification_stub_persist: true,
          verification_golden_path_write_document: false,
        }),
      }),
    );
    expect(mockRunDailyGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationStubPersist: true,
        verificationGoldenPathWriteDocument: false,
        briefInvocationSource: 'dev_brain_receipt_verification',
      }),
    );
  });
});
