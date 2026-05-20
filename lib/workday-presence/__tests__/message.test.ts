import { describe, expect, it } from 'vitest';
import { buildRightNowMessagePayload } from '../message';
import { normalizeWorkdayPresenceState } from '../model';

describe('workday presence message payload', () => {
  it('builds a compact setup message payload when no state exists', () => {
    const payload = buildRightNowMessagePayload(null);
    expect(payload.kind).toBe('right_now');
    expect(payload.mode).toBe('setup');
    expect(payload.text).toContain('What are you trying to move forward today?');
    expect(payload.actions.map((a) => a.id)).toEqual(['done', 'stuck', 'break_smaller', 'snooze']);
  });

  it('builds a compact active message payload when state exists', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Close ACME renewal decision',
      next_move: 'Send owner confirmation note',
      why_it_matters: 'The renewal window closes at 4 PM PT.',
      state_source: 'manual_anchor',
    });
    const payload = buildRightNowMessagePayload(state);
    expect(payload.mode).toBe('active');
    expect(payload.text).toContain('Right now.');
    expect(payload.text).toContain('Return here: Close ACME renewal decision');
    expect(payload.text).toContain('Send owner confirmation note');
  });
});

