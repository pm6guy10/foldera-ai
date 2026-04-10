/**
 * Verify the ranking invariant fix by simulating the scoring with real discrepancies
 * and showing what the new invariant would do.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { applyRankingInvariants, computeCandidateScore } from '../lib/briefing/scorer';
import type { ScoredLoop } from '../lib/briefing/scorer';

// Simulate the exact discrepancy candidates from debug-detect-discrepancy output
// (without failure suppression, to show what WOULD happen)

const mockApprovalHistory = {
  overall: [],
  byType: new Map(),
};

// Build mock scored candidates
function makeMockDiscrepancy(
  id: string,
  discrepancyClass: string,
  entityName: string | undefined,
  suggestedActionType: 'send_message' | 'write_document' | 'make_decision',
  stakes: number,
  urgency: number,
  fromInsightScan = false,
): ScoredLoop {
  const score = computeCandidateScore({
    stakes,
    urgency,
    tractability: 0.70,
    actionType: suggestedActionType,
    entityPenalty: 0,
    daysSinceLastSurface: 30,
    approvalHistory: [],
    highStakes: stakes >= 4,
    globalPriorRate: null,
  }).score;

  return {
    id,
    type: 'discrepancy',
    title: `Mock ${discrepancyClass}: ${entityName ?? 'none'}`,
    content: `Mock content for ${discrepancyClass}`,
    suggestedActionType,
    matchedGoal: null,
    score,
    breakdown: {
      stakes,
      urgency,
      tractability: 0.70,
      freshness: 1.0,
      actionTypeRate: 0.8,
      entityPenalty: 0,
    },
    relatedSignals: [],
    sourceSignals: entityName ? [{ kind: 'relationship', summary: `${entityName}: interaction history` }] : [],
    entityName,
    confidence_prior: 70,
    discrepancyClass: discrepancyClass as any,
    trigger: {
      baseline_state: 'baseline',
      current_state: 'current',
      delta: 'delta',
      timeframe: '30d',
      outcome_class: 'relationship',
      why_now: 'why now',
    },
    fromInsightScan,
  };
}

// The candidates from actual discrepancy detection (without failure suppression)
const mockCandidates: ScoredLoop[] = [
  // engagement_collapse for Brandon Kapp (self-contact issue, but let's include)
  makeMockDiscrepancy(
    'discrepancy_collapse_115183eb',
    'engagement_collapse',
    'Brandon Kapp',
    'send_message',
    5,
    0.8,
  ),
  // behavioral_pattern (bp_theme_deadline) - abstract, no entity, write_document
  makeMockDiscrepancy(
    'discrepancy_bp_theme_deadline',
    'behavioral_pattern',
    undefined,
    'write_document',
    4,
    0.8,
    false, // from discrepancy-detector, not insight scan
  ),
  // decay_keri - real person, send_message
  makeMockDiscrepancy(
    'discrepancy_decay_aa7733d9',
    'decay',
    'keri nopens',
    'send_message',
    4,
    0.55,
  ),
  // decay_cheryl (locked, but for simulation ignore lock)
  makeMockDiscrepancy(
    'discrepancy_decay_ecb5ca78',
    'decay',
    'cheryl anderson',
    'send_message',
    3,
    0.55,
  ),
];

console.log('=== BEFORE RANKING INVARIANTS ===');
for (const c of [...mockCandidates].sort((a, b) => b.score - a.score)) {
  console.log(`  ${c.id?.slice(0, 50)} | class=${c.discrepancyClass} | entity=${c.entityName ?? 'none'} | action=${c.suggestedActionType} | score=${c.score.toFixed(3)}`);
}

const result = applyRankingInvariants(mockCandidates);
const ranked = result.ranked.filter(c => c.score > 0).sort((a, b) => b.score - a.score);

console.log('\n=== AFTER RANKING INVARIANTS ===');
for (const c of ranked) {
  const diag = result.diagnostics.find(d => d.id === c.id);
  const penalties = diag?.penaltyReasons.join(', ') ?? '';
  console.log(`  ${c.id?.slice(0, 50)} | class=${c.discrepancyClass} | entity=${c.entityName ?? 'none'} | action=${c.suggestedActionType} | score=${c.score.toFixed(3)} | ${penalties}`);
}

console.log('\n=== WINNER ===');
if (ranked.length > 0) {
  const winner = ranked[0];
  console.log(`  ${winner.id}`);
  console.log(`  type=${winner.type} | discrepancyClass=${winner.discrepancyClass}`);
  console.log(`  entityName=${winner.entityName ?? 'none'}`);
  console.log(`  suggestedActionType=${winner.suggestedActionType}`);
  console.log(`  score=${winner.score.toFixed(3)}`);
  
  const isThreadBackedSendable = 
    winner.suggestedActionType === 'send_message' &&
    winner.entityName != null &&
    winner.discrepancyClass !== 'behavioral_pattern';
  
  if (isThreadBackedSendable) {
    console.log('\n✅ Winner is thread-backed sendable (real person + send_message)');
    if (winner.discrepancyClass === 'decay') {
      console.log('✅ Winner is decay class — correct for fading connection keri');
    }
  } else {
    console.log('\n❌ Winner is NOT thread-backed sendable');
  }
}
