import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const validateCronAuth = vi.fn();
const checkApiCreditCanary = vi.fn();
const runBriefLifecycle = vi.fn();
const resolveDailyBriefUserIds = vi.fn();
const ptDayStartIso = vi.fn();
const getTriggerResponseStatus = vi.fn();
const runPlatformHealthAlert = vi.fn();
const logApiBudgetStatusToSystemHealth = vi.fn();
const createServerClient = vi.fn();
const insertPipelineCronPhase = vi.fn();
const isCronDailyBriefPipelineDryRunEnabled = vi.fn();

const inQuery = vi.fn();
const gteQuery = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  validateCronAuth,
}));

vi.mock('@/lib/cron/acceptance-gate', () => ({
  checkApiCreditCanary,
}));

vi.mock('@/lib/cron/brief-service', () => ({
  runBriefLifecycle,
}));

vi.mock('@/lib/cron/daily-brief-generate', () => ({
  resolveDailyBriefUserIds,
  ptDayStartIso,
}));

vi.mock('@/lib/cron/daily-brief', () => ({
  getTriggerResponseStatus,
}));

vi.mock('@/lib/cron/cron-health-alert', () => ({
  runPlatformHealthAlert,
}));

vi.mock('@/lib/cron/api-budget', () => ({
  logApiBudgetStatusToSystemHealth,
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient,
}));

vi.mock('@/lib/observability/pipeline-run', () => ({
  insertPipelineCronPhase,
}));

vi.mock('@/lib/config/prelaunch-spend', () => ({
  isCronDailyBriefPipelineDryRunEnabled,
}));

describe('daily-brief cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    inQuery.mockResolvedValue({ data: [], error: null });
    gteQuery.mockReturnValue({ in: inQuery });

    createServerClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          gte: gteQuery,
        }),
      }),
    });

    validateCronAuth.mockReturnValue(null);
    resolveDailyBriefUserIds.mockResolvedValue(['user-1']);
    ptDayStartIso.mockReturnValue('2026-04-25T07:00:00.000Z');
    isCronDailyBriefPipelineDryRunEnabled.mockReturnValue(false);
    checkApiCreditCanary.mockResolvedValue({ pass: true });
    getTriggerResponseStatus.mockReturnValue(200);
    runBriefLifecycle.mockResolvedValue({
      result: {
        ok: true,
        signal_processing: { status: 'ok', results: [] },
        generate: { status: 'ok', results: [] },
        send: { status: 'ok', results: [] },
      },
    });
    runPlatformHealthAlert.mockResolvedValue({ ok: true, alert_sent: false });
  });

  it('uses PT day start for the already-ran-today guard query', async () => {
    const { POST } = await import('../route');
    const response = await POST(new NextRequest('http://localhost/api/cron/daily-brief'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ptDayStartIso).toHaveBeenCalledTimes(1);
    expect(gteQuery).toHaveBeenCalledWith('generated_at', '2026-04-25T07:00:00.000Z');
    expect(runBriefLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['user-1'],
      }),
    );
    expect(payload.ok).toBe(true);
  });
});
