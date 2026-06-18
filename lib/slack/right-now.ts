import { createHmac, timingSafeEqual } from 'crypto';
import {
  RIGHT_NOW_ACTION_IDS,
  RIGHT_NOW_SEND_ACTION_ID,
  type RightNowMessageAction,
  type RightNowMessageActionId,
  type RightNowMessageButtonId,
  type RightNowMessagePayload,
} from '@/lib/workday-presence/message';
import type { WorkdayPresenceDraft } from '@/lib/workday-presence/model';
import { redactSlackSecret } from './redaction';

/** Modal that carries the review-gated send sign-off. */
export const REVIEW_SEND_MODAL_CALLBACK_ID = 'foldera_review_send';

export type SlackRightNowBlock =
  | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
  | {
      type: 'actions';
      block_id: 'foldera_right_now_actions';
      elements: Array<{
        type: 'button';
        text: { type: 'plain_text'; text: string };
        action_id: RightNowMessageButtonId;
        value: RightNowMessageButtonId;
        style?: 'primary' | 'danger';
      }>;
    };

/** Private metadata stashed on the review modal so the sign-off can execute + update in place. */
export type ReviewSendModalMetadata = {
  action_id: string;
  channel?: string;
  message_ts?: string;
};

export type SlackModalView = Record<string, unknown> & { callback_id: string };

export type SlackRightNowMessage = {
  channel: string;
  text: string;
  blocks: SlackRightNowBlock[];
};

export type SlackSendResult = {
  ok: true;
  mode: 'live' | 'test_safe';
  channel: string;
  message_ts: string;
  response: unknown;
};

export type SlackViewOpenResult = {
  ok: true;
  mode: 'live' | 'test_safe';
  response: unknown;
};

export type SlackAdapter = {
  postMessage(message: SlackRightNowMessage): Promise<SlackSendResult>;
  updateMessage(message: SlackRightNowMessage & { ts: string }): Promise<SlackSendResult>;
  openView(triggerId: string, view: SlackModalView): Promise<SlackViewOpenResult>;
};

export type SlackInteractionPayload = {
  type?: string;
  user?: { id?: string };
  channel?: { id?: string };
  message?: { ts?: string };
  trigger_id?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
  state?: { values?: Record<string, Record<string, { value?: string }>> };
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Record<string, Record<string, { value?: string }>> };
  };
};

function buttonStyle(action: RightNowMessageAction): 'primary' | 'danger' | undefined {
  if (action.id === RIGHT_NOW_SEND_ACTION_ID) return 'primary';
  if (action.id === 'view_draft') return undefined;
  return undefined;
}

export function buildSlackRightNowMessage(
  payload: RightNowMessagePayload,
  channel: string,
): SlackRightNowMessage {
  const blocks: SlackRightNowBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: payload.text } },
  ];
  // Slack rejects an actions block with zero elements (setup/dismissed cards).
  if (payload.actions.length > 0) {
    blocks.push({
      type: 'actions',
      block_id: 'foldera_right_now_actions',
      elements: payload.actions.map((action) => ({
        type: 'button',
        text: { type: 'plain_text', text: action.label },
        action_id: action.id,
        value: action.id,
        style: buttonStyle(action),
      })),
    });
  }
  return {
    channel,
    text: 'Foldera Right Now',
    blocks,
  };
}

export function createTestSafeSlackAdapter(): SlackAdapter {
  return {
    async postMessage(message) {
      return {
        ok: true,
        mode: 'test_safe',
        channel: message.channel,
        message_ts: 'test-safe-right-now-ts',
        response: { ok: true, test_safe: true },
      };
    },
    async updateMessage(message) {
      return {
        ok: true,
        mode: 'test_safe',
        channel: message.channel,
        message_ts: message.ts,
        response: { ok: true, test_safe: true },
      };
    },
    async openView() {
      return { ok: true, mode: 'test_safe', response: { ok: true, test_safe: true } };
    },
  };
}

export function createLiveSlackAdapter(botToken: string, fetchImpl: typeof fetch = fetch): SlackAdapter {
  async function slackApi(
    method: 'chat.postMessage' | 'chat.update' | 'views.open',
    body: Record<string, unknown>,
  ) {
    const response = await fetchImpl(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${botToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; ts?: string; error?: string };
    if (!response.ok || json.ok !== true) {
      throw new Error(`Slack ${method} failed: ${json.error ?? response.status}`);
    }
    return json;
  }

  return {
    async postMessage(message) {
      const json = await slackApi('chat.postMessage', message);
      return {
        ok: true,
        mode: 'live',
        channel: message.channel,
        message_ts: String(json.ts ?? ''),
        response: redactSlackSecret(json),
      };
    },
    async updateMessage(message) {
      const json = await slackApi('chat.update', message);
      return {
        ok: true,
        mode: 'live',
        channel: message.channel,
        message_ts: String(json.ts ?? message.ts),
        response: redactSlackSecret(json),
      };
    },
    async openView(triggerId, view) {
      const json = await slackApi('views.open', { trigger_id: triggerId, view });
      return { ok: true, mode: 'live', response: redactSlackSecret(json) };
    },
  };
}

/**
 * The review-gated send modal: the deliberate sign-off surface. Shows the recipient
 * (read-only), an editable subject and body, and the source trail the move was grounded
 * in. Nothing sends until the user submits — submit IS the authorization. The originating
 * action id and the message coordinates ride in private_metadata so the sign-off can
 * execute the real send and update the original ping in place.
 */
export function buildReviewSendModal(input: {
  draft: WorkdayPresenceDraft;
  sourceLine?: string | null;
  metadata: ReviewSendModalMetadata;
}): SlackModalView {
  const { draft, sourceLine, metadata } = input;
  const to = draft.to?.trim() || '(recipient unknown)';
  const subject = draft.title?.trim() || '';
  const body = (draft.body || draft.preview || '').trim();

  const blocks: Array<Record<string, unknown>> = [
    { type: 'section', text: { type: 'mrkdwn', text: `*To:* ${to}` } },
    {
      type: 'input',
      block_id: 'review_send_subject',
      label: { type: 'plain_text', text: 'Subject' },
      element: {
        type: 'plain_text_input',
        action_id: 'subject',
        initial_value: subject.slice(0, 150),
      },
    },
    {
      type: 'input',
      block_id: 'review_send_body',
      label: { type: 'plain_text', text: 'Message' },
      element: {
        type: 'plain_text_input',
        action_id: 'body',
        multiline: true,
        initial_value: body,
      },
    },
  ];

  if (sourceLine && sourceLine.trim()) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Grounded in — ${sourceLine.trim()}` }],
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: ':warning: This sends from *your* Gmail. Review above, then sign off to send.',
      },
    ],
  });

  return {
    type: 'modal',
    callback_id: REVIEW_SEND_MODAL_CALLBACK_ID,
    private_metadata: JSON.stringify(metadata),
    title: { type: 'plain_text', text: 'Review & send' },
    submit: { type: 'plain_text', text: 'Send from my Gmail' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  };
}

/**
 * Read a review-send button tap (block_actions). Returns null unless the tapped action is
 * exactly the review-send button — so the normal action path (view_draft/dismiss/…) is
 * never disturbed.
 */
export function parseSlackReviewSendAction(payload: SlackInteractionPayload): {
  triggerId: string;
  channel?: string;
  messageTs?: string;
} | null {
  if (payload.type !== 'block_actions') return null;
  const action = payload.actions?.[0];
  const rawId = action?.action_id ?? action?.value;
  if (rawId !== RIGHT_NOW_SEND_ACTION_ID) return null;
  const triggerId = payload.trigger_id?.trim();
  if (!triggerId) return null;
  return {
    triggerId,
    channel: payload.channel?.id,
    messageTs: payload.message?.ts,
  };
}

/** Read the modal sign-off (view_submission). Returns the edited fields + carried metadata. */
export function parseSlackReviewSendSubmission(payload: SlackInteractionPayload): {
  metadata: ReviewSendModalMetadata;
  subject: string;
  body: string;
} | null {
  if (payload.type !== 'view_submission') return null;
  if (payload.view?.callback_id !== REVIEW_SEND_MODAL_CALLBACK_ID) return null;
  let metadata: ReviewSendModalMetadata | null = null;
  try {
    const parsed = JSON.parse(payload.view?.private_metadata ?? '{}') as Record<string, unknown>;
    const actionId = typeof parsed.action_id === 'string' ? parsed.action_id.trim() : '';
    if (!actionId) return null;
    metadata = {
      action_id: actionId,
      channel: typeof parsed.channel === 'string' ? parsed.channel : undefined,
      message_ts: typeof parsed.message_ts === 'string' ? parsed.message_ts : undefined,
    };
  } catch {
    return null;
  }
  const values = payload.view?.state?.values ?? {};
  const subject = values.review_send_subject?.subject?.value?.trim() ?? '';
  const body = values.review_send_body?.body?.value?.trim() ?? '';
  return { metadata, subject, body };
}

export function resolveSlackAdapterFromEnv(): SlackAdapter {
  const token = process.env.SLACK_BOT_TOKEN;
  // Prevent Vercel preview/dev deployments from sending live Slack noise
  const isProduction = process.env.VERCEL_ENV === 'production' || !process.env.VERCEL_ENV;
  if (!token || !isProduction) return createTestSafeSlackAdapter();
  return createLiveSlackAdapter(token);
}

export function requireSlackChannel(): string {
  const channel = process.env.FOLDERA_SLACK_SELF_CHANNEL_ID?.trim();
  if (!channel) {
    throw new Error('Missing FOLDERA_SLACK_SELF_CHANNEL_ID for the bounded Real Slack Self-Loop send path');
  }
  return channel;
}

export function verifySlackRequestSignature(options: {
  signingSecret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowSeconds?: number;
}): boolean {
  if (!options.timestamp || !options.signature) return false;
  const timestampSeconds = Number(options.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 60 * 5) return false;

  const base = `v0:${options.timestamp}:${options.rawBody}`;
  const expected = `v0=${createHmac('sha256', options.signingSecret).update(base).digest('hex')}`;
  const received = Buffer.from(options.signature);
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

export function parseSlackInteractionAction(payload: SlackInteractionPayload): {
  actionId: RightNowMessageActionId;
  blocker?: string;
  channel?: string;
  messageTs?: string;
} | null {
  const rawAction = payload.actions?.[0]?.action_id ?? payload.actions?.[0]?.value;
  if (!rawAction || !(RIGHT_NOW_ACTION_IDS as readonly string[]).includes(rawAction)) return null;
  const blocker = Object.values(payload.state?.values ?? {})
    .flatMap((group) => Object.values(group))
    .map((field) => field.value?.trim())
    .find(Boolean);

  return {
    actionId: rawAction as RightNowMessageActionId,
    blocker,
    channel: payload.channel?.id,
    messageTs: payload.message?.ts,
  };
}

