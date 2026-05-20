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
  });
});

