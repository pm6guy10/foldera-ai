import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
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
    update: mockUpdate,
  }),
};

const mockVerifySignature = vi.fn();
const mockParseSlackInteractionAction = vi.fn();
const mockUpdateMessage = vi.fn();
const mockSlackAdapter = {
  updateMessage: mockUpdateMessage,
};

vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/slack/right-now', () => ({
  verifySlackRequestSignature: mockVerifySignature,
  parseSlackInteractionAction: mockParseSlackInteractionAction,
  resolveSlackAdapterFromEnv: () => mockSlackAdapter,
  buildSlackRightNowMessage: (payload: any, channel: string) => ({ channel, text: 'mock' }),
}));

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

const ownerUserId = '11111111-1111-4111-8111-111111111111';
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

describe('POST /api/slack/interaction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('SLACK_SIGNING_SECRET', 'test-secret');
    vi.stubEnv('FOLDERA_SELF_USER_ID', ownerUserId);
    mockVerifySignature.mockReturnValue(true);
    mockGetUserById.mockResolvedValue({
      data: { user: { user_metadata: { workday_presence_state: activeState } } },
      error: null,
    });
    mockInsert.mockResolvedValue({ error: null });
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null });
  });

  it('rejects invalid signature', async () => {
    mockVerifySignature.mockReturnValue(false);
    mockParseSlackInteractionAction.mockReturnValue({ actionId: 'dismiss' });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/interaction', {
        method: 'POST',
        body: 'payload=%7B%7D',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Invalid Slack signature');
  });

  it('closes loop and returns 200 on successful receipt write and state update', async () => {
    mockParseSlackInteractionAction.mockReturnValue({
      actionId: 'dismiss',
      channel: 'C123',
      messageTs: '12345.678',
    });
    mockUpdateMessage.mockResolvedValue({ ok: true, message_ts: '12345.678' });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/interaction', {
        method: 'POST',
        body: 'payload=%7B%7D',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserById).toHaveBeenCalledTimes(1);
    expect(mockUpdateMessage).toHaveBeenCalledTimes(1);
    expect(body.acknowledged).toBe(true);
  });

  it('aborts state update and returns 500 when presence receipt write fails', async () => {
    mockParseSlackInteractionAction.mockReturnValue({
      actionId: 'dismiss',
      channel: 'C123',
      messageTs: '12345.678',
    });
    mockInsert.mockResolvedValue({ error: new Error('Durable action receipt write failed') });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/interaction', {
        method: 'POST',
        body: 'payload=%7B%7D',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(body.error).toContain('Durable action receipt write failed');
  });
});
