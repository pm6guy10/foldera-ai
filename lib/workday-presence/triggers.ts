import type { RightNowMessagePayload } from './message';
import { buildRightNowMessagePayload } from './message';
import type { WorkdayPresenceState } from './model';

export type WorkdayPresenceTriggerType =
  | 'morning_anchor'
  | 'pre_meeting'
  | 'end_of_day'
  | 'waiting_on_changed'
  | 'mention_reply_needed'
  | 'blocker_cleared'
  | 'commitment_lapsing'
  | 'owed_thread_gone_cold'
  | 'timing_shift';

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

export type BlockerClearedTriggerContext = {
  cleared: {
    blocker: string;
    summary: string;
  };
};

export type CommitmentLapsingTriggerContext = {
  commitment: {
    title: string;
    due_at_iso: string;
    summary: string;
  };
};

export type OwedThreadGoneColdTriggerContext = {
  thread: {
    thread_id: string;
    summary: string;
  };
};

export type TimingShiftTriggerContext = {
  shift: {
    title: string;
    starts_at_iso: string;
    summary: string;
  };
};

export type WorkdayPresenceTriggerContext =
  | { trigger_type: 'morning_anchor' }
  | ({ trigger_type: 'pre_meeting' } & PreMeetingTriggerContext)
  | { trigger_type: 'end_of_day' }
  | ({ trigger_type: 'waiting_on_changed' } & WaitingOnChangedTriggerContext)
  | ({ trigger_type: 'mention_reply_needed' } & MentionReplyNeededTriggerContext)
  | ({ trigger_type: 'blocker_cleared' } & BlockerClearedTriggerContext)
  | ({ trigger_type: 'commitment_lapsing' } & CommitmentLapsingTriggerContext)
  | ({ trigger_type: 'owed_thread_gone_cold' } & OwedThreadGoneColdTriggerContext)
  | ({ trigger_type: 'timing_shift' } & TimingShiftTriggerContext);

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

function withStateChangeSource(
  state: WorkdayPresenceState,
  entry: WorkdayPresenceState['source_trail'][number],
  nowIso: string,
): WorkdayPresenceState {
  return {
    ...state,
    source_trail: [entry, ...state.source_trail].slice(0, 5),
    updated_at: nowIso,
  };
}

export function buildTriggeredWorkdayPresenceState(
  context: WorkdayPresenceTriggerContext,
  state: WorkdayPresenceState | null,
  nowIso = new Date().toISOString(),
): WorkdayPresenceState | null {
  if (!state) return null;

  if (context.trigger_type === 'pre_meeting') {
    if (!context.event.requires_prep) return null;
    const basePrepMove =
      (typeof context.event.prep_move === 'string' ? context.event.prep_move.trim() : '') ||
      'Write the single smallest move that makes you ready 10 minutes before it starts.';
    const prepMove = `Prep for "${context.event.title}": ${basePrepMove}`;
    return withStateChangeSource(
      withOverrideMove(state, prepMove),
      {
        table: 'tkg_signals',
        source: 'calendar',
        type: 'pre_meeting',
        source_id: context.event.starts_at_iso,
        occurred_at: context.event.starts_at_iso,
        redacted_summary: context.event.title,
        selection_reason: 'State-change trigger: meeting timing now requires a prep move.',
      },
      nowIso,
    );
  }

  if (context.trigger_type === 'end_of_day') {
    const restartPoint = state.last_completed_step
      ? `Tomorrow restart from: ${state.last_completed_step}`
      : `Tomorrow restart from: ${state.next_move}`;
    return withStateChangeSource(
      withOverrideMove(state, `${restartPoint}. Then ${state.next_move}`),
      {
        table: 'tkg_signals',
        source: 'time',
        type: 'end_of_day',
        redacted_summary: 'End-of-day carry forward',
        selection_reason: 'State-change trigger: preserve one restart point before quiet hours.',
      },
      nowIso,
    );
  }

  if (context.trigger_type === 'waiting_on_changed') {
    const waitingOnThreadId = state.waiting_on?.trim() ?? '';
    if (!waitingOnThreadId || waitingOnThreadId !== context.changed.thread_id) return null;
    return withStateChangeSource(
      withOverrideMove(
        state,
        `Waiting-on changed: ${context.changed.summary}. Next move: ${state.next_move}`,
      ),
      {
        table: 'tkg_signals',
        source: 'thread',
        type: 'waiting_on_changed',
        source_id: context.changed.thread_id,
        redacted_summary: context.changed.summary,
        selection_reason: 'State-change trigger: the active waiting-on thread materially changed.',
      },
      nowIso,
    );
  }

  if (context.trigger_type === 'mention_reply_needed') {
    if (!context.signal.reply_needed) return null;
    const waitingOnThreadId = state.waiting_on?.trim() ?? '';
    if (!waitingOnThreadId || waitingOnThreadId !== context.signal.thread_id) return null;
    return withStateChangeSource(
      withOverrideMove(
        state,
        `Reply needed (${context.signal.source}): ${context.signal.summary}. Next move: ${state.next_move}`,
      ),
      {
        table: 'tkg_signals',
        source: context.signal.source,
        type: 'reply_needed',
        source_id: context.signal.thread_id,
        redacted_summary: context.signal.summary,
        selection_reason: 'State-change trigger: the active thread now needs a reply.',
      },
      nowIso,
    );
  }

  if (context.trigger_type === 'blocker_cleared') {
    const activeBlocker = state.blocker?.trim() ?? '';
    if (!activeBlocker) return null;
    if (activeBlocker !== context.cleared.blocker.trim()) return null;
    return withStateChangeSource(
      {
        ...withOverrideMove(
          state,
          `Blocker cleared: ${context.cleared.summary}. Next move: ${state.next_move}`,
        ),
        blocker: null,
      },
      {
        table: 'tkg_signals',
        source: 'state_change',
        type: 'blocker_cleared',
        redacted_summary: context.cleared.summary,
        selection_reason: 'State-change trigger: the active blocker cleared and the move is live again.',
      },
      nowIso,
    );
  }

  if (context.trigger_type === 'commitment_lapsing') {
    return withStateChangeSource(
      withOverrideMove(
        state,
        `Commitment lapsing: ${context.commitment.summary} Next move: ${state.next_move}`,
      ),
      {
        table: 'tkg_commitments',
        source: 'commitment',
        type: 'commitment_lapsing',
        source_id: context.commitment.due_at_iso,
        occurred_at: context.commitment.due_at_iso,
        redacted_summary: context.commitment.title,
        selection_reason: 'State-change trigger: an accepted commitment is nearing lapse.',
      },
      nowIso,
    );
  }

  if (context.trigger_type === 'owed_thread_gone_cold') {
    const waitingOnThreadId = state.waiting_on?.trim() ?? '';
    if (!waitingOnThreadId || waitingOnThreadId !== context.thread.thread_id) return null;
    return withStateChangeSource(
      withOverrideMove(
        state,
        `Owed thread went cold: ${context.thread.summary}. Next move: ${state.next_move}`,
      ),
      {
        table: 'tkg_signals',
        source: 'thread',
        type: 'owed_thread_gone_cold',
        source_id: context.thread.thread_id,
        redacted_summary: context.thread.summary,
        selection_reason: 'State-change trigger: the active owed thread cooled off without the expected response.',
      },
      nowIso,
    );
  }

  if (context.trigger_type === 'timing_shift') {
    return withStateChangeSource(
      withOverrideMove(
        state,
        `Timing shift: ${context.shift.summary}. Next move: ${state.next_move}`,
      ),
      {
        table: 'tkg_signals',
        source: 'calendar',
        type: 'timing_shift',
        source_id: context.shift.starts_at_iso,
        occurred_at: context.shift.starts_at_iso,
        redacted_summary: context.shift.title,
        selection_reason: 'State-change trigger: the timing window changed and the saved move needs re-entry.',
      },
      nowIso,
    );
  }

  if (context.trigger_type === 'morning_anchor') {
    return {
      ...state,
      updated_at: nowIso,
    };
  }

  return null;
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
    const prepState = buildTriggeredWorkdayPresenceState(context, state);
    if (!prepState) return quiet('pre_meeting', 'quiet: no useful prep needed for this event');
    return intervention(
      'pre_meeting',
      `pre_meeting: prep before "${context.event.title}"`,
      buildRightNowMessagePayload(prepState),
    );
  }

  if (context.trigger_type === 'end_of_day') {
    if (!state) return quiet('end_of_day', 'quiet: no saved state');
    const carryState = buildTriggeredWorkdayPresenceState(context, state);
    if (!carryState) return quiet('end_of_day', 'quiet: no saved state');
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
    const changedState = buildTriggeredWorkdayPresenceState(context, state);
    if (!changedState) {
      return quiet(
        'waiting_on_changed',
        'quiet: changed signal did not affect the active waiting_on thread',
      );
    }
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
    const replyState = buildTriggeredWorkdayPresenceState(context, state);
    if (!replyState) {
      return quiet(
        'mention_reply_needed',
        'quiet: signal did not affect the active waiting_on thread',
      );
    }
    return intervention(
      'mention_reply_needed',
      'mention_reply_needed: reply-needed signal affects active thread',
      buildRightNowMessagePayload(replyState),
    );
  }

  if (context.trigger_type === 'blocker_cleared') {
    if (!state) return quiet('blocker_cleared', 'quiet: no saved state');
    const activeBlocker = state.blocker?.trim() ?? '';
    if (!activeBlocker) {
      return quiet('blocker_cleared', 'quiet: no active blocker to clear');
    }
    if (activeBlocker !== context.cleared.blocker.trim()) {
      return quiet('blocker_cleared', 'quiet: cleared signal did not match the active blocker');
    }
    const clearedState = buildTriggeredWorkdayPresenceState(context, state);
    if (!clearedState) {
      return quiet('blocker_cleared', 'quiet: no active blocker to clear');
    }
    return intervention(
      'blocker_cleared',
      'blocker_cleared: active blocker cleared',
      buildRightNowMessagePayload(clearedState),
    );
  }

  if (context.trigger_type === 'commitment_lapsing') {
    if (!state) return quiet('commitment_lapsing', 'quiet: no saved state');
    const lapsingState = buildTriggeredWorkdayPresenceState(context, state);
    if (!lapsingState) return quiet('commitment_lapsing', 'quiet: no saved state');
    return intervention(
      'commitment_lapsing',
      'commitment_lapsing: active commitment is nearing lapse',
      buildRightNowMessagePayload(lapsingState),
    );
  }

  if (context.trigger_type === 'owed_thread_gone_cold') {
    if (!state) return quiet('owed_thread_gone_cold', 'quiet: no saved state');
    const waitingOnThreadId = state.waiting_on?.trim() ?? '';
    if (!waitingOnThreadId) {
      return quiet('owed_thread_gone_cold', 'quiet: no active waiting_on thread');
    }
    if (waitingOnThreadId !== context.thread.thread_id) {
      return quiet(
        'owed_thread_gone_cold',
        'quiet: gone-cold signal did not affect the active waiting_on thread',
      );
    }
    const coldState = buildTriggeredWorkdayPresenceState(context, state);
    if (!coldState) {
      return quiet(
        'owed_thread_gone_cold',
        'quiet: gone-cold signal did not affect the active waiting_on thread',
      );
    }
    return intervention(
      'owed_thread_gone_cold',
      'owed_thread_gone_cold: active owed thread cooled off',
      buildRightNowMessagePayload(coldState),
    );
  }

  if (context.trigger_type === 'timing_shift') {
    if (!state) return quiet('timing_shift', 'quiet: no saved state');
    const shiftedState = buildTriggeredWorkdayPresenceState(context, state);
    if (!shiftedState) return quiet('timing_shift', 'quiet: no saved state');
    return intervention(
      'timing_shift',
      'timing_shift: relevant timing window moved',
      buildRightNowMessagePayload(shiftedState),
    );
  }

  // Exhaustive guard for future trigger types.
  const _exhaustiveCheck: never = context;
  void _exhaustiveCheck;
  return quiet('morning_anchor', 'quiet: unrecognized trigger type');
}
