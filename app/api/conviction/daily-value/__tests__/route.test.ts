import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockGetWinnerTruthReport = vi.fn();
const mockApiErrorForRoute = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/system/winner-truth', () => ({ getWinnerTruthReport: mockGetWinnerTruthReport }));
vi.mock('@/lib/utils/api-error', () => ({ apiErrorForRoute: mockApiErrorForRoute }));

async function callDailyValue() {
  const { GET } = await import('../route');
  return GET(new Request('http://localhost/api/conviction/daily-value'));
}

describe('GET /api/conviction/daily-value', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }),
    );
    mockResolveUser.mockResolvedValue({ userId: 'u-test' });
  });

  it('returns a safe current best move from deterministic winner truth', async () => {
    mockGetWinnerTruthReport.mockResolvedValue({
      generated_at: '2026-05-08T18:30:00.000Z',
      current_winner: {
        verdict: 'selected',
        title: 'Commitment due in 5d: Save job seeker account information',
        discrepancy_card: {
          claim: 'Commitment due in 5d: Save job seeker account information',
          contradiction: 'Expected: account records saved. Current: no execution artifact exists.',
          risk: 'The account transition may happen before the saved records are packaged.',
          evidence: [
            'Save job seeker account information before the website transition.',
            'due_at=2026-05-14T00:00:00+00:00, days_until_due=5',
          ],
          next_action:
            'Write a decision memo that closes the account transition with the owner, next action, and deadline.',
          why_now: 'The deadline is close enough that delay creates avoidable exposure.',
          source_refs: ['commitment:8c9e725a-a5ce-461d-84c4-a9fec4338d70'],
        },
      },
      action_needed: [],
    });

    const response = await callDailyValue();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mockGetWinnerTruthReport).toHaveBeenCalledWith('u-test');
    expect(body.daily_utility_slate.primary_move).toEqual(
      expect.objectContaining({
        title: 'Commitment due in 5d: Save job seeker account information',
        status: 'primary_move',
        why_it_matters:
          'The account transition may happen before the saved records are packaged.',
        source_refs: ['Saved commitment'],
      }),
    );
    expect(serialized).not.toMatch(/candidate_id|missing_|weak_|gate|winnerQualityTrace|commitment:[0-9a-f-]+|8c9e725a/i);
  });

  it('passes auth responses through', async () => {
    mockResolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await callDailyValue();

    expect(response.status).toBe(401);
    expect(mockGetWinnerTruthReport).not.toHaveBeenCalled();
  });
});
