import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn();
const updateEqMock = vi.fn();
const fetchGlobalMlPriorMapMock = vi.fn();
const mlBucketInputsFromWinnerLogMock = vi.fn();
const buildDirectiveMlBucketKeyMock = vi.fn();
const featuresJsonFromInputsMock = vi.fn();
const serializeTopCandidatesForMlMock = vi.fn();

vi.mock('@/lib/ml/priors', () => ({
  fetchGlobalMlPriorMap: fetchGlobalMlPriorMapMock,
}));

vi.mock('@/lib/ml/outcome-features', () => ({
  mlBucketInputsFromWinnerLog: mlBucketInputsFromWinnerLogMock,
  buildDirectiveMlBucketKey: buildDirectiveMlBucketKeyMock,
  featuresJsonFromInputs: featuresJsonFromInputsMock,
  serializeTopCandidatesForMl: serializeTopCandidatesForMlMock,
}));

async function loadModule() {
  vi.resetModules();
  return import('@/lib/ml/directive-ml-snapshot');
}

function buildSupabase() {
  return {
    from: () => ({
      insert: insertMock,
      update: () => ({
        eq: updateEqMock,
      }),
    }),
  };
}

describe('directive ML snapshot compatibility guards', () => {
  beforeEach(() => {
    insertMock.mockReset();
    updateEqMock.mockReset();
    fetchGlobalMlPriorMapMock.mockReset();
    mlBucketInputsFromWinnerLogMock.mockReset();
    buildDirectiveMlBucketKeyMock.mockReset();
    featuresJsonFromInputsMock.mockReset();
    serializeTopCandidatesForMlMock.mockReset();
    vi.restoreAllMocks();

    fetchGlobalMlPriorMapMock.mockResolvedValue(new Map());
    mlBucketInputsFromWinnerLogMock.mockReturnValue({
      goalCategory: 'career',
      candidateType: 'discrepancy',
      discrepancyClass: 'decay',
      actionType: 'send_message',
      velocityBucket: 'na',
      silenceFlag: false,
    });
    buildDirectiveMlBucketKeyMock.mockReturnValue('v1|career|discrepancy|decay|send_message|na|0');
    featuresJsonFromInputsMock.mockReturnValue({ candidate_type: 'discrepancy' });
    serializeTopCandidatesForMlMock.mockReturnValue([]);
  });

  it('silently disables snapshot writes after stale bucket_key schema mismatches', async () => {
    insertMock.mockResolvedValueOnce({
      error: {
        message:
          "Could not find the 'bucket_key' column of 'tkg_directive_ml_snapshots' in the schema cache",
      },
    });
    updateEqMock.mockResolvedValue({ error: null });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = buildSupabase();
    const {
      insertDirectiveMlSnapshot,
      updateMlSnapshotOutcome,
      markMlSnapshotEmailEngagement,
    } = await loadModule();

    await insertDirectiveMlSnapshot(supabase as never, {
      userId: 'user-1',
      actionId: 'action-1',
      directive: { generationLog: { candidateDiscovery: { topCandidates: [] } } } as never,
    });
    await insertDirectiveMlSnapshot(supabase as never, {
      userId: 'user-1',
      actionId: 'action-2',
      directive: { generationLog: { candidateDiscovery: { topCandidates: [] } } } as never,
    });
    await updateMlSnapshotOutcome(supabase as never, {
      actionId: 'action-1',
      outcomeLabel: 'executed',
    });
    await markMlSnapshotEmailEngagement(supabase as never, {
      actionId: 'action-1',
      opened: true,
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(updateEqMock).not.toHaveBeenCalled();
  });

  it('still warns on unexpected snapshot insert failures', async () => {
    insertMock.mockResolvedValueOnce({
      error: {
        message: 'insert timeout',
      },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = buildSupabase();
    const { insertDirectiveMlSnapshot } = await loadModule();

    await insertDirectiveMlSnapshot(supabase as never, {
      userId: 'user-1',
      actionId: 'action-1',
      directive: { generationLog: { candidateDiscovery: { topCandidates: [] } } } as never,
    });

    expect(warnSpy).toHaveBeenCalledWith('[ml-snapshot] insert failed:', 'insert timeout');
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
