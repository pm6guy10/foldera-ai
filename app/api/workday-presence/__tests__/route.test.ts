import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockApiErrorForRoute = vi.fn();
const mockBadRequest = vi.fn((message: string) =>
  NextResponse.json({ error: message }, { status: 400 }),
);

const mockSignalsQuery = {
  data: [] as unknown[],
  error: null as unknown,
};

const mockSignalsChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockImplementation(() => Promise.resolve(mockSignalsQuery)),
};

const mockSupabase = {
  auth: {
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn(),
    },
  },
  from: vi.fn().mockReturnValue(mockSignalsChain),
};

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser, resolveAnyUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: mockBadRequest,
}));

describe('GET /api/workday-presence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: 'u-45' });
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }),
    );
    mockSignalsQuery.error = null;
    mockSignalsQuery.data = [];
  });

  it('generates a default state when no state exists (M1 backend-lock)', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });
    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/workday-presence'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.surface_state).toBe('active_move');
    expect(body.state).toBeTruthy();
    expect(body.state.current_focus).toBe('What are you working on now?');
    expect(body.card.mode).toBe('active');
    expect(body.card.heading).toBe('Right now.');
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['state', 'card']));
  });

  it('returns a suppressed_winner surface when a selected move was blocked before it reached the user', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_suppression_trace: {
              trace_type: 'suppressed_winner',
              gate: 'ungrounded_send_draft',
              blocker_reason: 'drafted email has no real inbound thread',
              scorer_outcome: 'winner_selected',
              action_type: 'send_message',
              selected_candidate: {
                title: 'Follow up with Arianna',
                type: 'relationship',
                score: 999,
              },
              candidate_count: 12,
              evidence_empty: false,
              artifact_exists: false,
              draft_exists: false,
              no_send: true,
              generation_failed: false,
              ungrounded_send_draft: true,
              bottom_gate: false,
            },
          },
        },
      },
      error: null,
    });

    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/workday-presence'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.surface_state).toBe('suppressed_winner');
    expect(body.card.mode).toBe('setup');
    expect(body.suppression_trace.gate).toBe('ungrounded_send_draft');
    expect(body.suppression_trace.selected_candidate.score).toBe(999);
  });

  it('returns clear safe silence with the candidate count when no candidate clears the bar', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_suppression_trace: {
              trace_type: 'safe_silence',
              gate: 'safe_silence',
              blocker_reason: 'No candidate combined sufficient score and ranking invariants to authorize an outbound move today.',
              scorer_outcome: 'no_valid_action',
              action_type: 'do_nothing',
              selected_candidate: {
                title: 'Noise: shipping notification',
                type: 'signal',
                score: 0,
              },
              candidate_count: 4,
              evidence_empty: true,
              artifact_exists: false,
              draft_exists: false,
              no_send: true,
              generation_failed: false,
              ungrounded_send_draft: false,
              bottom_gate: false,
            },
          },
        },
      },
      error: null,
    });

    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/workday-presence'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.surface_state).toBe('clear');
    expect(body.suppression_trace.trace_type).toBe('safe_silence');
    expect(body.suppression_trace.candidate_count).toBe(4);
    // No pipeline_runs evidence reachable through this mock → the surface stays
    // exactly as quiet as before; the all-clear key is additive and null.
    expect(body.all_clear).toBeNull();
  });

  it('backs the clear surface with run evidence when the latest pipeline run proves safe silence', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_suppression_trace: {
              trace_type: 'safe_silence',
              gate: 'safe_silence',
              blocker_reason: 'No candidate cleared the bar.',
              scorer_outcome: 'no_valid_action',
              action_type: 'do_nothing',
              selected_candidate: null,
              candidate_count: 14,
              evidence_empty: true,
              artifact_exists: false,
              draft_exists: false,
              no_send: true,
              generation_failed: false,
              ungrounded_send_draft: false,
              bottom_gate: false,
            },
          },
        },
      },
      error: null,
    });
    const pipelineRunsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          outcome: 'safe_silence',
          completed_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          candidates_evaluated: 14,
        },
        error: null,
      }),
    };
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'pipeline_runs' ? pipelineRunsChain : mockSignalsChain,
    );

    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/workday-presence'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.surface_state).toBe('clear');
    expect(body.all_clear).toEqual({
      checked_count: 14,
      completed_at: expect.any(String),
    });
  });

  it('emits exactly one active card when state exists', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Close ACME renewal decision',
              next_move: 'Send owner confirmation note',
              why_it_matters: 'The renewal window closes at 4 PM PT.',
              blocker: null,
              do_not_touch: null,
              waiting_on: 'Owner confirmation sent',
              last_completed_step: 'Drafted decision context',
              state_source: 'manual_anchor',
              interaction_history: [
                {
                  interaction_type: 'done',
                  timestamp: '2026-05-20T12:09:00.000Z',
                  resulting_state: {
                    next_move: 'Send owner confirmation note',
                    blocker: null,
                    waiting_on: 'Owner confirmation sent',
                    last_completed_step: 'Drafted decision context',
                  },
                },
              ],
              created_at: '2026-05-19T12:00:00.000Z',
              updated_at: '2026-05-19T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });
    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/workday-presence'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.surface_state).toBe('active_move');
    expect(body.resolution.verdict).toBe('WAIT');
    expect(body.resolution.rule).toBe('external_wait');
    expect(body.card.mode).toBe('active');
    expect(body.card.heading).toBe('Right now.');
    expect(body.card.next_move).toContain('Hold here until Owner confirmation sent');
    expect(body.card.verdict_line).toContain('Trusted verdict: Hold.');
    expect(body.card.source_line).toContain('Source: your saved focus');
    expect(body.card.last_interaction).toContain('Last interaction: done');
  });

  describe('fresh-load trigger override (Finding 4)', () => {
    const stateWithWaitingOn = {
      current_focus: 'Close ACME renewal decision',
      next_move: 'Send owner confirmation note',
      why_it_matters: 'The renewal window closes at 4 PM PT.',
      blocker: null,
      do_not_touch: null,
      waiting_on: 'thread-123',
      last_completed_step: null,
      state_source: 'manual_anchor',
      interaction_history: [],
      created_at: '2026-06-12T15:00:00.000Z',
      updated_at: '2026-06-12T15:05:00.000Z',
    };

    beforeEach(() => {
      mockSignalsQuery.data = [];
      mockSignalsQuery.error = null;
    });

    it('overrides card next_move when a reply-needed signal matches waiting_on thread', async () => {
      mockSupabase.auth.admin.getUserById.mockResolvedValue({
        data: { user: { user_metadata: { workday_presence_state: stateWithWaitingOn } } },
        error: null,
      });
      mockSignalsQuery.data = [
        {
          id: 'sig-1',
          source: 'gmail',
          thread_id: 'thread-123',
          redacted_summary: 'Customer replied with an answer.',
          reply_needed: true,
          ingested_at: '2026-06-12T15:59:00.000Z',
        },
      ];

      const { GET } = await import('../route');
      const response = await GET(new Request('http://localhost/api/workday-presence'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.surface_state).toBe('active_move');
      expect(body.card.mode).toBe('active');
      expect(body.card.next_move).toContain('Reply needed (email)');
      expect(body.card.next_move).toContain('Customer replied with an answer.');
      expect(body.card.next_move).toContain('Send owner confirmation note');
    });

    it('does not override when signal thread does not match waiting_on', async () => {
      mockSupabase.auth.admin.getUserById.mockResolvedValue({
        data: { user: { user_metadata: { workday_presence_state: stateWithWaitingOn } } },
        error: null,
      });
      mockSignalsQuery.data = [
        {
          id: 'sig-2',
          source: 'gmail',
          thread_id: 'different-thread',
          redacted_summary: 'Unrelated email.',
          reply_needed: true,
          ingested_at: '2026-06-12T15:59:00.000Z',
        },
      ];

      const { GET } = await import('../route');
      const response = await GET(new Request('http://localhost/api/workday-presence'));
      const body = await response.json();

      // No trigger fires — WAIT verdict is preserved (normal base behavior).
      expect(response.status).toBe(200);
      expect(body.card.next_move).not.toContain('Reply needed');
      expect(body.resolution.verdict).toBe('WAIT');
      expect(body.resolution.rule).toBe('external_wait');
    });

    it('leaves card unchanged when there are no fresh signals', async () => {
      mockSupabase.auth.admin.getUserById.mockResolvedValue({
        data: { user: { user_metadata: { workday_presence_state: stateWithWaitingOn } } },
        error: null,
      });
      mockSignalsQuery.data = [];

      const { GET } = await import('../route');
      const response = await GET(new Request('http://localhost/api/workday-presence'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.card.next_move).not.toContain('Reply needed');
    });

    it('respects snooze — does not override even with a matching fresh signal', async () => {
      const snoozedState = {
        ...stateWithWaitingOn,
        snoozed_until: '2099-01-01T00:00:00.000Z',
      };
      mockSupabase.auth.admin.getUserById.mockResolvedValue({
        data: { user: { user_metadata: { workday_presence_state: snoozedState } } },
        error: null,
      });
      mockSignalsQuery.data = [
        {
          id: 'sig-3',
          source: 'gmail',
          thread_id: 'thread-123',
          redacted_summary: 'Customer replied.',
          reply_needed: true,
          ingested_at: '2026-06-12T15:59:00.000Z',
        },
      ];

      const { GET } = await import('../route');
      const response = await GET(new Request('http://localhost/api/workday-presence'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.card.next_move ?? '').not.toContain('Reply needed');
    });

    it('surfaces tkg_signals query error and returns 500', async () => {
      mockSupabase.auth.admin.getUserById.mockResolvedValue({
        data: { user: { user_metadata: { workday_presence_state: stateWithWaitingOn } } },
        error: null,
      });
      mockSignalsQuery.error = new Error('Database query failed');

      const { GET } = await import('../route');
      const response = await GET(new Request('http://localhost/api/workday-presence'));
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('Database query failed');
    });
  });

  it('turns source-backed CLEAR into honest quiet instead of a fake next move', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Close ACME renewal decision',
              next_move: 'Send owner confirmation note',
              why_it_matters: 'The renewal window closes at 4 PM PT.',
              blocker: null,
              do_not_touch: null,
              waiting_on: null,
              last_completed_step: null,
              state_source: 'source_backed',
              source_trail: [
                {
                  table: 'tkg_commitments',
                  source: 'gmail',
                  type: 'commitment',
                  redacted_summary: 'Renewal confirmation owed to ACME',
                  selection_reason: 'active commitment row is the safest source-backed next move',
                },
              ],
              interaction_history: [],
              created_at: '2026-05-19T12:00:00.000Z',
              updated_at: '2026-05-19T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });
    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/workday-presence'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.surface_state).toBe('active_move');
    expect(body.resolution.verdict).toBe('CLEAR');
    expect(body.resolution.rule).toBe('no_justified_command');
    expect(body.card.mode).toBe('active');
    expect(body.card.next_move).toBe('Next move: Stay quiet until connected work proves something is ready.');
    expect(body.card.verdict_line).toContain('Clear right now');
  });
});
