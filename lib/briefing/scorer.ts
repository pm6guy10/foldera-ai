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
import { decrypt } from '@/lib/encryption';
import type { ActionType } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  stakes: number;       // 1-5
  urgency: number;      // 0-1
  tractability: number; // 0.1-1
  freshness: number;    // 0.3-1
}

export interface MatchedGoal {
  text: string;
  priority: number;
  category: string;
}

export interface ScoredLoop {
  id: string;
  type: 'commitment' | 'signal' | 'relationship' | 'emergent' | 'compound';
  title: string;
  content: string;
  suggestedActionType: ActionType;
  matchedGoal: MatchedGoal | null;
  score: number;
  breakdown: ScoreBreakdown;
  relatedSignals: string[];
  /** For relationship loops: enriched context from entity patterns + recent signals */
  relationshipContext?: string;
  /** For compound loops: the merged loops and connection type */
  compoundLoops?: ScoredLoop[];
  connectionType?: 'same_person' | 'temporal_dependency' | 'resource_conflict';
  connectionReason?: string;
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

function matchGoal(
  text: string,
  goals: Array<{ goal_text: string; priority: number; goal_category: string }>,
): MatchedGoal | null {
  const lower = text.toLowerCase();
  let best: MatchedGoal | null = null;

  for (const g of goals) {
    const kws = goalKeywords(g.goal_text);
    const matched = kws.filter(kw => lower.includes(kw));
    if (matched.length >= 2 || (matched.length === 1 && kws.length <= 3)) {
      if (!best || g.priority > best.priority) {
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
function signalUrgency(occurredAt: string): number {
  const daysSince = (Date.now() - new Date(occurredAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 1) return 0.9;
  if (daysSince <= 3) return 0.6;
  return 0.3;
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
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Check for recent pending_approval/executed actions with similar directive text
    const { data: recentActions } = await supabase
      .from('tkg_actions')
      .select('directive_text, generated_at, status')
      .eq('user_id', userId)
      .gte('generated_at', threeDaysAgo)
      .in('status', ['pending_approval', 'executed', 'skipped', 'draft_rejected'])
      .limit(30);

    if (!recentActions || recentActions.length === 0) return 1.0;

    // Count how many recent directives are similar (keyword overlap)
    const titleWords = new Set(
      loopTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 4),
    );
    if (titleWords.size === 0) return 1.0;

    let similarCount = 0;
    let anySkipped = false;
    for (const a of recentActions) {
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

    // Each similar recent directive reduces freshness
    // 1 similar → 0.6, 2 → 0.4, 3+ → 0.3
    // If any were skipped, extra penalty
    let freshness = Math.max(0.3, 1.0 - (similarCount * 0.2));
    if (anySkipped) freshness *= 0.5; // hard penalty for skipped similar content
    return Math.max(0.1, freshness);
  } catch {
    return 1.0;
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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
      const mentioning = signals
        .filter((s: any) => {
          const content = decrypt(s.content as string ?? '').toLowerCase();
          return content.includes(nameLower) || content.includes(firstName);
        })
        .slice(0, 3);

      if (mentioning.length > 0) {
        parts.push('Recent mentions:');
        for (const s of mentioning) {
          const content = decrypt(s.content as string ?? '');
          const date = (s.occurred_at as string ?? '').slice(0, 10);
          parts.push(`  [${date}] ${content.slice(0, 300)}`);
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
  return 'make_decision'; // default for commitments
}

// ---------------------------------------------------------------------------
// Infer domain from goal match or content
// ---------------------------------------------------------------------------

function inferDomain(matchedGoal: MatchedGoal | null, text: string): string {
  if (matchedGoal) return matchedGoal.category;

  const lower = text.toLowerCase();
  if (/\b(salary|money|financial|income|runway|payment|budget)\b/.test(lower)) return 'financial';
  if (/\b(job|career|role|application|interview|hire|position)\b/.test(lower)) return 'career';
  if (/\b(family|wife|children|baby|pregnancy|health)\b/.test(lower)) return 'family';
  if (/\b(foldera|build|code|deploy|feature|bug)\b/.test(lower)) return 'project';
  return 'career';
}

// ---------------------------------------------------------------------------
// Emergent Pattern Detection (v2: new)
// ---------------------------------------------------------------------------

export async function detectEmergentPatterns(userId: string): Promise<EmergentPattern[]> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
        .select('id, description, status, created_at, due_at')
        .eq('user_id', userId)
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
    console.warn('[scorer] detectEmergentPatterns error:', err instanceof Error ? err.message : err);
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
    'December', 'Foldera', 'Google', 'Microsoft', 'Outlook', 'Gmail',
    'Calendar', 'Stripe', 'The', 'This', 'That', 'Your', 'Our', 'Their',
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
  if (/\btomorrow\b/.test(lower)) dates.push(Date.now() + 24 * 60 * 60 * 1000);
  if (/\bthis week\b/.test(lower)) dates.push(Date.now() + 5 * 24 * 60 * 60 * 1000);
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
        const daysBetween = Math.abs(earliestA - earliestB) / (24 * 60 * 60 * 1000);

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
    ? (loopA.matchedGoal.priority >= loopB.matchedGoal.priority ? loopA.matchedGoal : loopB.matchedGoal)
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
    },
    relatedSignals: [...new Set([...loopA.relatedSignals, ...loopB.relatedSignals])].slice(0, 8),
    relationshipContext: [loopA.relationshipContext, loopB.relationshipContext].filter(Boolean).join('\n---\n') || undefined,
    compoundLoops: [loopA, loopB],
    connectionType,
    connectionReason: reason,
  };
}

// ---------------------------------------------------------------------------
// Main export — scoreOpenLoops
// ---------------------------------------------------------------------------

export async function scoreOpenLoops(userId: string): Promise<ScoredLoop | null> {
  const supabase = createServerClient();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Parallel data fetch
  const [commitmentsRes, signalsRes, entitiesRes, goalsRes] = await Promise.all([
    // Open commitments (last 14 days or no deadline)
    supabase
      .from('tkg_commitments')
      .select('id, description, category, status, risk_score, due_at, implied_due_at, source_context, updated_at')
      .eq('user_id', userId)
      .in('status', ['active', 'at_risk'])
      .order('risk_score', { ascending: false })
      .limit(50),

    // Recent signals (last 7 days)
    supabase
      .from('tkg_signals')
      .select('id, content, source, occurred_at, author, type')
      .eq('user_id', userId)
      .gte('occurred_at', sevenDaysAgo)
      .eq('processed', true)
      .order('occurred_at', { ascending: false })
      .limit(30),

    // Cooling relationships (last interaction > 14 days ago)
    supabase
      .from('tkg_entities')
      .select('id, name, last_interaction, total_interactions, patterns')
      .eq('user_id', userId)
      .neq('name', 'self')
      .lt('last_interaction', fourteenDaysAgo)
      .order('last_interaction', { ascending: true })
      .limit(10),

    // Active goals with priority >= 3
    supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category')
      .eq('user_id', userId)
      .gte('priority', 3)
      .order('priority', { ascending: false })
      .limit(10),
  ]);

  const commitments = commitmentsRes.data ?? [];
  const signals = (signalsRes.data ?? []).map((s: any) => ({
    ...s,
    content: decrypt(s.content as string ?? ''),
  }));
  const entities = entitiesRes.data ?? [];
  const goals = (goalsRes.data ?? []) as Array<{ goal_text: string; priority: number; goal_category: string }>;

  // Also fetch ALL recent signals (not just 7d) for context enrichment
  const { data: allRecentSignals } = await supabase
    .from('tkg_signals')
    .select('content, source, occurred_at')
    .eq('user_id', userId)
    .gte('occurred_at', fourteenDaysAgo)
    .eq('processed', true)
    .order('occurred_at', { ascending: false })
    .limit(50);

  const decryptedSignals = (allRecentSignals ?? []).map((s: any) => decrypt(s.content as string ?? ''));

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
    entityPatterns?: unknown;
    entityName?: string;
  }> = [];

  // 1. Commitments
  for (const c of commitments) {
    const text = `${c.description}${c.source_context ? ' — ' + c.source_context : ''}`;
    const mg = matchGoal(text, goals);
    const actionType = inferActionType(text, 'commitment');

    candidates.push({
      id: c.id,
      type: 'commitment',
      title: c.description,
      content: text,
      actionType,
      urgency: deadlineUrgency(c.due_at, c.implied_due_at),
      matchedGoal: mg,
      domain: inferDomain(mg, text),
    });
  }

  // 2. Signals — skip self-fed directive signals to avoid circular loops
  for (const s of signals) {
    const text = s.content as string;
    if (!text || text.length < 20) continue;
    // Skip signals that are Foldera's own self-fed directives
    if (text.startsWith('[Foldera Directive')) continue;
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
      domain: inferDomain(mg, text),
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
      domain: inferDomain(mg, text),
      entityPatterns: e.patterns,
      entityName: e.name,
    });
  }

  if (candidates.length === 0) {
    // Even with no candidates, check emergent patterns
    const emergentFallback = await detectEmergentPatterns(userId);
    if (emergentFallback.length > 0) {
      const ep = emergentFallback[0];
      const mirrorContent = [
        ep.insight,
        '',
        'Evidence:',
        ...ep.dataPoints,
        '',
        ep.mirrorQuestion,
      ].join('\n');
      return {
        id: 'emergent-0',
        type: 'emergent',
        title: ep.title,
        content: mirrorContent,
        suggestedActionType: ep.suggestedActionType,
        matchedGoal: null,
        score: ep.surpriseValue * ep.dataConfidence,
        breakdown: { stakes: ep.surpriseValue, urgency: ep.dataConfidence, tractability: 1.0, freshness: 1.0 },
        relatedSignals: [],
      };
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Score each candidate (v2: includes freshness)
  // -----------------------------------------------------------------------

  const scored: ScoredLoop[] = [];

  for (const c of candidates) {
    const stakes = c.matchedGoal ? c.matchedGoal.priority : 1.0;
    const tractability = await getTractability(userId, c.actionType, c.domain);
    const freshness = await getFreshness(userId, c.title, c.type);

    const score = stakes * c.urgency * tractability * freshness;

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

    scored.push({
      id: c.id,
      type: c.type,
      title: c.title,
      content: c.content,
      suggestedActionType: c.actionType,
      matchedGoal: c.matchedGoal,
      score,
      breakdown: { stakes, urgency: c.urgency, tractability, freshness },
      relatedSignals: related,
      relationshipContext,
    });
  }

  // -----------------------------------------------------------------------
  // Cross-loop inference — find connections in top 5, merge if found
  // -----------------------------------------------------------------------

  scored.sort((a, b) => b.score - a.score);
  const top5 = scored.slice(0, 5);
  const connections = detectCrossLoopConnections(top5);

  if (connections.length > 0) {
    // Take the strongest connection and merge into a compound loop
    const bestConnection = connections[0];
    const compound = mergeLoops(bestConnection);
    console.log(
      `[scorer] Cross-loop connection: ${compound.connectionType} — "${compound.connectionReason}"`,
    );
    scored.push(compound);
  }

  // -----------------------------------------------------------------------
  // Check emergent patterns — wins when surprise_value * data_confidence > top loop EV
  // -----------------------------------------------------------------------

  scored.sort((a, b) => b.score - a.score);
  const topLoopEV = scored.length > 0 ? scored[0].score : 0;
  const emergent = await detectEmergentPatterns(userId);
  for (const ep of emergent) {
    const emergentEV = ep.surpriseValue * ep.dataConfidence;
    // Emergent pattern must beat the top open loop to compete
    if (emergentEV > topLoopEV || scored.length === 0) {
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
        score: emergentEV + 0.01, // tiny bump to ensure it wins over the loop it beat
        breakdown: {
          stakes: ep.surpriseValue,
          urgency: ep.dataConfidence,
          tractability: 1.0,
          freshness: 1.0,
        },
        relatedSignals: [],
      });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Log top 5 for diagnostics
  console.log('[scorer] Top 5 candidates:');
  for (const s of scored.slice(0, 5)) {
    const f = s.breakdown.freshness !== undefined ? ` * ${s.breakdown.freshness.toFixed(2)}F` : '';
    console.log(
      `  ${s.score.toFixed(2)} = ${s.breakdown.stakes}S * ${s.breakdown.urgency.toFixed(2)}U * ${s.breakdown.tractability.toFixed(2)}T${f} | [${s.type}] ${s.title.slice(0, 80)}`,
    );
  }

  return scored[0] ?? null;
}
