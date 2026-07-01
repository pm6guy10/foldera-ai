import { describe, expect, it } from 'vitest';
import { buildRightNowCard, buildStateFromPrompt, normalizeWorkdayPresenceState } from '../model';

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

  it('conviction_line survives the normalize round-trip and reaches the card', () => {
    const conviction =
      'Ranked against "Ship Foldera and onboard the first paying customer" · beat "Renew domain autopay" (important, not today) and 9 others.';
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Close ACME renewal decision',
      next_move: 'Send owner confirmation note',
      why_it_matters: 'The renewal window closes at 4 PM PT.',
      state_source: 'scored_winner',
      conviction_line: conviction,
      draft: {
        action_type: 'send_message',
        title: 'Owner confirmation note',
        preview: 'Confirming the renewal decision.',
        to: 'owner@example.com',
        body: 'Confirming the renewal decision.',
        action_id: 'act-1',
      },
    });
    // Normalize must preserve the field — every interaction re-normalizes state, so a
    // dropped field would silently vanish on the first dismiss.
    expect(state?.conviction_line).toBe(conviction);
    const card = buildRightNowCard(state);
    expect(card.mode).toBe('active');
    if (card.mode === 'active') {
      expect(card.conviction_line).toBe(conviction);
    }
  });

  it('conviction_line is null on the card when never computed', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Close ACME renewal decision',
      next_move: 'Send owner confirmation note',
      why_it_matters: 'The renewal window closes at 4 PM PT.',
      state_source: 'manual_anchor',
    });
    const card = buildRightNowCard(state);
    if (card.mode === 'active') {
      expect(card.conviction_line).toBeNull();
    }
  });

  it('supports one-prompt setup by deriving next_move and the manual-anchor re-entry reason', () => {
    const state = buildStateFromPrompt({
      prompt: 'Ship the renewal decision packet',
    }, '2026-05-19T15:00:00.000Z');

    expect(state.current_focus).toBe('Ship the renewal decision packet');
    expect(state.next_move).toContain('Ship the renewal decision packet');
    expect(state.why_it_matters).toBe(
      'Foldera will hold this as your re-entry point until connected work proves a clearer move.',
    );
    expect(state.created_at).toBe('2026-05-19T15:00:00.000Z');
    expect(state.updated_at).toBe('2026-05-19T15:00:00.000Z');
  });

  it('prefers optional detail overrides when provided', () => {
    const state = buildStateFromPrompt({
      prompt: 'Ship the renewal decision packet',
      next_move: 'Confirm owner by 2pm',
      why_it_matters: 'Client deadline is today.',
    });

    expect(state.next_move).toBe('Confirm owner by 2pm');
    expect(state.why_it_matters).toBe('Client deadline is today.');
  });
});
