import { describe, expect, it } from 'vitest';
import { shouldFallbackUnresolvedIntentSendToTriggerCanonical } from '../generator';
import type { ScoredLoop } from '../scorer';

function baseUnresolvedWinner(
  overrides: Partial<ScoredLoop> & {
    sourceSignals?: ScoredLoop['sourceSignals'];
  },
): Pick<ScoredLoop, 'type' | 'discrepancyClass' | 'discrepancyPreferredAction' | 'sourceSignals'> {
  return {
    type: 'discrepancy',
    discrepancyClass: 'unresolved_intent',
    discrepancyPreferredAction: 'send_message',
    sourceSignals: [{ kind: 'signal', id: 's1', source: 'claude_conversation', summary: 'User said they would follow up' }],
    ...overrides,
  };
}

describe('shouldFallbackUnresolvedIntentSendToTriggerCanonical', () => {
  it('is true for assistant-chat-only unresolved_intent with preferred send_message', () => {
    expect(shouldFallbackUnresolvedIntentSendToTriggerCanonical(baseUnresolvedWinner({}))).toBe(true);
  });

  it('is false when a gmail-backed signal is present on the winner', () => {
    expect(
      shouldFallbackUnresolvedIntentSendToTriggerCanonical(
        baseUnresolvedWinner({
          sourceSignals: [
            { kind: 'signal', id: 'm1', source: 'gmail', summary: 'Thread with client' },
            { kind: 'signal', id: 's1', source: 'claude_conversation', summary: 'intent' },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('is false when preferred action is not send_message', () => {
    expect(
      shouldFallbackUnresolvedIntentSendToTriggerCanonical(
        baseUnresolvedWinner({ discrepancyPreferredAction: 'make_decision' }),
      ),
    ).toBe(false);
  });

  it('is false for non-discrepancy winners', () => {
    expect(
      shouldFallbackUnresolvedIntentSendToTriggerCanonical(
        baseUnresolvedWinner({ type: 'commitment' }),
      ),
    ).toBe(false);
  });
});
