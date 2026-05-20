import { describe, expect, it } from 'vitest';
import { buildRightNowMessagePayload } from '@/lib/workday-presence/message';
import { buildSlackTestModeRightNowMessage } from '@/lib/slack-test-mode/right-now';

const BANNED_PATTERNS: RegExp[] = [
  /\bdo_nothing\b/i,
  /\btask list\b/i,
  /\binbox summary\b/i,
  /\bdashboard dump\b/i,
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
    expect(payload.actions.map((a) => a.id)).toEqual(['done', 'stuck', 'break_smaller', 'snooze']);
  });

  it('never emits banned artifacts in Slack test-mode message blocks', () => {
    const payload = buildRightNowMessagePayload(null);
    const slack = buildSlackTestModeRightNowMessage(payload);
    for (const block of slack.blocks) {
      if (block.type === 'section') assertNoBannedText('slack.section', block.text.text);
    }
  });
});

