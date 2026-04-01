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
 * Delta candidates include: baseline metric, current metric, delta %, timeframe, entity.
 *
 * Design constraints:
 *  - Pure function. No DB calls. Takes already-fetched scorer data.
 *  - Returns at most 6 discrepancies total, sorted by urgency × stakes.
 *  - Delta-based candidates use urgency 0.72–0.85 (higher than absence 0.55–0.70).
 *  - Entity-level deduplication: one discrepancy per entity, highest score wins.
 *  - Discrepancies are PRIMARY candidates; open-loop candidates are fallback.
 */

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
  | 'convergence';

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
  trust_class?: 'trusted' | 'junk' | 'transactional' | 'personal' | 'unclassified' | null;
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

/** Return the best matching goal for a text, or null if no keyword overlap. */
function matchGoal(
  text: string,
  goals: GoalRow[],
): { text: string; priority: number; category: string } | null {
  const textKws = new Set(textKeywords(text));
  let bestGoal: GoalRow | null = null;
  let bestOverlap = 0;
  for (const g of goals) {
    const gkws = textKeywords(g.goal_text);
    const overlap = gkws.filter((kw) => textKws.has(kw)).length;
    if (overlap > bestOverlap || (overlap === bestOverlap && overlap > 0 && g.priority < (bestGoal?.priority ?? 999))) {
      bestOverlap = overlap;
      bestGoal = g;
    }
  }
  if (!bestGoal || bestOverlap < 1) return null;
  return { text: bestGoal.goal_text, priority: bestGoal.priority, category: bestGoal.goal_category };
}

/** Extract entity ID from entity-scoped discrepancy IDs for deduplication. */
function getEntityKey(d: Discrepancy): string | null {
  const m = d.id.match(
    /^discrepancy_(?:decay|risk|collapse|dropout|prep|meeting|docfu|conv)_(.+)$/,
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

    results.push({
      id: `discrepancy_decay_${e.id}`,
      class: 'decay',
      title: `Fading connection: ${e.name}`,
      content:
        `Your relationship with ${e.name} has gone silent after ${e.total_interactions} past interactions. ` +
        `No contact in ${silentStr}. Baseline was ~${baselinePer14d} interactions per 14 days. ` +
        `Current: 0. This is not drift — it is a temperature drop that is getting harder to reverse.`,
      stakes: Math.min(5, Math.floor(e.total_interactions / 5) + 2),
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
      matchedGoal: null,
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
    const urgency =
      daysUntilDue === 0
        ? 0.95
        : daysUntilDue <= 2
          ? 0.85
          : daysUntilDue <= 5
            ? 0.70
            : 0.55;

    const trigger: TriggerMetadata = {
      baseline_state: `Commitment accepted: "${c.description.slice(0, 80)}"`,
      current_state: `Due in ${daysUntilDue} day(s), no execution artifact exists`,
      delta: `commitment → no artifact (${daysUntilDue}d remaining)`,
      timeframe: `${daysUntilDue} day(s) to deadline`,
      outcome_class: 'deadline',
      why_now: daysUntilDue <= 2
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
        `No execution artifact exists yet. The gap between commitment and delivery is exposure.`,
      stakes: 4,
      urgency,
      suggestedActionType: 'write_document' as ActionType,
      evidence: `due_at=${dueAt}, days_until_due=${daysUntilDue}, status=${c.status}`,
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

function extractEngagementCollapse(entities: EntityRow[]): Discrepancy[] {
  const results: Discrepancy[] = [];
  const candidates = entities
    .filter((e) => {
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

function extractRelationshipDropout(entities: EntityRow[]): Discrepancy[] {
  const results: Discrepancy[] = [];
  const candidates = entities
    .filter((e) => {
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
          `You have overlapping calendar commitments on ${dateLabel}: "${a.title}" and "${b.title}". ` +
          `Which takes priority, and how will you communicate the trade-off?`,
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

function extractConvergence(structured: StructuredSignalInput[], entities: EntityRow[], nowMs: number): Discrepancy[] {
  const results: Discrepancy[] = [];
  const since = nowMs - FOURTEEN_DAYS_MS;
  for (const ent of entities) {
    if (results.length >= MAX_CROSS_CLASS) break;
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
}): Discrepancy[] {
  const nowMs = (args.now ?? new Date()).getTime();
  const commitments = args.commitments.filter((c) => (c.trust_class ?? 'unclassified') === 'trusted' || (c.trust_class ?? 'unclassified') === 'unclassified');
  const entities = args.entities.filter((e) => (e.trust_class ?? 'unclassified') === 'trusted' || (e.trust_class ?? 'unclassified') === 'unclassified');
  const { goals, decryptedSignals } = args;
  const structured = args.structuredSignals ?? [];
  const recentDirectives = args.recentDirectives ?? [];

  const all: Discrepancy[] = [
    ...extractScheduleConflicts(structured, nowMs),
    ...extractStaleDocuments(structured, goals, nowMs),
    ...extractCalendarEntityGaps(structured, entities, nowMs),
    ...extractDocumentFollowupGaps(structured, nowMs),
    ...extractConvergence(structured, entities, nowMs),
    ...extractUnresolvedIntent(structured, entities, recentDirectives, nowMs),
    // Delta-based first (higher urgency scores — float to top naturally)
    ...extractDeadlineStaleness(commitments, goals, nowMs),
    ...extractEngagementCollapse(entities),
    ...extractRelationshipDropout(entities),
    ...extractGoalVelocityMismatch(goals, decryptedSignals),
    // Absence-based (existing)
    ...extractRisk(entities, goals, decryptedSignals, nowMs),
    ...extractExposure(commitments, goals, nowMs),
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
