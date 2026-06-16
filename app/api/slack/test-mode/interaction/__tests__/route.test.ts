import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveAnyUser = vi.fn();
const mockInsert = vi.fn();
const mockGetUserById = vi.fn();
const mockUpdateUserById = vi.fn();

const mockSupabase = {
  auth: {
    admin: {
      getUserById: mockGetUserById,
      updateUserById: mockUpdateUserById,
    },
  },
  from: vi.fn().mockReturnValue({
    insert: mockInsert,
  }),
};

vi.mock('@/lib/auth/resolve-user', () => ({ resolveAnyUser: mockResolveAnyUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));

const mockApiErrorForRoute = vi.fn((err: any) =>
  NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }),
);
const mockBadRequest = vi.fn((message: string) =>
  NextResponse.json({ error: message }, { status: 400 }),
);
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: mockBadRequest,
}));

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
  created_at: '2026-05-20T12:00:00.000Z',
  updated_at: '2026-05-20T12:10:00.000Z',
};

describe('POST /api/slack/test-mode/interaction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockResolveAnyUser.mockResolvedValue({ userId: 'u-123' });
    mockGetUserById.mockResolvedValue({
      data: { user: { user_metadata: { workday_presence_state: activeState } } },
      error: null,
    });
    mockInsert.mockResolvedValue({ error: null });
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null });
  });

  it('rejects request with missing or invalid action_id', async () => {
    const { POST } = await import('../route');
    
    // missing action_id
    const res1 = await POST(
      new Request('http://localhost/api/slack/test-mode/interaction', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res1.status).toBe(400);
    expect(mockBadRequest).toHaveBeenCalledWith('action_id is required');

    // invalid action_id
    const res2 = await POST(
      new Request('http://localhost/api/slack/test-mode/interaction', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'invalid-action' }),
      }),
    );
    expect(res2.status).toBe(400);
    expect(mockBadRequest).toHaveBeenCalledWith('Invalid action_id');
  });

  it('persists state and receipt on valid interaction action', async () => {
    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/test-mode/interaction', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'dismiss' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserById).toHaveBeenCalledTimes(1);
    expect(body.acknowledged).toBe(true);
    expect(body.action_id).toBe('dismiss');
  });

  it('aborts state update and returns 500 when receipt insert fails', async () => {
    mockInsert.mockResolvedValue({ error: new Error('Receipt write failed') });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/test-mode/interaction', {
        method: 'POST',
        body: JSON.stringify({ action_id: 'dismiss' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(body.error).toContain('Receipt write failed');
  });
});
