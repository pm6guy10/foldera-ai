/**
 * Coarse bucket keys for cross-user priors — no PII, no narrative text.
 */

import type { GenerationCandidateDiscoveryLog, GenerationCandidateLog } from '@/lib/briefing/types';

export type MlVelocityBucket = 'na' | 'cooling' | 'neutral' | 'warming';

export interface MlBucketInputs {
  goalCategory: string;
  candidateType: string;
  discrepancyClass: string;
  actionType: string;
  velocityBucket: MlVelocityBucket;
  silenceFlag: boolean;
}

function norm(s: string): string {
  const t = s.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 48);
  return t.length > 0 ? t : 'none';
}

/**
 * Stable bucket key for global priors aggregation and scorer lookup.
 */
export function buildDirectiveMlBucketKey(inputs: MlBucketInputs): string {
  return [
    'v1',
    norm(inputs.goalCategory),
    norm(inputs.candidateType),
    norm(inputs.discrepancyClass),
    norm(inputs.actionType),
    inputs.velocityBucket,
    inputs.silenceFlag ? '1' : '0',
  ].join('|');
}

export function velocityRatioToBucket(ratio: number | null | undefined): MlVelocityBucket {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return 'na';
  if (ratio < 0.85) return 'cooling';
  if (ratio > 1.15) return 'warming';
  return 'neutral';
}

/** Base candidate from open-loop scoring (pre-ScoredLoop). */
export function mlBucketInputsFromBaseCandidate(c: {
  type: string;
  actionType: string;
  matchedGoal: { category: string } | null;
  entityPatterns?: unknown;
}): MlBucketInputs {
  let velocityBucket: MlVelocityBucket = 'na';
  let silenceFlag = false;
  const patterns = c.entityPatterns as Record<string, unknown> | undefined;
  const bx = patterns?.bx_stats as Record<string, unknown> | undefined;
  if (bx && typeof bx === 'object') {
    velocityBucket = velocityRatioToBucket(
      typeof bx.velocity_ratio === 'number' ? bx.velocity_ratio : null,
    );
    silenceFlag = bx.silence_detected === true;
  }
  return {
    goalCategory: c.matchedGoal?.category ?? 'none',
    candidateType: c.type,
    discrepancyClass: 'none',
    actionType: c.actionType,
    velocityBucket,
    silenceFlag,
  };
}

/** Discrepancy row from discrepancy-detector. */
export function mlBucketInputsFromDiscrepancy(d: {
  class: string;
  suggestedActionType: string;
  matchedGoal: { category: string } | null;
  entityName?: string;
}): MlBucketInputs {
  return {
    goalCategory: d.matchedGoal?.category ?? 'none',
    candidateType: 'discrepancy',
    discrepancyClass: d.class,
    actionType: d.suggestedActionType,
    velocityBucket: 'na',
    silenceFlag: false,
  };
}

/** Insight scan candidate. */
export function mlBucketInputsFromInsight(insight: {
  suggested_action: string;
  pattern_type?: string;
}): MlBucketInputs {
  return {
    goalCategory: 'none',
    candidateType: 'insight',
    discrepancyClass: norm(insight.pattern_type ?? 'behavioral_pattern'),
    actionType: insight.suggested_action,
    velocityBucket: 'na',
    silenceFlag: false,
  };
}

export function mlBucketInputsFromWinnerLog(
  discovery: GenerationCandidateDiscoveryLog | null | undefined,
): MlBucketInputs | null {
  const selected = discovery?.topCandidates?.find((x) => x.decision === 'selected') ?? discovery?.topCandidates?.[0];
  if (!selected) return null;
  return {
    goalCategory: selected.targetGoal?.category ?? 'none',
    candidateType: selected.candidateType,
    discrepancyClass: selected.discrepancyClass ? norm(String(selected.discrepancyClass)) : 'none',
    actionType: selected.actionType,
    velocityBucket: 'na',
    silenceFlag: false,
  };
}

export function serializeTopCandidatesForMl(top: GenerationCandidateLog[] | undefined): unknown[] {
  if (!top?.length) return [];
  return top.slice(0, 5).map((c) => ({
    id: c.id,
    rank: c.rank,
    candidateType: c.candidateType,
    discrepancyClass: c.discrepancyClass ?? null,
    actionType: c.actionType,
    score: c.score,
    decision: c.decision,
    goalCategory: c.targetGoal?.category ?? null,
  }));
}

export function featuresJsonFromInputs(inputs: MlBucketInputs): Record<string, unknown> {
  return {
    goal_category: inputs.goalCategory,
    candidate_type: inputs.candidateType,
    discrepancy_class: inputs.discrepancyClass,
    action_type: inputs.actionType,
    velocity_bucket: inputs.velocityBucket,
    silence_flag: inputs.silenceFlag,
  };
}
