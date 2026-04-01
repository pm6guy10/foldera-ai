import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockRunDailyGenerate = vi.fn();
const mockIsSendWorthy = vi.fn();
const mockApiError = vi.fn();
const mockGetLastScorerDiagnostics = vi.fn();

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/cron/daily-brief-generate', () => ({
  runDailyGenerate: mockRunDailyGenerate,
  isSendWorthy: mockIsSendWorthy,
  evaluateBottomGate: () => ({ pass: true, blocked_reasons: [] as string[] }),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockSupabase,
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiError: mockApiError,
}));

vi.mock('@/lib/briefing/scorer', () => ({
  getLastScorerDiagnostics: mockGetLastScorerDiagnostics,
}));

vi.mock('@/lib/briefing/generator', () => ({
  getDecisionEnforcementIssues: () => [],
}));

describe('POST /api/dev/brain-receipt', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetLastScorerDiagnostics.mockReturnValue(null);
    mockApiError.mockImplementation((error: unknown) =>
      NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }));
  });

  it('rejects authenticated non-owner users', async () => {
    mockResolveUser.mockResolvedValue({ userId: '11111111-1111-1111-1111-111111111111' });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/dev/brain-receipt', { method: 'POST' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('calls runDailyGenerate with skipManualCallLimit for owner brain-receipt', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'e40b7cd8-4925-42f7-bc99-5022969f1d22' });
    mockRunDailyGenerate.mockResolvedValue({ results: [] });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    const { POST } = await import('../route');
    await POST(new Request('http://localhost:3000/api/dev/brain-receipt', { method: 'POST' }));
    expect(mockRunDailyGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        skipManualCallLimit: true,
        skipSpendCap: true,
        forceFreshRun: true,
        skipStaleGate: true,
      }),
    );
  });

  it('returns diagnostics even when no action is persisted', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'e40b7cd8-4925-42f7-bc99-5022969f1d22' });
    mockRunDailyGenerate.mockResolvedValue({
      results: [{
        userId: 'e40b7cd8-4925-42f7-bc99-5022969f1d22',
        code: 'no_valid_candidates',
        success: false,
      }],
    });
    mockGetLastScorerDiagnostics.mockReturnValue({
      sourceCounts: { commitments_raw: 5, signals_raw: 10, entities_raw: 3, goals_raw: 4, goals_after_filter: 3 },
      candidatePool: { commitment: 2, signal: 3, relationship: 0 },
      filterStages: [],
      discrepancies: [],
      convergenceBoosts: [],
      survivors: [],
      finalWinner: null,
      finalOutcome: 'no_valid_action',
    });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/dev/brain-receipt', { method: 'POST' }));
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.blocker).toBe('no_fresh_action_persisted');
    expect(body.scorer_diagnostics).toBeTruthy();
    expect(body.scorer_diagnostics.sourceCounts.commitments_raw).toBe(5);
  });
});
