export type WorkdayPresenceSourceTrailEntry = {
  table: 'tkg_signals' | 'tkg_commitments' | 'tkg_actions';
  source: string;
  type: string;
  source_id?: string;
  row_id?: string;
  occurred_at?: string;
  ingested_at?: string;
  redacted_summary: string;
  selection_reason: string;
};

/**
 * The finished work product the brain drafted for this move. Present when the
 * state was seeded from a real generated directive (state_source='scored_winner')
 * and the generator produced a reviewable artifact. This is what "View Draft" opens.
 */
export type WorkdayPresenceDraft = {
  /** send_message | write_document | make_decision | ... */
  action_type: string;
  /** Email subject, document title, or decision frame headline. */
  title: string;
  /** Short snippet of the artifact body/content — enough to recognize the draft. */
  preview: string;
  /** Email recipient when the draft is a message. */
  to?: string;
  /** Full draft body (capped) — what "View Draft" expands in place. */
  body?: string;
};

/**
 * Card interaction vocabulary. `view_draft` and `dismiss` are the current
 * two-button contract; the other four are legacy ids kept so taps on old
 * Slack messages still resolve instead of 400ing.
 */
export type WorkdayPresenceInteractionType =
  | 'view_draft'
  | 'dismiss'
  | 'done'
  | 'stuck'
  | 'break_smaller'
  | 'snooze';

export const WORKDAY_PRESENCE_INTERACTION_TYPES: readonly WorkdayPresenceInteractionType[] = [
  'view_draft',
  'dismiss',
  'done',
  'stuck',
  'break_smaller',
  'snooze',
];

export type WorkdayPresenceState = {
  current_focus: string;
  next_move: string;
  why_it_matters: string;
  blocker: string | null;
  do_not_touch: string | null;
  waiting_on: string | null;
  last_completed_step: string | null;
  state_source: string;
  source_trail: WorkdayPresenceSourceTrailEntry[];
  /** The drafted artifact behind this move, if the brain produced one. */
  draft?: WorkdayPresenceDraft | null;
  snoozed_until: string | null;
  interaction_history: Array<{
    interaction_type: WorkdayPresenceInteractionType;
    timestamp: string;
    resulting_state: {
      next_move: string;
      blocker: string | null;
      waiting_on: string | null;
      last_completed_step: string | null;
    };
  }>;
  created_at: string;
  updated_at: string;
};

export type RightNowCard =
  | {
      mode: 'setup';
      prompt: 'What are you trying to move forward today?';
    }
  | {
      mode: 'dismissed';
      text: string;
    }
  | {
      mode: 'active';
      heading: 'Right now.';
      return_here: string;
      next_move: string;
      why_this_matters: string;
      do_not_touch: string | null;
      stop_when_done: string;
      last_interaction: string | null;
      /** Rendered when the brain drafted a reviewable artifact for this move. */
      draft_ready: string | null;
      /** Full draft (To/Subject/body) — set after a view_draft tap expands the card. */
      draft_expanded: string | null;
    };

export type WorkdayPresenceDraftInput = {
  prompt: string;
  next_move?: string;
  why_it_matters?: string;
  blocker?: string;
  do_not_touch?: string;
  waiting_on?: string;
  last_completed_step?: string;
};

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSourceTrail(input: unknown): WorkdayPresenceSourceTrailEntry[] {
  if (!Array.isArray(input)) return [];
  const normalized: WorkdayPresenceSourceTrailEntry[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const table = clean(item.table);
    const source = clean(item.source);
    const type = clean(item.type);
    const redactedSummary = clean(item.redacted_summary);
    const selectionReason = clean(item.selection_reason);
    if (
      !table ||
      !['tkg_signals', 'tkg_commitments', 'tkg_actions'].includes(table) ||
      !source ||
      !type ||
      !redactedSummary ||
      !selectionReason
    ) {
      continue;
    }
    normalized.push({
      table: table as WorkdayPresenceSourceTrailEntry['table'],
      source,
      type,
      source_id: clean(item.source_id) ?? undefined,
      row_id: clean(item.row_id) ?? undefined,
      occurred_at: clean(item.occurred_at) ?? undefined,
      ingested_at: clean(item.ingested_at) ?? undefined,
      redacted_summary: redactedSummary,
      selection_reason: selectionReason,
    });
    if (normalized.length === 5) break;
  }
  return normalized;
}

function normalizeDraft(input: unknown): WorkdayPresenceDraft | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const actionType = clean(row.action_type);
  const title = clean(row.title);
  const preview = clean(row.preview);
  if (!actionType && !title && !preview) return null;
  const to = clean(row.to);
  const body = clean(row.body);
  return {
    action_type: actionType ?? 'unknown',
    title: title ?? 'Draft',
    preview: preview ?? '',
    ...(to ? { to } : {}),
    ...(body ? { body } : {}),
  };
}

export function normalizeWorkdayPresenceState(input: unknown): WorkdayPresenceState | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const currentFocus = clean(row.current_focus);
  const nextMove = clean(row.next_move);
  const whyItMatters = clean(row.why_it_matters);
  if (!currentFocus || !nextMove || !whyItMatters) return null;
  const draft = normalizeDraft(row.draft);

  const nowIso = new Date().toISOString();
  return {
    current_focus: currentFocus,
    next_move: nextMove,
    why_it_matters: whyItMatters,
    blocker: clean(row.blocker),
    do_not_touch: clean(row.do_not_touch),
    waiting_on: clean(row.waiting_on),
    last_completed_step: clean(row.last_completed_step),
    state_source: clean(row.state_source) ?? 'manual_anchor',
    source_trail: normalizeSourceTrail(row.source_trail),
    ...(draft ? { draft } : {}),
    snoozed_until: clean(row.snoozed_until),
    interaction_history: Array.isArray(row.interaction_history)
      ? row.interaction_history
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const item = entry as Record<string, unknown>;
            const interactionType = clean(item.interaction_type);
            const timestamp = clean(item.timestamp);
            const resultingState =
              item.resulting_state && typeof item.resulting_state === 'object'
                ? (item.resulting_state as Record<string, unknown>)
                : null;
            if (
              !interactionType ||
              !timestamp ||
              !resultingState ||
              !(WORKDAY_PRESENCE_INTERACTION_TYPES as readonly string[]).includes(interactionType)
            ) {
              return null;
            }
            return {
              interaction_type: interactionType as WorkdayPresenceInteractionType,
              timestamp,
              resulting_state: {
                next_move: clean(resultingState.next_move) ?? '',
                blocker: clean(resultingState.blocker),
                waiting_on: clean(resultingState.waiting_on),
                last_completed_step: clean(resultingState.last_completed_step),
              },
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
          .slice(-20)
      : [],
    created_at: clean(row.created_at) ?? nowIso,
    updated_at: clean(row.updated_at) ?? nowIso,
  };
}

export function buildRightNowCard(state: WorkdayPresenceState | null): RightNowCard {
  if (!state) {
    return {
      mode: 'setup',
      prompt: 'What are you trying to move forward today?',
    };
  }

  const lastInteraction = state.interaction_history[state.interaction_history.length - 1] ?? null;
  if (lastInteraction?.interaction_type === 'dismiss') {
    return {
      mode: 'dismissed',
      text: 'Dismissed. Staying quiet until something new matters.',
    };
  }

  const resumedMove = state.last_completed_step
    ? `Resume from: ${state.last_completed_step}. Then ${state.next_move}`
    : state.next_move;
  const blockedMove = state.blocker
    ? `Blocked by "${state.blocker}". Break it smaller: ${resumedMove}`
    : resumedMove;
  const stopWhenDone = state.waiting_on
    ? `Stop when this is done: ${state.waiting_on}`
    : `Stop when this is done: ${state.current_focus} moved forward.`;
  const draftExpanded =
    state.draft && lastInteraction?.interaction_type === 'view_draft'
      ? [
          state.draft.to ? `To: ${state.draft.to}` : null,
          `Subject: ${state.draft.title}`,
          state.draft.body || state.draft.preview,
        ]
          .filter(Boolean)
          .join('\n')
      : null;

  return {
    mode: 'active',
    heading: 'Right now.',
    return_here: `Return here: ${state.current_focus}`,
    next_move: `Next move: ${blockedMove}`,
    why_this_matters: `Why this matters: ${state.why_it_matters}`,
    do_not_touch: state.do_not_touch ? `Do not touch: ${state.do_not_touch}` : null,
    stop_when_done: stopWhenDone,
    last_interaction: lastInteraction
      ? `Last interaction: ${lastInteraction.interaction_type} at ${lastInteraction.timestamp}`
      : null,
    draft_ready: state.draft
      ? `Draft ready (${state.draft.action_type}): ${state.draft.title}`
      : null,
    draft_expanded: draftExpanded,
  };
}

export function buildStateFromPrompt(
  input: WorkdayPresenceDraftInput,
  nowIso = new Date().toISOString(),
): WorkdayPresenceState {
  const currentFocus = input.prompt.trim();
  const nextMove =
    clean(input.next_move) ??
    `Write the smallest concrete step that moves "${currentFocus}" forward in the next 25 minutes.`;
  const whyItMatters =
    clean(input.why_it_matters) ??
    `Moving "${currentFocus}" forward now prevents drift and keeps your workday outcome on track.`;

  return {
    current_focus: currentFocus,
    next_move: nextMove,
    why_it_matters: whyItMatters,
    blocker: clean(input.blocker),
    do_not_touch: clean(input.do_not_touch),
    waiting_on: clean(input.waiting_on),
    last_completed_step: clean(input.last_completed_step),
    state_source: 'manual_anchor',
    source_trail: [],
    draft: null,
    snoozed_until: null,
    interaction_history: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
}
