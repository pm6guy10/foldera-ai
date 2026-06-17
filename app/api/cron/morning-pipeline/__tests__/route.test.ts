import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const validateCronAuth = vi.fn();
const mockNightlyOps = vi.fn();
const mockDailyBrief = vi.fn();
const mockDailyMaintenance = vi.fn();
const mockTriggerRunner = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  validateCronAuth,
}));

vi.mock('@/app/api/cron/nightly-ops/route', () => ({
  GET: mockNightlyOps,
}));

vi.mock('@/app/api/cron/daily-brief/route', () => ({
  GET: mockDailyBrief,
}));

vi.mock('@/app/api/cron/daily-maintenance/route', () => ({
  GET: mockDailyMaintenance,
}));

vi.mock('@/app/api/cron/workday-presence-trigger-runner/route', () => ({
  POST: mockTriggerRunner,
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
    mockDailyBrief.mockResolvedValue(NextResponse.json({ ok: true, stage: 'daily-brief' }));
    mockDailyMaintenance.mockResolvedValue(
      NextResponse.json({ ok: true, stage: 'daily-maintenance' }),
    );
    mockTriggerRunner.mockResolvedValue(
      NextResponse.json({ ok: true, outcome: 'quiet' }),
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
    expect(mockDailyBrief).not.toHaveBeenCalled();
    expect(mockDailyMaintenance).not.toHaveBeenCalled();
    expect(mockTriggerRunner).not.toHaveBeenCalled();
  });

  it('runs all four cron stages in order and forwards cron auth', async () => {
    const { GET, maxDuration } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(maxDuration).toBe(300);
    expect(response.status).toBe(200);
    expect(mockNightlyOps).toHaveBeenCalledTimes(1);
    expect(mockDailyBrief).toHaveBeenCalledTimes(1);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
    expect(mockNightlyOps.mock.invocationCallOrder[0]).toBeLessThan(
      mockDailyBrief.mock.invocationCallOrder[0],
    );
    expect(mockDailyBrief.mock.invocationCallOrder[0]).toBeLessThan(
      mockDailyMaintenance.mock.invocationCallOrder[0],
    );
    // Trigger-runner must run LAST so it evaluates the freshest post-ingestion state.
    expect(mockDailyMaintenance.mock.invocationCallOrder[0]).toBeLessThan(
      mockTriggerRunner.mock.invocationCallOrder[0],
    );

    const nightlyRequest = mockNightlyOps.mock.calls[0][0] as NextRequest;
    const briefRequest = mockDailyBrief.mock.calls[0][0] as NextRequest;
    const maintenanceRequest = mockDailyMaintenance.mock.calls[0][0] as NextRequest;
    const triggerRequest = mockTriggerRunner.mock.calls[0][0] as NextRequest;

    expect(nightlyRequest.nextUrl.pathname).toBe('/api/cron/nightly-ops');
    expect(briefRequest.nextUrl.pathname).toBe('/api/cron/daily-brief');
    expect(maintenanceRequest.nextUrl.pathname).toBe('/api/cron/daily-maintenance');
    expect(triggerRequest.nextUrl.pathname).toBe('/api/cron/workday-presence-trigger-runner');
    expect(triggerRequest.method).toBe('POST');
    expect(nightlyRequest.headers.get('authorization')).toBe('Bearer test-cron-secret');
    expect(triggerRequest.headers.get('authorization')).toBe('Bearer test-cron-secret');
    expect(body).toMatchObject({
      ok: true,
      cron_mode: 'single_morning_entrypoint',
      stage_results: [
        { stage: 'nightly_ops', ok: true, status: 200 },
        { stage: 'daily_brief', ok: true, status: 200 },
        { stage: 'daily_maintenance', ok: true, status: 200 },
        { stage: 'workday_presence_trigger_runner', ok: true, status: 200 },
      ],
    });
  });

  it('keeps morning-pipeline ok when the trigger-runner stays quiet (no false 207)', async () => {
    mockTriggerRunner.mockResolvedValue(
      NextResponse.json({ ok: true, outcome: 'quiet', reason: 'no lapsing commitment' }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stage_results[3]).toMatchObject({
      stage: 'workday_presence_trigger_runner',
      ok: true,
      status: 200,
      body: { ok: true, outcome: 'quiet' },
    });
  });

  it('degrades to 207 when the trigger-runner stage errors, without breaking earlier stages', async () => {
    mockTriggerRunner.mockResolvedValue(
      NextResponse.json({ ok: false, error: 'runner threw' }, { status: 500 }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(body.ok).toBe(false);
    expect(mockNightlyOps).toHaveBeenCalledTimes(1);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(body.stage_results[3]).toMatchObject({
      stage: 'workday_presence_trigger_runner',
      ok: false,
      status: 500,
    });
  });

  it('returns 207 when a child stage reports ok false even if the HTTP status is 200', async () => {
    mockDailyBrief.mockResolvedValue(
      NextResponse.json({ ok: false, skipped: true, reason: 'credit_canary_failed' }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(body.ok).toBe(false);
    expect(body.stage_results[1]).toMatchObject({
      stage: 'daily_brief',
      ok: false,
      status: 200,
      body: { ok: false, skipped: true, reason: 'credit_canary_failed' },
    });
  });
});
