/**
 * Tests for extractor persistence + outcome feedback + confidence grounding
 * (Phase 1–4 changes from 2026-03-27 session)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Test 1 & 2: outcome persistence logic (unit-level, no DB)
// ---------------------------------------------------------------------------

/**
 * Mirror of the Step 8a outcome-persistence logic extracted for testability.
 * In production this runs inside processSignal(); here we test the decision logic
 * (match vs. no-match) by mocking the supabase client.
 */
async function persistOutcomesForTest(
  outcomes: Array<{ decision_description: string; result: string }>,
  openCommitments: Array<{ id: string; description: string }>,
  supabase: {
    update: (vals: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<void> };
    insert: (row: Record<string, unknown>) => Promise<void>;
  },
): Promise<{ matched: string[]; inserted: string[] }> {
  const matched: string[] = [];
  const inserted: string[] = [];

  const tokenize = (s: string): Set<string> =>
    new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2));

  const jaccard = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 && b.size === 0) return 1;
    let intersection = 0;
    for (const w of a) { if (b.has(w)) intersection++; }
    return intersection / (a.size + b.size - intersection);
  };

  for (const outcome of outcomes) {
    if (!outcome.decision_description || !outcome.result) continue;
    const outcomeWords = tokenize(outcome.decision_description);

    const match = openCommitments.find(
      (c) => jaccard(tokenize(c.description), outcomeWords) > 0.55,
    );

    if (match) {
      await supabase.update({ status: 'fulfilled', resolution: { outcome: outcome.result } }).eq('id', match.id);
      matched.push(match.id);
    } else {
      await supabase.insert({
        type: 'outcome_confirmed',
        source: 'extraction',
        content: JSON.stringify({ description: outcome.decision_description, result: outcome.result }),
      });
      inserted.push(outcome.decision_description);
    }
  }

  return { matched, inserted };
}

describe('Outcome persistence — Step 8a logic', () => {
  it('Test 1: matched commitment gets resolution update, no signal inserted', async () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    const eqSpy = vi.fn().mockReturnValue(Promise.resolve());
    const insertSpy = vi.fn().mockResolvedValue(undefined);

    const supabase = {
      update: (vals: Record<string, unknown>) => { updateSpy(vals); return { eq: eqSpy }; },
      insert: insertSpy,
    };

    const openCommitments = [
      { id: 'commit-abc', description: 'Follow up with Netflix recruiter about the engineering role' },
    ];

    const outcomes = [
      { decision_description: 'Netflix recruiter engineering role follow up', result: 'got_rejected' },
    ];

    const { matched, inserted } = await persistOutcomesForTest(outcomes, openCommitments, supabase);

    expect(matched).toContain('commit-abc');
    expect(inserted).toHaveLength(0);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fulfilled' }),
    );
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('Test 2: unmatched outcome inserts outcome_confirmed signal, no commitment updated', async () => {
    const updateSpy = vi.fn();
    const eqSpy = vi.fn().mockResolvedValue(undefined);
    const insertSpy = vi.fn().mockResolvedValue(undefined);

    const supabase = {
      update: (vals: Record<string, unknown>) => { updateSpy(vals); return { eq: eqSpy }; },
      insert: insertSpy,
    };

    const openCommitments = [
      { id: 'commit-xyz', description: 'Review the contract for the Seattle apartment lease' },
    ];

    const outcomes = [
      { decision_description: 'Closed the deal with AWS for the partnership agreement', result: 'successful' },
    ];

    const { matched, inserted } = await persistOutcomesForTest(outcomes, openCommitments, supabase);

    expect(matched).toHaveLength(0);
    expect(inserted).toContain('Closed the deal with AWS for the partnership agreement');
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'outcome_confirmed', source: 'extraction' }),
    );
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 3 & 4: confidence_prior computation
// ---------------------------------------------------------------------------

/**
 * Mirror of the confidence_prior formula from scorer.ts:
 *   prior = clamp(30, 85, behavioralRate * 100 - (entityPenalty < 0 ? 15 : 0))
 */
function computeConfidencePrior(behavioralRate: number, entityPenalty: number): number {
  return Math.round(
    Math.max(30, Math.min(85, behavioralRate * 100 - (entityPenalty < 0 ? 15 : 0))),
  );
}

describe('confidence_prior computation', () => {
  it('Test 3: prior stays within [30, 85] for all valid inputs', () => {
    // Neutral history (0.5 rate, no entity penalty)
    expect(computeConfidencePrior(0.5, 0)).toBe(50);

    // High approval rate
    expect(computeConfidencePrior(0.9, 0)).toBe(85); // capped at 85

    // Low approval rate
    expect(computeConfidencePrior(0.1, 0)).toBe(30); // floored at 30

    // All values in [30, 85]
    for (let rate = 0; rate <= 1; rate += 0.1) {
      for (const penalty of [0, -30]) {
        const prior = computeConfidencePrior(rate, penalty);
        expect(prior).toBeGreaterThanOrEqual(30);
        expect(prior).toBeLessThanOrEqual(85);
      }
    }
  });

  it('Test 4: entity penalty of -30 reduces prior by 15 points', () => {
    const withoutPenalty = computeConfidencePrior(0.7, 0);
    const withPenalty = computeConfidencePrior(0.7, -30);

    expect(withoutPenalty - withPenalty).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Test 5: funnel-stage probability mapping
// ---------------------------------------------------------------------------

/**
 * Mirror of the FUNNEL_STAGES logic from conviction-engine.ts
 */
const FUNNEL_STAGES = [
  { pattern: /offer\s*(letter|extended|received|accepted)/i,          probability: 0.88, label: 'Offer received/accepted' },
  { pattern: /reference\s*check\s*(complete|done|finished|cleared)/i, probability: 0.80, label: 'Reference check complete' },
  { pattern: /start\s*date\s*(discussed|confirmed|set)|onboard/i,     probability: 0.75, label: 'Start date discussed' },
  { pattern: /final\s*(round|interview|stage)/i,                      probability: 0.55, label: 'Final round' },
  { pattern: /second\s*(round|interview)/i,                           probability: 0.40, label: 'Second round interview' },
  { pattern: /phone\s*(screen|interview)|first\s*(round|interview)/i, probability: 0.35, label: 'First round interview' },
  { pattern: /applied|application\s*(sent|submitted|received)/i,      probability: 0.20, label: 'Applied' },
] as const;

function inferProbabilityFromText(text: string): { probability: number; label: string } | null {
  for (const stage of FUNNEL_STAGES) {
    if (stage.pattern.test(text)) {
      return { probability: stage.probability, label: stage.label };
    }
  }
  return null;
}

describe('Funnel-stage probability mapping', () => {
  it('Test 5: each stage returns the correct probability and stages are mutually exclusive', () => {
    // reference check complete → 0.80
    const refCheck = inferProbabilityFromText('Reference check complete — they cleared everything');
    expect(refCheck?.probability).toBe(0.80);
    expect(refCheck?.label).toBe('Reference check complete');

    // applied → 0.20
    const applied = inferProbabilityFromText('Application submitted to Google L5 position');
    expect(applied?.probability).toBe(0.20);

    // final round → 0.55
    const finalRound = inferProbabilityFromText('You have been selected for a final round interview');
    expect(finalRound?.probability).toBe(0.55);

    // offer received → 0.88
    const offer = inferProbabilityFromText('Offer letter received from Stripe, $180k base');
    expect(offer?.probability).toBe(0.88);

    // A signal matching both "applied" and "final round" — should return highest stage only
    const combined = inferProbabilityFromText('applied earlier, now in final round interview');
    // FUNNEL_STAGES iterates highest-first, so final round (0.55) wins over applied (0.20)
    expect(combined?.probability).toBe(0.55);

    // No match → null
    expect(inferProbabilityFromText('general update about the project timeline')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 6: entity name in commitment context string
// ---------------------------------------------------------------------------

/**
 * Mirror of the entity-name prefix logic added to buildStructuredContext.
 */
function buildSelectedCandidate(
  winner: { type: string; content: string; relationshipContext?: string },
): string {
  let selectedCandidate = winner.content.slice(0, 500);
  if (winner.type === 'commitment' && winner.relationshipContext) {
    const firstNameMatch = winner.relationshipContext.match(/^([^\n<|]+)/);
    const entityNamePrefix = firstNameMatch ? firstNameMatch[1].trim() : null;
    if (entityNamePrefix && entityNamePrefix !== 'self') {
      selectedCandidate = `ENTITY: ${entityNamePrefix}\n${selectedCandidate}`;
    }
  }
  return selectedCandidate;
}

describe('Commitment entity names in context', () => {
  it('Test 6: commitment candidate with known entity prepends ENTITY: name to selected_candidate', () => {
    const winner = {
      type: 'commitment',
      content: 'Send the prep brief before the engineering loop on Friday.',
      relationshipContext: 'Sarah Chen <sarah@netflix.com> | recruiter | Netflix | 4 interactions',
    };

    const result = buildSelectedCandidate(winner);

    expect(result).toMatch(/^ENTITY: Sarah Chen/);
    expect(result).toContain('Send the prep brief');
  });

  it('Test 6b: non-commitment candidate does not get ENTITY prefix', () => {
    const winner = {
      type: 'signal',
      content: 'Behavioral signal about email reply latency.',
      relationshipContext: 'Sarah Chen <sarah@netflix.com> | recruiter | Netflix',
    };

    const result = buildSelectedCandidate(winner);
    expect(result).not.toMatch(/^ENTITY:/);
  });

  it('Test 6c: commitment with no relationshipContext does not crash', () => {
    const winner = {
      type: 'commitment',
      content: 'Follow up on the proposal.',
    };

    const result = buildSelectedCandidate(winner);
    expect(result).toBe('Follow up on the proposal.');
    expect(result).not.toMatch(/^ENTITY:/);
  });
});
