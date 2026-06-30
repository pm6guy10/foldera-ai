import { describe, expect, it } from 'vitest';
import { discrepancyBypassesGoalPrimacy, type ScoredLoop } from '../scorer';

const BASE_BREAKDOWN = {
  stakes: 3,
  urgency: 0.7,
  tractability: 0.7,
  freshness: 1,
  actionTypeRate: 0.5,
  entityPenalty: 0,
};

function discrepancy(overrides: Partial<ScoredLoop> & { id: string; score: number }): ScoredLoop {
  return {
    type: 'discrepancy',
    title: overrides.title ?? 'Discrepancy',
    content: overrides.content ?? 'Discrepancy content.',
    suggestedActionType: overrides.suggestedActionType ?? 'write_document',
    matchedGoal: overrides.matchedGoal ?? null,
    breakdown: overrides.breakdown ?? BASE_BREAKDOWN,
    relatedSignals: overrides.relatedSignals ?? [],
    sourceSignals: overrides.sourceSignals ?? [],
    confidence_prior: overrides.confidence_prior ?? 70,
    ...overrides,
  };
}

describe('discrepancyBypassesGoalPrimacy (#567 follow-on)', () => {
  it("default 'database' mode is unchanged: every discrepancy keeps its bypass", () => {
    const homework = discrepancy({
      id: 'exposure-payment',
      score: 2.8,
      discrepancyClass: 'exposure',
      title: 'Commitment due in 5d: Make a payment to bring account under credit limit',
    });
    expect(discrepancyBypassesGoalPrimacy(homework, 'database')).toBe(true);
  });

  it("'stated' mode drops a no-goal exposure discrepancy (personal payment homework)", () => {
    const homework = discrepancy({
      id: 'exposure-payment',
      score: 2.8,
      discrepancyClass: 'exposure',
      title: 'Commitment due in 5d: Make a payment to bring account under credit limit',
      matchedGoal: null,
    });
    expect(discrepancyBypassesGoalPrimacy(homework, 'stated')).toBe(false);
  });

  it("'stated' mode drops a no-goal behavioral_pattern discrepancy (gig homework)", () => {
    const homework = discrepancy({
      id: 'behavioral-gig',
      score: 2.9,
      discrepancyClass: 'behavioral_pattern',
      title: "Committed to 'Submit a short sample video of hands doing household tasks'",
      matchedGoal: null,
    });
    expect(discrepancyBypassesGoalPrimacy(homework, 'stated')).toBe(false);
  });

  it("'stated' mode keeps an objective-matched discrepancy", () => {
    const objective = discrepancy({
      id: 'exposure-supabase',
      score: 3.1,
      discrepancyClass: 'exposure',
      title: 'Supabase invoice overdue — Foldera infra at risk',
      matchedGoal: { text: 'Keep Foldera shippable — billing/infrastructure', priority: 1, category: 'growth' },
    });
    expect(discrepancyBypassesGoalPrimacy(objective, 'stated')).toBe(true);
  });

  it("'stated' mode keeps relationship/thread-backed outcome classes even with no goal match", () => {
    for (const cls of ['decay', 'relationship_dropout', 'engagement_collapse', 'convergence', 'risk'] as const) {
      const relationship = discrepancy({
        id: `rel-${cls}`,
        score: 2.5,
        discrepancyClass: cls,
        title: `Relationship ${cls} with a key contact`,
        matchedGoal: null,
      });
      expect(discrepancyBypassesGoalPrimacy(relationship, 'stated')).toBe(true);
    }
  });
});
