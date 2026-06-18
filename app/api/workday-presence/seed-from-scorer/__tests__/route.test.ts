import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveAnyUser = vi.fn();
const mockGenerateDirective = vi.fn();
const mockGenerateArtifact = vi.fn();
const mockGetLastScorerDiagnostics = vi.fn();
const mockGetUserById = vi.fn();
const mockUpdateUserById = vi.fn();
const mockActionSingle = vi.fn();

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

const mockEvaluateBottomGate = vi.fn();
vi.mock('@/lib/cron/daily-brief-generate', () => ({
  evaluateBottomGate: mockEvaluateBottomGate,
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
    from: () => {
      const chain = {
        insert: () => chain,
        select: () => chain,
        single: mockActionSingle,
      };
      return chain;
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

// Thread-backed: gmail_thread_id proves a real inbound email exists behind this reply.
const REAL_ARTIFACT = {
  type: 'email' as const,
  to: 'deanne@example.com',
  subject: 'Confirming 2 PM today',
  body: 'Hi Deanne — confirming 2 PM works. Curriculum outline attached. — Brandon',
  draft_type: 'email_reply' as const,
  gmail_thread_id: 'thread-abc-123',
};

const WRITE_DOC_DIRECTIVE = {
  directive: 'Finalize the curriculum outline document before the 2 PM meeting.',
  action_type: 'write_document' as const,
  confidence: 75,
  reason: 'The meeting is today and the outline is the agreed prep artifact.',
  evidence: [
    { type: 'commitment' as const, description: 'Homeschool meeting due today', date: '2026-06-12T09:00:00Z' },
  ],
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
    mockEvaluateBottomGate.mockReturnValue({ pass: true, blocked_reasons: [] });
    mockActionSingle.mockResolvedValue({ data: { id: 'persisted-action-1' }, error: null });
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
    expect(body.suppression_trace.trace_type).toBe('safe_silence');
    expect(body.suppression_trace.gate).toBe('safe_silence');
    expect(body.suppression_trace.candidate_count).toBeNull();
    expect(body.suppression_trace.evidence_empty).toBe(true);
    expect(mockUpdateUserById).toHaveBeenCalledOnce();
    expect(mockGenerateArtifact).not.toHaveBeenCalled();
  });

  it('returns a generation_failed suppression trace when directive generation collapses after winner selection', async () => {
    mockResolveAnyUser.mockResolvedValue({ userId: OWNER_ID });
    mockGenerateDirective.mockResolvedValue({
      directive: '__GENERATION_FAILED__',
      action_type: 'do_nothing',
      confidence: 0,
      reason: 'Generation failed internally.',
      evidence: [],
      generationLog: {
        outcome: 'no_send',
        stage: 'system',
        reason: 'Generation failed internally.',
        candidateFailureReasons: ['Generation failed internally.'],
        candidateDiscovery: {
          candidateCount: 4,
          suppressedCandidateCount: 0,
          selectionMargin: 0.7,
          selectionReason: 'Winner selected before generation failed.',
          failureReason: 'Generation failed internally.',
          topCandidates: [
            {
              id: 'winner-1',
              rank: 1,
              candidateType: 'signal',
              actionType: 'send_message',
              score: 999,
              scoreBreakdown: {
                stakes: 1,
                urgency: 1,
                tractability: 1,
                freshness: 1,
                fit: 1,
                confidence: 1,
                final_score: 999,
              },
              targetGoal: null,
              sourceSignals: [],
              decision: 'selected',
              decisionReason: 'Selected winner',
            },
          ],
        },
      },
    });
    mockGetLastScorerDiagnostics.mockReturnValue(DIAGNOSTICS_WINNER);

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    const body = await response.json();

    expect(body.seeded).toBe(false);
    expect(body.suppression_trace.trace_type).toBe('generation_failed');
    expect(body.suppression_trace.generation_failed).toBe(true);
    expect(body.suppression_trace.gate).toBe('generation_failed');
    expect(body.suppression_trace.selected_candidate.score).toBe(72.5);
    expect(body.suppression_trace.candidate_count).toBe(4);
    expect(mockUpdateUserById).toHaveBeenCalledOnce();
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
    expect(body.state_seeded.draft.to).toBe('deanne@example.com');
    expect(body.state_seeded.draft.body).toContain('Curriculum outline attached');
    // The persisted action id is threaded into the draft so the review-gated send has a real handle.
    expect(body.state_seeded.draft.action_id).toBe('persisted-action-1');

    const updateCall = mockUpdateUserById.mock.calls[0][1];
    expect(updateCall.user_metadata.workday_presence_state.next_move).toBe(REAL_DIRECTIVE.directive);
    expect(updateCall.user_metadata.workday_presence_state.draft.title).toBe('Confirming 2 PM today');
  });

  it('still seeds a real non-send move when artifact generation yields nothing', async () => {
    mockResolveAnyUser.mockResolvedValue({ userId: OWNER_ID });
    mockGenerateDirective.mockResolvedValue(WRITE_DOC_DIRECTIVE);
    mockGenerateArtifact.mockResolvedValue(null);

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    const body = await response.json();

    expect(body.seeded).toBe(true);
    expect(body.state_seeded.next_move).toBe(WRITE_DOC_DIRECTIVE.directive);
    expect(body.state_seeded.draft).toBeNull();
  });

  it('seeds a non-send move even when artifact generation throws (move is the value)', async () => {
    mockResolveAnyUser.mockResolvedValue({ userId: OWNER_ID });
    mockGenerateDirective.mockResolvedValue(WRITE_DOC_DIRECTIVE);
    mockGenerateArtifact.mockRejectedValue(new Error('artifact boom'));

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    const body = await response.json();

    expect(body.seeded).toBe(true);
    expect(body.state_seeded.draft).toBeNull();
    expect(mockUpdateUserById).toHaveBeenCalledOnce();
  });

  it('ANTI-FABRICATION: refuses to seed a send draft with no real inbound thread and no evidenced recipient', async () => {
    mockResolveAnyUser.mockResolvedValue({ userId: OWNER_ID });
    mockGenerateDirective.mockResolvedValue(REAL_DIRECTIVE);
    // No gmail_thread_id / in_reply_to, and deanne@example.com is not in the evidence text:
    // this is a drafted reply to an email that never happened.
    mockGenerateArtifact.mockResolvedValue({
      type: 'email',
      to: 'deanne@example.com',
      subject: 'Confirming 2 PM today',
      body: 'Hi Deanne — confirming 2 PM works.',
      draft_type: 'email_reply',
    });

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.seeded).toBe(false);
    expect(body.blocker_reason).toContain('ungrounded_send_draft');
    expect(body.suppression_trace.trace_type).toBe('suppressed_winner');
    expect(body.suppression_trace.gate).toBe('ungrounded_send_draft');
    expect(body.suppression_trace.ungrounded_send_draft).toBe(true);
    expect(body.suppression_trace.selected_candidate.score).toBe(72.5);
    expect(body.suppression_trace.no_send).toBe(true);
    expect(mockUpdateUserById).toHaveBeenCalledOnce();
  });

  it('refuses to seed a send move whose artifact generation produced nothing', async () => {
    mockResolveAnyUser.mockResolvedValue({ userId: OWNER_ID });
    mockGenerateDirective.mockResolvedValue(REAL_DIRECTIVE);
    mockGenerateArtifact.mockResolvedValue(null);

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    const body = await response.json();

    expect(body.seeded).toBe(false);
    expect(body.blocker_reason).toContain('ungrounded_send_draft');
    expect(body.suppression_trace.trace_type).toBe('suppressed_winner');
    expect(body.suppression_trace.artifact_exists).toBe(false);
    expect(body.suppression_trace.ungrounded_send_draft).toBe(true);
    expect(mockUpdateUserById).toHaveBeenCalledOnce();
  });

  it('IMPORTANCE BAR: refuses to seed when the bottom gate blocks the winner', async () => {
    mockResolveAnyUser.mockResolvedValue({ userId: OWNER_ID });
    mockGenerateDirective.mockResolvedValue(REAL_DIRECTIVE);
    mockEvaluateBottomGate.mockReturnValue({
      pass: false,
      blocked_reasons: ['NO_REAL_PRESSURE', 'NO_CONCRETE_ASK'],
    });

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/workday-presence/seed-from-scorer', { method: 'POST' }));
    const body = await response.json();

    expect(body.seeded).toBe(false);
    expect(body.blocker_reason).toContain('bottom_gate');
    expect(body.blocker_reason).toContain('NO_REAL_PRESSURE');
    expect(body.suppression_trace.trace_type).toBe('suppressed_winner');
    expect(body.suppression_trace.gate).toBe('bottom_gate');
    expect(body.suppression_trace.bottom_gate).toBe(true);
    expect(mockUpdateUserById).toHaveBeenCalledOnce();
  });
});
