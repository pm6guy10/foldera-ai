import { describe, expect, it } from 'vitest';
import {
  buildDirectiveMlBucketKey,
  mlBucketInputsFromBaseCandidate,
  mlBucketInputsFromDiscrepancy,
  mlBucketInputsFromWinnerLog,
  velocityRatioToBucket,
} from '@/lib/ml/outcome-features';
import type { GenerationCandidateDiscoveryLog } from '@/lib/briefing/types';

describe('outcome-features', () => {
  it('buildDirectiveMlBucketKey is stable', () => {
    const k = buildDirectiveMlBucketKey({
      goalCategory: 'career',
      candidateType: 'discrepancy',
      discrepancyClass: 'decay',
      actionType: 'send_message',
      velocityBucket: 'na',
      silenceFlag: false,
    });
    expect(k).toBe('v1|career|discrepancy|decay|send_message|na|0');
  });

  it('velocityRatioToBucket', () => {
    expect(velocityRatioToBucket(null)).toBe('na');
    expect(velocityRatioToBucket(0.5)).toBe('cooling');
    expect(velocityRatioToBucket(1.0)).toBe('neutral');
    expect(velocityRatioToBucket(1.3)).toBe('warming');
  });

  it('mlBucketInputsFromBaseCandidate reads bx_stats', () => {
    const inputs = mlBucketInputsFromBaseCandidate({
      type: 'relationship',
      actionType: 'send_message',
      matchedGoal: { category: 'relationship', text: 'x', priority: 3 },
      entityPatterns: {
        bx_stats: { velocity_ratio: 0.4, silence_detected: true },
      },
    });
    expect(inputs.velocityBucket).toBe('cooling');
    expect(inputs.silenceFlag).toBe(true);
  });

  it('mlBucketInputsFromDiscrepancy', () => {
    const inputs = mlBucketInputsFromDiscrepancy({
      class: 'avoidance',
      suggestedActionType: 'write_document',
      matchedGoal: { category: 'career', text: 'job', priority: 2 },
    });
    expect(inputs.candidateType).toBe('discrepancy');
    expect(buildDirectiveMlBucketKey(inputs)).toContain('avoidance');
  });

  it('mlBucketInputsFromWinnerLog uses selected candidate', () => {
    const discovery: GenerationCandidateDiscoveryLog = {
      candidateCount: 2,
      suppressedCandidateCount: 0,
      selectionMargin: 1,
      selectionReason: 'test',
      failureReason: null,
      topCandidates: [
        {
          id: 'a',
          rank: 1,
          candidateType: 'signal',
          actionType: 'send_message',
          score: 3,
          scoreBreakdown: {} as any,
          targetGoal: { text: 'g', priority: 3, category: 'financial' },
          sourceSignals: [],
          decision: 'rejected',
          decisionReason: 'x',
        },
        {
          id: 'b',
          rank: 2,
          candidateType: 'discrepancy',
          discrepancyClass: 'drift',
          actionType: 'write_document',
          score: 4,
          scoreBreakdown: {} as any,
          targetGoal: null,
          sourceSignals: [],
          decision: 'selected',
          decisionReason: 'y',
        },
      ],
    };
    const inputs = mlBucketInputsFromWinnerLog(discovery);
    expect(inputs?.goalCategory).toBe('none');
    expect(inputs?.discrepancyClass).toBe('drift');
  });
});
