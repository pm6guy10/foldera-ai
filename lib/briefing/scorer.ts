/**
 * Scorer — deterministic open-loop ranker.
 *
 * Replaces "let the LLM pick" with math:
 *   score = stakes * urgency * tractability * freshness
 *
 * v2 additions:
 *   - Sigmoid midpoint at 5 days (not 2) so weekly deadlines surface
 *   - Skip penalty: failed_outcomes from tkg_pattern_metrics reduce tractability
 *   - Freshness decay: recently-surfaced loops get penalized so the user sees variety
 *   - Relationship enrichment: entity patterns + recent signals about the person
 *   - detectEmergentPatterns(): proactive intelligence from behavioral data
 *
 * Returns the single highest-scoring open loop with all context
 * the LLM needs to draft the artifact.
 */

import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus } from '@/lib/encryption';
import {
  buildDirectiveMlBucketKey,
  mlBucketInputsFromBaseCandidate,
  mlBucketInputsFromDiscrepancy,
  mlBucketInputsFromInsight,
} from '@/lib/ml/outcome-features';
import { fetchGlobalMlPriorMap } from '@/lib/ml/priors';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { daysMs } from '@/lib/config/constants';
import type {
  ActionType,
  CandidateScoreBreakdown,
  GenerationCandidateDiscoveryLog,
  GenerationCandidateLog,
  GenerationCandidateSource,
} from './types';
import {
  detectDiscrepancies,
  parseCalendarEventFromContent as parseCalendarEventFromContentDiscrepancy,
} from './discrepancy-detector';
import type { DiscrepancyClass, RecentDirectiveInput, TriggerMetadata } from './discrepancy-detector';
import {
  adaptInterviewSourceSignalsForGate,
  applyStakesGate,
  isTimeBoundInterviewExecutionCandidate,
} from './stakes-gate';
import { applyEntityRealityGate } from './entity-reality-gate';
import {
  filterPersonNamesForValidityContext,
  isValidPersonNameForValidityContext,
} from './validity-context-entity';
import { runInsightScan } from './insight-scan';
import {
  runHuntAnomalies,
  huntFindingToScoredLoopContent,
  type HuntFinding,
  type HuntFindingKind,
} from './hunt-anomalies';
import {
  collectActiveFailureSuppressionKeys,
  rawScorerCandidateMatchesFailureSuppression,
  scoredLoopMatchesFailureSuppression,
} from './scorer-failure-suppression';
import {
  type EntitySalienceRow,
  computeLivingGraphMultiplier,
} from '@/lib/signals/entity-attention';
import {
  commitmentAnchoredToMailSignal,
  getSignalSourceAuthorityTier,
  isExcludedSignalSourceForScorerPool,
  isChatConversationSignalSource,
} from './scorer-candidate-sources';
import { buildSignalMetadataSummaryRows } from './signal-metadata-summary';
import {
  getCommitmentQuarantineReason,
  getGoalQuarantineReason,
  isUsableGoalRow,
} from './goal-hygiene';

// ---------------------------------------------------------------------------
// Self-referential signal filter — excludes Foldera's own directive outputs
// ---------------------------------------------------------------------------

function isSelfReferentialSignal(content: string): boolean {
  return content.startsWith('[Foldera Directive') || content.startsWith('[Foldera \u00b7 20');
}

/** Adds the signed-in user's given/first name(s) so suppression parsing never treats them as generic words. */
async function fetchUserFirstNameStopTokens(userId: string): Promise<string[]> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase.auth.admin.getUserById(userId);
    const user = data?.user;
    if (!user) return [];
    const out = new Set<string>();
    const addFirst = (raw: unknown): void => {
      if (typeof raw !== 'string' || !raw.trim()) return;
      const token = raw.trim().split(/\s+/)[0];
      if (token.length >= 2) out.add(token.toLowerCase());
    };
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    addFirst(meta['given_name']);
    addFirst(meta['full_name']);
    if (typeof meta['name'] === 'string') addFirst(meta['name']);
    for (const identity of user.identities ?? []) {
      const idData = (identity.identity_data ?? {}) as Record<string, unknown>;
      addFirst(idData['given_name']);
      addFirst(idData['full_name']);
      if (typeof idData['name'] === 'string') addFirst(idData['name'] as string);
    }
    return [...out];
  } catch {
    return [];
  }
}

/** Best-effort future event start for open-loop calendar signals (uses shared parser). */
function parseCalendarEventFromContent(text: string): { startMs: number } | null {
  const parsed = parseCalendarEventFromContentDiscrepancy(text);
  if (!parsed) return null;
  const now = Date.now();
  if (parsed.startMs > now) return { startMs: parsed.startMs };
  return null;
}

/** Contact outreach types: entity skip penalty + contact-only suppression scope. */
export const CONTACT_ACTION_TYPES = new Set<ActionType>(['send_message', 'schedule']);

export type SuppressionGoalEntityPattern = { pattern: RegExp; goalText: string; contactOnly: boolean };

/**
 * Shared suppression-goal evaluation for all candidate types (signal, relationship,
 * discrepancy, emergent, hunt, etc.). Optionally checks `entityName` so entity-linked
 * rows match even when the title omits the full proper noun.
 */
export function evaluateSuppressionGoalMatch(
  title: string,
  content: string,
  actionType: ActionType,
  entityName: string | undefined | null,
  suppressionEntities: ReadonlyArray<SuppressionGoalEntityPattern>,
  contactActionTypes: ReadonlySet<ActionType> = CONTACT_ACTION_TYPES,
): { patternMatched: boolean; isSuppressed: boolean; matchedGoalText: string | null; contactOnly: boolean } {
  let matchedGoalText: string | null = null;
  let contactOnly = false;
  const ent = typeof entityName === 'string' ? entityName.trim() : '';
  for (const { pattern, goalText, contactOnly: co } of suppressionEntities) {
    if (pattern.test(title) || pattern.test(content) || (ent.length > 0 && pattern.test(ent))) {
      matchedGoalText = goalText;
      contactOnly = co;
      break;
    }
  }
  if (!matchedGoalText) {
    return { patternMatched: false, isSuppressed: false, matchedGoalText: null, contactOnly: false };
  }
  const isSuppressed = !contactOnly || contactActionTypes.has(actionType);
  return { patternMatched: true, isSuppressed, matchedGoalText, contactOnly };
}

function mergeUrgencyWithTimeHints(args: {
  baseUrgency: number;
  nowMs: number;
  calendarEventStartMs?: number | null;
  commitmentDueMs?: number | null;
  coldEntityMeetingBoost?: boolean;
}): number {
  let u = args.baseUrgency;
  if (args.calendarEventStartMs != null) {
    const msUntil = args.calendarEventStartMs - args.nowMs;
    const days = msUntil / 86400000;
    if (msUntil >= -12 * 3600000 && msUntil <= 0) u = Math.max(u, 1.0);
    else if (days > 0 && days <= 1) u += 0.2;
  }
  if (args.commitmentDueMs != null) {
    const h = (args.commitmentDueMs - args.nowMs) / 3600000;
    if (h > 0 && h <= 48) u += 0.15;
  }
  if (args.coldEntityMeetingBoost) u += 0.25;
  return Math.min(1, u);
}

function artifactTypeForAction(actionType: ActionType): string {
  switch (actionType) {
    case 'send_message':
      return 'drafted_email';
    case 'make_decision':
      return 'decision_frame';
    case 'do_nothing':
      return 'wait_rationale';
    case 'write_document':
      return 'write_document';
    case 'schedule':
      return 'schedule';
    case 'research':
    default:
      return 'research';
  }
}

function logDecryptSkip(userId: string, scope: string, skippedRows: number): void {
  if (skippedRows === 0) return;
  logStructuredEvent({
    event: 'signal_skip',
    level: 'warn',
    userId,
    artifactType: null,
    generationStatus: 'decrypt_skip',
    details: {
      scope,
      skipped_rows: skippedRows,
    },
  });
}

function isInternalNoSend(executionResult: unknown): boolean {
  if (!executionResult || typeof executionResult !== 'object') return false;
  return (executionResult as Record<string, unknown>).outcome_type === 'no_send';
}

const NOISE_CANDIDATE_PATTERNS = [
  // Tool/account/security management
  /\b(?:review|check|audit|secure)\s+(?:your\s+)?(?:Google|Microsoft|Apple|Robinhood|account|security|settings|permissions)\b/i,
  // Credit/billing monitoring
  /\b(?:check|monitor|review)\s+(?:your\s+)?(?:credit\s*score|credit\s*report|billing|payment\s*method)\b/i,
  // Grant/revoke access to tools
  /\b(?:grant(?:ed)?|revoke)\s+(?:Claude|Foldera|app|access|permission)\b/i,
  // Newsletter/spam registrations
  /\b(?:register\s+for|complete\s+registration|sign\s+up\s+for)\s+.{0,40}(?:program|initiative|workshop|training|webinar|event)\b/i,
  // Generic "check X" without urgency (not goal-connected)
  /^check\s+(?:email|account|status|update)\b/i,
  // Schedule-a-block-to-review pattern (homework disguised as action)
  /\bschedule\s+(?:a\s+)?(?:\d+.?minute\s+)?(?:block|time|session)\s+(?:to\s+)?(?:review|check|assess|audit)\b/i,
  // Generic scheduling suggestions (analyst mode: never suggest blocking time)
  /\bschedule\s+(?:a\s+)?(?:\d+.?minute\s+)?(?:block|time|session)\b/i,
  // Generic follow-up without specifics
  /^follow\s+up\s+(?:with|on)\s+/i,
  // Update billing/payment
  /\bupdate\s+(?:billing|payment)\s+(?:information|method|details)\b/i,
  // Security alerts
  /\b(?:unauthorized|suspicious)\s+(?:login|access|sign.?in|activity)\b/i,
  // Foldera self-referential (backup for the explicit filter above)
  /\bFoldera\s+(?:Directive|directive|system)\b/i,
  // Automated financial notifications (credit applied, payment confirmed — zero-agency)
  /\b(?:credit\s+(?:has\s+been\s+)?applied|cash\s*back\s+(?:credited|earned)|reward\s*(?:credit|points?\s+(?:earned|credited))|payment\s+(?:has\s+been\s+)?(?:confirmed|received|processed)|transaction\s+(?:confirmed|complete|posted)|direct\s+deposit\s+(?:received|posted)|deposit\s+(?:posted|confirmed|credited)|wire\s+(?:transfer\s+)?(?:received|complete))\b/i,
  // Paid transaction logs with dollar amounts ("Paid $7.00", "Paid Abbie Lee $20.00")
  /\bpaid\s+(?:[A-Za-z][\w'-]{0,24}\s+){0,5}\$?\d[\d,]*(?:\.\d{2})?\b/i,
  // Zero-agency order / booking / subscription confirmations
  /\b(?:order\s+(?:confirmed|shipped|delivered|is\s+on\s+its\s+way|has\s+been\s+placed)|booking\s+(?:is\s+)?confirmed|reservation\s+(?:is\s+)?confirmed|subscription\s+(?:renewed|confirmed|activated))\b/i,
  // Account / credit score informational updates (no action produces a SEND or WRITE)
  /\b(?:account\s+(?:statement|balance)\s+(?:is\s+)?(?:ready|available)|credit\s+(?:score|report)\s+(?:updated|available|changed)|your\s+statement\s+(?:is\s+)?(?:ready|available))\b/i,
  // Recipient-side billing/notification language
  /\b(will be (charged|collected|automatically|posted))\b/i,
  /\b(if (you are )?interested)\b/i,
  /\b(payment (received|processed|posted))\b/i,
  /\b(explore exclusive|claim your|redeem your|unlock your)\b/i,
  /\b(register for .*(webinar|event|conference|session))\b/i,
  // Medical appointment preparation and follow-through (personal health admin, not goal-directed)
  /\b(?:prepare\s+for|prep\s+for|get\s+ready\s+for)\s+(?:your\s+)?(?:appointment|checkup|check-up|physical|exam|procedure|surgery|consultation)\b/i,
  /\b(?:medical|health|dental|vision)\s+(?:appointment|checkup|check-up|follow.?up|reminder)\b/i,
  /\b(?:schedule|book|make)\s+(?:a\s+)?(?:medical|health|dental|doctor|physician|doctor's|dentist's)\s+(?:appointment|visit|checkup|exam)\b/i,
  // Auto-renewal and subscription management (zero-agency financial noise)
  /\b(?:auto.?renew(?:al|s)?|automatically\s+(?:renews?|charged?|billed?)|subscription\s+(?:will|is\s+set\s+to)\s+(?:renew|auto.?renew))\b/i,
  /\b(?:your\s+(?:subscription|membership|plan)\s+(?:expires?|is\s+expiring|renews?|is\s+up\s+for\s+renewal))\b/i,
  /\b(?:cancel\s+(?:before|by|to\s+avoid)\s+(?:your\s+)?(?:renewal|being\s+charged|the\s+charge))\b/i,
  // Wellness/fitness challenges and generic programs (not personal outcome goals)
  /\b(?:wellness|fitness|health|step|hydration)\s+(?:challenge|program|initiative|week|month|goal)\b/i,
  /\b(?:track\s+(?:your\s+)?(?:steps?|water|sleep|calories|macros?|workouts?|activity))\b/i,
  // Third-party service launch/update notices (zero personal consequence)
  /\b(?:we(?:'ve)?\s+(?:launched|released|updated|upgraded|improved|rolled\s+out)|introducing\s+(?:new|our))\b/i,
  /\b(?:new\s+(?:feature|update|version|release)|product\s+(?:update|launch|announcement))\b/i,
  // Food/grocery/meal deliveries (personal consumption, not goal-directed)
  /\b(?:order\s+(?:from|at)|delivery\s+(?:from|for)|your\s+(?:meal|grocery|food)\s+(?:order|delivery|kit))\b/i,
  /\b(?:meal\s+kit|hello\s*fresh|blue\s*apron|sun\s*basket|factor\s+meals?|freshly|door\s*dash|grub\s*hub|uber\s*eats)\b/i,
  // Generic personal errand / household task (buy X, pick up X, call X to schedule)
  /^(?:buy|pick\s+up|get|grab|order)\s+(?:some\s+)?(?:groceries|milk|eggs|bread|toilet\s+paper|paper\s+towels|cleaning\s+supplies)\b/i,
  /^(?:call|schedule)\s+(?:the\s+)?(?:plumber|electrician|handyman|contractor|repair\s+(?:person|service)|lawn\s+(?:care|service))\b/i,
];

export function isNoiseCandidateText(...texts: string[]): boolean {
  return NOISE_CANDIDATE_PATTERNS.some((pattern) =>
    texts.some((text) => typeof text === 'string' && pattern.test(text)),
  );
}

/**
 * Commitment categories that are automatically excluded unless they have
 * clear goal linkage. These categories represent routine personal admin,
 * ambient consumer activity, and transactional noise — not owner-relevant outcomes.
 */
const COMMITMENT_NOISE_CATEGORIES = new Set([
  'payment_financial',     // Routine bills, charges, subscriptions — no goal connection needed
  'attend_participate',    // Generic event attendance without professional consequence
  'personal_admin',        // Personal errands, household tasks, scheduling
  'health_wellness',       // Medical appointments, wellness programs — not business outcomes
  'consumer_purchase',     // Retail purchases, food orders, consumer goods
]);

const CAREER_EXECUTION_COMMITMENT_PATTERNS = [
  /\binterview\b/i,
  /\bphone screen\b/i,
  /\bpanel interview\b/i,
  /\bscreening interview\b/i,
  /\brecruitment\b/i,
  /\brecruiter\b/i,
  /\bhiring\b/i,
  /\bcandidate\b/i,
  /\boffer\b/i,
  /\breference check\b/i,
];

/**
 * Commitment text patterns that indicate trivial personal transactions.
 * These are commitment-level rejections (distinct from signal-level noise).
 */
const TRIVIAL_COMMITMENT_PATTERNS = [
  // Food and grocery items
  /\b(?:buy|get|pick\s+up|order|purchase)\s+(?:some\s+)?(?:eggs?|bread|milk|groceries|produce|vegetables?|fruit|meat|chicken|coffee|tea)\b/i,
  // Consumer goods / household
  /\b(?:buy|get|order)\s+(?:toilet\s+paper|paper\s+towels?|cleaning|detergent|soap|shampoo)\b/i,
  // Routine personal tasks without professional consequence
  /\b(?:call|contact)\s+(?:the\s+)?(?:landlord|plumber|electrician|handyman|repairman|contractor)\b/i,
  /\b(?:schedule|book|make)\s+(?:an?\s+)?(?:oil\s+change|car\s+wash|haircut|hair\s+(?:cut|appointment))\b/i,
  // Generic "check on" tasks with no outcome artifact possible
  /^check\s+on\s+(?:the\s+)?(?:status|update|progress)\s+of\b/i,
];

/**
 * Returns true if this commitment candidate can produce an executable,
 * goal-directed artifact. Returns false for trivial consumer transactions,
 * personal health admin, routine subscriptions, and ambient noise.
 *
 * @param description  Commitment description text
 * @param category     Commitment category from tkg_commitments.category
 * @param hasGoalMatch Whether the commitment has keyword overlap with a stated goal
 */
export function isExecutableCommitment(
  description: string,
  category: string,
  hasGoalMatch: boolean,
): boolean {
  // Noise patterns hard-reject regardless of category or goal match
  if (TRIVIAL_COMMITMENT_PATTERNS.some((p) => p.test(description))) return false;

  // Interview / recruiting commitments are materially outcome-linked even when
  // the goal table is dirty or underspecified.
  if (
    category === 'attend_participate'
    && CAREER_EXECUTION_COMMITMENT_PATTERNS.some((pattern) => pattern.test(description))
  ) {
    return true;
  }

  // High-noise categories require a goal match to survive
  if (COMMITMENT_NOISE_CATEGORIES.has(category) && !hasGoalMatch) return false;

  return true;
}

const OBVIOUS_FIRST_LAYER_PATTERNS = [
  /^\s*(?:follow\s+up|check\s+in|touch\s+base|circle\s+back)\b/i,
  /\b(?:just\s+checking\s+in|just\s+reaching\s+out|quick\s+follow\s+up)\b/i,
  /^\s*schedule\s+(?:a\s+)?(?:\d+.?minute\s+)?(?:block|time|session)\b/i,
];

const OUTCOME_SIGNAL_PATTERNS = [
  /\b(?:offer|hiring|interview|approval|deadline|due|board|review|reference|contract)\b/i,
  /\b(?:\$|budget|cash|spend|invoice|payment|claim|settlement|revenue)\b/i,
  /\b(?:partner|client|manager|recruiter|relationship|stakeholder)\b/i,
];

/** Static duplicate-detection tokens only; per-user given names are added at runtime via fetchUserFirstNameStopTokens. */
export const SCORER_STATIC_DUPLICATE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'have', 'will', 'your',
  'about', 'after', 'before', 'just', 'quick', 'update', 'send', 'write', 'follow', 'check',
]);

const DUPLICATE_STOPWORDS = SCORER_STATIC_DUPLICATE_STOPWORDS;

/**
 * Only these discrepancy classes inherit open-loop failure memory (shared signal ids with
 * prior duplicate/usefulness gate failures). Structural gap classes use a different artifact
 * path and must not be blocked solely because an unrelated loop candidate failed on the same id.
 */
export const DISCREPANCY_FAILURE_SUPPRESSION_CLASS_SET = new Set<DiscrepancyClass>(['behavioral_pattern']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreBreakdown extends CandidateScoreBreakdown {}

interface GoalRow {
  goal_text: string;
  priority: number;
  goal_category: string;
}

export interface MatchedGoal {
  text: string;
  priority: number;
  category: string;
}

export interface ScoredLoop {
  id: string;
  type: 'commitment' | 'signal' | 'relationship' | 'emergent' | 'compound' | 'growth' | 'discrepancy' | 'hunt';
  title: string;
  content: string;
  suggestedActionType: ActionType;
  matchedGoal: MatchedGoal | null;
  score: number;
  breakdown: ScoreBreakdown;
  relatedSignals: string[];
  sourceSignals: GenerationCandidateSource[];
  /** For relationship loops: enriched context from entity patterns + recent signals */
  relationshipContext?: string;
  /** For compound loops: the merged loops and connection type */
  compoundLoops?: ScoredLoop[];
  connectionType?: 'same_person' | 'temporal_dependency' | 'resource_conflict';
  connectionReason?: string;
  /** Lifecycle classification assigned during scoring */
  lifecycle?: CandidateLifecycle;
  /**
   * Confidence prior (0–100) derived from actionTypeRate + entityPenalty.
   * Passed to the generator prompt to bound free-form confidence guessing.
   */
  confidence_prior: number;
  /** Entity name for convergence matching across candidate types */
  entityName?: string;
  /** Discrepancy class — present only when type === 'discrepancy' */
  discrepancyClass?: DiscrepancyClass;
  /** Trigger metadata — present only when type === 'discrepancy' */
  trigger?: TriggerMetadata;
  /** Structured delta metrics JSON from discrepancy detector — passed to prompt TRIGGER_CONTEXT. */
  discrepancyEvidence?: string;
  /** Entity behavioral graph stats (bx_stats) when entity row was resolved — prompt ENTITY_ANALYSIS. */
  entityBxStats?: import('@/lib/signals/behavioral-graph').EntityBehavioralStats | null;
  /** Optional override for discrepancy action resolution (e.g. unresolved_intent → schedule). */
  discrepancyPreferredAction?: ActionType;
  /** Pre-scorer LLM read of raw signals — discovery log uses candidateType "insight". */
  fromInsightScan?: boolean;
  /** Set when type === 'hunt' — which detector produced this candidate. */
  huntKind?: HuntFindingKind;
}

export type KillReason = 'noise' | 'not_now' | 'trap';

export interface DeprioritizedLoop {
  title: string;
  score: number;
  breakdown: ScoreBreakdown;
  killReason: KillReason;
  /** Human-readable explanation of why this multiplier killed it */
  killExplanation: string;
}

// ---------------------------------------------------------------------------
// Lifecycle state model — universal classification for goals/threads/candidates
//
// Applies across all domains: jobs, relationships, admin, product, finance.
// Classification runs in the scoring layer; only active_now + actionable
// candidates may reach generation.
// ---------------------------------------------------------------------------

/** Primary lifecycle state of a candidate */
export type LifecycleState =
  | 'active_now'    // Eligible for generation
  | 'dormant_later' // In memory/context; blocked from daily output until a reentry trigger fires
  | 'resolved'      // Outcome reached; blocked unless a new signal reopens it
  | 'trash';        // Definitively avoided; excluded from candidate pool

/** Time horizon derived from urgency / deadline distance */
export type TimeHorizon =
  | 'now'       // urgency >= 0.70 — act today
  | 'near_term' // urgency 0.40–0.69 — act this week
  | 'later'     // urgency 0.15–0.39 — watch, not yet
  | 'never';    // urgency < 0.15 and no deadline — de-prioritised

/** Whether this candidate can produce a generation output right now */
export type Actionability =
  | 'actionable'    // Stakes + tractability + urgency all clear — full generation eligible
  | 'hold_only'     // Important but not ready to act on — blocked from generation; stays in context
  | 'archive_only'; // No goal alignment — excluded (no-goal-primacy gate also catches these)

export interface CandidateLifecycle {
  state: LifecycleState;
  horizon: TimeHorizon;
  actionability: Actionability;
  /** For dormant_later: what event would reopen this candidate */
  reentryTrigger?: 'new_signal' | 'user_action' | 'external_milestone' | 'context_change';
  /** Whether a reentry trigger fired and promoted this from dormant → active_now */
  reopenedByReentry?: boolean;
  /** Human-readable explanation of the classification */
  reason: string;
}

/** Structured explanation when no thread-backed outbound move is allowed. */
export interface ScorerExactBlocker {
  blocker_type: string;
  blocker_reason: string;
  top_blocked_candidate_title: string | null;
  top_blocked_candidate_type: string | null;
  top_blocked_candidate_action_type: ActionType | null;
  /** Full suppression goal text when a DO NOT / SUPPRESS goal matched the strongest remaining candidate. */
  suppression_goal_text: string | null;
  /** Candidates with score above the floor before the final gate (diagnostic). */
  survivors_before_final_gate: number;
  /** Count of drops recorded per scorer filter stage (diagnostic). */
  rejected_by_stage: Record<string, number>;
}

export interface ScorerResultWinnerSelected {
  outcome: 'winner_selected';
  winner: ScoredLoop;
  /**
   * Top scored candidates (winner + runner-ups, capped) before kill-reason
   * classification. Used by the generator's viability competition pass so it can
   * pick a different final winner when the top scorer is less executable or excluded
   * (e.g. noise_winner guard).
   */
  topCandidates: ScoredLoop[];
  deprioritized: DeprioritizedLoop[];
  candidateDiscovery: GenerationCandidateDiscoveryLog;
  antiPatterns: AntiPattern[];
  divergences: RevealedGoalDivergence[];
  exact_blocker: null;
}

export interface ScorerResultNoValidAction {
  outcome: 'no_valid_action';
  winner: null;
  /** Best remaining scored loops for context (may include sub-threshold or invariant-failed rows). */
  topCandidates: ScoredLoop[];
  deprioritized: DeprioritizedLoop[];
  candidateDiscovery: GenerationCandidateDiscoveryLog;
  antiPatterns: AntiPattern[];
  divergences: RevealedGoalDivergence[];
  exact_blocker: ScorerExactBlocker;
}

export type ScorerResult = ScorerResultWinnerSelected | ScorerResultNoValidAction;

// ---------------------------------------------------------------------------
// Diagnostic accumulator — captures every candidate drop at every stage.
// Populated as a side-effect of scoreOpenLoops(); retrieved via
// getLastScorerDiagnostics() after the call returns.
// ---------------------------------------------------------------------------

export interface ScorerDropEntry {
  candidateId: string;
  type: string;
  title: string;
  stage: string;
  reason: string;
  score?: number;
}

export interface ScorerSurvivorEntry {
  candidateId: string;
  type: string;
  title: string;
  score: number;
  breakdown: ScoreBreakdown;
  matchedGoal: string | null;
  entityName?: string;
  lifecycle?: CandidateLifecycle;
  invariantReasons: string[];
  discrepancyClass?: string;
}

export interface ScorerDiagnostics {
  sourceCounts: {
    commitments_raw: number;
    commitments_after_dedup: number;
    commitments_after_quarantine?: number;
    signals_raw: number;
    signals_after_decrypt: number;
    signals_after_authority_filter?: number;
    entities_raw: number;
    goals_raw: number;
    goals_after_filter: number;
  };
  quarantine: {
    goals: Array<{ text: string; reason: string }>;
    commitments: Array<{ text: string; reason: string }>;
    droppedChatAuthority: string[];
  };
  candidatePool: {
    commitment: number;
    signal: number;
    relationship: number;
    relationship_skipped_no_thread: number;
  };
  filterStages: Array<{
    stage: string;
    before: number;
    after: number;
    dropped: ScorerDropEntry[];
  }>;
  discrepancies: Array<{
    id: string;
    class: string;
    title: string;
    entityName?: string;
    score: number;
    stakes: number;
    urgency: number;
    /** Canonical action for this discrepancy (for observability; no raw evidence). */
    actionType?: ActionType;
  }>;
  /** Raw `detectDiscrepancies()` output before locked / failure-suppression skips. */
  discrepancyDetectorSummary?: {
    count: number;
    classes: string[];
    preview: Array<{
      class: string;
      action_type: ActionType;
      stakes: number;
      urgency: number;
      title: string;
    }>;
  };
  /** Structural discrepancies skipped before entering the scored pool. */
  discrepancyInjectionSkips?: {
    locked_contact: number;
    failure_suppression: number;
  };
  /** Insight-scan behavioral_pattern rows added to `scored` (including score-0 suppressed). */
  insightDiscrepanciesScored?: number;
  /** Hunt layer: raw detector hit counts (pre-rank cap) + injection summary */
  huntAnomalies?: {
    countsByKind: Record<string, number>;
    injected: number;
    skippedLocked: number;
    candidateTitles: string[];
  };
  convergenceBoosts: Array<{
    candidateId: string;
    title: string;
    axes: number;
    reasons: string[];
    boost: number;
    boostedScore: number;
  }>;
  survivors: ScorerSurvivorEntry[];
  finalWinner: ScorerSurvivorEntry | null;
  finalOutcome: 'winner_selected' | 'no_valid_action' | 'zero_candidates_early';
  earlyExitStage?: string;
  /** Pool size immediately before computeCandidateScore loop (after all pre-scoring filters). */
  candidatesEnteringScoreLoop?: number;
  winnerSourceAuthority?: 'high' | 'low' | 'lowest' | null;
  interviewClusterInputs?: string[];
}

let _lastDiagnostics: ScorerDiagnostics | null = null;

export function getLastScorerDiagnostics(): ScorerDiagnostics | null {
  return _lastDiagnostics;
}

function initDiagnostics(): ScorerDiagnostics {
  return {
    sourceCounts: {
      commitments_raw: 0, commitments_after_dedup: 0,
      signals_raw: 0, signals_after_decrypt: 0,
      entities_raw: 0, goals_raw: 0, goals_after_filter: 0,
    },
    quarantine: {
      goals: [],
      commitments: [],
      droppedChatAuthority: [],
    },
    candidatePool: { commitment: 0, signal: 0, relationship: 0, relationship_skipped_no_thread: 0 },
    filterStages: [],
    discrepancies: [],
    discrepancyDetectorSummary: { count: 0, classes: [], preview: [] },
    discrepancyInjectionSkips: { locked_contact: 0, failure_suppression: 0 },
    insightDiscrepanciesScored: 0,
    convergenceBoosts: [],
    survivors: [],
    finalWinner: null,
    finalOutcome: 'zero_candidates_early',
    winnerSourceAuthority: null,
    interviewClusterInputs: [],
  };
}

export interface RankingInvariantDiagnostic {
  id: string;
  originalScore: number;
  adjustedScore: number;
  passed: boolean;
  hardRejectReasons: string[];
  penaltyReasons: string[];
}

export interface RankingInvariantResult {
  ranked: ScoredLoop[];
  diagnostics: RankingInvariantDiagnostic[];
}

export interface CrossLoopConnection {
  loopA: ScoredLoop;
  loopB: ScoredLoop;
  connectionType: 'same_person' | 'temporal_dependency' | 'resource_conflict';
  reason: string;
  /** Shared person name (for same_person connections) */
  sharedPerson?: string;
}

export interface EmergentPattern {
  type: 'approval_without_execution' | 'skip_cluster' | 'commitment_decay' | 'signal_velocity' | 'repetition_suppression';
  title: string;
  insight: string;
  dataPoints: string[];
  /** Raw surprise: how unexpected is this pattern? 0-1 */
  surpriseValue: number;
  /** How much data backs this up? 0-1 */
  dataConfidence: number;
  /** Competition score: surpriseValue * dataConfidence */
  score: number;
  suggestedActionType: ActionType;
  /** Mirror ending — always "Is this true?" */
  mirrorQuestion: string;
}

// ---------------------------------------------------------------------------
// Session 2: Revealed vs. Stated Preference
// ---------------------------------------------------------------------------

export interface RevealedGoalDivergence {
  /** The stated goal that's being contradicted */
  statedGoal: { text: string; priority: number; category: string };
  /** The domain where actual signal density is concentrated */
  revealedDomain: string;
  /** Signal count in the revealed domain over 14 days */
  revealedSignalCount: number;
  /** Signal count in the stated goal's domain over 14 days */
  statedSignalCount: number;
  /** 0-1: how far apart the stated and revealed preferences are */
  divergenceScore: number;
  /** Specific signals driving the revealed preference */
  topSignals: string[];
}

// ---------------------------------------------------------------------------
// Session 3: Anti-Pattern Archetypes
// ---------------------------------------------------------------------------

export type AntiPatternType = 'spinner' | 'approver' | 'browser';

export interface AntiPattern {
  type: AntiPatternType;
  title: string;
  insight: string;
  dataPoints: string[];
  /** How severe is the anti-pattern? 0-1 */
  severity: number;
  /** How much data backs this up? 0-1 */
  dataConfidence: number;
  /** Competition score: severity * dataConfidence */
  score: number;
  /** The specific topic/domain where the anti-pattern is active */
  focusDomain: string;
  suggestedActionType: ActionType;
  mirrorQuestion: string;
}

// ---------------------------------------------------------------------------
// Keyword matching — stakes
// ---------------------------------------------------------------------------

/** Extract significant keywords from goal text (>= 4 chars, lowercased) */
function goalKeywords(goalText: string): string[] {
  const stopwords = new Set([
    'that', 'this', 'with', 'from', 'into', 'through', 'about', 'after',
    'before', 'during', 'between', 'under', 'over', 'have', 'been', 'will',
    'would', 'should', 'could', 'their', 'them', 'they', 'than', 'then',
    'when', 'what', 'which', 'where', 'while', 'also', 'each', 'only',
    'other', 'some', 'such', 'more', 'most', 'very', 'just', 'does',
  ]);
  return goalText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopwords.has(w));
}

type GoalKeywordIndex = Map<string, string[]>;

function buildGoalKeywordIndex(goals: GoalRow[]): GoalKeywordIndex {
  const byCategory = new Map<string, Set<string>>();

  for (const goal of goals) {
    const category = goal.goal_category.trim();
    if (!category) continue;

    if (!byCategory.has(category)) {
      byCategory.set(category, new Set<string>());
    }

    for (const keyword of goalKeywords(goal.goal_text)) {
      byCategory.get(category)?.add(keyword);
    }
  }

  return new Map(
    [...byCategory.entries()]
      .map(([category, keywords]) => [category, [...keywords]] as [string, string[]])
      .filter(([, keywords]) => keywords.length > 0),
  );
}

function inferGoalCategory(text: string, goalKeywordIndex: GoalKeywordIndex): string | null {
  const lower = text.toLowerCase();
  let bestMatch: { category: string; matchedCount: number; keywordCount: number } | null = null;

  for (const [category, keywords] of goalKeywordIndex.entries()) {
    const matchedCount = keywords.filter((keyword) => lower.includes(keyword)).length;
    const passesThreshold = matchedCount >= 2 || (matchedCount === 1 && keywords.length <= 3);
    if (!passesThreshold) continue;

    if (
      !bestMatch ||
      matchedCount > bestMatch.matchedCount ||
      (matchedCount === bestMatch.matchedCount && keywords.length < bestMatch.keywordCount)
    ) {
      bestMatch = {
        category,
        matchedCount,
        keywordCount: keywords.length,
      };
    }
  }

  return bestMatch?.category ?? null;
}

function matchGoal(
  text: string,
  goals: GoalRow[],
): MatchedGoal | null {
  const lower = text.toLowerCase();
  let best: MatchedGoal | null = null;

  for (const g of goals) {
    const kws = goalKeywords(g.goal_text);
    const matched = kws.filter(kw => lower.includes(kw));
    if (matched.length >= 2 || (matched.length === 1 && kws.length <= 3)) {
      if (!best || g.priority < best.priority) {
        best = { text: g.goal_text, priority: g.priority, category: g.goal_category };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Urgency — sigmoid functions (v2: wider activation window)
// ---------------------------------------------------------------------------

/** Deadline urgency: sigmoid midpoint at 5 days, slope 1.0 */
function deadlineUrgency(dueAt: string | null, impliedDueAt: string | null): number {
  const deadline = dueAt || impliedDueAt;
  if (!deadline) return 0.3; // no deadline

  const daysUntilDue = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntilDue < 0) return 1.0; // overdue
  // Midpoint at 5 days, slope 1.0: items due this week get meaningful scores
  // 10d → 0.007, 7d → 0.12, 5d → 0.50, 3d → 0.88, 1d → 0.98
  return 1 / (1 + Math.exp(1.0 * (daysUntilDue - 5)));
}

/** Relationship urgency: higher as days since contact increases */
function relationshipUrgency(daysSinceContact: number): number {
  return 1 / (1 + Math.exp(-0.5 * (daysSinceContact - 10)));
}

/** Signal urgency: based on recency (7 days window) */
/**
 * Signal urgency with time-based decay.
 * < 7 days: full weight (1.0x base urgency)
 * 7-30 days: 0.75x
 * 30-90 days: 0.5x
 * 90-180 days: 0.25x
 * > 180 days: excluded at query level
 */
function signalUrgency(occurredAt: string): number {
  const daysSince = (Date.now() - new Date(occurredAt).getTime()) / (1000 * 60 * 60 * 24);
  // Base urgency from recency
  let base: number;
  if (daysSince <= 1) base = 0.9;
  else if (daysSince <= 3) base = 0.6;
  else base = 0.3;

  // Decay multiplier
  let decay: number;
  if (daysSince < 7) decay = 1.0;
  else if (daysSince < 30) decay = 0.75;
  else if (daysSince < 90) decay = 0.5;
  else if (daysSince < 180) decay = 0.25;
  else decay = 0; // should not reach here — excluded at query level

  return base * decay;
}

/**
 * Extract a date from goal text and compute urgency boost.
 * Supports: "March 28", "March 27", "2026-03-28", "Apr 1", etc.
 * Returns null if no date found or date is > 7 days away.
 * Returns 0.95 if <= 3 days, 0.80 if <= 7 days.
 */
function extractGoalDateUrgency(goalText: string): number | null {
  const MONTH_NAMES: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  let daysUntil: number | null = null;
  const now = new Date();

  // Pattern 1: "Month DD" (e.g., "March 28", "Apr 1")
  const monthDayMatch = goalText.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\b/i,
  );
  if (monthDayMatch) {
    const month = MONTH_NAMES[monthDayMatch[1].toLowerCase()];
    const day = parseInt(monthDayMatch[2], 10);
    if (month !== undefined && day >= 1 && day <= 31) {
      const targetDate = new Date(now.getFullYear(), month, day);
      // If the date is in the past this year, try next year
      if (targetDate.getTime() < now.getTime() - daysMs(1)) {
        targetDate.setFullYear(now.getFullYear() + 1);
      }
      daysUntil = (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    }
  }

  // Pattern 2: "YYYY-MM-DD"
  if (daysUntil === null) {
    const isoMatch = goalText.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      const targetDate = new Date(
        parseInt(isoMatch[1], 10),
        parseInt(isoMatch[2], 10) - 1,
        parseInt(isoMatch[3], 10),
      );
      daysUntil = (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    }
  }

  if (daysUntil === null || daysUntil < 0) return null;
  if (daysUntil <= 3) return 0.95;
  if (daysUntil <= 7) return 0.80;
  return null;
}

// ---------------------------------------------------------------------------
// Tractability — Bayesian from tkg_pattern_metrics (v2: includes failed_outcomes)
// ---------------------------------------------------------------------------

async function getTractability(
  userId: string,
  actionType: string,
  domain: string,
): Promise<number> {
  const supabase = createServerClient();
  const patternHash = `${actionType}:${domain}`;

  try {
    const { data } = await supabase
      .from('tkg_pattern_metrics')
      .select('total_activations, successful_outcomes, failed_outcomes')
      .eq('user_id', userId)
      .eq('pattern_hash', patternHash)
      .maybeSingle();

    if (!data) return 0.5; // cold start

    // Bayesian with failures: (successes + 1) / (successes + failures + 2)
    const successes = data.successful_outcomes ?? 0;
    const failures = data.failed_outcomes ?? 0;
    const t = (successes + 1) / (successes + failures + 2);
    return Math.max(0.1, t); // floor at 0.1
  } catch {
    return 0.5;
  }
}

// ---------------------------------------------------------------------------
// Suppressed candidate cooldown — skip scorer loops recently blocked as near-duplicates
// ---------------------------------------------------------------------------

type ScorerBaseCandidate = {
  id: string;
  type: 'commitment' | 'signal' | 'relationship';
  title: string;
  content: string;
  actionType: ActionType;
  urgency: number;
  matchedGoal: MatchedGoal | null;
  domain: string;
  sourceSignals: GenerationCandidateSource[];
  entityPatterns?: unknown;
  entityName?: string;
  author?: string;
  commitmentDueMs?: number;
  calendarEventStartMs?: number;
};

/** Stable key aligned with `getSuppressedCandidateKeys` extraction from skipped rows. */
export function scorerCandidateSuppressionKey(candidate: Pick<ScorerBaseCandidate, 'id' | 'sourceSignals'>): string {
  const ss = candidate.sourceSignals ?? [];
  const rel = ss.find((s) => s.kind === 'relationship' && s.id);
  const sig = ss.find((s) => s.kind === 'signal' && s.id);
  const com = ss.find((s) => s.kind === 'commitment' && s.id);
  if (rel?.id) {
    const sid = sig?.id ?? com?.id ?? rel.id;
    return `${String(sid)}:${String(rel.id)}`;
  }
  const sid = sig?.id ?? com?.id ?? candidate.id;
  return `${String(sid)}:*`;
}

function suppressionKeyFromLoggedCandidate(tc: GenerationCandidateLog): string | null {
  const ss = tc.sourceSignals ?? [];
  const rel = ss.find((s) => s.kind === 'relationship' && s.id);
  const sig = ss.find((s) => s.kind === 'signal' && s.id);
  const com = ss.find((s) => s.kind === 'commitment' && s.id);
  if (rel?.id) {
    const sid = sig?.id ?? com?.id ?? rel.id;
    return `${String(sid)}:${String(rel.id)}`;
  }
  const sid = sig?.id ?? com?.id ?? tc.id;
  return `${String(sid)}:*`;
}

/**
 * Whether a skipped `tkg_actions` row should contribute scorer cooldown keys from
 * `generation_log.candidateDiscovery.topCandidates` (duplicate generator path, or reconcile
 * auto-suppression of extra pending rows / legacy forced-fresh skips).
 */
export function skippedRowQualifiesForDuplicateSuppressionCooldown(row: {
  directive_text?: string | null;
  skip_reason?: string | null;
  execution_result?: Record<string, unknown> | null;
}): boolean {
  const dt = String(row.directive_text ?? '');
  const er = row.execution_result ?? null;

  const dupInDirective = /duplicate_\d+pct_similar/i.test(dt) || /duplicate_100pct_similar/i.test(dt);
  const orig = er?.original_candidate as Record<string, unknown> | undefined;
  const blockedBy = typeof orig?.blocked_by === 'string' ? orig.blocked_by : '';
  const dupInBlockedBy = /duplicate_\d+pct_similar/i.test(blockedBy) || /duplicate_100pct_similar/i.test(blockedBy);
  const fc = er?.failure_class;
  const dupFailureClass = fc === 'duplicate_100pct_similar';

  if (dupInDirective || dupInBlockedBy || dupFailureClass) return true;

  const sr = (row.skip_reason ?? '').toLowerCase();
  const auto =
    typeof er?.auto_suppression_reason === 'string' ? er.auto_suppression_reason.toLowerCase() : '';
  if (sr.includes('duplicate pending') || sr.includes('forced fresh')) return true;
  if (auto.includes('duplicate pending') || auto.includes('forced fresh')) return true;

  return false;
}

/**
 * Reads recent skipped `tkg_actions` where near-duplicate suppression fired (directive text or
 * `original_candidate.blocked_by`), then derives `${signalId}:${entityId}` keys from persisted
 * `execution_result.generation_log.candidateDiscovery.topCandidates` when present.
 *
 * Note: `gate_that_blocked` / `failure_class` live on `system_health`, not `tkg_actions`; this
 * uses the fields that actually exist on skipped rows (duplicate_* in `directive_text` / blocked_by).
 */
export async function getSuppressedCandidateKeys(
  userId: string,
  supabase: ReturnType<typeof createServerClient>,
  windowDays = 7,
): Promise<Set<string>> {
  const since = new Date(Date.now() - daysMs(windowDays)).toISOString();
  const { data: rows, error } = await supabase
    .from('tkg_actions')
    .select('directive_text, execution_result, skip_reason')
    .eq('user_id', userId)
    .eq('status', 'skipped')
    .gte('generated_at', since);

  if (error || !rows?.length) return new Set();

  const keys = new Set<string>();

  for (const row of rows) {
    const r = row as {
      directive_text?: string | null;
      skip_reason?: string | null;
      execution_result?: Record<string, unknown> | null;
    };
    if (!skippedRowQualifiesForDuplicateSuppressionCooldown(r)) continue;

    const er = r.execution_result ?? null;
    const genLog = er?.generation_log as Record<string, unknown> | undefined;
    const discovery = genLog?.candidateDiscovery as { topCandidates?: GenerationCandidateLog[] } | undefined;
    const top = discovery?.topCandidates ?? [];
    if (top.length === 0) continue;

    for (const tc of top) {
      const k = suppressionKeyFromLoggedCandidate(tc);
      if (k) keys.add(k);
    }
  }

  return keys;
}

// ---------------------------------------------------------------------------
// Freshness — penalize recently-surfaced loops (v2: new)
// ---------------------------------------------------------------------------

/**
 * Check how recently this loop's content was surfaced as a directive.
 * Returns a freshness multiplier: 1.0 (never surfaced) → 0.3 (surfaced today).
 */
async function getFreshness(
  userId: string,
  loopTitle: string,
  loopType: string,
): Promise<number> {
  const supabase = createServerClient();
  const threeDaysAgo = new Date(Date.now() - daysMs(3)).toISOString();

  try {
    // Check for recent pending_approval/executed actions with similar directive text
    const { data: recentActions } = await supabase
      .from('tkg_actions')
      .select('directive_text, generated_at, status, execution_result')
      .eq('user_id', userId)
      .gte('generated_at', threeDaysAgo)
      .in('status', ['pending_approval', 'executed', 'skipped', 'draft_rejected'])
      .limit(30);

    const allActions = recentActions ?? [];
    if (allActions.length === 0) return 1.0;

    // Count how many recent directives are similar (keyword overlap)
    const titleWords = new Set(
      loopTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 4),
    );
    if (titleWords.size === 0) return 1.0;

    let similarCount = 0;
    let anySkipped = false;
    for (const a of allActions) {
      const dirText = (a.directive_text as string ?? '').toLowerCase();
      // Also check original_candidate.candidate_description so quality-gate-blocked
      // rows contribute to freshness penalty (fix: commit 4a75257 added this metadata).
      const execResult = a.execution_result as Record<string, unknown> | null;
      const origCandidate = execResult?.original_candidate as Record<string, unknown> | undefined;
      const origDesc = typeof origCandidate?.candidate_description === 'string'
        ? origCandidate.candidate_description.toLowerCase()
        : '';
      const searchText = dirText + ' ' + origDesc;
      const overlap = [...titleWords].filter(w => searchText.includes(w)).length;
      if (overlap >= 2 || (overlap >= 1 && titleWords.size <= 2)) {
        similarCount++;
        // Only count as user-skipped when the generation actually produced a real directive
        // (outcome === 'selected'). Generation failures (no_send) are internal errors —
        // the user never saw the content, so they cannot have "rejected" it.
        const genLogOutcome = (execResult?.generation_log as Record<string, unknown> | undefined)?.outcome;
        const userActuallySkipped = (a.status === 'skipped' || a.status === 'draft_rejected')
          && genLogOutcome === 'selected';
        if (userActuallySkipped) {
          anySkipped = true;
        }
      }
    }

    if (similarCount === 0) return 1.0;

    // Each similar recent directive reduces freshness — analyst mode penalizes
    // "already known" topics harder to force novel insights to the surface.
    // 1 similar → 0.5, 2 → 0.3, 3+ → 0.2
    // If any were skipped, harsh penalty — user already said "I know this"
    let freshness = Math.max(0.2, 1.0 - (similarCount * 0.25));
    if (anySkipped) freshness *= 0.3; // user explicitly rejected similar content
    return Math.max(0.05, freshness);
  } catch {
    return 1.0;
  }
}

// ---------------------------------------------------------------------------
// Feedback loop — action-type approval rate (v3: new)
// ---------------------------------------------------------------------------

/**
 * For each action_type, compute approved / (approved + skipped + rejected).
 * Requires minimum 3 historical actions of this type to activate.
 * Returns 0.5 (neutral) if insufficient data.
 */
async function getActionTypeApprovalRate(
  userId: string,
  actionType: string,
): Promise<number> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();

  try {
    const { data: actions } = await supabase
      .from('tkg_actions')
      .select('status')
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .gte('generated_at', thirtyDaysAgo)
      .in('status', ['approved', 'executed', 'skipped', 'draft_rejected', 'rejected'])
      .limit(100);

    if (!actions || actions.length < 3) return 0.5; // cold start

    const approved = actions.filter(
      (a) => (a.status as string) === 'approved' || (a.status as string) === 'executed',
    ).length;
    const total = actions.length;

    // Floor at 0.1 so heavily-skipped types still have a chance
    return Math.max(0.1, approved / total);
  } catch {
    return 0.5;
  }
}

// ---------------------------------------------------------------------------
// Feedback loop — entity skip penalty (v3: new)
// ---------------------------------------------------------------------------

/**
 * Novelty kill: checks two signals that mean "user already thought of this."
 *
 * 1. Sent-mail check — if the user already emailed this entity in the last 14 days,
 *    the candidate is stale. The system was blind to sent mail; this closes that gap.
 * 2. Skip threshold — 2+ consecutive skips (down from 3) means the user saw it,
 *    rejected it, and doesn't want it repackaged. Hard kill.
 *
 * Returns -30 (score penalty that triggers exponential suppression) or 0.
 * Callers that need a hard drop should check the returned value against -30.
 */
async function getEntitySkipPenalty(
  userId: string,
  candidateContent: string,
  candidateTitle: string,
): Promise<number> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();

  const names = extractPersonNames(`${candidateTitle} ${candidateContent}`);
  if (names.length === 0) return 0;

  try {
    // 2+ consecutive skips = user already considered this.
    // The prior sent-mail novelty check depended on full-body fetches from
    // tkg_signals.content. Scoring is now metadata-first, so novelty is enforced
    // via recent action history instead of thread-body hydration.
    const { data: recentActions } = await supabase
      .from('tkg_actions')
      .select('directive_text, status, execution_result')
      .eq('user_id', userId)
      .gte('generated_at', thirtyDaysAgo)
      .in('status', ['approved', 'executed', 'skipped', 'draft_rejected', 'rejected'])
      .order('generated_at', { ascending: false })
      .limit(100);

    if (!recentActions || recentActions.length === 0) return 0;

    for (const name of names) {
      const firstName = name.split(' ')[0].toLowerCase();
      if (firstName.length < 3) continue;

      const entityActions = recentActions.filter((a) => {
        const directiveText = ((a.directive_text as string) ?? '').toLowerCase();
        const execResult = a.execution_result as Record<string, unknown> | null;
        const origCandidate = execResult?.original_candidate as Record<string, unknown> | undefined;
        const originalText = typeof origCandidate?.candidate_description === 'string'
          ? origCandidate.candidate_description.toLowerCase()
          : '';
        return directiveText.includes(firstName) || originalText.includes(firstName);
      });

      if (entityActions.length < 2) continue;

      let consecutiveSkips = 0;
      for (const a of entityActions) {
        if (['skipped', 'draft_rejected', 'rejected'].includes(a.status as string)) {
          consecutiveSkips++;
        } else {
          break;
        }
      }

      if (consecutiveSkips >= 2) return -30;
    }

    // Consecutive-candidate penalty: if the last 3 actions all have 80%+ word overlap
    // with the current candidate's entity names, the same candidate has been winning
    // repeatedly without producing a send. Penalize to force rotation.
    //
    // Checks BOTH directive_text AND execution_result.original_candidate.candidate_description
    // so the penalty fires even when directive_text is a wait_rationale fallback (do_nothing rows).
    if (names.length > 0 && recentActions.length >= 3) {
      const currentDesc = names.join(' ').toLowerCase();
      const words = currentDesc.split(/\s+/).filter((w: string) => w.length >= 4);
      if (words.length > 0) {
        const last3 = recentActions.slice(0, 3);
        const allMatch = last3.every((a) => {
          const directiveText = ((a.directive_text as string) ?? '').toLowerCase();
          const execResult = a.execution_result as Record<string, unknown> | null;
          const origCandidate = execResult?.original_candidate as Record<string, unknown> | undefined;
          const origDesc =
            typeof origCandidate?.candidate_description === 'string'
              ? origCandidate.candidate_description.toLowerCase()
              : '';
          const combined = `${directiveText} ${origDesc}`;
          const matched = words.filter((w: string) => combined.includes(w)).length;
          return matched / words.length >= 0.8;
        });
        if (allMatch) return -50;
      }
    }

    return 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Gemini candidate scoring function (v4: replaces flat formula)
// ---------------------------------------------------------------------------

export type ApprovalAction = {
  action_type: string;
  status: 'approved' | 'skipped' | 'rejected';
  created_at: string;
  commitment_id: string | null;
  outcome_closed?: boolean;
};

export function computeCandidateScore(args: {
  stakes: number;
  urgency: number;
  tractability: number;
  actionType: string;
  entityPenalty: number;
  daysSinceLastSurface: number;
  commitmentId?: string | null;
  approvalHistory: ApprovalAction[];
  now?: Date;
  /** High-stakes candidates (stakes ≥ 4) get reduced freshness penalty so they aren't buried for 3 days */
  highStakes?: boolean;
  /** Pooled cross-user prior for this coarse bucket (0–1). Blended with personal history. */
  globalPriorRate?: number | null;
}): { score: number; breakdown: { stakes_raw: number; stakes_transformed: number; urgency_raw: number; urgency_effective: number; tractability: number; exec_potential: number; behavioral_rate: number; novelty_multiplier: number; suppression_multiplier: number; final_score: number } } {
  const nowMs = (args.now || new Date()).getTime();
  const relevant = args.approvalHistory.filter(a => a.action_type === args.actionType);
  const n = relevant.length;
  let rate = 0.5;

  if (n > 0) {
    let wSuccess = 0, wTotal = 0;
    for (const action of relevant) {
      const daysOld = Math.max(0, (nowMs - new Date(action.created_at).getTime()) / 86400000);
      const weight = Math.pow(0.5, daysOld / 21.0);
      // Outcome-closed actions (confirmed reply/result) get 1.5x weight —
      // actions that produced real-world outcomes are stronger positive signals.
      const outcomeBonus = (action.status === 'approved' && action.outcome_closed) ? 1.5 : 1.0;
      wTotal += weight;
      if (action.status === 'approved') wSuccess += weight * outcomeBonus;
    }
    const computed = wTotal > 0 ? (wSuccess / wTotal) : 0.5;
    const blended = n < 5 ? 0.5 : n < 15 ? (((n - 5) / 10) * computed) + ((15 - n) / 10 * 0.5) : computed;

    // Cold-start prior: blend with 0.50 prior weighted by 10 virtual observations.
    // When n < 10, the prior dominates; as n grows, actual data takes over.
    rate = (blended * n + 0.50 * 10) / (n + 10);
  }

  const g = args.globalPriorRate;
  if (typeof g === 'number' && g >= 0 && g <= 1 && !Number.isNaN(g)) {
    const k = 5;
    rate = (rate * n + g * k) / (n + k);
  }

  // Rate floor: even with 100% skip history, rate never drops below 0.25.
  // This prevents pre-rewrite garbage skips from permanently burying action types.
  rate = Math.max(rate, 0.25);

  // Analyst mode: surfaced-yesterday topics get crushed — force the system
  // to find something new rather than repeating what the user just saw.
  // Exception: high-stakes entities (stakes ≥ 4) get a reduced freshness penalty
  // so they aren't buried for 3 days when they are genuinely urgent.
  const nov = args.highStakes
    ? (args.daysSinceLastSurface === 1 ? 0.70 : 1.0)   // half-penalty day 1, no penalty day 2+
    : (args.daysSinceLastSurface === 1 ? 0.35 : args.daysSinceLastSurface === 2 ? 0.65 : 1.0);
  const sup = args.entityPenalty < 0
    ? (args.highStakes ? Math.exp(args.entityPenalty / 1.0) : Math.exp(args.entityPenalty / 2.0))
    : 1.0;

  const urgencyFloor = ((args.stakes - 1) / 4) * 0.2;
  const uEff = Math.min(1, args.urgency * 0.9 + urgencyFloor);
  const t = Math.max(0.01, args.tractability);
  const execRaw = (2 * uEff * t) / (uEff + t);
  // Executable action bonus: candidates with high tractability and an action type
  // that can produce finished work get a small boost to prefer them over do_nothing.
  const EXECUTABLE_TYPES = new Set(['send_message', 'write_document']);
  const execBonus = (t >= 0.70 && EXECUTABLE_TYPES.has(args.actionType)) ? 0.10 : 0;
  const exec = Math.min(1, execRaw + execBonus);

  const stakesTransformed = Math.pow(args.stakes, 0.6);
  const finalScore = stakesTransformed * exec * rate * nov * sup * 3.0;

  return {
    score: finalScore,
    breakdown: {
      stakes_raw: args.stakes,
      stakes_transformed: stakesTransformed,
      urgency_raw: args.urgency,
      urgency_effective: uEff,
      tractability: args.tractability,
      exec_potential: exec,
      behavioral_rate: rate,
      novelty_multiplier: nov,
      suppression_multiplier: sup,
      final_score: finalScore,
    },
  };
}

// ---------------------------------------------------------------------------
// Approval history — raw action rows for behavioral rate (v4: new)
// ---------------------------------------------------------------------------

async function getApprovalHistory(userId: string): Promise<ApprovalAction[]> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();

  try {
    const { data } = await supabase
      .from('tkg_actions')
      .select('action_type, status, generated_at, feedback_weight, outcome_closed')
      .eq('user_id', userId)
      .gte('generated_at', thirtyDaysAgo)
      .in('status', ['approved', 'executed', 'skipped', 'draft_rejected', 'rejected'])
      .order('generated_at', { ascending: false })
      .limit(200);

    return (data ?? [])
      .filter(a => (a.feedback_weight as number ?? 1) !== 0)
      .map(a => ({
        action_type: a.action_type as string,
        status: ((a.status as string) === 'executed' ? 'approved'
          : (a.status as string) === 'draft_rejected' ? 'rejected'
          : a.status) as 'approved' | 'skipped' | 'rejected',
        created_at: a.generated_at as string,
        commitment_id: null,
        outcome_closed: (a.outcome_closed as boolean) ?? false,
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Days since last surface — keyword-matching recurrence detection (v4: new)
// ---------------------------------------------------------------------------

/**
 * Compute how many days ago this candidate's topic was last surfaced as a directive.
 * Uses keyword overlap (same approach as getFreshness) but returns integer days
 * for the novelty penalty in computeCandidateScore.
 *
 * Returns 0 if never surfaced (maps to novelty_multiplier = 1.0, no penalty).
 */
async function getDaysSinceLastSurface(
  userId: string,
  candidateTitle: string,
): Promise<number> {
  const supabase = createServerClient();
  const threeDaysAgo = new Date(Date.now() - daysMs(3)).toISOString();

  try {
    const { data: recentActions } = await supabase
      .from('tkg_actions')
      .select('directive_text, generated_at, status, execution_result')
      .eq('user_id', userId)
      .gte('generated_at', threeDaysAgo)
      .in('status', ['pending_approval', 'executed', 'skipped', 'draft_rejected'])
      .order('generated_at', { ascending: false })
      .limit(30);

    const allActions2 = recentActions ?? [];
    if (allActions2.length === 0) return 0;

    const titleWords2 = new Set(
      candidateTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 4),
    );
    if (titleWords2.size === 0) return 0;

    // Find the most recent matching action — include original_candidate so
    // quality-gate-blocked no_send rows count as "surfaced" for freshness.
    for (const a of allActions2) {
      const dirText = (a.directive_text as string ?? '').toLowerCase();
      const execResult = a.execution_result as Record<string, unknown> | null;
      const origCandidate = execResult?.original_candidate as Record<string, unknown> | undefined;
      const origDesc = typeof origCandidate?.candidate_description === 'string'
        ? origCandidate.candidate_description.toLowerCase()
        : '';
      const searchText = dirText + ' ' + origDesc;
      const overlap = [...titleWords2].filter(w => searchText.includes(w)).length;
      if (overlap >= 2 || (overlap >= 1 && titleWords2.size <= 2)) {
        const daysAgo = Math.max(0, Math.floor(
          (Date.now() - new Date(a.generated_at as string).getTime()) / 86400000,
        ));
        return daysAgo;
      }
    }

    return 0; // no match found → never surfaced → fresh
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Relationship enrichment (v2: new)
// ---------------------------------------------------------------------------

/** Exported for `generator.ts` hydration (`hydrateWinnerRelationshipContext`). */
export async function enrichRelationshipContext(
  userId: string,
  entityName: string,
  entityPatterns: unknown,
): Promise<string> {
  const supabase = createServerClient();
  const parts: string[] = [];

  // Include entity patterns if available
  if (entityPatterns && typeof entityPatterns === 'object') {
    const patterns = Array.isArray(entityPatterns) ? entityPatterns : [entityPatterns];
    const patternText = patterns
      .map((p: any) => typeof p === 'string' ? p : p.pattern ?? p.description ?? '')
      .filter((s: string) => s.length > 0)
      .slice(0, 3);
    if (patternText.length > 0) {
      parts.push(`Known patterns: ${patternText.join('; ')}`);
    }
  }

  // Find recent signals mentioning this person
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();
  try {
    const { data: signalRows } = await supabase
      .from('tkg_signals')
      .select('id, source, occurred_at, author, type, source_id')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', thirtyDaysAgo)
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (signalRows && signalRows.length > 0) {
      const nameLower = entityName.toLowerCase();
      const firstName = nameLower.split(/\s+/)[0];
      const mentioning = buildSignalMetadataSummaryRows(
        signalRows.map((signal: any) => ({
          id: String(signal.id),
          source: String(signal.source ?? ''),
          occurred_at: String(signal.occurred_at ?? ''),
          author: (signal.author as string | null) ?? null,
          type: (signal.type as string | null) ?? null,
          source_id: (signal.source_id as string | null) ?? null,
        })),
      )
        .filter((signal) => {
          const authorLower = (signal.author ?? '').toLowerCase();
          return authorLower.includes(nameLower) || authorLower.includes(firstName);
        })
        .slice(0, 3);

      if (mentioning.length > 0) {
        parts.push('Recent mentions:');
        for (const signal of mentioning) {
          const date = signal.occurred_at.slice(0, 10);
          parts.push(`  [${date}] ${signal.content.replace(/\s+/g, ' ').slice(0, 300)}`);
        }
      }
    }
  } catch {
    // non-critical
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Infer action type from commitment/signal content
// ---------------------------------------------------------------------------

export function inferActionType(text: string, loopType: 'commitment' | 'signal' | 'relationship'): ActionType {
  if (loopType === 'relationship') return 'send_message';

  const lower = text.toLowerCase();
  if (/\b(interview|phone screen|panel interview|screening interview|answer architecture)\b/.test(lower)) {
    return 'write_document';
  }
  if (/\b(email|reply|respond|send|follow.?up|reach out|contact)\b/.test(lower)) return 'send_message';
  if (/\b(decide|decision|choose|option|weigh)\b/.test(lower)) return 'make_decision';
  if (/\b(schedule|calendar|meeting|call|appointment)\b/.test(lower)) return 'schedule';
  if (/\b(research|investigate|look into|find out)\b/.test(lower)) return 'make_decision';
  if (/\b(wait|hold|pause|defer|delay)\b/.test(lower)) return 'do_nothing';
  return 'send_message'; // default: most commitments resolve to follow-ups
}

// ---------------------------------------------------------------------------
// Infer domain from goal match or content
// ---------------------------------------------------------------------------

function inferDomain(
  matchedGoal: MatchedGoal | null,
  text: string,
  goalKeywordIndex: GoalKeywordIndex,
  fallbackCategory: string,
): string {
  if (matchedGoal) return matchedGoal.category;
  return inferGoalCategory(text, goalKeywordIndex) ?? fallbackCategory;
}

export function isSendOrWriteCapableAction(actionType: ActionType): boolean {
  return (
    actionType === 'send_message'
    || actionType === 'write_document'
    || actionType === 'make_decision'
    || actionType === 'research'
    || actionType === 'schedule'
  );
}

function normalizeForDuplicate(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => (token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token))
    .filter((token) => token.length >= 4 && !DUPLICATE_STOPWORDS.has(token));
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection++;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union > 0 ? intersection / union : 0;
}

function computeEvidenceDensity(candidate: ScoredLoop): number {
  const combined = `${candidate.title} ${candidate.content}`;
  const hasConcrete = /@|\$|\b\d{4}-\d{2}-\d{2}\b|\b[A-Z0-9]{5,}\b/.test(combined);
  let density = 0;
  if (candidate.matchedGoal) density += 1;
  if ((candidate.relatedSignals?.length ?? 0) > 0) density += 1;
  if ((candidate.sourceSignals?.length ?? 0) > 0) density += 1;
  if (hasConcrete) density += 1;
  if (candidate.type === 'discrepancy' || candidate.type === 'hunt') density += 1;
  // Relationship candidates: the entity's presence in tkg_entities (verified interaction history)
  // is itself concrete evidence — equivalent to a confirmed source signal.
  if (candidate.type === 'relationship') density += 1;
  return density;
}

function isObviousFirstLayerAdvice(candidate: ScoredLoop): boolean {
  const combined = `${candidate.title}\n${candidate.content}`.trim();
  return OBVIOUS_FIRST_LAYER_PATTERNS.some((pattern) => pattern.test(combined));
}

function isOutcomeLinkedCandidate(candidate: ScoredLoop): boolean {
  if (candidate.type === 'discrepancy' || candidate.type === 'hunt') return true;
  // Verified relationship candidates from tkg_entities ARE inherently outcome-linked —
  // maintaining a high-value relationship is a board-level outcome (career, revenue, referral).
  if (candidate.type === 'relationship') return true;
  if (candidate.matchedGoal) return true;
  const combined = `${candidate.title} ${candidate.content}`;
  return OUTCOME_SIGNAL_PATTERNS.some((pattern) => pattern.test(combined));
}

export function isGoalPrimacyExemptCareerCommitment(
  candidate: Pick<ScoredLoop, 'type' | 'title' | 'content'>,
): boolean {
  if (candidate.type !== 'commitment') return false;
  const combined = `${candidate.title} ${candidate.content}`;
  return CAREER_EXECUTION_COMMITMENT_PATTERNS.some((pattern) => pattern.test(combined));
}

/**
 * Interview-class write_document candidates (signal, relationship, or commitment)
 * are inherently goal-primacy exempt: a confirmed, dated, hiring-context interview
 * prep artifact is a board-changing outcome even if it does not textually match a
 * user-authored goal. This uses the same narrow test that stakes-gate.ts uses to
 * admit these candidates into scoring.
 */
export function isGoalPrimacyExemptInterviewWriteDocument(
  candidate: Pick<ScoredLoop, 'type' | 'title' | 'content' | 'suggestedActionType' | 'entityName' | 'matchedGoal' | 'sourceSignals' | 'id'>,
): boolean {
  if (candidate.suggestedActionType !== 'write_document') return false;
  return isTimeBoundInterviewExecutionCandidate({
    id: candidate.id,
    type: candidate.type === 'commitment' || candidate.type === 'signal' || candidate.type === 'relationship'
      ? candidate.type
      : 'signal',
    title: candidate.title,
    content: candidate.content,
    actionType: 'write_document',
    urgency: 0,
    matchedGoal: candidate.matchedGoal,
    domain: '',
    sourceSignals: candidate.sourceSignals ?? [],
    entityName: candidate.entityName,
  }, adaptInterviewSourceSignalsForGate(candidate.sourceSignals));
}

function isDecisionMovingCandidate(candidate: ScoredLoop): boolean {
  if (!isOutcomeLinkedCandidate(candidate)) return false;
  if (candidate.type === 'discrepancy' || candidate.type === 'hunt') return true;
  return (candidate.breakdown.stakes ?? 0) >= 2 || (candidate.breakdown.urgency ?? 0) >= 0.6;
}

function getInvariantFailureReasons(candidate: ScoredLoop): string[] {
  const lifecycle = candidate.lifecycle;
  const actionableNow = lifecycle
    ? lifecycle.state === 'active_now' && lifecycle.actionability === 'actionable'
    : candidate.score > 0;
  const reasons: string[] = [];
  // Relationship candidates are exempt from both noise and obvious-advice checks.
  // "Follow up with X" is their canonical title format (built from tkg_entities) —
  // it looks like a generic phrase but represents a verified entity with real interaction history.
  // Discrepancy and hunt rows are detector- or thread-anchored — same rationale as relationship.
  const isRelationship = candidate.type === 'relationship';
  const exemptFromObviousNoiseHeuristics =
    isRelationship
    || candidate.type === 'discrepancy'
    || candidate.type === 'hunt';
  const obviousAdvice = exemptFromObviousNoiseHeuristics ? false : isObviousFirstLayerAdvice(candidate);
  const routineMaintenance = exemptFromObviousNoiseHeuristics
    ? false
    : isNoiseCandidateText(candidate.title, candidate.content);
  const evidenceDensity = computeEvidenceDensity(candidate);
  const alreadyKnown = (candidate.breakdown.freshness ?? 1) <= 0.35 || (candidate.breakdown.entityPenalty ?? 0) <= -20;

  if (!actionableNow) reasons.push('non_actionable');
  if (!isSendOrWriteCapableAction(candidate.suggestedActionType)) reasons.push('not_send_or_write_capable');
  if (!isDecisionMovingCandidate(candidate)) reasons.push('not_decision_moving');
  if (routineMaintenance) reasons.push('routine_maintenance');
  if (obviousAdvice) reasons.push('obvious_first_layer_advice');
  if (alreadyKnown) reasons.push('already_known_pattern');
  if (evidenceDensity < 1) reasons.push('weak_evidence_density');
  return reasons;
}

export function passesTop3RankingInvariants(candidate: ScoredLoop): boolean {
  return getInvariantFailureReasons(candidate).length === 0;
}

/**
 * Thread-backed external send_message: real entity + sendable action. Used by ranking
 * invariants and generator viability to prefer concrete outreach over internal
 * discrepancy artifacts (write_document / make_decision). Includes `hunt` (mail-thread
 * reply obligations) alongside relationship/commitment and eligible discrepancy classes.
 */
const THREAD_BACKED_SENDABLE_DISCREPANCY_CLASSES = new Set<string>([
  'decay',
  'risk',
  'engagement_collapse',
  'relationship_dropout',
  'meeting_open_thread',
  'preparation_gap',
  'convergence',
]);

/**
 * Calendar/admin discrepancy classes can be useful, but they should not inherit
 * hard discrepancy-priority force promotion when they are not anchored to a
 * stated goal. This prevents household/admin meeting prep artifacts from
 * displacing materially higher-value outbound moves.
 */
const CALENDAR_ADMIN_DISCREPANCY_CLASSES = new Set<string>([
  'meeting_open_thread',
  'preparation_gap',
  'exposure',
]);

function isLowValueCalendarAdminDiscrepancy(candidate: ScoredLoop): boolean {
  return (
    candidate.type === 'discrepancy'
    && CALENDAR_ADMIN_DISCREPANCY_CLASSES.has(candidate.discrepancyClass ?? '')
    && candidate.matchedGoal == null
  );
}

export function isThreadBackedSendableLoop(c: ScoredLoop): boolean {
  if (c.score <= 0) return false;
  const hasSendableAction = c.suggestedActionType === 'send_message';
  const hasExternalEntity = Boolean(c.entityName && c.entityName.trim().length > 0);
  if (c.type === 'discrepancy') {
    return (
      hasSendableAction
      && hasExternalEntity
      && c.discrepancyClass !== 'behavioral_pattern'
      && THREAD_BACKED_SENDABLE_DISCREPANCY_CLASSES.has(c.discrepancyClass ?? '')
    );
  }
  // Hunt: mail-thread–grounded external reply obligation (same product bar as
  // relationship send_message — must not lose final viability to an internal
  // discrepancy write_document when both are in the top shortlist).
  if (c.type === 'hunt') {
    return hasSendableAction && hasExternalEntity;
  }
  if (c.type === 'commitment' || c.type === 'relationship') {
    return hasSendableAction && hasExternalEntity;
  }
  return false;
}

function scoredLoopSearchText(candidate: ScoredLoop): string {
  const sourceText = candidate.sourceSignals
    .map((source) => `${source.summary ?? ''} ${source.source ?? ''}`)
    .join(' ');
  const triggerText = candidate.trigger
    ? [
      candidate.trigger.baseline_state,
      candidate.trigger.current_state,
      candidate.trigger.delta,
      candidate.trigger.timeframe,
      candidate.trigger.why_now,
      candidate.trigger.outcome_class,
    ].join(' ')
    : '';
  return [
    candidate.title,
    candidate.content,
    sourceText,
    triggerText,
    candidate.discrepancyEvidence ?? '',
    candidate.matchedGoal?.text ?? '',
  ].join(' ').toLowerCase();
}

function isDecisiveSchedulingPressureCandidate(candidate: ScoredLoop): boolean {
  if (candidate.type !== 'discrepancy') return false;
  if (candidate.discrepancyClass !== 'exposure') return false;
  if (candidate.suggestedActionType !== 'write_document') return false;

  const text = scoredLoopSearchText(candidate);
  const hasOpenCommitmentPattern =
    /\bcommitment due\b|\bcommitted to\b|\bno execution artifact\b|\bopen commitment\b|\bdue in \d+d\b/i.test(text);
  const hasSchedulingInstruction =
    /\bself[-\s]?schedul|\bschedule (?:your|the|an?)\b|\bselect (?:your|an?) (?:interview )?(?:date|time|slot)|\bconfirm appointment\b|\binterview slots?\b|\bcareers\.wa\.gov\b/i.test(text);
  const hasRequiredNextStep =
    /\bnot (?:yet )?scheduled\b|\bunscheduled\b|\brequired next step\b|\bcritical next step\b|\bneeds to happen\b|\bmust\b|\brequired\b/i.test(text);
  const hasFirstComePressure =
    /\bfirst[-\s]?come\b|\bfirst come, first served\b|\bfirst served\b|\breserved on a first\b|\bslots? (?:are )?reserved\b/i.test(text);
  const hasRealDatePressure =
    /\b20\d{2}-\d{2}-\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d+\s+day(?:s)?\b|\bdue in \d+d\b|\bdeadline\b/i.test(text);

  return (
    hasOpenCommitmentPattern
    && hasSchedulingInstruction
    && hasRequiredNextStep
    && hasFirstComePressure
    && hasRealDatePressure
  );
}

function isGenericPrepStyleDocumentCandidate(candidate: ScoredLoop): boolean {
  if (candidate.suggestedActionType !== 'write_document') return false;
  if (isDecisiveSchedulingPressureCandidate(candidate)) return false;
  if (isThreadBackedSendableLoop(candidate)) return false;
  if (isInterviewWeekExecutionCandidate(candidate)) return false;

  const text = scoredLoopSearchText(candidate);
  return (
    candidate.discrepancyClass === 'preparation_gap'
    || candidate.discrepancyClass === 'behavioral_pattern'
    || /\bprep(?:aration)?\b|\bdeadline appears\b|\bgeneric\b|\bbrief\b|\bmemo\b|\bagenda\b/.test(text)
  );
}

function isInterviewWeekExecutionCandidate(candidate: ScoredLoop): boolean {
  if (candidate.suggestedActionType !== 'write_document') return false;
  const text = scoredLoopSearchText(candidate);
  return (
    candidate.discrepancyClass === 'behavioral_pattern' &&
    /\bINTERVIEW_WEEK_CLUSTER\b|\binterview week cluster detected\b/i.test(`${candidate.title}\n${candidate.content}`) &&
    /\binterview\b/i.test(text)
  );
}

function isPriorityCareerOutcomeArtifactCandidate(candidate: ScoredLoop): boolean {
  if (isInterviewWeekExecutionCandidate(candidate)) return true;
  if (candidate.suggestedActionType !== 'write_document') return false;

  const text = scoredLoopSearchText(candidate);
  const hasInterviewOrHiringPressure =
    /\binterview|phone screen|panel interview|screening interview|candidate interview|hiring decision|offer\b/i.test(text);
  const isCareerGoalMatched = candidate.matchedGoal?.category === 'career';
  const hasOutcomeValue = (candidate.breakdown.stakes ?? 0) >= 3 && (candidate.breakdown.urgency ?? 0) >= 0.7;

  return hasOutcomeValue && (isCareerGoalMatched || hasInterviewOrHiringPressure);
}

function isRelationshipMaintenanceOrAbstractRiskCandidate(candidate: ScoredLoop): boolean {
  if (candidate.type !== 'discrepancy') return false;
  if (candidate.matchedGoal?.category === 'career') return false;

  if (
    candidate.discrepancyClass === 'decay'
    || candidate.discrepancyClass === 'relationship_dropout'
    || candidate.discrepancyClass === 'engagement_collapse'
  ) {
    return true;
  }

  if (candidate.discrepancyClass !== 'behavioral_pattern') return false;

  const text = scoredLoopSearchText(candidate);
  return (
    /\bacross \d+ contacts\b|\btheme\b|\bdeadline appears\b/.test(text)
    && !/\binterview|phone screen|panel interview|screening interview|candidate interview\b/.test(text)
  );
}

function isShadowUrgencyCandidate(candidate: ScoredLoop): boolean {
  if (isInterviewWeekExecutionCandidate(candidate)) return false;
  return (
    candidate.discrepancyClass === 'schedule_conflict' ||
    isLowValueCalendarAdminDiscrepancy(candidate) ||
    isGenericPrepStyleDocumentCandidate(candidate) ||
    isRelationshipMaintenanceOrAbstractRiskCandidate(candidate)
  );
}

function isTrueEmergencyOverrideCandidate(candidate: ScoredLoop): boolean {
  const combined = scoredLoopSearchText(candidate);
  return (
    isDecisiveSchedulingPressureCandidate(candidate) ||
    (
      (candidate.breakdown.stakes ?? 0) >= 4 &&
      (candidate.breakdown.urgency ?? 0) >= 0.92 &&
      (candidate.breakdown.tractability ?? 0) >= 0.55 &&
      /\bmust\b|\brequired\b|\bdeadline\b|\bexpires?\b|\btoday\b|\btomorrow\b|\b20\d{2}-\d{2}-\d{2}\b/.test(combined)
    )
  );
}

function isLongHorizonLeverageCandidate(candidate: ScoredLoop): boolean {
  if (isInterviewWeekExecutionCandidate(candidate)) return true;
  const goalPriority = typeof candidate.matchedGoal?.priority === 'number' ? candidate.matchedGoal.priority : 0;
  return (
    goalPriority >= 3 &&
    computeEvidenceDensity(candidate) >= 3 &&
    !isShadowUrgencyCandidate(candidate) &&
    !isTrueEmergencyOverrideCandidate(candidate) &&
    (candidate.type === 'discrepancy' || candidate.type === 'commitment' || candidate.type === 'relationship' || candidate.type === 'hunt')
  );
}

export function applyRankingInvariants(scored: ScoredLoop[]): RankingInvariantResult {
  const ranked = scored.map((candidate) => ({
    ...candidate,
    breakdown: { ...candidate.breakdown },
  }));

  const diagnostics = new Map<string, RankingInvariantDiagnostic>();
  const ensureDiagnostic = (candidate: ScoredLoop): RankingInvariantDiagnostic => {
    const existing = diagnostics.get(candidate.id);
    if (existing) return existing;
    const created: RankingInvariantDiagnostic = {
      id: candidate.id,
      originalScore: candidate.score,
      adjustedScore: candidate.score,
      passed: true,
      hardRejectReasons: [],
      penaltyReasons: [],
    };
    diagnostics.set(candidate.id, created);
    return created;
  };

  for (const candidate of ranked) {
    const diag = ensureDiagnostic(candidate);
    const hardRejectReasons = getInvariantFailureReasons(candidate);
    if (hardRejectReasons.length > 0) {
      candidate.score = 0;
      diag.hardRejectReasons.push(...hardRejectReasons);
      diag.passed = false;
      continue;
    }

    let multiplier = 1;
    if ((candidate.breakdown.freshness ?? 1) <= 0.65) {
      multiplier *= 0.8;
      diag.penaltyReasons.push('low_novelty_penalty');
    }
    if ((candidate.breakdown.entityPenalty ?? 0) < 0) {
      multiplier *= 0.8;
      diag.penaltyReasons.push('already_considered_penalty');
    }
    if (computeEvidenceDensity(candidate) === 2) {
      multiplier *= 0.9;
      diag.penaltyReasons.push('thin_evidence_penalty');
    }
    candidate.score *= multiplier;
  }

  // Collapse near-duplicate candidates across all non-zero rows.
  const survivors = ranked
    .filter((candidate) => candidate.score > 0)
    .sort(compareScoredLoops);
  for (const candidate of survivors) {
    if (candidate.score <= 0) continue;
    const candidateTokens = normalizeForDuplicate(`${candidate.title} ${candidate.content}`);
    for (const other of survivors) {
      if (other.id === candidate.id || other.score <= 0) continue;
      const otherTokens = normalizeForDuplicate(`${other.title} ${other.content}`);
      const similarity = jaccardSimilarity(candidateTokens, otherTokens);
      if (similarity >= 0.58 && candidate.score >= other.score) {
        other.score = 0;
        const diag = ensureDiagnostic(other);
        diag.passed = false;
        diag.hardRejectReasons.push(`duplicate_like_with_${candidate.id}`);
      }
    }
  }

  // Discrepancy priority invariant: when a valid discrepancy exists, generic tasks must lose.
  // EXCEPTION (hard invariant): a thread-backed sendable candidate — real external entity,
  // real thread evidence, suggestedActionType === send_message — always beats a
  // behavioral_pattern discrepancy (abstract cross-contact pattern, no single obligation).

  const qualifiedDiscrepancies = ranked.filter(
    (candidate) => candidate.type === 'discrepancy' && candidate.score > 0 && passesTop3RankingInvariants(candidate),
  );

  // Any candidate that is a thread-backed sendable real-person action
  const topThreadBackedSendable = ranked
    .filter((c) => c.score > 0 && isThreadBackedSendableLoop(c) && passesTop3RankingInvariants(c))
    .sort(compareScoredLoops)[0];

  if (qualifiedDiscrepancies.length > 0) {
    for (const candidate of ranked) {
      if (candidate.score <= 0) continue;
      const diag = ensureDiagnostic(candidate);
      if (candidate.type === 'hunt') {
        continue;
      }
      if (candidate.type === 'discrepancy') {
        // behavioral_pattern discrepancies do NOT receive the priority boost when a
        // thread-backed sendable candidate exists — they are abstract patterns, not
        // single-obligation actions tied to a real external person.
        if (candidate.discrepancyClass === 'behavioral_pattern' && topThreadBackedSendable) {
          diag.penaltyReasons.push('behavioral_pattern_no_boost_thread_backed_present');
          continue;
        }
        if (isLowValueCalendarAdminDiscrepancy(candidate)) {
          diag.penaltyReasons.push('calendar_admin_discrepancy_no_priority_boost');
          continue;
        }
        candidate.score *= 1.2;
        diag.penaltyReasons.push('discrepancy_priority_boost');
        continue;
      }
      // High-stakes relationship candidates (P1/P2 goal-matched, urgent, dense evidence)
      // receive the same softer penalty as strong commitment candidates — they represent
      // verified entities with real interaction history and board-level outcomes.
      const strongOutcomeCandidate =
        (candidate.type === 'commitment' || candidate.type === 'relationship')
        && candidate.breakdown.stakes >= 3
        && candidate.breakdown.urgency >= 0.6
        && computeEvidenceDensity(candidate) >= 3;
      // Thread-backed sendable candidates are exempt from the discrepancy penalty — they
      // represent verified external obligations (real person, real thread, sendable action)
      // and must not be crushed by abstract pattern discrepancies.
      if (isThreadBackedSendableLoop(candidate)) {
        diag.penaltyReasons.push('thread_backed_sendable_exempt_from_discrepancy_penalty');
        continue;
      }
      const penalty = strongOutcomeCandidate ? 0.88 : 0.55;
      candidate.score *= penalty;
      diag.penaltyReasons.push(strongOutcomeCandidate
        ? 'discrepancy_priority_softened_task_penalty'
        : 'discrepancy_priority_task_penalty');
    }

    const topDiscrepancy = ranked
      .filter((candidate) => candidate.type === 'discrepancy' && candidate.score > 0)
      .sort(compareScoredLoops)[0];
    const topNonDiscrepancy = ranked
      .filter((candidate) => candidate.type !== 'discrepancy' && candidate.score > 0)
      .sort(compareScoredLoops)[0];

    // Hard invariant: a thread-backed sendable candidate (real person + real thread +
    // send_message) MUST always beat a behavioral_pattern discrepancy.
    // This is a product rule, not a scoring adjustment.
    if (
      topDiscrepancy
      && topDiscrepancy.discrepancyClass === 'behavioral_pattern'
      && topThreadBackedSendable
      && passesTop3RankingInvariants(topThreadBackedSendable)
    ) {
      topThreadBackedSendable.score = Math.max(topThreadBackedSendable.score, topDiscrepancy.score + 0.001);
      ensureDiagnostic(topThreadBackedSendable).penaltyReasons.push('thread_backed_sendable_forced_over_behavioral_pattern');
      ensureDiagnostic(topDiscrepancy).penaltyReasons.push('behavioral_pattern_yielded_to_thread_backed_sendable');
    } else if (
      topDiscrepancy
      && topNonDiscrepancy
      && topDiscrepancy.score <= topNonDiscrepancy.score
      && !isLowValueCalendarAdminDiscrepancy(topDiscrepancy)
      && !(
        isThreadBackedSendableLoop(topNonDiscrepancy)
        && !isThreadBackedSendableLoop(topDiscrepancy)
        && passesTop3RankingInvariants(topNonDiscrepancy)
      )
    ) {
      topDiscrepancy.score = topNonDiscrepancy.score + 0.001;
      ensureDiagnostic(topDiscrepancy).penaltyReasons.push('discrepancy_priority_forced_over_task');
    }
  }

  // Decisive scheduling pressure beats generic prep/document output. This keeps
  // the MAS3-style "schedule the slot now" artifact selected before generation
  // instead of letting a broad prep memo win and relying on late usefulness gates.
  const topDecisiveScheduling = ranked
    .filter((c) => c.score > 0 && passesTop3RankingInvariants(c) && isDecisiveSchedulingPressureCandidate(c))
    .sort(compareScoredLoops)[0];
  if (topDecisiveScheduling) {
    const topGenericPrepDocument = ranked
      .filter((c) =>
        c.score > 0
        && c.id !== topDecisiveScheduling.id
        && passesTop3RankingInvariants(c)
        && isGenericPrepStyleDocumentCandidate(c))
      .sort(compareScoredLoops)[0];
    if (topGenericPrepDocument && topGenericPrepDocument.score >= topDecisiveScheduling.score) {
      topDecisiveScheduling.score = topGenericPrepDocument.score + 0.001;
      ensureDiagnostic(topDecisiveScheduling).penaltyReasons.push('decisive_scheduling_forced_over_generic_prep_document');
      ensureDiagnostic(topGenericPrepDocument).penaltyReasons.push('generic_prep_document_yielded_to_decisive_scheduling');
    }
  }

  // Product invariant: urgent career/interview outcome artifacts beat relationship
  // maintenance and abstract risk rows. Those rows may be easier to write, but they
  // must not displace the highest-value interview/career thread for the week.
  const topPriorityCareerOutcome = ranked
    .filter((c) => c.score > 0 && passesTop3RankingInvariants(c) && isPriorityCareerOutcomeArtifactCandidate(c))
    .sort(compareScoredLoops)[0];
  if (topPriorityCareerOutcome) {
    const topRelationshipMaintenanceOrAbstractRisk = ranked
      .filter((c) =>
        c.score > 0
        && c.id !== topPriorityCareerOutcome.id
        && passesTop3RankingInvariants(c)
        && isRelationshipMaintenanceOrAbstractRiskCandidate(c))
      .sort(compareScoredLoops)[0];
    if (
      topRelationshipMaintenanceOrAbstractRisk
      && topRelationshipMaintenanceOrAbstractRisk.score >= topPriorityCareerOutcome.score
    ) {
      topPriorityCareerOutcome.score = topRelationshipMaintenanceOrAbstractRisk.score + 0.001;
      ensureDiagnostic(topPriorityCareerOutcome).penaltyReasons.push(
        'priority_career_outcome_forced_over_relationship_maintenance',
      );
      ensureDiagnostic(topRelationshipMaintenanceOrAbstractRisk).penaltyReasons.push(
        'relationship_maintenance_yielded_to_priority_career_outcome',
      );
    }
  }

  // Long-horizon invariant: a goal-anchored 30-90 day leverage move beats shadow urgency
  // unless the shadow-urgent candidate is a true emergency override.
  const topLongHorizonLeverage = ranked
    .filter((c) => c.score > 0 && passesTop3RankingInvariants(c) && isLongHorizonLeverageCandidate(c))
    .sort(compareScoredLoops)[0];
  if (topLongHorizonLeverage) {
    const topShadowUrgency = ranked
      .filter((c) =>
        c.score > 0 &&
        c.id !== topLongHorizonLeverage.id &&
        passesTop3RankingInvariants(c) &&
        isShadowUrgencyCandidate(c) &&
        !isTrueEmergencyOverrideCandidate(c))
      .sort(compareScoredLoops)[0];
    if (topShadowUrgency && topShadowUrgency.score >= topLongHorizonLeverage.score) {
      topLongHorizonLeverage.score = topShadowUrgency.score + 0.001;
      ensureDiagnostic(topLongHorizonLeverage).penaltyReasons.push(
        'long_horizon_leverage_forced_over_shadow_urgency',
      );
      ensureDiagnostic(topShadowUrgency).penaltyReasons.push(
        'shadow_urgency_yielded_to_long_horizon_leverage',
      );
    }
  }

  // -----------------------------------------------------------------------
  // Product invariant: send_message (real human + thread) > emergent / make_decision
  //
  // If ANY valid thread-backed sendable candidate exists, it MUST outrank
  // emergent and make_decision candidates. Foldera's product is action, not
  // analysis — emergent patterns are valuable but cannot displace a concrete
  // obligation to a real human being.
  // -----------------------------------------------------------------------
  const topSendableAfterDiscrepancy = ranked
    .filter((c) => c.score > 0 && isThreadBackedSendableLoop(c) && passesTop3RankingInvariants(c))
    .sort(compareScoredLoops)[0];

  if (topSendableAfterDiscrepancy) {
    for (const candidate of ranked) {
      if (candidate.score <= 0) continue;
      if (candidate.type !== 'emergent' && candidate.suggestedActionType !== 'make_decision') continue;
      if (candidate.id === topSendableAfterDiscrepancy.id) continue;
      if (candidate.score >= topSendableAfterDiscrepancy.score) {
        // Force the thread-backed sendable above this emergent/make_decision candidate
        topSendableAfterDiscrepancy.score = candidate.score + 0.001;
        ensureDiagnostic(topSendableAfterDiscrepancy).penaltyReasons.push('sendable_forced_over_emergent_make_decision');
        ensureDiagnostic(candidate).penaltyReasons.push('emergent_make_decision_yielded_to_thread_backed_sendable');
      }
    }
  }

  // Interview-class write_document invariant: a confirmed, dated, hiring-context
  // interview prep artifact beats abstract behavioral_pattern discrepancies
  // (e.g. "9 received from micro1 team, 0 replies"). The concrete interview
  // moves the board; the behavioral pattern is a mirror, not an action.
  const topInterviewClassWriteDoc = ranked
    .filter((c) =>
      c.score > 0
      && passesTop3RankingInvariants(c)
      && isGoalPrimacyExemptInterviewWriteDocument(c))
    .sort(compareScoredLoops)[0];
  if (topInterviewClassWriteDoc) {
    const topAbstractBehavioralPattern = ranked
      .filter((c) =>
        c.score > 0
        && c.id !== topInterviewClassWriteDoc.id
        && c.type === 'discrepancy'
        && c.discrepancyClass === 'behavioral_pattern'
        && passesTop3RankingInvariants(c))
      .sort(compareScoredLoops)[0];
    if (
      topAbstractBehavioralPattern
      && topAbstractBehavioralPattern.score >= topInterviewClassWriteDoc.score
    ) {
      topInterviewClassWriteDoc.score = topAbstractBehavioralPattern.score + 0.001;
      ensureDiagnostic(topInterviewClassWriteDoc).penaltyReasons.push(
        'interview_class_write_document_forced_over_behavioral_pattern',
      );
      ensureDiagnostic(topAbstractBehavioralPattern).penaltyReasons.push(
        'behavioral_pattern_yielded_to_interview_class_write_document',
      );
    }
  }

  ranked.sort(compareScoredLoops);
  for (const candidate of ranked) {
    const diag = ensureDiagnostic(candidate);
    diag.adjustedScore = candidate.score;
    if (candidate.score <= 0 || !passesTop3RankingInvariants(candidate)) {
      diag.passed = false;
    }
  }

  return {
    ranked,
    diagnostics: [...diagnostics.values()],
  };
}

// ---------------------------------------------------------------------------
// Session 2: Revealed vs. Stated Preference — inferRevealedGoals()
// ---------------------------------------------------------------------------

/**
 * Calculate signal density per domain over 14 days, then compare against
 * explicit tkg_goals. If a domain has massive signal velocity but zero goal
 * alignment — or contradicts a stated goal — calculate Preference_Divergence.
 *
 * High divergence overrides standard open loop EV.
 */
export async function inferRevealedGoals(userId: string): Promise<RevealedGoalDivergence[]> {
  const supabase = createServerClient();
  const fourteenDaysAgo = new Date(Date.now() - daysMs(14)).toISOString();

  const [signalsRes, goalsRes] = await Promise.all([
    supabase
      .from('tkg_signals')
      .select('id, source, type, occurred_at, author, source_id')
      .eq('user_id', userId)
      .gte('occurred_at', fourteenDaysAgo)
      .eq('processed', true)
      .order('occurred_at', { ascending: false })
      .limit(500),
    supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category, source')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('current_priority', true)
      .gte('priority', 1)
      .order('priority', { ascending: false })
      .limit(20),
  ]);

  const signals = signalsRes.data ?? [];
  const goals = ((goalsRes.data ?? []) as Array<GoalRow & { source?: string }>)
    .filter((g) => isUsableGoalRow(g)) as GoalRow[];
  const goalKeywordIndex = buildGoalKeywordIndex(goals);

  if (signals.length < 10 || goals.length === 0 || goalKeywordIndex.size === 0) return [];

  // Step 1: Calculate Signal_Density per domain
  const domainSignalCounts: Record<string, { count: number; signals: string[] }> = {};
  let totalClassified = 0;

  const metadataSignals = buildSignalMetadataSummaryRows(
    signals.map((signal: any) => ({
      id: String(signal.id),
      source: String(signal.source ?? ''),
      type: (signal.type as string | null) ?? null,
      occurred_at: String(signal.occurred_at ?? ''),
      author: (signal.author as string | null) ?? null,
      source_id: (signal.source_id as string | null) ?? null,
    })),
  );

  for (const s of metadataSignals) {
    const content = s.content;
    if (content.length < 20) continue;
    if (String(s.source ?? '').trim() === 'user_feedback') continue;
    if (isSelfReferentialSignal(content)) continue;

    const revealedDomain = inferGoalCategory(content, goalKeywordIndex);
    if (!revealedDomain) continue;

    if (!domainSignalCounts[revealedDomain]) {
      domainSignalCounts[revealedDomain] = { count: 0, signals: [] };
    }
    domainSignalCounts[revealedDomain].count++;
    if (domainSignalCounts[revealedDomain].signals.length < 5) {
      domainSignalCounts[revealedDomain].signals.push(content.slice(0, 200));
    }
    totalClassified++;
  }

  if (totalClassified < 5) return [];

  // Step 2: Compare densest domains against explicit goals
  const divergences: RevealedGoalDivergence[] = [];

  // Sort domains by signal count descending
  const rankedDomains = Object.entries(domainSignalCounts)
    .sort(([, a], [, b]) => b.count - a.count);

  for (const [revealedDomain, data] of rankedDomains) {
    const densityRatio = data.count / totalClassified;
    if (densityRatio < 0.25) continue; // needs to be a dominant domain (25%+ of signals)

    // Find stated goals in this domain
    const goalsInDomain = goals.filter(g => g.goal_category === revealedDomain);

    // Find the highest-priority stated goal that is NOT in this domain
    const goalsElsewhere = goals.filter(g =>
      g.goal_category !== revealedDomain && g.priority >= 3,
    );

    for (const statedGoal of goalsElsewhere) {
      // Count signals in the stated goal's domain
      const statedDomainData = domainSignalCounts[statedGoal.goal_category];
      const statedSignalCount = statedDomainData?.count ?? 0;

      // Divergence: revealed domain has way more signal velocity than the stated goal domain
      // AND the stated goal is high priority (user says it matters)
      if (data.count >= statedSignalCount * 3 && statedGoal.priority >= 3) {
        // Calculate divergence score:
        // ratio component: how much more signal density in revealed vs stated (0-0.5)
        const ratio = statedSignalCount > 0
          ? Math.min(0.5, (data.count / statedSignalCount - 1) / 20)
          : 0.5; // no signals in stated domain at all = max divergence

        // priority component: higher stated priority = more surprising divergence (0-0.5)
        const priorityWeight = (statedGoal.priority / 5) * 0.5;

        const divergenceScore = ratio + priorityWeight;

        // Only surface if there's no explicit goal in the revealed domain
        // or the explicit goal is lower priority
        const revealedGoalPriority = goalsInDomain.length > 0
          ? Math.max(...goalsInDomain.map(g => g.priority))
          : 0;

        if (revealedGoalPriority < statedGoal.priority && divergenceScore >= 0.4) {
          divergences.push({
            statedGoal: {
              text: statedGoal.goal_text,
              priority: statedGoal.priority,
              category: statedGoal.goal_category,
            },
            revealedDomain,
            revealedSignalCount: data.count,
            statedSignalCount,
            divergenceScore,
            topSignals: data.signals,
          });
        }
      }
    }
  }

  // Sort by divergence score descending
  divergences.sort((a, b) => b.divergenceScore - a.divergenceScore);
  return divergences.slice(0, 3); // max 3 divergences
}

// ---------------------------------------------------------------------------
// Session 3: Anti-Pattern Matrix — detectAntiPatterns()
// ---------------------------------------------------------------------------

/**
 * Detect behavioral anti-patterns that indicate the user is caught in a loop.
 * Runs BEFORE standard EV scoring. If a threshold is breached, normal task
 * generation is suspended and a mirror artifact is generated instead.
 *
 * Three archetypes:
 * 1. The Spinner: signal velocity 3x baseline on a topic + 0 make_decision approvals
 * 2. The Approver: approval rate >90% but outcome_closed rate <20% after 72h
 * 3. The Browser: new open loops to closed loops ratio > 4:1 over 7 days
 */
export async function detectAntiPatterns(userId: string): Promise<AntiPattern[]> {
  const supabase = createServerClient();
  const sevenDaysAgo = new Date(Date.now() - daysMs(7)).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const antiPatterns: AntiPattern[] = [];

  try {
    const [actionsRes, signalsRes, commitmentsRes, goalsRes] = await Promise.all([
      supabase
        .from('tkg_actions')
        .select('id, directive_text, action_type, status, generated_at, executed_at, outcome_closed, feedback_weight')
        .eq('user_id', userId)
        .gte('generated_at', thirtyDaysAgo)
        .order('generated_at', { ascending: false })
        .limit(300),
      supabase
        .from('tkg_signals')
        .select('id, source, type, occurred_at, author, source_id')
        .eq('user_id', userId)
        .gte('occurred_at', thirtyDaysAgo)
        .eq('processed', true)
        .order('occurred_at', { ascending: false })
        .limit(500),
      supabase
        .from('tkg_commitments')
        .select('id, description, status, created_at, due_at, updated_at, trust_class')
        .eq('user_id', userId)
        .in('trust_class', ['trusted', 'unclassified'])
        .is('suppressed_at', null)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('tkg_goals')
        .select('goal_text, priority, goal_category, source')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('current_priority', true)
        .gte('priority', 1)
        .order('priority', { ascending: false })
        .limit(20),
    ]);

    const actions = actionsRes.data ?? [];
    const signals = signalsRes.data ?? [];
    const commitments = commitmentsRes.data ?? [];
    const goals = ((goalsRes.data ?? []) as Array<GoalRow & { source?: string }>)
      .filter((g) => isUsableGoalRow(g)) as GoalRow[];
    const goalKeywordIndex = buildGoalKeywordIndex(goals);

    // Need minimum data for meaningful detection
    if (actions.length < 5) return antiPatterns;

    // -------------------------------------------------------------------
    // 1. THE SPINNER
    //    Signal velocity on a specific topic is 3x baseline,
    //    but make_decision approvals on that topic are 0.
    //    Researching instead of deciding.
    // -------------------------------------------------------------------

    if (signals.length >= 15) {
      // Group signals by domain (keyword classification)
      const domainBuckets: Record<string, { count: number; signals: string[] }> = {};
      const metadataSignals = buildSignalMetadataSummaryRows(
        signals.map((signal: any) => ({
          id: String(signal.id),
          source: String(signal.source ?? ''),
          type: (signal.type as string | null) ?? null,
          occurred_at: String(signal.occurred_at ?? ''),
          author: (signal.author as string | null) ?? null,
          source_id: (signal.source_id as string | null) ?? null,
        })),
      );

      for (const s of metadataSignals) {
        const content = s.content;
        if (content.length < 20) continue;
        if (String(s.source ?? '').trim() === 'user_feedback') continue;
        if (isSelfReferentialSignal(content)) continue;

        const domain = inferGoalCategory(content, goalKeywordIndex) ?? 'other';
        if (domain === 'other') continue;

        if (!domainBuckets[domain]) domainBuckets[domain] = { count: 0, signals: [] };
        domainBuckets[domain].count++;
        if (domainBuckets[domain].signals.length < 5) {
          domainBuckets[domain].signals.push(content.slice(0, 150));
        }
      }

      const domainCounts = Object.values(domainBuckets).map(b => b.count);
      if (domainCounts.length >= 2) {
        const totalSignals = domainCounts.reduce((a, b) => a + b, 0);
        const baseline = totalSignals / domainCounts.length;

        for (const [domain, data] of Object.entries(domainBuckets)) {
          if (data.count < baseline * 3) continue; // must be 3x baseline

          // Check: how many make_decision actions were APPROVED in this domain?
          const decisionApprovals = actions.filter(a =>
            (a.action_type as string) === 'make_decision' &&
            ((a.status as string) === 'executed' || (a.status as string) === 'approved') &&
            inferGoalCategory(a.directive_text as string ?? '', goalKeywordIndex) === domain,
          );

          if (decisionApprovals.length === 0) {
            // Also count research actions on this topic for more evidence
            const researchActions = actions.filter(a =>
              (a.action_type as string) === 'research' &&
              inferGoalCategory(a.directive_text as string ?? '', goalKeywordIndex) === domain,
            );

            const velocityMultiple = data.count / baseline;
            const severity = Math.min(1.0, (velocityMultiple - 3) / 5 + 0.6); // 3x=0.6, 8x=1.0
            const dataConfidence = Math.min(1.0, data.count / 20);

            antiPatterns.push({
              type: 'spinner',
              title: `Spinner: ${data.count} signals on ${domain} in 30 days, 0 decisions made`,
              insight: `You have ${data.count} signals about ${domain} — ${velocityMultiple.toFixed(1)}x the baseline of ${baseline.toFixed(0)} per topic. ${researchActions.length > 0 ? `You've generated ${researchActions.length} research actions on this topic. ` : ''}But you have approved zero decisions about ${domain} in 30 days. You are researching instead of deciding. The next signal will not help. The decision will.`,
              dataPoints: [
                `Signal velocity: ${data.count} signals (${velocityMultiple.toFixed(1)}x baseline of ${baseline.toFixed(0)})`,
                `Decisions approved in ${domain}: 0`,
                `Research actions on ${domain}: ${researchActions.length}`,
                `Days of data: 30`,
                ...data.signals.slice(0, 3).map((s, i) => `Recent signal ${i + 1}: "${s.slice(0, 100)}"`),
              ],
              severity,
              dataConfidence,
              score: severity * dataConfidence,
              focusDomain: domain,
              suggestedActionType: 'make_decision',
              mirrorQuestion: `You are in Spinner mode on ${domain}. You've researched ${data.count} data points in 30 days. Pick one.`,
            });
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // 2. THE APPROVER
    //    Approval rate >90% but outcome_closed rate <20% after 72 hours.
    //    Saying yes to feel productive, but not executing.
    // -------------------------------------------------------------------

    const recentActions = actions.filter(a =>
      (a.generated_at as string) >= sevenDaysAgo,
    );

    if (recentActions.length >= 5) {
      const approvedOrExecuted = recentActions.filter(a =>
        (a.status as string) === 'executed' || (a.status as string) === 'approved',
      );
      const skippedOrRejected = recentActions.filter(a =>
        (a.status as string) === 'skipped' || (a.status as string) === 'draft_rejected' || (a.status as string) === 'rejected',
      );
      const totalDecided = approvedOrExecuted.length + skippedOrRejected.length;
      const approvalRate = totalDecided > 0 ? approvedOrExecuted.length / totalDecided : 0;

      if (approvalRate > 0.90 && approvedOrExecuted.length >= 5) {
        // Check outcome_closed rate for actions older than 72 hours
        const oldEnoughActions = approvedOrExecuted.filter(a => {
          const executedAt = a.executed_at as string | null;
          const generatedAt = a.generated_at as string;
          const actionDate = executedAt || generatedAt;
          return actionDate < seventyTwoHoursAgo;
        });

        if (oldEnoughActions.length >= 3) {
          const closedOutcomes = oldEnoughActions.filter(a =>
            (a.outcome_closed as boolean) === true,
          );
          const outcomeRate = closedOutcomes.length / oldEnoughActions.length;

          if (outcomeRate < 0.20) {
            // Find the most common action type being approved without execution
            const typeFreq: Record<string, number> = {};
            for (const a of oldEnoughActions) {
              const t = a.action_type as string ?? 'unknown';
              typeFreq[t] = (typeFreq[t] ?? 0) + 1;
            }
            const topType = Object.entries(typeFreq).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'unknown';

            const severity = Math.min(1.0, (approvalRate - 0.90) * 10 + (1 - outcomeRate) * 0.5);
            const dataConfidence = Math.min(1.0, oldEnoughActions.length / 10);

            antiPatterns.push({
              type: 'approver',
              title: `Approver: ${Math.round(approvalRate * 100)}% approval rate, ${Math.round(outcomeRate * 100)}% follow-through`,
              insight: `In the last 7 days, you approved ${approvedOrExecuted.length} of ${totalDecided} directives (${Math.round(approvalRate * 100)}% approval rate). But of the ${oldEnoughActions.length} actions old enough to have outcomes, only ${closedOutcomes.length} (${Math.round(outcomeRate * 100)}%) have confirmed results. Most approved: ${topType} actions. You are saying yes to feel productive, but the work isn't landing. Approval is not execution.`,
              dataPoints: [
                `Approval rate (7 days): ${Math.round(approvalRate * 100)}% (${approvedOrExecuted.length}/${totalDecided})`,
                `Outcome confirmed rate (72h+): ${Math.round(outcomeRate * 100)}% (${closedOutcomes.length}/${oldEnoughActions.length})`,
                `Most approved type: ${topType} (${typeFreq[topType]} times)`,
                `Gap: ${oldEnoughActions.length - closedOutcomes.length} approvals with no confirmed outcome`,
                ...oldEnoughActions.filter(a => !(a.outcome_closed as boolean)).slice(0, 3).map(a =>
                  `Unconfirmed: "${(a.directive_text as string ?? '').slice(0, 80)}" (${a.action_type})`,
                ),
              ],
              severity,
              dataConfidence,
              score: severity * dataConfidence,
              focusDomain: topType,
              suggestedActionType: 'make_decision',
              mirrorQuestion: `You approved ${approvedOrExecuted.length} actions this week. ${oldEnoughActions.length - closedOutcomes.length} have no confirmed result. Are you approving to feel busy, or are you doing the work?`,
            });
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // 3. THE BROWSER
    //    Ratio of new open loops to closed loops exceeds 4:1 over 7 days.
    //    Seeking novelty instead of finishing.
    // -------------------------------------------------------------------

    if (commitments.length >= 5) {
      const recentCommitments = commitments.filter(c =>
        (c.created_at as string) >= sevenDaysAgo,
      );
      const newLoops = recentCommitments.filter(c =>
        (c.status as string) === 'active' || (c.status as string) === 'at_risk',
      ).length;

      // Closed loops: commitments that moved to done/fulfilled/cancelled in last 7 days
      const closedLoops = commitments.filter(c => {
        const status = c.status as string;
        const updatedAt = c.updated_at as string | null;
        return (status === 'done' || status === 'fulfilled' || status === 'cancelled') &&
          updatedAt && updatedAt >= sevenDaysAgo;
      }).length;

      // Also count action completions as closed loops
      const completedActions = recentActions.filter(a =>
        (a.status as string) === 'executed' && (a.outcome_closed as boolean) === true,
      ).length;

      const totalClosed = closedLoops + completedActions;
      const ratio = totalClosed > 0 ? newLoops / totalClosed : (newLoops > 0 ? newLoops : 0); // avoid division by zero

      if (ratio > 4 && newLoops >= 5) {
        // Get the specific new commitments for evidence
        const newCommitmentTexts = recentCommitments
          .filter(c => (c.status as string) === 'active' || (c.status as string) === 'at_risk')
          .slice(0, 5)
          .map(c => (c.description as string).slice(0, 100));

        // Count domains of new commitments to find where novelty-seeking is concentrated
        const noveltyDomains: Record<string, number> = {};
        for (const c of recentCommitments) {
          const domain = inferGoalCategory(c.description as string ?? '', goalKeywordIndex) ?? 'other';
          noveltyDomains[domain] = (noveltyDomains[domain] ?? 0) + 1;
        }
        const topNoveltyDomain = Object.entries(noveltyDomains).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'general';

        const severity = Math.min(1.0, (ratio - 4) / 8 + 0.6); // 4:1=0.6, 12:1=1.0
        const dataConfidence = Math.min(1.0, newLoops / 10);

        antiPatterns.push({
          type: 'browser',
          title: `Browser: ${newLoops} new loops opened, ${totalClosed} closed (${ratio.toFixed(1)}:1 ratio)`,
          insight: `In 7 days you opened ${newLoops} new commitments but only closed ${totalClosed}. That's a ${ratio.toFixed(1)}:1 ratio of starting to finishing. ${topNoveltyDomain !== 'other' ? `Most new loops are in ${topNoveltyDomain}. ` : ''}You are collecting options instead of executing on the ones you have. Every new loop you open dilutes the ones already there. Close something before opening anything new.`,
          dataPoints: [
            `New open loops (7 days): ${newLoops}`,
            `Closed loops (7 days): ${totalClosed} (${closedLoops} commitments + ${completedActions} confirmed actions)`,
            `Ratio: ${ratio.toFixed(1)}:1 (threshold: 4:1)`,
            `Top novelty domain: ${topNoveltyDomain}`,
            ...newCommitmentTexts.map((t, i) => `New loop ${i + 1}: "${t}"`),
          ],
          severity,
          dataConfidence,
          score: severity * dataConfidence,
          focusDomain: topNoveltyDomain,
          suggestedActionType: 'make_decision',
          mirrorQuestion: `You opened ${newLoops} new loops this week and closed ${totalClosed}. Are you making progress, or are you browsing?`,
        });
      }
    }
  } catch (err) {
    logStructuredEvent({
      event: 'scorer_error',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'detect_anti_patterns_failed',
      details: {
        scope: 'scorer',
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }

  antiPatterns.sort((a, b) => b.score - a.score);
  return antiPatterns;
}

// ---------------------------------------------------------------------------
// Emergent Pattern Detection (v2: new)
// ---------------------------------------------------------------------------

export async function detectEmergentPatterns(userId: string): Promise<EmergentPattern[]> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const patterns: EmergentPattern[] = [];

  try {
    // Parallel data fetch for all analyses
    const [actionsRes, commitmentsRes, signalsRes] = await Promise.all([
      // All actions from last 30 days
      supabase
        .from('tkg_actions')
        .select('id, directive_text, action_type, status, generated_at, executed_at, execution_result, skip_reason, outcome_closed')
        .eq('user_id', userId)
        .gte('generated_at', thirtyDaysAgo)
        .order('generated_at', { ascending: false })
        .limit(200),
      // All commitments (active + done for follow-through comparison)
      supabase
        .from('tkg_commitments')
        .select('id, description, status, created_at, due_at, trust_class')
        .eq('user_id', userId)
        .in('trust_class', ['trusted', 'unclassified'])
        .is('suppressed_at', null)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(200),
      // All signals for velocity analysis (30 days)
      supabase
        .from('tkg_signals')
        .select('id, occurred_at, source, type')
        .eq('user_id', userId)
        .gte('occurred_at', thirtyDaysAgo)
        .order('occurred_at', { ascending: false })
        .limit(500),
    ]);

    const actions = actionsRes.data ?? [];
    const commitments = commitmentsRes.data ?? [];
    const signals = signalsRes.data ?? [];

    if (actions.length < 3 && commitments.length < 3 && signals.length < 5) return patterns;

    // -----------------------------------------------------------------------
    // 1. APPROVAL WITHOUT EXECUTION
    //    status = approved/executed AND outcome_closed = false after 48 hours
    //    Surface specific counts, names, and dates.
    // -----------------------------------------------------------------------
    const approvedStale: Array<{ text: string; type: string; date: string; id: string }> = [];
    for (const a of actions) {
      const status = a.status as string;
      if (status !== 'executed') continue;
      // Approved but outcome never closed, and it's been >48 hours
      const executedAt = a.executed_at as string | null;
      const generatedAt = a.generated_at as string;
      const actionDate = executedAt || generatedAt;
      if (actionDate > fortyEightHoursAgo) continue; // too recent
      const outcomeClosed = a.outcome_closed as boolean | null;
      if (outcomeClosed === true) continue; // properly closed
      approvedStale.push({
        text: (a.directive_text as string ?? '').slice(0, 120),
        type: a.action_type as string,
        date: actionDate.slice(0, 10),
        id: a.id as string,
      });
    }

    if (approvedStale.length >= 1) {
      // Extract names from directive text
      const nameMatches = approvedStale.flatMap(a => {
        const words = a.text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) ?? [];
        return words.filter(w => !['Follow', 'Send', 'Draft', 'Reply', 'Email', 'Schedule', 'Research', 'Review', 'Write', 'Check'].includes(w.split(' ')[0]));
      });
      const uniqueNames = [...new Set(nameMatches)].slice(0, 5);
      const nameStr = uniqueNames.length > 0 ? ` involving ${uniqueNames.join(', ')}` : '';

      const dataConfidence = Math.min(1.0, approvedStale.length / 5); // 5+ items = full confidence
      const surpriseValue = 0.8; // approving but not following through is surprising
      patterns.push({
        type: 'approval_without_execution',
        title: `${approvedStale.length} approved action${approvedStale.length > 1 ? 's' : ''} with no confirmed outcome`,
        insight: `You approved ${approvedStale.length} directive${approvedStale.length > 1 ? 's' : ''}${nameStr} but none have a confirmed outcome after 48+ hours. Either these executed and the system didn't detect it, or you approved with the intention to act but didn't. This is the gap between deciding and doing.`,
        dataPoints: approvedStale.slice(0, 6).map(a => `[${a.date}] (${a.type}) ${a.text}`),
        surpriseValue,
        dataConfidence,
        score: surpriseValue * dataConfidence,
        suggestedActionType: 'make_decision',
        mirrorQuestion: 'Is this true?',
      });
    }

    // -----------------------------------------------------------------------
    // 2. SKIP CLUSTERING
    //    Group skipped actions by day_of_week × action_type.
    //    Find behavioral signatures: "You skip all schedule directives on Mondays"
    // -----------------------------------------------------------------------
    const skipGrid: Record<string, { day: number; type: string; count: number; dates: string[]; reasons: string[] }> = {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const a of actions) {
      if (a.status !== 'skipped' && a.status !== 'draft_rejected') continue;
      const day = new Date(a.generated_at as string).getDay();
      const aType = a.action_type as string ?? 'unknown';
      const key = `${day}:${aType}`;
      if (!skipGrid[key]) skipGrid[key] = { day, type: aType, count: 0, dates: [], reasons: [] };
      skipGrid[key].count++;
      skipGrid[key].dates.push((a.generated_at as string).slice(0, 10));
      if (a.skip_reason) skipGrid[key].reasons.push(a.skip_reason as string);
    }

    // Also compute total skips and approvals per action_type for baseline
    const typeBaseline: Record<string, { skipped: number; total: number }> = {};
    for (const a of actions) {
      const aType = a.action_type as string ?? 'unknown';
      if (!typeBaseline[aType]) typeBaseline[aType] = { skipped: 0, total: 0 };
      typeBaseline[aType].total++;
      if (a.status === 'skipped' || a.status === 'draft_rejected') typeBaseline[aType].skipped++;
    }

    for (const [, cluster] of Object.entries(skipGrid)) {
      if (cluster.count < 3) continue; // need 3+ to be a real pattern
      const baseline = typeBaseline[cluster.type];
      if (!baseline || baseline.total < 5) continue;

      // Is the skip rate on this day significantly higher than baseline?
      const daySkipRate = cluster.count / Math.max(1, actions.filter(a => new Date(a.generated_at as string).getDay() === cluster.day).length);
      const baselineSkipRate = baseline.skipped / baseline.total;
      if (daySkipRate <= baselineSkipRate * 1.3) continue; // not significantly different

      const reasonSummary = cluster.reasons.length > 0
        ? ` Reasons given: ${[...new Set(cluster.reasons)].slice(0, 3).join(', ')}.`
        : '';

      const surpriseValue = Math.min(1.0, (daySkipRate - baselineSkipRate) * 2); // how far above baseline
      const dataConfidence = Math.min(1.0, cluster.count / 5);
      patterns.push({
        type: 'skip_cluster',
        title: `You skip ${cluster.type} directives on ${dayNames[cluster.day]}s`,
        insight: `${cluster.count} ${cluster.type} directives skipped on ${dayNames[cluster.day]}s (${Math.round(daySkipRate * 100)}% skip rate vs ${Math.round(baselineSkipRate * 100)}% overall).${reasonSummary} ${dayNames[cluster.day]}s might not be the right day for ${cluster.type} actions.`,
        dataPoints: cluster.dates.slice(0, 5).map(d => `[${d}] ${cluster.type} skipped on ${dayNames[cluster.day]}`),
        surpriseValue,
        dataConfidence,
        score: surpriseValue * dataConfidence,
        suggestedActionType: 'do_nothing',
        mirrorQuestion: 'Is this true?',
      });
    }

    // -----------------------------------------------------------------------
    // 3. COMMITMENT DECAY
    //    Compare tkg_commitments created vs tkg_actions executed.
    //    Calculate real follow-through rate.
    // -----------------------------------------------------------------------
    if (commitments.length >= 3) {
      const totalCommitments = commitments.length;
      const doneCommitments = commitments.filter(c => (c.status as string) === 'done').length;
      const activeCommitments = commitments.filter(c => (c.status as string) === 'active' || (c.status as string) === 'at_risk').length;
      const overdueCommitments = commitments.filter(c => {
        const due = c.due_at as string | null;
        return due && new Date(due) < new Date() && (c.status as string) !== 'done';
      });

      // Count actions that actually executed
      const executedActions = actions.filter(a => (a.status as string) === 'executed').length;

      const followThroughRate = totalCommitments > 0 ? doneCommitments / totalCommitments : 0;
      const executionRatio = totalCommitments > 0 ? executedActions / totalCommitments : 0;

      // Only surface if follow-through is concerning
      if (followThroughRate < 0.5 && totalCommitments >= 5) {
        const overdueNames = overdueCommitments.slice(0, 3).map(c => {
          const desc = (c.description as string).slice(0, 80);
          const due = (c.due_at as string).slice(0, 10);
          return `"${desc}" (due ${due})`;
        });

        const surpriseValue = Math.min(1.0, (1 - followThroughRate) * 0.8); // worse rate = more surprising
        const dataConfidence = Math.min(1.0, totalCommitments / 10);
        patterns.push({
          type: 'commitment_decay',
          title: `${Math.round(followThroughRate * 100)}% follow-through on commitments (${doneCommitments}/${totalCommitments})`,
          insight: `In the last 30 days: ${totalCommitments} commitments created, ${doneCommitments} completed, ${activeCommitments} still open, ${overdueCommitments.length} overdue. The system generated ${executedActions} executed actions against those commitments. ${overdueCommitments.length > 0 ? `Overdue: ${overdueNames.join('; ')}.` : ''} Either the commitments are too ambitious, or something is blocking execution.`,
          dataPoints: [
            `Commitments created: ${totalCommitments}`,
            `Completed: ${doneCommitments} (${Math.round(followThroughRate * 100)}%)`,
            `Still active: ${activeCommitments}`,
            `Overdue: ${overdueCommitments.length}`,
            `Actions executed: ${executedActions}`,
            `Execution-to-commitment ratio: ${executionRatio.toFixed(1)}:1`,
          ],
          surpriseValue,
          dataConfidence,
          score: surpriseValue * dataConfidence,
          suggestedActionType: 'make_decision',
          mirrorQuestion: 'Is this true?',
        });
      }
    }

    // -----------------------------------------------------------------------
    // 4. SIGNAL VELOCITY
    //    Signals-per-hour over rolling windows.
    //    Spikes above 2 std dev from baseline → "stop and look."
    // -----------------------------------------------------------------------
    if (signals.length >= 10) {
      // Bucket signals into 6-hour windows over the last 30 days
      const windowMs = 6 * 60 * 60 * 1000; // 6 hours
      const buckets: Record<number, { count: number; sources: Set<string> }> = {};

      for (const s of signals) {
        const t = new Date(s.occurred_at as string).getTime();
        const bucket = Math.floor(t / windowMs);
        if (!buckets[bucket]) buckets[bucket] = { count: 0, sources: new Set() };
        buckets[bucket].count++;
        buckets[bucket].sources.add(s.source as string ?? 'unknown');
      }

      const counts = Object.values(buckets).map(b => b.count);
      if (counts.length >= 4) {
        const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
        const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;
        const stdDev = Math.sqrt(variance);
        const spikeThreshold = mean + 2 * stdDev;

        // Find spike windows
        const spikes: Array<{ bucket: number; count: number; sources: string[] }> = [];
        for (const [bucketStr, data] of Object.entries(buckets)) {
          if (data.count > spikeThreshold && spikeThreshold > mean) {
            spikes.push({
              bucket: parseInt(bucketStr),
              count: data.count,
              sources: [...data.sources],
            });
          }
        }

        // Only report the most recent spike
        if (spikes.length > 0) {
          spikes.sort((a, b) => b.bucket - a.bucket);
          const latest = spikes[0];
          const spikeDate = new Date(latest.bucket * windowMs);
          const spikeDateStr = spikeDate.toISOString().slice(0, 16).replace('T', ' ');

          const surpriseValue = Math.min(1.0, (latest.count - mean) / (stdDev * 3)); // how many std devs above
          const dataConfidence = Math.min(1.0, counts.length / 20); // more windows = more confident
          patterns.push({
            type: 'signal_velocity',
            title: `Signal spike: ${latest.count} signals in 6 hours (baseline: ${mean.toFixed(1)})`,
            insight: `Around ${spikeDateStr}, ${latest.count} signals arrived in a single 6-hour window — ${(latest.count / mean).toFixed(1)}x the baseline of ${mean.toFixed(1)} per window (2+ standard deviations above normal). Sources: ${latest.sources.join(', ')}. ${spikes.length > 1 ? `${spikes.length} total spike windows detected in 30 days.` : 'This is the only spike in 30 days.'} Something happened that generated unusual activity.`,
            dataPoints: [
              `Spike: ${latest.count} signals at ${spikeDateStr}`,
              `Baseline: ${mean.toFixed(1)} signals per 6-hour window`,
              `Std dev: ${stdDev.toFixed(1)}`,
              `Threshold (2σ): ${spikeThreshold.toFixed(1)}`,
              `Sources: ${latest.sources.join(', ')}`,
              `Total spikes in 30 days: ${spikes.length}`,
            ],
            surpriseValue,
            dataConfidence,
            score: surpriseValue * dataConfidence,
            // AZ-24 slice 3: spike = unusual volume → frame a decision, not open-ended research (research rows skew draft).
            suggestedActionType: 'make_decision',
            mirrorQuestion: 'Is this true?',
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // 5. REPETITION SUPPRESSION
    //    Same loop generated 3+ times AND skipped each time.
    //    Suppress it and surface the meta-pattern.
    // -----------------------------------------------------------------------
    const topicClusters: Record<string, Array<{ text: string; status: string; date: string; reason: string | null }>> = {};
    for (const a of actions) {
      const text = (a.directive_text as string ?? '').toLowerCase();
      // Skip self-referential meta-observations to prevent emergent pattern runaway
      if (/\b(approved|approval|pattern|skip rate|skipped every time|acknowledged?)\b/.test(text) &&
          /\b(directive|observation|meta|system)\b/.test(text)) continue;
      const keywords = text.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length >= 5);
      const keyPair = keywords.slice(0, 3).sort().join('+');
      if (!keyPair) continue;
      if (!topicClusters[keyPair]) topicClusters[keyPair] = [];
      topicClusters[keyPair].push({
        text: a.directive_text as string ?? '',
        status: a.status as string ?? '',
        date: (a.generated_at as string ?? '').slice(0, 10),
        reason: a.skip_reason as string | null,
      });
    }

    for (const [, items] of Object.entries(topicClusters)) {
      const skipped = items.filter(i => i.status === 'skipped' || i.status === 'draft_rejected');
      if (skipped.length < 3) continue;
      const approved = items.filter(i => i.status === 'executed');
      // If it's been approved at least once recently, skip this pattern
      if (approved.length > 0) continue;

      const reasons = [...new Set(skipped.map(s => s.reason).filter(Boolean))];
      const reasonStr = reasons.length > 0
        ? ` Your skip reasons: "${reasons.slice(0, 3).join('", "')}".`
        : ' No skip reason was given any of those times.';

      const surpriseValue = 0.9; // repeated failure to engage is very surprising
      const dataConfidence = Math.min(1.0, skipped.length / 4);
      patterns.push({
        type: 'repetition_suppression',
        title: `Suggested ${skipped.length} times, skipped every time`,
        insight: `"${skipped[0].text.slice(0, 80)}" has been generated ${skipped.length} times between ${skipped[skipped.length - 1].date} and ${skipped[0].date}. You skipped it every time.${reasonStr} The system will suppress this topic. But first: is this something you actually want to do but something is blocking it? Or is this genuinely not relevant?`,
        dataPoints: skipped.slice(0, 5).map(s => `[${s.date}] Skipped${s.reason ? ` (${s.reason})` : ''}: "${s.text.slice(0, 80)}"`),
        surpriseValue,
        dataConfidence,
        score: surpriseValue * dataConfidence,
        suggestedActionType: 'make_decision',
        mirrorQuestion: 'Is this true?',
      });
    }
  } catch (err) {
    logStructuredEvent({
      event: 'scorer_error',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'detect_emergent_patterns_failed',
      details: {
        scope: 'scorer',
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }

  // Sort by score descending
  patterns.sort((a, b) => b.score - a.score);
  return patterns;
}

// ---------------------------------------------------------------------------
// Cross-Loop Inference — Session 3
// ---------------------------------------------------------------------------

/** Extract person names from text (capitalized words, filter common non-names) */
function extractPersonNames(text: string): string[] {
  const nonNames = new Set([
    'Follow', 'Send', 'Draft', 'Reply', 'Email', 'Schedule', 'Research',
    'Review', 'Write', 'Check', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
    'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August', 'September', 'October', 'November',
    'December', 'Calendar', 'The', 'This', 'That', 'Your', 'Our', 'Their',
    'Option', 'Decision', 'Document', 'Meeting', 'Project', 'None',
    // Sentence-leading tokens often mis-read as person names (validity filter + cross-loop)
    'Reference', 'Complete', 'Available', 'Skipped', 'From', 'Start', 'Last', 'Health',
    'Clinical', 'Respond', 'Share', 'Thank', 'Awaiting', 'Submitted', 'Applied',
    'Maintain', 'Seek', 'Working', 'Pursue', 'Fix', 'Submit', 'Apply', 'Confirm',
    'Prepare', 'Register', 'File', 'Discuss', 'User',
  ]);
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) ?? [];
  return [...new Set(
    matches.filter(w => !nonNames.has(w.split(' ')[0]) && w.length > 2),
  )];
}

/** Extract deadline dates from text, return as timestamps */
function extractDeadlines(text: string): number[] {
  const dates: number[] = [];
  // ISO dates
  const isoMatches = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  for (const m of isoMatches) {
    const t = new Date(m).getTime();
    if (!isNaN(t)) dates.push(t);
  }
  // Relative: "today", "tomorrow", "this week"
  const lower = text.toLowerCase();
  if (/\btoday\b/.test(lower)) dates.push(Date.now());
  if (/\btomorrow\b/.test(lower)) dates.push(Date.now() + daysMs(1));
  if (/\bthis week\b/.test(lower)) dates.push(Date.now() + daysMs(5));
  return dates;
}

/**
 * Detect connections between the top scored loops.
 *
 * Three connection types:
 * 1. Same person appears in two loops (relationship + commitment involving them)
 * 2. Temporal dependency (one loop blocks another — deadline ordering)
 * 3. Resource conflict (two loops compete for the same time window)
 */
function detectCrossLoopConnections(topLoops: ScoredLoop[]): CrossLoopConnection[] {
  if (topLoops.length < 2) return [];

  const connections: CrossLoopConnection[] = [];

  for (let i = 0; i < topLoops.length; i++) {
    for (let j = i + 1; j < topLoops.length; j++) {
      const a = topLoops[i];
      const b = topLoops[j];

      // 1. SAME PERSON — a person name appears in both loops
      const namesA = extractPersonNames(`${a.title} ${a.content}`);
      const namesB = extractPersonNames(`${b.title} ${b.content}`);
      const sharedNames = namesA.filter(n => {
        const firstName = n.split(' ')[0].toLowerCase();
        return namesB.some(nb => nb.toLowerCase().includes(firstName) || firstName.length > 2 && nb.toLowerCase().startsWith(firstName));
      });

      if (sharedNames.length > 0) {
        connections.push({
          loopA: a,
          loopB: b,
          connectionType: 'same_person',
          reason: `${sharedNames[0]} appears in both: "${a.title.slice(0, 60)}" and "${b.title.slice(0, 60)}"`,
          sharedPerson: sharedNames[0],
        });
        continue; // one connection per pair
      }

      // 2. TEMPORAL DEPENDENCY — one loop has a deadline that precedes the other
      const deadlinesA = extractDeadlines(`${a.title} ${a.content}`);
      const deadlinesB = extractDeadlines(`${b.title} ${b.content}`);

      if (deadlinesA.length > 0 && deadlinesB.length > 0) {
        const earliestA = Math.min(...deadlinesA);
        const earliestB = Math.min(...deadlinesB);
        const daysBetween = Math.abs(earliestA - earliestB) / daysMs(1);

        // Within 3 days of each other — potential dependency
        if (daysBetween <= 3 && daysBetween > 0) {
          const first = earliestA < earliestB ? a : b;
          const second = earliestA < earliestB ? b : a;
          connections.push({
            loopA: first,
            loopB: second,
            connectionType: 'temporal_dependency',
            reason: `"${first.title.slice(0, 60)}" has an earlier deadline and may block "${second.title.slice(0, 60)}"`,
          });
          continue;
        }
      }

      // 3. RESOURCE CONFLICT — two loops both need time (schedule, send_message, write_document)
      //    in the same domain or involve the same relationship
      const timeIntensiveTypes: ActionType[] = ['schedule', 'write_document', 'send_message'];
      if (
        timeIntensiveTypes.includes(a.suggestedActionType) &&
        timeIntensiveTypes.includes(b.suggestedActionType) &&
        a.matchedGoal && b.matchedGoal &&
        a.matchedGoal.category === b.matchedGoal.category
      ) {
        connections.push({
          loopA: a,
          loopB: b,
          connectionType: 'resource_conflict',
          reason: `Both "${a.title.slice(0, 50)}" and "${b.title.slice(0, 50)}" compete for time in ${a.matchedGoal.category}`,
        });
      }
    }
  }

  // Sort by combined score of the two loops (best connections first)
  connections.sort((a, b) => {
    const scoreA = a.loopA.score + a.loopB.score;
    const scoreB = b.loopA.score + b.loopB.score;
    return scoreB - scoreA;
  });

  return connections;
}

/**
 * Merge two connected loops into a single compound ScoredLoop.
 * The compound loop gets the higher score of the two (+ 10% boost)
 * and combines both contexts for the LLM.
 */
function mergeLoops(conn: CrossLoopConnection): ScoredLoop {
  const { loopA, loopB, connectionType, reason, sharedPerson } = conn;

  // Build compound title based on connection type
  let title: string;
  switch (connectionType) {
    case 'same_person':
      title = `${sharedPerson}: ${loopA.title.slice(0, 50)} + ${loopB.title.slice(0, 50)}`;
      break;
    case 'temporal_dependency':
      title = `${loopA.title.slice(0, 50)} → then ${loopB.title.slice(0, 50)}`;
      break;
    case 'resource_conflict':
      title = `Prioritize: ${loopA.title.slice(0, 45)} vs ${loopB.title.slice(0, 45)}`;
      break;
  }

  // Build compound content with both loops' context
  const content = [
    `CONNECTION: ${reason}`,
    '',
    `--- Loop 1 (score ${loopA.score.toFixed(2)}) ---`,
    `Type: ${loopA.type} | Action: ${loopA.suggestedActionType}`,
    loopA.content,
    loopA.relationshipContext ? `\nRelationship context:\n${loopA.relationshipContext}` : '',
    '',
    `--- Loop 2 (score ${loopB.score.toFixed(2)}) ---`,
    `Type: ${loopB.type} | Action: ${loopB.suggestedActionType}`,
    loopB.content,
    loopB.relationshipContext ? `\nRelationship context:\n${loopB.relationshipContext}` : '',
  ].filter(Boolean).join('\n');

  // Use the higher-scoring loop's action type, unless it's a temporal dependency (use first loop's type)
  const suggestedActionType = connectionType === 'temporal_dependency'
    ? loopA.suggestedActionType
    : (loopA.score >= loopB.score ? loopA.suggestedActionType : loopB.suggestedActionType);

  // Use the higher-priority goal match
  const matchedGoal = (loopA.matchedGoal && loopB.matchedGoal)
    ? (loopA.matchedGoal.priority <= loopB.matchedGoal.priority ? loopA.matchedGoal : loopB.matchedGoal)
    : loopA.matchedGoal ?? loopB.matchedGoal;

  // Combined score: max of the two + 10% boost for the cross-loop insight
  const baseScore = Math.max(loopA.score, loopB.score);
  const compoundScore = baseScore * 1.1;

  return {
    id: `compound-${loopA.id}-${loopB.id}`,
    type: 'compound',
    title,
    content,
    suggestedActionType,
    matchedGoal,
    score: compoundScore,
    breakdown: {
      stakes: Math.max(loopA.breakdown.stakes, loopB.breakdown.stakes),
      urgency: Math.max(loopA.breakdown.urgency, loopB.breakdown.urgency),
      tractability: Math.min(loopA.breakdown.tractability, loopB.breakdown.tractability),
      freshness: Math.min(loopA.breakdown.freshness, loopB.breakdown.freshness),
      actionTypeRate: Math.min(loopA.breakdown.actionTypeRate, loopB.breakdown.actionTypeRate),
      entityPenalty: Math.min(loopA.breakdown.entityPenalty, loopB.breakdown.entityPenalty),
    },
    relatedSignals: [...new Set([...loopA.relatedSignals, ...loopB.relatedSignals])].slice(0, 8),
    sourceSignals: [...loopA.sourceSignals, ...loopB.sourceSignals].slice(0, 8),
    relationshipContext: [loopA.relationshipContext, loopB.relationshipContext].filter(Boolean).join('\n---\n') || undefined,
    compoundLoops: [loopA, loopB],
    connectionType,
    connectionReason: reason,
    // Use the more conservative (lower) prior of the two constituent loops
    confidence_prior: Math.min(loopA.confidence_prior, loopB.confidence_prior),
  };
}

// ---------------------------------------------------------------------------
// Main export — scoreOpenLoops
// ---------------------------------------------------------------------------

function compareScoredLoops(a: ScoredLoop, b: ScoredLoop): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.breakdown.stakes !== a.breakdown.stakes) return b.breakdown.stakes - a.breakdown.stakes;
  if (b.breakdown.urgency !== a.breakdown.urgency) return b.breakdown.urgency - a.breakdown.urgency;
  if (b.breakdown.freshness !== a.breakdown.freshness) return b.breakdown.freshness - a.breakdown.freshness;
  if (b.breakdown.tractability !== a.breakdown.tractability) return b.breakdown.tractability - a.breakdown.tractability;
  return a.id.localeCompare(b.id);
}

function getCandidateSourceAuthority(candidate: ScoredLoop): 'high' | 'low' | 'lowest' {
  if (isInterviewWeekExecutionCandidate(candidate)) return 'high';
  const tiers = (candidate.sourceSignals ?? []).map((signal) =>
    getSignalSourceAuthorityTier(signal.source ?? null, null),
  );
  if (tiers.includes('high')) return 'high';
  if (tiers.includes('lowest')) return 'lowest';
  return 'low';
}

function getInterviewClusterInputSummaries(candidate: ScoredLoop): string[] {
  if (!isInterviewWeekExecutionCandidate(candidate)) return [];
  return (candidate.sourceSignals ?? [])
    .map((signal) => String(signal.summary ?? '').trim())
    .filter((summary) => summary.length > 0)
    .slice(0, 6);
}

function buildSelectionReason(
  winner: ScoredLoop,
  runnerUp?: ScoredLoop,
): {
  margin: number | null;
  reason: string;
} {
  if (!runnerUp) {
    return {
      margin: null,
      reason: 'Selected as the only viable candidate after scoring.',
    };
  }

  const rawMargin = winner.score - runnerUp.score;
  const margin = Number(rawMargin.toFixed(2));
  if (rawMargin > 0.01) {
    return {
      margin,
      reason: `Selected because score ${winner.score.toFixed(2)} beat the next-best candidate at ${runnerUp.score.toFixed(2)} by ${margin.toFixed(2)}.`,
    };
  }

  const tieBreakers: Array<{
    label: string;
    winnerValue: number;
    runnerUpValue: number;
  }> = [
    { label: 'stakes', winnerValue: winner.breakdown.stakes, runnerUpValue: runnerUp.breakdown.stakes },
    { label: 'urgency', winnerValue: winner.breakdown.urgency, runnerUpValue: runnerUp.breakdown.urgency },
    { label: 'freshness', winnerValue: winner.breakdown.freshness, runnerUpValue: runnerUp.breakdown.freshness },
    { label: 'tractability', winnerValue: winner.breakdown.tractability, runnerUpValue: runnerUp.breakdown.tractability },
  ];

  const tieBreaker = tieBreakers.find((candidate) => candidate.winnerValue !== candidate.runnerUpValue);
  if (tieBreaker) {
    return {
      margin,
      reason: `Selected on ${tieBreaker.label} tie-break (${tieBreaker.winnerValue.toFixed(2)} vs ${tieBreaker.runnerUpValue.toFixed(2)}).`,
    };
  }

  return {
    margin,
    reason: `Selected on deterministic id tie-break (${winner.id} vs ${runnerUp.id}).`,
  };
}

function buildCandidateDiscoveryLog(
  winner: ScoredLoop,
  scored: ScoredLoop[],
  suppressedCandidateCount: number,
  failureReason: string | null,
  diagnostics?: ScorerDiagnostics,
): GenerationCandidateDiscoveryLog {
  const topCandidates = scored.slice(0, 2);
  const selection = buildSelectionReason(winner, topCandidates[1]);

  const rankedCandidates: GenerationCandidateLog[] = topCandidates.map((candidate, index) => {
    const isWinner = candidate.id === winner.id;
    const decisionReason = isWinner
      ? selection.reason
      : `Rejected because ${classifyKillReason(candidate, winner.score).killExplanation}`;

    const logDiscrepancyClass =
      candidate.type === 'discrepancy'
        ? (candidate.discrepancyClass
          ?? (candidate.id.startsWith('discrepancy_conflict_') ? 'schedule_conflict' : undefined))
        : undefined;

    return {
      id: candidate.id,
      rank: index + 1,
      candidateType: candidate.fromInsightScan ? 'insight' : candidate.type,
      ...(logDiscrepancyClass ? { discrepancyClass: logDiscrepancyClass } : {}),
      actionType: candidate.suggestedActionType,
      score: Number(candidate.score.toFixed(2)),
      scoreBreakdown: candidate.breakdown,
      targetGoal: candidate.matchedGoal
        ? {
          text: candidate.matchedGoal.text,
          priority: candidate.matchedGoal.priority,
          category: candidate.matchedGoal.category,
        }
        : null,
      sourceSignals: candidate.sourceSignals,
      decision: isWinner ? 'selected' : 'rejected',
      decisionReason,
    };
  });

  return {
    candidateCount: scored.length,
    suppressedCandidateCount,
    selectionMargin: selection.margin,
    selectionReason: selection.reason,
    failureReason,
    topCandidates: rankedCandidates,
    ...(diagnostics
      ? {
          quarantinedGoals: diagnostics.quarantine.goals.map((item) => `${item.reason}: ${item.text}`),
          quarantinedCommitments: diagnostics.quarantine.commitments.map((item) => `${item.reason}: ${item.text}`),
          droppedChatAuthority: diagnostics.quarantine.droppedChatAuthority,
          winnerSourceAuthority: getCandidateSourceAuthority(winner),
          interviewClusterInputs: getInterviewClusterInputSummaries(winner),
        }
      : {}),
  };
}

function buildRejectedByStageCounts(diag: ScorerDiagnostics): Record<string, number> {
  const out: Record<string, number> = {};
  for (const stage of diag.filterStages) {
    out[stage.stage] = stage.dropped.length;
  }
  return out;
}

function buildCandidateDiscoveryLogForNoWinner(
  scored: ScoredLoop[],
  suppressedCandidateCount: number,
  failureReason: string,
  diagnostics?: ScorerDiagnostics,
): GenerationCandidateDiscoveryLog {
  const top = [...scored].sort(compareScoredLoops).slice(0, 3);
  const rankedCandidates: GenerationCandidateLog[] = top.map((candidate, index) => {
    const inv = getInvariantFailureReasons(candidate);
    let decisionReason = 'Not eligible as today’s outbound move after the final scoring gate.';
    if (candidate.score <= 0.001) {
      decisionReason = 'Score at or below the generation floor (suppression, repeat penalty, or validity).';
    } else if (inv.length > 0) {
      decisionReason = `Ranking invariant: ${inv.join('; ')}.`;
    }
    const logDiscrepancyClass =
      candidate.type === 'discrepancy'
        ? (candidate.discrepancyClass
          ?? (candidate.id.startsWith('discrepancy_conflict_') ? 'schedule_conflict' : undefined))
        : undefined;

    return {
      id: candidate.id,
      rank: index + 1,
      candidateType: candidate.fromInsightScan ? 'insight' : candidate.type,
      ...(logDiscrepancyClass ? { discrepancyClass: logDiscrepancyClass } : {}),
      actionType: candidate.suggestedActionType,
      score: Number(candidate.score.toFixed(2)),
      scoreBreakdown: candidate.breakdown,
      targetGoal: candidate.matchedGoal
        ? {
          text: candidate.matchedGoal.text,
          priority: candidate.matchedGoal.priority,
          category: candidate.matchedGoal.category,
        }
        : null,
      sourceSignals: candidate.sourceSignals,
      decision: 'rejected',
      decisionReason,
    };
  });

  return {
    candidateCount: scored.length,
    suppressedCandidateCount,
    selectionMargin: null,
    selectionReason: null,
    failureReason,
    topCandidates: rankedCandidates,
    ...(diagnostics
      ? {
          quarantinedGoals: diagnostics.quarantine.goals.map((item) => `${item.reason}: ${item.text}`),
          quarantinedCommitments: diagnostics.quarantine.commitments.map((item) => `${item.reason}: ${item.text}`),
          droppedChatAuthority: diagnostics.quarantine.droppedChatAuthority,
          winnerSourceAuthority: null,
          interviewClusterInputs: [],
        }
      : {}),
  };
}

function inferSuppressionGoalTextForPool(
  scored: ScoredLoop[],
  suppressionEntities: ReadonlyArray<SuppressionGoalEntityPattern>,
): string | null {
  const sorted = [...scored].sort(compareScoredLoops);
  for (const c of sorted) {
    const { patternMatched, matchedGoalText } = evaluateSuppressionGoalMatch(
      c.title,
      c.content,
      c.suggestedActionType,
      c.entityName,
      suppressionEntities,
      CONTACT_ACTION_TYPES,
    );
    if (patternMatched && matchedGoalText) {
      return matchedGoalText;
    }
  }
  return null;
}

function buildTopBlockedFields(scored: ScoredLoop[]): {
  title: string | null;
  type: string | null;
  actionType: ActionType | null;
} {
  if (scored.length === 0) {
    return { title: null, type: null, actionType: null };
  }
  const top = [...scored].sort(compareScoredLoops)[0];
  return {
    title: top.title.slice(0, 200),
    type: top.type,
    actionType: top.suggestedActionType,
  };
}

function buildNoValidActionFinalGateExactBlocker(
  scored: ScoredLoop[],
  suppressionEntities: ReadonlyArray<SuppressionGoalEntityPattern>,
  diag: ScorerDiagnostics,
): ScorerExactBlocker {
  const rejected_by_stage = buildRejectedByStageCounts(diag);
  const suppression_goal_text = inferSuppressionGoalTextForPool(scored, suppressionEntities);
  const top = buildTopBlockedFields(scored);
  const survivors_before_final_gate = scored.filter((c) => c.score > 0.001).length;

  const primaryReason =
    suppression_goal_text
      ? 'No outbound move cleared the bar: a suppression goal still matches the strongest surfaced candidate (or every candidate was scored to zero).'
      : scored.length === 0
        ? 'No candidates remained after upstream scoring gates.'
        : 'No candidate combined sufficient score and ranking invariants to authorize an outbound move today.';

  return {
    blocker_type: 'no_valid_action_final_gate',
    blocker_reason: primaryReason,
    top_blocked_candidate_title: top.title,
    top_blocked_candidate_type: top.type,
    top_blocked_candidate_action_type: top.actionType,
    suppression_goal_text,
    survivors_before_final_gate,
    rejected_by_stage,
  };
}

function buildNoValidActionEarlyExitExactBlocker(
  diag: ScorerDiagnostics,
  blocker_type: string,
  blocker_reason: string,
): ScorerExactBlocker {
  return {
    blocker_type,
    blocker_reason,
    top_blocked_candidate_title: null,
    top_blocked_candidate_type: null,
    top_blocked_candidate_action_type: null,
    suppression_goal_text: null,
    survivors_before_final_gate: 0,
    rejected_by_stage: buildRejectedByStageCounts(diag),
  };
}

function wrapNoValidActionResult(params: {
  antiPatterns: AntiPattern[];
  divergences: RevealedGoalDivergence[];
  scored: ScoredLoop[];
  suppressedCandidates: number;
  candidateDiscovery: GenerationCandidateDiscoveryLog;
  exact_blocker: ScorerExactBlocker;
}): ScorerResultNoValidAction {
  const topCandidates = [...params.scored].sort(compareScoredLoops).slice(0, 3);
  return {
    outcome: 'no_valid_action',
    winner: null,
    topCandidates,
    deprioritized: [],
    candidateDiscovery: params.candidateDiscovery,
    antiPatterns: params.antiPatterns,
    divergences: params.divergences,
    exact_blocker: params.exact_blocker,
  };
}

/**
 * Classify why a loop lost to the winner.
 * - Noise: High Urgency but Low Stakes (no goal alignment → feels urgent but doesn't matter)
 * - Not Now: High Stakes but Low Urgency (important but the deadline is far out)
 * - Trap: High Stakes + Urgency but Low Tractability (history says you won't follow through)
 */
function classifyKillReason(loop: ScoredLoop, winnerScore: number): DeprioritizedLoop {
  const { stakes, urgency, tractability } = loop.breakdown;

  let killReason: KillReason;
  let killExplanation: string;

  if (isShadowUrgencyCandidate(loop) && !isTrueEmergencyOverrideCandidate(loop)) {
    killReason = 'noise';
    killExplanation = `This candidate had visible urgency, but it was shadow urgency rather than the highest-leverage move. It was easier to notice than the stronger 30-90 day board change.`;
  } else if (stakes <= 1.5 && urgency >= 0.5) {
    // High urgency, low stakes = noise
    killReason = 'noise';
    killExplanation = `Urgency ${urgency.toFixed(2)} but stakes only ${stakes} (no goal alignment). Feels pressing but doesn't move a priority forward.`;
  } else if (stakes >= 2.0 && urgency < 0.4) {
    // High stakes, low urgency = not now
    killReason = 'not_now';
    killExplanation = `Stakes ${stakes} but urgency only ${urgency.toFixed(2)}. Important, but the window is far enough out that today isn't the day.`;
  } else if (tractability < 0.4 && stakes >= 1.5 && urgency >= 0.3) {
    // Decent stakes/urgency but low tractability = trap
    killReason = 'trap';
    killExplanation = `Tractability only ${tractability.toFixed(2)} — historical data shows low follow-through on this type. High effort, low payoff.`;
  } else if (stakes <= 1.5) {
    // Default to noise if stakes are still the weakest factor
    killReason = 'noise';
    killExplanation = `Stakes ${stakes} dragged the score to ${loop.score.toFixed(2)} vs winner at ${winnerScore.toFixed(2)}. No aligned goal to justify acting.`;
  } else if (urgency < 0.4) {
    killReason = 'not_now';
    killExplanation = `Urgency ${urgency.toFixed(2)} is too low. This matters but not today.`;
  } else {
    killReason = 'trap';
    killExplanation = `Tractability ${tractability.toFixed(2)} is the drag. Past outcomes on ${loop.suggestedActionType} actions in this domain are weak.`;
  }

  return {
    title: loop.title,
    score: loop.score,
    breakdown: loop.breakdown,
    killReason,
    killExplanation,
  };
}

// ---------------------------------------------------------------------------
// Self-learn: auto-suppression from skip patterns + auto-lift on approval
// ---------------------------------------------------------------------------

/**
 * Extract the primary entity/topic from a directive text.
 * Looks for the first capitalized multi-word sequence after common action verbs,
 * or falls back to the first capitalized proper noun phrase.
 */
/**
 * Returns true if the extracted entity key is too malformed to be used as an
 * auto-suppression identifier. Malformed keys include:
 *   - Pure lowercase word-soup from the old fallback n-gram path
 *   - Keys shorter than 3 characters
 *   - Keys with no capital letter (not a proper noun)
 *   - Known junk fragments from the pollution era
 *   - Keys longer than 60 chars (clearly multi-sentence garbage)
 */
function isMalformedSuppressionKey(key: string): boolean {
  if (!key || key.length < 3) return true;
  if (key.length > 60) return true;
  // Must contain at least one capital letter (proper nouns only)
  if (!/[A-Z]/.test(key)) return true;
  // Known pollution-era junk patterns
  const JUNK_SUPPRESSION_PATTERNS = [
    /anthropic/i,
    /apikey/i,
    /your stated/i,
    /acknowledge that/i,
    /commitment system/i,
    /sorry mother/i,
    /sorry\s+\w+er/i,
    /\b(a|an|the|for|and|but|or|nor|so|yet|with|from)\s+\d+\b/i, // "a 30", "for 2"
  ];
  if (JUNK_SUPPRESSION_PATTERNS.some(p => p.test(key))) return true;
  return false;
}

function extractDirectiveEntity(directiveText: string): string | null {
  if (!directiveText) return null;

  // Pattern 1: verb + entity (e.g., "Email Keri Nopens", "Apply for FPA3", "Contact Brandon Kapp")
  const verbEntityMatch = directiveText.match(
    /\b(?:Email|Contact|Reach out to|Apply for|Submit|Schedule|Follow up with|Update|Review|Send)\s+(.+?)(?:\s*[-—–.]|$)/i,
  );
  if (verbEntityMatch) {
    const entity = verbEntityMatch[1].trim();
    // Take first 3-4 significant words as entity name
    const words = entity.split(/\s+/).slice(0, 4).join(' ');
    if (words.length >= 3) return words;
  }

  // Pattern 2: first capitalized multi-word sequence (proper noun)
  const properNounMatch = directiveText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/);
  if (properNounMatch) return properNounMatch[1];

  // Pattern 3: first significant capitalized word (4+ chars, not sentence start)
  const words = directiveText.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const clean = words[i].replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length >= 4 && /^[A-Z]/.test(clean)) return clean;
  }

  // NO FALLBACK: the old n-gram fallback produced malformed keys like
  // "anthropicapikey", "a 30", "your stated top goal", "sorry mother".
  // If no proper noun or named entity was found, return null and skip suppression.
  return null;
}

async function checkAndCreateAutoSuppressions(userId: string): Promise<void> {
  const supabase = createServerClient();
  const fourteenDaysAgo = new Date(Date.now() - daysMs(14)).toISOString();
  const sevenDaysAgo = new Date(Date.now() - daysMs(7)).toISOString();

  try {
    // --- Phase 1: Auto-create suppressions from 3+ skips ---
    const { data: skippedActions } = await supabase
      .from('tkg_actions')
      .select('id, directive_text, action_type')
      .eq('user_id', userId)
      .eq('status', 'skipped')
      .not('action_type', 'eq', 'do_nothing')
      .gte('generated_at', fourteenDaysAgo);

    // Group skipped directives by extracted entity
    const entitySkips = new Map<string, { count: number; actionIds: string[] }>();
    for (const action of (skippedActions ?? [])) {
      const entity = extractDirectiveEntity(action.directive_text as string | null ?? '');
      if (!entity) continue;
      const key = entity.toLowerCase();
      const existing = entitySkips.get(key) ?? { count: 0, actionIds: [] };
      existing.count++;
      existing.actionIds.push(action.id as string);
      entitySkips.set(key, existing);
    }

    // For entities with 3+ skips, check if suppression already exists
    for (const [entityKey, { count, actionIds }] of entitySkips) {
      if (count < 3) continue;

      // Hard guard: only create suppressions for real person names, company names,
      // domains, or job titles. Reject n-gram fragments and malformed tokens.
      if (isMalformedSuppressionKey(entityKey)) {
        logStructuredEvent({
          event: 'auto_suppression_skipped_malformed_key',
          level: 'warn',
          userId,
          artifactType: null,
          generationStatus: 'auto_suppression_skipped',
          details: { scope: 'scorer', entity: entityKey, skip_count: count },
        });
        continue;
      }

      // Check for existing suppression goal matching this entity
      const { data: existingGoals } = await supabase
        .from('tkg_goals')
        .select('id, goal_text')
        .eq('user_id', userId)
        .eq('current_priority', true);

      const alreadySuppressed = (existingGoals ?? []).some(g =>
        g.goal_text.toLowerCase().includes(entityKey),
      );

      if (!alreadySuppressed) {
        await supabase
          .from('tkg_goals')
          .insert({
            user_id: userId,
            goal_text: `AUTO-SUPPRESSED: ${entityKey}. Skipped 3+ times in 14 days. Will auto-lift on first approval matching this entity.`,
            goal_category: 'other',
            goal_type: 'recurring',
            priority: 1,
            current_priority: true,
            source: 'auto_suppression',
            status: 'active',
            confidence: 100,
            updated_at: new Date().toISOString(),
          });

        logStructuredEvent({
          event: 'auto_suppression_created',
          level: 'info',
          userId,
          artifactType: null,
          generationStatus: 'auto_suppression',
          details: {
            scope: 'scorer',
            entity: entityKey,
            skip_count: count,
            action_ids: actionIds.slice(0, 5),
          },
        });
      }
    }

    // --- Phase 2: Auto-lift suppressions on approval ---
    const { data: autoSuppressionGoals } = await supabase
      .from('tkg_goals')
      .select('id, goal_text')
      .eq('user_id', userId)
      .eq('source', 'auto_suppression')
      .eq('current_priority', true);

    for (const goal of (autoSuppressionGoals ?? [])) {
      // Extract the entity name from "AUTO-SUPPRESSED: <entity>. ..."
      const entityMatch = goal.goal_text.match(/^AUTO-SUPPRESSED:\s*(.+?)\.\s/i);
      if (!entityMatch) continue;
      const suppressedEntity = entityMatch[1].toLowerCase();

      // Check for recent approval matching this entity
      const { data: approvedActions } = await supabase
        .from('tkg_actions')
        .select('id, directive_text')
        .eq('user_id', userId)
        .eq('status', 'executed')
        .gte('generated_at', sevenDaysAgo);

      const matchingApproval = (approvedActions ?? []).find(a => {
        const entity = extractDirectiveEntity(a.directive_text as string | null ?? '');
        return entity && entity.toLowerCase().includes(suppressedEntity);
      });

      if (matchingApproval) {
        await supabase
          .from('tkg_goals')
          .delete()
          .eq('id', goal.id);

        logStructuredEvent({
          event: 'auto_suppression_lifted',
          level: 'info',
          userId,
          artifactType: null,
          generationStatus: 'auto_suppression_lifted',
          details: {
            scope: 'scorer',
            entity: suppressedEntity,
            approving_action_id: matchingApproval.id,
          },
        });
      }
    }
  } catch (err) {
    // Non-blocking — auto-suppression is an enhancement, not a gate
    logStructuredEvent({
      event: 'auto_suppression_error',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'auto_suppression_error',
      details: { scope: 'scorer', error: err instanceof Error ? err.message : String(err) },
    });
  }
}

// ---------------------------------------------------------------------------
// PRE-SCORING: Context validity filter
// Hard-rejects candidates with closed/rejected/resolved context before they
// reach scoring or generation.
//
// Three rejection classes:
//   1. rejection_signal_detected   — tkg_signal of type rejection/outcome_feedback
//                                    names this entity within last 60 days.
//   2. commitment_appears_resolved — processed signal from last 7 days contains
//                                    both the entity name and a resolution keyword.
//   3. historically_avoided        — 3+ consecutive skips for this entity in 30 days.
//
// All rejections log event: action_rejected_invalid_context
// ---------------------------------------------------------------------------

const RESOLUTION_KEYWORDS = [
  'reference check complete', 'reference completed', 'reference done',
  'hired', 'offer accepted', 'job offer', 'offer letter', 'accepted the offer',
  'position filled', 'no longer needed', 'cancelled', 'withdrawn',
  'already sent', 'already done',
  'rejected the offer', 'declined the offer', 'turned down the offer',
  // NOTE: bare "completed" and "closed" removed — too broad, matches
  // "order completed", "ticket closed", "payment completed" etc.
];

interface ValidityRejection {
  reason: 'rejection_signal_detected' | 'commitment_appears_resolved' | 'historically_avoided';
  detail: string;
}

async function filterInvalidContext(
  userId: string,
  candidatePool: Array<{ id: string; type: string; title: string; content: string; entityName?: string | null }>,
  processedSignals: Array<{ content: string; type?: string; occurred_at?: string }>,
  selfNameTokens: string[] = [],
): Promise<Map<string, ValidityRejection>> {
  const rejected = new Map<string, ValidityRejection>();
  if (candidatePool.length === 0) return rejected;

  const supabase = createServerClient();
  const sixtyDaysAgo = new Date(Date.now() - daysMs(60)).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();
  const sevenDaysAgo = new Date(Date.now() - daysMs(7)).toISOString();
  const userNameStops = new Set(selfNameTokens.map((s) => s.toLowerCase()));

  let rejectionTexts: string[] = [];
  let recentAllActions: Array<{ directive_text: string; status: string; generated_at: string }> = [];

  try {
    const [rejectionRes, actionsRes] = await Promise.all([
      supabase
        .from('tkg_signals')
        .select('id, source, occurred_at, author, type, source_id')
        .eq('user_id', userId)
        .in('type', ['rejection', 'user_feedback', 'outcome_feedback'])
        .gte('occurred_at', sixtyDaysAgo)
        .order('occurred_at', { ascending: false })
        .limit(50),
      // Fetch all terminal-status actions (approved + skipped) to detect consecutive skip runs
      supabase
        .from('tkg_actions')
        .select('directive_text, status, generated_at')
        .eq('user_id', userId)
        .gte('generated_at', thirtyDaysAgo)
        .in('status', ['approved', 'executed', 'skipped', 'draft_rejected', 'rejected'])
        .order('generated_at', { ascending: false })
        .limit(150),
    ]);

    rejectionTexts = buildSignalMetadataSummaryRows(
      (rejectionRes.data ?? []).map((signal: any) => ({
        id: String(signal.id),
        source: String(signal.source ?? ''),
        occurred_at: String(signal.occurred_at ?? ''),
        author: (signal.author as string | null) ?? null,
        type: (signal.type as string | null) ?? null,
        source_id: (signal.source_id as string | null) ?? null,
      })),
    ).map((signal) => signal.content.toLowerCase());

    recentAllActions = (actionsRes.data ?? []).map((a) => ({
      directive_text: (a.directive_text as string) ?? '',
      status: a.status as string,
      generated_at: a.generated_at as string,
    }));
  } catch {
    // Non-critical — return empty so scoring continues unblocked
    return rejected;
  }

  // Processed signals from last 7 days only for resolution detection
  const recentResolutionTexts = processedSignals
    .filter((s) => (s.occurred_at ?? '') >= sevenDaysAgo)
    .map((s) => s.content.toLowerCase());

  for (const c of candidatePool) {
    // Signal candidates are raw email/calendar text — they contain many
    // incidental names in headers, footers, signatures, and CC lists.
    // Person-name-based rejection produces massive false positives on them.
    // Only commitment and relationship candidates should be subject to
    // entity-level validity filtering.
    if (c.type === 'signal') continue;

    let names: string[] = [];
    const entityName = typeof c.entityName === 'string' ? c.entityName.trim() : '';
    if (entityName.length > 0) {
      if (isValidPersonNameForValidityContext(entityName)) {
        names = [entityName];
      } else if (c.type === 'relationship') {
        // Relationship candidates already have a canonical entity label; if it is
        // not person-like, do not scrape the body and invent fake "people" from
        // email scaffolding or role text.
        continue;
      }
    }
    if (names.length === 0) {
      names = filterPersonNamesForValidityContext(
        extractPersonNames(`${c.title} ${c.content}`),
      );
    }
    if (names.length === 0) continue;
    if (userNameStops.size > 0) {
      names = names.filter((name) => {
        const first = name.split(/\s+/)[0]?.toLowerCase();
        return !first || !userNameStops.has(first);
      });
      if (names.length === 0) continue;
    }

    for (const name of names) {
      const nameParts = name.split(' ');
      const firstName = nameParts[0].toLowerCase();
      const hasLastName = nameParts.length >= 2;
      if (firstName.length < 3) continue;

      // Build match pattern: require full name when available, whole-word
      // first-name match when not (minimum 4 chars to avoid "Jim"→"jimmy" etc.)
      const matchesInText = (text: string): boolean => {
        if (hasLastName) {
          // Full name match (case-insensitive): "caleb gieger" in text
          return text.includes(name.toLowerCase());
        }
        // First-name only: require word boundary and minimum length
        if (firstName.length < 4) return false;
        const wordBoundaryPattern = new RegExp(`\\b${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        return wordBoundaryPattern.test(text);
      };

      // --- Check 1: explicit rejection signal names this entity ---
      // Requires full-name or whole-word first-name match to prevent
      // The user's own first name in a rejection signal must not kill unrelated
      // threads that mention someone else with the same first name.
      if (rejectionTexts.some((text) => matchesInText(text))) {
        rejected.set(c.id, {
          reason: 'rejection_signal_detected',
          detail: `rejection signal matches entity "${name}"`,
        });
        logStructuredEvent({
          event: 'action_rejected_invalid_context',
          level: 'info',
          userId,
          artifactType: null,
          generationStatus: 'pre_generation_rejected',
          details: {
            scope: 'scorer',
            reason: 'rejection_signal_detected',
            candidate_id: c.id,
            candidate_type: c.type,
            candidate_title: c.title.slice(0, 100),
            matched_entity: name,
          },
        });
        break;
      }

      // --- Check 2: recent signals show this commitment is resolved ---
      // Requires resolution keyword within 200 chars of the name mention
      // (proximity match) to prevent "order completed" from rejecting an
      // unrelated commitment that happens to share a person name.
      if (c.type === 'commitment') {
        const resolved = recentResolutionTexts.some((text) => {
          if (!matchesInText(text)) return false;
          // Proximity check: find name position, check for keyword within 200 chars
          const namePos = text.indexOf(hasLastName ? name.toLowerCase() : firstName);
          if (namePos === -1) return false;
          const nearbyText = text.slice(Math.max(0, namePos - 200), namePos + name.length + 200);
          return RESOLUTION_KEYWORDS.some((kw) => nearbyText.includes(kw));
        });
        if (resolved) {
          rejected.set(c.id, {
            reason: 'commitment_appears_resolved',
            detail: `resolution keyword found near entity "${name}" in recent signal`,
          });
          logStructuredEvent({
            event: 'action_rejected_invalid_context',
            level: 'info',
            userId,
            artifactType: null,
            generationStatus: 'pre_generation_rejected',
            details: {
              scope: 'scorer',
              reason: 'commitment_appears_resolved',
              candidate_id: c.id,
              candidate_type: c.type,
              candidate_title: c.title.slice(0, 100),
              matched_entity: name,
            },
          });
          break;
        }
      }

      // --- Check 3: 3+ consecutive skips = definitively avoided ---
      // Walk the most-recent-first action list for this entity.
      // Any non-skip breaks the streak (user re-engaged after skipping).
      // Uses full-name or whole-word match (same as above).
      const entityActions = recentAllActions.filter((a) =>
        matchesInText(a.directive_text.toLowerCase()),
      );
      let consecutiveSkips = 0;
      for (const a of entityActions) {
        if (['skipped', 'draft_rejected', 'rejected'].includes(a.status)) {
          consecutiveSkips++;
        } else {
          break; // approved/executed resets the streak
        }
      }
      if (consecutiveSkips >= 3) {
        rejected.set(c.id, {
          reason: 'historically_avoided',
          detail: `${consecutiveSkips} consecutive skips for entity "${name}" in last 30 days`,
        });
        logStructuredEvent({
          event: 'action_rejected_invalid_context',
          level: 'info',
          userId,
          artifactType: null,
          generationStatus: 'pre_generation_rejected',
          details: {
            scope: 'scorer',
            reason: 'historically_avoided',
            candidate_id: c.id,
            candidate_type: c.type,
            candidate_title: c.title.slice(0, 100),
            matched_entity: name,
            consecutive_skips: consecutiveSkips,
          },
        });
        break;
      }
    }
  }

  return rejected;
}

// ---------------------------------------------------------------------------
// Lifecycle helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if any signal in the already-fetched pool mentions this
 * candidate's topic within the last `withinDays` days.
 * Uses keyword overlap (same approach as getFreshness/getDaysSinceLastSurface).
 * No additional DB call — operates purely on the in-memory signal array.
 */
function hasRecentSignalForCandidate(
  candidateTitle: string,
  signals: Array<{ content: string; occurred_at?: string }>,
  withinDays: number = 7,
): boolean {
  const cutoff = Date.now() - daysMs(withinDays);
  const titleWords = new Set(
    candidateTitle
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4),
  );
  if (titleWords.size === 0) return false;

  for (const sig of signals) {
    const sigMs = new Date(sig.occurred_at ?? 0).getTime();
    if (sigMs < cutoff) continue;
    const sigText = sig.content.toLowerCase();
    const overlap = [...titleWords].filter((w) => sigText.includes(w)).length;
    if (overlap >= 2 || (overlap >= 1 && titleWords.size <= 2)) return true;
  }
  return false;
}

/**
 * Deterministically classify a candidate's lifecycle state from already-computed
 * scoring values. Pure function — no async, no DB.
 *
 * Rules (applied in priority order):
 *
 * trash         entityPenalty <= -30  AND  urgency < 0.25  AND  no recent signal
 *               → definitively avoided, hard-remove from pool
 *
 * dormant_later urgency < 0.25  AND  no recent signal
 *               → watching, not acting; can re-enter on new signal
 *
 * active_now    everything else that passed filterInvalidContext
 *
 * Time horizon  derived from urgency:
 *   now >= 0.70, near_term >= 0.40, later >= 0.15, never < 0.15
 *
 * Actionability derived from stakes + tractability + urgency:
 *   actionable   stakes >= 2 AND tractability >= 0.35 AND urgency >= 0.25
 *   hold_only    stakes >= 2 but tractability or urgency below threshold
 *   archive_only stakes < 2 (no goal alignment)
 *
 * Domains covered: jobs, relationships, admin, product, finance, and all others.
 */
export function classifyLifecycle(args: {
  urgency: number;
  stakes: number;
  tractability: number;
  entityPenalty: number;
  hasRecentSignal: boolean;
  forceActionableNow?: boolean;
}): CandidateLifecycle {
  const { urgency, stakes, tractability, entityPenalty, hasRecentSignal, forceActionableNow = false } = args;

  // Time horizon
  let horizon: TimeHorizon;
  if (urgency >= 0.70) horizon = 'now';
  else if (urgency >= 0.40) horizon = 'near_term';
  else if (urgency >= 0.15) horizon = 'later';
  else horizon = 'never';

  // Actionability
  let actionability: Actionability;
  if (forceActionableNow) {
    actionability = 'actionable';
  } else if (stakes < 2) {
    actionability = 'archive_only';
  } else if (tractability >= 0.35 && urgency >= 0.25) {
    actionability = 'actionable';
  } else {
    actionability = 'hold_only';
  }

  if (forceActionableNow) {
    const forcedHorizon: TimeHorizon = horizon === 'never' ? 'near_term' : horizon;
    return {
      state: 'active_now',
      horizon: forcedHorizon,
      actionability,
      reason:
        'Interview-class candidate: keep active/actionable despite generic lifecycle thresholds because the confirmed hiring window is a forcing function.',
    };
  }

  // Trash: entity was explicitly skipped 2+ consecutive times AND low urgency
  // AND no fresh inbound signal has reopened it.
  if (entityPenalty <= -30 && urgency < 0.25 && !hasRecentSignal) {
    return {
      state: 'trash',
      horizon,
      actionability,
      reason: `Entity skip penalty (${entityPenalty}) with urgency ${urgency.toFixed(2)} and no signal in the last 7 days — candidate is definitively avoided.`,
    };
  }

  // Dormant: low urgency and no recent inbound signal — watch but do not generate.
  // A new inbound signal will be detected immediately above (reopenedByReentry).
  if (urgency < 0.25 && !hasRecentSignal) {
    return {
      state: 'dormant_later',
      horizon,
      actionability,
      reentryTrigger: 'new_signal',
      reason: `Urgency ${urgency.toFixed(2)} with no signal in the last 7 days — candidate is dormant until a reentry trigger fires (new_signal, user_action, external_milestone, or context_change).`,
    };
  }

  return {
    state: 'active_now',
    horizon,
    actionability,
    reason: `Urgency ${urgency.toFixed(2)}, stakes ${stakes}, tractability ${tractability.toFixed(2)} — candidate is active and eligible based on lifecycle criteria.`,
  };
}

function huntFindingBlockedByLock(f: HuntFinding, locked: Set<string>): boolean {
  const compact = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  if (f.entityName && locked.has(compact(f.entityName))) return true;
  const blob = compact(`${f.title} ${f.summary}`);
  for (const l of locked) {
    if (l.length >= 4 && blob.includes(l)) return true;
  }
  return false;
}

function huntFindingToScoredLoop(f: HuntFinding): ScoredLoop {
  return {
    id: f.id,
    type: 'hunt',
    title: f.title,
    content: huntFindingToScoredLoopContent(f),
    suggestedActionType: f.suggestedActionType,
    matchedGoal: null,
    score: 999,
    breakdown: {
      stakes: 4.5,
      urgency: 0.92,
      tractability: 0.85,
      freshness: 1.0,
      actionTypeRate: 0.5,
      entityPenalty: 0,
      final_score: 999,
    },
    relatedSignals: f.evidenceLines.slice(0, 8),
    sourceSignals: f.supportingSignalIds.map((id) => ({
      kind: 'signal' as const,
      id,
      summary: f.title.slice(0, 160),
    })),
    entityName: f.entityName,
    confidence_prior: 82,
    lifecycle: {
      state: 'active_now',
      horizon: 'now',
      actionability: 'actionable',
      reason: 'Hunt anomaly — deterministic absence pattern in synced mail/calendar signals.',
    },
    huntKind: f.kind,
  };
}

export async function scoreOpenLoops(
  userId: string,
  options?: { pipelineDryRun?: boolean; extraSuppressedCandidateKeys?: Set<string> },
): Promise<ScorerResult> {
  const diag = initDiagnostics();
  _lastDiagnostics = diag;

  const supabase = createServerClient();
  const fourteenDaysAgo = new Date(Date.now() - daysMs(14)).toISOString();
  const oneHundredEightyDaysAgo = new Date(Date.now() - daysMs(180)).toISOString();

  // -----------------------------------------------------------------------
  // PRE-SCORING: Anti-Pattern Detection (Session 3)
  // If an anti-pattern threshold is breached, suspend normal task generation.
  // The winning anti-pattern becomes the directive — a mirror, not a task.
  // -----------------------------------------------------------------------

  const antiPatterns = await detectAntiPatterns(userId);

  // Anti-patterns (commitment_decay, signal_velocity, etc.) no longer bypass
  // normal scoring with an early return. They are injected into the scored pool
  // at the emergent pattern stage (line ~2160) where the no-goal penalty applies.
  // This prevents goalless system metrics from winning over goal-connected candidates.

  // Self-learn: auto-create/lift suppression goals from skip patterns
  await checkAndCreateAutoSuppressions(userId);

  // Fetch user's own email addresses for self-addressed routing + inbound-vs-self scoring (multi-user: DB only, never hardcoded).
  const selfEmails = new Set<string>();
  let selfNameTokens: string[] = [];
  try {
    const { data: authUserData } = await supabase.auth.admin.getUserById(userId);
    const authUser = authUserData?.user;
    if (authUser?.email) selfEmails.add(authUser.email.toLowerCase());
    for (const identity of (authUser?.identities ?? [])) {
      const email = (identity.identity_data as Record<string, unknown>)?.['email'];
      if (typeof email === 'string' && email) selfEmails.add(email.toLowerCase());
    }
    const { data: connectorEmailRows } = await supabase
      .from('user_tokens')
      .select('email')
      .eq('user_id', userId)
      .in('provider', ['google', 'microsoft']);
    for (const row of connectorEmailRows ?? []) {
      const em = row.email as string | null | undefined;
      if (typeof em === 'string' && em.trim()) selfEmails.add(em.trim().toLowerCase());
    }
    // Build name tokens for name-based self-entity exclusion (catches "Brandon D Kapp" etc.)
    const meta = authUser?.user_metadata as Record<string, unknown> | undefined;
    const fullName = (meta?.['full_name'] ?? meta?.['name'] ?? '') as string;
    if (fullName) {
      selfNameTokens = fullName.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    }
    // Also mine from identity_data
    for (const identity of (authUser?.identities ?? [])) {
      const id = identity.identity_data as Record<string, unknown> | undefined;
      const given = id?.['given_name'] as string | undefined;
      const family = id?.['family_name'] as string | undefined;
      if (given) for (const t of given.toLowerCase().split(/\s+/)) if (t.length >= 2 && !selfNameTokens.includes(t)) selfNameTokens.push(t);
      if (family) for (const t of family.toLowerCase().split(/\s+/)) if (t.length >= 2 && !selfNameTokens.includes(t)) selfNameTokens.push(t);
    }
  } catch {
    // Non-blocking — if lookup fails the self-addressed check in isSendWorthy still catches it
  }

  // Today midnight — used for today-focus domain query
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  // Parallel data fetch
  const [commitmentsRes, signalsRes, entitiesRes, goalsRes, todayActionsRes, entitySalienceRes] =
    await Promise.all([
    // Open commitments (last 14 days or no deadline), excluding user-suppressed ones
    supabase
      .from('tkg_commitments')
      .select(
        'id, description, category, status, risk_score, due_at, implied_due_at, source_context, updated_at, trust_class, promisor_id, promisee_id, source, source_id',
      )
      .eq('user_id', userId)
      .in('trust_class', ['trusted', 'unclassified'])
      .in('status', ['active', 'at_risk'])
      .is('suppressed_at', null)
      .order('risk_score', { ascending: false })
      .limit(50),

    // Signals (last 180 days — decay applied during scoring)
    // Load 200 to capture email + calendar + file + task signals
    supabase
      .from('tkg_signals')
      .select('id, source, occurred_at, author, type, source_id, content')
      .eq('user_id', userId)
      .gte('occurred_at', oneHundredEightyDaysAgo)
      .eq('processed', true)
      .order('occurred_at', { ascending: false })
      .limit(200),

    // Entities — both cooling (>14d) and active relationships
    // Active relationships provide context; cooling ones surface re-engagement
    supabase
      .from('tkg_entities')
      .select('id, name, last_interaction, total_interactions, patterns, trust_class, primary_email, emails')
      .eq('user_id', userId)
      .in('trust_class', ['trusted', 'unclassified'])
      .neq('name', 'self')
      .order('total_interactions', { ascending: false })
      .limit(30),

    // Active current-priority goals — P1 = most important
    supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category, source')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('current_priority', true)
      .order('priority', { ascending: true })
      .limit(20),

    // Today's executed/approved actions — used to build todayFocusDomains
    // If the user already approved something today, deprioritize unrelated domains.
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type')
      .eq('user_id', userId)
      .in('status', ['executed', 'approved'])
      .gte('executed_at', todayMidnight.toISOString())
      .limit(5),

    supabase
      .from('tkg_entities')
      .select('id, name, patterns, trust_class, primary_email, emails')
      .eq('user_id', userId)
      .neq('name', 'self')
      .eq('type', 'person')
      .limit(200),
  ]);

  const commitments = commitmentsRes.data ?? [];
  diag.sourceCounts.commitments_raw = commitments.length;
  diag.sourceCounts.signals_raw = (signalsRes.data ?? []).length;
  diag.sourceCounts.entities_raw = (entitiesRes.data ?? []).length;
  diag.sourceCounts.goals_raw = (goalsRes.data ?? []).length;

  // Build today-focus domain set — deferred until after goalKeywordIndex is built (below).
  // Placeholder populated after goals are filtered and indexed.
  const todayFocusDomains = new Set<string>();
  const _todayActionsRaw = todayActionsRes.data ?? [];

  // Near-duplicate dedup: commitments are sometimes extracted multiple times
  // from follow-up emails about the same underlying task. Group by the first
  // 6 meaningful words of the description; keep only the highest-risk_score
  // variant per group so the scored pool doesn't waste slots on repetition.
  {
    const STOP = new Set(['the', 'a', 'an', 'to', 'for', 'and', 'or', 'in', 'on', 'at', 'of', 'my', 'your', 'with', 'i', 'will']);
    const dedupMap = new Map<string, typeof commitments[0]>();
    for (const c of commitments) {
      const key = (c.description as string ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 1 && !STOP.has(w))
        .slice(0, 6)
        .join(' ');
      const existing = dedupMap.get(key);
      if (!existing || ((c.risk_score as number) ?? 0) > ((existing.risk_score as number) ?? 0)) {
        dedupMap.set(key, c);
      }
    }
    const dupeCount = commitments.length - dedupMap.size;
    if (dupeCount > 0) {
      console.log(JSON.stringify({ event: 'scorer_commitment_dedup', before: commitments.length, after: dedupMap.size, dupes: dupeCount }));
      commitments.splice(0, commitments.length, ...[...dedupMap.values()]);
    }
    diag.sourceCounts.commitments_after_dedup = commitments.length;
  }

  let skippedDecryptRows = 0;
  const signals = (signalsRes.data ?? []).flatMap((signal: any) => {
    if (String(signal.source ?? '').trim() === 'user_feedback') return [];
    const decrypted = decryptWithStatus(String(signal.content ?? ''));
    if (decrypted.usedFallback) {
      skippedDecryptRows++;
      return [];
    }
    const plaintext = decrypted.plaintext.trim();
    if (!plaintext || isSelfReferentialSignal(plaintext)) return [];
    return [{
      id: String(signal.id),
      source: String(signal.source ?? ''),
      occurred_at: String(signal.occurred_at ?? ''),
      author: (signal.author as string | null) ?? null,
      type: (signal.type as string | null) ?? null,
      source_id: (signal.source_id as string | null) ?? null,
      content: plaintext,
    }];
  });
  logDecryptSkip(userId, 'score_open_loops', skippedDecryptRows);
  diag.sourceCounts.signals_after_decrypt = signals.length;

  const signalSourceByRowId = new Map<string, string>();
  for (const s of signals) {
    signalSourceByRowId.set(String(s.id), String(s.source ?? ''));
  }

  const { data: recentDirectiveRows } = await supabase
    .from('tkg_actions')
    .select('generated_at, directive_text')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(50);

  const recentDirectives: RecentDirectiveInput[] = (recentDirectiveRows ?? []).map((r: { generated_at: string; directive_text: string }) => ({
    generated_at: r.generated_at,
    directive_text: r.directive_text ?? '',
  }));

  const structuredSignals = signals.map((s) => ({
      id: String(s.id),
      source: String(s.source ?? ''),
      type: s.type ?? null,
      occurred_at: String(s.occurred_at ?? ''),
      content: s.content,
      source_id: s.source_id ?? null,
      author: s.author ?? null,
    }));

  const authoritySignals = signals.filter(
    (signal: { source?: string; type?: string | null }) =>
      getSignalSourceAuthorityTier(signal.source, signal.type) === 'high',
  );
  const authoritySignalTexts = authoritySignals.map((signal: { content: string }) => signal.content);
  diag.sourceCounts.signals_after_authority_filter = authoritySignals.length;
  diag.quarantine.droppedChatAuthority = signals
    .filter((signal: { source?: string; type?: string | null }) => isChatConversationSignalSource(signal.source, signal.type))
    .map((signal: { source?: string; occurred_at?: string }) => {
      const source = String(signal.source ?? 'conversation');
      const date = String(signal.occurred_at ?? '').slice(0, 10);
      return date ? `${source}:${date}` : source;
    })
    .slice(0, 12);

  const entities = entitiesRes.data ?? [];

  // Build set of trusted/known human entity emails — used later to filter hunt_unreplied.
  // Only emails from verified entities (trusted or unclassified with multiple interactions)
  // are considered real human correspondents. Cold-outreach senders are excluded.
  const trustedEntityEmails = new Set<string>();
  for (const ent of entities) {
    // Require at least 2 interactions to distinguish real relationships from one-off contacts.
    // "unclassified" entities with a single appearance are likely cold-outreach.
    const minInteractions = (ent.trust_class as string) === 'trusted' ? 1 : 2;
    if (((ent.total_interactions as number) ?? 0) >= minInteractions) {
      const primary = ent.primary_email as string | null | undefined;
      if (primary) trustedEntityEmails.add(primary.toLowerCase());
      for (const e of (ent.emails as string[] | undefined) ?? []) {
        trustedEntityEmails.add(e.toLowerCase());
      }
    }
  }

  // Supplement selfNameTokens from entities: find entities that match user's emails
  // and extract their name tokens. This handles email/password users who have no
  // given_name/family_name in OAuth metadata (only email in identity_data).
  if (selfNameTokens.length === 0 && selfEmails.size > 0) {
    for (const ent of entities) {
      const entEmail = (ent.primary_email as string | null | undefined);
      const entEmails = (ent.emails as string[] | undefined) ?? [];
      const isOwnerEntity = (entEmail && selfEmails.has(entEmail.toLowerCase()))
        || entEmails.some(e => selfEmails.has(e.toLowerCase()));
      if (isOwnerEntity) {
        const tokens = (ent.name as string).toLowerCase().split(/\s+/).filter((t: string) => t.length >= 2);
        for (const t of tokens) {
          if (!selfNameTokens.includes(t)) selfNameTokens.push(t);
        }
      }
    }
  }
  // Entity ID → name map so commitment candidates can resolve promisor/promisee.
  // Seed from loaded entities, then batch-resolve any missing commitment actor IDs.
  const entityIdToName = new Map<string, string>();
  for (const e of entities) {
    entityIdToName.set(e.id, e.name as string);
  }
  // Batch-resolve promisor/promisee IDs not in the top-30 entity set
  {
    const missingIds = new Set<string>();
    for (const c of commitments) {
      const pid = c.promisor_id as string | null;
      const eid = c.promisee_id as string | null;
      if (pid && !entityIdToName.has(pid)) missingIds.add(pid);
      if (eid && !entityIdToName.has(eid)) missingIds.add(eid);
    }
    if (missingIds.size > 0) {
      const { data: extras } = await supabase
        .from('tkg_entities')
        .select('id, name')
        .in('id', [...missingIds]);
      if (extras) {
        for (const e of extras) {
          entityIdToName.set(e.id, e.name as string);
        }
      }
    }
  }
  const goals = ((goalsRes.data ?? []) as Array<GoalRow & { source?: string }>)
    .filter((goal) => {
      if (!isUsableGoalRow(goal)) return false;
      const quarantineReason = getGoalQuarantineReason(goal, authoritySignalTexts);
      if (quarantineReason) {
        diag.quarantine.goals.push({
          text: String(goal.goal_text ?? '').slice(0, 180),
          reason: quarantineReason,
        });
        return false;
      }
      return true;
    }) as GoalRow[];
  diag.sourceCounts.goals_after_filter = goals.length;
  const filteredCommitments = commitments.filter((commitment) => {
    const quarantineReason = getCommitmentQuarantineReason(commitment, authoritySignalTexts, Date.now());
    if (quarantineReason) {
      diag.quarantine.commitments.push({
        text: String(commitment.description ?? '').slice(0, 180),
        reason: quarantineReason,
      });
      return false;
    }
    return true;
  });
  commitments.splice(0, commitments.length, ...filteredCommitments);
  diag.sourceCounts.commitments_after_quarantine = commitments.length;
  const goalKeywordIndex = buildGoalKeywordIndex(goals);

  // Now that goalKeywordIndex is ready, build today-focus domain set from today's
  // executed/approved actions. If the user already acted on something in a domain
  // today, apply a 15% score reduction to candidates in unrelated domains — the
  // picker stays coherent with the user's actual decision state, not just signal recency.
  for (const a of _todayActionsRaw) {
    const text = (a.directive_text as string | null) ?? '';
    if (text.length < 10) continue;
    const domain = inferGoalCategory(text, goalKeywordIndex);
    if (domain && domain !== 'other') todayFocusDomains.add(domain);
  }
  if (todayFocusDomains.size > 0) {
    console.log(JSON.stringify({ event: 'scorer_today_focus', userId, domains: [...todayFocusDomains] }));
  }

  const entitySalienceRows: EntitySalienceRow[] = (entitySalienceRes.data ?? []).map(
    (e: {
      id: string;
      name: string;
      patterns: unknown;
      trust_class: string | null;
      primary_email?: string | null;
      emails?: unknown;
    }) => ({
      id: e.id,
      name: e.name ?? '',
      patterns: e.patterns,
      trust_class: e.trust_class,
      primary_email: e.primary_email,
      emails: e.emails,
    }),
  );

  function applyLivingGraphScoreMultiplier(
    score: number,
    ref: { id: string; type: string; entityName?: string; discrepancyClass?: DiscrepancyClass },
    titleShort: string,
  ): number {
    const lg = computeLivingGraphMultiplier(entitySalienceRows, ref);
    if (lg.multiplier !== 1 || lg.exempt_reason === 'discrepancy_silence_evidence') {
      logStructuredEvent({
        event: 'living_graph_applied',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'scoring',
        details: {
          scope: 'scorer',
          candidate_id: ref.id.length > 80 ? ref.id.slice(0, 80) : ref.id,
          candidate_type: ref.type,
          title: titleShort,
          entity_id: lg.entity_id,
          raw_salience: lg.raw_salience,
          effective_salience: lg.effective_salience,
          multiplier: lg.multiplier,
          exempt_reason: lg.exempt_reason,
        },
      });
    }
    return score * lg.multiplier;
  }

  // Related-signal keyword overlap (scoring loop): same logical pool as the legacy
  // second query (≤90d, max 150 bodies) but derived from the already-decrypted
  // `signals` rows from the parallel fetch above — avoids a duplicate tkg_signals
  // round-trip and re-decrypting overlapping ciphertext for every open_loops run.
  const ninetyDaysAgoMs = Date.now() - daysMs(90);
  const decryptedSignals = signals
    .filter((s: { occurred_at?: string }) => {
      const t = new Date(s.occurred_at as string ?? 0).getTime();
      return Number.isFinite(t) && t >= ninetyDaysAgoMs;
    })
    .filter((s: { source?: string; type?: string | null }) =>
      getSignalSourceAuthorityTier(s.source, s.type) !== 'lowest',
    )
    .slice(0, 150)
    .map((s: { content: string }) => s.content as string);

  // Goal signal velocity — count signals in the last 7 days per goal category.
  // Used to boost candidates whose matched goal has high recent activity.
  const sevenDaysAgoMs = Date.now() - daysMs(7);
  const goalVelocityMap = new Map<string, number>();
  for (const g of goals) {
    const keywords = g.goal_text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length >= 4);
    if (keywords.length === 0) continue;
    let count = 0;
    for (const sig of signals) {
      if (new Date(sig.occurred_at as string).getTime() < sevenDaysAgoMs) continue;
      const lower = (sig.content as string).toLowerCase();
      if (keywords.some((kw: string) => lower.includes(kw))) count++;
    }
    const existing = goalVelocityMap.get(g.goal_category) ?? 0;
    goalVelocityMap.set(g.goal_category, existing + count);
  }

  const suppressedCandidateKeys = await getSuppressedCandidateKeys(userId, supabase, 7);

  // -----------------------------------------------------------------------
  // Build candidate loops
  // -----------------------------------------------------------------------

  const candidates: Array<{
    id: string;
    type: 'commitment' | 'signal' | 'relationship';
    title: string;
    content: string;
    actionType: ActionType;
    urgency: number;
    matchedGoal: MatchedGoal | null;
    domain: string;
    sourceSignals: GenerationCandidateSource[];
    entityPatterns?: unknown;
    entityName?: string;
    /** Structured sender from the underlying signal record — passed to entity-reality-gate. */
    author?: string;
    commitmentDueMs?: number;
    calendarEventStartMs?: number;
    /** True when commitment.source_id resolves to a gmail/outlook signal row (real thread). */
    mailThreadAnchored?: boolean;
  }> = [];
  let suppressedCandidates = 0;

  // -----------------------------------------------------------------------
  // Suppression goals — load ALL goals with current_priority = true
  // These are constraint/suppression goals (priority 1-2) not loaded by the
  // main .gte('priority', 3) query. If a candidate matches suppression text,
  // its score is zeroed before it can win.
  // -----------------------------------------------------------------------

  const { data: suppressionGoalRows } = await supabase
    .from('tkg_goals')
    .select('goal_text, priority, goal_category')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('current_priority', true)
    .lt('priority', 3);

  // Extract entity names and key phrases from suppression goal text
  const dynamicUserNameStops = await fetchUserFirstNameStopTokens(userId);
  const suppressionCommonWords = new Set([
    'not', 'the', 'this', 'that', 'with', 'from', 'until', 'unless', 'only',
    'suggest', 'apply', 'contacting', 'related', 'position', 'decided',
    'reviewed', 'posting', 'directives', 'suppress', 'locked', 'decision',
    'stable', 'employment', 'current', 'supervisor', 'reference', 'explicitly',
    'asks', 'path', 'post', 'work', 'platform', 'match',
    'contracts', 'analyst', 'program', 'functional', // individual words too generic
    ...dynamicUserNameStops,
  ]);
  // Only goals starting with "DO NOT" (or similar blocking language) contribute suppression entities.
  // Positive goals at priority < 3 (e.g. "Prepare MAS3 onboarding materials") must not suppress.
  const BLOCKING_GOAL_PREFIX = /^(DO NOT|SUPPRESS|BLOCK|NEVER)/i;
  // Contact-only suppression: "DO NOT contact/reach out/suggest contacting" — blocks send_message
  // only, not write_document or research. Absolute suppression: everything else DO NOT.
  const CONTACT_ONLY_PREFIX = /^DO NOT (suggest contacting|contact|reach out to|message|email)/i;

  const suppressionEntities: Array<{ pattern: RegExp; goalText: string; contactOnly: boolean }> = [];
  for (const sg of (suppressionGoalRows ?? []) as GoalRow[]) {
    // Skip positive goals — only process blocking instructions
    if (!BLOCKING_GOAL_PREFIX.test(sg.goal_text)) continue;

    const isContactOnly = CONTACT_ONLY_PREFIX.test(sg.goal_text);

    // Strategy: extract multi-word proper nouns and acronyms as suppression patterns.
    // Single common words are excluded to avoid false positives.
    const words = sg.goal_text.split(/\s+/);
    const entityCandidates: string[] = [];

    // 1. Multi-word capitalized phrases (2+ consecutive capitalized words = likely entity name)
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^a-zA-Z0-9]/g, '');
      if (word.length >= 3 && /^[A-Z]/.test(word)) {
        const phrase = [word];
        for (let j = i + 1; j < words.length && j <= i + 3; j++) {
          const nextWord = words[j].replace(/[^a-zA-Z0-9]/g, '');
          if (/^[A-Z]/.test(nextWord) || /^[0-9]/.test(nextWord)) {
            phrase.push(nextWord);
          } else {
            break;
          }
        }
        if (phrase.length >= 2) {
          entityCandidates.push(phrase.join(' '));
        } else if (!suppressionCommonWords.has(word.toLowerCase()) && word.length >= 4) {
          // Single capitalized word that's not a common English word — likely a proper noun (e.g., Mercor)
          entityCandidates.push(word);
        }
      }
    }

    // 2. Acronyms with numbers (FPA3, MAS3, HCBM, etc.)
    const acronyms = sg.goal_text.match(/\b[A-Z]{2,}[0-9]*\b/g);
    if (acronyms) {
      for (const acr of acronyms) {
        if (!suppressionCommonWords.has(acr.toLowerCase()) && acr.length >= 3) {
          entityCandidates.push(acr);
        }
      }
    }

    // 3. Known entity pattern: "Name Name" (first + last name, both capitalized, not common)
    const namePattern = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g;
    let nameMatch;
    while ((nameMatch = namePattern.exec(sg.goal_text)) !== null) {
      const firstName = nameMatch[1];
      const lastName = nameMatch[2];
      if (!suppressionCommonWords.has(firstName.toLowerCase()) &&
          !suppressionCommonWords.has(lastName.toLowerCase())) {
        entityCandidates.push(`${firstName} ${lastName}`);
      }
    }

    // Deduplicate and create patterns
    const uniqueEntities = [...new Set(entityCandidates)].filter(e => e.length >= 3);
    for (const entity of uniqueEntities) {
      suppressionEntities.push({
        pattern: new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        goalText: sg.goal_text,
        contactOnly: isContactOnly,
      });
    }
  }

  // 1. Commitments — skip self-referential (sourced from previous Foldera directives)
  for (const c of commitments) {
    const sourceCtx = (c.source_context as string | null) ?? '';
    if (/foldera/i.test(c.description) || /foldera/i.test(sourceCtx)) {
      logStructuredEvent({
        event: 'self_referential_commitment_filtered',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'filtered',
        details: { scope: 'scorer', commitment_id: c.id, description: (c.description as string).slice(0, 100) },
      });
      continue;
    }

    // Skip expired/past-due commitments that have no valid next step.
    // A commitment whose deadline passed more than 30 days ago is either
    // abandoned or was handled informally. It cannot produce a valid
    // SEND or WRITE_DOCUMENT action without a clear current trigger.
    const deadlineDate = (c.due_at as string | null) || (c.implied_due_at as string | null);
    if (deadlineDate) {
      const daysOverdue = (Date.now() - new Date(deadlineDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysOverdue > 30) {
        logStructuredEvent({
          event: 'stale_overdue_commitment_filtered',
          level: 'info',
          userId,
          artifactType: null,
          generationStatus: 'filtered',
          details: { scope: 'scorer', commitment_id: c.id, days_overdue: Math.round(daysOverdue), description: (c.description as string).slice(0, 80) },
        });
        continue;
      }
    }

    const text = `${c.description}${sourceCtx ? ' — ' + sourceCtx : ''}`;
    const mg = matchGoal(text, goals);

    // Commitment admission gate: reject trivial personal transactions and
    // high-noise categories that don't connect to a stated goal.
    if (!isExecutableCommitment(c.description, (c.category as string) ?? '', mg !== null)) {
      logStructuredEvent({
        event: 'commitment_admission_filtered',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'filtered',
        details: { scope: 'scorer', commitment_id: c.id, category: c.category, has_goal_match: mg !== null, description: (c.description as string).slice(0, 80) },
      });
      continue;
    }

    const actionType = inferActionType(text, 'commitment');

    // Resolve entity name from promisor/promisee — commitments are entity-grounded
    // through DB relationships even when the description text omits proper names.
    // Prefer promisee (the person acted upon), skip "self".
    const resolveEntity = (id: string | null): string | undefined => {
      if (!id) return undefined;
      const name = entityIdToName.get(id);
      if (!name || name.toLowerCase() === 'self') return undefined;
      return name;
    };
    const commitEntityName =
      resolveEntity(c.promisee_id as string) ??
      resolveEntity(c.promisor_id as string);

    const dueStr = (c.due_at as string | null) || (c.implied_due_at as string | null);
    const commitmentDueMs = dueStr ? new Date(dueStr).getTime() : undefined;

    const mailThreadAnchored = commitmentAnchoredToMailSignal(
      c.source as string | undefined,
      c.source_id as string | undefined,
      signalSourceByRowId,
    );

    candidates.push({
      id: c.id,
      type: 'commitment',
      title: c.description,
      content: text,
      actionType,
      urgency: deadlineUrgency(c.due_at, c.implied_due_at),
      matchedGoal: mg,
      domain: inferDomain(mg, text, goalKeywordIndex, 'general'),
      sourceSignals: [
        {
          kind: 'commitment',
          id: c.id,
          occurredAt: c.updated_at as string | undefined,
          summary: c.description,
        },
      ],
      entityName: commitEntityName,
      commitmentDueMs,
      mailThreadAnchored,
    });
  }

  // 2. Signals — skip self-fed directive signals to avoid circular loops
  for (const s of signals) {
    if (isExcludedSignalSourceForScorerPool(s.source as string | undefined)) continue;
    const text = s.content as string;
    if (!text || text.length < 20) continue;
    // Skip signals that are Foldera's own self-fed directives
    if (isSelfReferentialSignal(text)) continue;
    const mg = matchGoal(text, goals);
    const actionType = inferActionType(text, 'signal');
    const calParsed = parseCalendarEventFromContent(text);
    const calStart =
      calParsed && calParsed.startMs > Date.now() ? calParsed.startMs : undefined;

    candidates.push({
      id: s.id,
      type: 'signal',
      title: text.slice(0, 120),
      content: text,
      actionType,
      urgency: signalUrgency(s.occurred_at as string),
      matchedGoal: mg,
      domain: inferDomain(mg, text, goalKeywordIndex, 'general'),
      sourceSignals: [
        {
          kind: 'signal',
          id: s.id,
          source: s.source as string | undefined,
          occurredAt: s.occurred_at as string | undefined,
          summary: text.slice(0, 160),
        },
      ],
      // Pass structured author so entity-reality-gate can use it before regex.
      // Prevents dropping real threads whose entity name is absent from decrypted body text.
      author: s.author as string | undefined,
      calendarEventStartMs: calStart,
    });
  }

  // 3. Contextual relationships — only build candidates with open threads
  //
  // Bare silence (entity exists, no recent contact) is NOT a reason to build a
  // relationship candidate.  The discrepancy decay extractor handles silence.
  //
  // A relationship candidate requires at least one concrete open thread:
  //   (a) an open commitment (active/at_risk) where the entity is promisor or promisee, OR
  //   (b) a recent signal (≤14 days) that mentions this entity by name.
  //
  // Without either, the generator has no context and produces generic "just
  // checking in" artifacts that are always skipped.

  // Pre-build: entity → open commitments map
  const entityOpenThreads = new Map<string, Array<{ description: string; due_at: string | null; status: string }>>();
  for (const c of commitments) {
    const pid = c.promisor_id as string | null;
    const eid = c.promisee_id as string | null;
    for (const linkId of [pid, eid]) {
      if (!linkId) continue;
      const existing = entityOpenThreads.get(linkId) ?? [];
      existing.push({
        description: (c.description as string) ?? '',
        due_at: (c.due_at ?? c.implied_due_at ?? null) as string | null,
        status: c.status as string,
      });
      entityOpenThreads.set(linkId, existing);
    }
  }

  // Pre-build: entity name → recent signal snippets (case-insensitive, ≤14 days)
  const fourteenDaysMs = daysMs(14);
  const entityRecentSignals = new Map<string, string[]>();
  for (const e of entities) {
    const nameLower = (e.name as string).toLowerCase();
    const nameTokens = nameLower.split(/\s+/).filter((t: string) => t.length >= 3);
    const entityEmails = new Set<string>(
      [e.primary_email as string | null | undefined, ...(((e.emails as string[] | undefined) ?? []))]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.toLowerCase()),
    );
    if (nameTokens.length === 0) continue;
    const snippets: string[] = [];
    for (const sig of signals) {
      const sigAge = Date.now() - new Date(sig.occurred_at as string ?? 0).getTime();
      if (sigAge > fourteenDaysMs) continue;
      const authorLower = (sig.author ?? '').toLowerCase();
      const sigLower = (sig.content as string).toLowerCase();
      const authorMatchesEmail = [...entityEmails].some((email) => authorLower.includes(email));
      const authorMatchesName =
        authorLower.length > 0 &&
        (authorLower.includes(nameLower) || nameTokens.every((t: string) => authorLower.includes(t)));
      if (authorMatchesEmail || authorMatchesName) {
        snippets.push((sig.content as string).slice(0, 200));
        if (snippets.length >= 3) break;
      }
    }
    if (snippets.length > 0) entityRecentSignals.set(e.id, snippets);
  }

  let relationshipSkippedNoThread = 0;
  for (const e of entities) {
    const daysSince = Math.floor(
      (Date.now() - new Date(e.last_interaction as string).getTime()) / (1000 * 60 * 60 * 24),
    );

    const openThreads = entityOpenThreads.get(e.id) ?? [];
    const recentSnippets = entityRecentSignals.get(e.id) ?? [];
    const hasOpenThread = openThreads.length > 0;
    const hasRecentSignal = recentSnippets.length > 0;

    // Gate: no open thread AND no recent signal → skip entirely
    if (!hasOpenThread && !hasRecentSignal) {
      relationshipSkippedNoThread++;
      continue;
    }

    // Build enriched content from whatever context exists
    const contextParts: string[] = [];
    if (hasOpenThread) {
      const threadDesc = openThreads[0].description.slice(0, 120);
      const dueStr = openThreads[0].due_at
        ? ` (due ${new Date(openThreads[0].due_at).toISOString().slice(0, 10)})`
        : '';
      contextParts.push(`Open thread: ${threadDesc}${dueStr}`);
      if (openThreads.length > 1) contextParts.push(`+${openThreads.length - 1} more open threads`);
    }
    if (hasRecentSignal) {
      contextParts.push(`Recent context: ${recentSnippets[0].slice(0, 150)}`);
    }
    contextParts.push(`Last contact ${daysSince} days ago, ${e.total_interactions} total interactions`);

    const content = `${e.name}: ${contextParts.join('. ')}`;
    const mg = matchGoal(content, goals);

    // Action type: send_message only when there's a concrete open commitment
    // giving the generator something specific to draft about.
    // Otherwise make_decision — "here's the context, should you act?"
    const actionType: ActionType = hasOpenThread ? 'send_message' : 'make_decision';

    // Title: reflect the actual thread, not generic "Follow up with"
    const title = hasOpenThread
      ? `${e.name}: ${openThreads[0].description.slice(0, 60)}`
      : `${e.name}: ${recentSnippets[0].slice(0, 60)}`;

    candidates.push({
      id: e.id,
      type: 'relationship',
      title,
      content,
      actionType,
      urgency: relationshipUrgency(daysSince),
      matchedGoal: mg,
      domain: inferDomain(mg, content, goalKeywordIndex, 'relationship'),
      sourceSignals: [
        {
          kind: 'relationship',
          id: e.id,
          occurredAt: e.last_interaction as string | undefined,
          summary: title,
        },
      ],
      entityPatterns: e.patterns,
      entityName: e.name,
    });
  }

  diag.candidatePool.relationship_skipped_no_thread = relationshipSkippedNoThread;

  if (relationshipSkippedNoThread > 0) {
    logStructuredEvent({
      event: 'relationship_candidates_gated',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'scoring',
      details: {
        scope: 'scorer',
        skipped_no_thread: relationshipSkippedNoThread,
        passed: entities.length - relationshipSkippedNoThread,
        total_entities: entities.length,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Diagnostic: candidate pool composition before any filters
  // -----------------------------------------------------------------------
  {
    const byType: Record<string, number> = { commitment: 0, signal: 0, relationship: 0 };
    for (const c of candidates) byType[c.type]++;
    diag.candidatePool.commitment = byType.commitment;
    diag.candidatePool.signal = byType.signal;
    diag.candidatePool.relationship = byType.relationship;
    console.log(JSON.stringify({
      event: 'scorer_candidate_pool_raw',
      total: candidates.length,
      ...byType,
      sample_signal_entities: candidates
        .filter(c => c.type === 'signal')
        .slice(0, 5)
        .map(c => ({ title: c.title.slice(0, 60), entityName: c.entityName ?? null, actionType: c.actionType })),
      sample_relationship_entities: candidates
        .filter(c => c.type === 'relationship')
        .slice(0, 5)
        .map(c => ({ title: c.title.slice(0, 60), entityName: c.entityName ?? null, actionType: c.actionType })),
    }));
  }

  if (suppressedCandidateKeys.size > 0) {
    const preCooldown = candidates.length;
    const cooldownDrops: ScorerDropEntry[] = [];
    for (let i = candidates.length - 1; i >= 0; i--) {
      const c = candidates[i];
      if (suppressedCandidateKeys.has(scorerCandidateSuppressionKey(c))) {
        cooldownDrops.push({
          candidateId: c.id,
          type: c.type,
          title: c.title.slice(0, 100),
          stage: 'suppressed_candidate_cooldown',
          reason: 'recent_duplicate_suppression',
        });
        candidates.splice(i, 1);
      }
    }
    if (preCooldown !== candidates.length) {
      console.log(JSON.stringify({
        event: 'scorer_suppressed_candidate_cooldown',
        userId,
        before: preCooldown,
        after: candidates.length,
      }));
      diag.filterStages.push({
        stage: 'suppressed_candidate_cooldown',
        before: preCooldown,
        after: candidates.length,
        dropped: cooldownDrops,
      });
    }
  }

  // -----------------------------------------------------------------------
  // PRE-SCORING: Foldera / product-noise candidate ids (cheap — before heavy work)
  // Mirrors generator `noise_winner` so hunt/test ids never hydrate or score.
  // -----------------------------------------------------------------------
  {
    const preFoldera = candidates.length;
    const folderaDrops: ScorerDropEntry[] = [];
    for (let i = candidates.length - 1; i >= 0; i--) {
      const c = candidates[i];
      if (!c.id.toLowerCase().includes('foldera')) continue;
      folderaDrops.push({
        candidateId: c.id,
        type: c.type,
        title: c.title.slice(0, 100),
        stage: 'foldera_id_noise',
        reason: 'noise_winner_id',
      });
      candidates.splice(i, 1);
    }
    if (preFoldera !== candidates.length) {
      console.log(JSON.stringify({
        event: 'scorer_foldera_id_filtered',
        userId,
        before: preFoldera,
        after: candidates.length,
      }));
      diag.filterStages.push({
        stage: 'foldera_id_noise',
        before: preFoldera,
        after: candidates.length,
        dropped: folderaDrops,
      });
    }
  }

  // -----------------------------------------------------------------------
  // PRE-SCORING: Candidate quality filter
  // Reject housekeeping, tool management, notifications, and spam before
  // they reach the scoring loop. These waste scorer capacity and poison
  // the candidate pool even when the generator correctly downgrades them.
  // -----------------------------------------------------------------------

  const preScoringCount = candidates.length;
  const noiseDrops: ScorerDropEntry[] = [];
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    // Relationship candidates are exempt from noise filtering — they come from
    // verified entities in tkg_entities with real interaction history, not from
    // raw signal/commitment text that could be spam or housekeeping.
    if (c.type === 'relationship') continue;
    const isNoise = isNoiseCandidateText(c.title, c.content);
    if (isNoise) {
      noiseDrops.push({ candidateId: c.id, type: c.type, title: c.title.slice(0, 100), stage: 'noise_filter', reason: 'noise_text' });
      logStructuredEvent({
        event: 'candidate_noise_filtered',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'noise_filtered',
        details: {
          scope: 'scorer',
          candidate_id: c.id,
          candidate_title: c.title.slice(0, 100),
        },
      });
      candidates.splice(i, 1);
    }
  }
  diag.filterStages.push({ stage: 'noise_filter', before: preScoringCount, after: candidates.length, dropped: noiseDrops });
  if (preScoringCount !== candidates.length) {
    console.log(JSON.stringify({
      event: 'scorer_noise_filter',
      before: preScoringCount,
      after: candidates.length,
      filtered: preScoringCount - candidates.length,
    }));
  }

  // PRE-SCORING: Context validity filter
  // Hard-removes candidates with closed/rejected/resolved context before the
  // scoring loop runs. Rejected candidates never reach generation.
  const preValidityCount = candidates.length;
  const invalidContextRejections = await filterInvalidContext(
    userId,
    candidates,
    signals as Array<{ content: string; type?: string; occurred_at?: string }>,
    selfNameTokens,
  );
  const validityDrops: ScorerDropEntry[] = [];
  if (invalidContextRejections.size > 0) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (invalidContextRejections.has(candidates[i].id)) {
        const c = candidates[i];
        validityDrops.push({ candidateId: c.id, type: c.type, title: c.title.slice(0, 100), stage: 'validity_filter', reason: 'invalid_context' });
        candidates.splice(i, 1);
      }
    }
    console.log(JSON.stringify({
      event: 'scorer_validity_filter',
      rejected: invalidContextRejections.size,
      remaining: candidates.length,
    }));
  }
  diag.filterStages.push({ stage: 'validity_filter', before: preValidityCount, after: candidates.length, dropped: validityDrops });

  // -----------------------------------------------------------------------
  // PRE-SCORING: Entity reality gate — drop candidates with unverified entities
  // Prevents fake or ungrounded entities from entering the scoring pipeline.
  // -----------------------------------------------------------------------
  const preEntityGateCount = candidates.length;
  const entityGateResult = applyEntityRealityGate(
    candidates,
    (entities as Array<{ name: string; total_interactions: number; trust_class?: string }>),
    (signals as Array<{ content: string; source?: string; author?: string; type?: string }>),
    selfEmails,
  );
  if (entityGateResult.dropped.length > 0) {
    console.log(JSON.stringify({
      event: 'entity_reality_gate_filter',
      passed: entityGateResult.passed.length,
      dropped: entityGateResult.dropped.length,
      verified_entities: entityGateResult.verifiedEntities.length,
      unverified_entities: entityGateResult.unverifiedEntities,
      drop_details: entityGateResult.dropped.map(d => ({
        id: d.candidate.id,
        title: d.candidate.title.slice(0, 80),
        entity: d.entity,
        reason: d.reason,
      })),
    }));
    for (const d of entityGateResult.dropped) {
      logStructuredEvent({
        event: 'candidate_entity_gate_dropped',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'entity_gate_dropped',
        details: {
          scope: 'scorer',
          candidate_id: d.candidate.id,
          candidate_title: d.candidate.title.slice(0, 100),
          entity: d.entity,
          reason: d.reason,
        },
      });
    }
    candidates.length = 0;
    candidates.push(...entityGateResult.passed);
  }
  const entityGateDrops: ScorerDropEntry[] = entityGateResult.dropped.map(d => ({
    candidateId: d.candidate.id, type: d.candidate.type, title: d.candidate.title.slice(0, 100),
    stage: 'entity_reality_gate', reason: `${d.reason} (entity: ${d.entity})`,
  }));
  diag.filterStages.push({ stage: 'entity_reality_gate', before: preEntityGateCount, after: candidates.length, dropped: entityGateDrops });

  // Collect sender emails from candidates dropped by the entity_reality_gate so the hunt can exclude them.
  // Prevents bulk/promo/unverified senders from winning as "unreplied human threads".
  // Covers newsletter_promo_source, no_active_thread (bulk cold-outreach), and other non-human drops.
  // Does NOT block known trusted entities (those were passed, not dropped).
  const gateBlockedSenderEmails = new Set<string>();
  const EMAIL_RE = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i;
  for (const d of entityGateResult.dropped) {
    // Only block sender emails for signal candidates (not relationship/commitment)
    // and only for non-human entity reasons (not self_addressed which is the user's own email)
    if (d.candidate.type === 'signal' && d.reason !== 'self_addressed') {
      const authorEmail = d.candidate.author;
      if (authorEmail) {
        const emailMatch = authorEmail.match(EMAIL_RE);
        if (emailMatch) gateBlockedSenderEmails.add(emailMatch[1].toLowerCase());
      }
    }
  }

  if (candidates.length === 0) {
    console.log(JSON.stringify({
      event: 'scorer_zero_after_entity_gate',
      entity_gate_passed: entityGateResult.passed.length,
      entity_gate_dropped: entityGateResult.dropped.length,
      verified_entity_count: entityGateResult.verifiedEntities.length,
      drop_reason_counts: entityGateResult.dropped.reduce((acc, d) => {
        acc[d.reason] = (acc[d.reason] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      /** Thread-backed pool is empty, but scoreOpenLoops continues so detectDiscrepancies() still runs (calendar/drive/cross-source gaps are not thread candidates). */
      continue_past_empty_thread_pool: true,
    }));
    // Do not return early: structural discrepancies are injected after the scoring loop
    // (detectDiscrepancies ~5700). Returning here collapsed live runs to no_valid_action
    // whenever mail-thread candidates failed the entity gate, even when schedule_conflict
    // or other cross-source discrepancies were available.
  }

  // -----------------------------------------------------------------------
  // PRE-SCORING: Stakes gate — hard filter for board-changing candidates only
  // Drops every candidate that cannot produce a board-changing outcome
  // (money, job, approval, deal, deadline). Fail closed.
  // -----------------------------------------------------------------------
  const preStakesGateCount = candidates.length;
  const stakesGateResult = applyStakesGate(candidates);
  if (stakesGateResult.dropped.length > 0) {
    console.log(JSON.stringify({
      event: 'stakes_gate_filter',
      passed: stakesGateResult.passed.length,
      dropped: stakesGateResult.dropped.length,
      drop_reasons: stakesGateResult.dropped.map(d => ({
        id: d.candidate.id,
        title: d.candidate.title.slice(0, 80),
        condition: d.failedCondition,
        reason: d.reason,
      })),
    }));
    for (const d of stakesGateResult.dropped) {
      logStructuredEvent({
        event: 'candidate_stakes_gate_dropped',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'stakes_gate_dropped',
        details: {
          scope: 'scorer',
          candidate_id: d.candidate.id,
          candidate_title: d.candidate.title.slice(0, 100),
          failed_condition: d.failedCondition,
          reason: d.reason,
        },
      });
    }
    // Replace candidates with only those that passed
    candidates.length = 0;
    candidates.push(...stakesGateResult.passed);
  }
  const stakesDrops: ScorerDropEntry[] = stakesGateResult.dropped.map(d => ({
    candidateId: d.candidate.id, type: d.candidate.type, title: d.candidate.title.slice(0, 100),
    stage: 'stakes_gate', reason: `${d.failedCondition}: ${d.reason}`,
  }));
  diag.filterStages.push({ stage: 'stakes_gate', before: preStakesGateCount, after: candidates.length, dropped: stakesDrops });

  if (candidates.length === 0) {
    console.log(JSON.stringify({
      event: 'scorer_zero_after_stakes_gate',
      stakes_passed: stakesGateResult.passed.length,
      stakes_dropped: stakesGateResult.dropped.length,
      continue_past_empty_thread_pool: true,
    }));
    // Do not return early: same as entity gate — stakes gate filters only mail/relationship/
    // commitment thread candidates. Cross-source write_document / make_decision discrepancies
    // are added later via detectDiscrepancies().
  }

  // -----------------------------------------------------------------------
  // Failure memory: exclude signal/entity/commitment keys that recently lost
  // to duplicate / usefulness / validation gates (persisted on do_nothing rows).
  // -----------------------------------------------------------------------
  const failureSuppressionKeys = await collectActiveFailureSuppressionKeys(supabase, userId, {
    mergeKeys: options?.extraSuppressedCandidateKeys,
  });
  if (failureSuppressionKeys.size > 0) {
    const preFailSup = candidates.length;
    const failSupDrops: ScorerDropEntry[] = [];
    for (let i = candidates.length - 1; i >= 0; i--) {
      const c = candidates[i];
      if (rawScorerCandidateMatchesFailureSuppression(c, failureSuppressionKeys)) {
        failSupDrops.push({
          candidateId: c.id,
          type: c.type,
          title: c.title.slice(0, 100),
          stage: 'failure_suppression',
          reason: 'recent_duplicate_or_gate_failure',
        });
        candidates.splice(i, 1);
      }
    }
    diag.filterStages.push({
      stage: 'failure_suppression',
      before: preFailSup,
      after: candidates.length,
      dropped: failSupDrops,
    });
    if (preFailSup !== candidates.length) {
      logStructuredEvent({
        event: 'scorer_failure_suppression_filtered',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'scoring',
        details: {
          scope: 'scorer',
          before: preFailSup,
          after: candidates.length,
          suppressed_key_count: failureSuppressionKeys.size,
        },
      });
    }
    if (candidates.length === 0) {
      diag.earlyExitStage = 'failure_suppression';
      diag.finalOutcome = 'no_valid_action';
      return wrapNoValidActionResult({
        antiPatterns,
        divergences: [],
        scored: [],
        suppressedCandidates: 0,
        candidateDiscovery: buildCandidateDiscoveryLogForNoWinner(
          [],
          0,
          'All candidates were filtered by recent duplicate or validation-failure memory.',
          diag,
        ),
        exact_blocker: buildNoValidActionEarlyExitExactBlocker(
          diag,
          'early_exit_failure_suppression',
          'Every candidate was removed by recent duplicate or validation-failure suppression.',
        ),
      });
    }
  }

  // -----------------------------------------------------------------------
  // PRE-SCORING: locked_contact — drop before computeCandidateScore / tractability / Gemini.
  // Same normalized keys as generator + hunt (whitespace-stripped lower).
  // -----------------------------------------------------------------------
  let lockedContactNormalizedKeys = new Set<string>();
  {
    const { data: lockedRowsForContacts } = await supabase
      .from('tkg_constraints')
      .select('normalized_entity, entity_text')
      .eq('user_id', userId)
      .eq('constraint_type', 'locked_contact')
      .eq('is_active', true);
    for (const row of lockedRowsForContacts ?? []) {
      const raw = row.normalized_entity;
      if (typeof raw === 'string' && raw.trim()) {
        lockedContactNormalizedKeys.add(raw.replace(/\s+/g, '').toLowerCase());
      }
      // Match scorer/candidate entityName normalization (whitespace-stripped lower) even when
      // normalized_entity drifted (e.g. middle initial in DB vs graph display name).
      const et = row.entity_text;
      if (typeof et === 'string' && et.trim()) {
        lockedContactNormalizedKeys.add(et.replace(/\s+/g, '').toLowerCase());
      }
    }
  }

  if (lockedContactNormalizedKeys.size > 0) {
    const preLocked = candidates.length;
    const lockDrops: ScorerDropEntry[] = [];
    for (let i = candidates.length - 1; i >= 0; i--) {
      const c = candidates[i];
      if (!c.entityName?.trim()) continue;
      const key = c.entityName.replace(/\s+/g, '').toLowerCase();
      if (!lockedContactNormalizedKeys.has(key)) continue;
      lockDrops.push({
        candidateId: c.id,
        type: c.type,
        title: c.title.slice(0, 100),
        stage: 'locked_contact_pre_filter',
        reason: 'locked_contact_entity',
        score: 0,
      });
      logStructuredEvent({
        event: 'locked_contact_pre_filter',
        level: 'info',
        userId,
        artifactType: artifactTypeForAction(c.actionType),
        generationStatus: 'scoring',
        details: {
          scope: 'scorer',
          candidate_id: c.id,
          candidate_title: c.title.slice(0, 100),
          entity_name: c.entityName.slice(0, 120),
          action_type: c.actionType,
        },
      });
      candidates.splice(i, 1);
    }
    diag.filterStages.push({
      stage: 'locked_contact_pre_filter',
      before: preLocked,
      after: candidates.length,
      dropped: lockDrops,
    });
    if (candidates.length === 0) {
      diag.earlyExitStage = 'locked_contact_pre_filter';
      diag.finalOutcome = 'no_valid_action';
      return wrapNoValidActionResult({
        antiPatterns,
        divergences: [],
        scored: [],
        suppressedCandidates: 0,
        candidateDiscovery: buildCandidateDiscoveryLogForNoWinner(
          [],
          0,
          'All candidates were excluded by locked-contact constraints.',
          diag,
        ),
        exact_blocker: buildNoValidActionEarlyExitExactBlocker(
          diag,
          'early_exit_locked_contact',
          'Every remaining candidate targeted a locked contact excluded by your constraints.',
        ),
      });
    }
  }

  // -----------------------------------------------------------------------
  // Goal-text date urgency boost: if a matched goal mentions a date within
  // 7 days, boost urgency so time-sensitive goals surface when they should.
  // -----------------------------------------------------------------------

  for (const c of candidates) {
    if (!c.matchedGoal) continue;
    const goalDateUrgency = extractGoalDateUrgency(c.matchedGoal.text);
    if (goalDateUrgency !== null) {
      c.urgency = Math.max(c.urgency, goalDateUrgency);
    }
  }

  // -----------------------------------------------------------------------
  // Score each candidate (v4: Gemini scoring function)
  // -----------------------------------------------------------------------

  diag.candidatesEnteringScoreLoop = candidates.length;
  let scored: ScoredLoop[] = [];
  const approvalHistory = await getApprovalHistory(userId);
  const globalMlPriors = await fetchGlobalMlPriorMap();

  let insightCandidates: Awaited<ReturnType<typeof runInsightScan>> = [];
  if (!options?.pipelineDryRun) {
    try {
      insightCandidates = await runInsightScan({
        userId,
        decryptedSignals: signals.map((s: { id: string; content: string; source?: string; type?: string | null; occurred_at?: string; author?: string | null }) => ({
          id: String(s.id),
          content: s.content,
          source: String(s.source ?? ''),
          type: s.type ?? null,
          occurred_at: String(s.occurred_at ?? ''),
          author: s.author ?? null,
        })),
        goals: goals.map((g) => ({
          goal_text: g.goal_text,
          priority: g.priority,
          goal_category: g.goal_category,
        })),
        entities: entities.map((e) => ({
          name: e.name as string,
          total_interactions: typeof e.total_interactions === 'number' ? e.total_interactions : 0,
          primary_email: e.primary_email as string | null | undefined,
          last_interaction: e.last_interaction as string | null | undefined,
        })),
      });
    } catch (err) {
      console.error('[scorer] Insight scan failed, continuing without:', err);
    }
  }

  for (const c of candidates) {
    // Check suppression goals BEFORE scoring — zero the score if matched
    const {
      patternMatched,
      isSuppressed,
      matchedGoalText: suppressedByGoal,
      contactOnly: suppressionIsContactOnly,
    } = evaluateSuppressionGoalMatch(
      c.title,
      c.content,
      c.actionType,
      c.entityName,
      suppressionEntities,
      CONTACT_ACTION_TYPES,
    );

    if (patternMatched) {
      suppressedCandidates++;
      logStructuredEvent({
        event: isSuppressed ? 'candidate_suppressed' : 'candidate_suppression_skipped',
        level: 'info',
        userId,
        artifactType: artifactTypeForAction(c.actionType),
        generationStatus: isSuppressed ? 'suppressed_by_goal' : 'suppression_skipped_non_contact',
        details: {
          scope: 'scorer',
          candidate_title: c.title.slice(0, 100),
          suppression_goal: (suppressedByGoal ?? '').slice(0, 120),
          action_type: c.actionType,
          contact_only: suppressionIsContactOnly,
        },
      });
    }

    if (isSuppressed) {
      // Push with score 0 — it will never win but appears in discovery log
      scored.push({
        id: c.id,
        type: c.type,
        title: c.title,
        content: c.content,
        suggestedActionType: c.actionType,
        matchedGoal: c.matchedGoal,
        score: 0,
        breakdown: {
          stakes: 0, urgency: 0, tractability: 0, freshness: 0,
          actionTypeRate: 0, entityPenalty: -999,
        },
        relatedSignals: [],
        sourceSignals: c.sourceSignals,
        entityName: c.entityName,
        confidence_prior: 30, // suppressed candidate — use floor prior
      });
      continue;
    }

    // Priority 1 = most important → highest stakes. Invert: stakes = 6 - priority
    // P1 → 5.0, P2 → 4.0, P3 → 3.0, P4 → 2.0, P5 → 1.0
    let stakes = c.matchedGoal ? (6 - c.matchedGoal.priority) : 1.0;

    // Interview-class write_document floor: a confirmed, dated, hiring-context
    // interview prep artifact is inherently high-stakes regardless of goal match.
    // Without this floor, unmatched interview prep candidates die in the lifecycle
    // gate (stakes < 2 → archive_only). The test below is the same one
    // `stakes-gate.ts` already uses to admit these candidates.
    const interviewClass = isTimeBoundInterviewExecutionCandidate({
      id: c.id,
      type: c.type,
      title: c.title,
      content: c.content,
      actionType: c.actionType,
      urgency: c.urgency,
      matchedGoal: c.matchedGoal,
      domain: c.domain,
      sourceSignals: c.sourceSignals,
      entityName: c.entityName,
    }, adaptInterviewSourceSignalsForGate(c.sourceSignals));
    if (interviewClass && stakes < 3) {
      logStructuredEvent({
        event: 'interview_class_stakes_floor',
        level: 'info',
        userId,
        artifactType: 'write_document',
        generationStatus: 'scoring',
        details: {
          scope: 'scorer',
          candidate_title: c.title.slice(0, 100),
          raw_stakes: stakes,
          floored_stakes: 3,
        },
      });
      stakes = 3;
    }

    let specificityAdjustedStakes = stakes;
    const words = c.content.split(/\s+/);
    const hasEntityReference = /[A-Z0-9]{4,}/.test(c.content);
    const hasEmail = /@/.test(c.content);
    const hasPhone = /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(c.content);
    const hasDate = /\d{4}-\d{2}-\d{2}|\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i.test(c.content);

    const specificitySignals = [hasEntityReference, hasEmail, hasPhone, hasDate].filter(Boolean).length;

    if (words.length < 10 && specificitySignals === 0) {
      // Vague candidates with no concrete details get a moderate penalty
      // but not a kill shot — short descriptions can still be actionable
      specificityAdjustedStakes = stakes * 0.5;
    } else if (specificitySignals >= 2) {
      // Candidates with multiple concrete signals (email + date, entity + date)
      // are more likely to contain hidden insights — boost aggressively
      specificityAdjustedStakes = Math.min(stakes * 1.6, 5.0);
    } else if (specificitySignals === 1) {
      specificityAdjustedStakes = Math.min(stakes * 1.2, 5.0);
    }

    if (specificityAdjustedStakes !== stakes) {
      logStructuredEvent({
        event: 'specificity_adjustment',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'scoring',
        details: {
          scope: 'scorer',
          candidate_title: c.title.slice(0, 80),
          raw_stakes: stakes,
          adjusted_stakes: specificityAdjustedStakes,
          specificity_signals: specificitySignals,
          word_count: words.length,
        },
      });
    }

    const tractability = await getTractability(userId, c.actionType, c.domain);
    const daysSinceLastSurface = await getDaysSinceLastSurface(userId, c.title);
    const rawEntityPenalty = await getEntitySkipPenalty(userId, c.content, c.title);
    const entityPenalty = CONTACT_ACTION_TYPES.has(c.actionType as ActionType) ? rawEntityPenalty : 0;

    const nowMsLoop = Date.now();
    const loopUrgency = mergeUrgencyWithTimeHints({
      baseUrgency: c.urgency,
      nowMs: nowMsLoop,
      calendarEventStartMs: c.calendarEventStartMs,
      commitmentDueMs: c.commitmentDueMs,
    });

    // v4: Gemini scoring function — replaces flat multiplicative formula
    const mlBucket = buildDirectiveMlBucketKey(mlBucketInputsFromBaseCandidate(c));
    const { score: rawScore, breakdown: geminiBreakdown } = computeCandidateScore({
      stakes: specificityAdjustedStakes,
      urgency: loopUrgency,
      tractability,
      actionType: c.actionType,
      entityPenalty,
      daysSinceLastSurface,
      approvalHistory,
      highStakes: specificityAdjustedStakes >= 4,
      globalPriorRate: globalMlPriors.get(mlBucket) ?? null,
    });

    // Goal velocity boost: candidates whose matched goal has high recent signal
    // activity get a 1.0-1.3x multiplier (capped at 1.3 for >=5 signals in 7d).
    const goalCat = c.matchedGoal?.category;
    const goalVelocity = goalCat ? (goalVelocityMap.get(goalCat) ?? 0) : 0;
    const velocityMultiplier = goalVelocity >= 5 ? 1.30 : goalVelocity >= 3 ? 1.15 : goalVelocity >= 1 ? 1.05 : 1.0;
    let score = rawScore * velocityMultiplier;

    // Today-focus penalty: if the user already approved something in a domain today,
    // deprioritize candidates in unrelated domains by 15%. Keeps the picker coherent
    // with the user's actual decision state (not just signal recency).
    if (todayFocusDomains.size > 0) {
      const candidateDomain = c.matchedGoal?.category ?? inferGoalCategory(c.content, goalKeywordIndex);
      if (candidateDomain && candidateDomain !== 'other' && !todayFocusDomains.has(candidateDomain)) {
        score *= 0.85;
      }
    }

    score = applyLivingGraphScoreMultiplier(
      score,
      { id: c.id, type: c.type, entityName: c.entityName },
      c.title.slice(0, 80),
    );

    // Mail-thread commitments with meaningful goal stakes beat calendar-only and internal-chat noise.
    if (c.type === 'commitment' && c.mailThreadAnchored && specificityAdjustedStakes >= 3) {
      score *= 1.35;
      logStructuredEvent({
        event: 'mail_thread_commitment_boost',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'scoring',
        details: {
          scope: 'scorer',
          candidate_id: c.id,
          adjusted_stakes: specificityAdjustedStakes,
        },
      });
    }

    // Find related signals: keyword overlap with this loop's content
    const loopWords = new Set(
      c.content.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 5),
    );
    const related = decryptedSignals
      .filter(sig => {
        const sigWords = sig.toLowerCase().split(/\s+/);
        const overlap = sigWords.filter(w => loopWords.has(w)).length;
        return overlap >= 3;
      })
      .slice(0, 5);

    // Enrich relationship context
    let relationshipContext: string | undefined;
    if (c.type === 'relationship' && c.entityName) {
      relationshipContext = await enrichRelationshipContext(userId, c.entityName, c.entityPatterns);
    }

    // Lifecycle classification — uses already-computed values, no extra DB call.
    // Check whether any signal in the in-memory pool mentions this candidate in the last 7 days.
    const hasRecentSig = hasRecentSignalForCandidate(
      c.title,
      signals as Array<{ content: string; occurred_at?: string }>,
    );
    const lifecycle = classifyLifecycle({
      urgency: loopUrgency,
      stakes: specificityAdjustedStakes,
      tractability,
      entityPenalty,
      hasRecentSignal: hasRecentSig,
      forceActionableNow: interviewClass,
    });

    // Reentry: if classified dormant_later but a recent signal was found, promote to active_now.
    if (lifecycle.state === 'dormant_later' && hasRecentSig) {
      lifecycle.state = 'active_now';
      lifecycle.reopenedByReentry = true;
      lifecycle.reason = `Reopened from dormant by new inbound signal within the last 7 days (reentry trigger: new_signal).`;
    }

    scored.push({
      id: c.id,
      type: c.type,
      title: c.title,
      content: c.content,
      suggestedActionType: c.actionType,
      matchedGoal: c.matchedGoal,
      score,
      breakdown: {
        // Gemini breakdown fields first (v4 detail)
        ...geminiBreakdown,
        // Legacy fields override where names collide (used by emergent/divergence/kill-reason paths)
        stakes,
        specificityAdjustedStakes,
        urgency: loopUrgency,
        tractability,
        freshness: geminiBreakdown.novelty_multiplier,
        actionTypeRate: geminiBreakdown.behavioral_rate,
        entityPenalty,
      },
      relatedSignals: related,
      sourceSignals: c.sourceSignals,
      entityName: c.entityName,
      relationshipContext,
      lifecycle,
      confidence_prior: Math.round(
        Math.max(30, Math.min(85,
          (geminiBreakdown.behavioral_rate ?? 0.5) * 100 - (entityPenalty < 0 ? 15 : 0),
        )),
      ),
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle eligibility gate
  //
  // Enforces the universal lifecycle state model across all domains (jobs,
  // relationships, admin, product, finance).
  //
  // Rules:
  //   trash        → hard-removed from the pool (excluded entirely)
  //   dormant_later → score zeroed; stays in pool for context/logs but cannot win
  //   resolved      → score zeroed; same treatment as dormant
  //   active_now + hold_only    → score zeroed; in context but not actionable today
  //   active_now + archive_only → score zeroed; no goal alignment (goal-primacy
  //                               gate also catches these, belt-and-suspenders)
  //   active_now + actionable   → proceeds to generation unchanged
  //
  // Emergent patterns (anti-patterns, divergences) bypass this gate — they are
  // diagnostic observations, not goal/thread/candidate state machines.
  // -----------------------------------------------------------------------

  let lifecycleGateExcluded = 0;
  const beforeLifecycleGate = scored.length;
  const lifecycleDrops: ScorerDropEntry[] = [];

  for (let i = scored.length - 1; i >= 0; i--) {
    const s = scored[i];
    // Emergent and compound loops bypass lifecycle gating
    if (s.type === 'emergent' || s.type === 'compound') continue;
    const lc = s.lifecycle;
    if (!lc) continue;

    if (lc.state === 'trash') {
      logStructuredEvent({
        event: 'lifecycle_gate_trash',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'lifecycle_excluded',
        details: {
          scope: 'scorer',
          candidate_title: s.title.slice(0, 80),
          horizon: lc.horizon,
          actionability: lc.actionability,
          reason: lc.reason,
        },
      });
      lifecycleDrops.push({ candidateId: s.id, type: s.type, title: s.title.slice(0, 100), stage: 'lifecycle_gate', reason: `trash: ${lc.reason?.slice(0, 80)}`, score: s.score });
      scored.splice(i, 1);
      lifecycleGateExcluded++;
    } else if (lc.state === 'dormant_later' || lc.state === 'resolved') {
      // Keep in pool for context / deprioritized log — zero the score so it cannot win
      s.score = 0;
      s.breakdown.entityPenalty = -999;
      logStructuredEvent({
        event: `lifecycle_gate_${lc.state}`,
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'lifecycle_dormant_or_resolved',
        details: {
          scope: 'scorer',
          candidate_title: s.title.slice(0, 80),
          state: lc.state,
          horizon: lc.horizon,
          reentry_trigger: lc.reentryTrigger,
          reason: lc.reason,
        },
      });
      lifecycleDrops.push({ candidateId: s.id, type: s.type, title: s.title.slice(0, 100), stage: 'lifecycle_gate', reason: `${lc.state}: ${lc.reason?.slice(0, 80)}`, score: s.score });
      lifecycleGateExcluded++;
    } else if (lc.actionability !== 'actionable') {
      // active_now but hold_only or archive_only — in context, not generatable today
      s.score = 0;
      s.breakdown.entityPenalty = -999;
      logStructuredEvent({
        event: 'lifecycle_gate_non_actionable',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'lifecycle_non_actionable',
        details: {
          scope: 'scorer',
          candidate_title: s.title.slice(0, 80),
          state: lc.state,
          actionability: lc.actionability,
          horizon: lc.horizon,
          reason: lc.reason,
        },
      });
      lifecycleDrops.push({ candidateId: s.id, type: s.type, title: s.title.slice(0, 100), stage: 'lifecycle_gate', reason: `non_actionable(${lc.actionability}): ${lc.reason?.slice(0, 80)}`, score: s.score });
      lifecycleGateExcluded++;
    }
  }
  diag.filterStages.push({ stage: 'lifecycle_gate', before: beforeLifecycleGate, after: scored.filter(s => s.score > 0).length, dropped: lifecycleDrops });

  if (lifecycleGateExcluded > 0) {
    logStructuredEvent({
      event: 'lifecycle_gate_summary',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'lifecycle_gate',
      details: {
        scope: 'scorer',
        before: beforeLifecycleGate,
        excluded: lifecycleGateExcluded,
        remaining: scored.length,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Cross-loop inference — find connections in top 5, merge if found
  // -----------------------------------------------------------------------

  scored.sort(compareScoredLoops);
  const top5 = scored.slice(0, 5);
  const connections = detectCrossLoopConnections(top5);

  if (connections.length > 0) {
    // Take the strongest connection and merge into a compound loop
    const bestConnection = connections[0];
    const compound = mergeLoops(bestConnection);
    const compoundScoreLg = applyLivingGraphScoreMultiplier(
      compound.score,
      { id: compound.id, type: 'compound', entityName: bestConnection.sharedPerson },
      compound.title.slice(0, 80),
    );
    logStructuredEvent({
      event: 'scorer_connection',
      userId,
      artifactType: artifactTypeForAction(compound.suggestedActionType),
      generationStatus: 'cross_loop_connection',
      details: {
        scope: 'scorer',
        connection_type: compound.connectionType,
      },
    });
    scored.push({ ...compound, score: compoundScoreLg });
  }

  // -----------------------------------------------------------------------
  // Revealed Goal Divergence (Session 2) — check if behavior contradicts stated goals
  // High divergence overrides standard open loop EV
  // -----------------------------------------------------------------------

  const divergences = await inferRevealedGoals(userId);
  for (const div of divergences) {
    if (div.divergenceScore >= 0.5) {
      const divergenceContent = [
        `You stated your top goal is "${div.statedGoal.text}" (priority ${div.statedGoal.priority}/5, category: ${div.statedGoal.category}).`,
        `But ${Math.round((div.revealedSignalCount / (div.revealedSignalCount + div.statedSignalCount)) * 100)}% of your signal velocity this fortnight is focused on ${div.revealedDomain} (${div.revealedSignalCount} signals vs ${div.statedSignalCount} in ${div.statedGoal.category}).`,
        '',
        'What the signals show:',
        ...div.topSignals.map((s, i) => `  ${i + 1}. "${s.slice(0, 150)}"`),
        '',
        `Are we changing the goal, or are you avoiding the work?`,
      ].join('\n');

      const divergenceScore = div.divergenceScore * 5; // scale to compete with normal loops (max 5)
      const divergenceTitle =
        `Preference divergence: stated "${div.statedGoal.text}" but signal velocity is on ${div.revealedDomain}`;
      const divSup = evaluateSuppressionGoalMatch(
        divergenceTitle,
        divergenceContent,
        'make_decision',
        null,
        suppressionEntities,
        CONTACT_ACTION_TYPES,
      );
      if (divSup.patternMatched) {
        suppressedCandidates++;
        logStructuredEvent({
          event: divSup.isSuppressed ? 'candidate_suppressed' : 'candidate_suppression_skipped',
          level: 'info',
          userId,
          artifactType: artifactTypeForAction('make_decision'),
          generationStatus: divSup.isSuppressed ? 'suppressed_by_goal' : 'suppression_skipped_non_contact',
          details: {
            scope: 'scorer',
            candidate_type: 'emergent_divergence',
            candidate_title: divergenceTitle.slice(0, 100),
            suppression_goal: (divSup.matchedGoalText ?? '').slice(0, 120),
            action_type: 'make_decision',
            contact_only: divSup.contactOnly,
          },
        });
      }

      scored.push({
        id: `divergence-${div.revealedDomain}-${div.statedGoal.category}`,
        type: 'emergent',
        title: divergenceTitle,
        content: divergenceContent,
        suggestedActionType: 'make_decision',
        matchedGoal: {
          text: div.statedGoal.text,
          priority: div.statedGoal.priority,
          category: div.statedGoal.category,
        },
        score: divSup.isSuppressed ? 0 : divergenceScore,
        breakdown: {
          stakes: div.statedGoal.priority,
          urgency: div.divergenceScore,
          tractability: 1.0,
          freshness: 1.0,
          actionTypeRate: 0.5,
          entityPenalty: divSup.isSuppressed ? -999 : 0,
        },
        relatedSignals: div.topSignals.slice(0, 3),
        sourceSignals: div.topSignals.slice(0, 3).map((signal) => ({
          kind: 'emergent',
          summary: signal.slice(0, 160),
        })),
        confidence_prior: Math.round(Math.max(30, Math.min(85, 0.5 * 100))), // no entity data → neutral prior
      });

      logStructuredEvent({
        event: 'scorer_override',
        userId,
        artifactType: artifactTypeForAction('make_decision'),
        generationStatus: 'revealed_preference_divergence',
        details: {
          scope: 'scorer',
          stated_domain: div.statedGoal.category,
          revealed_domain: div.revealedDomain,
        },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Check emergent patterns — wins when surprise_value * data_confidence > top loop EV
  // -----------------------------------------------------------------------

  scored.sort(compareScoredLoops);
  const topLoopEV = scored.length > 0 ? scored[0].score : 0;
  const emergent = await detectEmergentPatterns(userId);
  for (const ep of emergent) {
    const emergentEV = ep.surpriseValue * ep.dataConfidence;
    // Apply freshness to emergent patterns to prevent runaway loops
    const emergentFreshness = await getFreshness(userId, ep.title, 'emergent');
    const adjustedEV = emergentEV * emergentFreshness;
    // Emergent pattern must beat the top open loop to compete
    if (adjustedEV > topLoopEV || scored.length === 0) {
      // Build mirror content: specific data + "Is this true?"
      const mirrorContent = [
        ep.insight,
        '',
        'Evidence:',
        ...ep.dataPoints,
        '',
        ep.mirrorQuestion,
      ].join('\n');

      const emergSup = evaluateSuppressionGoalMatch(
        ep.title,
        mirrorContent,
        ep.suggestedActionType,
        null,
        suppressionEntities,
        CONTACT_ACTION_TYPES,
      );
      if (emergSup.patternMatched) {
        suppressedCandidates++;
        logStructuredEvent({
          event: emergSup.isSuppressed ? 'candidate_suppressed' : 'candidate_suppression_skipped',
          level: 'info',
          userId,
          artifactType: artifactTypeForAction(ep.suggestedActionType),
          generationStatus: emergSup.isSuppressed ? 'suppressed_by_goal' : 'suppression_skipped_non_contact',
          details: {
            scope: 'scorer',
            candidate_type: 'emergent_pattern',
            candidate_title: ep.title.slice(0, 100),
            suppression_goal: (emergSup.matchedGoalText ?? '').slice(0, 120),
            action_type: ep.suggestedActionType,
            contact_only: emergSup.contactOnly,
          },
        });
      }

      scored.push({
        id: `emergent-${ep.type}`,
        type: 'emergent',
        title: ep.title,
        content: mirrorContent,
        suggestedActionType: ep.suggestedActionType,
        matchedGoal: null,
        score: emergSup.isSuppressed ? 0 : adjustedEV + 0.01, // tiny bump to ensure it wins over the loop it beat
        breakdown: {
          stakes: ep.surpriseValue,
          urgency: ep.dataConfidence,
          tractability: 1.0,
          freshness: emergentFreshness,
          actionTypeRate: 0.5,
          entityPenalty: emergSup.isSuppressed ? -999 : 0,
        },
        relatedSignals: [],
        sourceSignals: ep.dataPoints.slice(0, 3).map((point) => ({
          kind: 'emergent',
          summary: point.slice(0, 160),
        })),
        confidence_prior: Math.round(Math.max(30, Math.min(85, ep.dataConfidence * 100))),
      });
    }
  }

  // -----------------------------------------------------------------------
  // Discrepancy detection: structural gap candidates (PRIMARY).
  // Discrepancies surface before open-loop fallbacks. Both compete in the
  // same scored pool — discrepancies win because their stakes/urgency values
  // reflect structural importance, not signal recency.
  // -----------------------------------------------------------------------
  const discrepancies = detectDiscrepancies({
    commitments,
    entities,
    goals,
    decryptedSignals,
    structuredSignals,
    recentDirectives,
    selfEmails,
    selfNameTokens: selfNameTokens.length > 0 ? selfNameTokens : undefined,
  });
  {
    const previewCap = 8;
    const cls = [...new Set(discrepancies.map((x) => x.class))];
    diag.discrepancyDetectorSummary = {
      count: discrepancies.length,
      classes: cls.slice(0, 48),
      preview: discrepancies.slice(0, previewCap).map((x) => ({
        class: x.class,
        action_type: x.suggestedActionType,
        stakes: x.stakes,
        urgency: x.urgency,
        title: x.title.slice(0, 80),
      })),
    };
  }
  console.log(JSON.stringify({
    event: 'discrepancy_detection_debug',
    entity_count: entities.length,
    entity_sample: entities.slice(0, 5).map(e => ({
      name: e.name, ti: e.total_interactions,
      silence: (e.patterns as any)?.bx_stats?.silence_detected,
      s90d: (e.patterns as any)?.bx_stats?.signal_count_90d,
    })),
    commitment_count: commitments.length,
    goal_count: goals.length,
    signal_count: decryptedSignals.length,
    discrepancy_count: discrepancies.length,
    discrepancy_classes: discrepancies.map(d => d.class),
    discrepancy_titles: discrepancies.map(d => d.title.slice(0, 80)),
    scored_before_discrepancy: scored.length,
  }));
  if (discrepancies.length > 0) {
    logStructuredEvent({
      event: 'discrepancy_candidates_detected',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'scoring',
      details: {
        scope: 'scorer',
        count: discrepancies.length,
        classes: discrepancies.map((d) => d.class),
        titles: discrepancies.map((d) => d.title.slice(0, 60)),
      },
    });
  }
  const nowMsDisc = Date.now();
  for (const d of discrepancies) {
    if (
      DISCREPANCY_FAILURE_SUPPRESSION_CLASS_SET.has(d.class)
      && failureSuppressionKeys.size > 0
      && scoredLoopMatchesFailureSuppression(
        { id: d.id, type: 'discrepancy', sourceSignals: d.sourceSignals },
        failureSuppressionKeys,
      )
    ) {
      (diag.discrepancyInjectionSkips ??= { locked_contact: 0, failure_suppression: 0 }).failure_suppression += 1;
      continue;
    }

    // Parity with locked_contact_pre_filter on the main candidate pool: discrepancies are
    // injected into `scored` later and must not resurrect locked entities as winners.
    if (lockedContactNormalizedKeys.size > 0 && d.entityName?.trim()) {
      const lockedKey = d.entityName.replace(/\s+/g, '').toLowerCase();
      if (lockedContactNormalizedKeys.has(lockedKey)) {
        (diag.discrepancyInjectionSkips ??= { locked_contact: 0, failure_suppression: 0 }).locked_contact += 1;
        logStructuredEvent({
          event: 'locked_contact_discrepancy_skipped',
          level: 'info',
          userId,
          artifactType: null,
          generationStatus: 'scoring',
          details: {
            scope: 'scorer',
            discrepancy_id: d.id,
            discrepancy_class: d.class,
            entity_name: d.entityName.slice(0, 120),
          },
        });
        continue;
      }
    }

    const discSup = evaluateSuppressionGoalMatch(
      d.title,
      d.content,
      d.suggestedActionType,
      d.entityName,
      suppressionEntities,
      CONTACT_ACTION_TYPES,
    );
    if (discSup.patternMatched) {
      suppressedCandidates++;
      logStructuredEvent({
        event: discSup.isSuppressed ? 'candidate_suppressed' : 'candidate_suppression_skipped',
        level: 'info',
        userId,
        artifactType: artifactTypeForAction(d.suggestedActionType),
        generationStatus: discSup.isSuppressed ? 'suppressed_by_goal' : 'suppression_skipped_non_contact',
        details: {
          scope: 'scorer',
          candidate_type: 'discrepancy',
          discrepancy_class: d.class,
          candidate_title: d.title.slice(0, 100),
          suppression_goal: (discSup.matchedGoalText ?? '').slice(0, 120),
          action_type: d.suggestedActionType,
          contact_only: discSup.contactOnly,
        },
      });
    }
    if (discSup.isSuppressed) {
      scored.push({
        id: d.id,
        type: 'discrepancy',
        title: d.title,
        content: d.content,
        suggestedActionType: d.suggestedActionType,
        matchedGoal: d.matchedGoal,
        score: 0,
        breakdown: {
          stakes: 0,
          urgency: 0,
          tractability: 0,
          freshness: 0,
          actionTypeRate: 0,
          entityPenalty: -999,
        },
        relatedSignals: [],
        sourceSignals: d.sourceSignals,
        entityName: d.entityName,
        confidence_prior: 30,
        discrepancyClass: d.class,
        trigger: d.trigger,
        discrepancyEvidence: d.evidence,
        discrepancyPreferredAction: d.discrepancyPreferredAction,
      });
      diag.discrepancies.push({
        id: d.id,
        class: d.class,
        title: d.title.slice(0, 100),
        entityName: d.entityName,
        score: 0,
        stakes: d.stakes,
        urgency: d.urgency,
        actionType: d.suggestedActionType,
      });
      continue;
    }

    const daysSinceLastSurface = await getDaysSinceLastSurface(userId, d.title);
    const mergedDiscUrgency = mergeUrgencyWithTimeHints({
      baseUrgency: d.urgency,
      nowMs: nowMsDisc,
      calendarEventStartMs: d.scoringHints?.calendarStartMs,
      commitmentDueMs: d.scoringHints?.commitmentDueMs,
      coldEntityMeetingBoost: d.scoringHints?.coldEntityMeetingBoost,
    });
    const discMlBucket = buildDirectiveMlBucketKey(mlBucketInputsFromDiscrepancy(d));
    const { score, breakdown: geminiBreakdown } = computeCandidateScore({
      stakes: d.stakes,
      urgency: mergedDiscUrgency,
      // goal_velocity_mismatch is purely statistical — no grounded thread, no specific recipient.
      // Lower tractability prevents it from beating real thread-grounded candidates.
      tractability: d.class === 'goal_velocity_mismatch' ? 0.30 : 0.70,
      actionType: d.suggestedActionType,
      entityPenalty: 0,
      daysSinceLastSurface,
      approvalHistory,
      highStakes: d.stakes >= 4,
      globalPriorRate: globalMlPriors.get(discMlBucket) ?? null,
    });
    // Penalize recipientless self-referential discrepancies so entity-linked
    // decay/risk candidates (with real people and real emails) always rank above
    // goal_velocity_mismatch or drift alerts that have no external target.
    const isRecipientlessStatistical =
      (d.class === 'goal_velocity_mismatch' || d.class === 'drift') && !d.entityName;
    let finalScore = isRecipientlessStatistical ? score * 0.4 : score;
    finalScore = applyLivingGraphScoreMultiplier(
      finalScore,
      { id: d.id, type: 'discrepancy', entityName: d.entityName, discrepancyClass: d.class },
      d.title.slice(0, 80),
    );
    scored.push({
      id: d.id,
      type: 'discrepancy',
      title: d.title,
      content: d.content,
      suggestedActionType: d.suggestedActionType,
      matchedGoal: d.matchedGoal,
      score: finalScore,
      breakdown: {
        stakes: d.stakes,
        urgency: mergedDiscUrgency,
        freshness: 1.0,
        actionTypeRate: geminiBreakdown.behavioral_rate,
        entityPenalty: 0,
        ...geminiBreakdown,
      },
      relatedSignals: [],
      sourceSignals: d.sourceSignals,
      entityName: d.entityName,
      confidence_prior: Math.round(
        Math.max(45, Math.min(85, geminiBreakdown.behavioral_rate * 100)),
      ),
      discrepancyClass: d.class,
      trigger: d.trigger,
      discrepancyEvidence: d.evidence,
      discrepancyPreferredAction: d.discrepancyPreferredAction,
    });
    diag.discrepancies.push({
      id: d.id,
      class: d.class,
      title: d.title.slice(0, 100),
      entityName: d.entityName,
      score: finalScore,
      stakes: d.stakes,
      urgency: mergedDiscUrgency,
      actionType: d.suggestedActionType,
    });
    logStructuredEvent({
      event: 'discrepancy_candidate_scored',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'scoring',
      details: {
        scope: 'scorer',
        id: d.id,
        class: d.class,
        title: d.title.slice(0, 80),
        score: finalScore,
        score_raw: score,
        recipientless_penalty: isRecipientlessStatistical,
        evidence: d.evidence,
      },
    });
  }

  let insightDiscrepanciesScored = 0;
  for (const insight of insightCandidates) {
    const insightPreSourceSignals: GenerationCandidateSource[] = insight.evidence_signals.map((id) => ({
      kind: 'signal',
      id,
    }));
    if (
      failureSuppressionKeys.size > 0 &&
      scoredLoopMatchesFailureSuppression(
        { id: insight.id, type: 'signal', sourceSignals: insightPreSourceSignals },
        failureSuppressionKeys,
      )
    ) {
      continue;
    }

    const insightAction: ActionType =
      String(insight.suggested_action) === 'research' ? 'make_decision' : (insight.suggested_action as ActionType);

    const insightSup = evaluateSuppressionGoalMatch(
      insight.title,
      insight.content,
      insightAction,
      insight.suggested_entity ?? null,
      suppressionEntities,
      CONTACT_ACTION_TYPES,
    );
    if (insightSup.patternMatched) {
      suppressedCandidates++;
      logStructuredEvent({
        event: insightSup.isSuppressed ? 'candidate_suppressed' : 'candidate_suppression_skipped',
        level: 'info',
        userId,
        artifactType: artifactTypeForAction(insightAction),
        generationStatus: insightSup.isSuppressed ? 'suppressed_by_goal' : 'suppression_skipped_non_contact',
        details: {
          scope: 'scorer',
          candidate_type: 'insight_scan',
          candidate_title: insight.title.slice(0, 100),
          suppression_goal: (insightSup.matchedGoalText ?? '').slice(0, 120),
          action_type: insightAction,
          contact_only: insightSup.contactOnly,
        },
      });
    }
    if (insightSup.isSuppressed) {
      scored.push({
        id: insight.id,
        type: 'discrepancy',
        title: insight.title,
        content: insight.content,
        suggestedActionType: insightAction,
        matchedGoal: null,
        score: 0,
        breakdown: {
          stakes: 0,
          urgency: 0,
          tractability: 0,
          freshness: 1.0,
          actionTypeRate: 0.5,
          entityPenalty: -999,
        },
        relatedSignals: [],
        sourceSignals: insightPreSourceSignals,
        entityName: insight.suggested_entity,
        confidence_prior: 30,
        discrepancyClass: 'behavioral_pattern',
        fromInsightScan: true,
      });
      insightDiscrepanciesScored += 1;
      continue;
    }

    const entityMatch = entities.find(
      (e) =>
        insight.suggested_entity &&
        typeof e.name === 'string' &&
        e.name.toLowerCase() === insight.suggested_entity.toLowerCase(),
    );
    const resolvedEmail =
      insight.suggested_entity_email?.includes('@')
        ? insight.suggested_entity_email
        : (entityMatch?.primary_email as string | undefined) ?? undefined;

    const relationshipContext =
      insight.suggested_action === 'send_message' &&
      insight.suggested_entity &&
      resolvedEmail &&
      resolvedEmail.includes('@')
        ? `${insight.suggested_entity} <${resolvedEmail}> | insight_scan | behavioral pattern`
        : undefined;

    const sourceSignals: GenerationCandidateSource[] = insight.evidence_signals.map((id) => {
      const row = signals.find((s: { id: string }) => String(s.id) === id);
      return {
        kind: 'signal',
        id,
        source: row?.source ? String(row.source) : 'insight_scan',
        occurredAt: row?.occurred_at ? String(row.occurred_at) : undefined,
        summary: row?.content ? String(row.content).slice(0, 200) : '',
      };
    });

    const insightTrigger: TriggerMetadata = {
      baseline_state: "Pattern unnamed in the user's own framing",
      current_state: 'Cross-signal read suggests a recurring behavioral shape',
      delta: insight.title,
      timeframe: 'last_30_days',
      outcome_class: 'relationship',
      why_now: insight.content.slice(0, 400),
    };

    const daysSinceInsightSurface = await getDaysSinceLastSurface(userId, insight.title);
    const insightMlBucket = buildDirectiveMlBucketKey(mlBucketInputsFromInsight(insight));
    const { score: insightScoreRaw, breakdown: insightGeminiBreakdown } = computeCandidateScore({
      stakes: 4,
      urgency: 0.85,
      tractability: 0.8,
      actionType: insightAction,
      entityPenalty: 0,
      daysSinceLastSurface: daysSinceInsightSurface,
      approvalHistory,
      highStakes: true,
      globalPriorRate: globalMlPriors.get(insightMlBucket) ?? null,
    });
    const insightScore = applyLivingGraphScoreMultiplier(
      insightScoreRaw,
      {
        id: insight.id,
        type: 'discrepancy',
        entityName: insight.suggested_entity ?? undefined,
        discrepancyClass: 'behavioral_pattern',
      },
      insight.title.slice(0, 80),
    );

    const relatedFromInsight = insight.evidence_signals.map((id) => {
      const row = signals.find((s: { id: string }) => String(s.id) === id);
      return row?.content ? String(row.content).slice(0, 140) : id;
    });

    scored.push({
      id: insight.id,
      type: 'discrepancy',
      title: insight.title,
      content: insight.content,
      // AZ-24: insight scan must not emit open-ended research rows — frame a decision.
      suggestedActionType: insightAction,
      matchedGoal: null,
      score: insightScore,
      breakdown: {
        stakes: 4,
        urgency: 0.85,
        freshness: 1.0,
        actionTypeRate: insightGeminiBreakdown.behavioral_rate,
        entityPenalty: 0,
        ...insightGeminiBreakdown,
      },
      relatedSignals: relatedFromInsight,
      sourceSignals,
      entityName: insight.suggested_entity,
      relationshipContext,
      confidence_prior: Math.round(Math.max(50, Math.min(90, insight.confidence))),
      discrepancyClass: 'behavioral_pattern',
      trigger: insightTrigger,
      discrepancyEvidence: insight.grounding,
      fromInsightScan: true,
    });

    logStructuredEvent({
      event: 'insight_scan_candidate_scored',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'scoring',
      details: {
        scope: 'scorer',
        id: insight.id,
        score: insightScore,
        pattern_type: insight.pattern_type,
        title: insight.title.slice(0, 80),
      },
    });
    insightDiscrepanciesScored += 1;
  }
  diag.insightDiscrepanciesScored = insightDiscrepanciesScored;

  // -----------------------------------------------------------------------
  // Convergence scoring: candidates that independently corroborate a
  // discrepancy get a cross-signal boost. This is the triangulation engine —
  // when multiple evidence streams (discrepancy + commitment/signal/relationship)
  // point at the same entity or goal, the convergence multiplier surfaces them.
  // -----------------------------------------------------------------------
  const discrepancyEntityNames = new Set<string>();
  const discrepancyGoalTexts = new Set<string>();
  for (const s of scored) {
    if (s.type !== 'discrepancy') continue;
    // Suppressed / zeroed discrepancies must not drive cross-signal convergence boosts.
    if (s.score <= 0) continue;
    if (s.entityName) discrepancyEntityNames.add(s.entityName.toLowerCase());
    if (s.matchedGoal) discrepancyGoalTexts.add(s.matchedGoal.text);
  }

  if (discrepancyEntityNames.size > 0 || discrepancyGoalTexts.size > 0) {
    for (const s of scored) {
      if (s.type === 'discrepancy') continue; // discrepancies don't boost themselves
      let convergenceAxes = 0;
      const convergenceReasons: string[] = [];

      // Axis 1: entity convergence — candidate references same person as a discrepancy
      const candidateEntity = (s.entityName ?? '').toLowerCase();
      if (candidateEntity && discrepancyEntityNames.has(candidateEntity)) {
        convergenceAxes++;
        convergenceReasons.push(`entity:${candidateEntity}`);
      }

      // Axis 2: goal convergence — candidate's matched goal matches a discrepancy's goal
      if (s.matchedGoal && discrepancyGoalTexts.has(s.matchedGoal.text)) {
        convergenceAxes++;
        convergenceReasons.push(`goal:${s.matchedGoal.text.slice(0, 40)}`);
      }

      // Axis 3: content convergence — candidate title/content mentions a discrepancy entity
      if (convergenceAxes === 0) {
        for (const eName of discrepancyEntityNames) {
          const firstName = eName.split(/\s+/)[0];
          if (firstName && firstName.length >= 3 && s.title.toLowerCase().includes(firstName)) {
            convergenceAxes++;
            convergenceReasons.push(`content:${firstName}`);
            break;
          }
        }
      }

      if (convergenceAxes > 0) {
        const boost = convergenceAxes >= 2 ? 1.50 : 1.35;
        s.score *= boost;
        diag.convergenceBoosts.push({ candidateId: s.id, title: s.title.slice(0, 80), axes: convergenceAxes, reasons: [...convergenceReasons], boost, boostedScore: s.score });
        logStructuredEvent({
          event: 'convergence_boost',
          level: 'info',
          userId,
          artifactType: null,
          generationStatus: 'scoring',
          details: {
            scope: 'scorer',
            candidate_title: s.title.slice(0, 80),
            convergence_axes: convergenceAxes,
            reasons: convergenceReasons,
            boost,
            boosted_score: s.score,
          },
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Goal-gap multiplier: candidates that directly address the highest-gap
  // goal (stated high priority, near-zero behavioral activity) get a 1.5x
  // boost. This ensures the scorer surfaces goal-aligned candidates, not
  // just high-signal ones.
  // -----------------------------------------------------------------------

  // Build a lightweight gap map from signals already fetched
  const goalGapMap = new Map<string, { priority: number; signalCount: number }>();
  for (const g of goals) {
    const gkws = goalKeywords(g.goal_text);
    let gSignalCount = 0;
    for (const s of signals) {
      const text = (s.content as string ?? '').toLowerCase();
      const matchCount = gkws.filter((kw: string) => text.includes(kw)).length;
      if (matchCount >= Math.min(2, gkws.length)) gSignalCount++;
    }
    goalGapMap.set(g.goal_text, { priority: g.priority, signalCount: gSignalCount });
  }

  // Find the highest-gap goal: highest priority with lowest signal count
  let highestGapGoal: { text: string; gapScore: number } | null = null;
  for (const [text, { priority, signalCount }] of goalGapMap) {
    // Gap score: inverted priority weight (P1=5, P5=1) * inverse of signal activity
    const gapScore = (6 - priority) * (1 / (1 + signalCount));
    if (!highestGapGoal || gapScore > highestGapGoal.gapScore) {
      highestGapGoal = { text, gapScore };
    }
  }

  // Apply 1.5x boost to candidates matching the highest-gap goal
  if (highestGapGoal) {
    for (const s of scored) {
      if (s.matchedGoal && s.matchedGoal.text === highestGapGoal.text) {
        s.score *= 1.5;
        logStructuredEvent({
          event: 'goal_gap_boost',
          level: 'info',
          userId,
          artifactType: null,
          generationStatus: 'scoring',
          details: {
            scope: 'scorer',
            candidate_title: s.title.slice(0, 80),
            gap_goal: highestGapGoal.text.slice(0, 80),
            gap_score: highestGapGoal.gapScore,
            boosted_score: s.score,
          },
        });
      }
    }
  }

  // Goal-primacy gate: hard drop any non-emergent candidate with no goal anchor.
  // Emergent patterns (anti-patterns, divergences) are exempt — they ARE goal diagnosis.
  // Everything else must connect to a stated goal before competing.
  const beforeGoalGate = scored.length;
  const goalGateDrops: ScorerDropEntry[] = [];
  const goalGateKept: typeof scored = [];
  for (const s of scored) {
    if (
      s.matchedGoal !== null
      || s.type === 'emergent'
      || s.type === 'discrepancy'
      || s.type === 'hunt'
      || isGoalPrimacyExemptCareerCommitment(s)
      || isGoalPrimacyExemptInterviewWriteDocument(s)
    ) {
      goalGateKept.push(s);
    } else {
      goalGateDrops.push({ candidateId: s.id, type: s.type, title: s.title.slice(0, 100), stage: 'goal_primacy_gate', reason: 'no_goal_match', score: s.score });
    }
  }
  scored = goalGateKept;
  diag.filterStages.push({ stage: 'goal_primacy_gate', before: beforeGoalGate, after: scored.length, dropped: goalGateDrops });
  if (scored.length < beforeGoalGate) {
    logStructuredEvent({
      event: 'scorer_goal_primacy_gate',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'scoring',
      details: {
        scope: 'scorer',
        dropped: beforeGoalGate - scored.length,
        remaining: scored.length,
      },
    });
  }

  // Exclude emergent candidates with no goal anchor — they will
  // always fail the Discrepancy Engine gate (no_thread, no_outcome)
  // and block real candidates from being selected.
  const beforeEmergentFilter = scored.length;
  const emergentDrops: ScorerDropEntry[] = [];
  scored = scored.filter((candidate) => {
    if (candidate.type === 'emergent' && !candidate.matchedGoal) {
      logStructuredEvent({
        event: 'emergent_candidate_filtered',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'scoring',
        details: {
          scope: 'scorer',
          id: candidate.id,
          reason: 'no_goal_anchor_will_fail_discrepancy_gate',
          score: candidate.score,
        },
      });
      emergentDrops.push({ candidateId: candidate.id, type: candidate.type, title: candidate.title.slice(0, 100), stage: 'emergent_no_goal_filter', reason: 'no_goal_anchor', score: candidate.score });
      return false;
    }
    return true;
  });
  diag.filterStages.push({ stage: 'emergent_no_goal_filter', before: beforeEmergentFilter, after: scored.length, dropped: emergentDrops });

  // -----------------------------------------------------------------------
  // Hunt anomalies — absence / cross-signal patterns (decrypted signals in-process only).
  // Score 999; try up to 3 findings skipping locked contacts. Before ranking invariants.
  // -----------------------------------------------------------------------
  {
    const huntResult = runHuntAnomalies({
      signals: signals.map((signal) => ({
        ...signal,
        type: signal.type ?? '',
      })),
      commitments,
      selfEmails,
      blockedSenderEmails: gateBlockedSenderEmails,
      trustedSenderEmails: trustedEntityEmails,
    });

    let skippedLocked = 0;
    const loopsToAdd: ScoredLoop[] = [];
    for (const f of huntResult.findings) {
      if (huntFindingBlockedByLock(f, lockedContactNormalizedKeys)) {
        skippedLocked++;
        continue;
      }
      const huntLoop = huntFindingToScoredLoop(f);
      if (
        failureSuppressionKeys.size > 0 &&
        scoredLoopMatchesFailureSuppression(huntLoop, failureSuppressionKeys)
      ) {
        continue;
      }
      const huntSup = evaluateSuppressionGoalMatch(
        huntLoop.title,
        huntLoop.content,
        huntLoop.suggestedActionType,
        huntLoop.entityName,
        suppressionEntities,
        CONTACT_ACTION_TYPES,
      );
      if (huntSup.patternMatched) {
        suppressedCandidates++;
        logStructuredEvent({
          event: huntSup.isSuppressed ? 'candidate_suppressed' : 'candidate_suppression_skipped',
          level: 'info',
          userId,
          artifactType: artifactTypeForAction(huntLoop.suggestedActionType),
          generationStatus: huntSup.isSuppressed ? 'suppressed_by_goal' : 'suppression_skipped_non_contact',
          details: {
            scope: 'scorer',
            candidate_type: 'hunt',
            candidate_title: huntLoop.title.slice(0, 100),
            suppression_goal: (huntSup.matchedGoalText ?? '').slice(0, 120),
            action_type: huntLoop.suggestedActionType,
            contact_only: huntSup.contactOnly,
          },
        });
      }
      if (huntSup.isSuppressed) {
        loopsToAdd.push({
          ...huntLoop,
          score: 0,
          breakdown: {
            ...huntLoop.breakdown,
            entityPenalty: -999,
            final_score: 0,
          },
        });
      } else {
        loopsToAdd.push(huntLoop);
      }
      if (loopsToAdd.length >= 3) break;
    }
    for (const hLoop of loopsToAdd) {
      scored.push(hLoop);
    }
    diag.huntAnomalies = {
      countsByKind: { ...huntResult.countsByKind },
      injected: loopsToAdd.length,
      skippedLocked,
      candidateTitles: loopsToAdd.map((l) => l.title.slice(0, 100)),
    };
    if (loopsToAdd.length > 0 || skippedLocked > 0) {
      logStructuredEvent({
        event: 'hunt_anomalies_injected',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'scoring',
        details: {
          scope: 'scorer',
          injected: loopsToAdd.length,
          skipped_locked: skippedLocked,
          counts: huntResult.countsByKind,
        },
      });
    }
  }

  // Ranking invariant enforcement
  // Hard-block weak/obvious/repeated/non-decision-moving candidates and
  // force discrepancy preference when both discrepancy + task classes exist.
  const preInvariantCount = scored.length;
  const invariantResult = applyRankingInvariants(scored);
  scored = invariantResult.ranked;
  const invariantRejected = invariantResult.diagnostics.filter((d) => d.hardRejectReasons.length > 0).length;
  const invariantPenalized = invariantResult.diagnostics.filter((d) => d.penaltyReasons.length > 0).length;
  const invariantDrops: ScorerDropEntry[] = invariantResult.diagnostics
    .filter(d => d.hardRejectReasons.length > 0)
    .map(d => {
      const s = scored.find(c => c.id === d.id) ?? invariantResult.ranked.find(c => c.id === d.id);
      return { candidateId: d.id, type: s?.type ?? 'unknown', title: s?.title?.slice(0, 100) ?? d.id, stage: 'ranking_invariants', reason: d.hardRejectReasons.join(', '), score: d.adjustedScore };
    });
  diag.filterStages.push({ stage: 'ranking_invariants', before: preInvariantCount, after: scored.filter(s => s.score > 0).length, dropped: invariantDrops });
  if (invariantRejected > 0 || invariantPenalized > 0) {
    logStructuredEvent({
      event: 'ranking_invariant_enforced',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'scoring',
      details: {
        scope: 'scorer',
        rejected: invariantRejected,
        penalized: invariantPenalized,
        total: invariantResult.diagnostics.length,
      },
    });
  }

  // -----------------------------------------------------------------------
  // NO_VALID_ACTION gate
  //
  // Any candidate with score ≤ SCORED_MIN_THRESHOLD is effectively zeroed
  // (suppressed by entity penalty, suppression goals, or validity filter).
  // If no candidate clears the bar, return structured no_valid_action — never null.
  //
  // Captures:
  //   - previously-skipped identical directives (same entity + action type
  //     + goal anchor → suppression_multiplier ≈ 0 from entity penalty)
  //   - all-suppressed pools (every candidate matched a suppression goal)
  //   - pools where validity filter removed every real candidate
  // -----------------------------------------------------------------------

  const SCORED_MIN_THRESHOLD = 0.001;

  // Build survivors and final-gate drops for diagnostics
  const finalGateDrops: ScorerDropEntry[] = [];
  for (const s of scored) {
    const reasons = getInvariantFailureReasons(s);
    const survivor: ScorerSurvivorEntry = {
      candidateId: s.id, type: s.type, title: s.title.slice(0, 120), score: s.score,
      breakdown: s.breakdown, matchedGoal: s.matchedGoal?.text?.slice(0, 80) ?? null,
      entityName: s.entityName, lifecycle: s.lifecycle,
      invariantReasons: reasons, discrepancyClass: s.discrepancyClass,
    };
    if (s.score <= SCORED_MIN_THRESHOLD) {
      finalGateDrops.push({ candidateId: s.id, type: s.type, title: s.title.slice(0, 100), stage: 'final_gate', reason: `score_below_threshold (${s.score})`, score: s.score });
    } else if (reasons.length > 0) {
      finalGateDrops.push({ candidateId: s.id, type: s.type, title: s.title.slice(0, 100), stage: 'final_gate', reason: `invariant_fail: ${reasons.join(', ')}`, score: s.score });
    } else {
      diag.survivors.push(survivor);
    }
  }
  diag.filterStages.push({ stage: 'final_gate', before: scored.length, after: scored.length - finalGateDrops.length, dropped: finalGateDrops });

  const validScoredCandidates = scored.filter(
    (c) => c.score > SCORED_MIN_THRESHOLD && passesTop3RankingInvariants(c),
  );

  // Opt-in only: skew ranking toward decay/reconnect for local experiments.
  // Default off so production and brain-receipt reflect true scorer ordering.
  if (process.env.SCORER_FORCE_DECAY_WINNER === 'true') {
    const decayCandidates = validScoredCandidates.filter(
      (c) =>
        c.discrepancyClass === 'decay' ||
        c.type === 'relationship' ||
        (c.title?.toLowerCase().includes('reconnect') ?? false) ||
        (c.title?.toLowerCase().includes('follow up') ?? false),
    );
    if (decayCandidates.length > 0) {
      const forced = decayCandidates[0];
      forced.score = 999;
      validScoredCandidates.sort(compareScoredLoops);
      console.log('[FORCE-DECAY] Forcing candidate:', forced.title);
    }
  }

  if (validScoredCandidates.length === 0) {
    diag.finalOutcome = 'no_valid_action';
    logStructuredEvent({
      event: 'no_valid_action',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'no_valid_candidates',
      details: {
        scope: 'scorer',
        reason: 'all_candidates_invalid_or_rejected_by_ranking_invariants',
        total_scored: scored.length,
        below_threshold: scored.filter((c) => c.score <= SCORED_MIN_THRESHOLD).length,
        failed_invariants: scored.filter((c) => !passesTop3RankingInvariants(c)).length,
        threshold: SCORED_MIN_THRESHOLD,
      },
    });
    const exactBlocker = buildNoValidActionFinalGateExactBlocker(scored, suppressionEntities, diag);
    return wrapNoValidActionResult({
      antiPatterns,
      divergences,
      scored,
      suppressedCandidates,
      candidateDiscovery: buildCandidateDiscoveryLogForNoWinner(
        scored,
        suppressedCandidates,
        exactBlocker.blocker_reason,
        diag,
      ),
      exact_blocker: exactBlocker,
    });
  }

  const winner = validScoredCandidates[0];

  // Populate final winner diagnostic
  diag.finalOutcome = 'winner_selected';
  diag.winnerSourceAuthority = getCandidateSourceAuthority(winner);
  diag.interviewClusterInputs = getInterviewClusterInputSummaries(winner);
  diag.finalWinner = {
    candidateId: winner.id, type: winner.type, title: winner.title.slice(0, 120), score: winner.score,
    breakdown: winner.breakdown, matchedGoal: winner.matchedGoal?.text?.slice(0, 80) ?? null,
    entityName: winner.entityName, lifecycle: winner.lifecycle,
    invariantReasons: [], discrepancyClass: winner.discrepancyClass,
  };

  // Build deprioritized loops: top 3 runner-ups with kill reasons
  const runnerUps = validScoredCandidates.slice(1, 4);
  const deprioritized = runnerUps.map(loop => classifyKillReason(loop, winner.score));

  logStructuredEvent({
    event: 'scorer_selected',
    userId,
    artifactType: artifactTypeForAction(winner.suggestedActionType),
    generationStatus: 'candidate_scored',
    details: {
      scope: 'scorer',
      candidate_count: scored.length,
      deprioritized_count: deprioritized.length,
      winner_type: winner.type,
    },
  });

  return {
    outcome: 'winner_selected',
    winner,
    // Generator viability can disqualify #1 (e.g. schedule_conflict write_document). Keep a deeper
    // shortlist so goal-salient interview-class write_document runners-up still compete with decay sends.
    topCandidates: validScoredCandidates.slice(0, 10),
    deprioritized,
    candidateDiscovery: buildCandidateDiscoveryLog(winner, scored, suppressedCandidates, null, diag),
    antiPatterns,
    divergences,
    exact_blocker: null,
  };
}

export async function computeUserState(userId: string): Promise<{
  state: 'waiting' | 'execution' | 'active';
  pendingCount: number;
  approvalRate: number;
  lastDirectiveAgeHours: number;
}> {
  const supabase = createServerClient();
  const sevenDaysAgo = new Date(Date.now() - daysMs(7)).toISOString();

  const { data: recentActions } = await supabase
    .from('tkg_actions')
    .select('status, generated_at')
    .eq('user_id', userId)
    .gte('generated_at', sevenDaysAgo)
    .order('generated_at', { ascending: false });

  const actions = recentActions ?? [];
  const pending = actions.filter(a => a.status === 'pending_approval');
  const approved = actions.filter(a => a.status === 'executed');
  const total = actions.length;
  const approvalRate = total > 0 ? approved.length / total : 0;
  const lastDirectiveAgeHours = actions.length > 0
    ? (Date.now() - new Date(actions[0].generated_at).getTime()) / (1000 * 60 * 60)
    : Infinity;

  let state: 'waiting' | 'execution' | 'active' = 'active';
  if (pending.length >= 3) {
    state = 'waiting';
  } else if (approvalRate > 0.3 && lastDirectiveAgeHours < 24) {
    state = 'execution';
  }

  return { state, pendingCount: pending.length, approvalRate, lastDirectiveAgeHours };
}
