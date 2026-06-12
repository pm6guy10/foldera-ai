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
  const blocks: SlackTestModeBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: payload.text } },
  ];
  // Mirror live Slack: no actions block when the card takes no button input.
  if (payload.actions.length > 0) blocks.push(actionButtons(payload.actions));
  return {
    channel: 'test_dm',
    blocks,
  };
}

