import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const validateCronAuth = vi.fn();
const logApiBudgetStatusToSystemHealth = vi.fn();
const listSignalRetentionUserIds = vi.fn();
const purgeOldExtractedSignals = vi.fn();
const completeSuppressedCommitments = vi.fn();
const trackReplyOutcomes = vi.fn();
const runConfidenceCalibration = vi.fn();
const runSelfHeal = vi.fn();
const runSelfOptimize = vi.fn();
const runAcceptanceGate = vi.fn();
const runAttentionDecay = vi.fn();
const runBehavioralGraph = vi.fn();
const recordUnopenedDailyBriefSignals = vi.fn();
const runAggregateMlGlobalPriors = vi.fn();
const refreshGoalContext = vi.fn();
const inferGoalsFromBehavior = vi.fn();
const abandonRejectedGoals = vi.fn();
const computeAndPersistHealthVerdict = vi.fn();
const insertPipelineCronPhase = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  validateCronAuth,
}));

vi.mock('@/lib/cron/api-budget', () => ({
  logApiBudgetStatusToSystemHealth,
}));

vi.mock('@/lib/cron/daily-maintenance', () => ({
  listSignalRetentionUserIds,
  purgeOldExtractedSignals,
  completeSuppressedCommitments,
  trackReplyOutcomes,
  runConfidenceCalibration,
}));

vi.mock('@/lib/cron/self-heal', () => ({
  runSelfHeal,
  runSelfOptimize,
}));

vi.mock('@/lib/cron/acceptance-gate', () => ({
  runAcceptanceGate,
}));

vi.mock('@/lib/cron/health-verdict', () => ({
  computeAndPersistHealthVerdict,
}));

vi.mock('@/lib/observability/pipeline-run', () => ({
  insertPipelineCronPhase,
}));

vi.mock('@/lib/signals/entity-attention-runtime', () => ({
  runAttentionDecay,
}));

vi.mock('@/lib/signals/behavioral-graph', () => ({
  runBehavioralGraph,
}));

vi.mock('@/lib/cron/brief-engagement-signals', () => ({
  recordUnopenedDailyBriefSignals,
}));

vi.mock('@/lib/cron/aggregate-ml-global-priors', () => ({
  runAggregateMlGlobalPriors,
}));

vi.mock('@/lib/cron/goal-refresh', () => ({
  refreshGoalContext,
  inferGoalsFromBehavior,
  abandonRejectedGoals,
}));

describe('daily-maintenance cron route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T11:20:00Z'));

    validateCronAuth.mockReturnValue(null);
    listSignalRetentionUserIds.mockResolvedValue(['user-1']);
    purgeOldExtractedSignals.mockResolvedValue({ ok: true, deleted: 3 });
    recordUnopenedDailyBriefSignals.mockResolvedValue({ checked: 2, inserted: 1 });
    runBehavioralGraph.mockResolvedValue({ ok: true, users: 1 });
    runAttentionDecay.mockResolvedValue({ ok: true, users: 1 });
    completeSuppressedCommitments.mockResolvedValue(2);
    trackReplyOutcomes.mockResolvedValue({ ok: true, checked: 4, closed: 1 });
    runConfidenceCalibration.mockResolvedValue({ ok: true, bands: [], anomalies: [] });
    runSelfHeal.mockResolvedValue({ ok: true, alert_sent: false, duration_ms: 1, defenses: [] });
    runAcceptanceGate.mockResolvedValue({ ok: true, alert_sent: false, duration_ms: 1, checks: [] });
    runSelfOptimize.mockResolvedValue({ ok: true, details: { tuned: 0 } });
    runAggregateMlGlobalPriors.mockResolvedValue({
      bucketsWritten: 4,
      snapshotsLabeled: 5,
      error: null,
    });
    refreshGoalContext.mockResolvedValue({ ok: true, refreshed: 1 });
    inferGoalsFromBehavior.mockResolvedValue({ ok: true, inferred: 1 });
    abandonRejectedGoals.mockResolvedValue({ ok: true, abandoned: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs deferred maintenance without sync stages', async () => {
    const { GET } = await import('../route');
    const response = await GET(new NextRequest('http://localhost/api/cron/daily-maintenance'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(logApiBudgetStatusToSystemHealth).toHaveBeenCalledWith('daily_maintenance');
    expect(listSignalRetentionUserIds).toHaveBeenCalledTimes(1);
    expect(purgeOldExtractedSignals).toHaveBeenCalledWith(['user-1']);
    expect(recordUnopenedDailyBriefSignals).toHaveBeenCalledTimes(1);
    expect(runBehavioralGraph).toHaveBeenCalledWith(['user-1']);
    expect(runAttentionDecay).toHaveBeenCalledWith(['user-1']);
    expect(completeSuppressedCommitments).toHaveBeenCalledTimes(1);
    expect(trackReplyOutcomes).toHaveBeenCalledTimes(1);
    expect(runConfidenceCalibration).toHaveBeenCalledTimes(1);
    expect(runSelfHeal).toHaveBeenCalledTimes(1);
    expect(runAcceptanceGate).toHaveBeenCalledTimes(1);
    expect(runSelfOptimize).toHaveBeenCalledTimes(1);
    expect(runAggregateMlGlobalPriors).toHaveBeenCalledTimes(1);
    expect(payload.ok).toBe(true);
    expect(payload.stages.signal_retention_cleanup).toEqual({ ok: true, deleted: 3 });
    expect(payload.stages.suppressed_commitments).toEqual({ ok: true, updated: 2 });
    expect(payload.stages.sync_microsoft).toBeUndefined();
    expect(payload.stages.sync_google).toBeUndefined();
    expect(payload.stages.passive_rejection).toBeUndefined();
    expect(payload.stages.goal_refresh).toBeUndefined();
  });

  it('runs the weekly goal maintenance stages on Sunday', async () => {
    vi.setSystemTime(new Date('2026-04-19T11:20:00Z'));
    const { GET } = await import('../route');
    const response = await GET(new NextRequest('http://localhost/api/cron/daily-maintenance'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(refreshGoalContext).toHaveBeenCalledTimes(1);
    expect(inferGoalsFromBehavior).toHaveBeenCalledTimes(1);
    expect(abandonRejectedGoals).toHaveBeenCalledTimes(1);
    expect(payload.stages.goal_refresh).toEqual({ ok: true, refreshed: 1 });
    expect(payload.stages.goal_infer).toEqual({ ok: true, inferred: 1 });
    expect(payload.stages.goal_abandon).toEqual({ ok: true, abandoned: 1 });
  });
});
