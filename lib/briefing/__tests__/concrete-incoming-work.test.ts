import { describe, expect, it } from 'vitest';
import { isConcreteIncomingWorkCandidate } from '../decision-enforcement';

const base = {
  candidateType: 'commitment' as const,
  actionType: 'write_document',
  hasRecentSignal: true,
  title: 'Darlene Craig sent you ESB Technician interview questions',
  content: 'Please complete the attached interview questions for the ESB Technician role by April 22.',
};

describe('isConcreteIncomingWorkCandidate', () => {
  it('returns true for a real dated external inbound ask (interview questions)', () => {
    expect(isConcreteIncomingWorkCandidate(base)).toBe(true);
  });

  it('returns true for a send_message reply-owed candidate', () => {
    expect(isConcreteIncomingWorkCandidate({
      ...base,
      actionType: 'send_message',
      title: 'Sarah Kim asked you to confirm the onboarding call',
      content: 'Can you please confirm the June 27 2pm onboarding call? Response needed.',
    })).toBe(true);
  });

  it('returns true for a form-to-complete candidate', () => {
    expect(isConcreteIncomingWorkCandidate({
      ...base,
      title: 'Teladoc sent you a member health survey',
      content: 'Teladoc sent you a health survey form to complete by end of month.',
    })).toBe(true);
  });

  it('returns false for discrepancy type (observation-shaped — must NOT be promoted)', () => {
    expect(isConcreteIncomingWorkCandidate({
      ...base,
      candidateType: 'discrepancy',
    })).toBe(false);
  });

  it('returns false for emergent type', () => {
    expect(isConcreteIncomingWorkCandidate({
      ...base,
      candidateType: 'emergent',
    })).toBe(false);
  });

  it('returns false when hasRecentSignal is false', () => {
    expect(isConcreteIncomingWorkCandidate({
      ...base,
      hasRecentSignal: false,
    })).toBe(false);
  });

  it('returns false for do_nothing action type', () => {
    expect(isConcreteIncomingWorkCandidate({
      ...base,
      actionType: 'do_nothing',
    })).toBe(false);
  });

  it('returns false for make_decision (no incoming-ask text)', () => {
    expect(isConcreteIncomingWorkCandidate({
      ...base,
      actionType: 'make_decision',
      title: 'Goal drift: Foldera revenue target',
      content: 'The goal has drifted from the original target. You need to decide whether to pivot.',
    })).toBe(false);
  });

  it('returns false for a generic commitment with no incoming-ask signal', () => {
    expect(isConcreteIncomingWorkCandidate({
      ...base,
      title: 'Follow up with Columbia Motors about the Sienna',
      content: 'You said you would follow up about the 2017 Toyota Sienna.',
    })).toBe(false);
  });
});
