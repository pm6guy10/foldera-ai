import { describe, expect, it } from 'vitest';
import { normalizeWorkdayPresenceState } from '../model';
import { evaluateWorkdayPresenceTrigger } from '../triggers';

const BANNED_OUTPUT_RE = /(do_nothing|task list|inbox summary|dashboard dump)/i;

describe('workday presence trigger evaluation', () => {
  const baseState = normalizeWorkdayPresenceState({
    current_focus: 'Close ACME renewal decision',
    next_move: 'Send owner confirmation note',
    why_it_matters: 'The renewal window closes at 4 PM PT.',
    waiting_on: 'thread-123',
    last_completed_step: 'Summarize open questions for legal',
    state_source: 'manual_anchor',
    created_at: '2026-05-20T12:00:00.000Z',
    updated_at: '2026-05-20T12:10:00.000Z',
  });

  it('morning_anchor returns one Right Now intervention from saved state', () => {
    const result = evaluateWorkdayPresenceTrigger({ trigger_type: 'morning_anchor' }, baseState);
    expect(result.outcome).toBe('intervention');
    if (result.outcome === 'intervention') {
      expect(result.payload.kind).toBe('right_now');
      expect(result.reason).toMatch(/morning_anchor/i);
      expect(result.payload.text).toContain('Right now.');
      expect(result.payload.text).not.toMatch(BANNED_OUTPUT_RE);
    }
  });

  it('pre_meeting returns quiet when event context does not require prep', () => {
    const result = evaluateWorkdayPresenceTrigger(
      {
        trigger_type: 'pre_meeting',
        event: {
          title: 'Weekly staff sync',
          starts_at_iso: '2026-05-20T16:00:00.000Z',
          requires_prep: false,
        },
      },
      baseState,
    );
    expect(result.outcome).toBe('quiet');
    expect(JSON.stringify(result)).not.toMatch(BANNED_OUTPUT_RE);
  });

  it('pre_meeting returns one prep intervention when event context requires prep', () => {
    const result = evaluateWorkdayPresenceTrigger(
      {
        trigger_type: 'pre_meeting',
        event: {
          title: 'Customer renewal call',
          starts_at_iso: '2026-05-20T17:00:00.000Z',
          requires_prep: true,
          prep_move: 'Prep: open the deck and fill the 3 open questions on slide 4.',
        },
      },
      baseState,
    );
    expect(result.outcome).toBe('intervention');
    if (result.outcome === 'intervention') {
      expect(result.reason).toMatch(/pre_meeting/i);
      expect(result.payload.text).toContain('Customer renewal call');
      expect(result.payload.text).not.toMatch(BANNED_OUTPUT_RE);
    }
  });

  it('end_of_day returns one restart point carry-forward intervention', () => {
    const result = evaluateWorkdayPresenceTrigger({ trigger_type: 'end_of_day' }, baseState);
    expect(result.outcome).toBe('intervention');
    if (result.outcome === 'intervention') {
      expect(result.reason).toMatch(/end_of_day/i);
      expect(result.payload.text).toContain('Tomorrow restart from:');
      expect(result.payload.text).not.toMatch(BANNED_OUTPUT_RE);
    }
  });

  it('waiting_on_changed stays quiet when changed signal does not affect active thread', () => {
    const result = evaluateWorkdayPresenceTrigger(
      {
        trigger_type: 'waiting_on_changed',
        changed: { thread_id: 'thread-999', summary: 'Reply arrived from vendor' },
      },
      baseState,
    );
    expect(result.outcome).toBe('quiet');
    expect(JSON.stringify(result)).not.toMatch(BANNED_OUTPUT_RE);
  });

  it('waiting_on_changed returns an intervention only when it affects the active thread', () => {
    const result = evaluateWorkdayPresenceTrigger(
      {
        trigger_type: 'waiting_on_changed',
        changed: { thread_id: 'thread-123', summary: 'Owner replied: approved with changes' },
      },
      baseState,
    );
    expect(result.outcome).toBe('intervention');
    if (result.outcome === 'intervention') {
      expect(result.reason).toMatch(/waiting_on_changed/i);
      expect(result.payload.text).toContain('Waiting-on changed:');
      expect(result.payload.text).not.toMatch(BANNED_OUTPUT_RE);
    }
  });

  it('mention_reply_needed stays quiet for noisy signals (no reply needed)', () => {
    const result = evaluateWorkdayPresenceTrigger(
      {
        trigger_type: 'mention_reply_needed',
        signal: {
          source: 'slack',
          thread_id: 'thread-123',
          summary: 'Mentioned you in #general',
          reply_needed: false,
        },
      },
      baseState,
    );
    expect(result.outcome).toBe('quiet');
    expect(JSON.stringify(result)).not.toMatch(BANNED_OUTPUT_RE);
  });

  it('mention_reply_needed stays quiet when signal does not affect active waiting_on thread', () => {
    const result = evaluateWorkdayPresenceTrigger(
      {
        trigger_type: 'mention_reply_needed',
        signal: {
          source: 'email',
          thread_id: 'thread-999',
          summary: 'Need your reply on the renewal terms',
          reply_needed: true,
        },
      },
      baseState,
    );
    expect(result.outcome).toBe('quiet');
    expect(JSON.stringify(result)).not.toMatch(BANNED_OUTPUT_RE);
  });

  it('mention_reply_needed returns an intervention only when reply-needed affects active thread', () => {
    const result = evaluateWorkdayPresenceTrigger(
      {
        trigger_type: 'mention_reply_needed',
        signal: {
          source: 'email',
          thread_id: 'thread-123',
          summary: 'Legal asked: can you confirm the redlines by EOD?',
          reply_needed: true,
        },
      },
      baseState,
    );
    expect(result.outcome).toBe('intervention');
    if (result.outcome === 'intervention') {
      expect(result.reason).toMatch(/mention_reply_needed/i);
      expect(result.payload.text).toContain('Reply needed');
      expect(result.payload.text).not.toMatch(BANNED_OUTPUT_RE);
    }
  });
});

