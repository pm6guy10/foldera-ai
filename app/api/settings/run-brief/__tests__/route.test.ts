import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockApiError = vi.fn();
const mockRunBriefLifecycle = vi.fn();
const mockRateLimit = vi.fn();
const mockRecentDryRunMaybeSingle = vi.fn();
const mockPendingApprovalSelect = vi.fn();
const mockPendingApprovalLimit = vi.fn();
const mockLatestActionMaybeSingle = vi.fn();
const mockLatestPipelineMaybeSingle = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/cron/brief-service', () => ({
  runBriefLifecycle: mockRunBriefLifecycle,
}));

function createPipelineRunsChain() {
  const filters: Record<string, string> = {};
  const chain = {
    select: () => chain,
    eq: (col: string, val: string) => {
      filters[col] = val;
      return chain;
    },
    gte: () => chain,
    order: () => chain,
    limit: () => ({
      maybeSingle: () => {
        // `findRecentPipelineDryRun` filters outcome; `findLatestPipelineRun` does not. These run
        // concurrently via `Promise.all` — a sequential call counter is undefined behavior.
        if (filters.outcome === 'pipeline_dry_run_returned') {
          return mockRecentDryRunMaybeSingle();
        }
        return mockLatestPipelineMaybeSingle();
      },
    }),
  };
  return chain;
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'pipeline_runs') {
        return createPipelineRunsChain();
      }

      if (table === 'tkg_actions') {
        const chain = {
          select: (...args: unknown[]) => {
            mockPendingApprovalSelect(...args);
            return chain;
          },
          eq: () => chain,
          neq: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: (...args: unknown[]) => {
            const size = args[0];
            if (size === 1) {
              return {
                maybeSingle: mockLatestActionMaybeSingle,
              };
            }
            return mockPendingApprovalLimit(...args);
          },
        };
        return chain;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit: mockRateLimit,
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiError: mockApiError,
  apiErrorForRoute: mockApiError,
}));

function makeBriefResult(userId: string, sendFallbackAttempted = false, ok = true) {
  return {
    result: {
      date: '2026-03-24',
      ok,
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
    mockRateLimit.mockResolvedValue({
      success: true,
      remaining: 1,
      resetAt: new Date(Date.now() + 60_000),
    });
    mockRecentDryRunMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockLatestActionMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockLatestPipelineMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockPendingApprovalSelect.mockReset();
    mockPendingApprovalLimit.mockResolvedValue({ data: [], error: null });
    mockApiError.mockImplementation((error: unknown) =>
      NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a cheap dry-run receipt and never runs sync or lifecycle work', async () => {
    const userId = '10101010-1010-1010-1010-101010101010';
    mockResolveUser.mockResolvedValue({ userId });
    mockPendingApprovalLimit.mockResolvedValue({
      data: [{
        id: 'pending-action-1',
        generated_at: new Date().toISOString(),
        confidence: 72,
        action_type: 'send_message',
        execution_result: { artifact: { summary: 'kept' } },
      }],
      error: null,
    });
    const { POST } = await import('../route');
    const {
      RUN_BRIEF_CHEAP_DRY_RUN_STAGE,
      RUN_BRIEF_CHEAP_DRY_RUN_STAGE_KEYS,
    } = await import('../contract');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?force=true&dry_run=true', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    expect(mockRunBriefLifecycle).not.toHaveBeenCalled();

    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.short_circuit).toEqual(
      expect.objectContaining({
        reason: 'cheap_dry_run',
        mode: 'status_only',
      }),
    );
    expect(payload.facts.pending_approval).toEqual({
      id: 'pending-action-1',
      generated_at: expect.any(String),
    });
    expect(payload.stages.daily_brief).toEqual(expect.objectContaining(RUN_BRIEF_CHEAP_DRY_RUN_STAGE));
    expect(payload.stages.sync_microsoft).toBeUndefined();
    expect(payload.stages.sync_google).toBeUndefined();
    expect(Object.keys(payload.stages)).toEqual([...RUN_BRIEF_CHEAP_DRY_RUN_STAGE_KEYS]);
    expect(mockRateLimit).toHaveBeenCalledWith(`run-brief:${userId}`, { limit: 2, window: 600 });
  }, 45_000);

  it('includes recent dry-run and latest metadata in the cheap dry-run receipt', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    mockResolveUser.mockResolvedValue({ userId });
    mockRecentDryRunMaybeSingle.mockResolvedValue({
      data: {
        id: 'recent-dry-run',
        created_at: new Date().toISOString(),
      },
      error: null,
    });
    mockLatestActionMaybeSingle.mockResolvedValue({
      data: {
        id: 'latest-action-1',
        generated_at: new Date().toISOString(),
        status: 'pending_approval',
        action_type: 'write_document',
        confidence: 74,
      },
      error: null,
    });
    mockLatestPipelineMaybeSingle.mockResolvedValue({
      data: {
        id: 'pipe-1',
        created_at: new Date().toISOString(),
        outcome: 'pipeline_dry_run_returned',
        phase: 'user_run',
      },
      error: null,
    });
    const { POST } = await import('../route');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?force=true&dry_run=true', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    expect(mockRunBriefLifecycle).not.toHaveBeenCalled();

    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.short_circuit.reason).toBe('cheap_dry_run');
    expect(payload.facts.recent_dry_run).toEqual({
      id: 'recent-dry-run',
      created_at: expect.any(String),
    });
    expect(payload.facts.latest_action).toEqual(
      expect.objectContaining({
        id: 'latest-action-1',
        action_type: 'write_document',
        status: 'pending_approval',
      }),
    );
    expect(payload.facts.latest_pipeline_run).toEqual(
      expect.objectContaining({
        id: 'pipe-1',
        outcome: 'pipeline_dry_run_returned',
      }),
    );
  });

  it('returns auth response when the session is missing', async () => {
    mockResolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { POST } = await import('../route');
    const { getRunBriefRouteStatus } = await import('../contract');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('runs the manual brief with spend caps enforced (no skipSpendCap / skipManualCallLimit)', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');
    const { getRunBriefRouteStatus } = await import('../contract');

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
    expect(response.status).toBe(getRunBriefRouteStatus(true));
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
    expect(payload.stages.sync_microsoft).toBeUndefined();
    expect(payload.stages.sync_google).toBeUndefined();
  });

  it('returns cheap dry-run in prod default dry-run mode even without explicit ?dry_run=true', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');

    const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    mockResolveUser.mockResolvedValue({ userId });
    const { POST } = await import('../route');
    const { getRunBriefRouteStatus } = await import('../contract');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }),
    );

    expect(response.status).toBe(getRunBriefRouteStatus(true));
    expect(mockRunBriefLifecycle).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload.short_circuit.reason).toBe('cheap_dry_run');
    expect(payload.spend_policy).toEqual({
      pipeline_dry_run: true,
      paid_llm_requested: false,
      paid_llm_effective: false,
    });
  });

  it('passes forceFreshRun when the URL has ?force=true', async () => {
    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mockResolveUser.mockResolvedValue({ userId });
    mockRecentDryRunMaybeSingle.mockResolvedValue({
      data: {
        id: 'recent-dry-run',
        created_at: new Date().toISOString(),
      },
      error: null,
    });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');
    const { getRunBriefRouteStatus } = await import('../contract');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?force=true', { method: 'POST' }),
    );

    expect(response.status).toBe(getRunBriefRouteStatus(true));
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

  it('does not apply the pending-approval dry-run guard to real non-dry runs', async () => {
    const userId = '13131313-1313-1313-1313-131313131313';
    mockResolveUser.mockResolvedValue({ userId });
    mockPendingApprovalLimit.mockResolvedValue({
      data: [{
        id: 'pending-action-2',
        generated_at: new Date().toISOString(),
        confidence: 72,
        action_type: 'send_message',
        execution_result: { artifact: { summary: 'keep' } },
      }],
      error: null,
    });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');
    const { getRunBriefRouteStatus } = await import('../contract');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(response.status).toBe(getRunBriefRouteStatus(true));
    expect(mockRunBriefLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [userId],
        ensureSend: true,
      }),
    );
  });

  it('defaults to pipelineDryRun on Vercel production when PROD_DEFAULT_PIPELINE_DRY_RUN is set', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');

    const userId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    mockResolveUser.mockResolvedValue({ userId });
    const { POST } = await import('../route');
    const { getRunBriefRouteStatus } = await import('../contract');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief?force=true', { method: 'POST' }));

    expect(response.status).toBe(getRunBriefRouteStatus(true));
    expect(mockRunBriefLifecycle).not.toHaveBeenCalled();
  });

  it('on prod default dry-run, use_llm without ALLOW_PROD_PAID_LLM stays dry', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');

    const userId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    mockResolveUser.mockResolvedValue({ userId });
    const { POST } = await import('../route');
    const { getRunBriefRouteStatus } = await import('../contract');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?force=true&use_llm=true', { method: 'POST' }),
    );

    expect(mockRunBriefLifecycle).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload.spend_policy).toEqual({
      pipeline_dry_run: true,
      paid_llm_requested: true,
      paid_llm_effective: false,
    });
    expect(response.status).toBe(getRunBriefRouteStatus(true));
  });

  it('on prod default dry-run, use_llm with ALLOW_PROD_PAID_LLM runs paid path', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');
    vi.stubEnv('ALLOW_PROD_PAID_LLM', 'true');

    const userId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');
    const { getRunBriefRouteStatus } = await import('../contract');

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
    expect(response.status).toBe(getRunBriefRouteStatus(true));
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

  it('returns 207 when the lifecycle result is degraded even though the route returns JSON successfully', async () => {
    const userId = '55555555-5555-5555-5555-555555555555';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false, false));
    const { POST } = await import('../route');
    const { getRunBriefRouteStatus } = await import('../contract');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(response.status).toBe(getRunBriefRouteStatus(false));
    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.stages.daily_brief.ok).toBe(false);
  });

  it('returns 429 when the server-side run-brief limiter is exhausted', async () => {
    const userId = '99999999-9999-9999-9999-999999999999';
    mockResolveUser.mockResolvedValue({ userId });
    mockRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 120_000),
    });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(mockRunBriefLifecycle).not.toHaveBeenCalled();
  });
});
