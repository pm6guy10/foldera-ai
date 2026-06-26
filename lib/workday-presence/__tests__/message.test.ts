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

  it('leads with the draft inline (the card IS the draft) — no homework scaffolding', () => {
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
        action_id: 'act-123',
      },
    });
    const payload = buildRightNowMessagePayload(state);
    // Approve & Send is offered (send_message backed by a real action_id); no View Draft.
    expect(payload.actions.map((a) => a.id)).toEqual(['review_send', 'dismiss']);
    expect(payload.actions.map((a) => a.label)).toEqual(['Approve & Send', 'Dismiss']);
    // The ready-to-send body and recipient are inline by default — no tap required.
    expect(payload.text).toContain('*Confirming 2 PM today*');
    expect(payload.text).toContain('To: deanne@example.com');
    expect(payload.text).toContain('Curriculum outline attached');
    // No homework framing on the draft card.
    expect(payload.text).not.toContain('Draft ready (');
    expect(payload.text).not.toContain('Next move:');
    expect(payload.text).not.toContain('Return here:');
    expect(payload.text).not.toContain('Source trail:');
    // One quiet why footer survives.
    expect(payload.text).toContain('_Why now: The meeting is today; a one-line confirm closes the loop._');
  });

  it('offers only Dismiss (no send button) when the draft has no persisted action_id', () => {
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
    });
    const payload = buildRightNowMessagePayload(state);
    // No action_id → nothing safe to execute → review-only, still draft-led inline.
    expect(payload.actions.map((a) => a.id)).toEqual(['dismiss']);
    expect(payload.text).toContain('Curriculum outline attached');
  });

  it('falls back to "Reply to <recipient>" headline when the draft has no subject', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Owed reply to Sarah',
      next_move: 'Reply to Sarah.',
      why_it_matters: 'She is waiting.',
      state_source: 'scored_winner',
      draft: {
        action_type: 'send_message',
        title: '',
        preview: 'Hi Sarah — confirming the numbers look right.',
        to: 'sarah@example.com',
        body: 'Hi Sarah — confirming the numbers look right.',
        action_id: 'act-456',
      },
    });
    const payload = buildRightNowMessagePayload(state);
    expect(payload.text).toContain('*Reply to sarah@example.com*');
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
