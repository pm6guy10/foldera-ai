// ---------------------------------------------------------------------------
// Conviction engine types — Phase 2
// The engine outputs one thing: the single highest-leverage action today.
// ---------------------------------------------------------------------------

export type ActionType =
  | 'write_document'
  | 'send_message'
  | 'make_decision'
  | 'do_nothing'
  | 'schedule'
  | 'research';

export interface EvidenceItem {
  type: 'signal' | 'commitment' | 'goal' | 'pattern';
  description: string;
  date?: string;
}

/**
 * The single directive the conviction engine produces.
 * Everything else is secondary context.
 */
export interface ConvictionDirective {
  // The lead — the only thing that matters
  directive: string;         // The action in plain English
  action_type: ActionType;
  confidence: number;        // 0-100
  reason: string;            // One sentence, grounded in specific behavioral evidence

  // Secondary context (below the fold)
  evidence: EvidenceItem[];  // The specific signals/patterns that drove this
  fullContext?: string;      // Optional longer prose for the detail panel

  // Search hints — set by the engine when the artifact needs current info
  requires_search?: boolean;
  search_context?: string;   // What to search for (e.g. "WA DOT job posting 2024-12345")

  // Internal generation trace for persistence/debugging only.
  generationLog?: GenerationRunLog;

  /** When the scorer winner is a discrepancy row — used for class-specific artifact transforms. */
  discrepancyClass?: import('./discrepancy-detector').DiscrepancyClass;

  /** Pass-1 LLM: single-sentence anomaly, persisted in execution_result for quality checks. */
  anomaly_identification?: string;
}

// ---------------------------------------------------------------------------
// Artifact types — the finished work product attached to a directive.
// The directive without an artifact is a to-do list.
// The artifact is the product.
// ---------------------------------------------------------------------------

export interface EmailArtifact {
  type: 'email';
  to: string;
  subject: string;
  body: string;
  draft_type: 'email_compose' | 'email_reply';
  /** When true, generator failed; persistence skips strict artifact gates so a brief can still ship. */
  emergency_fallback?: boolean;
  /** Gmail thread id for `users.messages.send` so replies stay in the same thread. */
  gmail_thread_id?: string;
  /** Message-ID of the inbound message (reply threading). Angle brackets optional. */
  in_reply_to?: string;
  /** RFC References header (space-separated Message-IDs). */
  references?: string;
}

export interface DocumentArtifact {
  type: 'document';
  title: string;
  content: string;
  emergency_fallback?: boolean;
}

export interface CalendarEventArtifact {
  type: 'calendar_event';
  title: string;
  start: string;      // ISO 8601
  end: string;         // ISO 8601
  description: string;
}

export interface ResearchBriefArtifact {
  type: 'research_brief';
  findings: string;
  sources: string[];
  recommended_action: string;
}

export interface DecisionFrameArtifact {
  type: 'decision_frame';
  options: Array<{ option: string; weight: number; rationale: string }>;
  recommendation: string;
}

export interface WaitRationaleArtifact {
  type: 'wait_rationale';
  context: string;
  evidence: string;
  tripwires?: string[];
  check_date?: string;
}

export type ConvictionArtifact =
  | EmailArtifact
  | DocumentArtifact
  | CalendarEventArtifact
  | ResearchBriefArtifact
  | DecisionFrameArtifact
  | WaitRationaleArtifact;

export interface CandidateScoreBreakdown {
  stakes: number;
  /** Stakes after the scorer's specificity multiplier, used for final candidate scoring. */
  specificityAdjustedStakes?: number;
  urgency: number;
  tractability: number;
  freshness: number;
  /** Approval rate for this action_type (0-1). Default 0.5 if < 3 historical actions. */
  actionTypeRate: number;
  /** Additive penalty for entities with 3+ consecutive skips. 0 or -30. */
  entityPenalty: number;

  // --- Gemini scorer breakdown (populated by computeCandidateScore) ---
  /** Raw stakes value from goal priority (1-5) */
  stakes_raw?: number;
  /** stakes^0.6 */
  stakes_transformed?: number;
  /** Raw urgency before floor adjustment */
  urgency_raw?: number;
  /** Urgency after stakes-based floor: min(1, urgency*0.9 + floor) */
  urgency_effective?: number;
  /** Harmonic mean of urgency_effective and tractability: 2*uEff*t/(uEff+t) */
  exec_potential?: number;
  /** Time-weighted approval rate for this action_type (0-1) */
  behavioral_rate?: number;
  /** Novelty penalty: 0.55 if resurfaced yesterday, 0.80 if 2 days, 1.0 otherwise */
  novelty_multiplier?: number;
  /** Suppression multiplier: exp(entityPenalty/2) if negative, else 1.0 */
  suppression_multiplier?: number;
  /** Final computed score from Gemini formula */
  final_score?: number;
}

export interface GenerationCandidateSource {
  kind: 'signal' | 'commitment' | 'relationship' | 'emergent' | 'compound';
  id?: string;
  source?: string;
  occurredAt?: string;
  summary?: string;
}

export interface GenerationCandidateLog {
  id: string;
  rank: number;
  candidateType: string;
  /** Present when candidateType === 'discrepancy' — used for class-specific quality gates. */
  discrepancyClass?: import('./discrepancy-detector').DiscrepancyClass;
  actionType: ActionType;
  score: number;
  scoreBreakdown: CandidateScoreBreakdown;
  targetGoal: {
    text: string;
    priority: number;
    category: string;
  } | null;
  sourceSignals: GenerationCandidateSource[];
  decision: 'selected' | 'rejected';
  decisionReason: string;
}

export interface GenerationCandidateDiscoveryLog {
  candidateCount: number;
  suppressedCandidateCount: number;
  selectionMargin: number | null;
  selectionReason: string | null;
  failureReason: string | null;
  topCandidates: GenerationCandidateLog[];
}

export interface GenerationRunLog {
  outcome: 'selected' | 'no_send';
  stage: 'scoring' | 'generation' | 'artifact' | 'validation' | 'persistence' | 'system';
  reason: string;
  candidateFailureReasons: string[];
  candidateDiscovery: GenerationCandidateDiscoveryLog | null;
  /** Onboarding welcome path: skip hard bottom gate / quality heuristics that block goal-summary docs. */
  firstMorningBypass?: boolean;
  /** Dev/diagnostic: goals passed into the prompt (owner brain-receipt, debugging). */
  brief_context_debug?: { active_goals?: string[] };
}

/**
 * Persisted to tkg_actions and returned from /api/conviction/generate
 */
export interface ConvictionAction extends ConvictionDirective {
  id: string;
  userId: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'skipped' | 'failed' | 'draft' | 'draft_rejected' | 'generated' | 'sent';
  generatedAt: string;
  approvedAt?: string;
  executedAt?: string;
  executionResult?: Record<string, unknown>;
  artifact?: ConvictionArtifact | null;
}

// ---------------------------------------------------------------------------
// Draft proposals — Foldera proposes a concrete action; user approves/rejects
// ---------------------------------------------------------------------------

/**
 * The payload stored in tkg_actions.execution_result for draft rows.
 * Flexible JSONB — shape varies by draft_type.
 */
export interface DraftPayload {
  draft_type: 'email_reply' | 'email_compose' | 'schedule_event' | 'generic';
  /** Email-specific fields */
  to?: string;
  subject?: string;
  body?: string;
  /** Source context (e.g. which email triggered this) */
  source?: string;
  source_id?: string;
  [key: string]: unknown;
}

/**
 * A draft action returned from /api/drafts/pending
 */
export interface DraftAction {
  id: string;
  title: string;          // Short human label: "Reply to Alice about proposal"
  description: string;    // One-sentence description of what Foldera will do
  action_type: ActionType;
  draft: DraftPayload;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Chief-of-Staff briefing — Phase 1 output (kept for /api/briefing/latest)
// ---------------------------------------------------------------------------

export interface ChiefOfStaffBriefing {
  userId: string;
  briefingDate: string;         // YYYY-MM-DD
  generatedAt: Date;
  topInsight: string;           // The single most important thing right now
  confidence: number;           // 0-100, traceable to user's own history
  recommendedAction: string;    // One specific action
  fullBrief: string;            // Full 3-5 line brief prose
}

// ---------------------------------------------------------------------------
// Legacy briefing type — kept for backward compatibility
// ---------------------------------------------------------------------------

export interface Briefing {
  id: string;
  userId: string;
  title: string;
  subtitle: string;
  generatedAt: Date;
  summary: string;
  criticalAlerts: BriefingSection;
  actionRequired: BriefingSection;
  relationshipUpdates: BriefingSection;
  radarContext: BriefingSection;
  stats: BriefingStats;
  signals: unknown[];
  relationships: RelationshipHealthSummary[];
}

export interface BriefingSection {
  title: string;
  items: BriefingItem[];
  isEmpty: boolean;
}

export interface BriefingItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  hasAction: boolean;
  actionLabel?: string;
  actionUrl?: string;
  contactName?: string;
  contactEmail?: string;
  urgency: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

export interface BriefingStats {
  emailsAnalyzed: number;
  threadsScanned: number;
  criticalItems: number;
  actionItems: number;
  healthyRelationships: number;
  atRiskRelationships: number;
}

export interface RelationshipHealthSummary {
  contactName: string;
  contactEmail: string;
  status: string;
  healthScore: number;
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Decision Payload — the single canonical object governing directive generation.
// The generator RENDERS this payload. It does not choose the action.
// ---------------------------------------------------------------------------

export type ReadinessState = 'SEND' | 'NO_SEND' | 'INSUFFICIENT_SIGNAL';

export type ValidArtifactTypeCanonical =
  | 'send_message'
  | 'write_document'
  | 'schedule_block'
  | 'wait_rationale'
  | 'do_nothing';

export interface DecisionPayload {
  /** Commitment/signal/relationship ID from the scorer winner */
  winner_id: string;
  /** Candidate type from scorer: commitment, signal, relationship, emergent, compound, growth */
  source_type: string;
  /** Lifecycle stage of the underlying entity */
  lifecycle_state: 'active' | 'at_risk' | 'stale' | 'resolved' | 'unknown';
  /** Gate: if not SEND, no directive may be generated */
  readiness_state: ReadinessState;
  /** The action the system decided. The LLM may NOT change this. */
  recommended_action: ValidArtifactTypeCanonical;
  /** Who or what the action applies to (entity name, email, or description) */
  action_target: string;
  /** Concrete persisted reasons — the scorer's evidence, not LLM prose */
  justification_facts: string[];
  /** Scorer confidence (0-100). Must meet threshold or generation is blocked. */
  confidence_score: number;
  /** Whether the newest supporting signal is within the staleness window */
  freshness_state: 'fresh' | 'aging' | 'stale';
  /** Non-empty array = generation is blocked. Each entry is a specific reason. */
  blocking_reasons: string[];
  /** Matched goal text from scorer, if any */
  matched_goal: string | null;
  /** Matched goal priority (1-5), null if no goal match */
  matched_goal_priority: number | null;
  /** Raw scorer score */
  scorer_score: number;
}

/**
 * Validates a DecisionPayload. Returns blocking_reasons if the payload
 * is not in a SEND state. If this returns a non-empty array, generation
 * MUST NOT proceed.
 */
export function validateDecisionPayload(dp: DecisionPayload): string[] {
  const errors: string[] = [];
  if (dp.readiness_state !== 'SEND') {
    errors.push(`readiness_state is ${dp.readiness_state}, not SEND`);
  }
  if (dp.blocking_reasons.length > 0) {
    errors.push(...dp.blocking_reasons);
  }
  if (!dp.recommended_action || dp.recommended_action === 'do_nothing') {
    errors.push('recommended_action is do_nothing or null');
  }
  if (dp.justification_facts.length === 0) {
    errors.push('no justification_facts — cannot generate without evidence');
  }
  if (dp.freshness_state === 'stale') {
    errors.push('freshness_state is stale — evidence too old to act on');
  }
  return errors;
}

export interface BriefingDeliveryConfig {
  sendEmail: boolean;
  emailAddress?: string;
  timezone: string;
  preferredTime: string;
  frequency: 'daily' | 'weekdays' | 'weekly';
  includeContextSection: boolean;
  maxItemsPerSection: number;
}

export const DEFAULT_BRIEFING_CONFIG: BriefingDeliveryConfig = {
  sendEmail: true,
  timezone: 'America/New_York',
  preferredTime: '07:00',
  frequency: 'weekdays',
  includeContextSection: true,
  maxItemsPerSection: 5,
};
