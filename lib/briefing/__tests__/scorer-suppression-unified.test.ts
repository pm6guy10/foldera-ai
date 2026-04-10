import { describe, expect, it } from 'vitest';
import {
  CONTACT_ACTION_TYPES,
  evaluateSuppressionGoalMatch,
  type SuppressionGoalEntityPattern,
} from '../scorer';

describe('evaluateSuppressionGoalMatch', () => {
  const patterns: SuppressionGoalEntityPattern[] = [
    {
      pattern: /Keri\s+Nopens/i,
      goalText: 'DO NOT contact Keri Nopens',
      contactOnly: true,
    },
    {
      pattern: /Mercor/i,
      goalText: 'DO NOT suggest anything related to Mercor',
      contactOnly: false,
    },
  ];

  it('matches entityName when title/content omit the full phrase (discrepancy-style rows)', () => {
    const r = evaluateSuppressionGoalMatch(
      'Relationship decay',
      'Silence pattern detected',
      'send_message',
      'Keri Nopens',
      patterns,
      CONTACT_ACTION_TYPES,
    );
    expect(r.patternMatched).toBe(true);
    expect(r.isSuppressed).toBe(true);
    expect(r.matchedGoalText).toContain('Keri');
  });

  it('contact-only goal does not suppress make_decision', () => {
    const r = evaluateSuppressionGoalMatch(
      'Decision about Keri Nopens',
      'Context body',
      'make_decision',
      null,
      patterns,
      CONTACT_ACTION_TYPES,
    );
    expect(r.patternMatched).toBe(true);
    expect(r.isSuppressed).toBe(false);
  });

  it('absolute DO NOT suppresses make_decision', () => {
    const r = evaluateSuppressionGoalMatch(
      'Drift',
      'You keep engaging with Mercor threads',
      'make_decision',
      null,
      patterns,
      CONTACT_ACTION_TYPES,
    );
    expect(r.patternMatched).toBe(true);
    expect(r.isSuppressed).toBe(true);
  });
});
