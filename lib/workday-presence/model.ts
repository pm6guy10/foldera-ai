export type WorkdayPresenceState = {
  current_focus: string;
  next_move: string;
  why_it_matters: string;
  blocker: string | null;
  do_not_touch: string | null;
  waiting_on: string | null;
  last_completed_step: string | null;
  state_source: string;
  created_at: string;
  updated_at: string;
};

export type RightNowCard =
  | {
      mode: 'setup';
      prompt: 'What are you trying to move forward today?';
    }
  | {
      mode: 'active';
      heading: 'Right now.';
      return_here: string;
      next_move: string;
      why_this_matters: string;
      do_not_touch: string | null;
      stop_when_done: string;
    };

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeWorkdayPresenceState(input: unknown): WorkdayPresenceState | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const currentFocus = clean(row.current_focus);
  const nextMove = clean(row.next_move);
  const whyItMatters = clean(row.why_it_matters);
  if (!currentFocus || !nextMove || !whyItMatters) return null;

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

  const resumedMove = state.last_completed_step
    ? `Resume from: ${state.last_completed_step}. Then ${state.next_move}`
    : state.next_move;
  const blockedMove = state.blocker
    ? `Blocked by "${state.blocker}". Break it smaller: ${resumedMove}`
    : resumedMove;
  const stopWhenDone = state.waiting_on
    ? `Stop when this is done: ${state.waiting_on}`
    : `Stop when this is done: ${state.current_focus} moved forward.`;

  return {
    mode: 'active',
    heading: 'Right now.',
    return_here: `Return here: ${state.current_focus}`,
    next_move: `Next move: ${blockedMove}`,
    why_this_matters: `Why this matters: ${state.why_it_matters}`,
    do_not_touch: state.do_not_touch ? `Do not touch: ${state.do_not_touch}` : null,
    stop_when_done: stopWhenDone,
  };
}
