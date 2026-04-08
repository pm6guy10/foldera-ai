import { describe, expect, it } from 'vitest';
import { skippedRowQualifiesForDuplicateSuppressionCooldown } from '../scorer';

describe('skippedRowQualifiesForDuplicateSuppressionCooldown', () => {
  it('qualifies on duplicate_* in directive_text', () => {
    expect(
      skippedRowQualifiesForDuplicateSuppressionCooldown({
        directive_text: 'duplicate_100pct_similar prior text',
        execution_result: null,
      }),
    ).toBe(true);
  });

  it('qualifies on duplicate pending skip_reason (reconcile)', () => {
    expect(
      skippedRowQualifiesForDuplicateSuppressionCooldown({
        directive_text: 'Send message to Pat about the deck',
        skip_reason: 'Auto-suppressed duplicate pending action before daily brief generation.',
        execution_result: { auto_suppression_reason: 'Auto-suppressed duplicate pending action before daily brief generation.' },
      }),
    ).toBe(true);
  });

  it('qualifies on legacy forced-fresh skip copy', () => {
    expect(
      skippedRowQualifiesForDuplicateSuppressionCooldown({
        directive_text: 'Same send_message body as pending',
        skip_reason: 'Auto-suppressed pending action before forced fresh generation',
        execution_result: {},
      }),
    ).toBe(true);
  });

  it('does not qualify arbitrary skipped rows', () => {
    expect(
      skippedRowQualifiesForDuplicateSuppressionCooldown({
        directive_text: 'Some other skipped reason',
        skip_reason: 'user skipped',
        execution_result: {},
      }),
    ).toBe(false);
  });
});
