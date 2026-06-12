import { describe, expect, it } from 'vitest';
import { buildRightNowMessagePayload } from '../message';
import {
  buildRightNowCard,
  buildStateFromPrompt,
  normalizeWorkdayPresenceState,
  rightNowHasPreparedObject,
} from '../model';

// Right Now acceptance standard: a card may render only when the selected
// opportunity has produced one reviewable prepared object (draft / prep note /
// decision packet / executable approval-dismiss action / source-review action
// with clear evidence). A scored winner alone is not enough. Without a prepared
// object the surface stays in SAFE_SILENCE instead of a homework-style card.

// A scored winner with NO drafted artifact behind it — exactly what scoring
// produces before the brain prepares anything. This must NOT render.
const winnerOnlyState = normalizeWorkdayPresenceState({
  current_focus: 'Project update to be sent by end of day Tuesday',
  next_move: 'Review and take the smallest next step: Project update to be sent by end of day Tuesday',
  why_it_matters: 'Matched goal: "Close open commitments before end of week". Score: 2.86.',
  do_not_touch: 'Do not auto-send or mutate source systems.',
  state_source: 'scored_winner',
  source_trail: [
    {
      table: 'tkg_signals',
      source: 'calendar',
      type: 'commitment',
      row_id: 'sig-commitment-1',
      redacted_summary: 'Project update due EOD Tuesday',
      selection_reason: 'source signal for scored winner',
    },
  ],
  created_at: '2026-06-11T16:00:00.000Z',
  updated_at: '2026-06-11T16:00:00.000Z',
});

// The same scored winner AFTER the brain drafted the artifact behind the move.
// next_move/why are the real generated move + grounded reason — no scorer jargon.
const artifactBackedState = normalizeWorkdayPresenceState({
  current_focus: 'Project update to be sent by end of day Tuesday',
  next_move: 'Send the project update to the team before end of day Tuesday.',
  why_it_matters: 'You promised this update for end of day Tuesday and the window closes today.',
  do_not_touch: 'Do not auto-send or mutate source systems.',
  state_source: 'scored_winner',
  source_trail: [
    {
      table: 'tkg_signals',
      source: 'calendar',
      type: 'commitment',
      row_id: 'sig-commitment-1',
      redacted_summary: 'Project update due EOD Tuesday',
      selection_reason: 'evidence grounding the generated move',
    },
  ],
  draft: {
    action_type: 'send_message',
    title: 'Project update — EOD Tuesday',
    preview: 'Here is the project update I committed to by end of day Tuesday.',
    to: 'team@example.com',
    body: 'Here is the project update I committed to by end of day Tuesday. Summary attached.',
  },
  created_at: '2026-06-11T16:00:00.000Z',
  updated_at: '2026-06-11T16:00:00.000Z',
});

// Phrases the scorer/homework layer produces that must never reach the card.
const SCORER_JARGON = /matched goal|score:\s*\d|smallest (next|concrete) step|write the next step|scored winner/i;

describe('Right Now acceptance standard: artifact-backed, not winner-backed', () => {
  it('PROOF 1: a winner-only candidate does not render a Right Now card', () => {
    expect(rightNowHasPreparedObject(winnerOnlyState)).toBe(false);

    const payload = buildRightNowMessagePayload(winnerOnlyState);
    // No active card: SAFE_SILENCE, no next-move, no buttons.
    expect(payload.mode).toBe('silent');
    expect(payload.actions).toEqual([]);
    expect(payload.text).not.toContain('Next move:');
    expect(payload.text).not.toContain('Right now.');

    // The card builder also refuses to produce an active homework card.
    expect(buildRightNowCard(winnerOnlyState).mode).toBe('setup');
  });

  it('PROOF 2: an artifact-backed candidate renders View Draft / Dismiss', () => {
    expect(rightNowHasPreparedObject(artifactBackedState)).toBe(true);

    const payload = buildRightNowMessagePayload(artifactBackedState);
    expect(payload.mode).toBe('active');
    expect(payload.actions.map((a) => a.id)).toEqual(['view_draft', 'dismiss']);
    expect(payload.actions.map((a) => a.label)).toEqual(['View Draft', 'Dismiss']);
    expect(payload.text).toContain('Draft ready (send_message): Project update — EOD Tuesday');
  });

  it('PROOF 3: no "write the next step", score, matched goal, or scorer jargon reaches the card', () => {
    // The winner-only candidate carries the jargon in its raw state...
    expect(JSON.stringify(winnerOnlyState)).toMatch(SCORER_JARGON);
    // ...but the gate keeps it out of every rendered surface.
    const silent = buildRightNowMessagePayload(winnerOnlyState);
    expect(silent.text).not.toMatch(SCORER_JARGON);

    // The artifact-backed card renders the real move, never the scorer reasoning.
    const active = buildRightNowMessagePayload(artifactBackedState);
    expect(active.text).not.toMatch(SCORER_JARGON);
    expect(active.text).toContain('Send the project update to the team before end of day Tuesday.');
  });

  it('PROOF 4: a saved manual anchor never defaults to homework wording', () => {
    const anchored = buildStateFromPrompt({
      prompt: 'Close ACME renewal decision',
    });

    expect(anchored.next_move).not.toMatch(SCORER_JARGON);
    expect(anchored.why_it_matters).not.toMatch(SCORER_JARGON);

    const card = buildRightNowCard(anchored);
    expect(card.mode).toBe('active');
    if (card.mode === 'active') {
      expect(card.next_move).not.toMatch(SCORER_JARGON);
      expect(card.why_this_matters).not.toMatch(SCORER_JARGON);
    }
  });
});
