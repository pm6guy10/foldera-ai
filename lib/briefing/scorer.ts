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
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { daysMs } from '@/lib/config/constants';
import type {
  ActionType,
  CandidateScoreBreakdown,
  GenerationCandidateDiscoveryLog,
  GenerationCandidateLog,
  GenerationCandidateSource,
} from './types';
import { detectDiscrepancies } from './discrepancy-detector';

// ---------------------------------------------------------------------------
// Self-referential signal filter — excludes Foldera's own directive outputs
// ---------------------------------------------------------------------------

function isSelfReferentialSignal(content: string): boolean {
  return content.startsWith('[Foldera Directive') || content.startsWith('[Foldera \u00b7 20');
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

const DUPLICATE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'have', 'will', 'your',
  'about', 'after', 'before', 'just', 'quick', 'update', 'send', 'write', 'follow', 'check',
]);

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
  type: 'commitment' | 'signal' | 'relationship' | 'emergent' | 'compound' | 'growth' | 'discrepancy';
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

export interface ScorerResult {
  winner: ScoredLoop;
  /**
   * Top 3 raw scored candidates (winner + up to 2 runner-ups) before kill-reason
   * classification. Used by the generator's viability competition pass so it can
   * pick a different final winner when the top scorer is less executable.
   */
  topCandidates: ScoredLoop[];
  deprioritized: DeprioritizedLoop[];
  candidateDiscovery: GenerationCandidateDiscoveryLog;
  /** Anti-patterns detected regardless of whether they won scoring */
  antiPatterns: AntiPattern[];
  /** Revealed-preference divergences detected regardless of whether they won scoring */
  divergences: RevealedGoalDivergence[];
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

    const filteredActions = (recentActions ?? []).filter((action) => !isInternalNoSend(action.execution_result));
    if (filteredActions.length === 0) return 1.0;

    // Count how many recent directives are similar (keyword overlap)
    const titleWords = new Set(
      loopTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 4),
    );
    if (titleWords.size === 0) return 1.0;

    let similarCount = 0;
    let anySkipped = false;
    for (const a of filteredActions) {
      const dirText = (a.directive_text as string ?? '').toLowerCase();
      const overlap = [...titleWords].filter(w => dirText.includes(w)).length;
      if (overlap >= 2 || (overlap >= 1 && titleWords.size <= 2)) {
        similarCount++;
        if (a.status === 'skipped' || a.status === 'draft_rejected') {
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
  const fourteenDaysAgo = new Date(Date.now() - daysMs(14)).toISOString();

  const names = extractPersonNames(`${candidateTitle} ${candidateContent}`);
  if (names.length === 0) return 0;

  try {
    // --- Check 1: Has user already sent an email to this entity? ---
    const { data: sentSignals } = await supabase
      .from('tkg_signals')
      .select('content')
      .eq('user_id', userId)
      .eq('type', 'email_sent')
      .gte('occurred_at', fourteenDaysAgo)
      .limit(30);

    if (sentSignals && sentSignals.length > 0) {
      for (const name of names) {
        const firstName = name.split(' ')[0].toLowerCase();
        if (firstName.length < 3) continue;
        for (const sig of sentSignals) {
          const dec = decryptWithStatus(sig.content as string ?? '');
          if (dec.usedFallback) continue;
          if (dec.plaintext.toLowerCase().includes(firstName)) {
            // User already emailed this person — this candidate is not novel
            return -30;
          }
        }
      }
    }

    // --- Check 2: 2+ consecutive skips = user already considered this ---
    const { data: recentActions } = await supabase
      .from('tkg_actions')
      .select('directive_text, status')
      .eq('user_id', userId)
      .gte('generated_at', thirtyDaysAgo)
      .in('status', ['approved', 'executed', 'skipped', 'draft_rejected', 'rejected'])
      .order('generated_at', { ascending: false })
      .limit(100);

    if (!recentActions || recentActions.length === 0) return 0;

    for (const name of names) {
      const firstName = name.split(' ')[0].toLowerCase();
      if (firstName.length < 3) continue;

      const entityActions = recentActions.filter((a) =>
        (a.directive_text as string ?? '').toLowerCase().includes(firstName),
      );

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
      wTotal += weight;
      if (action.status === 'approved') wSuccess += weight;
    }
    const computed = wTotal > 0 ? (wSuccess / wTotal) : 0.5;
    const blended = n < 5 ? 0.5 : n < 15 ? (((n - 5) / 10) * computed) + ((15 - n) / 10 * 0.5) : computed;

    // Cold-start prior: blend with 0.50 prior weighted by 10 virtual observations.
    // When n < 10, the prior dominates; as n grows, actual data takes over.
    rate = (blended * n + 0.50 * 10) / (n + 10);
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
  const exec = (2 * uEff * t) / (uEff + t);

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
      .select('action_type, status, generated_at, feedback_weight')
      .eq('user_id', userId)
      .gte('generated_at', thirtyDaysAgo)
      .in('status', ['approved', 'executed', 'skipped', 'draft_rejected', 'rejected'])
      .order('generated_at', { ascending: false })
      .limit(200);

    // Exclude pre-rewrite noise: actions with feedback_weight = 0 were from
    // the old generator era and should not poison the behavioral rate.
    return (data ?? [])
      .filter(a => (a.feedback_weight as number ?? 1) !== 0)
      .map(a => ({
        action_type: a.action_type as string,
        status: ((a.status as string) === 'executed' ? 'approved'
          : (a.status as string) === 'draft_rejected' ? 'rejected'
          : a.status) as 'approved' | 'skipped' | 'rejected',
        created_at: a.generated_at as string,
        commitment_id: null, // tkg_actions has no commitment_id column
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

    const filteredActions = (recentActions ?? []).filter(
      (action) => !isInternalNoSend(action.execution_result),
    );
    if (filteredActions.length === 0) return 0;

    const titleWords = new Set(
      candidateTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 4),
    );
    if (titleWords.size === 0) return 0;

    // Find the most recent matching action
    for (const a of filteredActions) {
      const dirText = (a.directive_text as string ?? '').toLowerCase();
      const overlap = [...titleWords].filter(w => dirText.includes(w)).length;
      if (overlap >= 2 || (overlap >= 1 && titleWords.size <= 2)) {
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

async function enrichRelationshipContext(
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
    const { data: signals } = await supabase
      .from('tkg_signals')
      .select('content, source, occurred_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', thirtyDaysAgo)
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (signals && signals.length > 0) {
      const nameLower = entityName.toLowerCase();
      const firstName = nameLower.split(/\s+/)[0];
      let skippedRows = 0;
      const mentioning = signals
        .map((signal: any) => {
          const decrypted = decryptWithStatus(signal.content as string ?? '');
          if (decrypted.usedFallback) {
            skippedRows++;
            return null;
          }

          if (isSelfReferentialSignal(decrypted.plaintext)) return null;
          const lower = decrypted.plaintext.toLowerCase();
          if (!lower.includes(nameLower) && !lower.includes(firstName)) return null;

          return {
            occurred_at: signal.occurred_at,
            content: decrypted.plaintext,
          };
        })
        .filter((signal): signal is { occurred_at: string; content: string } => signal !== null)
        .slice(0, 3);

      logDecryptSkip(userId, 'scorer:relationship_context', skippedRows);

      if (mentioning.length > 0) {
        parts.push('Recent mentions:');
        for (const signal of mentioning) {
          const date = (signal.occurred_at ?? '').slice(0, 10);
          parts.push(`  [${date}] ${signal.content.slice(0, 300)}`);
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

function inferActionType(text: string, loopType: 'commitment' | 'signal' | 'relationship'): ActionType {
  if (loopType === 'relationship') return 'send_message';

  const lower = text.toLowerCase();
  if (/\b(email|reply|respond|send|follow.?up|reach out|contact)\b/.test(lower)) return 'send_message';
  if (/\b(decide|decision|choose|option|weigh)\b/.test(lower)) return 'make_decision';
  if (/\b(schedule|calendar|meeting|call|appointment)\b/.test(lower)) return 'schedule';
  if (/\b(research|investigate|look into|find out)\b/.test(lower)) return 'research';
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
  if (candidate.type === 'discrepancy') density += 1;
  return density;
}

function isObviousFirstLayerAdvice(candidate: ScoredLoop): boolean {
  const combined = `${candidate.title}\n${candidate.content}`.trim();
  return OBVIOUS_FIRST_LAYER_PATTERNS.some((pattern) => pattern.test(combined));
}

function isOutcomeLinkedCandidate(candidate: ScoredLoop): boolean {
  if (candidate.type === 'discrepancy') return true;
  if (candidate.matchedGoal) return true;
  const combined = `${candidate.title} ${candidate.content}`;
  return OUTCOME_SIGNAL_PATTERNS.some((pattern) => pattern.test(combined));
}

function isDecisionMovingCandidate(candidate: ScoredLoop): boolean {
  if (!isOutcomeLinkedCandidate(candidate)) return false;
  if (candidate.type === 'discrepancy') return true;
  return (candidate.breakdown.stakes ?? 0) >= 2 || (candidate.breakdown.urgency ?? 0) >= 0.6;
}

function getInvariantFailureReasons(candidate: ScoredLoop): string[] {
  const lifecycle = candidate.lifecycle;
  const actionableNow = lifecycle
    ? lifecycle.state === 'active_now' && lifecycle.actionability === 'actionable'
    : candidate.score > 0;
  const reasons: string[] = [];
  const obviousAdvice = isObviousFirstLayerAdvice(candidate);
  const routineMaintenance = isNoiseCandidateText(candidate.title, candidate.content);
  const evidenceDensity = computeEvidenceDensity(candidate);
  const alreadyKnown = (candidate.breakdown.freshness ?? 1) <= 0.35 || (candidate.breakdown.entityPenalty ?? 0) <= -20;

  if (!actionableNow) reasons.push('non_actionable');
  if (!isSendOrWriteCapableAction(candidate.suggestedActionType)) reasons.push('not_send_or_write_capable');
  if (!isDecisionMovingCandidate(candidate)) reasons.push('not_decision_moving');
  if (routineMaintenance) reasons.push('routine_maintenance');
  if (obviousAdvice) reasons.push('obvious_first_layer_advice');
  if (alreadyKnown) reasons.push('already_known_pattern');
  if (evidenceDensity < 2) reasons.push('weak_evidence_density');
  return reasons;
}

export function passesTop3RankingInvariants(candidate: ScoredLoop): boolean {
  return getInvariantFailureReasons(candidate).length === 0;
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
  const qualifiedDiscrepancies = ranked.filter(
    (candidate) => candidate.type === 'discrepancy' && candidate.score > 0 && passesTop3RankingInvariants(candidate),
  );

  if (qualifiedDiscrepancies.length > 0) {
    for (const candidate of ranked) {
      if (candidate.score <= 0) continue;
      const diag = ensureDiagnostic(candidate);
      if (candidate.type === 'discrepancy') {
        candidate.score *= 1.2;
        diag.penaltyReasons.push('discrepancy_priority_boost');
        continue;
      }
      const strongOutcomeCommitment =
        candidate.type === 'commitment'
        && candidate.breakdown.stakes >= 3
        && candidate.breakdown.urgency >= 0.6
        && computeEvidenceDensity(candidate) >= 3;
      const penalty = strongOutcomeCommitment ? 0.88 : 0.55;
      candidate.score *= penalty;
      diag.penaltyReasons.push(strongOutcomeCommitment
        ? 'discrepancy_priority_softened_task_penalty'
        : 'discrepancy_priority_task_penalty');
    }

    const topDiscrepancy = ranked
      .filter((candidate) => candidate.type === 'discrepancy' && candidate.score > 0)
      .sort(compareScoredLoops)[0];
    const topNonDiscrepancy = ranked
      .filter((candidate) => candidate.type !== 'discrepancy' && candidate.score > 0)
      .sort(compareScoredLoops)[0];

    if (
      topDiscrepancy
      && topNonDiscrepancy
      && topDiscrepancy.score <= topNonDiscrepancy.score
    ) {
      topDiscrepancy.score = topNonDiscrepancy.score + 0.001;
      ensureDiagnostic(topDiscrepancy).penaltyReasons.push('discrepancy_priority_forced_over_task');
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
      .select('content, source, type, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', fourteenDaysAgo)
      .eq('processed', true)
      .order('occurred_at', { ascending: false })
      .limit(500),
    supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category, source')
      .eq('user_id', userId)
      .gte('priority', 1)
      .order('priority', { ascending: false })
      .limit(20),
  ]);

  const signals = signalsRes.data ?? [];
  const PLACEHOLDER_SOURCES_RG = new Set(['onboarding_bucket', 'onboarding_marker']);
  const goals = ((goalsRes.data ?? []) as Array<GoalRow & { source?: string }>)
    .filter((g) => !PLACEHOLDER_SOURCES_RG.has(g.source ?? '')) as GoalRow[];
  const goalKeywordIndex = buildGoalKeywordIndex(goals);

  if (signals.length < 10 || goals.length === 0 || goalKeywordIndex.size === 0) return [];

  // Step 1: Calculate Signal_Density per domain
  const domainSignalCounts: Record<string, { count: number; signals: string[] }> = {};
  let totalClassified = 0;

  let skippedRows = 0;
  for (const s of signals) {
    const decrypted = decryptWithStatus(s.content as string ?? '');
    if (decrypted.usedFallback) {
      skippedRows++;
      continue;
    }
    const content = decrypted.plaintext;
    if (content.length < 20) continue;
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

  logDecryptSkip(userId, 'scorer:revealed_goals', skippedRows);

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
        .select('id, content, source, type, occurred_at')
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
        .gte('priority', 1)
        .order('priority', { ascending: false })
        .limit(20),
    ]);

    const actions = actionsRes.data ?? [];
    const signals = signalsRes.data ?? [];
    const commitments = commitmentsRes.data ?? [];
    const PLACEHOLDER_SOURCES_AP = new Set(['onboarding_bucket', 'onboarding_marker']);
    const goals = ((goalsRes.data ?? []) as Array<GoalRow & { source?: string }>)
      .filter((g) => !PLACEHOLDER_SOURCES_AP.has(g.source ?? '')) as GoalRow[];
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
      let skippedRows = 0;

      for (const s of signals) {
        const decrypted = decryptWithStatus(s.content as string ?? '');
        if (decrypted.usedFallback) {
          skippedRows++;
          continue;
        }
        const content = decrypted.plaintext;
        if (content.length < 20) continue;
        if (isSelfReferentialSignal(content)) continue;

        const domain = inferGoalCategory(content, goalKeywordIndex) ?? 'other';
        if (domain === 'other') continue;

        if (!domainBuckets[domain]) domainBuckets[domain] = { count: 0, signals: [] };
        domainBuckets[domain].count++;
        if (domainBuckets[domain].signals.length < 5) {
          domainBuckets[domain].signals.push(content.slice(0, 150));
        }
      }

      logDecryptSkip(userId, 'scorer:anti_patterns', skippedRows);

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
            suggestedActionType: 'research',
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
): GenerationCandidateDiscoveryLog {
  const topCandidates = scored.slice(0, 5);
  const selection = buildSelectionReason(winner, topCandidates[1]);

  const rankedCandidates: GenerationCandidateLog[] = topCandidates.map((candidate, index) => {
    const isWinner = candidate.id === winner.id;
    const decisionReason = isWinner
      ? selection.reason
      : `Rejected because ${classifyKillReason(candidate, winner.score).killExplanation}`;

    return {
      id: candidate.id,
      rank: index + 1,
      candidateType: candidate.type,
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

  if (stakes <= 1.5 && urgency >= 0.5) {
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
  'completed', 'already sent', 'already done', 'closed',
  'rejected the offer', 'declined the offer', 'turned down the offer',
];

interface ValidityRejection {
  reason: 'rejection_signal_detected' | 'commitment_appears_resolved' | 'historically_avoided';
  detail: string;
}

async function filterInvalidContext(
  userId: string,
  candidatePool: Array<{ id: string; type: string; title: string; content: string }>,
  processedSignals: Array<{ content: string; type?: string; occurred_at?: string }>,
): Promise<Map<string, ValidityRejection>> {
  const rejected = new Map<string, ValidityRejection>();
  if (candidatePool.length === 0) return rejected;

  const supabase = createServerClient();
  const sixtyDaysAgo = new Date(Date.now() - daysMs(60)).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();
  const sevenDaysAgo = new Date(Date.now() - daysMs(7)).toISOString();

  let rejectionTexts: string[] = [];
  let recentAllActions: Array<{ directive_text: string; status: string; generated_at: string }> = [];

  try {
    const [rejectionRes, actionsRes] = await Promise.all([
      supabase
        .from('tkg_signals')
        .select('content')
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

    rejectionTexts = (rejectionRes.data ?? []).flatMap((s) => {
      const dec = decryptWithStatus(s.content as string ?? '');
      if (dec.usedFallback) return [];
      return [dec.plaintext.toLowerCase()];
    });

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
    const names = extractPersonNames(`${c.title} ${c.content}`);
    if (names.length === 0) continue;

    for (const name of names) {
      const firstName = name.split(' ')[0].toLowerCase();
      if (firstName.length < 3) continue;

      // --- Check 1: explicit rejection signal names this entity ---
      if (rejectionTexts.some((text) => text.includes(firstName))) {
        rejected.set(c.id, {
          reason: 'rejection_signal_detected',
          detail: `rejection signal matches entity "${firstName}"`,
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
            matched_entity: firstName,
          },
        });
        break;
      }

      // --- Check 2: recent signals show this commitment is resolved ---
      if (c.type === 'commitment') {
        const resolved = recentResolutionTexts.some(
          (text) =>
            text.includes(firstName) &&
            RESOLUTION_KEYWORDS.some((kw) => text.includes(kw)),
        );
        if (resolved) {
          rejected.set(c.id, {
            reason: 'commitment_appears_resolved',
            detail: `resolution keyword found in recent signal for entity "${firstName}"`,
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
              matched_entity: firstName,
            },
          });
          break;
        }
      }

      // --- Check 3: 3+ consecutive skips = definitively avoided ---
      // Walk the most-recent-first action list for this entity.
      // Any non-skip breaks the streak (user re-engaged after skipping).
      const entityActions = recentAllActions.filter((a) =>
        a.directive_text.toLowerCase().includes(firstName),
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
          detail: `${consecutiveSkips} consecutive skips for entity "${firstName}" in last 30 days`,
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
            matched_entity: firstName,
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
function classifyLifecycle(args: {
  urgency: number;
  stakes: number;
  tractability: number;
  entityPenalty: number;
  hasRecentSignal: boolean;
}): CandidateLifecycle {
  const { urgency, stakes, tractability, entityPenalty, hasRecentSignal } = args;

  // Time horizon
  let horizon: TimeHorizon;
  if (urgency >= 0.70) horizon = 'now';
  else if (urgency >= 0.40) horizon = 'near_term';
  else if (urgency >= 0.15) horizon = 'later';
  else horizon = 'never';

  // Actionability
  let actionability: Actionability;
  if (stakes < 2) {
    actionability = 'archive_only';
  } else if (tractability >= 0.35 && urgency >= 0.25) {
    actionability = 'actionable';
  } else {
    actionability = 'hold_only';
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

export async function scoreOpenLoops(userId: string): Promise<ScorerResult | null> {
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

  // Parallel data fetch
  const [commitmentsRes, signalsRes, entitiesRes, goalsRes] = await Promise.all([
    // Open commitments (last 14 days or no deadline), excluding user-suppressed ones
    supabase
      .from('tkg_commitments')
      .select('id, description, category, status, risk_score, due_at, implied_due_at, source_context, updated_at, trust_class')
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
      .select('id, content, source, occurred_at, author, type')
      .eq('user_id', userId)
      .gte('occurred_at', oneHundredEightyDaysAgo)
      .eq('processed', true)
      .order('occurred_at', { ascending: false })
      .limit(200),

    // Entities — both cooling (>14d) and active relationships
    // Active relationships provide context; cooling ones surface re-engagement
    supabase
      .from('tkg_entities')
      .select('id, name, last_interaction, total_interactions, patterns, trust_class')
      .eq('user_id', userId)
      .in('trust_class', ['trusted', 'unclassified'])
      .neq('name', 'self')
      .order('total_interactions', { ascending: false })
      .limit(30),

    // Active goals — P1 = most important, load all priorities
    supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category, source')
      .eq('user_id', userId)
      .order('priority', { ascending: true })
      .limit(20),
  ]);

  const commitments = commitmentsRes.data ?? [];

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
  }

  let scoringDecryptSkips = 0;
  const signals = (signalsRes.data ?? [])
    .map((signal: any) => {
      const decrypted = decryptWithStatus(signal.content as string ?? '');
      if (decrypted.usedFallback) {
        scoringDecryptSkips++;
        return null;
      }

      return {
        ...signal,
        content: decrypted.plaintext,
      };
    })
    .filter((signal: any) => signal && !isSelfReferentialSignal(signal.content));
  const entities = entitiesRes.data ?? [];
  // Filter out onboarding placeholder goals — only extracted, manual, and onboarding_stated goals feed the scorer
  const PLACEHOLDER_GOAL_SOURCES = new Set(['onboarding_bucket', 'onboarding_marker']);
  // Also filter out any constraint-note rows that slipped into the scoring pool with priority >= 3.
  // These should live at priority 1-2 as suppression goals; if miscategorized they corrupt scoring.
  const CONSTRAINT_NOTE_PREFIX = /^(DO NOT|Check |Reference slate|Build Foldera in overflow)/i;
  const goals = ((goalsRes.data ?? []) as Array<GoalRow & { source?: string }>)
    .filter((g) => !PLACEHOLDER_GOAL_SOURCES.has(g.source ?? ''))
    .filter((g) => !CONSTRAINT_NOTE_PREFIX.test(g.goal_text)) as GoalRow[];
  const goalKeywordIndex = buildGoalKeywordIndex(goals);
  logDecryptSkip(userId, 'scorer:open_loops', scoringDecryptSkips);

  // Context enrichment signals — 90-day window with 150 limit so the scorer
  // can find keyword overlap across email, calendar, files, and tasks.
  const ninetyDaysAgoContext = new Date(Date.now() - daysMs(90)).toISOString();
  const { data: allRecentSignals } = await supabase
    .from('tkg_signals')
    .select('content, source, occurred_at')
    .eq('user_id', userId)
    .gte('occurred_at', ninetyDaysAgoContext)
    .eq('processed', true)
    .order('occurred_at', { ascending: false })
    .limit(150);

  let contextDecryptSkips = 0;
  const decryptedSignals = (allRecentSignals ?? [])
    .map((signal: any) => {
      const decrypted = decryptWithStatus(signal.content as string ?? '');
      if (decrypted.usedFallback) {
        contextDecryptSkips++;
        return null;
      }
      return decrypted.plaintext;
    })
    .filter((content: string | null): content is string => {
      if (!content) return false;
      return !isSelfReferentialSignal(content);
    });
  logDecryptSkip(userId, 'scorer:recent_signal_context', contextDecryptSkips);

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
    .eq('current_priority', true)
    .lt('priority', 3);

  // Extract entity names and key phrases from suppression goal text
  const suppressionCommonWords = new Set([
    'not', 'the', 'this', 'that', 'with', 'from', 'until', 'unless', 'only',
    'suggest', 'apply', 'contacting', 'related', 'position', 'decided',
    'reviewed', 'posting', 'directives', 'suppress', 'locked', 'decision',
    'stable', 'employment', 'current', 'supervisor', 'reference', 'explicitly',
    'asks', 'path', 'post', 'brandon', 'work', 'platform', 'match',
    'contracts', 'analyst', 'program', 'functional', // individual words too generic
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
    });
  }

  // 2. Signals — skip self-fed directive signals to avoid circular loops
  for (const s of signals) {
    const text = s.content as string;
    if (!text || text.length < 20) continue;
    // Skip signals that are Foldera's own self-fed directives
    if (isSelfReferentialSignal(text)) continue;
    const mg = matchGoal(text, goals);
    const actionType = inferActionType(text, 'signal');

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
    });
  }

  // 3. Cooling relationships
  for (const e of entities) {
    const daysSince = Math.floor(
      (Date.now() - new Date(e.last_interaction as string).getTime()) / (1000 * 60 * 60 * 24),
    );
    const text = `${e.name}: last contact ${daysSince} days ago, ${e.total_interactions} total interactions`;
    const mg = matchGoal(text, goals);

    candidates.push({
      id: e.id,
      type: 'relationship',
      title: `Follow up with ${e.name}`,
      content: text,
      actionType: 'send_message',
      urgency: relationshipUrgency(daysSince),
      matchedGoal: mg,
      domain: inferDomain(mg, text, goalKeywordIndex, 'relationship'),
      sourceSignals: [
        {
          kind: 'relationship',
          id: e.id,
          occurredAt: e.last_interaction as string | undefined,
          summary: `Follow up with ${e.name}`,
        },
      ],
      entityPatterns: e.patterns,
      entityName: e.name,
    });
  }

  // -----------------------------------------------------------------------
  // PRE-SCORING: Candidate quality filter
  // Reject housekeeping, tool management, notifications, and spam before
  // they reach the scoring loop. These waste scorer capacity and poison
  // the candidate pool even when the generator correctly downgrades them.
  // -----------------------------------------------------------------------

  const preScoringCount = candidates.length;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    const isNoise = isNoiseCandidateText(c.title, c.content);
    if (isNoise) {
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
  const invalidContextRejections = await filterInvalidContext(
    userId,
    candidates,
    signals as Array<{ content: string; type?: string; occurred_at?: string }>,
  );
  if (invalidContextRejections.size > 0) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (invalidContextRejections.has(candidates[i].id)) candidates.splice(i, 1);
    }
    console.log(JSON.stringify({
      event: 'scorer_validity_filter',
      rejected: invalidContextRejections.size,
      remaining: candidates.length,
    }));
  }

  if (candidates.length === 0) {
    // No goal-connected candidates. Goalless emergent patterns (commitment_decay,
    // signal_velocity) are system metrics, not user-serving. Return null for a
    // valid no-send rather than surfacing goalless emergent patterns.
    return null;
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

  let scored: ScoredLoop[] = [];
  const approvalHistory = await getApprovalHistory(userId);

  // Contact action types — suppression goals that reference a person/entity only
  // block outreach actions, not document/research/decision artifacts.
  const CONTACT_ACTION_TYPES = new Set<ActionType>(['send_message', 'schedule']);

  for (const c of candidates) {
    // Check suppression goals BEFORE scoring — zero the score if matched
    const candidateText = `${c.title} ${c.content}`.toLowerCase();
    let suppressedByGoal: string | null = null;
    let suppressionIsContactOnly = false;
    for (const { pattern, goalText, contactOnly } of suppressionEntities) {
      if (pattern.test(c.title) || pattern.test(c.content)) {
        suppressedByGoal = goalText;
        suppressionIsContactOnly = contactOnly;
        break;
      }
    }

    // Suppression scope depends on the goal's intent:
    // - contactOnly=true ("DO NOT contact Keri Nopens"): only blocks send_message/schedule.
    //   Non-contact artifacts (write_document, make_decision, research) pass through.
    // - contactOnly=false ("DO NOT suggest Mercor"): blocks ALL artifact types — absolute.
    const isSuppressed =
      suppressedByGoal !== null &&
      (!suppressionIsContactOnly || CONTACT_ACTION_TYPES.has(c.actionType));

    if (suppressedByGoal !== null) {
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
          suppression_goal: suppressedByGoal.slice(0, 120),
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
        confidence_prior: 30, // suppressed candidate — use floor prior
      });
      continue;
    }

    // Priority 1 = most important → highest stakes. Invert: stakes = 6 - priority
    // P1 → 5.0, P2 → 4.0, P3 → 3.0, P4 → 2.0, P5 → 1.0
    const stakes = c.matchedGoal ? (6 - c.matchedGoal.priority) : 1.0;

    // Specificity multiplier: reward candidates with concrete details, penalize vague ones
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
    const entityPenalty = await getEntitySkipPenalty(userId, c.content, c.title);

    // v4: Gemini scoring function — replaces flat multiplicative formula
    const { score, breakdown: geminiBreakdown } = computeCandidateScore({
      stakes: specificityAdjustedStakes,
      urgency: c.urgency,
      tractability,
      actionType: c.actionType,
      entityPenalty,
      daysSinceLastSurface,
      approvalHistory,
      highStakes: specificityAdjustedStakes >= 4,
    });

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
      urgency: c.urgency,
      stakes: specificityAdjustedStakes,
      tractability,
      entityPenalty,
      hasRecentSignal: hasRecentSig,
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
        urgency: c.urgency,
        tractability,
        freshness: geminiBreakdown.novelty_multiplier,
        actionTypeRate: geminiBreakdown.behavioral_rate,
        entityPenalty,
      },
      relatedSignals: related,
      sourceSignals: c.sourceSignals,
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
      lifecycleGateExcluded++;
    }
  }

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
    scored.push(compound);
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

      scored.push({
        id: `divergence-${div.revealedDomain}-${div.statedGoal.category}`,
        type: 'emergent',
        title: `Preference divergence: stated "${div.statedGoal.text}" but signal velocity is on ${div.revealedDomain}`,
        content: divergenceContent,
        suggestedActionType: 'make_decision',
        matchedGoal: {
          text: div.statedGoal.text,
          priority: div.statedGoal.priority,
          category: div.statedGoal.category,
        },
        score: divergenceScore,
        breakdown: {
          stakes: div.statedGoal.priority,
          urgency: div.divergenceScore,
          tractability: 1.0,
          freshness: 1.0,
          actionTypeRate: 0.5,
          entityPenalty: 0,
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

      scored.push({
        id: `emergent-${ep.type}`,
        type: 'emergent',
        title: ep.title,
        content: mirrorContent,
        suggestedActionType: ep.suggestedActionType,
        matchedGoal: null,
        score: adjustedEV + 0.01, // tiny bump to ensure it wins over the loop it beat
        breakdown: {
          stakes: ep.surpriseValue,
          urgency: ep.dataConfidence,
          tractability: 1.0,
          freshness: emergentFreshness,
          actionTypeRate: 0.5,
          entityPenalty: 0,
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
  const discrepancies = detectDiscrepancies({ commitments, entities, goals, decryptedSignals });
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
  for (const d of discrepancies) {
    const daysSinceLastSurface = await getDaysSinceLastSurface(userId, d.title);
    const { score, breakdown: geminiBreakdown } = computeCandidateScore({
      stakes: d.stakes,
      urgency: d.urgency,
      tractability: 0.70, // structural gaps are always tractable — a decision is always available
      actionType: d.suggestedActionType,
      entityPenalty: 0,
      daysSinceLastSurface,
      approvalHistory,
      highStakes: d.stakes >= 4,
    });
    scored.push({
      id: d.id,
      type: 'discrepancy',
      title: d.title,
      content: d.content,
      suggestedActionType: d.suggestedActionType,
      matchedGoal: d.matchedGoal,
      score,
      breakdown: {
        stakes: d.stakes,
        urgency: d.urgency,
        freshness: 1.0,
        actionTypeRate: geminiBreakdown.behavioral_rate,
        entityPenalty: 0,
        ...geminiBreakdown,
      },
      relatedSignals: [],
      sourceSignals: d.sourceSignals,
      confidence_prior: Math.round(Math.max(45, Math.min(85, d.urgency * 80))),
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
        score,
        evidence: d.evidence,
      },
    });
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
  scored = scored.filter((s) => s.matchedGoal !== null || s.type === 'emergent' || s.type === 'discrepancy');
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
      return false;
    }
    return true;
  });

  // Ranking invariant enforcement
  // Hard-block weak/obvious/repeated/non-decision-moving candidates and
  // force discrepancy preference when both discrepancy + task classes exist.
  const invariantResult = applyRankingInvariants(scored);
  scored = invariantResult.ranked;
  const invariantRejected = invariantResult.diagnostics.filter((d) => d.hardRejectReasons.length > 0).length;
  const invariantPenalized = invariantResult.diagnostics.filter((d) => d.penaltyReasons.length > 0).length;
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
  // If no candidate clears the bar, return null — a clean no-send — rather
  // than forwarding a worthless candidate to the generator.
  //
  // Captures:
  //   - previously-skipped identical directives (same entity + action type
  //     + goal anchor → suppression_multiplier ≈ 0 from entity penalty)
  //   - all-suppressed pools (every candidate matched a suppression goal)
  //   - pools where validity filter removed every real candidate
  // -----------------------------------------------------------------------

  const SCORED_MIN_THRESHOLD = 0.001;
  const validScoredCandidates = scored.filter(
    (c) => c.score > SCORED_MIN_THRESHOLD && passesTop3RankingInvariants(c),
  );
  if (validScoredCandidates.length === 0) {
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
    return null;
  }

  const winner = validScoredCandidates[0];
  if (!winner) return null;

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
    winner,
    topCandidates: validScoredCandidates.slice(0, 3),
    deprioritized,
    candidateDiscovery: buildCandidateDiscoveryLog(winner, scored, suppressedCandidates, null),
    antiPatterns,
    divergences,
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
