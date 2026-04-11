import { describe, expect, it } from 'vitest';
import { isAutomatedRoutingRecipient } from '../automated-routing-recipient';

describe('isAutomatedRoutingRecipient', () => {
  it('returns true for Outlier wfe-* workflow addresses', () => {
    expect(isAutomatedRoutingRecipient('wfe-6921e4b356ccff5a5f336b22@outlier.ai')).toBe(true);
  });

  it('returns true for Outlier community / notifications campaign inboxes', () => {
    expect(isAutomatedRoutingRecipient('community@outlier.ai')).toBe(true);
    expect(isAutomatedRoutingRecipient('notifications@outlier.ai')).toBe(true);
  });

  it('returns false for normal addresses', () => {
    expect(isAutomatedRoutingRecipient('alice@outlier.ai')).toBe(false);
    expect(isAutomatedRoutingRecipient('alice@example.com')).toBe(false);
  });
});
