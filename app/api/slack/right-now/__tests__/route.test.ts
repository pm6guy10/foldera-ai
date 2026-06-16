import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockApiErrorForRoute = vi.fn();
const mockBadRequest = vi.fn((message: string) =>
  NextResponse.json({ error: message }, { status: 400 }),
);

const mockInsert = vi.fn();
const mockSupabase = {
  auth: {
    admin: {
      getUserById: vi.fn(),
    },
  },
  from: vi.fn().mockReturnValue({
    insert: mockInsert,
  }),
};

const mockPostMessage = vi.fn();
const mockSlackAdapter = {
  postMessage: mockPostMessage,
};

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/slack/right-now', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/slack/right-now')>();
  return {
    ...original,
    resolveSlackAdapterFromEnv: () => mockSlackAdapter,
  };
});
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: mockBadRequest,
}));

const ownerUserId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
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

describe('POST /api/slack/right-now', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('FOLDERA_SELF_USER_ID', ownerUserId);
    vi.stubEnv('FOLDERA_SLACK_SELF_CHANNEL_ID', 'CSELF');
    vi.stubEnv('SLACK_BOT_TOKEN', '');
    mockResolveUser.mockResolvedValue({ userId: ownerUserId });
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: { workday_presence_state: activeState } } },
      error: null,
    });
  });

  it('forbids live Slack sends for authenticated users other than the owner', async () => {
    mockResolveUser.mockResolvedValue({ userId: otherUserId });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/right-now', { method: 'POST' }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(mockSupabase.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('inserts receipt before sending Slack message and returns 200 on success', async () => {
    mockInsert.mockResolvedValue({ error: null });
    mockPostMessage.mockResolvedValue({
      ok: true,
      mode: 'test_safe',
      channel: 'CSELF',
      message_ts: 'mock-ts',
      response: {},
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/right-now', { method: 'POST' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(body.acknowledged).toBe(true);
  });

  it('blocks sending Slack message and returns 500 when receipt insert fails', async () => {
    mockInsert.mockResolvedValue({ error: new Error('Durable receipt write failed') });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/right-now', { method: 'POST' }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).not.toHaveBeenCalled();
    expect(body.error).toContain('Durable receipt write failed');
  });
});
