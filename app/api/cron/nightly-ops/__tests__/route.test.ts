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

vi.mock('@/lib/auth/resolve-user', () => ({
  validateCronAuth,
}));

vi.mock('@/lib/auth/user-tokens', () => ({
  getAllUsersWithProvider,
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
});
