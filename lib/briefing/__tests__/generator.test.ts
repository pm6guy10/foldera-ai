import { describe, expect, it } from 'vitest';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import {
  applyPinnedGoals,
  getCandidateConstraintViolations,
} from '../pinned-constraints';
import { validateDirectiveForPersistence } from '../generator';
import type { ConvictionDirective } from '../types';

function buildDirective(overrides: Partial<ConvictionDirective>): ConvictionDirective {
  return {
    directive: 'Draft email to Holly requesting specific reference talking points for your MAS3 candidacy.',
    action_type: 'send_message',
    confidence: 79,
    reason: 'MAS3 is in final stages and reference preparation could be the deciding factor between candidates.',
    evidence: [
      { type: 'signal', description: 'Holly can strengthen the MAS3 reference package right now.' },
    ],
    ...overrides,
  };
}

describe('daily brief pinned constraints', () => {
  it('injects the MAS3 pinned goal into owner scoring context', () => {
    const goals = applyPinnedGoals(OWNER_USER_ID, []);
    expect(goals[0]).toMatchObject({
      priority: 5,
      goal_category: 'career',
    });
    expect(goals[0]?.goal_text).toContain('MAS3 / state-government path');
  });

  it('suppresses Foldera-primary candidate text before ranking', () => {
    const violations = getCandidateConstraintViolations(
      OWNER_USER_ID,
      'Decide whether to abandon the 10 paying users goal and commit fully to the MAS3 health job path, or block out specific daily hours for customer acquisition work starting tomorrow.',
    );
    expect(violations.map((violation) => violation.code)).toContain('foldera_primary_conflict');
  });

  it.each([
    {
      directive: 'Decide whether to abandon the 10 paying users goal and commit fully to the MAS3 health job path, or block out specific daily hours for customer acquisition work starting tomorrow.',
      reason: 'The goal-behavior misalignment is creating daily decision paralysis and preventing focus on either path.',
      artifact: {
        type: 'decision_frame',
        options: [
          { option: 'Commit fully to MAS3', weight: 0.6, rationale: 'Primary lane' },
          { option: 'Split time with customer acquisition', weight: 0.4, rationale: 'Fallback' },
        ],
        recommendation: 'Decide whether to commit fully to MAS3 or split time with customer acquisition.',
      },
    },
    {
      directive: 'Draft a 30-day revenue bridge plan with three specific client acquisition tactics for your consulting services.',
      reason: 'MAS3 outcome uncertainty combined with June delivery deadline requires immediate revenue diversification beyond state employment.',
      artifact: {
        type: 'decision_frame',
        options: [
          { option: 'Consulting bridge plan', weight: 0.7, rationale: 'Revenue hedge' },
          { option: 'Wait on MAS3 only', weight: 0.3, rationale: 'Higher focus' },
        ],
        recommendation: 'Use consulting services as the revenue bridge.',
      },
    },
    {
      directive: 'Draft a 30-day financial bridge plan assuming MAS3 doesn\'t materialize by April 1st.',
      reason: 'March 17th marks 6 weeks since MAS3 interview with no timeline clarity and financial runway critically short.',
      artifact: {
        type: 'decision_frame',
        options: [
          { option: 'Contingency bridge plan', weight: 0.7, rationale: 'Fallback' },
          { option: 'No bridge plan', weight: 0.3, rationale: 'Stay focused' },
        ],
        recommendation: 'Build the contingency bridge plan if MAS3 does not materialize.',
      },
    },
  ])('rejects bad output from today: $directive', ({ directive, reason, artifact }) => {
    const issues = validateDirectiveForPersistence({
      userId: OWNER_USER_ID,
      directive: buildDirective({
        directive,
        action_type: 'make_decision',
        confidence: 77,
        reason,
      }),
      artifact,
    });

    expect(issues.length).toBeGreaterThan(0);
  });

  it('allows a concrete MAS3-supporting directive with one finished artifact', () => {
    const issues = validateDirectiveForPersistence({
      userId: OWNER_USER_ID,
      directive: buildDirective({}),
      artifact: {
        type: 'email',
        to: 'holly@example.com',
        subject: 'Reference talking points for MAS3',
        body: 'Hi Holly,\n\nCould you send the two or three strongest talking points you would use for my MAS3 candidacy?\n\nThanks,\nBrandon',
        draft_type: 'email_compose',
      },
    });

    expect(issues).toEqual([]);
  });
});
