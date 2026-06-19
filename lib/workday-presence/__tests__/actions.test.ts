import { describe, expect, it } from 'vitest';
import {
  appendWorkdayPresenceInteractionHistory,
  applyWorkdayPresenceAction,
} from '../actions';

const baseState = {
  current_focus: 'Close ACME renewal decision',
  next_move: 'Send owner confirmation note',
  why_it_matters: 'The renewal window closes at 4 PM PT.',
  blocker: null,
  do_not_touch: null,
  waiting_on: null,
  last_completed_step: null,
  state_source: 'manual_anchor',
  source_trail: [],
  snoozed_until: null,
  interaction_history: [],
  created_at: '2026-05-20T12:00:00.000Z',
  updated_at: '2026-05-20T12:10:00.000Z',
};

describe('workday presence actions', () => {
  it('stuck generates an unblocker-style next move', () => {
    const result = applyWorkdayPresenceAction(baseState, 'stuck', {
      blocker: 'Need legal clause confirmation',
      nowIso: '2026-05-20T12:30:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextState.next_move).toContain('Unblocker step');
    expect(result.nextState.blocker).toBe('Need legal clause confirmation');
  });

  it('snooze sets a temporary snoozed_until timestamp', () => {
    const result = applyWorkdayPresenceAction(baseState, 'snooze', {
      nowIso: '2026-05-20T12:30:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextState.snoozed_until).toBe('2026-05-20T13:00:00.000Z');
  });

  it('appends lightweight interaction history with resulting state', () => {
    const metadata = appendWorkdayPresenceInteractionHistory(
      { workday_presence_state: baseState },
      'done',
      { ...baseState, last_completed_step: 'Send owner confirmation note' },
      '2026-05-20T12:45:00.000Z',
    );
    const history = metadata.workday_presence_history as Array<Record<string, unknown>>;
    expect(history).toHaveLength(1);
    expect(history[0]?.interaction_type).toBe('done');
    expect((history[0]?.resulting_state as Record<string, unknown>).last_completed_step).toBe(
      'Send owner confirmation note',
    );
  });
});
