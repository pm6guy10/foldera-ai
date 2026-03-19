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
import type {
  ActionType,
  CandidateScoreBreakdown,
  GenerationCandidateDiscoveryLog,
  GenerationCandidateLog,
  GenerationCandidateSource,
} from './types';

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
  type: 'commitment' | 'signal' | 'relationship' | 'emergent' | 'compound' | 'growth';
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

export interface ScorerResult {
  winner: ScoredLoop;
  deprioritized: DeprioritizedLoop[];
  candidateDiscovery: GenerationCandidateDiscoveryLog;
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
  return 'make_decision'; // default for commitments
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
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

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
      .select('goal_text, priority, goal_category')
      .eq('user_id', userId)
      .gte('priority', 1)
      .order('priority', { ascending: false })
      .limit(20),
  ]);

  const signals = signalsRes.data ?? [];
  const goals = (goalsRes.data ?? []) as GoalRow[];
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
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
        .select('id, description, status, created_at, due_at, updated_at')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('tkg_goals')
        .select('goal_text, priority, goal_category')
        .eq('user_id', userId)
        .gte('priority', 1)
        .order('priority', { ascending: false })
        .limit(20),
    ]);

    const actions = actionsRes.data ?? [];
    const signals = signalsRes.data ?? [];
    const commitments = commitmentsRes.data ?? [];
    const goals = (goalsRes.data ?? []) as GoalRow[];
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
    sourceSignals: [...loopA.sourceSignals, ...loopB.sourceSignals].slice(0, 8),
    relationshipContext: [loopA.relationshipContext, loopB.relationshipContext].filter(Boolean).join('\n---\n') || undefined,
    compoundLoops: [loopA, loopB],
    connectionType,
    connectionReason: reason,
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
  const topCandidates = scored.slice(0, 3);
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

export async function scoreOpenLoops(userId: string): Promise<ScorerResult | null> {
  const supabase = createServerClient();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const oneHundredEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

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

  // Parallel data fetch
  const [commitmentsRes, signalsRes, entitiesRes, goalsRes] = await Promise.all([
    // Open commitments (last 14 days or no deadline), excluding user-suppressed ones
    supabase
      .from('tkg_commitments')
      .select('id, description, category, status, risk_score, due_at, implied_due_at, source_context, updated_at')
      .eq('user_id', userId)
      .in('status', ['active', 'at_risk'])
      .is('suppressed_at', null)
      .order('risk_score', { ascending: false })
      .limit(50),

    // Signals (last 180 days — decay applied during scoring)
    supabase
      .from('tkg_signals')
      .select('id, content, source, occurred_at, author, type')
      .eq('user_id', userId)
      .gte('occurred_at', oneHundredEightyDaysAgo)
      .eq('processed', true)
      .order('occurred_at', { ascending: false })
      .limit(50),

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
  const goals = (goalsRes.data ?? []) as GoalRow[];
  const goalKeywordIndex = buildGoalKeywordIndex(goals);
  logDecryptSkip(userId, 'scorer:open_loops', scoringDecryptSkips);

  // Also fetch ALL recent signals (not just 7d) for context enrichment
  const { data: allRecentSignals } = await supabase
    .from('tkg_signals')
    .select('content, source, occurred_at')
    .eq('user_id', userId)
    .gte('occurred_at', fourteenDaysAgo)
    .eq('processed', true)
    .order('occurred_at', { ascending: false })
    .limit(50);

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
  const suppressedCandidates = 0;

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

  if (candidates.length === 0) {
    // No goal-connected candidates. Goalless emergent patterns (commitment_decay,
    // signal_velocity) are system metrics, not user-serving. Return null for a
    // valid no-send rather than surfacing goalless emergent patterns.
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
      sourceSignals: c.sourceSignals,
      relationshipContext,
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
        },
        relatedSignals: div.topSignals.slice(0, 3),
        sourceSignals: div.topSignals.slice(0, 3).map((signal) => ({
          kind: 'emergent',
          summary: signal.slice(0, 160),
        })),
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
        },
        relatedSignals: [],
        sourceSignals: ep.dataPoints.slice(0, 3).map((point) => ({
          kind: 'emergent',
          summary: point.slice(0, 160),
        })),
      });
    }
  }

  // No-goal penalty: any candidate (including emergent) that doesn't connect
  // to an active goal is effectively unranked. System introspection and
  // commitment-decay emergent patterns never match a user goal.
  for (const s of scored) {
    if (!s.matchedGoal) {
      s.score = Math.max(0, s.score - 50);
    }
  }

  // Sort by score descending
  scored.sort(compareScoredLoops);

  const winner = scored[0];
  if (!winner) return null;

  // Build deprioritized loops: top 3 runner-ups with kill reasons
  const runnerUps = scored.slice(1, 4);
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
    deprioritized,
    candidateDiscovery: buildCandidateDiscoveryLog(winner, scored, suppressedCandidates, null),
  };
}
