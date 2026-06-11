import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveAnyUser = vi.fn();
const mockApiErrorForRoute = vi.fn();

const mockSupabase = {
  auth: {
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn(),
    },
  },
};

vi.mock('@/lib/auth/resolve-user', () => ({ resolveAnyUser: mockResolveAnyUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: (message: string) => NextResponse.json({ error: message }, { status: 400 }),
}));

describe('Slack test-mode Right Now loop', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockResolveAnyUser.mockResolvedValue({ userId: 'u-52' });
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
  });

  // #249 route invariant: when persisted state has state_source='scored_winner', the
  // Right Now render path must surface the scored winner, not fall back to recency.
  it('#249 INVARIANT: GET /api/slack/test-mode/right-now surfaces scored_winner state — not recency metadata', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Project update to be sent by end of day Tuesday',
              next_move: 'Review and take the smallest next step: Project update to be sent by end of day Tuesday',
              why_it_matters: 'Matched goal: "Close open commitments before end of week". Score: 2.86.',
              blocker: null,
              do_not_touch: 'Do not auto-send or mutate source systems.',
              waiting_on: null,
              last_completed_step: null,
              state_source: 'scored_winner',
              source_trail: [
                {
                  table: 'tkg_signals',
                  source: 'calendar',
                  type: 'commitment',
                  row_id: 'sig-commitment-1',
                  occurred_at: '2026-06-10T09:00:00Z',
                  redacted_summary: 'Project update due EOD Tuesday',
                  selection_reason: 'source signal for scored winner',
                },
              ],
              snoozed_until: null,
              interaction_history: [],
              created_at: '2026-06-11T16:00:00.000Z',
              updated_at: '2026-06-11T16:00:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    const { GET } = await import('../right-now/route');
    const response = await GET(new Request('http://localhost/api/slack/test-mode/right-now'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.payload.kind).toBe('right_now');
    // Must show the scored winner, not any recency-derived content
    expect(body.payload.text).toContain('Project update to be sent by end of day Tuesday');
    expect(body.payload.text).toContain('Source trail: tkg_signals/calendar/commitment');
    expect(body.payload.text).not.toContain('$21.66');
    expect(body.payload.text).not.toContain('manual_anchor');
    expect(body.slack_test_mode.channel).toBe('test_dm');
  });

  it('GET /api/slack/test-mode/right-now returns a Slack-style message payload', async () => {
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
              state_source: 'manual_anchor',
              created_at: '2026-05-20T12:00:00.000Z',
              updated_at: '2026-05-20T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    const { GET } = await import('../right-now/route');
    const response = await GET(new Request('http://localhost/api/slack/test-mode/right-now'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.payload.kind).toBe('right_now');
    expect(body.payload.text).toContain('Source trail: manual_anchor');
    expect(body.slack_test_mode.channel).toBe('test_dm');
    expect(body.slack_test_mode.blocks[1].type).toBe('actions');
  });

  it('POST /api/slack/test-mode/interaction updates state on done and returns the next Slack-style payload', async () => {
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
              state_source: 'manual_anchor',
              created_at: '2026-05-20T12:00:00.000Z',
              updated_at: '2026-05-20T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    const { POST } = await import('../interaction/route');
    const response = await POST(
      new Request('http://localhost/api/slack/test-mode/interaction', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'done' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.acknowledged).toBe(true);
    expect(body.action_id).toBe('done');
    expect(body.state.last_completed_step).toContain('Send owner confirmation note');
    expect(body.slack_test_mode.channel).toBe('test_dm');
    expect(body.receipt.before_state.next_move).toBe('Send owner confirmation note');
    expect(body.receipt.card_payload.kind).toBe('right_now');
    expect(body.receipt.button_action.action_id).toBe('done');
    expect(body.receipt.after_state.last_completed_step).toBe('Send owner confirmation note');
    expect(body.receipt.paid_model_call_required).toBe(false);
    expect(body.receipt.inline_full_state_recompute).toBe(false);
    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
  });

  it('POST /api/slack/test-mode/interaction snooze persists temporary hold state', async () => {
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
              state_source: 'manual_anchor',
              created_at: '2026-05-20T12:00:00.000Z',
              updated_at: '2026-05-20T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    const { POST } = await import('../interaction/route');
    const response = await POST(
      new Request('http://localhost/api/slack/test-mode/interaction', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'snooze' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.action_id).toBe('snooze');
    expect(body.state.snoozed_until).toBeTruthy();
    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
  });

  it('POST /api/slack/test-mode/interaction stuck updates blocker and unblocker next step', async () => {
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
              state_source: 'manual_anchor',
              created_at: '2026-05-20T12:00:00.000Z',
              updated_at: '2026-05-20T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    const { POST } = await import('../interaction/route');
    const response = await POST(
      new Request('http://localhost/api/slack/test-mode/interaction', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'stuck', blocker: 'Need legal clause confirmation' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state.blocker).toBe('Need legal clause confirmation');
    expect(body.state.next_move).toContain('Unblocker step');
    expect(body.state.interaction_history.at(-1).interaction_type).toBe('stuck');
  });

  it('POST /api/slack/test-mode/interaction break_smaller updates lower-friction next move', async () => {
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
              state_source: 'manual_anchor',
              created_at: '2026-05-20T12:00:00.000Z',
              updated_at: '2026-05-20T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    const { POST } = await import('../interaction/route');
    const response = await POST(
      new Request('http://localhost/api/slack/test-mode/interaction', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'break_smaller' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state.next_move).toContain('Break it smaller');
    expect(body.state.interaction_history.at(-1).interaction_type).toBe('break_smaller');
  });
});

