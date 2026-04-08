import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockApiError = vi.fn();
const mockRunBriefLifecycle = vi.fn();
const mockSyncGoogle = vi.fn();
const mockSyncMicrosoft = vi.fn();
const mockRunCommitmentCeilingDefense = vi.fn();

vi.mock('@/lib/cron/self-heal', () => ({
  runCommitmentCeilingDefense: mockRunCommitmentCeilingDefense,
}));

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/cron/brief-service', () => ({
  runBriefLifecycle: mockRunBriefLifecycle,
}));

vi.mock('@/lib/sync/google-sync', () => ({
  syncGoogle: mockSyncGoogle,
}));

vi.mock('@/lib/sync/microsoft-sync', () => ({
  syncMicrosoft: mockSyncMicrosoft,
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiError: mockApiError,
  apiErrorForRoute: mockApiError,
}));

function makeBriefResult(userId: string, sendFallbackAttempted = false) {
  return {
    result: {
      date: '2026-03-24',
      ok: true,
      signal_processing: {
        attempted: 1, errors: [], failed: 0, status: 'ok', succeeded: 1, summary: 'ok',
        results: [{ code: 'no_unprocessed_signals', success: true, userId }],
      },
      generate: {
        attempted: 1, errors: [], failed: 0, status: 'ok', succeeded: 1, summary: 'ok',
        results: [{ code: 'pending_approval_persisted', success: true, userId }],
      },
      send: {
        attempted: 1, errors: [], failed: 0, status: 'ok', succeeded: 1, summary: 'ok',
        results: [{ code: 'email_sent', success: true, userId }],
      },
    },
    sendFallbackAttempted,
  };
}

describe('POST /api/settings/run-brief', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns auth response when the session is missing', async () => {
    mockResolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('runs the manual brief with spend caps enforced (no skipSpendCap / skipManualCallLimit)', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(mockRunBriefLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [userId],
        ensureSend: true,
        briefInvocationSource: 'settings_run_brief',
        skipStaleGate: true,
        skipSpendCap: false,
        skipManualCallLimit: false,
      }),
    );
    expect(mockRunBriefLifecycle.mock.calls[0][0].forceFreshRun).toBeUndefined();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.spend_policy).toEqual({
      pipeline_dry_run: false,
      paid_llm_requested: false,
      paid_llm_effective: true,
    });
    expect(payload.stages.daily_brief.send.results).toEqual([
      expect.objectContaining({ code: 'email_sent', userId }),
    ]);
  });

  it('passes pipelineDryRun and disables ensureSend when the URL has ?dry_run=true', async () => {
    const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?dry_run=true', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    expect(mockRunBriefLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [userId],
        ensureSend: false,
        briefInvocationSource: 'settings_run_brief',
        pipelineDryRun: true,
        skipStaleGate: true,
        skipSpendCap: false,
        skipManualCallLimit: false,
      }),
    );
    const payload = await response.json();
    expect(payload.spend_policy).toEqual({
      pipeline_dry_run: true,
      paid_llm_requested: false,
      paid_llm_effective: false,
    });
  });

  it('passes forceFreshRun and pipelineDryRun together for ?force=true&dry_run=true', async () => {
    const userId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');

    await POST(
      new Request(
        'http://localhost:3000/api/settings/run-brief?force=true&dry_run=true',
        { method: 'POST' },
      ),
    );

    expect(mockRunBriefLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [userId],
        forceFreshRun: true,
        briefInvocationSource: 'settings_run_brief',
        ensureSend: false,
        pipelineDryRun: true,
        skipSpendCap: false,
        skipManualCallLimit: false,
      }),
    );
  });

  it('passes forceFreshRun when the URL has ?force=true', async () => {
    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?force=true', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    expect(mockRunBriefLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [userId],
        forceFreshRun: true,
        briefInvocationSource: 'settings_run_brief',
        ensureSend: true,
        skipStaleGate: true,
        skipSpendCap: false,
        skipManualCallLimit: false,
      }),
    );
  });

  it('defaults to pipelineDryRun on Vercel production when PROD_DEFAULT_PIPELINE_DRY_RUN is set', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');

    const userId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');

    await POST(new Request('http://localhost:3000/api/settings/run-brief?force=true', { method: 'POST' }));

    expect(mockRunBriefLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineDryRun: true,
        ensureSend: false,
      }),
    );
  });

  it('on prod default dry-run, use_llm without ALLOW_PROD_PAID_LLM stays dry', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');

    const userId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?force=true&use_llm=true', { method: 'POST' }),
    );

    expect(mockRunBriefLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineDryRun: true,
        ensureSend: false,
      }),
    );
    const payload = await response.json();
    expect(payload.spend_policy).toEqual({
      pipeline_dry_run: true,
      paid_llm_requested: true,
      paid_llm_effective: false,
    });
    expect(response.status).toBe(200);
  });

  it('on prod default dry-run, use_llm with ALLOW_PROD_PAID_LLM runs paid path', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');
    vi.stubEnv('ALLOW_PROD_PAID_LLM', 'true');

    const userId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?force=true&use_llm=true', { method: 'POST' }),
    );

    const paidCall = mockRunBriefLifecycle.mock.calls[0][0];
    expect(paidCall.pipelineDryRun).toBeUndefined();
    expect(paidCall.ensureSend).toBe(true);
    const payload = await response.json();
    expect(payload.spend_policy).toEqual({
      pipeline_dry_run: false,
      paid_llm_requested: true,
      paid_llm_effective: true,
    });
    expect(response.status).toBe(200);
  });

  it('surfaces manual_send_fallback_attempted = true from the service when the send fallback ran', async () => {
    const userId = '33333333-3333-3333-3333-333333333333';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, true));
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.stages.daily_brief.manual_send_fallback_attempted).toBe(true);
    expect(payload.stages.daily_brief.send.results).toEqual([
      expect.objectContaining({ code: 'email_sent', userId }),
    ]);
  });

  it('surfaces manual_send_fallback_attempted = false when the service did not retry send', async () => {
    const userId = '44444444-4444-4444-4444-444444444444';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.stages.daily_brief.manual_send_fallback_attempted).toBe(false);
  });
});
