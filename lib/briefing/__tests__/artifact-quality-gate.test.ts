import { describe, expect, it } from 'vitest';
import {
  evaluateArtifactQualityFailSafe,
  evaluateArtifactQualityGate,
  summarizeArtifactQualityRun,
} from '../artifact-quality-gate';
import {
  BAD_ARTIFACT_GOLD_SET_V1_2,
  GOOD_ARTIFACT_GOLD_SET_V1_2,
  STALE_INTERVIEW_SUPPRESSION_FIXTURE,
} from './artifact-gold-set-v1-2.fixture';

describe('artifact quality gold set v1.2', () => {
  it('rejects every bad fixture with a deterministic reason', () => {
    const results = BAD_ARTIFACT_GOLD_SET_V1_2.map((item) => ({
      item,
      result: evaluateArtifactQualityGate({
        directive: item.directive,
        artifact: item.artifact,
        sourceFacts: item.sourceFacts,
        now: item.now ?? new Date('2026-04-28T12:00:00.000Z'),
      }),
    }));

    expect(results).toHaveLength(18);
    for (const { item, result } of results) {
      expect(result.passes, item.id).toBe(false);
      expect(result.reasons, item.id).toContain(item.expectedReason);
    }
  });

  it('allows every good fixture and assigns the expected category', () => {
    const results = GOOD_ARTIFACT_GOLD_SET_V1_2.map((item) => ({
      item,
      result: evaluateArtifactQualityGate({
        directive: item.directive,
        artifact: item.artifact,
        sourceFacts: item.sourceFacts,
        now: item.now ?? new Date('2026-04-28T12:00:00.000Z'),
      }),
    }));

    expect(results).toHaveLength(10);
    for (const { item, result } of results) {
      expect(result.passes, `${item.id}: ${result.reasons.join(',')}`).toBe(true);
      expect(result.category, item.id).toBe(item.expectedCategory);
      expect(result.reasons).toEqual([]);
    }
  });

  it('treats stale interview prep as suppression behavior, not a good artifact', () => {
    const result = evaluateArtifactQualityGate({
      directive: STALE_INTERVIEW_SUPPRESSION_FIXTURE.directive,
      artifact: STALE_INTERVIEW_SUPPRESSION_FIXTURE.artifact,
      now: STALE_INTERVIEW_SUPPRESSION_FIXTURE.now,
    });

    expect(result.passes).toBe(false);
    expect(result.reasons).toContain('stale_event');
    expect(result.category).not.toBe('ROLE_FIT_PACKET');
  });

  it('keeps fail-safe alerts separate from artifact unblocking', () => {
    const current = summarizeArtifactQualityRun([
      { passes: false, category: null, reasons: ['generic_coaching'] },
      { passes: false, category: null, reasons: ['summary_only'] },
    ]);

    expect(evaluateArtifactQualityFailSafe({ current, deliveredLast24h: 0 })).toEqual({
      status: 'RED',
      rejectRate: 1,
      reason: 'all_artifacts_rejected_and_zero_delivered_24h',
    });

    expect(
      evaluateArtifactQualityFailSafe({
        current: { rejected: 9, allowed: 1, delivered: 1 },
        previous: { rejected: 6, allowed: 0, delivered: 0 },
        deliveredLast24h: 1,
      }),
    ).toEqual({
      status: 'YELLOW',
      rejectRate: 0.9,
      reason: 'reject_rate_above_85pct_two_runs',
    });
  });
});
