import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockApiError = vi.fn();
const mockRunBriefLifecycle = vi.fn();
const mockRateLimit = vi.fn();
const mockPipelineInsert = vi.fn();
const mockRecentDryRunMaybeSingle = vi.fn();
const mockTransportReceiptMaybeSingle = vi.fn();
const mockActionFactsSelect = vi.fn();
const mockActionFactsLimit = vi.fn();
const mockLatestPipelineMaybeSingle = vi.fn();
const mockGetConnectorHealthSummary = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/cron/brief-service', () => ({
  runBriefLifecycle: mockRunBriefLifecycle,
}));

vi.mock('@/lib/integrations/connector-health', () => ({
  getConnectorHealthSummary: mockGetConnectorHealthSummary,
}));

function createPipelineRunsChain() {
  const filters: Record<string, string> = {};
  const chain = {
    insert: mockPipelineInsert,
    select: () => chain,
    eq: (col: string, val: string) => {
      filters[col] = val;
      return chain;
    },
    gte: () => chain,
    order: () => chain,
    limit: () => ({
      maybeSingle: () => {
        if (filters.id) {
          return mockTransportReceiptMaybeSingle();
        }
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
            mockActionFactsSelect(...args);
            return chain;
          },
          eq: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: mockActionFactsLimit,
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
        attempted: 1,
        errors: [],
        failed: 0,
        status: 'ok',
        succeeded: 1,
        summary: 'ok',
        results: [{ code: 'no_unprocessed_signals', success: true, userId }],
      },
      generate: {
        attempted: 1,
        errors: [],
        failed: 0,
        status: 'ok',
        succeeded: 1,
        summary: 'ok',
        results: [{ code: 'pending_approval_persisted', success: true, userId }],
      },
      send: {
        attempted: 1,
        errors: [],
        failed: 0,
        status: 'ok',
        succeeded: 1,
        summary: 'ok',
        results: [{ code: 'email_sent', success: true, userId }],
      },
    },
    sendFallbackAttempted,
  };
}

function defaultConnectorHealth() {
  return {
    providers: [],
    instructions: [],
    counts: {
      fresh: 0,
      stale: 0,
      disconnected: 0,
      reauth_required: 0,
      never_synced: 0,
    },
    generation_gate: {
      level: 'ok',
      reason: 'All active connectors are fresh enough for generation.',
      recommended_actions: [],
    },
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
    mockPipelineInsert.mockResolvedValue({ error: null });
    mockRecentDryRunMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockTransportReceiptMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockLatestPipelineMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockActionFactsLimit.mockResolvedValue({ data: [], error: null });
    mockGetConnectorHealthSummary.mockResolvedValue(defaultConnectorHealth());
    mockApiError.mockImplementation((error: unknown) =>
      NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exports a 300-second max duration for the route', async () => {
    const { maxDuration } = await import('../route');

    expect(maxDuration).toBe(300);
  });

  it('collapses cheap dry-run tkg_actions facts into one read for pending approval and latest metadata', async () => {
    const userId = '10101010-1010-1010-1010-101010101010';
    mockResolveUser.mockResolvedValue({ userId });
    mockActionFactsLimit.mockResolvedValue({
      data: [
        {
          id: 'latest-action-1',
          generated_at: new Date().toISOString(),
          status: 'pending_approval',
          confidence: 72,
          action_type: 'send_message',
          execution_result: { artifact: { summary: 'kept' } },
        },
      ],
      error: null,
    });
    const { ACTION_RUN_BRIEF_FACTS_SELECT } = await import('@/lib/conviction/action-read-shapes');
    const { POST } = await import('../route');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?force=true&dry_run=true', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    expect(mockRunBriefLifecycle).not.toHaveBeenCalled();
    expect(mockActionFactsSelect).toHaveBeenCalledTimes(1);
    expect(mockActionFactsSelect).toHaveBeenCalledWith(ACTION_RUN_BRIEF_FACTS_SELECT);
    expect(mockActionFactsLimit).toHaveBeenCalledTimes(1);
    expect(mockActionFactsLimit).toHaveBeenCalledWith(20);

    const payload = await response.json();
    expect(payload.facts.pending_approval).toEqual({
      id: 'latest-action-1',
      generated_at: expect.any(String),
    });
    expect(payload.facts.latest_action).toEqual(
      expect.objectContaining({
        id: 'latest-action-1',
        action_type: 'send_message',
        status: 'pending_approval',
      }),
    );
    expect(payload.query_budget.duplicate_read_guard).toEqual(
      expect.objectContaining({
        tkg_actions:
          'one action-facts read covers reusable pending approval + latest action metadata for the same user/run',
        tkg_signals: 'no run-brief route content read',
        tkg_goals: 'no run-brief route read',
        auth_admin_user_lookup: 'no run-brief route admin lookup',
      }),
    );
    expect(payload.query_budget.tables).toContainEqual(
      expect.objectContaining({
        table: 'tkg_actions',
        selected_columns: ACTION_RUN_BRIEF_FACTS_SELECT,
        row_limit: 20,
        call_count: 1,
      }),
    );
  }, 45_000);

  it('includes recent dry-run and latest pipeline metadata in the cheap dry-run receipt', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    mockResolveUser.mockResolvedValue({ userId });
    mockActionFactsLimit.mockResolvedValue({
      data: [
        {
          id: 'latest-action-1',
          generated_at: new Date().toISOString(),
          status: 'pending_approval',
          action_type: 'write_document',
          confidence: 74,
          execution_result: {},
        },
      ],
      error: null,
    });
    mockRecentDryRunMaybeSingle.mockResolvedValue({
      data: {
        id: 'recent-dry-run',
        created_at: new Date().toISOString(),
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

  it('does not perform cheap dry-run action facts reads on real non-dry runs', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, false));
    const { POST } = await import('../route');
    const { getRunBriefRouteStatus } = await import('../contract');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(mockActionFactsSelect).not.toHaveBeenCalled();
    expect(mockActionFactsLimit).not.toHaveBeenCalled();
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
    expect(response.status).toBe(getRunBriefRouteStatus(true));
  });

  it('blocks live generation when no active connector is fresh enough', async () => {
    const userId = '78787878-7878-7878-7878-787878787878';
    mockResolveUser.mockResolvedValue({ userId });
    mockGetConnectorHealthSummary.mockResolvedValue({
      ...defaultConnectorHealth(),
      generation_gate: {
        level: 'block',
        reason: 'No active connector is fresh enough for generation.',
        recommended_actions: ['Refresh Google before generation.'],
      },
    });
    const { POST } = await import('../route');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?force=true', { method: 'POST' }),
    );

    expect(response.status).toBe(207);
    expect(mockRunBriefLifecycle).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.short_circuit.reason).toBe('connector_health_blocked');
    expect(payload.query_budget.duplicate_read_guard.auth_admin_user_lookup).toBe(
      'no run-brief route admin lookup',
    );
  });

  it('persists and returns a transport diagnostic receipt before lifecycle work', async () => {
    const userId = '12121212-1212-1212-1212-121212121212';
    mockResolveUser.mockResolvedValue({ userId });
    mockTransportReceiptMaybeSingle.mockImplementation(async () => ({
      data: {
        id: mockPipelineInsert.mock.calls[0][0].id,
        created_at: '2026-05-01T18:30:00.000Z',
        started_at: '2026-05-01T18:30:00.000Z',
        completed_at: '2026-05-01T18:30:00.000Z',
        outcome: 'route_transport_diagnostic_returned',
        invocation_source: 'settings_run_brief_transport_diagnostic',
        raw_extras: {
          receipt_type: 'settings_run_brief_transport_diagnostic',
          route_entered: true,
          lifecycle_started: false,
        },
      },
      error: null,
    }));
    const { POST } = await import('../route');

    const response = await POST(
      new Request('http://localhost:3000/api/settings/run-brief?force=true&transport_diagnostic=true', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRunBriefLifecycle).not.toHaveBeenCalled();
    expect(mockPipelineInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'user_run',
        invocation_source: 'settings_run_brief_transport_diagnostic',
        user_id: userId,
        completed_at: expect.any(String),
        outcome: 'route_transport_diagnostic_returned',
      }),
    );

    const payload = await response.json();
    expect(payload.transport_diagnostic).toEqual(
      expect.objectContaining({
        route_entered: true,
        auth_resolved: true,
        lifecycle_started: false,
        paid_generation_started: false,
        receipt_persisted: true,
        receipt_read_back: true,
      }),
    );
  });

  it('passes forceFreshRun when the URL has ?force=true', async () => {
    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mockResolveUser.mockResolvedValue({ userId });
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

  it('surfaces manual_send_fallback_attempted from the service', async () => {
    const userId = '33333333-3333-3333-3333-333333333333';
    mockResolveUser.mockResolvedValue({ userId });
    mockRunBriefLifecycle.mockResolvedValue(makeBriefResult(userId, true));
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.stages.daily_brief.manual_send_fallback_attempted).toBe(true);
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

  it('returns auth response when the session is missing', async () => {
    mockResolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/settings/run-brief', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });
});
