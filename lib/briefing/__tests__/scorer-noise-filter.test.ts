import { describe, expect, it } from 'vitest';
import { isNoiseCandidateText } from '../scorer';

describe('isNoiseCandidateText', () => {
  it('filters paid transaction logs that are already complete', () => {
    expect(isNoiseCandidateText('Paid $7.00 for eggs')).toBe(true);
    expect(isNoiseCandidateText('Paid Abbie Lee $20.00 for 2 loaves')).toBe(true);
  });

  it('does not filter real future action commitments', () => {
    expect(isNoiseCandidateText('Pay Abbie Lee $20.00 by Friday')).toBe(false);
  });

  it('does not filter discrepancy-style diagnostic candidates', () => {
    expect(
      isNoiseCandidateText(
        'Goal drift: Resolve ESD overpayment waiver',
        'Priority 1 goal has no recent activity in signals or commitments.',
      ),
    ).toBe(false);
  });

  it('filters recipient-side billing and payment notification patterns', () => {
    expect(isNoiseCandidateText('Insurance payment will be collected via automatic bill pay')).toBe(true);
    expect(isNoiseCandidateText('Payment processed and will be posted to account')).toBe(true);
  });

  it('filters obvious promotional recipient language', () => {
    expect(isNoiseCandidateText('If you are interested, send pricing preferences')).toBe(true);
    expect(isNoiseCandidateText('Explore exclusive partner offer and claim your reward')).toBe(true);
    expect(isNoiseCandidateText('Register for TechBytes webinar session on AI readiness')).toBe(true);
  });
});
