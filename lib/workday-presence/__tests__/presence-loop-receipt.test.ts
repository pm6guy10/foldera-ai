import { describe, expect, it } from 'vitest';
import { buildPresenceLoopReceipt } from '../presence-loop-receipt';

const beforeState = {
  current_focus: 'Close ACME renewal decision',
  next_move: 'Send owner confirmation note',
  why_it_matters: 'The renewal window closes at 4 PM PT.',
  blocker: null,
  do_not_touch: 'Do not rewrite the renewal package',
  waiting_on: 'Owner confirmation sent',
  last_completed_step: null,
  state_source: 'manual_anchor',
  source_trail: [],
  snoozed_until: null,
  interaction_history: [],
  created_at: '2026-05-20T12:00:00.000Z',
  updated_at: '2026-05-20T12:10:00.000Z',
};

describe('MVP presence loop receipt', () => {
  it.each([
    ['done', undefined, 'Send owner confirmation note'],
    ['stuck', 'Need legal clause confirmation', 'Need legal clause confirmation'],
    ['break_smaller', undefined, 'Break it smaller'],
    ['snooze', undefined, '2026-05-20T13:00:00.000Z'],
  ] as const)('proves before -> card -> %s action -> after state', (actionId, blocker, expected) => {
    const receipt = buildPresenceLoopReceipt(beforeState, {
      action_id: actionId,
      blocker,
      nowIso: '2026-05-20T12:30:00.000Z',
    });

    expect(receipt.before_state).toEqual(beforeState);
    expect(receipt.card_payload.kind).toBe('right_now');
    // No draft on this state — only Dismiss renders; legacy action ids still apply.
    expect(receipt.card_payload.actions.map((action) => action.id)).toEqual(['dismiss']);
    expect(receipt.slack_test_mode.channel).toBe('test_dm');
    expect(receipt.button_action.action_id).toBe(actionId);
    expect(receipt.after_state.updated_at).toBe('2026-05-20T12:30:00.000Z');
    expect(JSON.stringify(receipt.after_state)).toContain(expected);
    expect(receipt.paid_model_call_required).toBe(false);
    expect(receipt.inline_full_state_recompute).toBe(false);
  });
});
