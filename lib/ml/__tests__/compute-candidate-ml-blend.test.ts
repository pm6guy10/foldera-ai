import { describe, expect, it } from 'vitest';
import { computeCandidateScore, type ApprovalAction } from '@/lib/briefing/scorer';

describe('computeCandidateScore global prior blend', () => {
  const baseArgs = {
    stakes: 3,
    urgency: 0.7,
    tractability: 0.7,
    actionType: 'send_message',
    entityPenalty: 0,
    daysSinceLastSurface: 0,
    approvalHistory: [] as ApprovalAction[],
    highStakes: false,
  };

  it('without global prior keeps default rate path', () => {
    const { breakdown } = computeCandidateScore(baseArgs);
    expect(breakdown.behavioral_rate).toBeGreaterThanOrEqual(0.25);
  });

  it('blends toward global prior when n=0', () => {
    const { breakdown } = computeCandidateScore({
      ...baseArgs,
      globalPriorRate: 0.9,
    });
    expect(breakdown.behavioral_rate).toBeCloseTo(0.9, 5);
  });

  it('blends personal history with global prior', () => {
    const history: ApprovalAction[] = [
      { action_type: 'send_message', status: 'skipped', created_at: new Date().toISOString(), commitment_id: null },
      { action_type: 'send_message', status: 'skipped', created_at: new Date().toISOString(), commitment_id: null },
    ];
    const noGlobal = computeCandidateScore({ ...baseArgs, approvalHistory: history });
    const withGlobal = computeCandidateScore({
      ...baseArgs,
      approvalHistory: history,
      globalPriorRate: 0.8,
    });
    expect(withGlobal.breakdown.behavioral_rate).not.toBe(noGlobal.breakdown.behavioral_rate);
    expect(withGlobal.breakdown.behavioral_rate).toBeGreaterThan(noGlobal.breakdown.behavioral_rate);
  });
});
