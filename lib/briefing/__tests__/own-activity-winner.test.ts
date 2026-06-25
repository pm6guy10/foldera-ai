import { describe, expect, it } from 'vitest';
import {
  isOwnActivityWinner,
  selectRankedCandidates,
  validateGeneratedArtifact,
} from '../generator';
import type { ScoredLoop } from '../scorer';
import type { StructuredContext } from '../generator';
import type { GenerationCandidateSource } from '../types';

// ---------------------------------------------------------------------------
// Helpers (mirrors winner-selection.test.ts shapes)
// ---------------------------------------------------------------------------

const BASE_BREAKDOWN = {
  stakes: 3,
  urgency: 0.6,
  tractability: 0.7,
  freshness: 0.8,
  actionTypeRate: 0.5,
  entityPenalty: 0,
};

function recentOwnActivitySource(
  signalType: 'email_sent' | 'file_modified',
  source: string,
  ageDays = 1,
): GenerationCandidateSource {
  return {
    kind: 'signal',
    source,
    signalType,
    occurredAt: new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString(),
    summary: 'Concrete source fact with enough context to build the next move from.',
  };
}

function makeCandidate(overrides: Partial<ScoredLoop> & { score: number }): ScoredLoop {
  return {
    id: overrides.id ?? 'cand-1',
    type: overrides.type ?? 'signal',
    title: overrides.title ?? 'Test candidate',
    content: overrides.content ?? 'Some content about the candidate.',
    suggestedActionType: overrides.suggestedActionType ?? 'write_document',
    matchedGoal: overrides.matchedGoal ?? null,
    breakdown: overrides.breakdown ?? BASE_BREAKDOWN,
    relatedSignals: overrides.relatedSignals ?? [],
    sourceSignals: overrides.sourceSignals ?? [
      {
        kind: 'signal',
        source: 'test',
        summary: 'Current source fact with enough concrete context to build the artifact.',
        occurredAt: new Date().toISOString(),
      },
    ],
    confidence_prior: overrides.confidence_prior ?? 70,
    ...overrides,
  } as ScoredLoop;
}

function ownActivityCandidate(overrides: Partial<ScoredLoop> & { score: number }): ScoredLoop {
  return makeCandidate({
    id: 'own-activity',
    type: 'signal',
    suggestedActionType: 'write_document',
    title: 'Draft you started: project proposal for the new initiative',
    content: 'You edited the proposal doc in Drive yesterday; the next section is unfinished.',
    sourceSignals: [recentOwnActivitySource('file_modified', 'google_drive')],
    ...overrides,
  });
}

// A clean, NON-disqualified behavioral-pattern discrepancy (grounded admin-deadline shape).
// Observation-shaped content would be disqualified by other gates, masking the promotion path.
function behavioralPatternDiscrepancy(
  overrides: Partial<ScoredLoop> & { score: number },
): ScoredLoop {
  return makeCandidate({
    id: 'disc',
    type: 'discrepancy',
    discrepancyClass: 'behavioral_pattern',
    suggestedActionType: 'write_document',
    title: 'Permit review packet still unsigned',
    content: 'The permit review packet for the Cedar project remains unsigned and the deadline approaches.',
    ...overrides,
  } as Partial<ScoredLoop> & { score: number });
}

const NO_GUARDRAILS = { approvedRecently: [], skippedRecently: [] };

// ---------------------------------------------------------------------------
// isOwnActivityWinner — pure detector
// ---------------------------------------------------------------------------

describe('isOwnActivityWinner', () => {
  it('detects a recent sent-mail signal', () => {
    const loop = makeCandidate({
      score: 2.0,
      sourceSignals: [recentOwnActivitySource('email_sent', 'gmail')],
    });
    expect(isOwnActivityWinner(loop)).toBe(true);
  });

  it('detects a recent drive file edit', () => {
    const loop = makeCandidate({
      score: 2.0,
      sourceSignals: [recentOwnActivitySource('file_modified', 'google_drive')],
    });
    expect(isOwnActivityWinner(loop)).toBe(true);
  });

  it('does NOT detect a stale (>7d) own-activity signal', () => {
    const loop = makeCandidate({
      score: 2.0,
      sourceSignals: [recentOwnActivitySource('email_sent', 'gmail', 10)],
    });
    expect(isOwnActivityWinner(loop)).toBe(false);
  });

  it('does NOT detect a non-drive file_modified signal', () => {
    const loop = makeCandidate({
      score: 2.0,
      sourceSignals: [recentOwnActivitySource('file_modified', 'uploaded_document')],
    });
    expect(isOwnActivityWinner(loop)).toBe(false);
  });

  it('does NOT detect an ordinary received-mail signal', () => {
    const loop = makeCandidate({
      score: 2.0,
      sourceSignals: [
        { kind: 'signal', source: 'gmail', signalType: 'email_received', occurredAt: new Date().toISOString() },
      ],
    });
    expect(isOwnActivityWinner(loop)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// selectRankedCandidates — promotion + carve-out
// ---------------------------------------------------------------------------

describe('selectRankedCandidates — Rung 1 own-activity promotion', () => {
  it('(1) own-activity beats a higher-raw-score behavioral-pattern discrepancy', () => {
    const own = ownActivityCandidate({ score: 2.0 });
    const disc = behavioralPatternDiscrepancy({ score: 3.0 });
    const { ranked } = selectRankedCandidates([disc, own], NO_GUARDRAILS);
    expect(ranked[0].candidate.id).toBe('own-activity');
  });

  it('(2) own-activity wins even when discrepancy leads pre-promotion (proves promotion + carve-out)', () => {
    // Discrepancy raw score is much higher so it sorts first before any promotion runs.
    const own = ownActivityCandidate({ score: 1.5 });
    const disc = behavioralPatternDiscrepancy({ score: 5.0 });
    const { ranked } = selectRankedCandidates([disc, own], NO_GUARDRAILS);
    expect(ranked[0].candidate.id).toBe('own-activity');
    expect(ranked[0].note).toContain('own-activity (Rung 1)');
  });

  it('(3) stale (>7d) own-activity is NOT promoted; discrepancy keeps the top', () => {
    const stale = ownActivityCandidate({
      score: 1.5,
      sourceSignals: [recentOwnActivitySource('file_modified', 'google_drive', 12)],
    });
    const disc = behavioralPatternDiscrepancy({ score: 3.0 });
    const { ranked } = selectRankedCandidates([disc, stale], NO_GUARDRAILS);
    expect(ranked[0].candidate.id).toBe('disc');
  });

  it('(4) a plain discrepancy is never promoted by the own-activity path', () => {
    const disc = behavioralPatternDiscrepancy({ score: 3.0 });
    const plainSignal = makeCandidate({ id: 'plain', score: 2.0, title: 'Plain non-own-activity task' });
    const { ranked } = selectRankedCandidates([disc, plainSignal], NO_GUARDRAILS);
    // Top is whatever the existing ranking produces; the own-activity note must NEVER appear.
    expect(ranked.every((r) => !r.note.includes('own-activity (Rung 1)'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateGeneratedArtifact — own-activity forces finished/next-move shape
// ---------------------------------------------------------------------------

function baseCtx(ownActivity: boolean): StructuredContext {
  return {
    selected_candidate: 'Draft you started',
    candidate_class: 'signal',
    candidate_title: 'Draft you started: project proposal',
    candidate_reason: 'You edited the proposal doc in Drive yesterday.',
    candidate_goal: null,
    matched_goal_category: 'work',
    candidate_score: 2.0,
    candidate_due_date: null,
    candidate_context_enrichment: null,
    supporting_signals: [],
    life_context_signals: [],
    surgical_raw_facts: [],
    active_goals: [],
    locked_constraints: null,
    locked_contacts_prompt: null,
    recent_action_history_7d: [],
    has_real_target: false,
    has_real_recipient: false,
    has_recent_evidence: true,
    already_acted_recently: false,
    decision_already_made: false,
    can_execute_without_editing: true,
    has_due_date_or_time_anchor: false,
    conflicts_with_locked_constraints: false,
    constraint_violation_codes: [],
    researcher_insight: null,
    user_identity_context: null,
    user_full_name: 'the user',
    user_first_name: '',
    goal_gap_analysis: [],
    already_sent_14d: [],
    behavioral_mirrors: [],
    conviction_math: null,
    behavioral_history: null,
    avoidance_observations: [],
    relationship_timeline: null,
    competition_context: null,
    confidence_prior: 70,
    required_causal_diagnosis: { why_exists_now: 'x', mechanism: 'y' } as StructuredContext['required_causal_diagnosis'],
    trigger_context: null,
    recipient_brief: null,
    hunt_send_message_recipient_allowlist: [],
    discrepancy_class: null,
    candidate_analysis: '',
    entity_analysis: null,
    entity_conversation_state: null,
    user_voice_patterns: null,
    own_activity_winner: ownActivity,
  } as StructuredContext;
}

describe('validateGeneratedArtifact — own_activity_unfinished bar', () => {
  // Observation-only artifact: no first-person finished work, no ready-to-send draft.
  const observationPayload = {
    artifact_type: 'write_document',
    directive: 'Here is what you have been doing on the proposal draft.',
    why_now: 'The draft has been in flight.',
    insight: 'The proposal draft is partially complete and stalled.',
    evidence: [{ description: 'Drive edit from yesterday on the proposal.' }],
    artifact: {
      title: 'Proposal status',
      content: 'The proposal document has several unfinished sections that remain open.',
    },
  } as unknown as Parameters<typeof validateGeneratedArtifact>[0];

  // Finished/next-move artifact: first-person + a concrete dated next move.
  const finishedPayload = {
    artifact_type: 'write_document',
    directive: 'Finish the proposal: I drafted the closing section ready to paste.',
    why_now: 'You started this in Drive yesterday; here is the completed next move.',
    insight: 'The remaining section is now drafted.',
    evidence: [{ description: 'Drive edit from yesterday on the proposal.' }],
    artifact: {
      title: 'Proposal — closing section',
      content:
        'I will submit the proposal by 2026-06-30. Say this to the team: the closing section is done and ready to ship.',
    },
  } as unknown as Parameters<typeof validateGeneratedArtifact>[0];

  it('(5a) own-activity winner with observation-only artifact raises own_activity_unfinished', () => {
    const issues = validateGeneratedArtifact(observationPayload, baseCtx(true), 'write_document');
    expect(issues.some((i) => i.startsWith('own_activity_unfinished'))).toBe(true);
  });

  it('(5b) own-activity winner with finished/next-move artifact raises no own_activity_unfinished', () => {
    const issues = validateGeneratedArtifact(finishedPayload, baseCtx(true), 'write_document');
    expect(issues.some((i) => i.startsWith('own_activity_unfinished'))).toBe(false);
  });

  it('(5c) non-own-activity winner with the same observation artifact does NOT raise own_activity_unfinished', () => {
    const issues = validateGeneratedArtifact(observationPayload, baseCtx(false), 'write_document');
    expect(issues.some((i) => i.startsWith('own_activity_unfinished'))).toBe(false);
  });
});
