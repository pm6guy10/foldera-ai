import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const validateCronAuth = vi.fn();
const mockNightlyOps = vi.fn();
const mockSeedFromScorer = vi.fn();
const mockTriggerRunner = vi.fn();
const mockProactiveDelivery = vi.fn();
const mockDailyMaintenance = vi.fn();
const mockRenewGraphSubscriptions = vi.fn();

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

vi.mock('@/app/api/cron/workday-presence-proactive-delivery/route', () => ({
  POST: mockProactiveDelivery,
}));

vi.mock('@/app/api/cron/daily-maintenance/route', () => ({
  GET: mockDailyMaintenance,
}));

vi.mock('@/app/api/cron/renew-graph-subscriptions/route', () => ({
  GET: mockRenewGraphSubscriptions,
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
    mockSeedFromScorer.mockResolvedValue(
      NextResponse.json({ seeded: true, scorer_outcome: 'winner_selected' }),
    );
    mockTriggerRunner.mockResolvedValue(
      NextResponse.json({ ok: true, outcome: 'quiet' }),
    );
    mockProactiveDelivery.mockResolvedValue(
      NextResponse.json({ ok: true, started: true, delivered: false, reason: 'already_delivered_this_winner' }),
    );
    mockDailyMaintenance.mockResolvedValue(
      NextResponse.json({ ok: true, stage: 'daily-maintenance' }),
    );
    mockRenewGraphSubscriptions.mockResolvedValue(
      NextResponse.json({ ok: true, users: 1, created: 0, renewed: 1, skipped: 0, failed: 0, results: [] }),
    );
    mockNightlyOps.mockResolvedValue(NextResponse.json({ ok: true, stage: 'nightly' }));
  });

  it('passes through cron auth failures before invoking child stages', async () => {
    validateCronAuth.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockSeedFromScorer).not.toHaveBeenCalled();
    expect(mockTriggerRunner).not.toHaveBeenCalled();
    expect(mockProactiveDelivery).not.toHaveBeenCalled();
    expect(mockDailyMaintenance).not.toHaveBeenCalled();
    expect(mockRenewGraphSubscriptions).not.toHaveBeenCalled();
    expect(mockNightlyOps).not.toHaveBeenCalled();
  });

  it('runs all six cron stages in order — value delivery first, nightly_ops last (#567 Phase B)', async () => {
    const { GET, maxDuration } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(maxDuration).toBe(300);
    expect(response.status).toBe(200);
    expect(mockSeedFromScorer).toHaveBeenCalledTimes(1);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
    expect(mockProactiveDelivery).toHaveBeenCalledTimes(1);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(mockRenewGraphSubscriptions).toHaveBeenCalledTimes(1);
    expect(mockNightlyOps).toHaveBeenCalledTimes(1);

    // Verify order: seed → trigger → proactive_delivery → maintenance → renew_graph → nightly (LAST)
    expect(mockSeedFromScorer.mock.invocationCallOrder[0]).toBeLessThan(
      mockTriggerRunner.mock.invocationCallOrder[0],
    );
    expect(mockTriggerRunner.mock.invocationCallOrder[0]).toBeLessThan(
      mockProactiveDelivery.mock.invocationCallOrder[0],
    );
    expect(mockProactiveDelivery.mock.invocationCallOrder[0]).toBeLessThan(
      mockDailyMaintenance.mock.invocationCallOrder[0],
    );
    expect(mockDailyMaintenance.mock.invocationCallOrder[0]).toBeLessThan(
      mockRenewGraphSubscriptions.mock.invocationCallOrder[0],
    );
    expect(mockRenewGraphSubscriptions.mock.invocationCallOrder[0]).toBeLessThan(
      mockNightlyOps.mock.invocationCallOrder[0],
    );

    const seedRequest = mockSeedFromScorer.mock.calls[0][0] as NextRequest;
    const triggerRequest = mockTriggerRunner.mock.calls[0][0] as NextRequest;
    const proactiveRequest = mockProactiveDelivery.mock.calls[0][0] as NextRequest;
    const maintenanceRequest = mockDailyMaintenance.mock.calls[0][0] as NextRequest;
    const renewRequest = mockRenewGraphSubscriptions.mock.calls[0][0] as NextRequest;
    const nightlyRequest = mockNightlyOps.mock.calls[0][0] as NextRequest;

    expect(seedRequest.nextUrl.pathname).toBe('/api/workday-presence/seed-from-scorer');
    expect(triggerRequest.nextUrl.pathname).toBe('/api/cron/workday-presence-trigger-runner');
    expect(proactiveRequest.nextUrl.pathname).toBe('/api/cron/workday-presence-proactive-delivery');
    expect(maintenanceRequest.nextUrl.pathname).toBe('/api/cron/daily-maintenance');
    expect(renewRequest.nextUrl.pathname).toBe('/api/cron/renew-graph-subscriptions');
    expect(nightlyRequest.nextUrl.pathname).toBe('/api/cron/nightly-ops');
    expect(seedRequest.headers.get('authorization')).toBe('Bearer test-cron-secret');
    expect(body).toMatchObject({
      ok: true,
      cron_mode: 'single_morning_entrypoint',
      stage_results: [
        { stage: 'seed_from_scorer', ok: true, status: 200 },
        { stage: 'trigger_runner', ok: true, status: 200 },
        { stage: 'proactive_delivery', ok: true, status: 200 },
        { stage: 'daily_maintenance', ok: true, status: 200 },
        { stage: 'renew_graph_subscriptions', ok: true, status: 200 },
        { stage: 'nightly_ops', ok: true, status: 200 },
      ],
    });
  });

  it('isolates a thrown nightly_ops (now LAST) so every value-delivery stage already ran', async () => {
    // nightly_ops throws an uncaught error — since it now runs last, every stage before
    // it (seed_from_scorer, trigger_runner, proactive_delivery, daily_maintenance,
    // renew_graph_subscriptions) must already have completed regardless.
    mockNightlyOps.mockRejectedValue(new Error('nightly boom'));
    const { GET } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(mockSeedFromScorer).toHaveBeenCalledTimes(1);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
    expect(mockProactiveDelivery).toHaveBeenCalledTimes(1);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(mockRenewGraphSubscriptions).toHaveBeenCalledTimes(1);
    expect(mockNightlyOps).toHaveBeenCalledTimes(1);
    expect(body.ok).toBe(false);
    expect(body.stage_results[0]).toMatchObject({ stage: 'seed_from_scorer', ok: true });
    expect(body.stage_results[1]).toMatchObject({ stage: 'trigger_runner', ok: true });
    expect(body.stage_results[2]).toMatchObject({ stage: 'proactive_delivery', ok: true });
    expect(body.stage_results[3]).toMatchObject({ stage: 'daily_maintenance', ok: true });
    expect(body.stage_results[4]).toMatchObject({ stage: 'renew_graph_subscriptions', ok: true });
    expect(body.stage_results[5]).toMatchObject({
      stage: 'nightly_ops',
      ok: false,
      status: 500,
      body: { threw: true, error: 'nightly boom' },
    });
  });

  it('returns 207 when seed-from-scorer returns a non-200 status, but every later stage still runs', async () => {
    mockSeedFromScorer.mockResolvedValue(
      NextResponse.json({ error: 'seed exploded' }, { status: 500 }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
    expect(mockProactiveDelivery).toHaveBeenCalledTimes(1);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(mockNightlyOps).toHaveBeenCalledTimes(1);
    expect(body.ok).toBe(false);
    expect(body.stage_results[0]).toMatchObject({
      stage: 'seed_from_scorer',
      ok: false,
      status: 500,
      body: { error: 'seed exploded' },
    });
  });

  it('returns 207 when trigger-runner fails but proactive_delivery and daily-maintenance still run', async () => {
    mockTriggerRunner.mockResolvedValue(
      NextResponse.json({ error: 'trigger exploded' }, { status: 500 }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(mockProactiveDelivery).toHaveBeenCalledTimes(1);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(body.ok).toBe(false);
    expect(body.stage_results[1]).toMatchObject({
      stage: 'trigger_runner',
      ok: false,
      status: 500,
    });
    expect(body.stage_results[2]).toMatchObject({ stage: 'proactive_delivery', ok: true });
    expect(body.stage_results[3]).toMatchObject({ stage: 'daily_maintenance', ok: true });
  });

  it('returns 207 when proactive_delivery fails but daily-maintenance and nightly_ops still run', async () => {
    mockProactiveDelivery.mockResolvedValue(
      NextResponse.json({ error: 'proactive exploded' }, { status: 500 }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(mockDailyMaintenance).toHaveBeenCalledTimes(1);
    expect(mockNightlyOps).toHaveBeenCalledTimes(1);
    expect(body.ok).toBe(false);
    expect(body.stage_results[2]).toMatchObject({
      stage: 'proactive_delivery',
      ok: false,
      status: 500,
    });
    expect(body.stage_results[3]).toMatchObject({ stage: 'daily_maintenance', ok: true });
  });
});
