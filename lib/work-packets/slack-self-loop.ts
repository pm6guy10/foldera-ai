type SlackBlockKitSectionBlock = {
  type: 'section';
  text: {
    type: 'mrkdwn';
    text: string;
  };
};

type SlackBlockKitActionsBlock = {
  type: 'actions';
  block_id: 'foldera_self_loop_actions';
  elements: Array<{
    type: 'button';
    action_id: 'done' | 'stuck' | 'break_smaller' | 'snooze';
    value: string;
    text: {
      type: 'plain_text';
      text: string;
    };
    style?: 'primary' | 'danger';
  }>;
};

type SlackSelfLoopBlockKit = SlackBlockKitSectionBlock | SlackBlockKitActionsBlock;

type SlackSelfLoopSourceEvent = {
  type?: string;
  channel?: { id?: string };
  message?: { ts?: string };
  user?: { id?: string };
  text?: string;
  actionable_intervention?: boolean;
  next_move?: string;
  user_tokens?: unknown;
};

export type SlackSelfLoopWorkPacket = {
  mode: 'NO_OP' | 'INTERVENTION';
  next_move: string | null;
  slack: {
    channel: string;
    blocks: SlackSelfLoopBlockKit[];
  } | null;
};

function buildSlackBlockKit(nextMove: string): SlackSelfLoopBlockKit[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Foldera Right Now*\n${nextMove}`,
      },
    },
    {
      type: 'actions',
      block_id: 'foldera_self_loop_actions',
      elements: [
        {
          type: 'button',
          action_id: 'done',
          value: 'done',
          text: {
            type: 'plain_text',
            text: 'Done',
          },
          style: 'primary',
        },
        {
          type: 'button',
          action_id: 'stuck',
          value: 'stuck',
          text: {
            type: 'plain_text',
            text: 'Stuck',
          },
          style: 'danger',
        },
        {
          type: 'button',
          action_id: 'break_smaller',
          value: 'break_smaller',
          text: {
            type: 'plain_text',
            text: 'Break smaller',
          },
        },
        {
          type: 'button',
          action_id: 'snooze',
          value: 'snooze',
          text: {
            type: 'plain_text',
            text: 'Snooze',
          },
        },
      ],
    },
  ];
}

export function deriveSlackSelfLoopWorkPacket(input: SlackSelfLoopSourceEvent): SlackSelfLoopWorkPacket {
  if (!input.actionable_intervention) {
    return {
      mode: 'NO_OP',
      next_move: null,
      slack: null,
    };
  }

  const nextMove = input.next_move?.trim() || 'One next move';
  const channel = input.channel?.id?.trim() || 'CSELF';

  return {
    mode: 'INTERVENTION',
    next_move: nextMove,
    slack: {
      channel,
      blocks: buildSlackBlockKit(nextMove),
    },
  };
}
