import type { RightNowMessageAction, RightNowMessagePayload } from '@/lib/workday-presence/message';

export type SlackTestModeBlock =
  | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
  | { type: 'actions'; elements: Array<{ type: 'button'; text: { type: 'plain_text'; text: string }; action_id: string }> };

export type SlackTestModeMessage = {
  channel: 'test_dm';
  blocks: SlackTestModeBlock[];
};

function actionButtons(actions: RightNowMessageAction[]): SlackTestModeBlock {
  return {
    type: 'actions',
    elements: actions.map((a) => ({
      type: 'button',
      text: { type: 'plain_text', text: a.label },
      action_id: a.id,
    })),
  };
}

export function buildSlackTestModeRightNowMessage(payload: RightNowMessagePayload): SlackTestModeMessage {
  return {
    channel: 'test_dm',
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: payload.text } },
      actionButtons(payload.actions),
    ],
  };
}

