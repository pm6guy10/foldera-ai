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
  type: 'commitment' | 'signal' | 'relationship' | 'emergent';
  title: string;
  content: string;
  suggestedActionType: ActionType;
  matchedGoal: MatchedGoal | null;
  score: number;
  breakdown: ScoreBreakdown;
  relatedSignals: string[];
  /** For relationship loops: enriched context from entity patterns + recent signals */
  relationshipContext?: string;
}

export interface EmergentPattern {
  type: 'repeat_cycle' | 'approval_without_execution' | 'commitment_decay' | 'temporal_cluster';
  title: string;
  insight: string;
  dataPoints: string[];
  score: number;
  suggestedActionType: ActionType;
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
  const patterns: EmergentPattern[] = [];

  try {
    // Fetch all actions from last 30 days for analysis
    const { data: actions } = await supabase
      .from('tkg_actions')
      .select('id, directive_text, action_type, status, generated_at, executed_at, execution_result, feedback_weight, skip_reason')
      .eq('user_id', userId)
      .gte('generated_at', thirtyDaysAgo)
      .order('generated_at', { ascending: false })
      .limit(100);

    if (!actions || actions.length < 3) return patterns;

    // -----------------------------------------------------------------------
    // 1. REPEAT CYCLE: same topic surfaced 3+ times without approval
    // -----------------------------------------------------------------------
    const topicClusters: Record<string, Array<{ text: string; status: string; date: string }>> = {};
    for (const a of actions) {
      const text = (a.directive_text as string ?? '').toLowerCase();
      const keywords = text.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length >= 5);
      // Group by dominant keyword pair
      const keyPair = keywords.slice(0, 3).sort().join('+');
      if (!keyPair) continue;
      if (!topicClusters[keyPair]) topicClusters[keyPair] = [];
      topicClusters[keyPair].push({
        text: a.directive_text as string ?? '',
        status: a.status as string ?? '',
        date: (a.generated_at as string ?? '').slice(0, 10),
      });
    }

    for (const [topic, items] of Object.entries(topicClusters)) {
      const pending = items.filter(i => i.status === 'pending_approval');
      if (pending.length >= 3) {
        const approvedCount = items.filter(i => i.status === 'executed').length;
        patterns.push({
          type: 'repeat_cycle',
          title: `Repeating directive: "${pending[0].text.slice(0, 60)}"`,
          insight: `This topic has been generated ${pending.length} times without action (${approvedCount} ever approved). The system keeps suggesting it but you haven't engaged. Either approve one version, skip it to teach the system, or the underlying situation needs a different approach.`,
          dataPoints: pending.map(p => `[${p.date}] ${p.text.slice(0, 100)}`),
          score: 3.0 + (pending.length * 0.3), // high score — this IS the problem
          suggestedActionType: 'make_decision',
        });
      }
    }

    // -----------------------------------------------------------------------
    // 2. APPROVAL WITHOUT EXECUTION: approved but artifact never executed
    // -----------------------------------------------------------------------
    const approvedNoExec: string[] = [];
    for (const a of actions) {
      if (a.status !== 'executed') continue;
      const execResult = (a.execution_result as Record<string, unknown>) ?? {};
      const artifact = execResult.artifact as Record<string, unknown> | undefined;
      if (!artifact) continue;

      const type = (artifact.type as string) ?? '';
      if (type === 'email') {
        // Check if email was actually sent
        if (!execResult.sent && !execResult.sent_at) {
          approvedNoExec.push(`[${(a.generated_at as string ?? '').slice(0, 10)}] ${(a.directive_text as string ?? '').slice(0, 100)}`);
        }
      }
    }

    if (approvedNoExec.length >= 2) {
      patterns.push({
        type: 'approval_without_execution',
        title: `${approvedNoExec.length} approved directives may not have executed`,
        insight: `You approved ${approvedNoExec.length} email directives but the system couldn't confirm they were sent. This could mean emails aren't reaching recipients, or the send integration needs attention.`,
        dataPoints: approvedNoExec.slice(0, 5),
        score: 3.5,
        suggestedActionType: 'research',
      });
    }

    // -----------------------------------------------------------------------
    // 3. COMMITMENT DECAY: high skip rate on specific action types
    // -----------------------------------------------------------------------
    const typeStats: Record<string, { total: number; skipped: number; approved: number }> = {};
    for (const a of actions) {
      const aType = a.action_type as string ?? 'unknown';
      if (!typeStats[aType]) typeStats[aType] = { total: 0, skipped: 0, approved: 0 };
      typeStats[aType].total++;
      if (a.status === 'skipped' || a.status === 'draft_rejected') typeStats[aType].skipped++;
      if (a.status === 'executed') typeStats[aType].approved++;
    }

    for (const [aType, stats] of Object.entries(typeStats)) {
      if (stats.total >= 5 && stats.skipped / stats.total > 0.7) {
        patterns.push({
          type: 'commitment_decay',
          title: `${aType} directives are being ignored (${Math.round(stats.skipped / stats.total * 100)}% skip rate)`,
          insight: `Of ${stats.total} ${aType} directives in the last 30 days, ${stats.skipped} were skipped and only ${stats.approved} approved. The system should generate fewer ${aType} actions or approach them differently.`,
          dataPoints: [`Total: ${stats.total}`, `Approved: ${stats.approved}`, `Skipped: ${stats.skipped}`, `Skip rate: ${Math.round(stats.skipped / stats.total * 100)}%`],
          score: 2.5,
          suggestedActionType: 'do_nothing',
        });
      }
    }

    // -----------------------------------------------------------------------
    // 4. TEMPORAL CLUSTER: day-of-week behavioral patterns
    // -----------------------------------------------------------------------
    const dayOfWeekApprovals: Record<number, number> = {};
    const dayOfWeekSkips: Record<number, number> = {};
    for (const a of actions) {
      const day = new Date(a.generated_at as string).getDay();
      if (a.status === 'executed') dayOfWeekApprovals[day] = (dayOfWeekApprovals[day] ?? 0) + 1;
      if (a.status === 'skipped' || a.status === 'draft_rejected') dayOfWeekSkips[day] = (dayOfWeekSkips[day] ?? 0) + 1;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (let day = 0; day < 7; day++) {
      const approvals = dayOfWeekApprovals[day] ?? 0;
      const skips = dayOfWeekSkips[day] ?? 0;
      const total = approvals + skips;
      if (total >= 3 && approvals > 0 && approvals / total > 0.7) {
        patterns.push({
          type: 'temporal_cluster',
          title: `You're most receptive on ${dayNames[day]}s`,
          insight: `${dayNames[day]}s have a ${Math.round(approvals / total * 100)}% approval rate (${approvals}/${total}). Consider scheduling high-stakes directives for ${dayNames[day]}s.`,
          dataPoints: [`${dayNames[day]}: ${approvals} approved, ${skips} skipped of ${total} total`],
          score: 1.5, // informational, doesn't compete with urgent items
          suggestedActionType: 'do_nothing',
        });
      }
    }
  } catch (err) {
    console.warn('[scorer] detectEmergentPatterns error:', err instanceof Error ? err.message : err);
  }

  // Sort by score descending
  patterns.sort((a, b) => b.score - a.score);
  return patterns;
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
    const emergent = await detectEmergentPatterns(userId);
    if (emergent.length > 0) {
      const ep = emergent[0];
      return {
        id: 'emergent-0',
        type: 'emergent',
        title: ep.title,
        content: `${ep.insight}\n\nData:\n${ep.dataPoints.join('\n')}`,
        suggestedActionType: ep.suggestedActionType,
        matchedGoal: null,
        score: ep.score,
        breakdown: { stakes: ep.score, urgency: 1.0, tractability: 1.0, freshness: 1.0 },
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
  // Check emergent patterns — if one scores higher, it wins
  // -----------------------------------------------------------------------

  const emergent = await detectEmergentPatterns(userId);
  for (const ep of emergent) {
    scored.push({
      id: `emergent-${ep.type}`,
      type: 'emergent',
      title: ep.title,
      content: `${ep.insight}\n\nData:\n${ep.dataPoints.join('\n')}`,
      suggestedActionType: ep.suggestedActionType,
      matchedGoal: null,
      score: ep.score,
      breakdown: { stakes: ep.score, urgency: 1.0, tractability: 1.0, freshness: 1.0 },
      relatedSignals: [],
    });
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
