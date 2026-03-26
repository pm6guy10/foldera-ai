import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockApiError = vi.fn();
const mockRunDailyBrief = vi.fn();
const mockRunDailySend = vi.fn();
const mockToSafeDailyBriefStageStatus = vi.fn();
const mockSyncGoogle = vi.fn();
const mockSyncMicrosoft = vi.fn();
const mockRunCommitmentCeilingDefense = vi.fn();

vi.mock('@/lib/cron/self-heal', () => ({
  runCommitmentCeilingDefense: mockRunCommitmentCeilingDefense,
}));

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/cron/daily-brief', () => ({
  runDailyBrief: mockRunDailyBrief,
  runDailySend: mockRunDailySend,
  toSafeDailyBriefStageStatus: mockToSafeDailyBriefStageStatus,
}));

vi.mock('@/lib/sync/google-sync', () => ({
  syncGoogle: mockSyncGoogle,
}));

vi.mock('@/lib/sync/microsoft-sync', () => ({
  syncMicrosoft: mockSyncMicrosoft,
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiError: mockApiError,
}));

describe('POST /api/settings/run-brief', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRunCommitmentCeilingDefense.mockResolvedValue(undefined);
    mockApiError.mockImplementation((error: unknown) =>
      NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }));
    mockSyncGoogle.mockResolvedValue({ gmail_signals: 0, calendar_signals: 0, drive_signals: 0, error: 'no_token' });
    mockSyncMicrosoft.mockResolvedValue({
      mail_signals: 0,
      calendar_signals: 0,
      file_signals: 0,
      task_signals: 0,
      error: 'no_token',
    });
    mockToSafeDailyBriefStageStatus.mockImplementation((result: { results: Array<{ success: boolean }> }) => ({
      attempted: result.results.length,
      errors: [],
      failed: result.results.filter((entry) => !entry.success).length,
      status: result.results.every((entry) => entry.success) ? 'ok' : 'partial',
      succeeded: result.results.filter((entry) => entry.success).length,
      summary: 'summary',
    }));
  });

  it('returns auth response when the session is missing', async () => {
    mockResolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('runs the manual brief for any authenticated user instead of blocking non-owner sessions', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunDailyBrief.mockResolvedValue({
      date: '2026-03-24',
      ok: true,
      signal_processing: {
        date: '2026-03-24',
        message: 'Signals were ready.',
        results: [{ code: 'no_unprocessed_signals', success: true, userId }],
        succeeded: 1,
        total: 1,
      },
      generate: {
        date: '2026-03-24',
        message: 'A valid pending_approval action exists.',
        results: [{ code: 'pending_approval_persisted', success: true, userId }],
        succeeded: 1,
        total: 1,
      },
      send: {
        date: '2026-03-24',
        message: 'Sent briefs for 1 eligible user.',
        results: [{ code: 'email_sent', success: true, userId }],
        succeeded: 1,
        total: 1,
      },
    });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(mockRunDailyBrief).toHaveBeenCalledWith({ userIds: [userId] });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.stages.daily_brief.send.results).toEqual([
      expect.objectContaining({ code: 'email_sent', userId }),
    ]);
  });

  it('reuses the shared send stage as a fallback when generation succeeded but no email was sent', async () => {
    const userId = '33333333-3333-3333-3333-333333333333';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunDailyBrief.mockResolvedValue({
      date: '2026-03-24',
      ok: false,
      signal_processing: {
        date: '2026-03-24',
        message: 'Signals were ready.',
        results: [{ code: 'signals_caught_up', success: true, userId }],
        succeeded: 1,
        total: 1,
      },
      generate: {
        date: '2026-03-24',
        message: 'A valid pending_approval action exists.',
        results: [{ code: 'pending_approval_persisted', success: true, userId }],
        succeeded: 1,
        total: 1,
      },
      send: {
        date: '2026-03-24',
        message: 'No generated brief was available to send.',
        results: [{ code: 'no_generated_directive', success: false, userId }],
        succeeded: 0,
        total: 1,
      },
    });
    mockRunDailySend.mockResolvedValue({
      date: '2026-03-24',
      message: 'Sent briefs for 1 eligible user.',
      results: [{ code: 'email_sent', success: true, userId }],
      succeeded: 1,
      total: 1,
    });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(mockRunDailySend).toHaveBeenCalledWith({ userIds: [userId] });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.stages.daily_brief.manual_send_fallback_attempted).toBe(true);
    expect(payload.stages.daily_brief.send.results).toEqual([
      expect.objectContaining({ code: 'email_sent', userId }),
    ]);
  });

  it('does not retry send when generation produced an explicit no-send result', async () => {
    const userId = '44444444-4444-4444-4444-444444444444';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunDailyBrief.mockResolvedValue({
      date: '2026-03-24',
      ok: true,
      signal_processing: {
        date: '2026-03-24',
        message: 'Signals were ready.',
        results: [{ code: 'no_unprocessed_signals', success: true, userId }],
        succeeded: 1,
        total: 1,
      },
      generate: {
        date: '2026-03-24',
        message: 'No pending_approval brief was persisted.',
        results: [{ code: 'no_send_persisted', success: true, userId }],
        succeeded: 1,
        total: 1,
      },
      send: {
        date: '2026-03-24',
        message: 'No brief email was sent for 1 user.',
        results: [{ code: 'no_send_blocker_persisted', success: true, userId }],
        succeeded: 1,
        total: 1,
      },
    });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(mockRunDailySend).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.stages.daily_brief.manual_send_fallback_attempted).toBe(false);
  });
});
