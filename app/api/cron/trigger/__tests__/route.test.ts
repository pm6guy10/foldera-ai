import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const validateCronAuth = vi.fn();
const runDailyBrief = vi.fn();
const getTriggerResponseStatus = vi.fn();
const toSafeDailyBriefStageStatus = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  validateCronAuth,
}));

vi.mock('@/lib/cron/daily-brief', () => ({
  getTriggerResponseStatus,
  runDailyBrief,
  toSafeDailyBriefStageStatus,
}));

describe('cron trigger compatibility route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCronAuth.mockReturnValue(null);
    toSafeDailyBriefStageStatus.mockImplementation((stage) => stage);
    getTriggerResponseStatus.mockReturnValue(200);
    runDailyBrief.mockResolvedValue({
      date: '2026-04-20',
      ok: true,
      signal_processing: { status: 'ok', results: [] },
      generate: { status: 'ok', results: [] },
      send: { status: 'ok', results: [] },
    });
  });

  it('runs brief-only compatibility mode without sync orchestration', async () => {
    const { GET } = await import('../route');
    const response = await GET(new NextRequest('http://localhost/api/cron/trigger'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(runDailyBrief).toHaveBeenCalledWith({ briefInvocationSource: 'cron_trigger' });
    expect(payload.stages.daily_brief.compatibility_mode).toBe('brief_only');
    expect(payload.stages.sync_microsoft).toBeUndefined();
    expect(payload.stages.sync_google).toBeUndefined();
    expect(payload.stages.passive_rejection).toBeUndefined();
  });
});
