import { describe, expect, it } from 'vitest';
import { computeCandidateScore, type ApprovalAction } from '../scorer';

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
    expect(breakdown.novelty_multiplier).toBe(0.55);
  });

  it('novelty_multiplier = 0.80 when surfaced 2 days ago', () => {
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
    expect(breakdown.novelty_multiplier).toBe(0.80);
  });
});
