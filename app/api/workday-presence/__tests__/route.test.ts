import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockApiErrorForRoute = vi.fn();
const mockBadRequest = vi.fn((message: string) =>
  NextResponse.json({ error: message }, { status: 400 }),
);

const mockSupabase = {
  auth: {
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn(),
    },
  },
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
