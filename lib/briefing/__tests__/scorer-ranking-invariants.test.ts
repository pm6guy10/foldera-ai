import { describe, expect, it } from 'vitest';
import {
  applyRankingInvariants,
  passesTop3RankingInvariants,
  type ScoredLoop,
} from '../scorer';

const BASE_BREAKDOWN = {
  stakes: 3,
  urgency: 0.7,
  tractability: 0.7,
  freshness: 1,
  actionTypeRate: 0.5,
  entityPenalty: 0,
};

function candidate(overrides: Partial<ScoredLoop> & { id: string; score: number }): ScoredLoop {
  return {
    id: overrides.id,
    type: overrides.type ?? 'signal',
    title: overrides.title ?? 'Candidate',
    content: overrides.content ?? 'Candidate content with concrete detail.',
    suggestedActionType: overrides.suggestedActionType ?? 'send_message',
    matchedGoal: overrides.matchedGoal ?? { text: 'Land role offer by May', priority: 1, category: 'career' },
    score: overrides.score,
    breakdown: overrides.breakdown ?? BASE_BREAKDOWN,
    relatedSignals: overrides.relatedSignals ?? ['Signal with outcome evidence'],
    sourceSignals: overrides.sourceSignals ?? [{ kind: 'signal', summary: 'Signal with outcome evidence' }],
    confidence_prior: overrides.confidence_prior ?? 70,
  };
}

describe('applyRankingInvariants', () => {
  it('weak generic candidate cannot rank #1 over discrepancy', () => {
    const before = [
      candidate({
        id: 'generic-task',
        score: 4.8,
        type: 'commitment',
        title: 'Follow up with hiring team',
        content: 'Follow up with hiring team.',
      }),
      candidate({
        id: 'discrepancy',
        score: 4.1,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Behavior drift: interview signals rose while application output dropped',
        content: 'Interview momentum up 3x while outbound applications dropped to zero ahead of deadline.',
      }),
    ];

    expect([...before].sort((a, b) => b.score - a.score)[0]?.id).toBe('generic-task');

    const { ranked } = applyRankingInvariants(before);
    expect(ranked[0]?.id).toBe('discrepancy');
  });

  it('duplicate-like candidates collapse to one survivor', () => {
    const rankedInput = [
      candidate({
        id: 'dup-a',
        score: 3.9,
        title: 'Send update to hiring manager on reference packet',
        content: 'Send update to hiring manager on reference packet before Monday.',
      }),
      candidate({
        id: 'dup-b',
        score: 3.8,
        title: 'Send update to hiring manager on references packet',
        content: 'Send update to hiring manager on references packet before Monday morning.',
      }),
      candidate({
        id: 'discrepancy',
        score: 3.5,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Timing asymmetry: deadlines tightening while prep time shrinks',
        content: 'Decision window narrowed from 9 days to 3 days with no updated plan.',
      }),
    ];

    const { ranked } = applyRankingInvariants(rankedInput);
    const positive = ranked.filter((c) => c.score > 0).map((c) => c.id);
    expect(positive).toContain('dup-a');
    expect(positive).toContain('discrepancy');
    expect(positive).not.toContain('dup-b');
  });

  it('discrepancy beats generic task every time when both exist', () => {
    const input = [
      candidate({
        id: 'task',
        score: 5.0,
        type: 'commitment',
        title: 'Follow up with team',
        content: 'Follow up with team this week.',
      }),
      candidate({
        id: 'risk-discrepancy',
        score: 3.6,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Unseen risk: approval blocker surfaced in latest thread',
        content: 'Approval thread now cites missing supervisor reference while offer timeline continues.',
      }),
    ];

    const { ranked } = applyRankingInvariants(input);
    expect(ranked[0]?.id).toBe('risk-discrepancy');
  });

  it('obvious first-layer advice is penalized below high-signal discrepancy', () => {
    const input = [
      candidate({
        id: 'obvious',
        score: 4.7,
        type: 'signal',
        title: 'Check in with recruiter',
        content: 'Check in with recruiter.',
      }),
      candidate({
        id: 'high-signal-discrepancy',
        score: 3.4,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Contradiction: cash-constrained goal with rising nonessential spend',
        content: 'Cash runway target tightened while discretionary spend rose 22% across two weeks.',
        relatedSignals: [
          'Budget thread documents target runway change',
          'Spend report shows discretionary increase',
        ],
      }),
    ];

    const { ranked } = applyRankingInvariants(input);
    expect(ranked[0]?.id).toBe('high-signal-discrepancy');
  });

  it('top 3 after invariants are all actionable SEND/WRITE-quality candidates', () => {
    const input = [
      candidate({
        id: 'discrepancy-1',
        score: 4.2,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Behavior drift: outcome-critical thread stalled before deadline',
        content: 'Critical approval thread has no owner response within 4 days of deadline.',
      }),
      candidate({
        id: 'strong-commitment',
        score: 4.0,
        type: 'commitment',
        title: 'Send signed packet to review board by 2026-04-02',
        content: 'Send signed packet to review board by 2026-04-02; board contact is panel@review.gov.',
      }),
      candidate({
        id: 'decision-frame',
        score: 3.6,
        type: 'signal',
        suggestedActionType: 'make_decision',
        title: 'Decide between two interview tracks with opposite risk profiles',
        content: 'Two interview tracks conflict on start date and reference requirements.',
      }),
      candidate({
        id: 'schedule-only',
        score: 4.5,
        type: 'signal',
        suggestedActionType: 'schedule',
        title: 'Schedule a 30 minute block to think',
        content: 'Schedule a 30 minute block to think about options.',
      }),
      candidate({
        id: 'generic-check',
        score: 4.4,
        type: 'signal',
        title: 'Check account status',
        content: 'Check account status update.',
      }),
    ];

    const { ranked } = applyRankingInvariants(input);
    const top3 = ranked.filter((c) => c.score > 0).slice(0, 3);
    expect(top3).toHaveLength(3);
    expect(top3.every((c) => passesTop3RankingInvariants(c))).toBe(true);
  });
});

