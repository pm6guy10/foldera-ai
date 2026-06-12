import {
  buildRightNowCard,
  rightNowHasPreparedObject,
  WORKDAY_PRESENCE_INTERACTION_TYPES,
  type RightNowCard,
  type WorkdayPresenceInteractionType,
  type WorkdayPresenceState,
} from './model';

/**
 * Inbound action vocabulary. Cards render only View Draft + Dismiss; the four
 * legacy ids remain accepted so taps on previously posted Slack messages
 * still resolve instead of failing.
 */
export type RightNowMessageActionId = WorkdayPresenceInteractionType;

export const RIGHT_NOW_ACTION_IDS = WORKDAY_PRESENCE_INTERACTION_TYPES;

export type RightNowMessageAction = {
  id: RightNowMessageActionId;
  label: string;
};

export type RightNowMessagePayload = {
  kind: 'right_now';
  /**
   * 'dismissed' and 'silent' exist only on this Slack message layer — the
   * dashboard card union (RightNowCard) stays setup|active so other surfaces are
   * unaffected. 'silent' is SAFE_SILENCE: a selected move with no prepared object
   * behind it (e.g. a scored winner with no draft) stays quiet instead of
   * rendering a winner-backed homework card.
   */
  mode: RightNowCard['mode'] | 'dismissed' | 'silent';
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
  if (card.mode === 'setup') {
    return [card.prompt, card.verdict_line].filter(Boolean).join('\n');
  }

  const lines: string[] = [
    card.heading,
    card.return_here,
    card.next_move,
    card.why_this_matters,
    ...(card.verdict_line ? [card.verdict_line] : []),
    formatSourceTrail(state),
  ];
  if (card.draft_expanded) {
    lines.push('--- Draft ---', card.draft_expanded, '--- End draft ---');
  } else if (card.draft_ready) {
    lines.push(card.draft_ready);
  }
  if (card.last_interaction) lines.push(card.last_interaction);
  if (card.do_not_touch) lines.push(card.do_not_touch);
  lines.push(card.stop_when_done);
  return lines.join('\n');
}

function cardActions(
  card: RightNowCard,
  state: WorkdayPresenceState | null,
): RightNowMessageAction[] {
  // Setup prompt and dismissed cards take no further button input.
  if (card.mode !== 'active') return [];
  const actions: RightNowMessageAction[] = [];
  if (state?.draft) actions.push({ id: 'view_draft', label: 'View Draft' });
  actions.push({ id: 'dismiss', label: 'Dismiss' });
  return actions;
}

export function buildRightNowMessagePayload(state: WorkdayPresenceState | null): RightNowMessagePayload {
  const lastInteraction = state?.interaction_history[state.interaction_history.length - 1] ?? null;
  if (state && lastInteraction?.interaction_type === 'dismiss') {
    return {
      kind: 'right_now',
      mode: 'dismissed',
      text: 'Dismissed. Staying quiet until something new matters.',
      actions: [],
    };
  }

  // Acceptance standard: a selected move with no prepared object behind it (a
  // scored winner with no draft) is winner-backed homework. Stay SAFE_SILENT —
  // no card, no buttons — until the brain produces a reviewable object.
  if (state && !rightNowHasPreparedObject(state)) {
    return {
      kind: 'right_now',
      mode: 'silent',
      text: 'Nothing prepared to act on yet — staying quiet until there is a reviewable move.',
      actions: [],
    };
  }

  const card = buildRightNowCard(state);

  return {
    kind: 'right_now',
    mode: card.mode,
    text: formatCardText(card, state),
    actions: cardActions(card, state),
  };
}
