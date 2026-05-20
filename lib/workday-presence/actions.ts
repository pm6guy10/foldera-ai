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
    last_completed_step: state.next_move,
    next_move: `Write the next smallest step to move "${state.current_focus}" forward.`,
    updated_at: nowIso,
  };
}

function applyStuck(state: WorkdayPresenceState, blocker: string, nowIso: string): WorkdayPresenceState {
  return {
    ...state,
    blocker,
    updated_at: nowIso,
  };
}

function applyBreakSmaller(state: WorkdayPresenceState, nowIso: string): WorkdayPresenceState {
  return {
    ...state,
    next_move: `Break it smaller: write the smallest concrete step that moves "${state.current_focus}" forward and can be finished in 10 minutes.`,
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
    return { ok: true, nextState: currentState };
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

