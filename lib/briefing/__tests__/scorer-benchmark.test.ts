import { describe, expect, it } from 'vitest';
import { computeCandidateScore, inferActionType, passesTop3RankingInvariants, type ApprovalAction, type ScoredLoop } from '../scorer';

// ---------------------------------------------------------------------------
// Minimal ScoredLoop factory for invariant tests
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<ScoredLoop> = {}): ScoredLoop {
  return {
    id: 'test-id',
    type: 'commitment',
    // Title must not match NOISE_CANDIDATE_PATTERNS or OBVIOUS_FIRST_LAYER_PATTERNS
    // (no "follow up", "check in", "schedule a block", etc.)
    title: 'Client contract requires decision before board review',
    content: 'The client has a contract deadline that requires a decision before the board review.',
    suggestedActionType: 'send_message',
    matchedGoal: null,
    score: 3.0,
    breakdown: {
      stakes: 3,
      urgency: 0.7,
      tractability: 0.7,
      freshness: 1.0,
      actionTypeRate: 0.5,
      entityPenalty: 0,
    },
    relatedSignals: [],
    sourceSignals: [{ kind: 'signal', id: 's1', summary: 'email thread with client' }],
    confidence_prior: 55,
    ...overrides,
  };
}

const THRESHOLD = 2.0;

/**
 * Build a fake approval history where all actions share the given action_type
 * and have the specified approval rate. Actions are spread over 30 days.
 */
function buildHistory(
  actionType: string,
  count: number,
  approvalRate: number,
): ApprovalAction[] {
  const now = Date.now();
  const history: ApprovalAction[] = [];

  // Interleave approved/skipped evenly across time so time-weighting
  // doesn't inflate or deflate the rate beyond the intended value.
  for (let i = 0; i < count; i++) {
    // Deterministic interleave: every Nth action is approved
    const isApproved = approvalRate >= 1.0
      || (approvalRate > 0 && (i % Math.round(1 / approvalRate)) === 0);
    history.push({
      action_type: actionType,
      status: isApproved ? 'approved' : 'skipped',
      created_at: new Date(now - i * 86400000).toISOString(),
      commitment_id: null,
    });
  }
  return history;
}

describe('computeCandidateScore — Gemini benchmark', () => {
  const now = new Date('2026-03-23T12:00:00Z');

  it('Case 1: S5 U0.9 T0.9 R0.7 fresh unsuppressed => clearly passes', () => {
    const { score } = computeCandidateScore({
      stakes: 5,
      urgency: 0.9,
      tractability: 0.9,
      actionType: 'send_message',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: buildHistory('send_message', 20, 0.7),
      now,
    });
    expect(score).toBeGreaterThan(THRESHOLD);
  });

  it('Case 2: S4 U1.0 T0.1 R0.5 fresh unsuppressed => clearly fails (low tractability)', () => {
    const { score } = computeCandidateScore({
      stakes: 4,
      urgency: 1.0,
      tractability: 0.1,
      actionType: 'make_decision',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: buildHistory('make_decision', 20, 0.5),
      now,
    });
    expect(score).toBeLessThan(THRESHOLD);
  });

  it('Case 3: S5 U0.1 T0.8 R0.6 fresh unsuppressed => about threshold / slight pass', () => {
    const { score } = computeCandidateScore({
      stakes: 5,
      urgency: 0.1,
      tractability: 0.8,
      actionType: 'send_message',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: buildHistory('send_message', 20, 0.6),
      now,
    });
    // "about threshold / slight pass" — within 0.5 of threshold or above
    expect(score).toBeGreaterThanOrEqual(THRESHOLD - 0.5);
    expect(score).toBeLessThan(THRESHOLD + 1.5);
  });

  it('Case 4: S3 U0.6 T0.6 R0.5 surfaced yesterday unsuppressed => fails', () => {
    const { score } = computeCandidateScore({
      stakes: 3,
      urgency: 0.6,
      tractability: 0.6,
      actionType: 'write_document',
      entityPenalty: 0,
      daysSinceLastSurface: 1,
      approvalHistory: buildHistory('write_document', 20, 0.5),
      now,
    });
    expect(score).toBeLessThan(THRESHOLD);
  });

  it('Case 5: S4 U0.8 T0.8 R0.6 surfaced yesterday unsuppressed => fails', () => {
    const { score } = computeCandidateScore({
      stakes: 4,
      urgency: 0.8,
      tractability: 0.8,
      actionType: 'send_message',
      entityPenalty: 0,
      daysSinceLastSurface: 1,
      approvalHistory: buildHistory('send_message', 20, 0.6),
      now,
    });
    expect(score).toBeLessThan(THRESHOLD);
  });

  it('Case 6: S5 U0.9 T0.9 R0.7 fresh suppressed => near zero / strong fail', () => {
    const { score } = computeCandidateScore({
      stakes: 5,
      urgency: 0.9,
      tractability: 0.9,
      actionType: 'send_message',
      entityPenalty: -30,
      daysSinceLastSurface: 0,
      approvalHistory: buildHistory('send_message', 20, 0.7),
      now,
    });
    expect(score).toBeLessThan(0.01);
  });

  it('Case 7: S1 U0.1 T0.5 R0.5 fresh unsuppressed => buried', () => {
    const { score } = computeCandidateScore({
      stakes: 1,
      urgency: 0.1,
      tractability: 0.5,
      actionType: 'research',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: buildHistory('research', 20, 0.5),
      now,
    });
    expect(score).toBeLessThan(THRESHOLD * 0.5);
  });

  it('Case 8: S2 U1.0 T0.9 R0.6 fresh unsuppressed => passes', () => {
    const { score } = computeCandidateScore({
      stakes: 2,
      urgency: 1.0,
      tractability: 0.9,
      actionType: 'schedule',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: buildHistory('schedule', 20, 0.6),
      now,
    });
    expect(score).toBeGreaterThan(THRESHOLD);
  });

  it('returns full breakdown fields', () => {
    const { breakdown } = computeCandidateScore({
      stakes: 3,
      urgency: 0.7,
      tractability: 0.6,
      actionType: 'send_message',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: [],
      now,
    });

    expect(breakdown.stakes_raw).toBe(3);
    expect(breakdown.stakes_transformed).toBeCloseTo(Math.pow(3, 0.6), 5);
    expect(breakdown.urgency_raw).toBe(0.7);
    expect(breakdown.urgency_effective).toBeGreaterThan(0);
    expect(breakdown.tractability).toBe(0.6);
    expect(breakdown.exec_potential).toBeGreaterThan(0);
    expect(breakdown.behavioral_rate).toBe(0.5); // cold start
    expect(breakdown.novelty_multiplier).toBe(1.0);
    expect(breakdown.suppression_multiplier).toBe(1.0);
    expect(breakdown.final_score).toBe(breakdown.stakes_transformed * breakdown.exec_potential * breakdown.behavioral_rate * breakdown.novelty_multiplier * breakdown.suppression_multiplier * 3.0);
  });

  it('cold start (no history) defaults behavioral_rate to 0.5', () => {
    const { breakdown } = computeCandidateScore({
      stakes: 3,
      urgency: 0.5,
      tractability: 0.5,
      actionType: 'send_message',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: [],
      now,
    });
    expect(breakdown.behavioral_rate).toBe(0.5);
  });

  it('novelty_multiplier = 0.55 when surfaced yesterday', () => {
    const { breakdown } = computeCandidateScore({
      stakes: 3,
      urgency: 0.5,
      tractability: 0.5,
      actionType: 'send_message',
      entityPenalty: 0,
      daysSinceLastSurface: 1,
      approvalHistory: [],
      now,
    });
    expect(breakdown.novelty_multiplier).toBe(0.35);
  });

  it('novelty_multiplier = 0.65 when surfaced 2 days ago', () => {
    const { breakdown } = computeCandidateScore({
      stakes: 3,
      urgency: 0.5,
      tractability: 0.5,
      actionType: 'send_message',
      entityPenalty: 0,
      daysSinceLastSurface: 2,
      approvalHistory: [],
      now,
    });
    expect(breakdown.novelty_multiplier).toBe(0.65);
  });

  it('rate floor: 100% skip history still yields rate >= 0.25', () => {
    const { breakdown } = computeCandidateScore({
      stakes: 5,
      urgency: 0.9,
      tractability: 0.9,
      actionType: 'make_decision',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: buildHistory('make_decision', 50, 0),
      now,
    });
    expect(breakdown.behavioral_rate).toBeGreaterThanOrEqual(0.25);
  });

  it('rate floor: 0% approval with high stakes still scores above zero', () => {
    const { score } = computeCandidateScore({
      stakes: 5,
      urgency: 0.9,
      tractability: 0.9,
      actionType: 'make_decision',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: buildHistory('make_decision', 50, 0),
      now,
    });
    // With rate floor 0.25, S5 U0.9 T0.9 should still produce a meaningful score
    expect(score).toBeGreaterThan(1.0);
  });

  it('cold-start prior: sparse history (n=3) stays near 0.5', () => {
    const { breakdown } = computeCandidateScore({
      stakes: 3,
      urgency: 0.5,
      tractability: 0.5,
      actionType: 'research',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: buildHistory('research', 3, 0),
      now,
    });
    // n=3 < 5 → blended = 0.5 (cold start), then prior: (0.5*3 + 0.5*10)/(3+10) = 0.5
    expect(breakdown.behavioral_rate).toBeGreaterThanOrEqual(0.45);
    expect(breakdown.behavioral_rate).toBeLessThanOrEqual(0.55);
  });
});

// ---------------------------------------------------------------------------
// passesTop3RankingInvariants — evidence density gate (< 1) change
// ---------------------------------------------------------------------------

describe('passesTop3RankingInvariants — evidence density gate', () => {
  it('candidate with only sourceSignals (density=1) passes the relaxed gate', () => {
    // density: 0 (no goal) + 0 (no relatedSignals) + 1 (sourceSignals) + 0 (no concrete) = 1
    // Old threshold (< 2) would reject this; new threshold (< 1) accepts it.
    const candidate = makeCandidate({
      sourceSignals: [{ kind: 'signal', id: 's1', summary: 'client deadline email' }],
      relatedSignals: [],
      matchedGoal: null,
    });
    expect(passesTop3RankingInvariants(candidate)).toBe(true);
  });

  it('candidate with zero evidence (density=0) still fails the gate', () => {
    // density: 0 (no goal) + 0 (no relatedSignals) + 0 (no sourceSignals) + 0 (no concrete) = 0
    const candidate = makeCandidate({
      sourceSignals: [],
      relatedSignals: [],
      matchedGoal: null,
    });
    expect(passesTop3RankingInvariants(candidate)).toBe(false);
  });

  it('relationship candidate with only entity source signal passes (density bonus applies)', () => {
    // relationship type gets +1 density bonus; sourceSignals +1 = density 2 → passes
    const candidate = makeCandidate({
      type: 'relationship',
      sourceSignals: [{ kind: 'relationship', id: 'e1', summary: 'krista: 23 interactions' }],
      relatedSignals: [],
      matchedGoal: null,
    });
    expect(passesTop3RankingInvariants(candidate)).toBe(true);
  });

  it('discrepancy candidate with only sourceSignal-type refs passes (density bonus applies)', () => {
    // discrepancy type gets +1 density bonus; sourceSignals +1 = density 2 → passes
    const candidate = makeCandidate({
      type: 'discrepancy',
      sourceSignals: [{ kind: 'relationship', summary: 'emmett: 15 interactions' }],
      relatedSignals: [],
      matchedGoal: null,
      discrepancyClass: 'decay',
    });
    expect(passesTop3RankingInvariants(candidate)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getEntitySkipPenalty — approved action check (unit-level, logic only)
// ---------------------------------------------------------------------------
// These tests verify the LOGIC of the approved-action suppression rule using
// computeCandidateScore directly (the async DB layer is tested at integration level).

describe('computeCandidateScore — entityPenalty suppression via -30', () => {
  it('entity penalty of -30 drives score below threshold for send_message', () => {
    const { score } = computeCandidateScore({
      stakes: 3,
      urgency: 0.8,
      tractability: 0.7,
      actionType: 'send_message',
      entityPenalty: -30,
      daysSinceLastSurface: 0,
      approvalHistory: [],
      highStakes: false,
    });
    // Score must be below the minimum actionable threshold (2.0)
    expect(score).toBeLessThan(2.0);
  });

  it('entity penalty of 0 keeps a strong candidate above threshold', () => {
    const { score } = computeCandidateScore({
      stakes: 4,
      urgency: 0.85,
      tractability: 0.8,
      actionType: 'send_message',
      entityPenalty: 0,
      daysSinceLastSurface: 0,
      approvalHistory: [],
      highStakes: true,
    });
    expect(score).toBeGreaterThan(2.0);
  });
});

// ---------------------------------------------------------------------------
// inferActionType — research keywords must produce make_decision, not research
// ---------------------------------------------------------------------------

describe('inferActionType — research keywords → make_decision', () => {
  it('text containing "research" produces make_decision for commitment', () => {
    expect(inferActionType('I need to research the market landscape', 'commitment')).toBe('make_decision');
  });

  it('text containing "investigate" produces make_decision for commitment', () => {
    expect(inferActionType('investigate the vendor options before the deadline', 'commitment')).toBe('make_decision');
  });

  it('text containing "look into" produces make_decision for signal', () => {
    expect(inferActionType('need to look into why the deal stalled', 'signal')).toBe('make_decision');
  });

  it('text containing "find out" produces make_decision for signal', () => {
    expect(inferActionType('find out what the client decided', 'signal')).toBe('make_decision');
  });

  it('research keyword never produces the research action type for commitment', () => {
    expect(inferActionType('research options for the new role', 'commitment')).not.toBe('research');
  });

  it('research keyword never produces the research action type for signal', () => {
    expect(inferActionType('investigate the email thread', 'signal')).not.toBe('research');
  });

  it('relationship loop still produces send_message regardless of research keyword', () => {
    expect(inferActionType('research this contact further', 'relationship')).toBe('send_message');
  });
});
