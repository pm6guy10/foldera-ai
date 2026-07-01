import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockMaybeSingle = vi.fn();
const mockGetUserById = vi.fn();
const mockUpdateUserById = vi.fn();

const queryChain = {
  select: vi.fn(() => queryChain),
  eq: vi.fn(() => queryChain),
  maybeSingle: mockMaybeSingle,
  insert: mockInsert,
  update: mockUpdate,
};

const mockSupabase = {
  auth: {
    admin: {
      getUserById: mockGetUserById,
      updateUserById: mockUpdateUserById,
    },
  },
  from: vi.fn(() => queryChain),
};

const mockVerifySignature = vi.fn();
const mockParseSlackInteractionAction = vi.fn();
const mockParseReviewSendAction = vi.fn();
const mockParseReviewSendSubmission = vi.fn();
const mockBuildReviewSendModal = vi.fn(() => ({ callback_id: 'foldera_review_send' }));
const mockUpdateMessage = vi.fn();
const mockOpenView = vi.fn();
const mockSlackAdapter = {
  updateMessage: mockUpdateMessage,
  openView: mockOpenView,
};
const mockExecuteAction = vi.fn();

vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/slack/right-now', () => ({
  verifySlackRequestSignature: mockVerifySignature,
  parseSlackInteractionAction: mockParseSlackInteractionAction,
  parseSlackReviewSendAction: mockParseReviewSendAction,
  parseSlackReviewSendSubmission: mockParseReviewSendSubmission,
  buildReviewSendModal: mockBuildReviewSendModal,
  resolveSlackAdapterFromEnv: () => mockSlackAdapter,
  buildSlackRightNowMessage: (payload: any, channel: string) => ({ channel, text: 'mock' }),
}));
vi.mock('@/lib/conviction/execute-action', () => ({ executeAction: mockExecuteAction }));

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

const sendState = {
  ...activeState,
  state_source: 'scored_winner',
  draft: {
    action_type: 'send_message',
    title: 'Q2 budget confirmation',
    preview: 'Confirming the Q2 budget numbers ahead of the 4pm close.',
    body: 'Hi Sarah, confirming the Q2 budget numbers ahead of the 4pm close. — Brandon',
    to: 'sarah@acme.com',
    action_id: 'action-q2-budget',
  },
};

function postBody() {
  return new Request('http://localhost/api/slack/interaction', {
    method: 'POST',
    body: 'payload=%7B%7D',
  });
}

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
    // Default: not a review-send button and not a modal sign-off.
    mockParseReviewSendAction.mockReturnValue(null);
    mockParseReviewSendSubmission.mockReturnValue(null);
  });

  it('rejects invalid signature', async () => {
    mockVerifySignature.mockReturnValue(false);
    mockParseSlackInteractionAction.mockReturnValue({ actionId: 'dismiss' });

    const { POST } = await import('../route');
    const response = await POST(postBody());
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
    const response = await POST(postBody());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserById).toHaveBeenCalledTimes(1);
    expect(mockUpdateMessage).toHaveBeenCalledTimes(1);
    expect(body.acknowledged).toBe(true);
  });

  it('dismiss skips the winner\'s real backing row so the scorer learns from it', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { user_metadata: { workday_presence_state: sendState } } },
      error: null,
    });
    mockParseSlackInteractionAction.mockReturnValue({
      actionId: 'dismiss',
      channel: 'C123',
      messageTs: '12345.678',
    });
    mockUpdateMessage.mockResolvedValue({ ok: true, message_ts: '12345.678' });
    mockExecuteAction.mockResolvedValue({ status: 'skipped', action_id: 'action-q2-budget' });

    const { POST } = await import('../route');
    const response = await POST(postBody());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockExecuteAction).toHaveBeenCalledWith({
      userId: ownerUserId,
      actionId: 'action-q2-budget',
      decision: 'skip',
      skipReason: 'slack_dismiss',
    });
    expect(body.judgment).toEqual({ recorded: true, reason: 'skipped' });
  });

  it('dismiss without a backing action row teaches nothing and does not call executeAction', async () => {
    // Default activeState: manual anchor, no draft — nothing to ratchet.
    mockParseSlackInteractionAction.mockReturnValue({
      actionId: 'dismiss',
      channel: 'C123',
      messageTs: '12345.678',
    });
    mockUpdateMessage.mockResolvedValue({ ok: true, message_ts: '12345.678' });

    const { POST } = await import('../route');
    const response = await POST(postBody());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(body.judgment).toEqual({ recorded: false, reason: 'no_backing_action' });
  });

  it('a failing judgment write never blocks the dismiss ack (best-effort)', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { user_metadata: { workday_presence_state: sendState } } },
      error: null,
    });
    mockParseSlackInteractionAction.mockReturnValue({
      actionId: 'dismiss',
      channel: 'C123',
      messageTs: '12345.678',
    });
    mockUpdateMessage.mockResolvedValue({ ok: true, message_ts: '12345.678' });
    mockExecuteAction.mockRejectedValue(new Error('db down'));

    const { POST } = await import('../route');
    const response = await POST(postBody());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.acknowledged).toBe(true);
    expect(body.judgment).toEqual({ recorded: false, reason: 'db down' });
  });

  it('non-dismiss interactions never touch the judgment rail', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { user_metadata: { workday_presence_state: sendState } } },
      error: null,
    });
    mockParseSlackInteractionAction.mockReturnValue({
      actionId: 'done',
      channel: 'C123',
      messageTs: '12345.678',
    });
    mockUpdateMessage.mockResolvedValue({ ok: true, message_ts: '12345.678' });

    const { POST } = await import('../route');
    const response = await POST(postBody());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(body.judgment).toBeUndefined();
  });

  it('aborts state update and returns 500 when presence receipt write fails', async () => {
    mockParseSlackInteractionAction.mockReturnValue({
      actionId: 'dismiss',
      channel: 'C123',
      messageTs: '12345.678',
    });
    mockInsert.mockResolvedValue({ error: new Error('Durable action receipt write failed') });

    const { POST } = await import('../route');
    const response = await POST(postBody());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(body.error).toContain('Durable action receipt write failed');
  });

  it('opens the review modal on the review-send button without sending', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { user_metadata: { workday_presence_state: sendState } } },
      error: null,
    });
    mockParseReviewSendAction.mockReturnValue({
      triggerId: 'trigger-123',
      channel: 'C123',
      messageTs: '12345.678',
    });
    mockOpenView.mockResolvedValue({ ok: true, mode: 'test_safe', response: { ok: true } });

    const { POST } = await import('../route');
    const response = await POST(postBody());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockOpenView).toHaveBeenCalledTimes(1);
    expect(mockOpenView).toHaveBeenCalledWith('trigger-123', expect.any(Object));
    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(body.acknowledged).toBe(true);
  });

  it('refuses to open the modal when there is no sendable draft', async () => {
    mockParseReviewSendAction.mockReturnValue({ triggerId: 'trigger-123' });

    const { POST } = await import('../route');
    const response = await POST(postBody());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(mockOpenView).not.toHaveBeenCalled();
    expect(body.error).toContain('No sendable draft');
  });

  it('executes the real send on modal sign-off and confirms in the original message', async () => {
    mockParseReviewSendSubmission.mockReturnValue({
      metadata: { action_id: 'action-q2-budget', channel: 'C123', message_ts: '12345.678' },
      subject: 'Q2 budget confirmation',
      body: 'Hi Sarah, confirming the Q2 numbers. — Brandon',
    });
    mockMaybeSingle.mockResolvedValue({
      data: { artifact: { to: 'sarah@acme.com', subject: 'Q2 budget confirmation', body: 'orig' }, execution_result: {} },
      error: null,
    });
    mockExecuteAction.mockResolvedValue({
      status: 'executed',
      action_id: 'action-q2-budget',
      result: { sent: true, sent_via: 'gmail' },
    });
    mockUpdateMessage.mockResolvedValue({ ok: true });

    const { POST } = await import('../route');
    const response = await POST(postBody());

    expect(response.status).toBe(200);
    expect(mockExecuteAction).toHaveBeenCalledTimes(1);
    expect(mockExecuteAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'action-q2-budget', decision: 'approve' }),
    );
    // The reviewed subject/body are sent (edited artifact), recipient preserved.
    const call = mockExecuteAction.mock.calls[0][0];
    expect(call.editedArtifact).toMatchObject({ type: 'email', to: 'sarah@acme.com', body: 'Hi Sarah, confirming the Q2 numbers. — Brandon' });
    // The original ping is updated to a sent confirmation.
    expect(mockUpdateMessage).toHaveBeenCalledTimes(1);
    expect(mockUpdateMessage.mock.calls[0][0].text).toContain('Sent to sarah@acme.com');
  });

  it('reports the armed-off state honestly when live send is disabled', async () => {
    mockParseReviewSendSubmission.mockReturnValue({
      metadata: { action_id: 'action-q2-budget', channel: 'C123', message_ts: '12345.678' },
      subject: 'Q2 budget confirmation',
      body: 'Hi Sarah',
    });
    mockMaybeSingle.mockResolvedValue({
      data: { artifact: { to: 'sarah@acme.com', subject: 's', body: 'b' }, execution_result: {} },
      error: null,
    });
    mockExecuteAction.mockResolvedValue({
      status: 'executed',
      action_id: 'action-q2-budget',
      result: { sent: false, email_send_disabled: true },
    });
    mockUpdateMessage.mockResolvedValue({ ok: true });

    const { POST } = await import('../route');
    const response = await POST(postBody());

    expect(response.status).toBe(200);
    expect(mockUpdateMessage.mock.calls[0][0].text).toContain('ALLOW_APPROVAL_EMAIL_SEND');
  });
});
