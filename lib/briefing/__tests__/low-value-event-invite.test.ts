import { describe, expect, it } from 'vitest';

import { assessLowValueEventInvite } from '../low-value-event-invite';

describe('assessLowValueEventInvite', () => {
  it('recognizes the May 9 Notion-style invite as context-smart but silently suppressible', () => {
    const result = assessLowValueEventInvite({
      title: 'Virtual event to announce new Developer Platform primitives and capabilities',
      content:
        'Join us for a virtual event to announce new Developer Platform primitives and capabilities. Save your seat for May 13.',
      suggestedActionType: 'write_document',
      matchedGoalText:
        'Build Foldera into a revenue-generating product. First paid user, then scale to replace employment income.',
      relatedSignals: ['notify@updates.notion.so sent the invite for May 13.'],
      sourceSignals: [
        {
          kind: 'signal',
          source: 'gmail',
          summary: 'Source Email: Notion Developer Platform event invite for May 13.',
          occurredAt: '2026-05-09T18:00:00.000Z',
        },
      ],
      relationshipContext:
        'Brandon is balancing a job transition, fourth child timing, first paid user pressure, and limited bandwidth.',
    });

    expect(result.isEventInvite).toBe(true);
    expect(result.contextSmart).toBe(true);
    expect(result.changesNextMove).toBe(false);
    expect(result.sourceAuthority).toBe('spam_or_promotional');
    expect(result.shouldSuppressSilently).toBe(true);
    expect(result.suppressionReceipt).toEqual({
      reason: 'low_authority_event_invite',
      source_authority: 'spam_or_promotional',
      user_visible: false,
      action_taken: 'suppressed_or_archived_if_allowed',
    });
  });

  it('allows a current product dependency version to remain actionable', () => {
    const result = assessLowValueEventInvite({
      title: 'Virtual event to announce new Developer Platform primitives and capabilities',
      content:
        'Join us for a virtual event to announce new Developer Platform primitives and capabilities. Foldera implementation is blocked until this platform event answers the migration question.',
      suggestedActionType: 'write_document',
      matchedGoalText:
        'Build Foldera into a revenue-generating product. First paid user, then scale to replace employment income.',
      relatedSignals: ['The current Foldera migration decision depends on the event before launch.'],
      sourceSignals: [
        {
          kind: 'signal',
          source: 'gmail',
          summary: 'Current Foldera migration decision depends on this event before launch.',
          occurredAt: '2026-05-09T18:00:00.000Z',
        },
      ],
    });

    expect(result.isEventInvite).toBe(true);
    expect(result.changesNextMove).toBe(true);
    expect(result.shouldSuppressSilently).toBe(false);
    expect(result.reason).toBeNull();
  });
});
