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
}));

vi.mock('@/lib/conviction/artifact-generator', () => ({
  generateArtifact: vi.fn(),
}));

vi.mock('@/lib/cron/daily-brief-generate', () => ({
  evaluateBottomGate: vi.fn(),
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
