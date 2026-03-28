/**
 * Discrepancy Detector
 * ====================
 * Extracts structural gap candidates from already-loaded data.
 *
 * Five classes of discrepancy, each representing a different type of
 * gap between stated priorities, behavioral patterns, and execution:
 *
 *  1. decay     — important relationship gone silent (bx_stats.silence_detected)
 *  2. exposure  — commitment due within 7 days with no execution artifact
 *  3. drift     — high-priority goal (P1/P2) with no observable recent activity
 *  4. avoidance — at_risk commitment stalled 14+ days with no forward movement
 *  5. risk      — high-value relationship (≥15 interactions) that has gone silent
 *
 * Design constraints:
 *  - Pure function. No DB calls. Takes already-fetched scorer data.
 *  - Returns at most 5 discrepancies total, sorted by urgency × stakes.
 *  - Discrepancies are PRIMARY candidates; open-loop candidates are fallback.
 */

import type { ActionType, GenerationCandidateSource } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiscrepancyClass = 'decay' | 'exposure' | 'drift' | 'avoidance' | 'risk';

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
// Main export
// ---------------------------------------------------------------------------

/**
 * Detect structural discrepancies from already-loaded scorer data.
 * Pure function — no DB calls. Returns at most 5 discrepancies
 * sorted by urgency × stakes descending.
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
    ...extractRisk(entities, nowMs),                        // highest-stakes first
    ...extractExposure(commitments, goals, nowMs),
    ...extractAvoidance(commitments, goals, nowMs),
    ...extractDrift(goals, commitments, decryptedSignals),
    ...extractDecay(entities, nowMs),
  ];

  return all
    .sort((a, b) => b.urgency * b.stakes - a.urgency * a.stakes)
    .slice(0, 5);
}
