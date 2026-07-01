import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  buildSlackRightNowMessage,
  createLiveSlackAdapter,
  parseSlackDismissReasonAction,
  parseSlackInteractionAction,
  verifySlackRequestSignature,
  RIGHT_NOW_DISMISS_REASON_ACTION_ID,
} from '../right-now';
import { redactSlackSecret } from '../redaction';

const payload = {
  kind: 'right_now' as const,
  mode: 'active' as const,
  text: 'Right now.\nNext move: Reply to confirm the 2 PM slot.',
  actions: [
    { id: 'view_draft' as const, label: 'View Draft' },
    { id: 'dismiss' as const, label: 'Dismiss' },
  ],
};

describe('real Slack self-loop boundary', () => {
  it('builds one bounded Right Now Slack message with View Draft + Dismiss', () => {
    const message = buildSlackRightNowMessage(payload, 'CSELF');

    expect(message.channel).toBe('CSELF');
    expect(message.blocks).toHaveLength(2);
    expect(message.blocks[1]).toMatchObject({
      type: 'actions',
      block_id: 'foldera_right_now_actions',
    });
    expect(message.blocks[1].type === 'actions' ? message.blocks[1].elements.map((item) => item.action_id) : []).toEqual([
      'view_draft',
      'dismiss',
    ]);
  });

  it('rides the one-tap dismissal-reason overflow alongside Dismiss when the card opts in', () => {
    const message = buildSlackRightNowMessage({ ...payload, includeDismissReasonMenu: true }, 'CSELF');
    const elements = message.blocks[1].type === 'actions' ? message.blocks[1].elements : [];
    expect(elements.map((item) => item.action_id)).toEqual(['view_draft', 'dismiss', RIGHT_NOW_DISMISS_REASON_ACTION_ID]);
    const overflow = elements[2] as { type: string; options: Array<{ value: string }> };
    expect(overflow.type).toBe('overflow');
    expect(overflow.options.map((o) => o.value)).toEqual([
      'dismiss_reason:not_now',
      'dismiss_reason:never',
      'dismiss_reason:wrong_framing',
      'dismiss_reason:already_done',
    ]);
  });

  it('omits the overflow element when the card opts out of the dismissal-reason menu', () => {
    const message = buildSlackRightNowMessage(payload, 'CSELF');
    const elements = message.blocks[1].type === 'actions' ? message.blocks[1].elements : [];
    expect(elements).toHaveLength(2);
  });

  it('omits the actions block entirely when the card takes no button input', () => {
    const message = buildSlackRightNowMessage({ ...payload, mode: 'dismissed', actions: [] }, 'CSELF');
    expect(message.blocks).toHaveLength(1);
    expect(message.blocks[0].type).toBe('section');
  });

  it('verifies Slack signatures without logging or returning the signing secret', () => {
    const rawBody = 'payload=%7B%22type%22%3A%22block_actions%22%7D';
    const timestamp = '1770000000';
    const secret = 'super-secret-signing-secret';
    const signature = `v0=${createHmac('sha256', secret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest('hex')}`;

    expect(
      verifySlackRequestSignature({
        signingSecret: secret,
        timestamp,
        signature,
        rawBody,
        nowSeconds: 1770000000,
      }),
    ).toBe(true);
    expect(JSON.stringify(redactSlackSecret({ signingSecret: secret, signature }))).not.toContain(secret);
  });

  it('parses only the bounded Foldera button actions', () => {
    expect(
      parseSlackInteractionAction({
        actions: [{ action_id: 'view_draft' }],
        channel: { id: 'CSELF' },
        message: { ts: '177.2' },
      }),
    ).toMatchObject({ actionId: 'view_draft', channel: 'CSELF', messageTs: '177.2' });

    expect(
      parseSlackInteractionAction({
        actions: [{ action_id: 'dismiss' }],
        channel: { id: 'CSELF' },
        message: { ts: '177.3' },
      }),
    ).toMatchObject({ actionId: 'dismiss' });

    // Legacy ids on previously posted cards still resolve.
    expect(
      parseSlackInteractionAction({
        actions: [{ action_id: 'stuck' }],
        channel: { id: 'CSELF' },
        message: { ts: '177.1' },
        state: { values: { a: { b: { value: 'Need legal clause confirmation' } } } },
      }),
    ).toEqual({
      actionId: 'stuck',
      blocker: 'Need legal clause confirmation',
      channel: 'CSELF',
      messageTs: '177.1',
    });

    expect(parseSlackInteractionAction({ actions: [{ action_id: 'open_dashboard' }] })).toBeNull();
  });

  it('parses a one-tap dismissal-reason overflow selection', () => {
    expect(
      parseSlackDismissReasonAction({
        type: 'block_actions',
        actions: [{ action_id: RIGHT_NOW_DISMISS_REASON_ACTION_ID, selected_option: { value: 'dismiss_reason:never' } }],
        channel: { id: 'CSELF' },
        message: { ts: '177.4' },
      }),
    ).toEqual({ reason: 'never', channel: 'CSELF', messageTs: '177.4' });
  });

  it('returns null for a dismiss-reason parse on every other payload shape (legacy taps untouched)', () => {
    // Legacy plain Dismiss button tap.
    expect(
      parseSlackDismissReasonAction({ type: 'block_actions', actions: [{ action_id: 'dismiss' }] }),
    ).toBeNull();
    // Wrong interaction type.
    expect(
      parseSlackDismissReasonAction({
        type: 'view_submission',
        actions: [{ action_id: RIGHT_NOW_DISMISS_REASON_ACTION_ID, selected_option: { value: 'dismiss_reason:never' } }],
      }),
    ).toBeNull();
    // Unrecognized reason value.
    expect(
      parseSlackDismissReasonAction({
        type: 'block_actions',
        actions: [{ action_id: RIGHT_NOW_DISMISS_REASON_ACTION_ID, selected_option: { value: 'dismiss_reason:bogus' } }],
      }),
    ).toBeNull();
    // No payload at all.
    expect(parseSlackDismissReasonAction({ type: 'block_actions', actions: [] })).toBeNull();
  });

  it('redacts Slack tokens from adapter receipts and thrown diagnostic objects', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          ts: '177.2',
          access_token: 'xoxb-1234567890-secret',
          nested: { bot_token: 'xoxb-nested-secret' },
        }),
      );
    const adapter = createLiveSlackAdapter('xoxb-real-token', fetchImpl as typeof fetch);
    const result = await adapter.postMessage(buildSlackRightNowMessage(payload, 'CSELF'));
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('xoxb-1234567890-secret');
    expect(serialized).not.toContain('xoxb-nested-secret');
    expect(serialized).not.toContain('xoxb-real-token');
    expect(serialized).toContain('[REDACTED_SECRET]');
  });
});

