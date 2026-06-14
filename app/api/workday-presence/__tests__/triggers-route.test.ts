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

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: mockBadRequest,
}));

const BANNED_OUTPUT_RE = /(do_nothing|task list|inbox summary|dashboard dump)/i;

describe('POST /api/workday-presence/triggers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: 'u-55' });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
  });

  it('rejects invalid trigger payloads', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });
    const { POST } = await import('../triggers/route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/triggers', {
        method: 'POST',
        body: JSON.stringify({ trigger_type: 'pre_meeting' }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it('returns an intervention for morning_anchor when saved state exists', async () => {
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
              waiting_on: 'thread-123',
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
    const { POST } = await import('../triggers/route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/triggers', {
        method: 'POST',
        body: JSON.stringify({ trigger_type: 'morning_anchor' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.outcome).toBe('intervention');
    expect(JSON.stringify(body)).not.toMatch(BANNED_OUTPUT_RE);
  });

  it('returns quiet with no payload when no intervention is needed', async () => {
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
              waiting_on: 'thread-123',
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
    const { POST } = await import('../triggers/route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/triggers', {
        method: 'POST',
        body: JSON.stringify({
          trigger_type: 'pre_meeting',
          event: {
            title: 'Weekly staff sync',
            starts_at_iso: '2026-05-20T16:00:00.000Z',
            requires_prep: false,
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.outcome).toBe('quiet');
    expect(body.result.payload).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(BANNED_OUTPUT_RE);
  });

  it('ignores noisy mention/reply-needed signals and returns quiet', async () => {
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
              waiting_on: 'thread-123',
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
    const { POST } = await import('../triggers/route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/triggers', {
        method: 'POST',
        body: JSON.stringify({
          trigger_type: 'mention_reply_needed',
          signal: {
            source: 'slack',
            thread_id: 'thread-123',
            summary: 'Mention in #general',
            reply_needed: false,
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.outcome).toBe('quiet');
    expect(body.result.payload).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(BANNED_OUTPUT_RE);
  });

  it('returns an intervention only when reply-needed signal affects active thread', async () => {
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
              waiting_on: 'thread-123',
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
    const { POST } = await import('../triggers/route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/triggers', {
        method: 'POST',
        body: JSON.stringify({
          trigger_type: 'mention_reply_needed',
          signal: {
            source: 'email',
            thread_id: 'thread-123',
            summary: 'Need your reply on the redlines',
            reply_needed: true,
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.outcome).toBe('intervention');
    expect(JSON.stringify(body)).not.toMatch(BANNED_OUTPUT_RE);
  });

  it('persists blocker-cleared state changes and writes a durable receipt', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockSupabase.from.mockReturnValue({ insert });
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Close ACME renewal decision',
              next_move: 'Wait for legal sign-off, then send the approval note',
              why_it_matters: 'The renewal window closes at 4 PM PT.',
              blocker: 'Waiting for legal sign-off',
              do_not_touch: null,
              waiting_on: 'legal-thread-1',
              last_completed_step: 'Drafted the approval note',
              state_source: 'manual_anchor',
              created_at: '2026-05-20T12:00:00.000Z',
              updated_at: '2026-05-20T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });

    const { POST } = await import('../triggers/route');
    const response = await POST(
      new Request('http://localhost/api/workday-presence/triggers', {
        method: 'POST',
        body: JSON.stringify({
          trigger_type: 'blocker_cleared',
          cleared: {
            blocker: 'Waiting for legal sign-off',
            summary: 'Legal approved the redlines and the thread is unblocked.',
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.outcome).toBe('intervention');
    expect(body.state.blocker).toBeNull();
    expect(body.state.next_move).toContain('Blocker cleared');
    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledWith(
      'u-55',
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          workday_presence_state: expect.objectContaining({
            blocker: null,
          }),
        }),
      }),
    );
    expect(insert).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toMatch(BANNED_OUTPUT_RE);
  });
});

