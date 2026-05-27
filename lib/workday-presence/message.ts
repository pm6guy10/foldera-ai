import { buildRightNowCard, type RightNowCard, type WorkdayPresenceState } from './model';

export type RightNowMessageActionId = 'done' | 'stuck' | 'break_smaller' | 'snooze';

export type RightNowMessageAction = {
  id: RightNowMessageActionId;
  label: 'Done' | 'Stuck' | 'Break smaller' | 'Snooze';
};

export type RightNowMessagePayload = {
  kind: 'right_now';
  mode: RightNowCard['mode'];
  text: string;
  actions: RightNowMessageAction[];
};

function formatCardText(card: RightNowCard, stateSource: string): string {
  if (card.mode === 'setup') return card.prompt;

  const lines: string[] = [
    card.heading,
    card.return_here,
    card.next_move,
    card.why_this_matters,
    `Source trail: ${stateSource}`,
  ];
  if (card.last_interaction) lines.push(card.last_interaction);
  if (card.do_not_touch) lines.push(card.do_not_touch);
  lines.push(card.stop_when_done);
  return lines.join('\n');
}

export function buildRightNowMessagePayload(state: WorkdayPresenceState | null): RightNowMessagePayload {
  const card = buildRightNowCard(state);

  return {
    kind: 'right_now',
    mode: card.mode,
    text: formatCardText(card, state?.state_source ?? 'manual_anchor'),
    actions: [
      { id: 'done', label: 'Done' },
      { id: 'stuck', label: 'Stuck' },
      { id: 'break_smaller', label: 'Break smaller' },
      { id: 'snooze', label: 'Snooze' },
    ],
  };
}

