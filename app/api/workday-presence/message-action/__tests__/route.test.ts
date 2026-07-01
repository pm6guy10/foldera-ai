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
  from: vi.fn(),
};
const mockInsert = vi.fn();

const activeState = {
  current_focus: 'Close ACME renewal decision',
  next_move: 'Send owner confirmation note',
  why_it_matters: 'The renewal window closes at 4 PM PT.',
  blocker: null,
  do_not_touch: null,
  waiting_on: null,
  last_completed_step: null,
  state_source: 'manual_anchor',
  source_trail: [],
  snoozed_until: null,
  interaction_history: [],
  created_at: '2026-05-19T12:00:00.000Z',
  updated_at: '2026-05-19T12:10:00.000Z',
};

const mockExecuteAction = vi.fn();
vi.mock('@/lib/conviction/execute-action', () => ({
  executeAction: (...args: unknown[]) => mockExecuteAction(...args),
}));

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: mockBadRequest,
}));

describe('POST /api/workday-presence/message-action', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: 'u-53' });
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockSupabase.from.mockReturnValue({ insert: mockInsert });
  });

  it('Done updates progress state (last_completed_step) and clears blocker', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Close ACME renewal decision',
              next_move: 'Send owner confirmation note',
              why_it_matters: 'The renewal window closes at 4 PM PT.',
              blocker: 'Need legal clause confirmation',
              do_not_touch: null,
              waiting_on: null,
              last_completed_step: null,
              state_source: 'manual_anchor',
              created_at: '2026-05-19T12:00:00.000Z',
              updated_at: '2026-05-19T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/message-action', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'done' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
    expect(body.state.last_completed_step).toBe('Send owner confirmation note');
    expect(body.state.blocker).toBeNull();
    expect(body.state.next_move).not.toMatch(/write the next|smallest (next|concrete) step/i);
    expect(body.state.interaction_history.at(-1).interaction_type).toBe('done');
  });

  it('Stuck preserves/adds blocker (adds when missing)', async () => {
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
              created_at: '2026-05-19T12:00:00.000Z',
              updated_at: '2026-05-19T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/message-action', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'stuck', blocker: 'Need legal clause confirmation' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
    expect(body.state.blocker).toBe('Need legal clause confirmation');
    expect(body.payload.kind).toBe('right_now');
    expect(body.state.next_move).toContain('Unblocker step');
    expect(body.state.interaction_history.at(-1).interaction_type).toBe('stuck');
  });

  it('Break smaller rewrites next_move to lower-friction step', async () => {
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
              created_at: '2026-05-19T12:00:00.000Z',
              updated_at: '2026-05-19T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/message-action', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'break_smaller' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state.next_move).toContain('Break it smaller');
    expect(body.state.interaction_history.at(-1).interaction_type).toBe('break_smaller');
  });

  it('Snooze persists a temporary hold state', async () => {
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
              created_at: '2026-05-19T12:00:00.000Z',
              updated_at: '2026-05-19T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/message-action', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'snooze' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
    expect(body.state.snoozed_until).toBeTruthy();
    expect(body.state.waiting_on).toMatch(/snoozed/i);
    expect(body.state.interaction_history.at(-1).interaction_type).toBe('snooze');
  });

  it.each([
    ['done', 'approved'],
    ['dismiss', 'draft_rejected'],
    ['break_smaller', 'approved'],
  ] as const)('writes a durable current-path receipt for %s', async (actionId, expectedStatus) => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: activeState,
          },
        },
      },
      error: null,
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/message-action', {
        method: 'POST',
        body: JSON.stringify({ action_id: actionId }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith('tkg_actions');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][0]).toMatchObject({
      user_id: 'u-53',
      status: expectedStatus,
      action_source: 'workday_presence',
      execution_result: expect.objectContaining({ action_id: actionId }),
    });
  });

  it('dismiss with a backing draft skips the real action row (judgment ratchet parity with Slack)', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              ...activeState,
              state_source: 'scored_winner',
              draft: {
                action_type: 'send_message',
                title: 'Owner confirmation note',
                preview: 'Confirming the renewal decision.',
                to: 'owner@example.com',
                body: 'Confirming the renewal decision.',
                action_id: 'act-77',
              },
            },
          },
        },
      },
      error: null,
    });
    mockExecuteAction.mockResolvedValue({ status: 'skipped', action_id: 'act-77' });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/message-action', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'dismiss' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockExecuteAction).toHaveBeenCalledWith({
      userId: 'u-53',
      actionId: 'act-77',
      decision: 'skip',
      skipReason: 'dashboard_dismiss',
    });
    expect(body.judgment).toEqual({ recorded: true, reason: 'skipped' });
  });

  it('dismiss without a backing draft records nothing (no row to teach through)', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: { workday_presence_state: activeState } } },
      error: null,
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/message-action', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'dismiss' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(body.judgment).toEqual({ recorded: false, reason: 'no_backing_action' });
  });

  it('does not write a terminal receipt for view_draft', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: activeState,
          },
        },
      },
      error: null,
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/message-action', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'view_draft' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not report success when state persists but the receipt insert fails', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: activeState,
          },
        },
      },
      error: null,
    });
    mockInsert.mockResolvedValue({ error: new Error('receipt write failed') });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/message-action', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'done' }),
      }),
    );
    const body = await response.json();

    expect(mockSupabase.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(body.error).toMatch(/receipt write failed/);
  });
});

