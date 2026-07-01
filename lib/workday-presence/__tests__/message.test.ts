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

  it('renders the decision-closure footer (continuity + coverage) under the draft, quietly', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Homeschool meeting with Deanne Varnum',
      next_move: 'Reply to Deanne confirming the 2 PM slot.',
      why_it_matters: 'The meeting is today; a one-line confirm closes the loop.',
      state_source: 'scored_winner',
      continuity_line: 'Still the top priority since last time.',
      coverage_line: 'Checked 11 other open loops — none outranks this right now.',
      draft: {
        action_type: 'send_message',
        title: 'Confirming 2 PM today',
        preview: 'Hi Deanne — confirming 2 PM works.',
        to: 'deanne@example.com',
        body: 'Hi Deanne — confirming 2 PM works.',
        action_id: 'act-123',
      },
    });
    const payload = buildRightNowMessagePayload(state);
    // The override-killers ride as quiet italic footers, not a list/stack.
    expect(payload.text).toContain('_Still the top priority since last time._');
    expect(payload.text).toContain(
      '_Checked 11 other open loops — none outranks this right now._',
    );
    // Footer order: why → continuity → coverage, all under the body.
    const why = payload.text.indexOf('_Why now:');
    const cont = payload.text.indexOf('_Still the top priority');
    const cov = payload.text.indexOf('_Checked 11 other');
    expect(why).toBeGreaterThan(-1);
    expect(why).toBeLessThan(cont);
    expect(cont).toBeLessThan(cov);
  });

  it('conviction line replaces the bare coverage count in the closing footer slot (never both)', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Homeschool meeting with Deanne Varnum',
      next_move: 'Reply to Deanne confirming the 2 PM slot.',
      why_it_matters: 'The meeting is today; a one-line confirm closes the loop.',
      state_source: 'scored_winner',
      continuity_line: 'Still the top priority since last time.',
      coverage_line: 'Checked 11 other open loops — none outranks this right now.',
      conviction_line:
        'Ranked against "Ship Foldera and onboard the first paying customer" · beat "Renew domain autopay" (important, not today) and 9 others.',
      draft: {
        action_type: 'send_message',
        title: 'Confirming 2 PM today',
        preview: 'Hi Deanne — confirming 2 PM works.',
        to: 'deanne@example.com',
        body: 'Hi Deanne — confirming 2 PM works.',
        action_id: 'act-123',
      },
    });
    const payload = buildRightNowMessagePayload(state);
    expect(payload.text).toContain(
      '_Ranked against "Ship Foldera and onboard the first paying customer" · beat "Renew domain autopay" (important, not today) and 9 others._',
    );
    // Same closing slot: the bare count does not stack under the conviction line.
    expect(payload.text).not.toContain('_Checked 11 other open loops');
    // Footer order holds: why → continuity → conviction.
    const why = payload.text.indexOf('_Why now:');
    const cont = payload.text.indexOf('_Still the top priority');
    const conviction = payload.text.indexOf('_Ranked against');
    expect(why).toBeGreaterThan(-1);
    expect(why).toBeLessThan(cont);
    expect(cont).toBeLessThan(conviction);
  });

  it('omits the closure footer entirely when no coverage/continuity was computed (back-compat)', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Owed reply to Sarah',
      next_move: 'Reply to Sarah.',
      why_it_matters: 'She is waiting.',
      state_source: 'scored_winner',
      draft: {
        action_type: 'send_message',
        title: 'Re: numbers',
        preview: 'Hi Sarah — confirming the numbers look right.',
        to: 'sarah@example.com',
        body: 'Hi Sarah — confirming the numbers look right.',
        action_id: 'act-9',
      },
    });
    const payload = buildRightNowMessagePayload(state);
    expect(payload.text).toContain('_Why now: She is waiting._');
    expect(payload.text).not.toContain('Checked ');
    expect(payload.text).not.toContain('top priority since');
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

  it('renders a write_document acquisition draft as the finished act (pick + link inline), not homework', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Birthday gift for Nathaniel',
      next_move: 'Order the gift before the party.',
      why_it_matters: "Nathaniel's birthday is 2026-07-04.",
      state_source: 'scored_winner',
      draft: {
        action_type: 'write_document',
        title: 'Ready to order for Nathaniel',
        preview: 'LEGO Botanicals Orchid (set 10311), $49.99.',
        body: [
          'THE PICK',
          'LEGO Botanicals Orchid (set 10311), $49.99.',
          '',
          'Order it here: https://www.lego.com/en-us/product/orchid-10311',
          '',
          'NEXT PHYSICAL STEP: open the link above and place the order before 2026-07-04.',
        ].join('\n'),
      },
    });
    const payload = buildRightNowMessagePayload(state);
    expect(payload.mode).toBe('active');
    // The finished object leads the card: title headline + the real link inline.
    expect(payload.text).toContain('*Ready to order for Nathaniel*');
    expect(payload.text).toContain('https://www.lego.com/en-us/product/orchid-10311');
    // No send button (nothing to send) and no homework scaffolding.
    expect(payload.actions.map((a) => a.id)).toEqual(['dismiss']);
    expect(payload.text).not.toContain('Next move:');
    expect(payload.text).not.toContain('Draft ready (');
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
