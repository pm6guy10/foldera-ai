import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveAnyUser = vi.fn();
const mockGenerateDirective = vi.fn();
const mockGenerateArtifact = vi.fn();
const mockGetLastScorerDiagnostics = vi.fn();
const mockGetUserById = vi.fn();
const mockUpdateUserById = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveAnyUser: mockResolveAnyUser,
}));

vi.mock('@/lib/briefing/generator', () => ({
  generateDirective: mockGenerateDirective,
  BUDGET_CAP_DIRECTIVE_SENTINEL: '__BUDGET_CAP_REACHED__',
}));

vi.mock('@/lib/conviction/artifact-generator', () => ({
  generateArtifact: mockGenerateArtifact,
}));

vi.mock('@/lib/briefing/scorer', () => ({
  getLastScorerDiagnostics: mockGetLastScorerDiagnostics,
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

const REAL_DIRECTIVE = {
  directive: 'Reply to Deanne confirming the 2 PM homeschool slot and attach the curriculum outline.',
  action_type: 'send_message' as const,
  confidence: 78,
  reason: 'Deanne asked twice and the meeting is today; a one-line confirm closes the loop.',
  evidence: [
    { type: 'commitment' as const, description: 'Homeschool meeting due today', date: '2026-06-12T09:00:00Z' },
  ],
};

const REAL_ARTIFACT = {
  type: 'email' as const,
  to: 'deanne@example.com',
  subject: 'Confirming 2 PM today',
  body: 'Hi Deanne — confirming 2 PM works. Curriculum outline attached. — Brandon',
  draft_type: 'email_reply' as const,
};

const DIAGNOSTICS_WINNER = {
  finalOutcome: 'winner_selected' as const,
  finalWinner: {
    candidateId: 'commitment-abc',
    type: 'commitment',
    title: 'Homeschool meeting with Deanne Varnum',
    score: 72.5,
    matchedGoal: 'Stay present for family commitments',
  },
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
    mockGenerateArtifact.mockResolvedValue(REAL_ARTIFACT);
    mockGetLastScorerDiagnostics.mockReturnValue(DIAGNOSTICS_WINNER);
  });

  it('returns 401 when auth resolution fails', async () => {
    mockResolveAnyUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    expect(response.status).toBe(401);
  });

  it('returns seeded=false when the brain produces no real move (do_nothing)', async () => {
    mockResolveAnyUser.mockResolvedValue({ userId: OWNER_ID });
    mockGenerateDirective.mockResolvedValue({
      directive: '__GENERATION_FAILED__',
      action_type: 'do_nothing',
      confidence: 0,
      reason: 'No valid action: pool empty.',
      evidence: [],
    });
    mockGetLastScorerDiagnostics.mockReturnValue({ finalOutcome: 'no_valid_action', finalWinner: null });

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.seeded).toBe(false);
    expect(body.scorer_outcome).toBe('no_valid_action');
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockGenerateArtifact).not.toHaveBeenCalled();
  });

  it('seeds the REAL generated move (not a title echo) and its draft', async () => {
    mockResolveAnyUser.mockResolvedValue({ userId: OWNER_ID });
    mockGenerateDirective.mockResolvedValue(REAL_DIRECTIVE);

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.seeded).toBe(true);
    // next_move is the real plain-English action, NOT "Review and take the smallest next step: <title>"
    expect(body.state_seeded.next_move).toBe(REAL_DIRECTIVE.directive);
    expect(body.state_seeded.next_move).not.toContain('Review and take the smallest next step');
    // why is the grounded reason, NOT "Score: 72.50"
    expect(body.state_seeded.why_it_matters).toBe(REAL_DIRECTIVE.reason);
    expect(body.state_seeded.state_source).toBe('scored_winner');
    expect(body.state_seeded.current_focus).toBe('Homeschool meeting with Deanne Varnum');
    // the draft behind "View Draft"
    expect(body.state_seeded.draft.action_type).toBe('send_message');
    expect(body.state_seeded.draft.title).toBe('Confirming 2 PM today');
    expect(body.state_seeded.draft.preview).toContain('confirming 2 PM works');

    const updateCall = mockUpdateUserById.mock.calls[0][1];
    expect(updateCall.user_metadata.workday_presence_state.next_move).toBe(REAL_DIRECTIVE.directive);
    expect(updateCall.user_metadata.workday_presence_state.draft.title).toBe('Confirming 2 PM today');
  });

  it('still seeds a real move when artifact generation yields nothing', async () => {
    mockResolveAnyUser.mockResolvedValue({ userId: OWNER_ID });
    mockGenerateDirective.mockResolvedValue(REAL_DIRECTIVE);
    mockGenerateArtifact.mockResolvedValue(null);

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    const body = await response.json();

    expect(body.seeded).toBe(true);
    expect(body.state_seeded.next_move).toBe(REAL_DIRECTIVE.directive);
    expect(body.state_seeded.draft).toBeNull();
  });

  it('seeds even when artifact generation throws (move is the value)', async () => {
    mockResolveAnyUser.mockResolvedValue({ userId: OWNER_ID });
    mockGenerateDirective.mockResolvedValue(REAL_DIRECTIVE);
    mockGenerateArtifact.mockRejectedValue(new Error('artifact boom'));

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    const body = await response.json();

    expect(body.seeded).toBe(true);
    expect(body.state_seeded.draft).toBeNull();
    expect(mockUpdateUserById).toHaveBeenCalledOnce();
  });
});
