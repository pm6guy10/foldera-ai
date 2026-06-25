import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const validateCronAuth = vi.fn();
const mockNightlyOps = vi.fn();
const mockSeedFromScorer = vi.fn();
const mockTriggerRunner = vi.fn();
const mockDailyMaintenance = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  validateCronAuth,
}));

vi.mock('@/app/api/cron/nightly-ops/route', () => ({
  GET: mockNightlyOps,
}));

vi.mock('@/app/api/workday-presence/seed-from-scorer/route', () => ({
  POST: mockSeedFromScorer,
}));

vi.mock('@/app/api/cron/workday-presence-trigger-runner/route', () => ({
  POST: mockTriggerRunner,
}));

vi.mock('@/app/api/cron/daily-maintenance/route', () => ({
  GET: mockDailyMaintenance,
}));

function request() {
  return new NextRequest(new URL('http://localhost/api/cron/morning-pipeline'), {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

describe('morning-pipeline cron route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    validateCronAuth.mockReturnValue(null);
    mockNightlyOps.mockResolvedValue(NextResponse.json({ ok: true, stage: 'nightly' }));
    mockSeedFromScorer.mockResolvedValue(
      NextResponse.json({ seeded: true, scorer_outcome: 'winner_selected' }),
    );
    mockTriggerRunner.mockResolvedValue(
      NextResponse.json({ ok: true, outcome: 'quiet' }),
    );
    mockDailyMaintenance.mockResolvedValue(
      NextResponse.json({ ok: true, stage: 'daily-maintenance' }),
    );
  });

  it('passes through cron auth failures before invoking child stages', async () => {
    validateCronAuth.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockNightlyOps).not.toHaveBeenCalled();
    expect(mockSeedFromScorer).not.toHaveBeenCalled();
    expect(mockTriggerRunner).not.toHaveBeenCalled();
    expect(mockDailyMaintenance).not.toHaveBeenCalled();
  });

  it('runs the four cron stages in order and forwards cron auth', async () => {
    const { GET, maxDuration } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(maxDuration).toBe(300);
    expect(response.status).toBe(200);
    expect(mockNightlyOps).toHaveBeenCalledTimes(1);
    expect(mockSeedFromScorer).toHaveBeenCalledTimes(1);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);

    // Verify order: nightly → seed → trigger → maintenance
    expect(mockNightlyOps.mock.invocationCallOrder[0]).toBeLessThan(
      mockSeedFromScorer.mock.invocationCallOrder[0],
    );
    expect(mockSeedFromScorer.mock.invocationCallOrder[0]).toBeLessThan(
      mockTriggerRunner.mock.invocationCallOrder[0],
    );
    expect(mockTriggerRunner.mock.invocationCallOrder[0]).toBeLessThan(
      mockDailyMaintenance.mock.invocationCallOrder[0],
    );

    const nightlyRequest = mockNightlyOps.mock.calls[0][0] as NextRequest;
    const seedRequest = mockSeedFromScorer.mock.calls[0][0] as NextRequest;
    const triggerRequest = mockTriggerRunner.mock.calls[0][0] as NextRequest;
    const maintenanceRequest = mockDailyMaintenance.mock.calls[0][0] as NextRequest;

    expect(nightlyRequest.nextUrl.pathname).toBe('/api/cron/nightly-ops');
    expect(seedRequest.nextUrl.pathname).toBe('/api/workday-presence/seed-from-scorer');
    expect(triggerRequest.nextUrl.pathname).toBe('/api/cron/workday-presence-trigger-runner');
    expect(maintenanceRequest.nextUrl.pathname).toBe('/api/cron/daily-maintenance');
    expect(nightlyRequest.headers.get('authorization')).toBe('Bearer test-cron-secret');
    expect(body).toMatchObject({
      ok: true,
      cron_mode: 'single_morning_entrypoint',
      stage_results: [
        { stage: 'nightly_ops', ok: true, status: 200 },
        { stage: 'seed_from_scorer', ok: true, status: 200 },
        { stage: 'trigger_runner', ok: true, status: 200 },
        { stage: 'daily_maintenance', ok: true, status: 200 },
      ],
    });
  });

  it('isolates a thrown stage so downstream stages still run (one throw cannot drop the whole pipeline)', async () => {
    // nightly_ops throws an uncaught error — seed_from_scorer (value stage),
    // trigger_runner, and daily_maintenance must still run.
    mockNightlyOps.mockRejectedValue(new Error('nightly boom'));
    const { GET } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(mockNightlyOps).toHaveBeenCalledTimes(1);
    expect(mockSeedFromScorer).toHaveBeenCalledTimes(1);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(body.ok).toBe(false);
    expect(body.stage_results[0]).toMatchObject({
      stage: 'nightly_ops',
      ok: false,
      status: 500,
      body: { threw: true, error: 'nightly boom' },
    });
    expect(body.stage_results[1]).toMatchObject({ stage: 'seed_from_scorer', ok: true });
    expect(body.stage_results[2]).toMatchObject({ stage: 'trigger_runner', ok: true });
    expect(body.stage_results[3]).toMatchObject({ stage: 'daily_maintenance', ok: true });
  });

  it('returns 207 when seed-from-scorer returns a non-200 status', async () => {
    mockSeedFromScorer.mockResolvedValue(
      NextResponse.json({ error: 'seed exploded' }, { status: 500 }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(body.ok).toBe(false);
    expect(body.stage_results[1]).toMatchObject({
      stage: 'seed_from_scorer',
      ok: false,
      status: 500,
      body: { error: 'seed exploded' },
    });
  });

  it('returns 207 when trigger-runner fails but daily-maintenance still runs', async () => {
    mockTriggerRunner.mockResolvedValue(
      NextResponse.json({ error: 'trigger exploded' }, { status: 500 }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(body.ok).toBe(false);
    expect(body.stage_results[2]).toMatchObject({
      stage: 'trigger_runner',
      ok: false,
      status: 500,
    });
    expect(body.stage_results[3]).toMatchObject({ stage: 'daily_maintenance', ok: true });
  });
});
