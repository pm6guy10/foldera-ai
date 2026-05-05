import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { OWNER_USER_ID } from '@/lib/auth/constants';

const resolveUser = vi.fn();
const getWinnerTruthReport = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser,
}));

vi.mock('@/lib/system/winner-truth', () => ({
  getWinnerTruthReport,
}));

describe('system winner-truth route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('blocks non-owner users', async () => {
    resolveUser.mockResolvedValue({ userId: 'not-owner' });
    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/system/winner-truth'));

    expect(response.status).toBe(403);
    expect(getWinnerTruthReport).not.toHaveBeenCalled();
  });

  it('returns the winner truth payload for the owner', async () => {
    resolveUser.mockResolvedValue({ userId: OWNER_USER_ID });
    getWinnerTruthReport.mockResolvedValue({
      current_winner: { verdict: 'selected', title: 'CWU interview #2', tier: 'tier_1', artifact_family: 'interview_role_fit_packet', note: null },
      sync_health: { providers: [], graph: { graph_stale: false, stale_entity_count: 0 }, decrypt_fallback_count: 0 },
      top_viable_candidates: [],
      blocked_candidates: [],
      graph_drift: [],
      polluted_entities: [],
      three_day_consistency: { passes: true, days: [] },
      action_needed: [],
      future_findings: [],
    });

    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/system/winner-truth'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getWinnerTruthReport).toHaveBeenCalledTimes(1);
    expect(payload.current_winner.title).toBe('CWU interview #2');
  });

  it('passes through auth responses', async () => {
    resolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/system/winner-truth'));

    expect(response.status).toBe(401);
  });
});
