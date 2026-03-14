/**
 * Scorer — deterministic open-loop ranker.
 *
 * Replaces "let the LLM pick" with math:
 *   score = stakes * urgency * tractability
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
}

export interface MatchedGoal {
  text: string;
  priority: number;
  category: string;
}

export interface ScoredLoop {
  id: string;
  type: 'commitment' | 'signal' | 'relationship';
  title: string;
  content: string;
  suggestedActionType: ActionType;
  matchedGoal: MatchedGoal | null;
  score: number;
  breakdown: ScoreBreakdown;
  relatedSignals: string[];
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
// Urgency — sigmoid functions
// ---------------------------------------------------------------------------

/** Deadline urgency: higher as deadline approaches */
function deadlineUrgency(dueAt: string | null, impliedDueAt: string | null): number {
  const deadline = dueAt || impliedDueAt;
  if (!deadline) return 0.3; // no deadline

  const daysUntilDue = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntilDue < 0) return 1.0; // overdue
  return 1 / (1 + Math.exp(3 * (daysUntilDue - 2)));
}

/** Relationship urgency: higher as days since contact increases */
function relationshipUrgency(daysSinceContact: number): number {
  return 1 / (1 + Math.exp(-0.5 * (daysSinceContact - 10)));
}

/** Signal urgency: based on recency (7 days window) */
function signalUrgency(occurredAt: string): number {
  const daysSince = (Date.now() - new Date(occurredAt).getTime()) / (1000 * 60 * 60 * 24);
  // More recent = more urgent. Invert: treat like a deadline that was "due" when it arrived
  if (daysSince <= 1) return 0.9;
  if (daysSince <= 3) return 0.6;
  return 0.3;
}

// ---------------------------------------------------------------------------
// Tractability — Bayesian from tkg_pattern_metrics
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
      .select('total_activations, successful_outcomes')
      .eq('user_id', userId)
      .eq('pattern_hash', patternHash)
      .maybeSingle();

    if (!data) return 0.5; // cold start

    const t = (data.successful_outcomes + 1) / (data.total_activations + 2);
    return Math.max(0.1, t); // floor at 0.1
  } catch {
    return 0.5;
  }
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

  // 2. Signals
  for (const s of signals) {
    const text = s.content as string;
    if (!text || text.length < 20) continue;
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
    });
  }

  if (candidates.length === 0) return null;

  // -----------------------------------------------------------------------
  // Score each candidate
  // -----------------------------------------------------------------------

  const scored: ScoredLoop[] = [];

  for (const c of candidates) {
    const stakes = c.matchedGoal ? c.matchedGoal.priority : 1.0;
    const tractability = await getTractability(userId, c.actionType, c.domain);

    const score = stakes * c.urgency * tractability;

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

    scored.push({
      id: c.id,
      type: c.type,
      title: c.title,
      content: c.content,
      suggestedActionType: c.actionType,
      matchedGoal: c.matchedGoal,
      score,
      breakdown: { stakes, urgency: c.urgency, tractability },
      relatedSignals: related,
    });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Log top 5 for diagnostics
  console.log('[scorer] Top 5 candidates:');
  for (const s of scored.slice(0, 5)) {
    console.log(
      `  ${s.score.toFixed(2)} = ${s.breakdown.stakes}S * ${s.breakdown.urgency.toFixed(2)}U * ${s.breakdown.tractability.toFixed(2)}T | [${s.type}] ${s.title.slice(0, 80)}`,
    );
  }

  return scored[0] ?? null;
}
