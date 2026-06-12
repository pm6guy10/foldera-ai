import { describe, expect, it } from 'vitest';
import { buildRightNowMessagePayload } from '@/lib/workday-presence/message';
import { buildSlackTestModeRightNowMessage } from '@/lib/slack-test-mode/right-now';
import { normalizeWorkdayPresenceState } from '@/lib/workday-presence/model';

const BANNED_PATTERNS: RegExp[] = [
  /\bdo_nothing\b/i,
  /\btask list\b/i,
  /\binbox summary\b/i,
  /\bdashboard dump\b/i,
  // Scorer / homework jargon: a card must show a prepared move, never the scoring
  // reasoning behind why it was selected.
  /\bmatched goal\b/i,
  /\bscore:\s*\d/i,
  /\bsmallest (next|concrete) step\b/i,
  /\bwrite the next step\b/i,
  /\bscored winner\b/i,
];

function assertNoBannedText(label: string, text: string): void {
  for (const pattern of BANNED_PATTERNS) {
    expect({ label, text, pattern: String(pattern) }).not.toMatchObject(expect.objectContaining({ text: expect.stringMatching(pattern) }));
  }
}

describe('Right Now surfaces: ban fake/quiet artifacts', () => {
  it('never emits banned artifacts in Right Now payload text', () => {
    const payload = buildRightNowMessagePayload(null);
    assertNoBannedText('right_now.payload.text', payload.text);
    // Setup prompt takes typed input, not buttons.
    expect(payload.actions).toEqual([]);
  });

  it('never emits banned artifacts in Slack test-mode message blocks', () => {
    const payload = buildRightNowMessagePayload(null);
    const slack = buildSlackTestModeRightNowMessage(payload);
    for (const block of slack.blocks) {
      if (block.type === 'section') assertNoBannedText('slack.section', block.text.text);
    }
  });

  it('keeps scorer jargon out of the card for both winner-only and artifact-backed candidates', () => {
    // Winner-only: scored, but nothing prepared. The card stays SAFE_SILENT.
    const winnerOnly = normalizeWorkdayPresenceState({
      current_focus: 'Project update to be sent by end of day Tuesday',
      next_move: 'Review and take the smallest next step: Project update to be sent by end of day Tuesday',
      why_it_matters: 'Matched goal: "Close open commitments". Score: 2.86.',
      state_source: 'scored_winner',
    });
    const silent = buildRightNowMessagePayload(winnerOnly);
    expect(silent.mode).toBe('silent');
    assertNoBannedText('winner_only.silent.text', silent.text);

    // Artifact-backed: the real move renders, never the scoring reasoning.
    const artifactBacked = normalizeWorkdayPresenceState({
      current_focus: 'Project update to be sent by end of day Tuesday',
      next_move: 'Send the project update to the team before end of day Tuesday.',
      why_it_matters: 'You promised this update for end of day Tuesday.',
      state_source: 'scored_winner',
      draft: {
        action_type: 'send_message',
        title: 'Project update — EOD Tuesday',
        preview: 'Here is the project update I committed to.',
      },
    });
    const active = buildRightNowMessagePayload(artifactBacked);
    expect(active.mode).toBe('active');
    assertNoBannedText('artifact_backed.active.text', active.text);
  });
});

