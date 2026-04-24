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
      namedEntity: 'Keri Nopens',
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

  it('does not suppress non-Keri send_message candidates when the only goal names Keri Nopens', () => {
    const keriOnlyGoal =
      'DO NOT suggest contacting Keri Nopens until Brandon has stable employment with a current supervisor reference. Post-MAS3 only.';
    const r = evaluateSuppressionGoalMatch(
      '[Email received: 2026-04-20T20:47:42Z]\nFrom: careers@recruiting.uhg.com\nTo: b-kapp@outlook.com\nSubject: UHG follow-up',
      'Thread includes Brandon Kapp context, but this is still a UHG careers contact.',
      'send_message',
      'careers@recruiting.uhg.com',
      [
        {
          pattern: /Brandon/i,
          goalText: keriOnlyGoal,
          contactOnly: true,
          namedEntity: 'Keri Nopens',
        },
      ],
      CONTACT_ACTION_TYPES,
    );
    expect(r.patternMatched).toBe(true);
    expect(r.isSuppressed).toBe(false);
    expect(r.skipReason).toBe('entity_mismatch');
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
