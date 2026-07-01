import { describe, expect, it, vi } from 'vitest';
import type { ConvictionDirective } from '@/lib/briefing/types';

const USER_ID = '2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f';

const mockSupabase = {
  auth: {
    admin: {
      getUserById: vi.fn().mockResolvedValue({ data: { user: { user_metadata: {} } }, error: null }),
      updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
};

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockSupabase,
}));

const mockGenerateDirective = vi.fn();
vi.mock('@/lib/briefing/generator', () => ({
  generateDirective: (...args: unknown[]) => mockGenerateDirective(...args),
  BUDGET_CAP_DIRECTIVE_SENTINEL: '__BUDGET_CAP__',
}));

vi.mock('@/lib/conviction/artifact-generator', () => ({
  generateArtifact: vi.fn(),
}));

vi.mock('@/lib/cron/daily-brief-generate', () => ({
  evaluateBottomGate: vi.fn(),
}));

// seed-from-scorer-core's only value import from the scorer module. Default null
// (matches a run where the scorer produced no diagnostics); seeded-path tests set it.
const mockGetLastScorerDiagnostics = vi.fn().mockReturnValue(null);
vi.mock('@/lib/briefing/scorer', () => ({
  getLastScorerDiagnostics: () => mockGetLastScorerDiagnostics(),
}));

const mockInsertUserPipelineRunStart = vi.fn().mockResolvedValue(undefined);
const mockFinalizeUserPipelineRun = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/observability/pipeline-run', () => ({
  insertUserPipelineRunStart: (...args: unknown[]) => mockInsertUserPipelineRunStart(...args),
  finalizeUserPipelineRun: (...args: unknown[]) => mockFinalizeUserPipelineRun(...args),
  buildGateFunnelFromScorerDiagnostics: () => ({}),
}));

vi.mock('@/lib/observability/pipeline-run-context', () => ({
  runWithPipelineRunContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));

function doNothingDirective(reason: string): ConvictionDirective {
  return {
    directive: '__GENERATION_FAILED__',
    action_type: 'do_nothing',
    confidence: 0,
    reason,
    evidence: [],
  } as ConvictionDirective;
}

describe('seedFromScorerForUser — pipeline_runs.raw_extras diagnosability (#606)', () => {
  it('threads the suppression trace into finalizeUserPipelineRun rawExtras on safe_silence', async () => {
    mockGenerateDirective.mockResolvedValueOnce(
      doNothingDirective(
        'All 2 ranked candidates blocked after 0 model-backed attempt(s): "Commitment due 2026-07-05 with no matching calendar block" → internal_debug_token',
      ),
    );

    const { seedFromScorerForUser } = await import('../seed-from-scorer-core');
    const result = await seedFromScorerForUser(USER_ID, 'seed_from_scorer');

    expect(result.seeded).toBe(false);
    expect(mockFinalizeUserPipelineRun).toHaveBeenCalledTimes(1);
    const call = mockFinalizeUserPipelineRun.mock.calls[0][0] as {
      outcome: string;
      rawExtras: { invocation_source: string; suppression_trace?: Record<string, unknown> };
    };
    expect(call.outcome).toBe('safe_silence');
    // Before #606's fix, rawExtras only ever carried { invocation_source } — the rich
    // suppressionTrace (blocker_reason, scorer_outcome, selected_candidate, etc.) was
    // computed but discarded, only surviving in the single-slot, overwritten
    // workday_presence_suppression_trace user-metadata field. This is the regression
    // guard: every suppressed pipeline_runs row must now carry its own reason.
    expect(call.rawExtras.invocation_source).toBe('seed_from_scorer');
    expect(call.rawExtras.suppression_trace).toBeDefined();
    expect(call.rawExtras.suppression_trace).toMatchObject({
      gate: 'safe_silence',
      trace_type: 'safe_silence',
      blocker_reason: expect.stringContaining('internal_debug_token'),
    });
  });
});

describe('seedFromScorerForUser — conviction line on the seeded state', () => {
  it('stores "ranked against + beat" built from the scorer diagnostics', async () => {
    mockGetLastScorerDiagnostics.mockReturnValueOnce({
      finalOutcome: 'winner_selected',
      finalWinner: {
        title: 'Send the pilot pricing note',
        matchedGoal:
          'Ship Foldera and onboard the first paying customer — launch, demo, signup, onboard',
      },
      deprioritized: [{ title: 'Renew domain autopay', killReason: 'not_now' }],
      candidatePool: { commitment: 5, signal: 4, relationship: 2 },
    });
    mockGenerateDirective.mockResolvedValueOnce({
      directive: 'Write the pilot pricing one-pager and hand it back finished.',
      action_type: 'write_document',
      confidence: 82,
      reason: 'The pilot decision is blocked on pricing.',
      evidence: [],
      generationLog: { candidateDiscovery: { candidateCount: 11 } },
    } as unknown as ConvictionDirective);

    const { seedFromScorerForUser } = await import('../seed-from-scorer-core');
    const result = await seedFromScorerForUser(USER_ID, 'seed_from_scorer');

    expect(result.seeded).toBe(true);
    expect(result.state?.conviction_line).toBe(
      'Ranked against "Ship Foldera and onboard the first paying customer" · beat "Renew domain autopay" (important, not today) and 9 others.',
    );
  });

  it('seeds without a conviction line when diagnostics cannot prove the comparison', async () => {
    // Diagnostics stay null (default) — no objective anchor, no runner-ups.
    mockGenerateDirective.mockResolvedValueOnce({
      directive: 'Write the pilot pricing one-pager and hand it back finished.',
      action_type: 'write_document',
      confidence: 82,
      reason: 'The pilot decision is blocked on pricing.',
      evidence: [],
    } as unknown as ConvictionDirective);

    const { seedFromScorerForUser } = await import('../seed-from-scorer-core');
    const result = await seedFromScorerForUser(USER_ID, 'seed_from_scorer');

    expect(result.seeded).toBe(true);
    expect(result.state?.conviction_line).toBeUndefined();
  });
});
