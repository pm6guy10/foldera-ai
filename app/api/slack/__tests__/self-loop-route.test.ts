import { createHmac } from 'crypto';
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

const beforeState = {
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
};
const folderaAuthUserId = '11111111-1111-4111-8111-111111111111';

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: mockBadRequest,
}));

function slackSignedRequest(payload: unknown, secret = 'test-signing-secret') {
  const rawBody = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `v0=${createHmac('sha256', secret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest('hex')}`;
  return new Request('http://localhost/api/slack/interaction', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': signature,
    },
    body: rawBody,
  });
}

describe('real Slack self-loop routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('FOLDERA_SLACK_SELF_CHANNEL_ID', 'CSELF');
    vi.stubEnv('SLACK_SIGNING_SECRET', 'test-signing-secret');
    vi.stubEnv('FOLDERA_SELF_USER_ID', folderaAuthUserId);
    vi.stubEnv('SLACK_BOT_TOKEN', '');
    mockResolveUser.mockResolvedValue({ userId: folderaAuthUserId });
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: { workday_presence_state: beforeState } } },
      error: null,
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });
  });

  it('POST /api/slack/right-now sends one Right Now card through the test-safe adapter when no bot token is present', async () => {
    const { POST } = await import('../right-now/route');
    const response = await POST(new Request('http://localhost/api/slack/right-now', { method: 'POST' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.acknowledged).toBe(true);
    expect(body.live_slack_ready).toBe(false);
    expect(body.slack.mode).toBe('test_safe');
    expect(body.payload.actions.map((action: { id: string }) => action.id)).toEqual([
      'done',
      'stuck',
      'break_smaller',
      'snooze',
    ]);
    expect(body.receipt.before_state.next_move).toBe('Send owner confirmation note');
    expect(body.receipt.paid_model_call_required).toBe(false);
    expect(body.receipt.inline_full_state_recompute).toBe(false);
  });

  it.each([
    ['done', undefined, 'Send owner confirmation note'],
    ['stuck', 'Need legal clause confirmation', 'Need legal clause confirmation'],
    ['break_smaller', undefined, 'Break it smaller'],
    ['snooze', undefined, 'snoozed_until'],
  ] as const)('POST /api/slack/interaction applies %s and returns a deterministic receipt', async (actionId, blocker, expected) => {
    const { POST } = await import('../interaction/route');
    const response = await POST(
      slackSignedRequest({
        type: 'block_actions',
        channel: { id: 'CSELF' },
        message: { ts: '177.1' },
        actions: [{ action_id: actionId }],
        state: blocker ? { values: { a: { b: { value: blocker } } } } : undefined,
      }),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.acknowledged).toBe(true);
    expect(body.action_id).toBe(actionId);
    expect(body.receipt.before_state.next_move).toBe('Send owner confirmation note');
    expect(body.receipt.button_action.action_id).toBe(actionId);
    expect(serialized).toContain(expected);
    expect(serialized).not.toContain('test-signing-secret');
    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
  });

  it('blocks Slack interactions when the signing secret is missing', async () => {
    vi.stubEnv('SLACK_SIGNING_SECRET', '');
    const { POST } = await import('../interaction/route');
    const response = await POST(slackSignedRequest({ actions: [{ action_id: 'done' }] }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Missing SLACK_SIGNING_SECRET for Slack interaction verification');
    expect(mockSupabase.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('returns a controlled error before Supabase auth when the configured Foldera user id is not a UUID', async () => {
    vi.stubEnv('FOLDERA_SELF_USER_ID', 'U123SLACKUSER');
    mockSupabase.auth.admin.getUserById.mockRejectedValue(
      new Error('@supabase/auth-js: Expected parameter to be UUID but is not'),
    );

    const { POST } = await import('../interaction/route');
    const response = await POST(
      slackSignedRequest({
        type: 'block_actions',
        channel: { id: 'CSELF' },
        message: { ts: '177.1' },
        user: { id: 'U123SLACKUSER' },
        actions: [{ action_id: 'done' }],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid FOLDERA_SELF_USER_ID: expected Supabase auth user UUID');
    expect(mockSupabase.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(mockSupabase.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});

