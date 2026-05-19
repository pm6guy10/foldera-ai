import { describe, expect, it } from 'vitest';
import { buildRightNowCard, normalizeWorkdayPresenceState } from '../model';

describe('workday presence model', () => {
  it('returns fresh setup prompt when no state exists', () => {
    const card = buildRightNowCard(null);
    expect(card.mode).toBe('setup');
    if (card.mode === 'setup') {
      expect(card.prompt).toBe('What are you trying to move forward today?');
    }
  });

  it('returns active card for saved state', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Close ACME renewal decision',
      next_move: 'Send owner confirmation note',
      why_it_matters: 'The renewal window closes at 4 PM PT.',
      state_source: 'manual_anchor',
    });
    const card = buildRightNowCard(state);
    expect(card.mode).toBe('active');
    if (card.mode === 'active') {
      expect(card.next_move).toContain('Send owner confirmation note');
    }
  });

  it('breaks next move smaller when blocker exists', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Close ACME renewal decision',
      next_move: 'Send owner confirmation note',
      why_it_matters: 'The renewal window closes at 4 PM PT.',
      blocker: 'Need legal clause confirmation',
      state_source: 'manual_anchor',
    });
    const card = buildRightNowCard(state);
    expect(card.mode).toBe('active');
    if (card.mode === 'active') {
      expect(card.next_move).toContain('Break it smaller');
    }
  });

  it('shows do-not-touch guardrail when present', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Close ACME renewal decision',
      next_move: 'Send owner confirmation note',
      why_it_matters: 'The renewal window closes at 4 PM PT.',
      do_not_touch: 'Inbox cleanup',
      state_source: 'manual_anchor',
    });
    const card = buildRightNowCard(state);
    expect(card.mode).toBe('active');
    if (card.mode === 'active') {
      expect(card.do_not_touch).toBe('Do not touch: Inbox cleanup');
    }
  });

  it('resumes from last completed step when available', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Close ACME renewal decision',
      next_move: 'Send owner confirmation note',
      why_it_matters: 'The renewal window closes at 4 PM PT.',
      last_completed_step: 'Drafted decision memo',
      state_source: 'manual_anchor',
    });
    const card = buildRightNowCard(state);
    expect(card.mode).toBe('active');
    if (card.mode === 'active') {
      expect(card.next_move).toContain('Resume from: Drafted decision memo');
    }
  });
});
