import type { RightNowMessagePayload } from './message';
import { buildRightNowMessagePayload } from './message';
import type { WorkdayPresenceState } from './model';

export type WorkdayPresenceTriggerType =
  | 'morning_anchor'
  | 'pre_meeting'
  | 'end_of_day'
  | 'waiting_on_changed'
  | 'mention_reply_needed';

export type PreMeetingTriggerContext = {
  event: {
    title: string;
    starts_at_iso: string;
    requires_prep: boolean;
    prep_move?: string;
  };
};

export type WaitingOnChangedTriggerContext = {
  changed: {
    thread_id: string;
    summary: string;
  };
};

export type MentionReplyNeededTriggerContext = {
  signal: {
    source: 'slack' | 'email';
    thread_id: string;
    summary: string;
    reply_needed: boolean;
  };
};

export type WorkdayPresenceTriggerContext =
  | { trigger_type: 'morning_anchor' }
  | ({ trigger_type: 'pre_meeting' } & PreMeetingTriggerContext)
  | { trigger_type: 'end_of_day' }
  | ({ trigger_type: 'waiting_on_changed' } & WaitingOnChangedTriggerContext)
  | ({ trigger_type: 'mention_reply_needed' } & MentionReplyNeededTriggerContext);

export type WorkdayPresenceTriggerResult =
  | {
      kind: 'workday_presence_trigger_result';
      trigger_type: WorkdayPresenceTriggerType;
      outcome: 'quiet';
      reason: string;
    }
  | {
      kind: 'workday_presence_trigger_result';
      trigger_type: WorkdayPresenceTriggerType;
      outcome: 'intervention';
      reason: string;
      payload: RightNowMessagePayload;
    };

function quiet(
  triggerType: WorkdayPresenceTriggerType,
  reason: string,
): WorkdayPresenceTriggerResult {
  return {
    kind: 'workday_presence_trigger_result',
    trigger_type: triggerType,
    outcome: 'quiet',
    reason,
  };
}

function intervention(
  triggerType: WorkdayPresenceTriggerType,
  reason: string,
  payload: RightNowMessagePayload,
): WorkdayPresenceTriggerResult {
  return {
    kind: 'workday_presence_trigger_result',
    trigger_type: triggerType,
    outcome: 'intervention',
    reason,
    payload,
  };
}

function withOverrideMove(
  state: WorkdayPresenceState,
  overrideNextMove: string,
): WorkdayPresenceState {
  return {
    ...state,
    next_move: overrideNextMove,
  };
}

export function evaluateWorkdayPresenceTrigger(
  context: WorkdayPresenceTriggerContext,
  state: WorkdayPresenceState | null,
): WorkdayPresenceTriggerResult {
  if (context.trigger_type === 'morning_anchor') {
    if (!state) return quiet('morning_anchor', 'quiet: no saved state');
    return intervention(
      'morning_anchor',
      'morning_anchor: re-entry from saved workday state',
      buildRightNowMessagePayload(state),
    );
  }

  if (context.trigger_type === 'pre_meeting') {
    if (!state) return quiet('pre_meeting', 'quiet: no saved state');
    if (!context.event.requires_prep) {
      return quiet('pre_meeting', 'quiet: no useful prep needed for this event');
    }
    const basePrepMove =
      (typeof context.event.prep_move === 'string' ? context.event.prep_move.trim() : '') ||
      'Write the single smallest move that makes you ready 10 minutes before it starts.';
    const prepMove = `Prep for "${context.event.title}": ${basePrepMove}`;
    const prepState = withOverrideMove(state, prepMove);
    return intervention(
      'pre_meeting',
      `pre_meeting: prep before "${context.event.title}"`,
      buildRightNowMessagePayload(prepState),
    );
  }

  if (context.trigger_type === 'end_of_day') {
    if (!state) return quiet('end_of_day', 'quiet: no saved state');
    const restartPoint = state.last_completed_step
      ? `Tomorrow restart from: ${state.last_completed_step}`
      : `Tomorrow restart from: ${state.next_move}`;
    const carryState = withOverrideMove(
      state,
      `${restartPoint}. Then ${state.next_move}`,
    );
    return intervention(
      'end_of_day',
      'end_of_day: carry forward one restart point',
      buildRightNowMessagePayload(carryState),
    );
  }

  if (context.trigger_type === 'waiting_on_changed') {
    if (!state) return quiet('waiting_on_changed', 'quiet: no saved state');
    const waitingOnThreadId = state.waiting_on?.trim() ?? '';
    if (!waitingOnThreadId) {
      return quiet('waiting_on_changed', 'quiet: no active waiting_on thread');
    }
    if (waitingOnThreadId !== context.changed.thread_id) {
      return quiet(
        'waiting_on_changed',
        'quiet: changed signal did not affect the active waiting_on thread',
      );
    }
    const changedMove = `Waiting-on changed: ${context.changed.summary}. Next move: ${state.next_move}`;
    const changedState = withOverrideMove(state, changedMove);
    return intervention(
      'waiting_on_changed',
      'waiting_on_changed: changed signal affects active thread',
      buildRightNowMessagePayload(changedState),
    );
  }

  if (context.trigger_type === 'mention_reply_needed') {
    if (!state) return quiet('mention_reply_needed', 'quiet: no saved state');
    if (!context.signal.reply_needed) {
      return quiet('mention_reply_needed', 'quiet: signal does not require a reply');
    }
    const waitingOnThreadId = state.waiting_on?.trim() ?? '';
    if (!waitingOnThreadId) {
      return quiet('mention_reply_needed', 'quiet: no active waiting_on thread');
    }
    if (waitingOnThreadId !== context.signal.thread_id) {
      return quiet(
        'mention_reply_needed',
        'quiet: signal did not affect the active waiting_on thread',
      );
    }
    const replyMove = `Reply needed (${context.signal.source}): ${context.signal.summary}. Next move: ${state.next_move}`;
    const replyState = withOverrideMove(state, replyMove);
    return intervention(
      'mention_reply_needed',
      'mention_reply_needed: reply-needed signal affects active thread',
      buildRightNowMessagePayload(replyState),
    );
  }

  // Exhaustive guard for future trigger types.
  const _exhaustiveCheck: never = context;
  void _exhaustiveCheck;
  return quiet('morning_anchor', 'quiet: unrecognized trigger type');
}
