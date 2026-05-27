import { normalizeWorkdayPresenceState, type WorkdayPresenceState } from './model';
import type { RightNowMessageActionId } from './message';

export type WorkdayPresenceActionResult =
  | { ok: false; error: string }
  | { ok: true; nextState: WorkdayPresenceState };

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function applyDone(state: WorkdayPresenceState, nowIso: string): WorkdayPresenceState {
  return {
    ...state,
    blocker: null,
    snoozed_until: null,
    last_completed_step: state.next_move,
    next_move: `Write the next smallest step to move "${state.current_focus}" forward.`,
    updated_at: nowIso,
  };
}

function applyStuck(state: WorkdayPresenceState, blocker: string, nowIso: string): WorkdayPresenceState {
  return {
    ...state,
    blocker,
    snoozed_until: null,
    next_move: `Unblocker step: clarify "${blocker}" in one sentence, then take the smallest action that moves "${state.current_focus}" forward in 10 minutes.`,
    updated_at: nowIso,
  };
}

function applyBreakSmaller(state: WorkdayPresenceState, nowIso: string): WorkdayPresenceState {
  return {
    ...state,
    snoozed_until: null,
    next_move: `Break it smaller: write the smallest concrete step that moves "${state.current_focus}" forward and can be finished in 10 minutes.`,
    updated_at: nowIso,
  };
}

function applySnooze(state: WorkdayPresenceState, nowIso: string): WorkdayPresenceState {
  return {
    ...state,
    snoozed_until: new Date(Date.parse(nowIso) + 30 * 60 * 1000).toISOString(),
    waiting_on: state.waiting_on ?? 'Snoozed for 30 minutes; resurface after pause.',
    updated_at: nowIso,
  };
}

export function applyWorkdayPresenceAction(
  stateInput: unknown,
  actionId: RightNowMessageActionId,
  options: { blocker?: unknown; nowIso?: string } = {},
): WorkdayPresenceActionResult {
  const currentState = normalizeWorkdayPresenceState(stateInput);
  if (!currentState) return { ok: false, error: 'No active workday presence state' };

  if (!['done', 'stuck', 'break_smaller', 'snooze'].includes(actionId)) {
    return { ok: false, error: 'Invalid action_id' };
  }

  if (actionId === 'snooze') {
    const nowIso = options.nowIso ?? new Date().toISOString();
    return { ok: true, nextState: applySnooze(currentState, nowIso) };
  }

  const nowIso = options.nowIso ?? new Date().toISOString();
  if (actionId === 'done') {
    return { ok: true, nextState: applyDone(currentState, nowIso) };
  }

  if (actionId === 'stuck') {
    const blocker = currentState.blocker ?? clean(options.blocker);
    if (!blocker) return { ok: false, error: 'blocker is required for stuck' };
    return { ok: true, nextState: applyStuck(currentState, blocker, nowIso) };
  }

  if (actionId === 'break_smaller') {
    return { ok: true, nextState: applyBreakSmaller(currentState, nowIso) };
  }

  return { ok: false, error: 'Invalid action_id' };
}

export function appendWorkdayPresenceInteractionHistory(
  metadata: Record<string, unknown>,
  actionId: RightNowMessageActionId,
  nextState: WorkdayPresenceState,
  nowIso = new Date().toISOString(),
): Record<string, unknown> {
  const existing =
    Array.isArray(metadata.workday_presence_history)
      ? metadata.workday_presence_history
      : [];
  const nextHistory = [
    ...existing,
    {
      interaction_type: actionId,
      timestamp: nowIso,
      resulting_state: {
        next_move: nextState.next_move,
        blocker: nextState.blocker,
        waiting_on: nextState.waiting_on,
        last_completed_step: nextState.last_completed_step,
      },
    },
  ].slice(-20);

  return {
    ...metadata,
    workday_presence_state: {
      ...nextState,
      interaction_history: nextHistory,
    },
    workday_presence_history: nextHistory,
  };
}

export function applyInteractionHistoryToState(
  metadata: Record<string, unknown>,
  actionId: RightNowMessageActionId,
  nextState: WorkdayPresenceState,
  nowIso = new Date().toISOString(),
): WorkdayPresenceState {
  const nextMetadata = appendWorkdayPresenceInteractionHistory(
    metadata,
    actionId,
    nextState,
    nowIso,
  );
  const fromMetadata =
    nextMetadata.workday_presence_state &&
    typeof nextMetadata.workday_presence_state === 'object'
      ? (nextMetadata.workday_presence_state as WorkdayPresenceState)
      : nextState;
  return fromMetadata;
}

