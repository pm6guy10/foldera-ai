/**
 * Discrepancy Detector
 * ====================
 * Extracts structural gap candidates from already-loaded data.
 *
 * Nine classes of discrepancy across two tiers:
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
  | 'engagement_collapse' | 'relationship_dropout' | 'deadline_staleness' | 'goal_velocity_mismatch';

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
}

interface EntityRow {
  id: string;
  name: string;
  last_interaction: string | null;
  total_interactions: number;
  patterns: Record<string, unknown> | null;
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
}

interface GoalRow {
  goal_text: string;
  priority: number;
  goal_category: string;
}

/** Structured delta metric embedded in evidence string for logging and prompt injection. */
interface DeltaMetric {
  baseline: string;
  current: string;
  delta_pct: number;
  timeframe: string;
  entity?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_PER_CLASS = 2;

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
  const m = d.id.match(/^discrepancy_(?:decay|risk|collapse|dropout)_(.+)$/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Extractor 1: decay — important relationship gone silent
// ---------------------------------------------------------------------------

function extractDecay(entities: EntityRow[], now: number): Discrepancy[] {
  const results: Discrepancy[] = [];
  // risk extractor handles ≥15 interactions — decay handles 5–14
  const decayRange = entities
    .filter((e) => {
      const bxStats = (e.patterns as any)?.bx_stats;
      return (
        bxStats?.silence_detected === true &&
        e.total_interactions >= 5 &&
        e.total_interactions < 15
      );
    })
    .sort((a, b) => b.total_interactions - a.total_interactions);

  for (const e of decayRange.slice(0, MAX_PER_CLASS)) {
    const daysSilent =
      e.last_interaction != null
        ? Math.floor((now - new Date(e.last_interaction).getTime()) / 86400000)
        : null;
    const silentStr = daysSilent != null ? `${daysSilent} days` : 'an extended period';
    results.push({
      id: `discrepancy_decay_${e.id}`,
      class: 'decay',
      title: `Fading connection: ${e.name}`,
      content:
        `Your relationship with ${e.name} has gone silent after ${e.total_interactions} past interactions. ` +
        `No contact in ${silentStr}. Strong relationships require periodic maintenance — ` +
        `this one is cooling without intervention.`,
      stakes: Math.min(5, Math.floor(e.total_interactions / 5) + 2),
      urgency: daysSilent != null && daysSilent > 60 ? 0.75 : 0.55,
      suggestedActionType: 'send_message' as ActionType,
      evidence: `silence_detected=true, total_interactions=${e.total_interactions}, silent_for=${silentStr}`,
      sourceSignals: [
        {
          kind: 'relationship',
          summary: `${e.name}: ${e.total_interactions} total interactions, last seen ${silentStr} ago`,
        },
      ],
      matchedGoal: null,
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

    results.push({
      id: `discrepancy_avoidance_${c.id}`,
      class: 'avoidance',
      title: `Stalled commitment: ${c.description.slice(0, 60)}`,
      content:
        `"${c.description}" has been at-risk for ${stalledStr} with no forward movement. ` +
        `Repeated avoidance of the same commitment is a pattern, not an oversight. ` +
        `A decision — proceed, delegate, or drop — needs to be made.`,
      stakes: 4,
      urgency: 0.70,
      suggestedActionType: 'make_decision' as ActionType,
      evidence: `status=at_risk, stalled_days=${stalledDays}, risk_score=${c.risk_score}`,
      sourceSignals: [
        { kind: 'commitment', id: c.id, summary: c.description.slice(0, 160) },
      ],
      matchedGoal: matchGoal(c.description, goals),
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Extractor 5: risk — high-value relationship that has gone silent
// ---------------------------------------------------------------------------

function extractRisk(entities: EntityRow[], now: number): Discrepancy[] {
  const results: Discrepancy[] = [];
  const highValue = entities
    .filter((e) => {
      const bxStats = (e.patterns as any)?.bx_stats;
      return bxStats?.silence_detected === true && e.total_interactions >= 15;
    })
    .sort((a, b) => b.total_interactions - a.total_interactions);

  for (const e of highValue.slice(0, 1)) {
    const daysSilent =
      e.last_interaction != null
        ? Math.floor((now - new Date(e.last_interaction).getTime()) / 86400000)
        : null;
    const silentStr = daysSilent != null ? `${daysSilent} days` : 'an extended period';

    results.push({
      id: `discrepancy_risk_${e.id}`,
      class: 'risk',
      title: `High-value relationship at risk: ${e.name}`,
      content:
        `${e.name} is one of your most connected relationships (${e.total_interactions} interactions) ` +
        `and has gone completely silent for ${silentStr}. ` +
        `Losing this relationship has significant downstream consequences.`,
      stakes: 5,
      urgency: daysSilent != null && daysSilent > 90 ? 0.85 : 0.70,
      suggestedActionType: 'send_message' as ActionType,
      evidence: `silence_detected=true, total_interactions=${e.total_interactions}, silent_for=${silentStr}`,
      sourceSignals: [
        {
          kind: 'relationship',
          summary: `${e.name}: ${e.total_interactions} interactions, silent ${silentStr}`,
        },
      ],
      matchedGoal: null,
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
    });

    if (results.length >= MAX_PER_CLASS) break;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Detect structural discrepancies from already-loaded scorer data.
 * Pure function — no DB calls. Returns at most 6 discrepancies sorted by
 * urgency × stakes descending. Entity-level deduplication ensures no entity
 * appears twice (highest-scoring candidate per entity wins).
 */
export function detectDiscrepancies(args: {
  commitments: CommitmentRow[];
  entities: EntityRow[];
  goals: GoalRow[];
  decryptedSignals: string[];
  now?: Date;
}): Discrepancy[] {
  const nowMs = (args.now ?? new Date()).getTime();
  const { commitments, entities, goals, decryptedSignals } = args;

  const all: Discrepancy[] = [
    // Delta-based first (higher urgency scores — float to top naturally)
    ...extractDeadlineStaleness(commitments, goals, nowMs),
    ...extractEngagementCollapse(entities),
    ...extractRelationshipDropout(entities),
    ...extractGoalVelocityMismatch(goals, decryptedSignals),
    // Absence-based (existing)
    ...extractRisk(entities, nowMs),
    ...extractExposure(commitments, goals, nowMs),
    ...extractAvoidance(commitments, goals, nowMs),
    ...extractDrift(goals, commitments, decryptedSignals),
    ...extractDecay(entities, nowMs),
  ];

  // Sort by urgency × stakes descending
  const sorted = all.sort((a, b) => b.urgency * b.stakes - a.urgency * a.stakes);

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
    if (deduped.length >= 6) break;
  }

  return deduped;
}
