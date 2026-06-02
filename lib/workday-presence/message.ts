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

function formatSourceTrail(state: WorkdayPresenceState | null): string {
  if (!state?.source_trail.length) return `Source trail: ${state?.state_source ?? 'manual_anchor'}`;
  const trail = state.source_trail
    .map((entry) => {
      const id = entry.source_id ?? entry.row_id ?? 'stored_row';
      const at = entry.occurred_at ?? entry.ingested_at ?? 'time_unknown';
      return `${entry.table}/${entry.source}/${entry.type} ${id} at ${at}: ${entry.redacted_summary} (${entry.selection_reason})`;
    })
    .join(' | ');
  return `Source trail: ${trail}`;
}

function formatCardText(card: RightNowCard, state: WorkdayPresenceState | null): string {
  if (card.mode === 'setup') return card.prompt;

  const lines: string[] = [
    card.heading,
    card.return_here,
    card.next_move,
    card.why_this_matters,
    formatSourceTrail(state),
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
    text: formatCardText(card, state),
    actions: [
      { id: 'done', label: 'Done' },
      { id: 'stuck', label: 'Stuck' },
      { id: 'break_smaller', label: 'Break smaller' },
      { id: 'snooze', label: 'Snooze' },
    ],
  };
}

