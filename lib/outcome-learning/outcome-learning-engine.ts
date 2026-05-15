import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildOutcomeAutopsyArtifact,
  fetchOutcomeAutopsyInput,
  type AutopsyActionRow,
  type AutopsyPatternMetricRow,
  type AutopsySignalRow,
  type OutcomeAutopsyArtifact,
  type OutcomeAutopsyInput,
} from '@/lib/outcome-autopsy/outcome-autopsy';

export type RecommendationResponse =
  | 'approved'
  | 'skipped'
  | 'edited'
  | 'ignored'
  | 'rejected'
  | 'completed';

export type RecommendationOutcomeLabel = 'helped' | 'hurt' | 'neutral' | 'unknown';

export type EvidenceArtifactType =
  | 'job_description'
  | 'resume_used'
  | 'cover_letter'
  | 'interview_prompt'
  | 'prep_notes'
  | 'presentation_prompt'
  | 'case_packet_redacted'
  | 'follow_up_email'
  | 'reference_activity'
  | 'offer_letter'
  | 'negotiation_email'
  | 'acceptance_email'
  | 'outcome_confirmation';

export type EvidenceSensitivityLevel =
  | 'public'
  | 'personal'
  | 'confidential'
  | 'third_party_sensitive';

export type EvidenceRedactionStatus = 'not_needed' | 'redacted' | 'needs_redaction';

export type OutcomeSignalLabel =
  | 'positive_momentum'
  | 'negative_momentum'
  | 'conversion_signal'
  | 'risk_created'
  | 'risk_avoided'
  | 'decision_point'
  | 'decisive_action'
  | 'proof_of_fit'
  | 'outcome_confirmed'
  | 'outcome_failed'
  | 'unclear_relevance';

export type EvidenceConfidence = 'high' | 'medium' | 'low';
export type EvidenceCausalStatus = 'proven' | 'inferred' | 'unknown';

export type RawEvidenceArtifact = {
  id: string;
  artifact_type: EvidenceArtifactType;
  title: string;
  source_date: string;
  source_summary: string;
  sensitivity_level: EvidenceSensitivityLevel;
  redaction_status: EvidenceRedactionStatus;
  linked_goal_id: string | null;
  linked_action_ids: string[];
  linked_signal_ids: string[];
  source_ref: string;
  importance: 'high_signal' | 'supporting';
};

export type OutcomeEvidenceSignal = {
  id: string;
  signal_label: OutcomeSignalLabel;
  evidence_artifact_id: string;
  confidence: EvidenceConfidence;
  causal_status: EvidenceCausalStatus;
  explanation: string;
  supporting_source_refs: string[];
};

export type RecommendationFeedbackLedgerEntry = {
  id: string;
  user_id: string | null;
  goal_id: string | null;
  action_id: string;
  recommendation_type: string;
  recommendation_text: string;
  intended_outcome: string;
  confidence_reasoning_summary: string;
  source_signal_ids: string[];
  created_at: string;
  user_response: RecommendationResponse;
  user_response_reason: string | null;
  downstream_outcome_signal_id: string | null;
  outcome_label: RecommendationOutcomeLabel;
  learning_note: string;
  persistence_basis: string[];
};

export type PatternMemoryUpdate = {
  pattern_key: string;
  pattern_hash: string;
  domain: string;
  times_observed: number;
  times_associated_with_positive_outcome: number;
  times_associated_with_negative_outcome: number;
  user_feedback_alignment: 'aligned' | 'misaligned' | 'mixed' | 'unknown';
  example_goal_ids: string[];
  strongest_supporting_signal_ids: string[];
  last_seen_at: string;
  learning_note: string;
};

export type OutcomeLearningSnapshot = {
  generated_at: string;
  source: 'deterministic_outcome_learning';
  goal_id: string | null;
  evidence_packet: {
    raw_evidence: RawEvidenceArtifact[];
    summary: string;
  };
  outcome_signal_layer: OutcomeEvidenceSignal[];
  recommendation_feedback_ledger: RecommendationFeedbackLedgerEntry[];
  pattern_memory_updates: PatternMemoryUpdate[];
  what_foldera_learned: {
    outcome: string;
    what_worked: string[];
    what_did_not_work: string[];
    what_to_repeat: string[];
    what_to_avoid: string[];
    similar_future_opportunities_to_prioritize: string[];
    similar_future_opportunities_to_skip: string[];
  };
  uncertainty_notes: string[];
};

type BuildOptions = {
  now?: string;
  userId?: string | null;
};

type PatternMetricPersistenceRow = {
  user_id: string;
  pattern_hash: string;
  category: string;
  domain: string;
  total_activations: number;
  successful_outcomes: number;
  failed_outcomes: number;
};

export type PatternMetricPersistResult = {
  pattern_hash: string;
  status: 'inserted' | 'updated' | 'unchanged';
  total_activations: number;
  successful_outcomes: number;
  failed_outcomes: number;
};

function compact(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(compact).filter(Boolean).join(' ');
  if (typeof value === 'object') return Object.values(value).map(compact).filter(Boolean).join(' ');
  return '';
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function sourceIdFromRef(sourceRef: string): string | null {
  const [, id] = sourceRef.split(':');
  return id?.trim() || null;
}

function linkedSignalIdsForRefs(sourceRefs: string[]): string[] {
  return uniqueStrings(
    sourceRefs
      .filter((ref) => ref.startsWith('signal:') || ref.startsWith('seed:'))
      .map(sourceIdFromRef),
  );
}

function extractSignalIdsFromAction(action: AutopsyActionRow, input: OutcomeAutopsyInput): string[] {
  const ids = new Set<string>();
  const encoded = compact([action.evidence, action.execution_result, action.artifact]);
  for (const match of encoded.matchAll(/\b(sig-[a-z0-9-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi)) {
    ids.add(match[1]);
  }
  for (const signal of input.signals) {
    if (signal.source_id === action.id) ids.add(signal.id);
  }
  return [...ids];
}

function userResponseForAction(action: AutopsyActionRow): RecommendationResponse {
  const executionResult = action.execution_result ?? {};
  if (executionResult.user_response === 'edited' || executionResult.user_edited_artifact === true) return 'edited';
  if (action.status === 'executed') return 'completed';
  if (action.status === 'approved') return 'approved';
  if (action.status === 'draft_rejected') return 'rejected';
  if (action.status === 'skipped') return 'skipped';
  return 'ignored';
}

function outcomeLabelForAction(action: AutopsyActionRow, outcomeSignal: AutopsySignalRow | null): RecommendationOutcomeLabel {
  if (outcomeSignal?.outcome_label === 'CONFIRMED_WORKED') return 'helped';
  if (outcomeSignal?.outcome_label === 'CONFIRMED_DIDNT_WORK') return 'hurt';
  if (typeof action.feedback_weight === 'number') {
    if (action.feedback_weight > 0) return 'helped';
    if (action.feedback_weight < 0) return 'neutral';
  }
  if (action.status === 'executed') return 'helped';
  if (action.status === 'skipped' || action.status === 'draft_rejected') return 'neutral';
  return 'unknown';
}

function responseReasonForAction(action: AutopsyActionRow, input: OutcomeAutopsyInput): string | null {
  const executionResult = action.execution_result ?? {};
  const explicitReason =
    typeof executionResult.user_response_reason === 'string'
      ? executionResult.user_response_reason
      : typeof executionResult.skip_reason === 'string'
        ? executionResult.skip_reason
        : typeof action.reason === 'string'
          ? action.reason
          : null;
  if (explicitReason) return explicitReason;

  const relatedFeedback = input.feedback.find((feedback) => {
    const text = compact(feedback).toLowerCase();
    return text.includes(action.id.toLowerCase()) || text.includes(action.directive_text.toLowerCase().slice(0, 32));
  });
  return relatedFeedback?.notes ?? relatedFeedback?.user_action ?? null;
}

function learningNoteForAction(
  action: AutopsyActionRow,
  response: RecommendationResponse,
  outcomeLabel: RecommendationOutcomeLabel,
): string {
  if (response === 'completed' && outcomeLabel === 'helped') {
    return 'Completed or approved action aligned with the outcome path; treat as likely useful in this context, not proof of sole cause.';
  }
  if (response === 'skipped' || response === 'rejected') {
    return 'Skipped or rejected action becomes preference/timing feedback rather than a generic failure.';
  }
  if (response === 'edited') {
    return 'Edited action means the recommendation direction may be useful while the exact output needed user correction.';
  }
  return 'Keep as unknown learning until a later outcome signal or user reason connects it to a result.';
}

function buildRecommendationLedger(
  artifact: OutcomeAutopsyArtifact,
  input: OutcomeAutopsyInput,
  options: BuildOptions,
): RecommendationFeedbackLedgerEntry[] {
  const decisiveActionIds = new Set(artifact.decisive_actions.map((action) => action.id));
  const timelineActionIds = new Set(
    artifact.timeline.filter((item) => item.kind === 'action').map((item) => item.id),
  );
  const goalId = artifact.goal.id;
  const rows: RecommendationFeedbackLedgerEntry[] = [];

  for (const action of input.actions) {
    if (!decisiveActionIds.has(action.id) && !timelineActionIds.has(action.id)) continue;

    const response = userResponseForAction(action);
    const outcomeSignal =
      input.signals.find((signal) => signal.source_id === action.id && Boolean(signal.outcome_label)) ?? null;
    const outcomeLabel = outcomeLabelForAction(action, outcomeSignal);
    const sourceSignalIds = extractSignalIdsFromAction(action, input);

    rows.push({
      id: `ledger:${action.id}`,
      user_id: options.userId ?? null,
      goal_id: goalId,
      action_id: action.id,
      recommendation_type: action.action_type ?? 'unknown',
      recommendation_text: action.directive_text,
      intended_outcome: action.reason ?? 'Move the connected goal toward a useful outcome.',
      confidence_reasoning_summary:
        action.reason ?? 'Stored action row did not include a separate reasoning summary.',
      source_signal_ids: sourceSignalIds,
      created_at: action.generated_at ?? action.approved_at ?? action.executed_at ?? artifact.generated_at,
      user_response: response,
      user_response_reason: responseReasonForAction(action, input),
      downstream_outcome_signal_id: outcomeSignal?.id ?? null,
      outcome_label: outcomeLabel,
      learning_note: learningNoteForAction(action, response, outcomeLabel),
      persistence_basis: uniqueStrings([
        'tkg_actions',
        sourceSignalIds.length > 0 ? 'tkg_signals' : null,
        input.feedback.length > 0 ? 'tkg_feedback' : null,
      ]),
    });
  }

  for (const decisiveAction of artifact.decisive_actions) {
    if (rows.some((row) => row.action_id === decisiveAction.id)) continue;
    const signalAction = input.signals.find((signal) => signal.id === decisiveAction.id);
    if (!signalAction) continue;
    rows.push({
      id: `ledger:${signalAction.id}`,
      user_id: options.userId ?? null,
      goal_id: goalId,
      action_id: signalAction.id,
      recommendation_type: signalAction.type ?? 'stored_signal_action',
      recommendation_text: decisiveAction.label,
      intended_outcome: decisiveAction.why_decisive,
      confidence_reasoning_summary:
        'Stored signal/action event is part of the completed outcome path; usefulness is inferred from later movement, not proven as sole cause.',
      source_signal_ids: [signalAction.id],
      created_at: signalAction.occurred_at ?? signalAction.created_at ?? artifact.generated_at,
      user_response: signalAction.type === 'email_sent' ? 'completed' : 'ignored',
      user_response_reason: null,
      downstream_outcome_signal_id: null,
      outcome_label: signalAction.type === 'email_sent' ? 'helped' : 'unknown',
      learning_note:
        'A stored timeline action likely helped because it gave the outcome path a concrete next step; keep the claim framed as inferred.',
      persistence_basis: ['tkg_signals'],
    });
  }

  if (artifact.gold_standard_seed) {
    rows.push(
      {
        id: 'ledger:cwu-seed-presentation',
        user_id: options.userId ?? null,
        goal_id: goalId,
        action_id: 'cwu-seed-presentation',
        recommendation_type: 'presentation_work_sample',
        recommendation_text:
          'Use the second-round work sample to show accommodation judgment and case-note discipline.',
        intended_outcome: 'Convert broad background into visible Access Specialist job performance.',
        confidence_reasoning_summary:
          'Seed context says the hiring process required a realistic Access Planning Meeting presentation.',
        source_signal_ids: ['cwu-seed-realistic-job-simulation'],
        created_at: '2026-05-07T20:00:00.000Z',
        user_response: 'completed',
        user_response_reason: 'Presentation reportedly landed well and the process moved to references.',
        downstream_outcome_signal_id: 'cwu-seed-offer',
        outcome_label: 'helped',
        learning_note:
          'Likely helped because it matched the job thesis; still labeled as inferred, not proven causality.',
        persistence_basis: ['user_provided_seed_context', 'tkg_commitments', 'tkg_signals'],
      },
      {
        id: 'ledger:cwu-seed-clean-acceptance',
        user_id: options.userId ?? null,
        goal_id: goalId,
        action_id: 'cwu-seed-clean-acceptance',
        recommendation_type: 'acceptance_decision',
        recommendation_text: 'Accept cleanly after CWU confirmed the public-sector compensation constraint.',
        intended_outcome: 'Preserve the relationship and lock the strategic bridge role.',
        confidence_reasoning_summary:
          'Seed context confirms one compensation question, a firm no, and professional acceptance.',
        source_signal_ids: ['cwu-seed-offer'],
        created_at: '2026-05-15T12:00:00.000Z',
        user_response: 'completed',
        user_response_reason: 'Accepted after one bounded counter was denied.',
        downstream_outcome_signal_id: 'cwu-seed-offer',
        outcome_label: 'helped',
        learning_note:
          'Risk management pattern: counter once if justified, then accept cleanly after a firm internal-equity no.',
        persistence_basis: ['user_provided_seed_context'],
      },
      {
        id: 'ledger:cwu-seed-salary-counter',
        user_id: options.userId ?? null,
        goal_id: goalId,
        action_id: 'cwu-seed-salary-counter',
        recommendation_type: 'compensation_question',
        recommendation_text: 'Ask one respectful compensation question based on relevant experience.',
        intended_outcome: 'Test salary flexibility without destabilizing the offer.',
        confidence_reasoning_summary:
          'Seed context says the counter was bounded and CWU denied it without rescinding.',
        source_signal_ids: ['cwu-seed-offer'],
        created_at: '2026-05-14T20:00:00.000Z',
        user_response: 'completed',
        user_response_reason: 'CWU said salary was fixed by structured and equitable compensation practices.',
        downstream_outcome_signal_id: 'cwu-seed-offer',
        outcome_label: 'neutral',
        learning_note:
          'The ask did not improve pay but also did not break the offer; repeated counters after a firm no would create risk.',
        persistence_basis: ['user_provided_seed_context'],
      },
    );
  }

  return rows;
}

const evidenceDateByType: Record<EvidenceArtifactType, string> = {
  job_description: '2026-04-08T12:00:00.000Z',
  resume_used: '2026-04-08T12:30:00.000Z',
  cover_letter: '2026-04-08T12:45:00.000Z',
  interview_prompt: '2026-05-03T12:00:00.000Z',
  prep_notes: '2026-05-03T12:00:00.000Z',
  presentation_prompt: '2026-05-03T12:00:00.000Z',
  case_packet_redacted: '2026-05-03T12:00:00.000Z',
  follow_up_email: '2026-04-23T16:27:14.000Z',
  reference_activity: '2026-05-08T12:00:00.000Z',
  offer_letter: '2026-05-14T18:00:00.000Z',
  negotiation_email: '2026-05-14T20:00:00.000Z',
  acceptance_email: '2026-05-15T12:00:00.000Z',
  outcome_confirmation: '2026-05-14T18:00:00.000Z',
};

function mapHighSignalArtifactType(id: string): EvidenceArtifactType | null {
  if (id === 'second_round_prompt') return 'interview_prompt';
  if (id === 'presentation_prompt') return 'presentation_prompt';
  if (id === 'redacted_case_packet') return 'case_packet_redacted';
  if (id === 'reference_activity') return 'reference_activity';
  if (id === 'official_offer_letter') return 'offer_letter';
  if (id === 'job_description') return 'job_description';
  if (id === 'resume_used') return 'resume_used';
  if (id === 'cover_letter') return 'cover_letter';
  return null;
}

function evidenceSummary(type: EvidenceArtifactType, fallback: string): string {
  switch (type) {
    case 'job_description':
      return 'CWU Access Specialist role required student support, documentation review, accommodation judgment, faculty/staff communication, and disability-law awareness.';
    case 'resume_used':
      return 'Resume/application materials positioned broad experience for disability-support, documentation, public-service, and coordination work.';
    case 'cover_letter':
      return 'Cover letter compressed broad background into the role logic rather than generic interest.';
    case 'interview_prompt':
      return 'Second-round email required a 15-minute Access Planning Meeting presentation, documentation assessment, reasonable-accommodation judgment, interactive-process reasoning, and a written case-note example.';
    case 'presentation_prompt':
      return 'Presentation prompt tested live judgment, student-centered communication, academic-integrity balancing, and case-management reasoning.';
    case 'case_packet_redacted':
      return 'Redacted/synthetic case packet preserves only the reasoning structure: functional limits, requested accommodations, needed clarification, neutral case note, and minimal faculty/campus coordination.';
    case 'reference_activity':
      return 'Reference activity after second round indicated finalist-level due diligence while the prior reference-risk narrative stayed contained.';
    case 'offer_letter':
      return 'Official CWU offer confirmed the final result, salary, start-date target, and background-check contingency.';
    case 'negotiation_email':
      return 'One bounded compensation question created limited risk and tested flexibility without turning into repeated friction.';
    case 'acceptance_email':
      return 'Clean acceptance after compensation denial preserved the win and relationship.';
    case 'outcome_confirmation':
      return 'Outcome confirmation anchors the autopsy in a real completed offer rather than speculative prediction.';
    case 'follow_up_email':
      return 'Stored follow-up/action evidence showed concrete availability and kept the CWU process moving.';
    case 'prep_notes':
      return 'Preparation themes were useful only where tied to job-specific access planning and documentation reasoning.';
    default:
      return fallback;
  }
}

function sensitivityFor(type: EvidenceArtifactType): EvidenceSensitivityLevel {
  if (type === 'job_description') return 'public';
  if (type === 'case_packet_redacted') return 'third_party_sensitive';
  if (type === 'interview_prompt' || type === 'presentation_prompt' || type === 'reference_activity') return 'confidential';
  if (type === 'offer_letter' || type === 'negotiation_email' || type === 'acceptance_email') return 'confidential';
  return 'personal';
}

function redactionFor(type: EvidenceArtifactType): EvidenceRedactionStatus {
  if (type === 'case_packet_redacted') return 'redacted';
  return 'not_needed';
}

function buildEvidencePacket(artifact: OutcomeAutopsyArtifact, input: OutcomeAutopsyInput): OutcomeLearningSnapshot['evidence_packet'] {
  const raw: RawEvidenceArtifact[] = [];
  const goalId = artifact.goal.id;

  for (const item of artifact.high_signal_artifacts ?? []) {
    const artifactType = mapHighSignalArtifactType(item.id);
    if (!artifactType) continue;
    raw.push({
      id: artifactType,
      artifact_type: artifactType,
      title: item.label,
      source_date: evidenceDateByType[artifactType],
      source_summary: evidenceSummary(artifactType, item.why_it_mattered),
      sensitivity_level: sensitivityFor(artifactType),
      redaction_status: redactionFor(artifactType),
      linked_goal_id: goalId,
      linked_action_ids: [],
      linked_signal_ids: linkedSignalIdsForRefs([item.source_ref]),
      source_ref: item.source_ref,
      importance: item.strength === 'very_high' || item.strength === 'high' ? 'high_signal' : 'supporting',
    });
  }

  const followUpAction = input.actions.find((action) => artifact.decisive_actions.some((item) => item.id === action.id));
  if (followUpAction) {
    raw.push({
      id: 'follow_up_email',
      artifact_type: 'follow_up_email',
      title: 'Stored CWU follow-up action',
      source_date: followUpAction.executed_at ?? followUpAction.generated_at ?? evidenceDateByType.follow_up_email,
      source_summary: evidenceSummary('follow_up_email', followUpAction.reason ?? ''),
      sensitivity_level: 'personal',
      redaction_status: 'not_needed',
      linked_goal_id: goalId,
      linked_action_ids: [followUpAction.id],
      linked_signal_ids: extractSignalIdsFromAction(followUpAction, input),
      source_ref: `action:${followUpAction.id}`,
      importance: 'supporting',
    });
  }

  if (artifact.gold_standard_seed) {
    const requiredSeedArtifacts: Array<[EvidenceArtifactType, string, string]> = [
      ['negotiation_email', 'Salary counter email', 'seed:salary_counter'],
      ['acceptance_email', 'Clean acceptance email', 'seed:acceptance_email'],
      ['outcome_confirmation', 'Outcome confirmation', 'seed:official_offer_letter'],
    ];
    for (const [artifactType, title, sourceRef] of requiredSeedArtifacts) {
      if (raw.some((item) => item.artifact_type === artifactType)) continue;
      raw.push({
        id: artifactType,
        artifact_type: artifactType,
        title,
        source_date: evidenceDateByType[artifactType],
        source_summary: evidenceSummary(artifactType, ''),
        sensitivity_level: sensitivityFor(artifactType),
        redaction_status: redactionFor(artifactType),
        linked_goal_id: goalId,
        linked_action_ids: [],
        linked_signal_ids: linkedSignalIdsForRefs([sourceRef]),
        source_ref: sourceRef,
        importance: artifactType === 'outcome_confirmation' ? 'high_signal' : 'supporting',
      });
    }
  }

  const order: EvidenceArtifactType[] = [
    'job_description',
    'resume_used',
    'cover_letter',
    'follow_up_email',
    'interview_prompt',
    'presentation_prompt',
    'case_packet_redacted',
    'reference_activity',
    'offer_letter',
    'negotiation_email',
    'acceptance_email',
    'outcome_confirmation',
  ];
  raw.sort((a, b) => order.indexOf(a.artifact_type) - order.indexOf(b.artifact_type));

  return {
    raw_evidence: raw,
    summary:
      'Raw evidence is archived separately from interpreted outcome signals. Sensitive student/medical material is represented only through redacted or synthetic reasoning summaries.',
  };
}

function buildOutcomeSignalLayer(artifact: OutcomeAutopsyArtifact): OutcomeEvidenceSignal[] {
  const refs = (ids: string[]) => ids;
  const signals: OutcomeEvidenceSignal[] = [];

  signals.push(
    {
      id: 'signal-proof-of-fit-interview-prompt',
      signal_label: 'proof_of_fit',
      evidence_artifact_id: 'interview_prompt',
      confidence: 'high',
      causal_status: 'inferred',
      explanation:
        'The realistic work sample tested the actual job logic: access planning, documentation review, interactive-process reasoning, and student-centered judgment.',
      supporting_source_refs: refs(['seed:second_round_prompt_email', 'cwu-seed-realistic-job-simulation']),
    },
    {
      id: 'signal-decisive-action-presentation',
      signal_label: 'decisive_action',
      evidence_artifact_id: 'presentation_prompt',
      confidence: 'high',
      causal_status: 'inferred',
      explanation:
        'The presentation likely helped because it translated broad experience into visible job performance; the system does not claim it alone produced the offer.',
      supporting_source_refs: refs(['seed:presentation_prompt', 'cwu-seed-presentation']),
    },
    {
      id: 'signal-risk-avoided-references',
      signal_label: 'risk_avoided',
      evidence_artifact_id: 'reference_activity',
      confidence: 'high',
      causal_status: 'inferred',
      explanation:
        'References moved through due diligence without turning into the DVA/reference-risk spiral, reducing avoidable candidacy risk.',
      supporting_source_refs: refs(['seed:references_activity']),
    },
    {
      id: 'signal-conversion-offer',
      signal_label: 'outcome_confirmed',
      evidence_artifact_id: 'offer_letter',
      confidence: 'high',
      causal_status: 'proven',
      explanation:
        'The offer letter confirms the outcome. It does not prove which earlier action produced that outcome.',
      supporting_source_refs: refs(['seed:official_offer_letter', 'cwu-seed-offer']),
    },
    {
      id: 'signal-risk-created-counter',
      signal_label: 'risk_created',
      evidence_artifact_id: 'negotiation_email',
      confidence: 'medium',
      causal_status: 'unknown',
      explanation:
        'The salary counter introduced limited negotiation risk, but the later acceptance shows the offer relationship was preserved.',
      supporting_source_refs: refs(['seed:salary_counter']),
    },
    {
      id: 'signal-risk-avoided-acceptance',
      signal_label: 'risk_avoided',
      evidence_artifact_id: 'acceptance_email',
      confidence: 'high',
      causal_status: 'inferred',
      explanation:
        'Clean acceptance after a firm compensation denial avoided unnecessary relationship damage and locked the stabilizing bridge outcome.',
      supporting_source_refs: refs(['seed:acceptance_email']),
    },
  );

  const storedFollowUp = artifact.strongest_positive_signals.find((signal) => signal.id === 'sig-cwu-follow-up');
  if (storedFollowUp) {
    signals.unshift({
      id: 'signal-positive-momentum-follow-up',
      signal_label: 'positive_momentum',
      evidence_artifact_id: 'follow_up_email',
      confidence: 'medium',
      causal_status: 'inferred',
      explanation:
        'The stored follow-up converted an open hiring-contact loop into concrete availability. It is a strong event, not standalone causality.',
      supporting_source_refs: [storedFollowUp.source_ref],
    });
  }

  return signals;
}

function patternUpdate(
  key: string,
  goalId: string | null,
  signalIds: string[],
  note: string,
  now: string,
  options?: { positive?: number; negative?: number; alignment?: PatternMemoryUpdate['user_feedback_alignment'] },
): PatternMemoryUpdate {
  const positive = options?.positive ?? 1;
  const negative = options?.negative ?? 0;
  return {
    pattern_key: key,
    pattern_hash: `outcome_learning:${key}`,
    domain: 'career_outcome',
    times_observed: 1,
    times_associated_with_positive_outcome: positive,
    times_associated_with_negative_outcome: negative,
    user_feedback_alignment: options?.alignment ?? 'aligned',
    example_goal_ids: goalId ? [goalId] : [],
    strongest_supporting_signal_ids: signalIds,
    last_seen_at: now,
    learning_note: note,
  };
}

function buildPatternMemoryUpdates(
  artifact: OutcomeAutopsyArtifact,
  learningSignals: OutcomeEvidenceSignal[],
  now: string,
): PatternMemoryUpdate[] {
  const goalId = artifact.goal.id;
  const signalRefs = (label: OutcomeSignalLabel) =>
    learningSignals
      .filter((signal) => signal.signal_label === label)
      .flatMap((signal) => signal.supporting_source_refs.map(sourceIdFromRef))
      .filter((id): id is string => Boolean(id));

  return [
    patternUpdate(
      'judgment_heavy_service_coordination',
      goalId,
      signalRefs('proof_of_fit'),
      'Winning context: messy human-service system plus judgment, documentation, and coordination.',
      now,
    ),
    patternUpdate(
      'compliance_documentation',
      goalId,
      ['cwu-seed-realistic-job-simulation'],
      'Documentation and reasonable-accommodation reasoning were central to the role proof.',
      now,
    ),
    patternUpdate(
      'disability_access_support',
      goalId,
      ['cwu-seed-realistic-job-simulation'],
      'Disability/access context made broad helping-profession experience directly legible.',
      now,
    ),
    patternUpdate(
      'presentation_strength',
      goalId,
      ['cwu-seed-realistic-job-simulation', 'cwu-seed-presentation'],
      'The process favored a realistic presentation/work sample where Brandon could show live reasoning.',
      now,
    ),
    patternUpdate(
      'reference_risk',
      goalId,
      ['cwu-seed-references'],
      'Reference risk was present but avoided when the clean reference path carried the process forward.',
      now,
    ),
    patternUpdate(
      'overshare_risk',
      goalId,
      ['cwu-seed-references'],
      'Risk topics stayed contained; do not volunteer DVA/legal/reference-risk narratives unless required.',
      now,
    ),
    patternUpdate(
      'low_pay_bridge_with_high_future_leverage',
      goalId,
      ['cwu-seed-offer'],
      'Low salary was accepted because strategic stability, benefits, gap repair, and future references outweighed pay limits.',
      now,
    ),
    patternUpdate(
      'broad_generalist_risk',
      goalId,
      ['cwu-seed-realistic-job-simulation'],
      'Broad background became an advantage only after it was compressed into the role decision logic.',
      now,
      { alignment: 'mixed' },
    ),
    patternUpdate(
      'direct_title_match_required',
      goalId,
      [],
      'Avoid roles where exact prior title or narrow credential match matters more than demonstrated judgment.',
      now,
      { positive: 0, negative: 0, alignment: 'unknown' },
    ),
  ];
}

export function buildOutcomeLearningSnapshot(
  artifact: OutcomeAutopsyArtifact,
  input: OutcomeAutopsyInput,
  options: BuildOptions = {},
): OutcomeLearningSnapshot {
  const now = options.now ?? new Date().toISOString();
  const evidencePacket = buildEvidencePacket(artifact, input);
  const outcomeSignals = buildOutcomeSignalLayer(artifact);
  const ledger = buildRecommendationLedger(artifact, input, options);
  const patternUpdates = buildPatternMemoryUpdates(artifact, outcomeSignals, now);

  return {
    generated_at: now,
    source: 'deterministic_outcome_learning',
    goal_id: artifact.goal.id,
    evidence_packet: evidencePacket,
    outcome_signal_layer: outcomeSignals,
    recommendation_feedback_ledger: ledger,
    pattern_memory_updates: patternUpdates,
    what_foldera_learned: {
      outcome: artifact.query ? `${artifact.query}: ${artifact.final_outcome}` : artifact.final_outcome,
      what_worked: artifact.what_worked,
      what_did_not_work: [
        'Generic job-search activity did not become decisive evidence.',
        'The compensation counter did not move salary, though it also did not break the offer.',
        'Sensitive third-party student documentation cannot be used as raw product proof.',
      ],
      what_to_repeat: artifact.what_to_repeat,
      what_to_avoid: artifact.what_to_avoid_next_time,
      similar_future_opportunities_to_prioritize: artifact.future_roles_to_prioritize ?? [],
      similar_future_opportunities_to_skip: artifact.future_roles_to_skip ?? [],
    },
    uncertainty_notes: [
      'Foldera can confirm the outcome and the evidence sequence, but the conversion mechanism remains inferred unless a source explicitly states why the offer was made.',
      'The pattern memory is deterministic count-based memory, not machine learning and not a prediction score.',
      'Evidence packet summaries avoid raw third-party medical/student details and keep redacted case reasoning separate from scored outcome signals.',
    ],
  };
}

export function patternMetricRowsForLearning(
  userId: string,
  learning: OutcomeLearningSnapshot,
): PatternMetricPersistenceRow[] {
  return learning.pattern_memory_updates.map((pattern) => ({
    user_id: userId,
    pattern_hash: pattern.pattern_hash,
    category: pattern.pattern_key,
    domain: pattern.domain,
    total_activations: pattern.times_observed,
    successful_outcomes: pattern.times_associated_with_positive_outcome,
    failed_outcomes: pattern.times_associated_with_negative_outcome,
  }));
}

function mergeMetricCounts(
  desired: PatternMetricPersistenceRow,
  existing: AutopsyPatternMetricRow | null,
): PatternMetricPersistenceRow {
  if (!existing) return desired;
  return {
    ...desired,
    total_activations: Math.max(existing.total_activations ?? 0, desired.total_activations),
    successful_outcomes: Math.max(existing.successful_outcomes ?? 0, desired.successful_outcomes),
    failed_outcomes: Math.max(existing.failed_outcomes ?? 0, desired.failed_outcomes),
  };
}

export async function persistOutcomePatternMemoryUpdates(
  supabase: SupabaseClient,
  userId: string,
  learning: OutcomeLearningSnapshot,
): Promise<PatternMetricPersistResult[]> {
  const rows = patternMetricRowsForLearning(userId, learning);
  const results: PatternMetricPersistResult[] = [];

  for (const desired of rows) {
    const { data: existing, error: selectError } = await supabase
      .from('tkg_pattern_metrics')
      .select('id,pattern_hash,category,domain,total_activations,successful_outcomes,failed_outcomes')
      .eq('user_id', userId)
      .eq('pattern_hash', desired.pattern_hash)
      .maybeSingle();

    if (selectError) throw new Error(`pattern metric read failed: ${selectError.message}`);

    const merged = mergeMetricCounts(desired, (existing as AutopsyPatternMetricRow | null) ?? null);
    if (existing?.id) {
      const unchanged =
        (existing.total_activations ?? 0) === merged.total_activations &&
        (existing.successful_outcomes ?? 0) === merged.successful_outcomes &&
        (existing.failed_outcomes ?? 0) === merged.failed_outcomes &&
        existing.category === merged.category &&
        existing.domain === merged.domain;

      if (!unchanged) {
        const { error: updateError } = await supabase
          .from('tkg_pattern_metrics')
          .update({
            category: merged.category,
            domain: merged.domain,
            total_activations: merged.total_activations,
            successful_outcomes: merged.successful_outcomes,
            failed_outcomes: merged.failed_outcomes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (updateError) throw new Error(`pattern metric update failed: ${updateError.message}`);
      }

      results.push({
        pattern_hash: desired.pattern_hash,
        status: unchanged ? 'unchanged' : 'updated',
        total_activations: merged.total_activations,
        successful_outcomes: merged.successful_outcomes,
        failed_outcomes: merged.failed_outcomes,
      });
    } else {
      const { error: insertError } = await supabase.from('tkg_pattern_metrics').insert(merged);
      if (insertError) throw new Error(`pattern metric insert failed: ${insertError.message}`);
      results.push({
        pattern_hash: desired.pattern_hash,
        status: 'inserted',
        total_activations: merged.total_activations,
        successful_outcomes: merged.successful_outcomes,
        failed_outcomes: merged.failed_outcomes,
      });
    }
  }

  return results;
}

export async function getOutcomeLearningForUser(
  supabase: SupabaseClient,
  userId: string,
  options: { query?: string | null; now?: string } = {},
): Promise<{ artifact: OutcomeAutopsyArtifact; learning: OutcomeLearningSnapshot } | null> {
  const input = await fetchOutcomeAutopsyInput(supabase, userId, options.query ?? 'CWU Access Specialist');
  const artifact = buildOutcomeAutopsyArtifact(input, options);
  if (!artifact) return null;
  const learning = buildOutcomeLearningSnapshot(artifact, input, { now: options.now, userId });
  return { artifact, learning };
}
