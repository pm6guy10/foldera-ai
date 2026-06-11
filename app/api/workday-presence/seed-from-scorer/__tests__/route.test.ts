import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockScoreOpenLoops = vi.fn();
const mockGetUserById = vi.fn();
const mockUpdateUserById = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/briefing/scorer', () => ({
  scoreOpenLoops: mockScoreOpenLoops,
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    auth: {
      admin: {
        getUserById: mockGetUserById,
        updateUserById: mockUpdateUserById,
      },
    },
  }),
}));

const OWNER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
const OTHER_ID = '11111111-1111-1111-1111-111111111111';

const MOCK_WINNER = {
  id: 'commitment-abc',
  type: 'commitment' as const,
  title: 'Homeschool meeting with Deanne Varnum',
  content: 'Review curriculum planning for next week',
  suggestedActionType: 'write_document' as const,
  matchedGoal: { text: 'Stay present for family commitments', priority: 3 },
  score: 72.5,
  breakdown: {} as never,
  relatedSignals: [],
  sourceSignals: [{ id: 'sig-1', source: 'calendar', kind: 'signal' as const, summary: 'Meeting due 2026-06-12', occurredAt: '2026-06-12T09:00:00Z' }],
  confidence_prior: 70,
};

describe('POST /api/workday-presence/seed-from-scorer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetUserById.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });
    mockUpdateUserById.mockResolvedValue({ error: null });
  });

  it('returns 401 when resolveUser rejects the session', async () => {
    mockResolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    expect(response.status).toBe(401);
  });

  it('returns 403 for non-owner user', async () => {
    mockResolveUser.mockResolvedValue({ userId: OTHER_ID });
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns seeded=false when scorer finds no winner', async () => {
    mockResolveUser.mockResolvedValue({ userId: OWNER_ID });
    mockScoreOpenLoops.mockResolvedValue({
      outcome: 'no_valid_action',
      winner: null,
      exact_blocker: { reason: 'pool_empty' },
      topCandidates: [],
    });
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.seeded).toBe(false);
    expect(body.scorer_outcome).toBe('no_valid_action');
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('seeds state from winner and returns seeded=true', async () => {
    mockResolveUser.mockResolvedValue({ userId: OWNER_ID });
    mockScoreOpenLoops.mockResolvedValue({
      outcome: 'winner_selected',
      winner: MOCK_WINNER,
      topCandidates: [MOCK_WINNER],
    });
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.seeded).toBe(true);
    expect(body.scorer_outcome).toBe('winner_selected');
    expect(body.winner.title).toBe('Homeschool meeting with Deanne Varnum');
    expect(body.state_seeded.state_source).toBe('scored_winner');
    expect(body.state_seeded.current_focus).toBe('Homeschool meeting with Deanne Varnum');
    expect(mockUpdateUserById).toHaveBeenCalledOnce();
    const updateCall = mockUpdateUserById.mock.calls[0][1];
    expect(updateCall.user_metadata.workday_presence_state.state_source).toBe('scored_winner');
  });

  it('calls scoreOpenLoops with pipelineDryRun=true', async () => {
    mockResolveUser.mockResolvedValue({ userId: OWNER_ID });
    mockScoreOpenLoops.mockResolvedValue({
      outcome: 'no_valid_action',
      winner: null,
      exact_blocker: { reason: 'pool_empty' },
      topCandidates: [],
    });
    const { POST } = await import('../route');
    await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    expect(mockScoreOpenLoops).toHaveBeenCalledWith(OWNER_ID, { pipelineDryRun: true });
  });
});
