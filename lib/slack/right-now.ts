import { createHmac, timingSafeEqual } from 'crypto';
import {
  RIGHT_NOW_ACTION_IDS,
  type RightNowMessageAction,
  type RightNowMessageActionId,
  type RightNowMessagePayload,
} from '@/lib/workday-presence/message';
import { redactSlackSecret } from './redaction';

export type SlackRightNowBlock =
  | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
  | {
      type: 'actions';
      block_id: 'foldera_right_now_actions';
      elements: Array<{
        type: 'button';
        text: { type: 'plain_text'; text: string };
        action_id: RightNowMessageActionId;
        value: RightNowMessageActionId;
        style?: 'primary' | 'danger';
      }>;
    };

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

export type SlackAdapter = {
  postMessage(message: SlackRightNowMessage): Promise<SlackSendResult>;
  updateMessage(message: SlackRightNowMessage & { ts: string }): Promise<SlackSendResult>;
};

export type SlackInteractionPayload = {
  type?: string;
  user?: { id?: string };
  channel?: { id?: string };
  message?: { ts?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
  state?: { values?: Record<string, Record<string, { value?: string }>> };
};

function buttonStyle(action: RightNowMessageAction): 'primary' | 'danger' | undefined {
  if (action.id === 'view_draft') return 'primary';
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
  };
}

export function createLiveSlackAdapter(botToken: string, fetchImpl: typeof fetch = fetch): SlackAdapter {
  async function slackApi(method: 'chat.postMessage' | 'chat.update', body: Record<string, unknown>) {
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
  };
}

export function resolveSlackAdapterFromEnv(): SlackAdapter {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return createTestSafeSlackAdapter();
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

