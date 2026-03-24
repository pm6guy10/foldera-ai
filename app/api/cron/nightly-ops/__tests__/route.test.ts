import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const validateCronAuth = vi.fn();
const getAllUsersWithProvider = vi.fn();
const listUsersWithUnprocessedSignals = vi.fn();
const countUnprocessedSignals = vi.fn();
const processUnextractedSignals = vi.fn();
const runDailyBrief = vi.fn();
const autoSkipStaleApprovals = vi.fn();
const toSafeDailyBriefStageStatus = vi.fn((stage: { ok: boolean; results: unknown[] }) => stage);
const runSelfHeal = vi.fn();
const runAcceptanceGate = vi.fn();
const checkConnectorHealth = vi.fn();
const mockSupabase = {
  staleSignalIds: [] as string[],
  commitmentIds: [] as string[],
  nightlyBriefUserIds: ['user-1', '22222222-2222-2222-2222-222222222222'] as string[],
  from(table: string) {
    if (table === 'tkg_signals') {
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              limit: () => Promise.resolve({
                data: this.staleSignalIds.map((id) => ({ id })),
                error: null,
              }),
            }),
          }),
        }),
        update: () => ({
          in: () => Promise.resolve({ error: null }),
        }),
      };
    }

    if (table === 'tkg_commitments') {
      return {
        update: () => ({
          not: () => ({
            eq: () => ({
              select: () => Promise.resolve({
                data: this.commitmentIds.map((id) => ({ id })),
                error: null,
              }),
            }),
          }),
        }),
      };
    }

    if (table === 'user_tokens') {
      return {
        select: () => Promise.resolve({
          data: this.nightlyBriefUserIds.map((user_id) => ({ user_id })),
          error: null,
        }),
      };
    }

    return {
      select: () => Promise.resolve({ data: [], error: null }),
    };
  },
};

vi.mock('@/lib/auth/resolve-user', () => ({
  validateCronAuth,
}));

vi.mock('@/lib/auth/user-tokens', () => ({
  getAllUsersWithProvider,
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockSupabase,
}));

vi.mock('@/lib/signals/signal-processor', () => ({
  countUnprocessedSignals,
  listUsersWithUnprocessedSignals,
  processUnextractedSignals,
}));

vi.mock('@/lib/cron/daily-brief', () => ({
  autoSkipStaleApprovals,
  runDailyBrief,
  toSafeDailyBriefStageStatus,
}));

vi.mock('@/lib/cron/self-heal', () => ({
  runSelfHeal,
}));

vi.mock('@/lib/cron/acceptance-gate', () => ({
  runAcceptanceGate,
}));

vi.mock('@/lib/cron/connector-health', () => ({
  checkConnectorHealth,
}));

describe('nightly-ops route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    validateCronAuth.mockReturnValue(null);
    getAllUsersWithProvider.mockResolvedValue([]);
    listUsersWithUnprocessedSignals
      .mockResolvedValueOnce(['user-1'])
      .mockResolvedValueOnce(['user-1'])
      .mockResolvedValueOnce([]);
    countUnprocessedSignals
      .mockResolvedValueOnce(60)
      .mockResolvedValueOnce(0);
    processUnextractedSignals.mockResolvedValue({
      signals_processed: 50,
    });
    autoSkipStaleApprovals.mockResolvedValue({ skipped: 0 });
    runDailyBrief.mockResolvedValue({
      date: '2026-03-24',
      ok: true,
      signal_processing: { ok: true, results: [] },
      generate: { ok: true, results: [] },
      send: { ok: true, results: [] },
    });
    runSelfHeal.mockResolvedValue({
      ok: true,
      alert_sent: false,
      duration_ms: 1,
      defenses: [],
    });
    runAcceptanceGate.mockResolvedValue({
      ok: true,
      alert_sent: false,
      duration_ms: 1,
      checks: [],
    });
    checkConnectorHealth.mockResolvedValue({
      ok: true,
      checked_users: 0,
      alerts_sent: 0,
      flagged_sources: 0,
      skipped_recent_alerts: 0,
    });
    mockSupabase.staleSignalIds = [];
    mockSupabase.commitmentIds = [];
    mockSupabase.nightlyBriefUserIds = ['user-1', '22222222-2222-2222-2222-222222222222'];
  });

  it('keeps the original low-cap signal processing behavior when the backlog is below 100', async () => {
    const { GET } = await import('../route');
    const response = await GET(new NextRequest('http://localhost/api/cron/nightly-ops'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(processUnextractedSignals).toHaveBeenCalledTimes(1);
    expect(processUnextractedSignals).toHaveBeenNthCalledWith(
      1,
      'user-1',
      expect.objectContaining({ maxSignals: 50 }),
    );
    expect(payload.stages.signal_processing).toMatchObject({
      rounds: 1,
      total_processed: 50,
      remaining: 0,
    });
    expect(checkConnectorHealth).toHaveBeenCalledTimes(1);
    expect(runDailyBrief).toHaveBeenCalledWith({ userIds: ['user-1'] });
  });

  it('switches to backfill mode when the backlog is at least 100 signals', async () => {
    listUsersWithUnprocessedSignals.mockReset();
    countUnprocessedSignals.mockReset();
    listUsersWithUnprocessedSignals
      .mockResolvedValueOnce(['user-1'])
      .mockResolvedValueOnce(['user-1'])
      .mockResolvedValueOnce([]);
    countUnprocessedSignals
      .mockResolvedValueOnce(140)
      .mockResolvedValueOnce(40);
    processUnextractedSignals.mockReset();
    processUnextractedSignals.mockResolvedValue({ signals_processed: 100 });

    const { GET } = await import('../route');
    const response = await GET(new NextRequest('http://localhost/api/cron/nightly-ops'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(processUnextractedSignals).toHaveBeenNthCalledWith(
      1,
      'user-1',
      expect.objectContaining({ maxSignals: 100 }),
    );
    expect(payload.stages.signal_processing).toMatchObject({
      rounds: 1,
      total_processed: 100,
      remaining: 40,
    });
  });

  it('resets stale processed signals and completes suppressed commitments before the brief stage', async () => {
    mockSupabase.staleSignalIds = ['sig-1', 'sig-2'];
    mockSupabase.commitmentIds = ['commitment-1'];

    const { GET } = await import('../route');
    const response = await GET(new NextRequest('http://localhost/api/cron/nightly-ops'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.stages.signal_processing.reset_stale_signals).toBe(2);
    expect(payload.stages.suppressed_commitments).toEqual({ ok: true, updated: 1 });
  });
});
