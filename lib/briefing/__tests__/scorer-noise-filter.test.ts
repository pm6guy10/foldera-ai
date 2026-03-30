import { describe, expect, it } from 'vitest';
import { isNoiseCandidateText, isExecutableCommitment } from '../scorer';

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

  it('filters medical appointment prep patterns', () => {
    expect(isNoiseCandidateText('Prepare for your medical appointment on Thursday')).toBe(true);
    expect(isNoiseCandidateText('Schedule a doctor appointment for annual physical exam')).toBe(true);
  });

  it('filters auto-renewal and subscription patterns', () => {
    expect(isNoiseCandidateText('Your subscription will auto-renew on April 15')).toBe(true);
    expect(isNoiseCandidateText('Cancel before your renewal to avoid being charged')).toBe(true);
  });

  it('filters wellness/fitness challenge patterns', () => {
    expect(isNoiseCandidateText('Track your steps for the office fitness challenge this week')).toBe(true);
    expect(isNoiseCandidateText('Join the hydration challenge and track your water intake')).toBe(true);
  });

  it('filters product launch and release announcements', () => {
    expect(isNoiseCandidateText("We've launched a new feature for your account dashboard")).toBe(true);
    expect(isNoiseCandidateText('Introducing our new premium tier with exclusive benefits')).toBe(true);
  });

  it('does NOT filter professional action commitments with specific outcomes', () => {
    expect(isNoiseCandidateText('Send updated SOW to the client team by Friday')).toBe(false);
    expect(isNoiseCandidateText('Submit contract draft to Alice Smith for board review')).toBe(false);
    expect(isNoiseCandidateText('Prepare investor update memo for Q2 board meeting')).toBe(false);
  });
});

describe('isExecutableCommitment — commitment admission gate', () => {
  it('rejects trivial grocery/food purchase commitments', () => {
    expect(isExecutableCommitment('Buy eggs and bread from the store', 'consumer_purchase', false)).toBe(false);
    expect(isExecutableCommitment('Pick up milk and coffee', 'consumer_purchase', false)).toBe(false);
    expect(isExecutableCommitment('Order groceries for the week', 'consumer_purchase', false)).toBe(false);
  });

  it('rejects household errand commitments', () => {
    expect(isExecutableCommitment('Call the plumber to fix the sink', 'personal_admin', false)).toBe(false);
    expect(isExecutableCommitment('Schedule an oil change for the car', 'personal_admin', false)).toBe(false);
  });

  it('rejects payment_financial commitments without goal match', () => {
    expect(isExecutableCommitment('Pay monthly credit card bill', 'payment_financial', false)).toBe(false);
    expect(isExecutableCommitment('Transfer $500 to savings account', 'payment_financial', false)).toBe(false);
  });

  it('ALLOWS payment_financial with goal match (e.g. runway/fundraising context)', () => {
    expect(isExecutableCommitment('Transfer remaining runway funds to operating account', 'payment_financial', true)).toBe(true);
    expect(isExecutableCommitment('Pay contractor invoice for client project', 'payment_financial', true)).toBe(true);
  });

  it('rejects health_wellness commitments without goal match', () => {
    expect(isExecutableCommitment('Schedule annual dental checkup', 'health_wellness', false)).toBe(false);
    expect(isExecutableCommitment('Complete wellness challenge step goal', 'health_wellness', false)).toBe(false);
  });

  it('rejects attend_participate without goal match', () => {
    expect(isExecutableCommitment('Attend neighborhood block party Saturday', 'attend_participate', false)).toBe(false);
    expect(isExecutableCommitment('Join company all-hands meeting next week', 'attend_participate', false)).toBe(false);
  });

  it('ALLOWS attend_participate with goal match (conference, networking)', () => {
    expect(isExecutableCommitment('Attend YC demo day to meet investors', 'attend_participate', true)).toBe(true);
    expect(isExecutableCommitment('Participate in hiring panel interview for engineering role', 'attend_participate', true)).toBe(true);
  });

  it('ALLOWS professional project commitments regardless of category', () => {
    expect(isExecutableCommitment('Submit updated proposal to client by Friday', 'project', false)).toBe(true);
    expect(isExecutableCommitment('Send contract draft to legal team for review', 'other', false)).toBe(true);
  });

  it('ALLOWS financial commitments with goal match but no trivial pattern', () => {
    expect(isExecutableCommitment('Finalize Q1 revenue projection for board meeting', 'financial', true)).toBe(true);
  });
});
