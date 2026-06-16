import { describe, expect, it } from 'vitest';
import { buildRightNowMessagePayload } from '../message';
import { normalizeWorkdayPresenceState } from '../model';

describe('workday presence message payload', () => {
  it('builds a compact setup message payload with no buttons when no state exists', () => {
    const payload = buildRightNowMessagePayload(null);
    expect(payload.kind).toBe('right_now');
    expect(payload.mode).toBe('setup');
    expect(payload.text).toContain('What are you trying to move forward today?');
    expect(payload.actions).toEqual([]);
  });

  it('builds an active payload with Dismiss only when no draft exists', () => {
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
    expect(payload.text).toContain('Source trail: manual_anchor');
    expect(payload.actions.map((a) => a.id)).toEqual(['dismiss']);
  });

  it('renders View Draft + Dismiss and the draft-ready line when a draft exists', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Homeschool meeting with Deanne Varnum',
      next_move: 'Reply to Deanne confirming the 2 PM slot.',
      why_it_matters: 'The meeting is today; a one-line confirm closes the loop.',
      state_source: 'scored_winner',
      draft: {
        action_type: 'send_message',
        title: 'Confirming 2 PM today',
        preview: 'Hi Deanne — confirming 2 PM works.',
        to: 'deanne@example.com',
        body: 'Hi Deanne — confirming 2 PM works. Curriculum outline attached.',
      },
    });
    const payload = buildRightNowMessagePayload(state);
    expect(payload.actions.map((a) => a.id)).toEqual(['view_draft', 'dismiss']);
    expect(payload.actions.map((a) => a.label)).toEqual(['View Draft', 'Dismiss']);
    expect(payload.text).toContain('Draft ready (send_message): Confirming 2 PM today');
    // Collapsed by default — full body only after a view_draft tap.
    expect(payload.text).not.toContain('Curriculum outline attached');
  });

  it('expands the full draft in place after a view_draft tap', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Homeschool meeting with Deanne Varnum',
      next_move: 'Reply to Deanne confirming the 2 PM slot.',
      why_it_matters: 'The meeting is today.',
      state_source: 'scored_winner',
      draft: {
        action_type: 'send_message',
        title: 'Confirming 2 PM today',
        preview: 'Hi Deanne — confirming 2 PM works.',
        to: 'deanne@example.com',
        body: 'Hi Deanne — confirming 2 PM works. Curriculum outline attached.',
      },
      interaction_history: [
        {
          interaction_type: 'view_draft',
          timestamp: '2026-06-12T16:00:00.000Z',
          resulting_state: {
            next_move: 'Reply to Deanne confirming the 2 PM slot.',
            blocker: null,
            waiting_on: null,
            last_completed_step: null,
          },
        },
      ],
    });
    const payload = buildRightNowMessagePayload(state);
    expect(payload.text).toContain('--- Draft ---');
    expect(payload.text).toContain('To: deanne@example.com');
    expect(payload.text).toContain('Subject: Confirming 2 PM today');
    expect(payload.text).toContain('Curriculum outline attached');
    expect(payload.actions.map((a) => a.id)).toEqual(['view_draft', 'dismiss']);
  });

  it('renders a quiet dismissed card with no buttons while the dismiss snooze is active', () => {
    // Mirrors applyDismiss: a real dismiss always sets snoozed_until (4h hold),
    // not just an interaction_history entry.
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Homeschool meeting with Deanne Varnum',
      next_move: 'Reply to Deanne confirming the 2 PM slot.',
      why_it_matters: 'The meeting is today.',
      state_source: 'scored_winner',
      snoozed_until: '2026-06-12T20:05:00.000Z',
      interaction_history: [
        {
          interaction_type: 'dismiss',
          timestamp: '2026-06-12T16:05:00.000Z',
          resulting_state: {
            next_move: 'Reply to Deanne confirming the 2 PM slot.',
            blocker: null,
            waiting_on: null,
            last_completed_step: null,
          },
        },
      ],
    });
    const payload = buildRightNowMessagePayload(state, '2026-06-12T17:00:00.000Z');
    expect(payload.mode).toBe('dismissed');
    expect(payload.text).toBe('Dismissed. Staying quiet until something new matters.');
    expect(payload.actions).toEqual([]);
  });

  it('F-dismiss (issue #354): reactivates once the dismiss snooze expires instead of staying dismissed forever', () => {
    // Same dismissed state as above, but "now" is past the 4h snooze window.
    // The Slack message layer must agree with the dashboard card (which only
    // checks snoozed_until) instead of treating "last action was dismiss" as
    // a permanent label.
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Homeschool meeting with Deanne Varnum',
      next_move: 'Reply to Deanne confirming the 2 PM slot.',
      why_it_matters: 'The meeting is today.',
      state_source: 'manual_anchor',
      snoozed_until: '2026-06-12T20:05:00.000Z',
      interaction_history: [
        {
          interaction_type: 'dismiss',
          timestamp: '2026-06-12T16:05:00.000Z',
          resulting_state: {
            next_move: 'Reply to Deanne confirming the 2 PM slot.',
            blocker: null,
            waiting_on: null,
            last_completed_step: null,
          },
        },
      ],
    });
    const payload = buildRightNowMessagePayload(state, '2026-06-12T20:10:00.000Z');
    expect(payload.mode).toBe('active');
    expect(payload.text).toContain('Right now.');
    expect(payload.actions.map((a) => a.id)).toEqual(['dismiss']);
  });
});
