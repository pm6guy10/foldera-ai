/**
 * Discrepancy Detector
 * ====================
 * Extracts structural gap candidates from already-loaded data.
 *
 * Sixteen classes of discrepancy across two tiers:
 *
 * ABSENCE-BASED (existing) — detects when something stopped:
 *  1. decay     — important relationship gone silent (bx_stats.silence_detected)
 *  2. exposure  — commitment due within 7 days with no execution artifact
 *  3. drift     — high-priority goal (P1/P2) with no observable recent activity
 *  4. avoidance — at_risk commitment stalled 14+ days with no forward movement
 *  5. risk      — high-value relationship (≥15 interactions) that has gone silent
 *
 * DELTA-BASED (new) — detects measurable change vs baseline:
 *  6. engagement_collapse   — velocity_ratio < 0.5 (14d rate dropped ≥50% vs 90d baseline)
 *  7. relationship_dropout  — zero contact in 30d after 3+ interactions in the 30–90d window
 *  8. deadline_staleness    — commitment due ≤3 days, no update in 3+ days
 *  9. goal_velocity_mismatch — goal keyword signal density dropped ≥50% in recent vs historical
 *
 * CROSS-SOURCE (calendar / drive / conversation):
 * 10. preparation_gap — meeting soon with known entity, no recent email thread
 * 11. meeting_open_thread — meeting soon + open reply thread still pending
 * 12. schedule_conflict — overlapping calendar events in the next 7 days
 * 13. stale_document — drive file had an edit burst then 14d+ idle
 * 14. document_followup_gap — shared doc from a person, no follow-up email
 * 15. unresolved_intent — assistant chat captured "I should…" with no directive follow-through
 * 16. convergence — same entity hits 3+ signal buckets within 14 days
 *
 * CROSS-SIGNAL PATTERNS (not structural gaps):
 * 17. behavioral_pattern — goal–behavior contradiction, repeated avoidance, momentum drop,
 *     cross-entity themes, stale commitments without signal follow-through (see extractBehavioralPatterns)
 *
 * Delta candidates include: baseline metric, current metric, delta %, timeframe, entity.
 *
 * Design constraints:
 *  - Pure function. No DB calls. Takes already-fetched scorer data.
 *  - Returns at most 6 discrepancies total, sorted by urgency × stakes.
 *  - Delta-based candidates use urgency 0.72–0.85 (higher than absence 0.55–0.70).
 *  - Entity-level deduplication: one discrepancy per entity, highest score wins.
 *  - Discrepancies are PRIMARY candidates; open-loop candidates are fallback.
 */

import { isLikelyAutomatedTransactionalInbound } from './automated-inbound-signal';
import { isChatConversationSignalSource } from './scorer-candidate-sources';
import type { ActionType, GenerationCandidateSource } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiscrepancyClass =
  // Absence-based
  | 'decay' | 'exposure' | 'drift' | 'avoidance' | 'risk'
  // Delta-based
  | 'engagement_collapse' | 'relationship_dropout' | 'deadline_staleness' | 'goal_velocity_mismatch'
  // Cross-source
  | 'preparation_gap'
  | 'meeting_open_thread'
  | 'schedule_conflict'
  | 'stale_document'
  | 'document_followup_gap'
  | 'unresolved_intent'
  | 'convergence'
  // Cross-signal patterns (not structural gaps)
  | 'behavioral_pattern';

export interface Discrepancy {
  id: string;
  class: DiscrepancyClass;
  title: string;
  content: string;
  /** For computeCandidateScore — 1–5 scale */
  stakes: number;
  /** For computeCandidateScore — 0–1 */
  urgency: number;
  suggestedActionType: ActionType;
  /** Why this discrepancy fired — for structured logging */
  evidence: string;
  sourceSignals: GenerationCandidateSource[];
  /** Matched goal if discrepancy directly addresses a stated goal (e.g. drift) */
  matchedGoal: { text: string; priority: number; category: string } | null;
  /** Entity name for convergence matching — present on entity-scoped discrepancies */
  entityName?: string;
  /** Structured state-change metadata. Present on all delta-based triggers. */
  trigger?: TriggerMetadata;
  /** Optional time hints for scorer urgency merging (calendar / commitments / cold-entity meeting). */
  scoringHints?: {
    calendarStartMs?: number;
    commitmentDueMs?: number;
    coldEntityMeetingBoost?: boolean;
  };
  /**
   * When set, generator/scorer may prefer this over TRIGGER_ACTION_MAP for this row
   * (e.g. unresolved_intent → schedule vs write_document).
   */
  discrepancyPreferredAction?: ActionType;
}

interface EntityRow {
  id: string;
  name: string;
  last_interaction: string | null;
  total_interactions: number;
  patterns: Record<string, unknown> | null;
  trust_class?: 'trusted' | 'junk' | 'transactional' | 'personal' | 'unclassified' | null;
  primary_email?: string | null;
  emails?: string[] | null;
}

interface CommitmentRow {
  id: string;
  description: string;
  category: string;
  status: string;
  risk_score: number | null;
  due_at: string | null;
  implied_due_at: string | null;
  source_context: string | null;
  updated_at: string | null;
  /** When present (e.g. from scorer), used for behavioral_pattern “said-but-never-did” age. */
  created_at?: string | null;
  trust_class?: 'trusted' | 'junk' | 'transactional' | 'personal' | 'unclassified' | null;
  source?: string | null;
  source_id?: string | null;
}

interface GoalRow {
  goal_text: string;
  priority: number;
  goal_category: string;
}

/** Pre-decrypted signal row — passed from scorer (no DB inside this module). */
export interface StructuredSignalInput {
  id: string;
  source: string;
  type: string | null;
  occurred_at: string;
  content: string;
  source_id?: string | null;
  /** From tkg_signals.author when present — used to exclude self-authored inbound mail. */
  author?: string | null;
}

/** Recent directives for unresolved-intent cross-check (pre-fetched). */
export interface RecentDirectiveInput {
  generated_at: string;
  directive_text: string;
}

/** Structured delta metric embedded in evidence string for logging and prompt injection. */
interface DeltaMetric {
  baseline: string;
  current: string;
  delta_pct: number;
  timeframe: string;
  entity?: string;
}

/**
 * Trigger metadata — every valid trigger must include structured state-change data.
 * A trigger fires only when state changed in a way that raises or lowers a real outcome.
 */
export interface TriggerMetadata {
  /** What was normal / established before the change */
  baseline_state: string;
  /** What is true now */
  current_state: string;
  /** The delta that fired the trigger */
  delta: string;
  /** Measurement window */
  timeframe: string;
  /** Which outcome class this affects: money, job, approval, deadline, risk */
  outcome_class: 'money' | 'job' | 'approval' | 'deadline' | 'risk' | 'relationship';
  /** Why this matters right now — not in general */
  why_now: string;
}

// ---------------------------------------------------------------------------
// Entity admission-control
// ---------------------------------------------------------------------------

/**
 * Medical, clinical, and healthcare provider names.
 * An entity whose name contains any of these patterns is a service/provider
 * relationship, not a personal or professional relationship with consequence.
 */
const MEDICAL_PROVIDER_PATTERNS = [
  /\b(?:dr\.?|doctor|physician|md|do|pa-c|np|arnp|crna|rn|lcsw|therapist|counselor|psychiatrist|psychologist)\b/i,
  /\b(?:health\s*(?:care|center|clinic|system|network|group|plan|services?)|medical\s*(?:center|group|clinic|care|services?)|dental|dentist|orthodontist|optometrist|ophthalmologist|dermatologist|chiropractor|physical\s*therapist|urgent\s*care|emergency\s*(?:room|care|services?))\b/i,
  /\b(?:hospital|clinic|pharmacy|walgreens|cvs|rite\s*aid|kaiser|mayo|cleveland\s*clinic|humana|cigna|aetna|united\s*health|anthem|blue\s*cross|blue\s*shield)\b/i,
  /\b(?:pinnacle|summit|valley|mountain|river)\s+(?:health|medical|care|wellness|dental)\b/i,
  /\b(?:wellness|fitness|gym|yoga|pilates|spa|massage)\s+(?:center|studio|clinic|group)\b/i,
];

/**
 * Office, location, organizational, and service-provider entity names.
 * These are entities extracted from email signatures, headers, or location
 * fields — not real human relationships.
 */
const OFFICE_SERVICE_PATTERNS = [
  // Physical locations and offices
  /\b(?:office|building|suite|floor|room|lobby|campus|headquarters|hq|facility|complex)\b/i,
  // Utilities and municipal services
  /\b(?:electric|gas|water|utility|utilities|comcast|xfinity|spectrum|verizon|att|t-mobile|usps|fedex|ups|dhl)\b/i,
  // Insurance and financial services (non-personal)
  /\b(?:insurance|assurance|mutual|allstate|state\s*farm|geico|progressive|nationwide|liberty\s*mutual|farmers)\b/i,
  // Real estate and property
  /\b(?:realty|real\s*estate|property\s*management|landlord|leasing|housing|apartments?|condos?|hoa)\b/i,
  // Generic organization suffixes without a person name
  /^(?:the\s+)?[A-Z][\w\s&,-]{3,40}\s+(?:inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|company|group|associates|partners|consulting|solutions|services|agency|firm|bureau|department|division|authority)$/i,
  // Government/admin entities
  /\b(?:irs|dmv|dept\.?\s+of|department\s+of|city\s+of|county\s+of|state\s+of|government|federal|municipal|treasury|social\s*security|medicare|medicaid)\b/i,
  // Food, retail, and consumer brands
  /\b(?:amazon|walmart|target|costco|whole\s*foods|trader\s*joe|kroger|safeway|doordash|grubhub|uber\s*eats|instacart|ebay|etsy|shopify)\b/i,
];

/**
 * Calendar-event signal markers — text patterns that indicate a signal is
 * a calendar notification rather than a real email conversation.
 */
const CALENDAR_EVENT_MARKERS = [
  /\b(?:calendar\s*invite|meeting\s*invitation|invited\s+you\s+to|you've\s+been\s+invited|event\s+invitation)\b/i,
  /\b(?:accept|decline|maybe)\b.*\b(?:invite|invitation|event|meeting)\b/i,
  /\b(?:google\s*calendar|outlook\s*calendar|ical|ics\s+attachment)\b/i,
  /\b(?:meeting\s+reminder|event\s+reminder|appointment\s+reminder)\b/i,
  /\borganizer:\s*\w+/i,
  /\battendees?:\s*\w+/i,
];

const INTERVIEW_SIGNAL_PATTERN =
  /\b(?:interview|panel interview|phone screen|screening interview|final round|hiring panel|candidate interview)\b/i;

const INTERVIEW_NOISE_TITLE_PATTERN =
  /\b(?:dance|trash|recycling|bible study|soccer|baby shower|bby shower|birthday|dentist|counseling|parents visit|telehealth|zoloft)\b/i;

const INTERVIEW_ROLE_PATTERN =
  /\b(?:social and health program consultant\s*\d+|administrative specialist\s*\d+|program manager|training(?:\s+(?:and|&))?\s+appeals program manager|project manager|operations manager|program specialist|policy analyst|program analyst|coordinator|consultant|specialist|manager|administrator|administrative assistant\s*\d+)\b/i;

const INTERVIEW_ORG_PATTERN =
  /\b(?:dshs|hca|wa cares|washington state(?: department of [^,\n]+)?|department of social and health services|health care authority)\b/i;

const INTERVIEW_DETAIL_PROMPT_PATTERN =
  /\b(?:focus on|focus areas?|bring examples of|panel(?: is)? looking for|emphasis on|topics include|they care about)\s*:?\s*([^\n.]+)/ig;

const INTERVIEW_CONFIRMATION_PATTERN =
  /\b(?:confirm(?:ed|ing|ation)?|scheduled|schedule(?:d)?|invite(?:d|s|ation)?|selected\s+to\s+interview|interview\s+(?:is|has\s+been)\s+(?:set|scheduled|confirmed)|we\s+look\s+forward\s+to\s+(?:meeting|speaking)|panel\s+(?:will|is\s+scheduled\s+to)\s+(?:meet|interview))\b/i;

const INTERVIEW_SPECULATIVE_PATTERN =
  /\b(?:if\s+(?:you\s+are\s+)?selected|may\s+be\s+invited|might\s+be\s+invited|potential\s+interview|possible\s+interview|future\s+interview|interview\s+pool|eligible\s+list|screening\s+criteria|application\s+(?:received|under\s+review)|not\s+selected|cancel(?:ed|led)|postponed)\b/i;

/**
 * Rejection reason codes for entity admission control.
 * Machine-readable; logged on every rejection.
 */
export type EntityRejectionReason =
  | 'no_goal_linkage'
  | 'medical_or_service_contact'
  | 'office_or_org_entity'
  | 'mention_inflation_only'
  | 'one_off_calendar_contact'
  | 'low_signal_density';

/**
 * Returns all rejection reasons for an entity candidate, or empty array if the
 * entity passes admission control and is eligible for discrepancy detection.
 *
 * An entity MUST pass ALL checks to be eligible. Even one rejection reason
 * causes the entity to be excluded from discrepancy candidates.
 */
export function getEntityRejectionReasons(
  entity: EntityRow,
  goals: GoalRow[],
  decryptedSignals: string[],
): EntityRejectionReason[] {
  const reasons: EntityRejectionReason[] = [];
  const bxStats = (entity.patterns as any)?.bx_stats;
  const signal90d = (bxStats?.signal_count_90d as number) ?? 0;

  // A. Medical/service provider — reject regardless of interaction count
  if (MEDICAL_PROVIDER_PATTERNS.some((p) => p.test(entity.name))) {
    reasons.push('medical_or_service_contact');
  }

  // B. Office/org entity — reject regardless of interaction count
  if (OFFICE_SERVICE_PATTERNS.some((p) => p.test(entity.name))) {
    reasons.push('office_or_org_entity');
  }

  // C. Low signal density — post-migration total_interactions only counts real
  // email/calendar signals. If total_interactions >= 5, the relationship is
  // empirically verified regardless of 90d signal window (interactions may
  // predate the 90d window, which is exactly what decay candidates detect).
  const totalInteractions = entity.total_interactions;
  if (signal90d < 2 && totalInteractions < 5) {
    reasons.push('low_signal_density');
  }

  // D. Mention inflation — total_interactions >> signal_count_90d by 20x+
  // Post-migration this should be rare since total_interactions is clean,
  // but keep as safety net for edge cases.
  if (signal90d > 0 && totalInteractions > signal90d * 20) {
    reasons.push('mention_inflation_only');
  }

  // E. Calendar-only contact — entity only appears in calendar-event signals
  // Find signals that mention this entity's first name (case-insensitive)
  const firstName = entity.name.split(/\s+/)[0];
  if (firstName && firstName.length >= 3) {
    const mentioningSignals = decryptedSignals.filter((s) =>
      new RegExp(`\\b${firstName}\\b`, 'i').test(s),
    );
    if (
      mentioningSignals.length > 0 &&
      mentioningSignals.every((s) => CALENDAR_EVENT_MARKERS.some((p) => p.test(s)))
    ) {
      reasons.push('one_off_calendar_contact');
    }
  }

  // F. Goal linkage — entity's signals must contain outcome-relevant keywords.
  // This gates on signal evidence, not entity name vs. goal text (goals don't name people).
  // Only fires when we have actual signals mentioning the entity to analyze.
  const OUTCOME_EVIDENCE_PATTERNS = [
    /\b(?:offer|hiring|hired|interview|approval|approved|contract|deal|partnership|opportunity)\b/i,
    /\b(?:\$|budget|cash|runway|invoice|payment|revenue|funding|raise|investment|client)\b/i,
    /\b(?:recruiter|hiring\s+manager|vp|cto|ceo|director|founder|partner|stakeholder|decision\s+maker)\b/i,
    /\b(?:deadline|due\s+date|by\s+(?:monday|tuesday|wednesday|thursday|friday|eod|end\s+of\s+week))\b/i,
    /\b(?:follow\s+up|next\s+steps?|proposal|scope|statement\s+of\s+work|sow|nda|term\s+sheet)\b/i,
  ];

  if (decryptedSignals.length > 0 && firstName && firstName.length >= 3) {
    const mentioningSignals = decryptedSignals.filter((s) =>
      new RegExp(`\\b${firstName}\\b`, 'i').test(s),
    );
    // Only reject if we found signals mentioning the entity AND none have outcome evidence
    if (
      mentioningSignals.length > 0 &&
      !mentioningSignals.some((s) => OUTCOME_EVIDENCE_PATTERNS.some((p) => p.test(s)))
    ) {
      reasons.push('no_goal_linkage');
    }
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_PER_CLASS = 2;
const MAX_CROSS_CLASS = 2;
const SEVEN_DAYS_MS = 7 * 86400000;
const FOURTEEN_DAYS_MS = 14 * 86400000;

const STOP_WORDS = new Set([
  'that', 'this', 'with', 'from', 'into', 'through', 'about', 'after',
  'before', 'during', 'between', 'under', 'over', 'have', 'been', 'will',
  'would', 'should', 'could', 'their', 'them', 'they', 'than', 'then',
  'when', 'what', 'which', 'where', 'while', 'also', 'each', 'only',
  'other', 'some', 'such', 'more', 'most', 'very', 'just', 'does',
]);

function textKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

const GENERIC_SINGLE_GOAL_MATCH_TOKENS = new Set([
  'career',
  'decision',
  'follow',
  'hiring',
  'interview',
  'offer',
  'position',
  'project',
  'reference',
  'role',
  'search',
  'state',
  'supervisor',
  'thread',
]);

function allowsSingleTokenGoalMatch(token: string): boolean {
  if (token.length < 6) return false;
  if (GENERIC_SINGLE_GOAL_MATCH_TOKENS.has(token)) return false;
  if (/^[a-z]*\d+[a-z0-9]*$/i.test(token)) return false;
  return true;
}

/** Return the best matching goal for a text, or null if no keyword overlap. */
function matchGoal(
  text: string,
  goals: GoalRow[],
): { text: string; priority: number; category: string } | null {
  const textKws = new Set(textKeywords(text));
  let bestGoal: GoalRow | null = null;
  let bestOverlap = 0;
  let bestRatio = 0;
  for (const g of goals) {
    const gkws = textKeywords(g.goal_text);
    const matchedTokens = gkws.filter((kw) => textKws.has(kw));
    const overlap = matchedTokens.length;
    if (overlap === 0) continue;

    const passes =
      overlap >= 2 ||
      (overlap === 1 && matchedTokens.some((token) => allowsSingleTokenGoalMatch(token)));
    if (!passes) continue;

    const ratio = overlap / Math.max(gkws.length, 1);
    if (
      overlap > bestOverlap ||
      (overlap === bestOverlap && ratio > bestRatio) ||
      (overlap === bestOverlap && ratio === bestRatio && overlap > 0 && g.priority < (bestGoal?.priority ?? 999))
    ) {
      bestOverlap = overlap;
      bestRatio = ratio;
      bestGoal = g;
    }
  }
  if (!bestGoal || bestOverlap < 1) return null;
  return { text: bestGoal.goal_text, priority: bestGoal.priority, category: bestGoal.goal_category };
}

/** Extract entity ID from entity-scoped discrepancy IDs for deduplication. */
function getEntityKey(d: Discrepancy): string | null {
  const m = d.id.match(
    /^discrepancy_(?:decay|risk|collapse|dropout|prep|meeting|docfu|conv|bp)_(.+)$/,
  );
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Extractor 1: decay — important relationship gone silent
// ---------------------------------------------------------------------------

function extractDecay(
  entities: EntityRow[],
  goals: GoalRow[],
  decryptedSignals: string[],
  now: number,
): Discrepancy[] {
  const results: Discrepancy[] = [];
  // risk extractor handles ≥15 interactions — decay handles 5–14
  const decayRange = entities
    .filter((e) => {
      const bxStats = (e.patterns as any)?.bx_stats;
      if (bxStats?.silence_detected !== true) return false;
      if (e.total_interactions < 5 || e.total_interactions >= 15) return false;
      // Full admission gate: reject entities that cannot produce executable artifacts
      const rejections = getEntityRejectionReasons(e, goals, decryptedSignals);
      return rejections.length === 0;
    })
    .sort((a, b) => b.total_interactions - a.total_interactions);

  for (const e of decayRange.slice(0, MAX_PER_CLASS)) {
    const daysSilent =
      e.last_interaction != null
        ? Math.floor((now - new Date(e.last_interaction).getTime()) / 86400000)
        : null;
    const silentStr = daysSilent != null ? `${daysSilent} days` : 'an extended period';
    const bx = (e.patterns as any)?.bx_stats;
    const count90 = (bx?.signal_count_90d ?? 0) as number;
    const count14 = (bx?.signal_count_14d ?? 0) as number;
    const baselinePer14d = count90 > 0 ? +(count90 * 14 / 90).toFixed(1) : e.total_interactions > 0 ? +(e.total_interactions * 14 / 365).toFixed(1) : 0;

    const trigger: TriggerMetadata = {
      baseline_state: `${e.total_interactions} interactions total, ~${baselinePer14d}/14d baseline`,
      current_state: `0 interactions in ${silentStr}`,
      delta: `${e.total_interactions} → 0 (silence after ${e.total_interactions} interactions)`,
      timeframe: `Silent for ${silentStr}`,
      outcome_class: 'relationship',
      why_now: daysSilent != null && daysSilent > 45
        ? `${daysSilent} days of silence crosses the point where reconnection becomes awkward — delay makes recovery harder`
        : `Relationship with ${e.total_interactions} interactions went to zero — the longer the silence, the harder the restart`,
    };

    const primaryEmail = (e.primary_email as string | null | undefined) ?? '';
    const entityBlob = [e.name, primaryEmail].join(' ');
    const goalMatch = matchGoal(entityBlob, goals);
    // Also check if the entity's email domain appears verbatim in any high-priority goal
    // (e.g. "hca.wa.gov" → check goals for "hca"). textKeywords filters short tokens so
    // we do a direct substring check for short org identifiers.
    const emailDomain = primaryEmail.includes('@') ? primaryEmail.split('@')[1]?.split('.')[0]?.toLowerCase() ?? '' : '';
    const domainInHighPriorityGoal = emailDomain.length >= 2 && goals.some(
      g => g.priority <= 2 && g.goal_text.toLowerCase().includes(emailDomain),
    );
    // Boost stakes by 1 when the silenced contact is goal-linked (e.g. P1/P2 career goal)
    const goalStakesBoost = ((goalMatch && goalMatch.priority <= 2) || domainInHighPriorityGoal) ? 1 : 0;

    results.push({
      id: `discrepancy_decay_${e.id}`,
      class: 'decay',
      title: `Fading connection: ${e.name}`,
      content:
        `Your relationship with ${e.name} has gone silent after ${e.total_interactions} past interactions. ` +
        `No contact in ${silentStr}. Baseline was ~${baselinePer14d} interactions per 14 days. ` +
        `Current: 0. This is not drift — it is a temperature drop that is getting harder to reverse.`,
      stakes: Math.min(5, Math.floor(e.total_interactions / 5) + 2 + goalStakesBoost),
      urgency: daysSilent != null && daysSilent > 60 ? 0.75 : 0.55,
      suggestedActionType: 'send_message' as ActionType,
      evidence: JSON.stringify({
        baseline: `${baselinePer14d} interactions/14d`,
        current: `0 interactions/14d`,
        delta_pct: -100,
        timeframe: `silent for ${silentStr}`,
        entity: e.name,
      } satisfies DeltaMetric),
      sourceSignals: [
        {
          kind: 'relationship',
          summary: `${e.name}: ${e.total_interactions} total interactions, last seen ${silentStr} ago`,
        },
      ],
      matchedGoal: goalMatch ? { text: goalMatch.text, priority: goalMatch.priority, category: goalMatch.category } : null,
      entityName: e.name,
      trigger,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Extractor 2: exposure — commitment due within 7 days, no execution artifact
// ---------------------------------------------------------------------------

function extractExposure(
  commitments: CommitmentRow[],
  goals: GoalRow[],
  now: number,
  structured: StructuredSignalInput[] = [],
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const upcoming = commitments
    .filter((c) => {
      const dueAt = c.due_at ?? c.implied_due_at;
      if (!dueAt) return false;
      const dueMs = new Date(dueAt).getTime();
      return dueMs > now && dueMs <= now + sevenDaysMs;
    })
    .sort((a, b) => {
      const aMs = new Date((a.due_at ?? a.implied_due_at)!).getTime();
      const bMs = new Date((b.due_at ?? b.implied_due_at)!).getTime();
      return aMs - bMs; // soonest first
    });

  for (const c of upcoming.slice(0, MAX_PER_CLASS)) {
    const dueAt = (c.due_at ?? c.implied_due_at)!;
    const daysUntilDue = Math.max(
      0,
      Math.floor((new Date(dueAt).getTime() - now) / 86400000),
    );
    const schedulingEvidence = findSchedulingPressureEvidenceForCommitment(c, structured, now);
    const alreadyScheduled = schedulingEvidence.length > 0
      && commitmentHasConfirmedInterviewAnchor(c, structured, now);
    if (alreadyScheduled) continue;
    const urgency =
      daysUntilDue === 0
        ? 0.95
        : daysUntilDue <= 2
          ? 0.85
          : daysUntilDue <= 5
            ? (schedulingEvidence.length > 0 ? 0.90 : 0.70)
            : 0.55;
    const schedulingEvidenceText = schedulingEvidence.length > 0
      ? ` Related scheduling pressure: ${schedulingEvidence
        .map((e) => (e.summary ?? '').replace(/^Scheduling pressure:\s*/i, ''))
        .join(' ')}`
      : '';

    const trigger: TriggerMetadata = {
      baseline_state: `Commitment accepted: "${c.description.slice(0, 80)}"`,
      current_state: schedulingEvidence.length > 0
        ? `Due in ${daysUntilDue} day(s), scheduling instructions exist, no execution artifact exists`
        : `Due in ${daysUntilDue} day(s), no execution artifact exists`,
      delta: schedulingEvidence.length > 0
        ? `commitment → unscheduled required next step (${daysUntilDue}d remaining)`
        : `commitment → no artifact (${daysUntilDue}d remaining)`,
      timeframe: `${daysUntilDue} day(s) to deadline`,
      outcome_class: 'deadline',
      why_now: schedulingEvidence.length > 0
        ? `Scheduling instructions and deadline pressure are both present; the artifact should move appointment confirmation, not produce generic prep.`
        : daysUntilDue <= 2
          ? `Due in ${daysUntilDue} day(s) with zero artifacts — this is not a reminder, it is an exposure gap`
          : `Commitment approaching deadline with no visible execution — the gap is widening daily`,
    };

    results.push({
      id: `discrepancy_exposure_${c.id}`,
      class: 'exposure',
      title: `Commitment due in ${daysUntilDue}d: ${c.description.slice(0, 60)}`,
      content:
        `You committed to "${c.description}" and it is due in ` +
        `${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}. ` +
        `No execution artifact exists yet. The gap between commitment and delivery is exposure.` +
        schedulingEvidenceText,
      stakes: 4,
      urgency,
      suggestedActionType: 'write_document' as ActionType,
      evidence: `due_at=${dueAt}, days_until_due=${daysUntilDue}, status=${c.status}`,
      sourceSignals: [
        { kind: 'commitment', id: c.id, summary: c.description.slice(0, 160) },
        ...schedulingEvidence,
      ],
      matchedGoal: matchGoal(c.description, goals),
      trigger,
    });
  }
  return results;
}

const SCHEDULING_PRESSURE_PATTERN =
  /\bself[-\s]?schedul|\bschedule (?:your|the|an?)\b|\bschedule appointment\b|\bselect (?:the|your|an?) (?:desired )?(?:interview )?(?:date|time|slot)|\bconfirm appointment\b|\binterview slots?\b|\bfirst[-\s]?come\b|\bfirst served\b/i;

function commitmentKeywordTokens(description: string): string[] {
  const stopwords = new Set([
    'interview',
    'project',
    'meeting',
    'appointment',
    'position',
    'accepted',
    'scheduled',
  ]);
  return normalizeInterviewToken(description)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !stopwords.has(token));
}

function summarizeSchedulingPressure(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const directMatch = normalized.match(/(?:please follow the instructions below to schedule|go to www\.careers\.wa\.gov|confirm appointment|interview slots? are reserved|first come, first served)[^.]*\.?/i);
  return (directMatch?.[0] ?? normalized).slice(0, 220);
}

function findSchedulingPressureEvidenceForCommitment(
  commitment: CommitmentRow,
  structured: StructuredSignalInput[],
  nowMs: number,
): GenerationCandidateSource[] {
  const tokens = commitmentKeywordTokens(commitment.description);
  if (tokens.length === 0) return [];
  const sinceMs = nowMs - FOURTEEN_DAYS_MS;
  const evidence: GenerationCandidateSource[] = [];
  const seen = new Set<string>();

  for (const signal of structured) {
    if (evidence.length >= 2) break;
    const signalType = (signal.type ?? '').toLowerCase();
    const signalSource = signal.source.toLowerCase();
    if (signalSource.includes('user_feedback') || signalType === 'rejection' || signalType === 'outcome_feedback') continue;
    const occurredMs = Date.parse(signal.occurred_at);
    if (!Number.isFinite(occurredMs) || occurredMs < sinceMs || occurredMs > nowMs + SEVEN_DAYS_MS) continue;

    const exactSourceMatch = Boolean(commitment.source_id && (
      signal.id === commitment.source_id || signal.source_id === commitment.source_id
    ));
    const lower = signal.content.toLowerCase();
    const overlap = tokens.filter((token) => lower.includes(token)).length;
    if (!exactSourceMatch && overlap < Math.min(2, tokens.length)) continue;
    if (!SCHEDULING_PRESSURE_PATTERN.test(signal.content)) continue;
    if (seen.has(signal.id)) continue;
    seen.add(signal.id);

    evidence.push({
      kind: 'signal',
      id: signal.id,
      source: signal.source,
      occurredAt: signal.occurred_at,
      summary: `Scheduling pressure: ${summarizeSchedulingPressure(signal.content)}`,
    });
  }

  return evidence;
}

function commitmentHasConfirmedInterviewAnchor(
  commitment: CommitmentRow,
  structured: StructuredSignalInput[],
  nowMs: number,
): boolean {
  const tokens = commitmentKeywordTokens(commitment.description);
  if (tokens.length === 0) return false;

  const normalizedCommitment = normalizeInterviewToken(commitment.description);
  const expectedRole = normalizeInterviewField(extractRoleFromInterviewText(commitment.description));
  const expectedOrg = normalizeInterviewField(extractOrgFromInterviewText(commitment.description));
  const sinceMs = nowMs - FOURTEEN_DAYS_MS;
  const horizonMs = nowMs + FOURTEEN_DAYS_MS;

  for (const signal of structured) {
    const src = signal.source.toLowerCase();
    const type = String(signal.type ?? '').toLowerCase();
    if (!src.includes('calendar') && !type.includes('calendar')) continue;

    const parsed = parseCalendarEventFromContent(signal.content);
    if (!parsed) continue;
    if (parsed.startMs < sinceMs || parsed.startMs > horizonMs) continue;
    if (isInterviewNoiseTitle(parsed.title)) continue;
    if (!looksLikeInterviewSignal(`${parsed.title}\n${signal.content}`)) continue;

    const matchingEmails = matchingInterviewEmailSignals(structured, parsed.title, parsed.startMs);
    const hasCalendarGrounding = calendarHasConfirmationQualityEvidence(
      signal.content,
      parsed.title,
      parsed.startMs,
    );
    if (matchingEmails.length === 0 && !hasCalendarGrounding) continue;

    const combinedText = [
      parsed.title,
      signal.content,
      ...matchingEmails.map((email) => email.content),
    ].join('\n');
    const normalizedCombined = normalizeInterviewToken(combinedText);
    const overlap = tokens.filter((token) => normalizedCombined.includes(token)).length;
    const overlapThreshold = tokens.length <= 1 ? 1 : Math.min(2, tokens.length);

    const parsedTitle = splitInterviewTitle(parsed.title);
    const eventRole = normalizeInterviewField(parsedTitle.role ?? extractRoleFromInterviewText(combinedText));
    const eventOrg = normalizeInterviewField(parsedTitle.org ?? extractOrgFromInterviewText(combinedText));
    const roleMatch = expectedRole.length > 0 && eventRole === expectedRole;
    const orgMatch = expectedOrg.length > 0 && eventOrg === expectedOrg;
    const exactSourceMatch = Boolean(commitment.source_id && (
      signal.id === commitment.source_id || signal.source_id === commitment.source_id
    ));

    if (exactSourceMatch || roleMatch || orgMatch || overlap >= overlapThreshold) {
      return true;
    }

    if (
      expectedRole.length === 0
      && expectedOrg.length === 0
      && tokens.length === 1
      && normalizedCommitment.includes(tokens[0]!)
      && normalizedCombined.includes(tokens[0]!)
    ) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Extractor 3: drift — high-priority goal with no observable activity
// ---------------------------------------------------------------------------

function extractDrift(
  goals: GoalRow[],
  commitments: CommitmentRow[],
  decryptedSignals: string[],
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const highPriorityGoals = goals.filter((g) => g.priority <= 2);

  for (const g of highPriorityGoals.slice(0, MAX_PER_CLASS)) {
    const gkws = textKeywords(g.goal_text);
    if (gkws.length === 0) continue;

    const signalHit = decryptedSignals.some((s) => {
      const sLower = s.toLowerCase();
      const matchCount = gkws.filter((kw) => sLower.includes(kw)).length;
      return matchCount >= Math.min(2, gkws.length);
    });

    const commitmentHit = commitments.some((c) => {
      const cLower = c.description.toLowerCase();
      const matchCount = gkws.filter((kw) => cLower.includes(kw)).length;
      return matchCount >= Math.min(2, gkws.length);
    });

    if (!signalHit && !commitmentHit) {
      const trigger: TriggerMetadata = {
        baseline_state: `P${g.priority} goal declared: "${g.goal_text.slice(0, 80)}"`,
        current_state: `Zero matching activity in signals or commitments`,
        delta: `stated priority → zero observable action`,
        timeframe: 'current signal and commitment window',
        outcome_class: g.goal_category === 'financial' ? 'money' : g.goal_category === 'career' ? 'job' : 'risk',
        why_now: `P${g.priority} goal has no evidence of action — every day without movement is a day the goal drifts further from reality`,
      };

      results.push({
        id: `discrepancy_drift_${g.goal_text.slice(0, 40).replace(/\W+/g, '_')}`,
        class: 'drift',
        title: `Goal drift: ${g.goal_text.slice(0, 60)}`,
        content:
          `Your stated priority goal "${g.goal_text}" (priority ${g.priority}) has no observable ` +
          `activity in recent signals or active commitments. You declared this important, ` +
          `but behavior suggests it is being deferred.`,
        stakes: Math.max(3, 6 - g.priority), // P1 → 5, P2 → 4
        urgency: 0.65,
        suggestedActionType: 'make_decision' as ActionType,
        evidence: `priority=${g.priority}, signal_hit=false, commitment_hit=false`,
        sourceSignals: [
          { kind: 'signal', summary: `Goal: ${g.goal_text.slice(0, 160)}` },
        ],
        matchedGoal: {
          text: g.goal_text,
          priority: g.priority,
          category: g.goal_category,
        },
        trigger,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Extractor 4: avoidance — at_risk commitment stalled 14+ days
// ---------------------------------------------------------------------------

function extractAvoidance(
  commitments: CommitmentRow[],
  goals: GoalRow[],
  now: number,
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const stalled = commitments
    .filter((c) => {
      if (c.status !== 'at_risk') return false;
      if (!c.updated_at) return true; // never updated = definitely stalled
      return now - new Date(c.updated_at).getTime() > fourteenDaysMs;
    })
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));

  for (const c of stalled.slice(0, MAX_PER_CLASS)) {
    const stalledDays =
      c.updated_at != null
        ? Math.floor((now - new Date(c.updated_at).getTime()) / 86400000)
        : null;
    const stalledStr =
      stalledDays != null ? `${stalledDays} days` : 'an extended period';
    const dueAt = c.due_at ?? c.implied_due_at;
    const daysUntilDue = dueAt ? Math.floor((new Date(dueAt).getTime() - now) / 86400000) : null;

    const trigger: TriggerMetadata = {
      baseline_state: `Commitment accepted as at_risk, last movement ${stalledStr} ago`,
      current_state: `No forward movement for ${stalledStr}${daysUntilDue != null ? `, ${daysUntilDue}d until due` : ''}`,
      delta: `active → stalled (${stalledStr} without externalization)`,
      timeframe: `${stalledStr} stall${daysUntilDue != null ? `, deadline in ${daysUntilDue}d` : ''}`,
      outcome_class: daysUntilDue != null && daysUntilDue <= 7 ? 'deadline' : 'risk',
      why_now: stalledDays != null && stalledDays > 21
        ? `${stalledDays} days stalled — at this point the commitment is effectively abandoned unless a decision forces movement`
        : `At-risk commitment stalled ${stalledStr} with no send, no decision, no externalization — avoidance is compounding`,
    };

    results.push({
      id: `discrepancy_avoidance_${c.id}`,
      class: 'avoidance',
      title: `Stalled commitment: ${c.description.slice(0, 60)}`,
      content:
        `"${c.description}" has been at-risk for ${stalledStr} with no forward movement. ` +
        `No email sent, no document drafted, no decision made. ` +
        `This is not a planning failure — it is an execution stall. ` +
        `A decision — proceed, delegate, or drop — needs to be made now.`,
      stakes: 4,
      urgency: stalledDays != null && stalledDays > 21 ? 0.78 : 0.70,
      suggestedActionType: 'make_decision' as ActionType,
      evidence: JSON.stringify({
        baseline: `at_risk commitment, last updated ${stalledStr} ago`,
        current: `no externalization for ${stalledStr}`,
        delta_pct: -100,
        timeframe: `${stalledStr} stalled`,
      } satisfies DeltaMetric),
      sourceSignals: [
        { kind: 'commitment', id: c.id, summary: c.description.slice(0, 160) },
      ],
      matchedGoal: matchGoal(c.description, goals),
      trigger,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Extractor 5: risk — high-value relationship that has gone silent
// ---------------------------------------------------------------------------

function extractRisk(
  entities: EntityRow[],
  goals: GoalRow[],
  decryptedSignals: string[],
  now: number,
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const highValue = entities
    .filter((e) => {
      const bxStats = (e.patterns as any)?.bx_stats;
      if (bxStats?.silence_detected !== true) return false;
      if (e.total_interactions < 15) return false;
      // Full admission gate: reject entities that cannot produce executable artifacts
      const rejections = getEntityRejectionReasons(e, goals, decryptedSignals);
      return rejections.length === 0;
    })
    .sort((a, b) => b.total_interactions - a.total_interactions);

  for (const e of highValue.slice(0, 1)) {
    const daysSilent =
      e.last_interaction != null
        ? Math.floor((now - new Date(e.last_interaction).getTime()) / 86400000)
        : null;
    const silentStr = daysSilent != null ? `${daysSilent} days` : 'an extended period';
    const bx = (e.patterns as any)?.bx_stats;
    const count90 = (bx?.signal_count_90d ?? 0) as number;
    const baselinePer14d = count90 > 0 ? +(count90 * 14 / 90).toFixed(1) : +(e.total_interactions * 14 / 365).toFixed(1);

    const trigger: TriggerMetadata = {
      baseline_state: `${e.total_interactions} interactions total, ~${baselinePer14d}/14d baseline — one of your highest-value relationships`,
      current_state: `Complete silence for ${silentStr}`,
      delta: `${baselinePer14d}/14d → 0/14d (100% drop)`,
      timeframe: `Silent for ${silentStr}`,
      outcome_class: 'relationship',
      why_now: daysSilent != null && daysSilent > 90
        ? `${daysSilent} days of silence from a ${e.total_interactions}-interaction relationship — this is past the point of casual reconnection`
        : `High-value relationship (${e.total_interactions} interactions) went dark — every additional day of silence reduces recovery probability`,
    };

    results.push({
      id: `discrepancy_risk_${e.id}`,
      class: 'risk',
      title: `High-value relationship at risk: ${e.name}`,
      content:
        `${e.name} is one of your most connected relationships (${e.total_interactions} interactions, ~${baselinePer14d}/14d baseline) ` +
        `and has gone completely silent for ${silentStr}. ` +
        `Baseline → 0 is a 100% drop. Losing this relationship has significant downstream consequences.`,
      stakes: 5,
      urgency: daysSilent != null && daysSilent > 90 ? 0.85 : 0.70,
      suggestedActionType: 'send_message' as ActionType,
      evidence: JSON.stringify({
        baseline: `${baselinePer14d} interactions/14d`,
        current: '0 interactions/14d',
        delta_pct: -100,
        timeframe: `silent for ${silentStr}`,
        entity: e.name,
      } satisfies DeltaMetric),
      sourceSignals: [
        {
          kind: 'relationship',
          summary: `${e.name}: ${e.total_interactions} interactions, silent ${silentStr}`,
        },
      ],
      matchedGoal: null,
      entityName: e.name,
      trigger,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Extractor 6: engagement_collapse — velocity_ratio < 0.5 (measurable decline)
//
// Fires when a relationship's 14-day interaction rate has dropped ≥50% vs the
// 90-day baseline AND the relationship is not already flagged as silent.
// This is active deterioration: not silence, but measurable withdrawal.
// ---------------------------------------------------------------------------

function extractEngagementCollapse(entities: EntityRow[], selfEmails?: Set<string>, selfNameTokens?: string[]): Discrepancy[] {
  const results: Discrepancy[] = [];
  const candidates = entities
    .filter((e) => {
      if (isSelfEntity(e, selfEmails, selfNameTokens)) return false;
      const bx = (e.patterns as any)?.bx_stats;
      if (!bx) return false;
      return (
        typeof bx.velocity_ratio === 'number' &&
        bx.velocity_ratio < 0.5 &&
        (bx.signal_count_90d ?? 0) >= 8 &&   // meaningful 90-day history required
        !bx.silence_detected                   // not already caught by decay/risk
      );
    })
    .sort((a, b) => {
      // Sharpest drop first (lowest velocity_ratio)
      const ra = (a.patterns as any)?.bx_stats?.velocity_ratio ?? 1;
      const rb = (b.patterns as any)?.bx_stats?.velocity_ratio ?? 1;
      return ra - rb;
    });

  for (const e of candidates.slice(0, MAX_PER_CLASS)) {
    const bx = (e.patterns as any)?.bx_stats;
    const velocityRatio = bx.velocity_ratio as number;
    const count90 = (bx.signal_count_90d ?? 0) as number;
    const count14 = (bx.signal_count_14d ?? 0) as number;
    const deltaPercent = Math.round((1 - velocityRatio) * 100);
    const baselinePer14d = +(count90 * 14 / 90).toFixed(1);

    const delta: DeltaMetric = {
      baseline: `${baselinePer14d} interactions/14d (90-day avg)`,
      current: `${count14} interactions/14d`,
      delta_pct: -deltaPercent,
      timeframe: '14-day vs 90-day baseline',
      entity: e.name,
    };

    const trigger: TriggerMetadata = {
      baseline_state: `${baselinePer14d} interactions/14d (90-day average)`,
      current_state: `${count14} interactions/14d (velocity_ratio=${velocityRatio.toFixed(2)})`,
      delta: `${deltaPercent}% drop in engagement rate`,
      timeframe: '14-day vs 90-day baseline',
      outcome_class: 'relationship',
      why_now: velocityRatio < 0.3
        ? `${e.name} engagement dropped ${deltaPercent}% — this is active withdrawal, not gradual fade. Intervention now or relationship loss later.`
        : `${e.name} engagement rate halved vs baseline — the trend is accelerating downward`,
    };

    results.push({
      id: `discrepancy_collapse_${e.id}`,
      class: 'engagement_collapse',
      title: `Engagement collapsing: ${e.name}`,
      content:
        `Your interaction rate with ${e.name} has dropped ${deltaPercent}% vs the 90-day baseline. ` +
        `Baseline: ~${baselinePer14d} interactions per 14 days. Actual last 14 days: ${count14}. ` +
        `This is active withdrawal — the relationship is deteriorating in real time, not fading gradually.`,
      stakes: Math.min(5, Math.max(3, Math.floor(e.total_interactions / 8) + 2)),
      urgency: velocityRatio < 0.3 ? 0.85 : 0.75,
      suggestedActionType: 'send_message' as ActionType,
      evidence: JSON.stringify(delta),
      sourceSignals: [
        {
          kind: 'relationship',
          summary: `${e.name}: velocity_ratio=${velocityRatio.toFixed(2)}, ${count14}/14d vs ${baselinePer14d} baseline`,
        },
      ],
      matchedGoal: null,
      entityName: e.name,
      trigger,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Extractor 7: relationship_dropout — active 30–90d window, then complete stop
//
// Fires when an entity had 3+ interactions in the 30–90d window but zero in
// the last 30 days, and silence_detected is still false (not yet caught by
// decay/risk). This catches newer or lower-frequency relationships that made
// a discrete stop — something changed between then and now.
// ---------------------------------------------------------------------------

function extractRelationshipDropout(entities: EntityRow[], selfEmails?: Set<string>, selfNameTokens?: string[]): Discrepancy[] {
  const results: Discrepancy[] = [];
  const candidates = entities
    .filter((e) => {
      if (isSelfEntity(e, selfEmails, selfNameTokens)) return false;
      const bx = (e.patterns as any)?.bx_stats;
      if (!bx) return false;
      const count30 = (bx.signal_count_30d ?? -1) as number;
      const count90 = (bx.signal_count_90d ?? 0) as number;
      const priorWindow = count90 - Math.max(0, count30);
      return (
        count30 === 0 &&
        priorWindow >= 3 &&
        !bx.silence_detected  // not already caught by decay/risk
      );
    })
    .sort((a, b) => {
      // More prior activity = higher priority
      const bxA = (a.patterns as any)?.bx_stats;
      const bxB = (b.patterns as any)?.bx_stats;
      const priorA = (bxA?.signal_count_90d ?? 0) - (bxA?.signal_count_30d ?? 0);
      const priorB = (bxB?.signal_count_90d ?? 0) - (bxB?.signal_count_30d ?? 0);
      return priorB - priorA;
    });

  for (const e of candidates.slice(0, MAX_PER_CLASS)) {
    const bx = (e.patterns as any)?.bx_stats;
    const count90 = (bx.signal_count_90d ?? 0) as number;
    const count30 = (bx.signal_count_30d ?? 0) as number;
    const priorWindow = count90 - count30;
    const ageDays = (bx.open_loop_age_days ?? null) as number | null;
    const ageStr = ageDays != null ? `${ageDays} days` : 'an unknown period';

    const delta: DeltaMetric = {
      baseline: `${priorWindow} interactions in the 30–90 day window`,
      current: '0 interactions in the last 30 days',
      delta_pct: -100,
      timeframe: '30-day vs 30–90-day comparison window',
      entity: e.name,
    };

    const trigger: TriggerMetadata = {
      baseline_state: `${priorWindow} interactions in the 30–90 day window`,
      current_state: `0 interactions in the last 30 days`,
      delta: `${priorWindow} → 0 (100% drop, discrete stop)`,
      timeframe: '30-day vs 30–90-day comparison window',
      outcome_class: 'relationship',
      why_now: `${e.name} went from ${priorWindow} interactions to zero — this is a discrete break, not gradual. Last contact ${ageStr} ago.`,
    };

    results.push({
      id: `discrepancy_dropout_${e.id}`,
      class: 'relationship_dropout',
      title: `Contact stopped: ${e.name}`,
      content:
        `${e.name} had ${priorWindow} interactions in the 30–90 day window but zero contact in the last 30 days. ` +
        `Last seen ${ageStr} ago. This is not gradual drift — it is a discrete stop. ` +
        `Something changed. Either the relationship cooled on their end or you disengaged.`,
      stakes: Math.min(5, Math.max(3, Math.floor(priorWindow / 2) + 2)),
      urgency: (ageDays ?? 0) > 60 ? 0.80 : 0.72,
      suggestedActionType: 'send_message' as ActionType,
      evidence: JSON.stringify(delta),
      sourceSignals: [
        {
          kind: 'relationship',
          summary: `${e.name}: ${priorWindow} interactions 30–90d ago, 0 in last 30d, last seen ${ageStr} ago`,
        },
      ],
      matchedGoal: null,
      entityName: e.name,
      trigger,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Extractor 8: deadline_staleness — due ≤3 days + no movement in 3+ days
//
// Fires when a commitment is closing (due in 0–3 days) AND has had no update
// in 3+ days. The delta is: deadline proximity vs execution inertia.
// Different from exposure (which catches any deadline ≤7d with no artifact).
// This catches the specific pattern: deadline imminent, movement stopped.
// ---------------------------------------------------------------------------

function extractDeadlineStaleness(
  commitments: CommitmentRow[],
  goals: GoalRow[],
  now: number,
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  const urgent = commitments
    .filter((c) => {
      const dueAt = c.due_at ?? c.implied_due_at;
      if (!dueAt) return false;
      if (c.status === 'completed') return false;
      const dueMs = new Date(dueAt).getTime();
      const daysUntilDue = (dueMs - now) / 86400000;
      if (daysUntilDue < 0 || daysUntilDue > 3) return false;
      // Must be stalled: no update in 3+ days (or never updated)
      if (!c.updated_at) return true;
      return now - new Date(c.updated_at).getTime() >= threeDaysMs;
    })
    .sort((a, b) => {
      const aMs = new Date((a.due_at ?? a.implied_due_at)!).getTime();
      const bMs = new Date((b.due_at ?? b.implied_due_at)!).getTime();
      return aMs - bMs; // soonest deadline first
    });

  for (const c of urgent.slice(0, MAX_PER_CLASS)) {
    const dueAt = (c.due_at ?? c.implied_due_at)!;
    const daysUntilDue = Math.max(0, Math.floor((new Date(dueAt).getTime() - now) / 86400000));
    const stalledDays = c.updated_at
      ? Math.floor((now - new Date(c.updated_at).getTime()) / 86400000)
      : null;
    const stalledStr = stalledDays != null ? `${stalledDays} days` : 'an unknown period';

    const delta: DeltaMetric = {
      baseline: `Active commitment, last updated ${stalledStr} ago`,
      current: `${daysUntilDue} day(s) until deadline with no movement`,
      delta_pct: stalledDays != null
        ? -Math.round((stalledDays / Math.max(1, daysUntilDue + stalledDays)) * 100)
        : -100,
      timeframe: `${stalledStr} stalled with ${daysUntilDue}d remaining`,
    };

    const trigger: TriggerMetadata = {
      baseline_state: `Active commitment, last updated ${stalledStr} ago`,
      current_state: `${daysUntilDue} day(s) until deadline with no movement`,
      delta: `${stalledStr} stalled while deadline approaches (${daysUntilDue}d remaining)`,
      timeframe: `${stalledStr} stall, ${daysUntilDue}d to deadline`,
      outcome_class: 'deadline',
      why_now: daysUntilDue === 0
        ? `Deadline is TODAY and last movement was ${stalledStr} ago — execution gap is now visible to stakeholders`
        : `${daysUntilDue} day(s) remain and execution has been frozen for ${stalledStr} — the window is closing`,
    };

    results.push({
      id: `discrepancy_staleness_${c.id}`,
      class: 'deadline_staleness',
      title: `Deadline closing: ${c.description.slice(0, 60)}`,
      content:
        `"${c.description}" is due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} ` +
        `and has had no movement for ${stalledStr}. ` +
        `The execution window is closing with no observable progress. ` +
        `This is not a planning failure — it is an execution gap.`,
      stakes: 5,
      urgency: daysUntilDue === 0 ? 0.95 : daysUntilDue === 1 ? 0.90 : 0.82,
      suggestedActionType: 'write_document' as ActionType,
      evidence: JSON.stringify(delta),
      sourceSignals: [
        { kind: 'commitment', id: c.id, summary: c.description.slice(0, 160) },
      ],
      matchedGoal: matchGoal(c.description, goals),
      trigger,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Extractor 9: goal_velocity_mismatch — signal density dropped ≥50% vs baseline
//
// Compares how often goal keywords appear in the most recent 25 signals vs
// the historical window (signals 26–150 from the scorer's top-150 load).
// If the recent keyword density is less than 50% of the historical rate,
// the goal is losing momentum in observable behavior.
//
// Requires ≥50 total signals and ≥3 historical matches (meaningful baseline).
// ---------------------------------------------------------------------------

function extractGoalVelocityMismatch(
  goals: GoalRow[],
  decryptedSignals: string[],
): Discrepancy[] {
  const results: Discrepancy[] = [];
  // Need enough signals for a meaningful recent vs historical split
  if (decryptedSignals.length < 50) return results;

  // Signals are loaded most-recent-first by scorer; top 25 = most recent
  const recentSignals = decryptedSignals.slice(0, 25);
  const historicalSignals = decryptedSignals.slice(25);
  if (historicalSignals.length < 20) return results;

  // Check P1, P2, P3 goals — all high-enough priority to warrant velocity tracking
  const tracked = goals.filter((g) => g.priority <= 3);

  for (const g of tracked) {
    const gkws = textKeywords(g.goal_text);
    if (gkws.length < 2) continue;

    const minMatch = Math.min(2, gkws.length);
    const countMatches = (signals: string[]): number =>
      signals.filter((s) => {
        const lower = s.toLowerCase();
        return gkws.filter((kw) => lower.includes(kw)).length >= minMatch;
      }).length;

    const recentMatches = countMatches(recentSignals);
    const historicalMatches = countMatches(historicalSignals);

    // Need a real baseline — if goal was never active in history, drift catches it
    if (historicalMatches < 3) continue;

    const recentRate = recentMatches / recentSignals.length;
    const historicalRate = historicalMatches / historicalSignals.length;
    if (historicalRate === 0) continue;

    const velocityRatio = recentRate / historicalRate;
    if (velocityRatio >= 0.5) continue; // must be ≥50% drop

    const deltaPercent = Math.round((1 - velocityRatio) * 100);

    const delta: DeltaMetric = {
      baseline: `${historicalMatches} keyword matches in ${historicalSignals.length}-signal historical window`,
      current: `${recentMatches} matches in last 25 signals`,
      delta_pct: -deltaPercent,
      timeframe: 'recent 25 signals vs historical baseline',
    };

    const trigger: TriggerMetadata = {
      baseline_state: `${historicalMatches} goal-keyword matches across ${historicalSignals.length} historical signals`,
      current_state: `${recentMatches} matches in last 25 signals`,
      delta: `${deltaPercent}% drop in goal-aligned activity`,
      timeframe: 'recent 25 signals vs historical baseline',
      outcome_class: g.goal_category === 'financial' ? 'money' : g.goal_category === 'career' ? 'job' : 'risk',
      why_now: velocityRatio < 0.25
        ? `P${g.priority} goal "${g.goal_text.slice(0, 60)}" activity dropped ${deltaPercent}% — behavior has diverged from stated priority`
        : `Goal-aligned signal density halved — stated priority is drifting from observable action`,
    };

    results.push({
      id: `discrepancy_velocity_${g.goal_text.slice(0, 40).replace(/\W+/g, '_')}`,
      class: 'goal_velocity_mismatch',
      title: `Goal losing momentum: ${g.goal_text.slice(0, 60)}`,
      content:
        `Observable activity for "${g.goal_text}" has dropped ${deltaPercent}% in recent signals vs baseline. ` +
        `Historical density: ${historicalMatches} keyword matches across ${historicalSignals.length} signals. ` +
        `Recent: ${recentMatches} matches in the last 25 signals. ` +
        `Your stated priority is not tracking with your observable behavior — this is the gap.`,
      stakes: Math.max(3, 6 - g.priority), // P1 → 5, P2 → 4, P3 → 3
      urgency: velocityRatio < 0.25 ? 0.80 : 0.72,
      suggestedActionType: 'make_decision' as ActionType,
      evidence: JSON.stringify(delta),
      sourceSignals: [
        {
          kind: 'signal',
          summary: `Goal: ${g.goal_text.slice(0, 160)} — signal density dropped ${deltaPercent}%`,
        },
      ],
      matchedGoal: {
        text: g.goal_text,
        priority: g.priority,
        category: g.goal_category,
      },
      trigger,
    });

    if (results.length >= MAX_PER_CLASS) break;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Cross-source extractors (calendar / drive / conversation) — pure, no I/O
// ---------------------------------------------------------------------------

/** Parse calendar-style signal bodies for scorer and conflict detection. */
export function parseCalendarEventFromContent(content: string): {
  title: string;
  startMs: number;
  endMs: number;
  attendeeEmails: string[];
} | null {
  if (!content || content.length < 10) return null;
  const titleM = content.match(/\[Calendar event:\s*([^\]]+)\]/i);
  const title = (titleM?.[1] ?? 'Calendar event').trim();
  const startM = content.match(/Start:\s*(20\d{2}-\d{2}-\d{2}T[^\s\n]+)/i);
  const endM = content.match(/End:\s*(20\d{2}-\d{2}-\d{2}T[^\s\n]+)/i);
  let startMs: number;
  let endMs: number;
  if (startM && endM) {
    startMs = Date.parse(startM[1]);
    endMs = Date.parse(endM[1]);
  } else {
    const re = /\b(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?Z)\b/g;
    const hits: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const ms = Date.parse(m[1]);
      if (!Number.isNaN(ms)) hits.push(ms);
    }
    if (hits.length < 1) return null;
    startMs = hits[0];
    endMs = hits.length >= 2 ? hits[1] : startMs + 3600000;
  }
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  const attendeeEmails: string[] = [];
  const attLine = content.match(/Attendees?:\s*([^\n]+)/i);
  if (attLine) {
    const reEmail = /([\w.+-]+@[\w.-]+\.[a-z]{2,})/gi;
    let em: RegExpExecArray | null;
    while ((em = reEmail.exec(attLine[1])) !== null) attendeeEmails.push(em[1].toLowerCase());
  }
  return { title, startMs, endMs, attendeeEmails };
}

function normalizeInterviewToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeInterviewField(value: string | null | undefined): string {
  return normalizeInterviewToken(value ?? '');
}

function interviewTokens(value: string): string[] {
  const stopwords = new Set([
    'interview', 'panel', 'with', 'from', 'for', 'the', 'and', 'state', 'washington', 'candidate',
    'meeting', 'call', 'round', 'final', 'phone', 'screen', 'hiring',
  ]);
  return normalizeInterviewToken(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !stopwords.has(token));
}

function looksLikeInterviewSignal(content: string): boolean {
  return INTERVIEW_SIGNAL_PATTERN.test(content);
}

function isInterviewNoiseTitle(title: string): boolean {
  return INTERVIEW_NOISE_TITLE_PATTERN.test(title);
}

function extractSubjectFromSignal(content: string): string {
  const subjectMatch = content.match(/^Subject:\s*(.+)$/im);
  return (subjectMatch?.[1] ?? '').trim();
}

function extractInterviewFocusNotes(content: string): string[] {
  const notes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = INTERVIEW_DETAIL_PROMPT_PATTERN.exec(content)) !== null) {
    const note = match[1]?.trim().replace(/\s+/g, ' ');
    if (note) notes.push(note.replace(/[.;:]+$/, ''));
  }
  return [...new Set(notes)];
}

function extractInterviewContacts(content: string): string[] {
  const contacts = new Set<string>();
  const fromMatch = content.match(/^From:\s*([^<\n]+?)(?:\s*<|$)/im);
  if (fromMatch?.[1]) contacts.add(fromMatch[1].trim().replace(/\s+/g, ' '));

  const withMatches = content.match(/\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) ?? [];
  for (const raw of withMatches) {
    const cleaned = raw.replace(/^with\s+/i, '').trim();
    if (cleaned) contacts.add(cleaned);
  }

  return [...contacts];
}

function extractRoleFromInterviewText(text: string): string | null {
  const match = text.match(INTERVIEW_ROLE_PATTERN);
  return match?.[0]?.trim() ?? null;
}

function extractOrgFromInterviewText(text: string): string | null {
  const match = text.match(INTERVIEW_ORG_PATTERN);
  return match?.[0]?.trim() ?? null;
}

function splitInterviewTitle(title: string): { label: string; role: string | null; org: string | null } {
  const cleaned = title.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(/\s+(?:[-|]|—)\s+/).map((part) => part.trim()).filter(Boolean);
  const label = cleaned;
  const role = parts.map(extractRoleFromInterviewText).find(Boolean) ?? extractRoleFromInterviewText(cleaned);
  const org = parts.map(extractOrgFromInterviewText).find(Boolean) ?? extractOrgFromInterviewText(cleaned);
  return { label, role: role ?? null, org: org ?? null };
}

function formatInterviewDateKeyPt(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);
}

function interviewDateVariantsPt(ms: number): string[] {
  const formats: Intl.DateTimeFormatOptions[] = [
    { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' },
    { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric' },
    { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric' },
    { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' },
    { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric' },
    { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' },
  ];
  return [...new Set([
    formatInterviewDateKeyPt(ms),
    new Date(ms).toISOString().slice(0, 10),
    ...formats.map((format) => new Intl.DateTimeFormat('en-US', format).format(ms)),
  ].map(normalizeInterviewToken).filter(Boolean))];
}

function textMentionsInterviewDate(text: string, startMs: number): boolean {
  const normalized = normalizeInterviewToken(text);
  return interviewDateVariantsPt(startMs).some((variant) => normalized.includes(variant));
}

function hasInterviewConfirmationLanguage(text: string): boolean {
  return INTERVIEW_CONFIRMATION_PATTERN.test(text) && !INTERVIEW_SPECULATIVE_PATTERN.test(text);
}

function calendarConfirmationText(content: string): string {
  return content.replace(/\[Calendar event:\s*[^\]]+\]/ig, ' ');
}

function matchingInterviewEmailSignals(
  structured: StructuredSignalInput[],
  itemTitle: string,
  startMs: number,
): StructuredSignalInput[] {
  const titleTokens = interviewTokens(itemTitle);
  const parsedTitle = splitInterviewTitle(itemTitle);
  const expectedOrg = normalizeInterviewField(parsedTitle.org);
  const expectedRole = normalizeInterviewField(parsedTitle.role);
  return structured.filter((signal) => {
    if (!isEmailLikeSource(signal.source)) return false;
    const body = signal.content;
    if (!looksLikeInterviewSignal(body)) return false;
    const emailText = `${extractSubjectFromSignal(body)} ${body}`;
    if (!hasInterviewConfirmationLanguage(emailText)) return false;
    const normalized = normalizeInterviewToken(emailText);
    const overlap = titleTokens.filter((token) => normalized.includes(token)).length;
    const signalOrg = normalizeInterviewField(extractOrgFromInterviewText(emailText));
    const signalRole = normalizeInterviewField(extractRoleFromInterviewText(emailText));
    const dateMatch = textMentionsInterviewDate(emailText, startMs);
    const orgMatch = expectedOrg.length > 0 && signalOrg === expectedOrg;
    const roleMatch = expectedRole.length > 0 && signalRole === expectedRole;
    const conflictingOrg = expectedOrg.length > 0 && signalOrg.length > 0 && signalOrg !== expectedOrg;
    const conflictingRole = expectedRole.length > 0 && signalRole.length > 0 && signalRole !== expectedRole;

    if (conflictingOrg || conflictingRole) return false;
    if (!dateMatch) return false;
    return roleMatch || orgMatch || overlap >= 2;
  });
}

function calendarHasConfirmationQualityEvidence(
  content: string,
  itemTitle: string,
  startMs: number,
): boolean {
  const evidenceText = calendarConfirmationText(content);
  if (!hasInterviewConfirmationLanguage(evidenceText)) return false;
  if (!textMentionsInterviewDate(`${itemTitle}\n${evidenceText}`, startMs)) return false;

  const parsedTitle = splitInterviewTitle(itemTitle);
  const titleRole = normalizeInterviewField(parsedTitle.role);
  const titleOrg = normalizeInterviewField(parsedTitle.org);
  const evidenceRole = normalizeInterviewField(extractRoleFromInterviewText(evidenceText));
  const evidenceOrg = normalizeInterviewField(extractOrgFromInterviewText(evidenceText));
  const roleMatch = titleRole.length > 0 && evidenceRole === titleRole;
  const orgMatch = titleOrg.length > 0 && evidenceOrg === titleOrg;
  const conflictingRole = titleRole.length > 0 && evidenceRole.length > 0 && evidenceRole !== titleRole;
  const conflictingOrg = titleOrg.length > 0 && evidenceOrg.length > 0 && evidenceOrg !== titleOrg;

  if (conflictingRole || conflictingOrg) return false;
  return roleMatch && orgMatch;
}

function matchingInterviewEvidenceArtifacts(
  structured: StructuredSignalInput[],
  itemTitle: string,
  startMs: number,
): string[] {
  const labels = new Set<string>();
  const titleTokens = interviewTokens(itemTitle);
  const parsedTitle = splitInterviewTitle(itemTitle);
  const expectedOrg = normalizeInterviewField(parsedTitle.org);
  const expectedRole = normalizeInterviewField(parsedTitle.role);
  const earliestMs = startMs - FOURTEEN_DAYS_MS;
  const latestMs = startMs + 3 * 86400000;

  for (const signal of structured) {
    if (isChatConversationSignalSource(signal.source, signal.type)) continue;
    const occurredMs = new Date(signal.occurred_at).getTime();
    if (!Number.isFinite(occurredMs) || occurredMs < earliestMs || occurredMs > latestMs) continue;

    const bucket = sourceBucket(signal.source, signal.type, signal.content);
    let label = '';
    let artifactText = '';

    if (bucket === 'drive') {
      const meta = parseDriveMeta(signal.content);
      label = meta.title;
      artifactText = `${meta.title}\n${signal.content}`;
    } else if (isSentStructured(signal)) {
      const subject = extractSubjectFromSignal(signal.content);
      if (!subject) continue;
      label = subject;
      artifactText = `${subject}\n${signal.content}`;
    } else {
      continue;
    }

    if (!/\b(?:interview|form|forms|packet|questionnaire|resume|cover letter|accepted|availability|prep)\b/i.test(artifactText)) {
      continue;
    }

    const normalized = normalizeInterviewToken(artifactText);
    const overlap = titleTokens.filter((token) => normalized.includes(token)).length;
    const artifactOrg = normalizeInterviewField(extractOrgFromInterviewText(artifactText));
    const artifactRole = normalizeInterviewField(extractRoleFromInterviewText(artifactText));
    const orgMatch = expectedOrg.length > 0 && artifactOrg === expectedOrg;
    const roleMatch = expectedRole.length > 0 && artifactRole === expectedRole;
    const dateMatch = textMentionsInterviewDate(artifactText, startMs);

    if (!(roleMatch || orgMatch || overlap >= 2 || (dateMatch && (overlap >= 1 || roleMatch || orgMatch)))) {
      continue;
    }

    const cleaned = label.replace(/\s+/g, ' ').trim();
    if (cleaned) labels.add(cleaned);
  }

  return [...labels].slice(0, 4);
}

function buildInterviewWeekCluster(
  structured: StructuredSignalInput[],
  goals: GoalRow[],
  nowMs: number,
): Discrepancy[] {
  const horizon = nowMs + SEVEN_DAYS_MS;
  const interviewEvents: Array<{
    id: string;
    title: string;
    startMs: number;
    endMs: number;
    role: string | null;
    org: string | null;
    focusNotes: string[];
    contacts: string[];
    evidencedArtifacts: string[];
  }> = [];
  const excludedEvents: Array<{ startMs: number; title: string; reason: string }> = [];

  for (const signal of structured) {
    const src = signal.source.toLowerCase();
    const type = String(signal.type ?? '').toLowerCase();
    if (!src.includes('calendar') && !type.includes('calendar')) continue;
    const parsed = parseCalendarEventFromContent(signal.content);
    if (!parsed) continue;
    if (parsed.startMs < nowMs || parsed.startMs > horizon) continue;

    if (isInterviewNoiseTitle(parsed.title)) {
      excludedEvents.push({
        startMs: parsed.startMs,
        title: parsed.title,
        reason: 'non-interview personal event',
      });
      continue;
    }
    if (!looksLikeInterviewSignal(`${parsed.title}\n${signal.content}`)) continue;

    const matchingEmails = matchingInterviewEmailSignals(structured, parsed.title, parsed.startMs);
    const hasCalendarGrounding = calendarHasConfirmationQualityEvidence(
      signal.content,
      parsed.title,
      parsed.startMs,
    );
    if (matchingEmails.length === 0 && !hasCalendarGrounding) {
      excludedEvents.push({
        startMs: parsed.startMs,
        title: parsed.title,
        reason: 'insufficient interview confirmation grounding',
      });
      continue;
    }

    const combinedText = [
      parsed.title,
      signal.content,
      ...matchingEmails.map((email) => email.content),
    ].join('\n');
    const focusNotes = [
      ...extractInterviewFocusNotes(combinedText),
      ...matchingEmails.flatMap((email) => extractInterviewFocusNotes(email.content)),
    ];
    const contacts = [
      ...extractInterviewContacts(combinedText),
      ...matchingEmails.flatMap((email) => extractInterviewContacts(email.content)),
    ];
    const parsedTitle = splitInterviewTitle(parsed.title);

    interviewEvents.push({
      id: signal.id,
      title: parsedTitle.label,
      startMs: parsed.startMs,
      endMs: parsed.endMs,
      role: parsedTitle.role ?? extractRoleFromInterviewText(combinedText),
      org: parsedTitle.org ?? extractOrgFromInterviewText(combinedText),
      focusNotes: [...new Set(focusNotes)].slice(0, 3),
      contacts: [...new Set(contacts)].slice(0, 3),
      evidencedArtifacts: matchingInterviewEvidenceArtifacts(structured, parsed.title, parsed.startMs),
    });
  }

  if (interviewEvents.length < 2) return [];

  interviewEvents.sort((a, b) => a.startMs - b.startMs);
  excludedEvents.sort((a, b) => a.startMs - b.startMs);

  const first = interviewEvents[0];
  const last = interviewEvents[interviewEvents.length - 1];
  const ptWindowStart = formatInterviewDateKeyPt(first.startMs);
  const ptWindowEnd = formatInterviewDateKeyPt(last.startMs);

  const title = `Interview week cluster detected: ${interviewEvents.length} interviews scheduled ${ptWindowStart} to ${ptWindowEnd}`;
  const contentLines = [
    'INTERVIEW_WEEK_CLUSTER',
    `WINDOW_PT: ${ptWindowStart} || ${ptWindowEnd}`,
    `INTERVIEW_COUNT: ${interviewEvents.length}`,
    ...interviewEvents.map((event) =>
      `INTERVIEW_ITEM: ${[
        new Date(event.startMs).toISOString(),
        new Date(event.endMs).toISOString(),
        event.title,
        event.role ?? 'unknown role',
        event.org ?? 'unknown organization',
        event.focusNotes.join('; ') || 'no extra focus notes in signals',
        event.contacts.join('; ') || 'no named contact in signals',
      ].join(' || ')}`,
    ),
    ...interviewEvents
      .filter((event) => event.evidencedArtifacts.length > 0)
      .map((event) =>
        `INTERVIEW_EVIDENCE: ${[
          new Date(event.startMs).toISOString(),
          event.evidencedArtifacts.join('; '),
        ].join(' || ')}`,
      ),
    ...excludedEvents.slice(0, 8).map((event) =>
      `EXCLUDED_ITEM: ${[
        new Date(event.startMs).toISOString(),
        event.title,
        event.reason,
      ].join(' || ')}`,
    ),
  ];
  const matchedCareerGoal = matchGoal(
    [
      title,
      ...contentLines,
      ...interviewEvents.flatMap((event) => [event.role ?? '', event.org ?? '', event.title]),
    ].join(' '),
    goals.filter((goal) => goal.goal_category === 'career'),
  );

  return [
    {
      id: `discrepancy_bp_interview_week_${ptWindowStart}_${ptWindowEnd}`.replace(/[^a-z0-9_]+/gi, '_'),
      class: 'behavioral_pattern',
      title,
      content: contentLines.join('\n'),
      stakes: 5,
      urgency: 0.96,
      suggestedActionType: 'write_document',
      evidence: JSON.stringify({
        pattern: 'interview_week_cluster',
        window_pt_start: ptWindowStart,
        window_pt_end: ptWindowEnd,
        interview_count: interviewEvents.length,
        excluded_count: excludedEvents.length,
        grounding_rule: 'each included interview has confirmation-language email or calendar evidence with matching date plus exact role/org alignment',
      }),
      sourceSignals: interviewEvents.slice(0, 5).map((event) => ({
        kind: 'signal',
        id: event.id,
        summary: `${event.title} — ${formatInterviewDateKeyPt(event.startMs)}`,
      })),
      matchedGoal: matchedCareerGoal
        ? {
            text: matchedCareerGoal.text,
            priority: matchedCareerGoal.priority,
            category: matchedCareerGoal.category,
          }
        : null,
      trigger: {
        baseline_state: 'Interview threads and calendar events handled one by one',
        current_state: `${interviewEvents.length} interview signals land inside one Pacific-time workweek`,
        delta: 'multi-event interview stack requires one integrated preparation artifact',
        timeframe: `${ptWindowStart} to ${ptWindowEnd} PT`,
        outcome_class: 'job',
        why_now: 'Several real interview signals now share the same next-7-days window, so handling them separately hides reusable stories and lets personal calendar noise steal prep attention.',
      },
    },
  ];
}

function isEmailLikeSource(source: string): boolean {
  const s = source.toLowerCase();
  return s.includes('mail') || s.includes('gmail') || s.includes('inbox') || s === 'email' || s.includes('outlook');
}

function sourceBucket(
  source: string,
  type: string | null,
  content: string,
): 'email' | 'calendar' | 'drive' | 'conversation' | null {
  const s = source.toLowerCase();
  const t = (type ?? '').toLowerCase();
  if (s.includes('calendar') || t.includes('calendar')) return 'calendar';
  if (s.includes('drive') || s.includes('onedrive') || t.includes('file')) return 'drive';
  if (s.includes('claude') || s.includes('chatgpt') || t.includes('conversation')) return 'conversation';
  if (isEmailLikeSource(s) || content.includes('From:') || /^\s*re:\s*/im.test(content.slice(0, 120))) return 'email';
  return null;
}

function entityStakeFromTrust(tc: EntityRow['trust_class']): number {
  if (tc === 'trusted') return 4;
  if (tc === 'personal') return 2;
  return 1;
}

function meetingPrepUrgency(daysUntil: number): number {
  if (daysUntil <= 1) return 0.9;
  if (daysUntil <= 3) return 0.7;
  return 0.5;
}

function entityIdsForCalendarRow(
  evt: NonNullable<ReturnType<typeof parseCalendarEventFromContent>>,
  entities: EntityRow[],
): EntityRow[] {
  const emailSet = new Set(evt.attendeeEmails.map((e) => e.toLowerCase()));
  const matched: EntityRow[] = [];
  for (const e of entities) {
    const pe = e.primary_email?.toLowerCase();
    if (pe && emailSet.has(pe)) {
      matched.push(e);
      continue;
    }
    let hit = false;
    for (const em of e.emails ?? []) {
      if (emailSet.has(String(em).toLowerCase())) {
        matched.push(e);
        hit = true;
        break;
      }
    }
    if (hit) continue;
  }
  if (matched.length === 0) {
    const titleLow = evt.title.toLowerCase();
    for (const e of entities) {
      const nameLow = e.name.toLowerCase();
      if (nameLow.length >= 3 && titleLow.includes(nameLow)) matched.push(e);
    }
  }
  return matched;
}

function hasRecentEmailWithEntity(
  structured: StructuredSignalInput[],
  entity: EntityRow,
  nowMs: number,
): boolean {
  const since = nowMs - FOURTEEN_DAYS_MS;
  const nameLow = entity.name.toLowerCase();
  const tokens = nameLow.split(/\s+/).filter((t) => t.length >= 3);
  const emails = new Set(
    [entity.primary_email, ...(entity.emails ?? [])]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase()),
  );
  for (const s of structured) {
    if (!isEmailLikeSource(s.source)) continue;
    const t = new Date(s.occurred_at).getTime();
    if (t < since || t > nowMs) continue;
    const c = s.content.toLowerCase();
    if ([...emails].some((em) => em && c.includes(em))) return true;
    if (tokens.length > 0 && tokens.every((tok) => c.includes(tok))) return true;
  }
  return false;
}

function openThreadHeuristic(
  structured: StructuredSignalInput[],
  entity: EntityRow,
  nowMs: number,
): { subject: string } | null {
  const since = nowMs - 30 * 86400000;
  const nameLow = entity.name.toLowerCase();
  const tokens = nameLow.split(/\s+/).filter((t) => t.length >= 3);
  let best: StructuredSignalInput | null = null;
  let bestT = 0;
  for (const s of structured) {
    if (!isEmailLikeSource(s.source)) continue;
    const t = new Date(s.occurred_at).getTime();
    if (t < since || t > nowMs) continue;
    const c = s.content;
    if (!/\bre:\s*|^fwd?:\s*/im.test(c.slice(0, 200))) continue;
    if (tokens.length > 0 && tokens.every((tok) => c.toLowerCase().includes(tok))) {
      if (t >= bestT) {
        bestT = t;
        best = s;
      }
    }
  }
  if (!best) return null;
  const subj = best.content.split('\n')[0]?.slice(0, 120) ?? 'open thread';
  return { subject: subj };
}

function extractScheduleConflicts(structured: StructuredSignalInput[], nowMs: number): Discrepancy[] {
  const results: Discrepancy[] = [];
  const horizon = nowMs + SEVEN_DAYS_MS;
  const events: Array<{ id: string; parsed: NonNullable<ReturnType<typeof parseCalendarEventFromContent>> }> = [];
  for (const s of structured) {
    const src = s.source.toLowerCase();
    if (!src.includes('calendar') && !String(s.type ?? '').toLowerCase().includes('calendar')) continue;
    const parsed = parseCalendarEventFromContent(s.content);
    if (!parsed) continue;
    if (parsed.startMs < nowMs || parsed.startMs > horizon) continue;
    events.push({ id: s.id, parsed });
  }
  for (let i = 0; i < events.length && results.length < MAX_CROSS_CLASS; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i].parsed;
      const b = events[j].parsed;
      const overlap = a.startMs < b.endMs && b.startMs < a.endMs;
      if (!overlap) continue;
      const dateLabel = new Date(Math.min(a.startMs, b.startMs)).toISOString().slice(0, 10);
      const delta: DeltaMetric = {
        baseline: 'non-overlapping calendar commitments',
        current: `overlap: "${a.title}" vs "${b.title}"`,
        delta_pct: 100,
        timeframe: dateLabel,
      };
      const trigger: TriggerMetadata = {
        baseline_state: 'Non-overlapping calendar commitments',
        current_state: `Overlap: ${a.title} and ${b.title}`,
        delta: 'double-booked time window',
        timeframe: dateLabel,
        outcome_class: 'deadline',
        why_now:
          'Overlapping events force an explicit priority call — otherwise you default under pressure in the moment.',
      };
      results.push({
        id: `discrepancy_conflict_${events[i].id}_${events[j].id}`,
        class: 'schedule_conflict',
        title: `Overlapping events on ${dateLabel}`,
        content:
          `You have overlapping calendar commitments on ${dateLabel}: "${a.title}" and "${b.title}".`,
        stakes: 3,
        urgency: 0.75,
        suggestedActionType: 'write_document',
        evidence: JSON.stringify(delta),
        sourceSignals: [
          { kind: 'signal', id: events[i].id, summary: `[Calendar] ${a.title}` },
          { kind: 'signal', id: events[j].id, summary: `[Calendar] ${b.title}` },
        ],
        matchedGoal: null,
        trigger,
        scoringHints: { calendarStartMs: Math.min(a.startMs, b.startMs) },
      });
      if (results.length >= MAX_CROSS_CLASS) return results;
    }
  }
  return results;
}

function extractStaleDocuments(
  structured: StructuredSignalInput[],
  goals: GoalRow[],
  nowMs: number,
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const ninetyAgo = nowMs - 90 * 86400000;
  const weekMs = 7 * 86400000;
  const driveRows = structured.filter((s) => {
    const src = s.source.toLowerCase();
    const isDrive = src.includes('drive') || src.includes('onedrive');
    const t = (s.type ?? '').toLowerCase();
    return isDrive && (t.includes('file') || s.content.includes('[File:'));
  });
  const byFile = new Map<string, StructuredSignalInput[]>();
  for (const s of driveRows) {
    const fid = (s.source_id ?? s.id).toString();
    const arr = byFile.get(fid) ?? [];
    arr.push(s);
    byFile.set(fid, arr);
  }
  for (const [, rows] of byFile) {
    if (results.length >= MAX_CROSS_CLASS) break;
    const inWindow = rows.filter((r) => {
      const t = new Date(r.occurred_at).getTime();
      return t >= ninetyAgo && t <= nowMs;
    });
    if (inWindow.length < 3) continue;
    const times = inWindow.map((r) => new Date(r.occurred_at).getTime()).sort((a, b) => a - b);
    let burst = false;
    for (let i = 0; i < times.length; i++) {
      const windowEnd = times[i] + weekMs;
      const cnt = times.filter((t) => t >= times[i]! && t <= windowEnd).length;
      if (cnt >= 3) {
        burst = true;
        break;
      }
    }
    if (!burst) continue;
    const latest = times[times.length - 1]!;
    const idleMs = nowMs - latest;
    if (idleMs < FOURTEEN_DAYS_MS) continue;
    const titleM = inWindow[0].content.match(/\[File:\s*([^\]]+)\]/i);
    const fileTitle = (titleM?.[1] ?? 'Document').trim();
    const matched = matchGoal(`${fileTitle} ${inWindow[0].content}`, goals);
    const stakes = matched ? 4 : 2;
    const delta: DeltaMetric = {
      baseline: 'high edit velocity within one week',
      current: 'no touches for 14+ days after burst',
      delta_pct: -100,
      timeframe: 'last 90 days',
    };
    const trigger: TriggerMetadata = {
      baseline_state: `Active editing burst on ${fileTitle}`,
      current_state: 'Document idle for 14+ days after burst',
      delta: 'high edit velocity → sudden stop',
      timeframe: 'last 90 days',
      outcome_class: 'job',
      why_now:
        'Bursts that go cold often hide an implicit decision — archive, ship, or delegate before context is lost.',
    };
    const fid = (inWindow[0].source_id ?? inWindow[0].id).toString().replace(/\W/g, '_');
    results.push({
      id: `discrepancy_stale_${fid}`,
      class: 'stale_document',
      title: `Stale active document: ${fileTitle.slice(0, 60)}`,
      content:
        `"${fileTitle}" showed 3+ modifications within a week, then no activity for ${Math.floor(idleMs / 86400000)} days. ` +
        `Review, finish, or archive — ambiguity creates residue.`,
      stakes,
      urgency: 0.6,
      suggestedActionType: 'write_document',
      evidence: JSON.stringify(delta),
      sourceSignals: inWindow.slice(0, 3).map((r) => ({
        kind: 'signal',
        id: r.id,
        source: r.source,
        summary: r.content.slice(0, 200),
      })),
      matchedGoal: matched,
      trigger,
    });
  }
  return results;
}

function extractCalendarEntityGaps(
  structured: StructuredSignalInput[],
  entities: EntityRow[],
  nowMs: number,
  selfEmails?: Set<string>,
  selfNameTokens?: string[],
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const horizon = nowMs + SEVEN_DAYS_MS;
  for (const s of structured) {
    if (results.length >= MAX_CROSS_CLASS * 2) break;
    const src = s.source.toLowerCase();
    if (!src.includes('calendar') && !String(s.type ?? '').toLowerCase().includes('calendar')) continue;
    const evt = parseCalendarEventFromContent(s.content);
    if (!evt || evt.startMs < nowMs || evt.startMs > horizon) continue;
    const matchedEntities = entityIdsForCalendarRow(evt, entities);
    for (const ent of matchedEntities) {
      if (results.length >= MAX_CROSS_CLASS * 2) break;
      if (isSelfEntity(ent, selfEmails, selfNameTokens)) continue;
      const daysUntil = Math.max(0, Math.ceil((evt.startMs - nowMs) / 86400000));
      const openTh = openThreadHeuristic(structured, ent, nowMs);
      const recentEmail = hasRecentEmailWithEntity(structured, ent, nowMs);
      const lastIx = ent.last_interaction ? new Date(ent.last_interaction).getTime() : 0;
      const coldMeeting = lastIx > 0 && nowMs - lastIx >= 30 * 86400000;
      if (openTh && daysUntil <= 7) {
        const delta: DeltaMetric = {
          baseline: `Thread: ${openTh.subject}`,
          current: `Meeting in ${daysUntil}d with ${ent.name}`,
          delta_pct: 100,
          timeframe: `${daysUntil} day(s) to meeting`,
          entity: ent.name,
        };
        const trigger: TriggerMetadata = {
          baseline_state: 'Last inbound or reply thread still pending closure',
          current_state: `Meeting in ${daysUntil} day(s) with ${ent.name} while a titled thread remains open`,
          delta: 'open thread + approaching meeting → reply gap',
          timeframe: `${daysUntil} day(s) to meeting`,
          outcome_class: 'relationship',
          why_now:
            'The calendar event creates accountability — an unresolved thread before a hard date surfaces stall risk.',
        };
        results.push({
          id: `discrepancy_meeting_${ent.id}`,
          class: 'meeting_open_thread',
          title: `Open thread before meeting: ${ent.name}`,
          content:
            `Your meeting with ${ent.name} is in ${daysUntil} day(s). The last thread (${openTh.subject.slice(0, 80)}) still looks open — ` +
            `consider closing the loop before you sit down.`,
          stakes: entityStakeFromTrust(ent.trust_class),
          urgency: meetingPrepUrgency(daysUntil),
          suggestedActionType: 'send_message',
          evidence: JSON.stringify(delta),
          sourceSignals: [{ kind: 'signal', id: s.id, summary: `[Calendar] ${evt.title}` }],
          matchedGoal: null,
          entityName: ent.name,
          trigger,
          scoringHints: {
            calendarStartMs: evt.startMs,
            coldEntityMeetingBoost: coldMeeting,
          },
        });
        continue;
      }
      if (!recentEmail) {
        const primary = ent.primary_email ?? (ent.emails?.[0] ?? null);
        const delta: DeltaMetric = {
          baseline: 'email contact within 14d before meetings',
          current: 'zero matching email threads in 14d',
          delta_pct: -100,
          timeframe: `${daysUntil} day(s) until event`,
          entity: ent.name,
        };
        const trigger: TriggerMetadata = {
          baseline_state: 'Ongoing relationship signals expected before meetings',
          current_state: `Meeting in ${daysUntil} day(s) with ${ent.name} but no recent email thread`,
          delta: 'meeting scheduled → no preparatory email contact in 14d',
          timeframe: `${daysUntil} day(s) until event`,
          outcome_class: 'relationship',
          why_now:
            'A meeting is a forcing function — showing up without a recent thread increases misalignment and surprise risk.',
        };
        results.push({
          id: `discrepancy_prep_${ent.id}`,
          class: 'preparation_gap',
          title: `Pre-meeting gap: ${ent.name}`,
          content:
            `Meeting with ${ent.name} in ${daysUntil} day(s) (${evt.title}). No recent email thread in the last 14 days — ` +
            `consider a short check-in or shared agenda.`,
          stakes: entityStakeFromTrust(ent.trust_class),
          urgency: meetingPrepUrgency(daysUntil),
          suggestedActionType: primary ? 'send_message' : 'write_document',
          evidence: JSON.stringify(delta),
          sourceSignals: [{ kind: 'signal', id: s.id, summary: `[Calendar] ${evt.title}` }],
          matchedGoal: null,
          entityName: ent.name,
          trigger,
          scoringHints: {
            calendarStartMs: evt.startMs,
            coldEntityMeetingBoost: coldMeeting,
          },
        });
      }
    }
  }
  return results;
}

function parseDriveMeta(content: string): { title: string; sharedBy?: string } {
  const fileM = content.match(/\[File:\s*([^\]]+)\]/i);
  const title = (fileM?.[1] ?? 'Document').trim();
  const shareM = content.match(/Shared by:\s*([^\n]+)/i) ?? content.match(/Owner:\s*([^\n]+)/i);
  const sharedBy = shareM?.[1]?.trim();
  return { title, sharedBy };
}

function extractDocumentFollowupGaps(structured: StructuredSignalInput[], nowMs: number): Discrepancy[] {
  const results: Discrepancy[] = [];
  const fourteenAgo = nowMs - FOURTEEN_DAYS_MS;
  for (const s of structured) {
    if (results.length >= MAX_CROSS_CLASS) break;
    const src = s.source.toLowerCase();
    if (!src.includes('drive') && !src.includes('onedrive')) continue;
    const { title, sharedBy } = parseDriveMeta(s.content);
    if (!sharedBy || /^self$/i.test(sharedBy)) continue;
    const tok = sharedBy.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    let lastEmail = 0;
    for (const e of structured) {
      if (!isEmailLikeSource(e.source)) continue;
      const t = new Date(e.occurred_at).getTime();
      if (t < fourteenAgo || t > nowMs) continue;
      const c = e.content.toLowerCase();
      const titleFrag = title.toLowerCase().slice(0, Math.min(24, title.length));
      if (titleFrag.length >= 4 && tok.some((x) => c.includes(x)) && c.includes(titleFrag)) {
        lastEmail = Math.max(lastEmail, t);
      }
    }
    if (lastEmail === 0) continue;
    const daysSince = Math.floor((nowMs - lastEmail) / 86400000);
    if (daysSince < 5) continue;
    const delta: DeltaMetric = {
      baseline: `Received/stored "${title}" linked to ${sharedBy}`,
      current: `no follow-up email in ${daysSince}d`,
      delta_pct: -100,
      timeframe: `${daysSince} days`,
      entity: sharedBy,
    };
    const trigger: TriggerMetadata = {
      baseline_state: `File linked to ${sharedBy}`,
      current_state: `No follow-up email in ${daysSince} days referencing this doc`,
      delta: 'shared artifact → communication drop-off',
      timeframe: '14 days',
      outcome_class: 'relationship',
      why_now:
        'Shared documents without follow-through often mean an implicit commitment in-thread was never closed.',
    };
    results.push({
      id: `discrepancy_docfu_${s.id.replace(/\W/g, '_')}`,
      class: 'document_followup_gap',
      title: `Document follow-up: ${title.slice(0, 40)}`,
      content:
        `You received or stored "${title}" tied to ${sharedBy}. No follow-up inbound or outbound referencing it for ${daysSince} days.`,
      stakes: 2,
      urgency: 0.55,
      suggestedActionType: 'send_message',
      evidence: JSON.stringify(delta),
      sourceSignals: [{ kind: 'signal', id: s.id, summary: s.content.slice(0, 160) }],
      matchedGoal: null,
      entityName: sharedBy,
      trigger,
    });
  }
  return results;
}

const INTENT_PHRASE_RE =
  /\b(?:i\s+(?:should|need\s+to|must|have\s+to|will)|remind\s+me\s+to)\s+([^\n.]{4,120})/gi;

function extractUnresolvedIntent(
  structured: StructuredSignalInput[],
  entities: EntityRow[],
  recentDirectives: RecentDirectiveInput[],
  nowMs: number,
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const sevenMs = 7 * 86400000;
  for (const s of structured) {
    if (results.length >= MAX_CROSS_CLASS) break;
    const src = s.source.toLowerCase();
    if (!src.includes('claude') && !src.includes('chatgpt')) continue;
    const text = s.content;
    INTENT_PHRASE_RE.lastIndex = 0;
    const m = INTENT_PHRASE_RE.exec(text);
    if (!m) continue;
    const phrase = m[1].trim();
    const textLow = text.toLowerCase();
    let hitEntity: EntityRow | null = null;
    for (const e of entities) {
      const n = e.name.toLowerCase();
      if (n.length >= 3 && textLow.includes(n)) {
        hitEntity = e;
        break;
      }
    }
    const tSig = new Date(s.occurred_at).getTime();
    if (nowMs < tSig + sevenMs) continue;
    const windowEnd = tSig + sevenMs;
    const phraseToks = phrase
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    const covered = recentDirectives.some((d) => {
      const td = new Date(d.generated_at).getTime();
      if (td < tSig || td > windowEnd) return false;
      const dl = d.directive_text.toLowerCase();
      return phraseToks.length > 0 && phraseToks.filter((w) => dl.includes(w)).length >= Math.min(2, phraseToks.length);
    });
    if (covered) continue;
    let preferred: ActionType = 'make_decision';
    if (hitEntity) preferred = 'send_message';
    else if (
      /\b(?:by\s+(?:mon|tue|wed|thu|fri|sat|sun)|today|tomorrow|this week|before\s+\w+)\b/i.test(phrase)
    )
      preferred = 'schedule';
    const delta: DeltaMetric = {
      baseline: 'user-stated intent in assistant chat',
      current: 'no matching directive within 7d after chat',
      delta_pct: -100,
      timeframe: '7 days',
      entity: hitEntity?.name,
    };
    const trigger: TriggerMetadata = {
      baseline_state: `Conversation captured intent: ${phrase.slice(0, 80)}`,
      current_state: 'No follow-on directive detected within 7 days after the conversation',
      delta: 'stated intent → no system action',
      timeframe: '7 days',
      outcome_class: 'risk',
      why_now:
        'The user externalized a concrete next step to the assistant — without a directive, it stays imaginary.',
    };
    results.push({
      id: `discrepancy_intent_${s.id.replace(/\W/g, '_')}`,
      class: 'unresolved_intent',
      title: `Unresolved assistant intent`,
      content:
        `You discussed doing something in an assistant chat (${phrase.slice(0, 100)}). ` +
        `No matching directive was recorded in the seven days immediately after that conversation.`,
      stakes: 3,
      urgency: 0.65,
      suggestedActionType: 'make_decision',
      evidence: JSON.stringify(delta),
      sourceSignals: [{ kind: 'signal', id: s.id, source: s.source, summary: text.slice(0, 220) }],
      matchedGoal: null,
      entityName: hitEntity?.name,
      trigger,
      discrepancyPreferredAction: preferred,
    });
  }
  return results;
}

function extractConvergence(structured: StructuredSignalInput[], entities: EntityRow[], nowMs: number, selfEmails?: Set<string>, selfNameTokens?: string[]): Discrepancy[] {
  const results: Discrepancy[] = [];
  const since = nowMs - FOURTEEN_DAYS_MS;
  for (const ent of entities) {
    if (results.length >= MAX_CROSS_CLASS) break;
    if (isSelfEntity(ent, selfEmails, selfNameTokens)) continue;
    const n = ent.name.toLowerCase();
    if (n.length < 3) continue;
    const tokens = n.split(/\s+/).filter((t) => t.length >= 3);
    const buckets = new Set<'email' | 'calendar' | 'drive' | 'conversation'>();
    const samples: StructuredSignalInput[] = [];
    for (const s of structured) {
      const t = new Date(s.occurred_at).getTime();
      if (t < since || t > nowMs) continue;
      const c = s.content.toLowerCase();
      if (!tokens.every((tok) => c.includes(tok))) continue;
      const b = sourceBucket(s.source, s.type, s.content);
      if (b) {
        buckets.add(b);
        if (samples.length < 4) samples.push(s);
      }
    }
    if (buckets.size < 3) continue;
    const email = ent.primary_email ?? ent.emails?.[0];
    const delta: DeltaMetric = {
      baseline: 'low cross-channel density',
      current: `${buckets.size} distinct sources in 14d`,
      delta_pct: 100,
      timeframe: '14 days',
      entity: ent.name,
    };
    const trigger: TriggerMetadata = {
      baseline_state: 'Low cross-channel density',
      current_state: `${ent.name} appears across: ${[...buckets].sort().join(', ')}`,
      delta: 'multi-source convergence in a short window',
      timeframe: '14 days',
      outcome_class: 'risk',
      why_now:
        'When the same person hits email, calendar, and files in one window, multiple threads are threading without a single owner.',
    };
    results.push({
      id: `discrepancy_conv_${ent.id}`,
      class: 'convergence',
      title: `Cross-channel density: ${ent.name}`,
      content:
        `${ent.name} appeared in your signals across ${[...buckets].join(', ')} within two weeks. ` +
        `There may be an unaddressed thread — consider one consolidating message or memo.`,
      stakes: 4,
      urgency: 0.8,
      suggestedActionType: email ? 'send_message' : 'write_document',
      evidence: JSON.stringify(delta),
      sourceSignals: samples.slice(0, 3).map((r) => ({
        kind: 'signal',
        id: r.id,
        source: r.source,
        summary: r.content.slice(0, 140),
      })),
      matchedGoal: null,
      entityName: ent.name,
      trigger,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Behavioral patterns — cross-signal recognition (not structural gaps)
// ---------------------------------------------------------------------------

const THIRTY_DAYS_MS = 30 * 86400000;
const FORTY_FIVE_DAYS_MS = 45 * 86400000;
const MAX_BEHAVIORAL_PER_PATTERN = 2;
const MAX_BEHAVIORAL_TOTAL = 6;

const CROSS_ENTITY_THEMES = ['follow up', 'waiting on', 'deadline', 'overdue'] as const;

function isSentStructured(s: StructuredSignalInput): boolean {
  const src = s.source.toLowerCase();
  const t = (s.type ?? '').toLowerCase();
  if (t === 'email_sent' || src === 'email_sent') return true;
  if (src.includes('outlook_sent')) return true;
  return false;
}

function isReceivedStructured(s: StructuredSignalInput): boolean {
  const src = s.source.toLowerCase();
  const t = (s.type ?? '').toLowerCase();
  if (t === 'email_received' || src === 'email_received') return true;
  if (src.includes('outlook') && !src.includes('sent')) return true;
  return false;
}

function entityTokens(ent: EntityRow): string[] {
  return ent.name.toLowerCase().split(/\s+/).filter((x) => x.length >= 3);
}

function contentHitsEntity(content: string, ent: EntityRow): boolean {
  const c = content.toLowerCase();
  const toks = entityTokens(ent);
  if (toks.length === 0) return false;
  return toks.every((t) => c.includes(t));
}

function parseEmailsFromText(line: string | undefined): string[] {
  if (!line) return [];
  const out: string[] = [];
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) out.push(m[0].toLowerCase());
  return out;
}

/** Parsed sender hints for an email-like structured signal (author + From line only). */
function fromLineAndEmails(s: StructuredSignalInput): { fromBlob: string; emails: string[]; hasExplicitFrom: boolean } {
  const fromLine = s.content.match(/(?:^|\n)From:\s*(.+?)(?:\n|$)/im)?.[1]?.trim() ?? '';
  const author = (s.author ?? '').trim();
  const hasExplicitFrom = Boolean(fromLine) || Boolean(author && author.toLowerCase() !== 'self');
  const fromBlob = `${author}\n${fromLine}`.toLowerCase();
  const emails = [...new Set([...parseEmailsFromText(author), ...parseEmailsFromText(fromLine)])];
  return { fromBlob, emails, hasExplicitFrom };
}

/**
 * True when this inbound signal's sender (From / author) is the given entity — not merely a mention
 * in To/Cc/body (fixes "received from yourself" when the user's name only appears as recipient).
 */
function entityMatchesInboundSender(ent: EntityRow, s: StructuredSignalInput): boolean {
  const { fromBlob, emails, hasExplicitFrom } = fromLineAndEmails(s);
  const entEmails = [ent.primary_email, ...(ent.emails ?? [])]
    .filter((x): x is string => Boolean(x))
    .map((e) => e.toLowerCase());
  if (entEmails.length > 0 && emails.some((e) => entEmails.includes(e))) return true;
  const toks = entityTokens(ent);
  if (toks.length > 0 && toks.every((t) => fromBlob.includes(t))) return true;
  if (!hasExplicitFrom) {
    return contentHitsEntity(s.content, ent);
  }
  return false;
}

/**
 * Inbound signal whose From/author is the account owner (same mailbox) — must not count as
 * "received from" a contact (avoids self-reply / sent-to-self false avoidance).
 */
function isInboundAuthoredBySelf(s: StructuredSignalInput, selfEmails: Set<string> | undefined): boolean {
  if (!selfEmails || selfEmails.size === 0) return false;
  const auth = (s.author ?? '').trim().toLowerCase();
  if (auth === 'self') return true;
  for (const e of parseEmailsFromText(auth)) {
    if (selfEmails.has(e)) return true;
  }
  const fromLine = s.content.match(/(?:^|\n)From:\s*(.+?)(?:\n|$)/im)?.[1];
  return parseEmailsFromText(fromLine).some((e) => selfEmails.has(e));
}

function isSelfEntity(ent: EntityRow, selfEmails?: Set<string>, selfNameTokens?: string[]): boolean {
  // Email-based match (primary path)
  if (selfEmails && selfEmails.size > 0) {
    if (ent.primary_email && selfEmails.has(ent.primary_email.toLowerCase())) return true;
    if (ent.emails) {
      for (const e of ent.emails) {
        if (selfEmails.has(e.toLowerCase())) return true;
      }
    }
  }
  // Name-based match: entity whose name is a subset of the user's own name tokens
  // (catches "Brandon D Kapp", "Brandon", "B Kapp", etc. — no email, same person)
  if (selfNameTokens && selfNameTokens.length >= 2) {
    const entTokens = ent.name.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    if (entTokens.length >= 2) {
      const matchedTokens = entTokens.filter(t => selfNameTokens.includes(t));
      // If ≥2 name tokens match, treat as self
      if (matchedTokens.length >= 2) return true;
    }
  }
  return false;
}

function countReceivedForEntity(
  structured: StructuredSignalInput[],
  ent: EntityRow,
  nowMs: number,
  sinceMs: number,
  selfEmails?: Set<string>,
): { count: number; sampleId: string | null } {
  let count = 0;
  let sampleId: string | null = null;
  for (const s of structured) {
    if (!isReceivedStructured(s)) continue;
    if (isInboundAuthoredBySelf(s, selfEmails)) continue;
    if (isLikelyAutomatedTransactionalInbound(s.content)) continue;
    const t = new Date(s.occurred_at).getTime();
    if (t < sinceMs || t > nowMs) continue;
    if (!entityMatchesInboundSender(ent, s)) continue;
    count++;
    if (!sampleId) sampleId = s.id;
  }
  return { count, sampleId };
}

function countSentForEntity(
  structured: StructuredSignalInput[],
  ent: EntityRow,
  nowMs: number,
  sinceMs: number,
): number {
  let n = 0;
  for (const s of structured) {
    if (!isSentStructured(s)) continue;
    const t = new Date(s.occurred_at).getTime();
    if (t < sinceMs || t > nowMs) continue;
    if (!contentHitsEntity(s.content, ent)) continue;
    n++;
  }
  return n;
}

function hasReplySignalForEntity(
  structured: StructuredSignalInput[],
  ent: EntityRow,
  nowMs: number,
  sinceMs: number,
): boolean {
  for (const s of structured) {
    if ((s.type ?? '').toLowerCase() !== 'response_pattern') continue;
    const t = new Date(s.occurred_at).getTime();
    if (t < sinceMs || t > nowMs) continue;
    if (!contentHitsEntity(s.content, ent)) continue;
    const c = s.content.toLowerCase();
    if (/\bunreplied|no reply|0\s*repl/i.test(c)) continue;
    if (/\breplied|you sent|outbound|sent reply/i.test(c)) return true;
  }
  return false;
}

function entityInGoalOrCommitment(ent: EntityRow, goals: GoalRow[], commitments: CommitmentRow[]): boolean {
  const tok = entityTokens(ent);
  if (goals.some((g) => tok.some((t) => g.goal_text.toLowerCase().includes(t)))) return true;
  if (commitments.some((c) => tok.some((t) => c.description.toLowerCase().includes(t)))) return true;
  return false;
}

function goalLinkedEntities(goal: GoalRow, entities: EntityRow[]): EntityRow[] {
  const g = goal.goal_text.toLowerCase();
  return entities.filter((e) => entityTokens(e).some((t) => g.includes(t)));
}

function pickTopBehavioral(candidates: Discrepancy[], limit: number): Discrepancy[] {
  return [...candidates]
    .sort((a, b) => b.urgency * b.stakes - a.urgency * a.stakes)
    .slice(0, limit);
}

/**
 * Cross-signal behavioral patterns (not single-signal structural gaps).
 * Pure function — no I/O. At most 2 candidates per pattern, 6 total.
 */
export function extractBehavioralPatterns(
  entities: EntityRow[],
  goals: GoalRow[],
  commitments: CommitmentRow[],
  structured: StructuredSignalInput[],
  recentDirectives: RecentDirectiveInput[],
  decryptedSignals: string[],
  nowMs: number,
  selfEmails?: Set<string>,
  selfNameTokens?: string[],
): Discrepancy[] {
  const since14 = nowMs - FOURTEEN_DAYS_MS;
  const since7 = nowMs - SEVEN_DAYS_MS;
  const win15to45Start = nowMs - FORTY_FIVE_DAYS_MS;
  const win15to45End = nowMs - 15 * 86400000;
  const since30 = nowMs - THIRTY_DAYS_MS;

  const patternBuckets: Discrepancy[][] = [[], [], [], [], [], []];

  // --- PATTERN 1: goal–behavior contradiction (goals with priority >= 3 on 1–5 scale) ---
  const p1Goals = goals.filter((g) => g.priority >= 3);
  for (const g of p1Goals) {
    const gkws = textKeywords(g.goal_text);
    const linked = goalLinkedEntities(g, entities);
    if (linked.length === 0) continue;
    for (const ent of linked) {
      if (isSelfEntity(ent, selfEmails, selfNameTokens)) continue;
      const { count: recv, sampleId } = countReceivedForEntity(structured, ent, nowMs, since14, selfEmails);
      if (recv < 3) continue;
      const sent = countSentForEntity(structured, ent, nowMs, since14);
      if (sent > 0) continue;
      const goalKwOnInbound = structured.some((s) => {
        if (!isReceivedStructured(s)) return false;
        if (isInboundAuthoredBySelf(s, selfEmails)) return false;
        if (isLikelyAutomatedTransactionalInbound(s.content)) return false;
        const t = new Date(s.occurred_at).getTime();
        if (t < since14 || t > nowMs) return false;
        if (!entityMatchesInboundSender(ent, s)) return false;
        const low = s.content.toLowerCase();
        return gkws.some((kw) => low.includes(kw));
      });
      if (!goalKwOnInbound) continue;

      const shortGoal = g.goal_text.slice(0, 80);
      const title = `Goal '${shortGoal}' has zero outbound action in 14 days despite ${recv} inbound signals`;
      const evidenceObj = {
        pattern: 'goal_behavior_contradiction',
        goal: g.goal_text,
        entity: ent.name,
        inbound_14d: recv,
        outbound_14d: sent,
      };
      const trigger: TriggerMetadata = {
        baseline_state: `Active inbound threading on ${ent.name} aligned with goal keywords`,
        current_state: `Zero outbound sends to ${ent.name} in 14 days despite ${recv} inbound signals`,
        delta: `inbound ${recv} → outbound 0 (goal: ${shortGoal})`,
        timeframe: '14 days',
        outcome_class: g.goal_category === 'financial' ? 'money' : g.goal_category === 'career' ? 'job' : 'risk',
        why_now: `Stated goal "${shortGoal}" is visible in your priorities, but outbound behavior toward ${ent.name} shows avoidance — the pattern is visible across signals even if each inbox item felt small.`,
      };
      const primary = ent.primary_email ?? ent.emails?.[0];
      patternBuckets[0].push({
        id: `discrepancy_bp_goal_${ent.id}_${g.goal_text.slice(0, 24).replace(/\W+/g, '_')}`,
        class: 'behavioral_pattern',
        title,
        content: title,
        stakes: Math.min(5, Math.max(1, g.priority)),
        urgency: 0.85,
        suggestedActionType: primary ? 'send_message' : 'write_document',
        evidence: JSON.stringify(evidenceObj),
        sourceSignals: sampleId
          ? [{ kind: 'signal', id: sampleId, summary: `Inbound pattern: ${ent.name}` }]
          : [{ kind: 'signal', summary: `Inbound pattern: ${ent.name}` }],
        matchedGoal: { text: g.goal_text, priority: g.priority, category: g.goal_category },
        entityName: ent.name,
        trigger,
      });
      break;
    }
  }
  patternBuckets[0] = pickTopBehavioral(patternBuckets[0], MAX_BEHAVIORAL_PER_PATTERN);

  // --- PATTERN 2: repeated avoidance ---
  for (const ent of entities) {
    if (isSelfEntity(ent, selfEmails, selfNameTokens)) continue;
    const { count: recv, sampleId } = countReceivedForEntity(structured, ent, nowMs, since14, selfEmails);
    if (recv < 3) continue;
    if (countSentForEntity(structured, ent, nowMs, since14) > 0) continue;
    if (hasReplySignalForEntity(structured, ent, nowMs, since14)) continue;

    const linked = entityInGoalOrCommitment(ent, goals, commitments);
    const stakes = linked ? 4 : 3;
    const urgency = linked ? 0.9 : 0.85;
    const title = `${recv} received from ${ent.name}, 0 replies in 14 days`;
    const evidenceObj = {
      pattern: 'repeated_avoidance',
      entity: ent.name,
      received_14d: recv,
      replies_14d: 0,
      linked_to_goal_or_commitment: linked,
    };
    const trigger: TriggerMetadata = {
      baseline_state: `Sustained inbound volume from ${ent.name} (${recv} signals in 14d)`,
      current_state: 'No outbound sends and no logged reply pattern in the same window',
      delta: `${recv} inbound → 0 outbound/reply (same window)`,
      timeframe: '14 days',
      outcome_class: 'relationship',
      why_now: `Multiple separate inbound signals from ${ent.name} without any reply form a repeatable avoidance pattern — not a single missed email.`,
    };
    patternBuckets[1].push({
      id: `discrepancy_bp_avoid_${ent.id}`,
      class: 'behavioral_pattern',
      title,
      content: title,
      stakes,
      urgency,
      suggestedActionType: 'send_message',
      evidence: JSON.stringify(evidenceObj),
      sourceSignals: sampleId
        ? [{ kind: 'signal', id: sampleId, summary: `${recv} inbound from ${ent.name}` }]
        : [{ kind: 'signal', summary: `${recv} inbound from ${ent.name}` }],
      matchedGoal: null,
      entityName: ent.name,
      trigger,
    });
  }
  patternBuckets[1] = pickTopBehavioral(patternBuckets[1], MAX_BEHAVIORAL_PER_PATTERN);

  // --- PATTERN 3: momentum then silence (raw counts, not bx_stats) ---
  for (const ent of entities) {
    let hi = 0;
    let lo = 0;
    let sampleHi: string | null = null;
    for (const s of structured) {
      if (!contentHitsEntity(s.content, ent)) continue;
      const t = new Date(s.occurred_at).getTime();
      if (t >= win15to45Start && t <= win15to45End) {
        hi++;
        if (!sampleHi) sampleHi = s.id;
      } else if (t >= since14 && t <= nowMs) {
        lo++;
      }
    }
    const weeksMid = 30 / 7;
    const rateMid = hi / weeksMid;
    const rateRecent = lo / 2;
    if (hi < 9 || lo > 1) continue;
    const title = `${ent.name} had ${rateMid.toFixed(1)} signals/week, now ${rateRecent.toFixed(1)}/week — momentum lost`;
    const stakes = Math.min(5, Math.max(3, Math.min(4, 2 + Math.floor(ent.total_interactions / 10))));
    const evidenceObj = {
      pattern: 'momentum_then_silence',
      entity: ent.name,
      signals_mid_window: hi,
      signals_last_14d: lo,
      rate_mid_per_week: +rateMid.toFixed(2),
      rate_recent_per_week: +rateRecent.toFixed(2),
    };
    const trigger: TriggerMetadata = {
      baseline_state: `${hi} signals in the 15–45 day lookback (~${rateMid.toFixed(1)}/wk)`,
      current_state: `${lo} signal(s) in the last 14 days (~${rateRecent.toFixed(1)}/wk)`,
      delta: 'high cross-signal cadence → near-stop (raw counts, all types)',
      timeframe: '15–45d vs last 14d',
      outcome_class: 'relationship',
      why_now: `Activity with ${ent.name} did not taper — it fell off a cliff when comparing mid-window density to the last two weeks.`,
    };
    const primary = ent.primary_email ?? ent.emails?.[0];
    patternBuckets[2].push({
      id: `discrepancy_bp_mom_${ent.id}`,
      class: 'behavioral_pattern',
      title,
      content: title,
      stakes,
      urgency: 0.8,
      suggestedActionType: primary ? 'send_message' : 'write_document',
      evidence: JSON.stringify(evidenceObj),
      sourceSignals: sampleHi
        ? [{ kind: 'signal', id: sampleHi, summary: `Momentum drop: ${ent.name}` }]
        : [{ kind: 'signal', summary: `Momentum drop: ${ent.name}` }],
      matchedGoal: null,
      entityName: ent.name,
      trigger,
    });
  }
  for (const g of goals) {
    const gkws = textKeywords(g.goal_text);
    if (gkws.length < 2) continue;
    const minM = Math.min(2, gkws.length);
    let hi = 0;
    let lo = 0;
    let sampleHi: string | null = null;
    for (const s of structured) {
      const low = s.content.toLowerCase();
      if (gkws.filter((kw) => low.includes(kw)).length < minM) continue;
      const t = new Date(s.occurred_at).getTime();
      if (t >= win15to45Start && t <= win15to45End) {
        hi++;
        if (!sampleHi) sampleHi = s.id;
      } else if (t >= since14 && t <= nowMs) {
        lo++;
      }
    }
    const weeksMid = 30 / 7;
    const rateMid = hi / weeksMid;
    const rateRecent = lo / 2;
    if (hi < 9 || lo > 1) continue;
    const label = g.goal_text.slice(0, 48);
    const title = `Goal "${label}" had ${rateMid.toFixed(1)} signals/week, now ${rateRecent.toFixed(1)}/week — momentum lost`;
    const evidenceObj = {
      pattern: 'momentum_then_silence_goal',
      goal: g.goal_text,
      signals_mid_window: hi,
      signals_last_14d: lo,
    };
    const trigger: TriggerMetadata = {
      baseline_state: `${hi} goal-aligned signals in 15–45d lookback`,
      current_state: `${lo} goal-aligned signal(s) in last 14d`,
      delta: 'goal-tagged activity dense then sparse (raw signal counts)',
      timeframe: '15–45d vs last 14d',
      outcome_class: g.goal_category === 'financial' ? 'money' : 'job',
      why_now: `Your stated goal "${label}" had consistent signal density mid-window, then nearly stopped — the cross-signal pattern is the story.`,
    };
    patternBuckets[2].push({
      id: `discrepancy_bp_momgoal_${g.goal_text.slice(0, 30).replace(/\W+/g, '_')}`,
      class: 'behavioral_pattern',
      title,
      content: title,
      stakes: Math.max(3, Math.min(4, 6 - g.priority)),
      urgency: 0.8,
      suggestedActionType: 'write_document',
      evidence: JSON.stringify(evidenceObj),
      sourceSignals: sampleHi
        ? [{ kind: 'signal', id: sampleHi, summary: `Goal momentum: ${label}` }]
        : [{ kind: 'signal', summary: `Goal momentum: ${label}` }],
      matchedGoal: { text: g.goal_text, priority: g.priority, category: g.goal_category },
      trigger,
    });
  }
  patternBuckets[2] = pickTopBehavioral(patternBuckets[2], MAX_BEHAVIORAL_PER_PATTERN);

  // --- PATTERN 4: cross-entity theme (30d structured + decrypted substring) ---
  for (const theme of CROSS_ENTITY_THEMES) {
    const hitEntities: EntityRow[] = [];
    const sampleIds: string[] = [];
    for (const ent of entities) {
      if (isSelfEntity(ent, selfEmails, selfNameTokens)) continue; // never include the account owner as a "contact"
      let hit = false;
      for (const s of structured) {
        const t = new Date(s.occurred_at).getTime();
        if (t < since30 || t > nowMs) continue;
        const low = s.content.toLowerCase();
        if (!low.includes(theme)) continue;
        if (!contentHitsEntity(s.content, ent)) continue;
        hit = true;
        sampleIds.push(s.id);
        break;
      }
      if (!hit && decryptedSignals.length > 0) {
        const blob = decryptedSignals.join('\n').toLowerCase();
        if (blob.includes(theme) && entityTokens(ent).every((t) => blob.includes(t))) {
          hit = true;
          const sig = structured.find(
            (s) => {
              const tt = new Date(s.occurred_at).getTime();
              return tt >= since30 && tt <= nowMs && s.content.toLowerCase().includes(theme) && contentHitsEntity(s.content, ent);
            },
          );
          if (sig?.id) sampleIds.push(sig.id);
        }
      }
      if (hit) hitEntities.push(ent);
    }
    if (hitEntities.length < 3) continue;
    const top3 = hitEntities.slice(0, 3);
    const names = top3.map((e) => e.name).join(', ');
    const title = `${theme} appears across ${hitEntities.length} contacts: ${names}`;
    const evidenceObj = {
      pattern: 'cross_entity_theme',
      theme,
      entity_count: hitEntities.length,
      sample_entities: top3.map((e) => e.name),
    };
    const trigger: TriggerMetadata = {
      baseline_state: 'Isolated one-off mentions per person',
      current_state: `Same theme "${theme}" repeats across ${hitEntities.length} separate contacts`,
      delta: 'thematic echo across people (unconnected threads)',
      timeframe: '30 days',
      outcome_class: 'risk',
      why_now: `The same unresolved theme showing up with multiple people usually means a blind spot — the inbox hides the pattern until you see it once.`,
    };
    const sid = sampleIds.find(Boolean);
    patternBuckets[3].push({
      id: `discrepancy_bp_theme_${theme.replace(/\s+/g, '_')}`,
      class: 'behavioral_pattern',
      title,
      content: title,
      stakes: 4,
      urgency: 0.8,
      suggestedActionType: 'write_document',
      evidence: JSON.stringify(evidenceObj),
      sourceSignals: sid
        ? [{ kind: 'signal', id: sid, summary: `Theme "${theme}" × ${hitEntities.length} contacts` }]
        : [{ kind: 'signal', summary: `Theme "${theme}" × ${hitEntities.length} contacts` }],
      matchedGoal: null,
      trigger,
    });
  }
  patternBuckets[3] = pickTopBehavioral(patternBuckets[3], MAX_BEHAVIORAL_PER_PATTERN);

  // --- PATTERN 5: said-but-never-did ---
  for (const c of commitments) {
    if (c.status !== 'active') continue;
    const createdSrc = c.created_at ?? c.updated_at;
    if (!createdSrc) continue;
    const ageMs = nowMs - new Date(createdSrc).getTime();
    if (ageMs < SEVEN_DAYS_MS) continue;
    const ageDays = Math.floor(ageMs / 86400000);
    const descLow = c.description.toLowerCase();
    const ckw = textKeywords(c.description);
    const minK = Math.min(2, Math.max(1, ckw.length));
    let anyRecent = false;
    for (const s of structured) {
      const t = new Date(s.occurred_at).getTime();
      if (t < since7 || t > nowMs) continue;
      const low = s.content.toLowerCase();
      if (ckw.filter((kw) => low.includes(kw)).length >= minK) {
        anyRecent = true;
        break;
      }
      if (entities.some((e) => contentHitsEntity(s.content, e) && entityTokens(e).some((tok) => descLow.includes(tok)))) {
        anyRecent = true;
        break;
      }
    }
    if (anyRecent) continue;

    let skippedSurfaced = false;
    const dkw = ckw.filter((w) => w.length >= 4);
    if (dkw.length > 0) {
      skippedSurfaced = recentDirectives.some((d) => {
        const low = d.directive_text.toLowerCase();
        return dkw.filter((w) => low.includes(w)).length >= Math.min(2, dkw.length);
      });
    }
    let urgency = 0.82 + (skippedSurfaced ? 0.08 : 0);
    if (urgency > 0.95) urgency = 0.95;

    const shortDesc = c.description.slice(0, 80);
    const title = `Committed to '${shortDesc}' ${ageDays} days ago — no activity since`;
    const stakes = Math.max(3, Math.min(5, Math.round((c.risk_score ?? 50) / 15)));
    const evidenceObj = {
      pattern: 'said_but_never_did',
      commitment_id: c.id,
      age_days: ageDays,
      prior_directive_overlap: skippedSurfaced,
    };
    const trigger: TriggerMetadata = {
      baseline_state: `Active commitment recorded: "${shortDesc}"`,
      current_state: 'No signals in the last 7 days reference this commitment or its entities',
      delta: 'commitment accepted → zero trailing signal footprint for 7d',
      timeframe: `${ageDays} days since record; last 7d silent`,
      outcome_class: 'deadline',
      why_now: skippedSurfaced
        ? `This commitment already surfaced in a recent directive without follow-on signal movement — the gap is now visible twice.`
        : `A live commitment with a week of zero related signals means the system sees intent without behavior — that is the pattern.`,
    };
    let entHit: EntityRow | null = null;
    for (const e of entities) {
      if (entityTokens(e).some((tok) => descLow.includes(tok))) {
        entHit = e;
        break;
      }
    }
    const primary = entHit?.primary_email ?? entHit?.emails?.[0];
    patternBuckets[4].push({
      id: `discrepancy_bp_commit_${c.id}`,
      class: 'behavioral_pattern',
      title,
      content: title,
      stakes,
      urgency,
      suggestedActionType: primary ? 'send_message' : 'write_document',
      evidence: JSON.stringify(evidenceObj),
      sourceSignals: [{ kind: 'commitment', id: c.id, summary: c.description.slice(0, 160) }],
      matchedGoal: matchGoal(c.description, goals),
      entityName: entHit?.name,
      trigger,
    });
  }
  patternBuckets[4] = pickTopBehavioral(patternBuckets[4], MAX_BEHAVIORAL_PER_PATTERN);

  // --- PATTERN 6: clustered interview week ---
  patternBuckets[5] = buildInterviewWeekCluster(structured, goals, nowMs);

  const merged = patternBuckets.flat();
  return pickTopBehavioral(merged, MAX_BEHAVIORAL_TOTAL);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Detect structural discrepancies from already-loaded scorer data.
 * Pure function — no DB calls. Returns at most 14 discrepancies sorted by
 * urgency × stakes descending. Entity-level deduplication ensures no entity
 * appears twice (highest-scoring candidate per entity wins).
 */
export function detectDiscrepancies(args: {
  commitments: CommitmentRow[];
  entities: EntityRow[];
  goals: GoalRow[];
  decryptedSignals: string[];
  structuredSignals?: StructuredSignalInput[];
  recentDirectives?: RecentDirectiveInput[];
  now?: Date;
  selfEmails?: Set<string>;
  /** Lowercase name tokens from the authenticated user (first, middle, last) for name-based self-exclusion */
  selfNameTokens?: string[];
}): Discrepancy[] {
  const nowMs = (args.now ?? new Date()).getTime();
  const selfNameTokens = args.selfNameTokens;
  const commitments = args.commitments.filter((c) => (c.trust_class ?? 'unclassified') === 'trusted' || (c.trust_class ?? 'unclassified') === 'unclassified');
  const entities = args.entities.filter((e) => (e.trust_class ?? 'unclassified') === 'trusted' || (e.trust_class ?? 'unclassified') === 'unclassified');
  const { goals, decryptedSignals } = args;
  const structured = args.structuredSignals ?? [];
  const groundedStructured = structured.filter((signal) => !isChatConversationSignalSource(signal.source, signal.type));
  const recentDirectives = args.recentDirectives ?? [];

  const all: Discrepancy[] = [
    ...extractScheduleConflicts(groundedStructured, nowMs),
    ...extractStaleDocuments(groundedStructured, goals, nowMs),
    ...extractCalendarEntityGaps(groundedStructured, entities, nowMs, args.selfEmails, selfNameTokens),
    ...extractDocumentFollowupGaps(groundedStructured, nowMs),
    ...extractConvergence(groundedStructured, entities, nowMs, args.selfEmails, selfNameTokens),
    ...extractUnresolvedIntent(structured, entities, recentDirectives, nowMs),
    ...extractBehavioralPatterns(
      entities,
      goals,
      commitments,
      groundedStructured,
      recentDirectives,
      decryptedSignals,
      nowMs,
      args.selfEmails,
      selfNameTokens,
    ),
    // Delta-based (higher urgency scores — float to top naturally)
    ...extractDeadlineStaleness(commitments, goals, nowMs),
    ...extractEngagementCollapse(entities, args.selfEmails, selfNameTokens),
    ...extractRelationshipDropout(entities, args.selfEmails, selfNameTokens),
    ...extractGoalVelocityMismatch(goals, decryptedSignals),
    // Absence-based (existing)
    ...extractRisk(entities, goals, decryptedSignals, nowMs),
    ...extractExposure(commitments, goals, nowMs, groundedStructured),
    ...extractAvoidance(commitments, goals, nowMs),
    ...extractDrift(goals, commitments, decryptedSignals),
    ...extractDecay(entities, goals, decryptedSignals, nowMs),
  ];

  // Auto-fail: reject triggers that cannot produce a leverage artifact
  const valid = all.filter((d) => {
    // Must have trigger metadata
    if (!d.trigger) return true; // legacy absence-based without trigger pass through (shouldn't happen now)
    // Must have a real why_now (not just "old" or "exists")
    if (d.trigger.why_now.length < 20) return false;
    const okAction =
      d.suggestedActionType === 'send_message' ||
      d.suggestedActionType === 'write_document' ||
      d.suggestedActionType === 'make_decision' ||
      d.suggestedActionType === 'schedule';
    if (!okAction) return false;
    return true;
  });

  // Sort by urgency × stakes descending
  const sorted = valid.sort((a, b) => b.urgency * b.stakes - a.urgency * a.stakes);

  // Entity-level deduplication: one discrepancy per entity, highest score wins
  const seenEntityIds = new Set<string>();
  const deduped: Discrepancy[] = [];
  for (const d of sorted) {
    const entityKey = getEntityKey(d);
    if (entityKey !== null) {
      if (seenEntityIds.has(entityKey)) continue;
      seenEntityIds.add(entityKey);
    }
    deduped.push(d);
    if (deduped.length >= 14) break;
  }

  return deduped;
}
