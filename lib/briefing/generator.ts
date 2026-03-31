import * as Sentry from '@sentry/nextjs';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import type {
  ActionType,
  ChiefOfStaffBriefing,
  ConvictionArtifact,
  ConvictionDirective,
  DecisionPayload,
  EvidenceItem,
  GenerationCandidateDiscoveryLog,
  GenerationRunLog,
  ValidArtifactTypeCanonical,
} from './types';
import { validateDecisionPayload } from './types';
import type { DeprioritizedLoop, ScoredLoop, ScorerResult } from './scorer';
import { scoreOpenLoops } from './scorer';
import { isOverDailyLimit, trackApiCall } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import {
  getDirectiveConstraintViolations,
  getPinnedConstraintPrompt,
} from './pinned-constraints';
import { researchWinner } from './researcher';
import type { ResearchInsight } from './researcher';
import { decryptWithStatus } from '@/lib/encryption';
import {
  APPROVAL_LOOKBACK_MS,
  CONFIDENCE_PERSIST_THRESHOLD,
  daysMs,
} from '@/lib/config/constants';
import {
  TRIGGER_ACTION_MAP,
  buildTriggerContextBlock,
  resolveTriggerAction,
  validateTriggerArtifact,
} from './trigger-action-map';
import type { DiscrepancyClass } from './discrepancy-detector';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATION_FAILED_SENTINEL = '__GENERATION_FAILED__';
const GENERATION_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_DIRECTIVE_CONFIDENCE_THRESHOLD = CONFIDENCE_PERSIST_THRESHOLD;
const STALE_SIGNAL_THRESHOLD_DAYS = 14;

/**
 * Load the per-user dynamic confidence threshold from tkg_goals.
 * Falls back to DEFAULT_DIRECTIVE_CONFIDENCE_THRESHOLD (45) if no row exists.
 * Written by defense7SelfOptimize in self-heal.ts.
 */
async function loadDirectiveConfidenceThreshold(userId: string): Promise<number> {
  try {
    const { createServerClient: csc } = await import('@/lib/db/client');
    const supabase = csc();
    const { data } = await supabase
      .from('tkg_goals')
      .select('priority')
      .eq('user_id', userId)
      .eq('source', 'system_threshold')
      .eq('goal_category', 'other')
      .maybeSingle();
    return data?.priority ?? DEFAULT_DIRECTIVE_CONFIDENCE_THRESHOLD;
  } catch {
    return DEFAULT_DIRECTIVE_CONFIDENCE_THRESHOLD;
  }
}

/** Goal sources that are onboarding placeholders — excluded from scoring/generation. */
const PLACEHOLDER_GOAL_SOURCES = new Set(['onboarding_bucket', 'onboarding_marker']);

// ---------------------------------------------------------------------------
// Part 1 — Artifact contract: valid user-facing types
// ---------------------------------------------------------------------------

type ValidArtifactType =
  | 'send_message'
  | 'write_document'
  | 'schedule_block'
  | 'wait_rationale'
  | 'do_nothing';

const VALID_ARTIFACT_TYPES: ReadonlySet<string> = new Set([
  'send_message',
  'write_document',
  'schedule_block',
  'wait_rationale',
  'do_nothing',
]);

const EXECUTABLE_ARTIFACT_TYPES: ReadonlySet<string> = new Set([
  'send_message',
  'write_document',
  'schedule_block',
]);

// ---------------------------------------------------------------------------
// Part 2 — System prompt (execution layer, not advisor)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `SYSTEM — FOLDERA ARTIFACT RENDERER

You produce finished artifacts for a personal AI assistant. The scoring system has already
selected and validated the best candidate. Your job is to render a high-quality artifact.

RULES

1. You MUST produce an artifact. The candidate has been validated — do not refuse or decline.

2. Output must be a finished artifact.
- Fully written, ready to use
- No placeholders, no brackets, no TODOs
- Only use facts from the signals provided

3. No generic content.
Forbidden openers/phrases:
- "follow up", "check in", "circle back", "just reaching out"
- "I hope this email finds you well", "touching base"
- Any opener not anchored to specific evidence

4. Every artifact must include:
- Explicit context anchor (what thread / when / who)
- Specific forward motion (decision, next step, or concrete ask)
- Real names, dates, and details from the signals — never invented

5. Confidence: rate 0-100 based on evidence quality.
- 70+ = strong single-source evidence with clear next step
- 50-69 = reasonable evidence, some inference required
- Below 50 = thin evidence, action may not be appropriate

6. Include a structured causal diagnosis.
- "why_exists_now": why the discrepancy exists today
- "mechanism": root cause creating the discrepancy
- The artifact must resolve this mechanism, not restate surface symptoms.

---

OUTPUT FORMAT

Preferred (Discrepancy Engine):
{
  "action": "send_message",
  "confidence": 0-100,
  "reason": "one sentence describing why this action matters now",
  "causal_diagnosis": {
    "why_exists_now": "...",
    "mechanism": "..."
  },
  "message": {
    "to": "real@email.com",
    "subject": "...",
    "body": "..."
  }
}

Legacy format (also accepted):
{
  "insight": "...",
  "causal_diagnosis": {
    "why_exists_now": "...",
    "mechanism": "..."
  },
  "decision": "ACT",
  "directive": "one sentence describing the action",
  "artifact_type": "send_message|write_document|schedule_block|wait_rationale|do_nothing",
  "artifact": {},
  "why_now": "..."
}

CRITICAL: Return ONLY a JSON object. No markdown fences, no explanation, no text before or after the JSON. The response must start with { and end with }.

For "action", valid values are: send_message, write_document, schedule_block, wait_rationale, do_nothing.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedDirectivePayload {
  /** The non-obvious finding: a contradiction, pattern shift, or timing edge */
  insight: string;
  /** Root-cause diagnosis that explains why this discrepancy exists now */
  causal_diagnosis: CausalDiagnosis;
  /** Where the accepted causal diagnosis came from after grounding checks */
  causal_diagnosis_source?: 'llm_grounded' | 'llm_ungrounded_fallback' | 'template_fallback';
  /** True when the model explicitly returned causal_diagnosis fields */
  causal_diagnosis_from_model?: boolean;
  /** Explicit analyst decision: ACT to produce an artifact, HOLD to surface the insight only */
  decision: 'ACT' | 'HOLD';
  directive: string;
  artifact_type: ValidArtifactType;
  artifact: Record<string, unknown>;
  why_now: string;
}

interface CausalDiagnosis {
  why_exists_now: string;
  mechanism: string;
}

interface RecentActionRow {
  directive_text: string | null;
  action_type: string | null;
  generated_at: string;
}

interface RecentSkippedActionRow extends RecentActionRow {
  skip_reason: string | null;
}

interface RecentEntityActionRow {
  id: string;
  directive_text: string | null;
  execution_result: unknown;
  generated_at: string;
  status: string | null;
}

interface SignalSnippet {
  source: string;
  date: string;
  subject: string | null;
  snippet: string;
  author: string | null;
  direction: 'sent' | 'received' | 'unknown';
}

interface GenerateDirectiveOptions {
  dryRun?: boolean;
  /** Skip daily spend cap check — used for manual Generate Now so testing doesn't cost money */
  skipSpendCap?: boolean;
}

// ---------------------------------------------------------------------------
// Goal-gap analysis — behavioral divergence between stated and actual
// ---------------------------------------------------------------------------

export interface GoalGapEntry {
  goal_text: string;
  priority: number;
  category: string;
  signal_count_14d: number;
  signal_count_30d: number;
  signal_count_90d: number;
  action_count_14d: number;
  commitment_count: number;
  gap_level: 'HIGH' | 'MEDIUM' | 'LOW';
  gap_description: string;
}

/**
 * For every active (non-placeholder) goal, count how many signals, actions,
 * and commitments relate to it across 14d / 30d / 90d windows.
 * Uses decrypted signal content for keyword matching.
 * Computes behavioral divergence: stated priority vs. actual signal density.
 *
 * Returns up to 5 goals ordered by gap severity descending.
 */
async function buildGoalGapAnalysis(userId: string): Promise<GoalGapEntry[]> {
  const supabase = createServerClient();
  const now = Date.now();
  const fourteenDaysAgo = new Date(now - daysMs(14)).toISOString();
  const ninetyDaysAgo  = new Date(now - daysMs(90)).toISOString();

  // 1. Active goals (exclude onboarding placeholders)
  const { data: goalRows } = await supabase
    .from('tkg_goals')
    .select('goal_text, priority, goal_category, source')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('priority', { ascending: true })
    .limit(20);

  const goals = (goalRows ?? []).filter(
    (g: { source?: string | null; goal_text?: string }) =>
      !PLACEHOLDER_GOAL_SOURCES.has((g.source as string) ?? '') &&
      !(g.goal_text ?? '').startsWith('__'),
  ).slice(0, 8) as Array<{ goal_text: string; priority: number; goal_category: string }>;

  if (goals.length === 0) return [];

  // 2. Signals last 90d — decrypt content for real keyword matching
  const { data: signalRows } = await supabase
    .from('tkg_signals')
    .select('content, source, occurred_at')
    .eq('user_id', userId)
    .eq('processed', true)
    .gte('occurred_at', ninetyDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(400);

  // 3. Completed actions last 14d
  const { data: actionRows } = await supabase
    .from('tkg_actions')
    .select('directive_text, action_type, status, generated_at')
    .eq('user_id', userId)
    .in('status', ['approved', 'executed'])
    .gte('generated_at', fourteenDaysAgo)
    .limit(100);

  // 4. Active commitments (plaintext descriptions)
  const { data: commitmentRows } = await supabase
    .from('tkg_commitments')
    .select('description, category, made_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('suppressed_at', null)
    .gte('made_at', ninetyDaysAgo)
    .limit(200);

  // Decrypt signals once — reused across all goals
  const thirtyDaysAgo = new Date(now - daysMs(30)).toISOString();
  type DecryptedSignal = { text: string; occurred_at: string };
  const decryptedSignals: DecryptedSignal[] = [];
  for (const s of signalRows ?? []) {
    const dec = decryptWithStatus((s.content as string) ?? '');
    if (dec.usedFallback) continue;
    decryptedSignals.push({ text: dec.plaintext.toLowerCase(), occurred_at: s.occurred_at as string });
  }

  const actions = actionRows ?? [];
  const commitments = (commitmentRows ?? []) as Array<{ description: string; category: string | null; made_at: string | null }>;

  // Keyword extractor (≥4 char words from goal text)
  const makeKeywords = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length >= 4);

  const entries: GoalGapEntry[] = [];

  for (const goal of goals) {
    const kws = makeKeywords(goal.goal_text);
    const minMatch = Math.min(1, kws.length); // 1-keyword match is enough

    const matchesKws = (text: string) =>
      kws.length > 0 && kws.filter((kw) => text.includes(kw)).length >= minMatch;

    // Signal density across 14d / 30d / 90d windows
    let count14 = 0, count30 = 0, count90 = 0;
    for (const s of decryptedSignals) {
      if (!matchesKws(s.text)) continue;
      count90++;
      if (s.occurred_at >= thirtyDaysAgo) count30++;
      if (s.occurred_at >= fourteenDaysAgo) count14++;
    }

    // Action count (14d)
    let actionCount = 0;
    for (const a of actions) {
      const text = ((a.directive_text as string) ?? '').toLowerCase();
      if (matchesKws(text)) actionCount++;
    }

    // Commitment count (category match or keyword match in description)
    let commitmentCount = 0;
    for (const c of commitments) {
      const catMatch = (c.category ?? '').toLowerCase() === goal.goal_category.toLowerCase();
      const kwMatch  = matchesKws(c.description.toLowerCase());
      if (catMatch || kwMatch) commitmentCount++;
    }

    // Gap computation using density trajectory (not just 14d snapshot)
    // Velocity: is activity increasing (30d rate > 90d/3 average) or flat/declining?
    const rate90  = count90 / 3;   // monthly average over 90d
    const accelerating = count30 > rate90 * 1.2;
    const decelerating = count30 < rate90 * 0.5 && count90 > 5;

    let gap_level: GoalGapEntry['gap_level'];
    let gap_description: string;

    if (goal.priority <= 2 && count90 <= 5) {
      gap_level = 'HIGH';
      gap_description = `P${goal.priority} goal — ${count90} signals in 90 days. Near-zero behavioral footprint.${commitmentCount > 0 ? ` ${commitmentCount} open commitment${commitmentCount !== 1 ? 's' : ''} tracked.` : ''}`;
    } else if (goal.priority <= 2 && count90 > 5 && actionCount === 0 && !accelerating) {
      gap_level = 'HIGH';
      gap_description = `${count90} signals (${count30} last 30d) but 0 completed actions. Observing, not executing.${decelerating ? ' Activity declining.' : ''}`;
    } else if (goal.priority <= 3 && count30 < rate90 * 0.6) {
      gap_level = 'MEDIUM';
      gap_description = `${count30} signals last 30d vs ${Math.round(rate90)} avg/mo — activity declining vs stated priority.`;
    } else if (accelerating && goal.priority <= 3) {
      gap_level = 'LOW';
      gap_description = `${count30} signals last 30d — accelerating. Behavior aligns with priority.`;
    } else {
      gap_level = count90 === 0 ? 'HIGH' : 'LOW';
      gap_description = count90 === 0
        ? `0 signals in 90 days. Goal may be stale or mislabeled.`
        : `${count90} signals over 90d (${count30} last 30d). Behavior roughly matches priority.`;
    }

    entries.push({
      goal_text: goal.goal_text,
      priority: goal.priority,
      category: goal.goal_category,
      signal_count_14d: count14,
      signal_count_30d: count30,
      signal_count_90d: count90,
      action_count_14d: actionCount,
      commitment_count: commitmentCount,
      gap_level,
      gap_description,
    });
  }

  const gapOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  entries.sort((a, b) => {
    const gapDiff = gapOrder[a.gap_level] - gapOrder[b.gap_level];
    return gapDiff !== 0 ? gapDiff : b.priority - a.priority;
  });

  return entries;
}

/**
 * Pre-compute behavioral avoidance signals before the LLM call.
 * Detects: received emails with no reply sent, and aging open commitments.
 * These are passed as facts to the prompt so the model doesn't have to infer
 * avoidance from 3 signal snippets alone.
 */
async function buildAvoidanceObservations(
  userId: string,
  winner: ScoredLoop,
  signalEvidence: SignalSnippet[],
): Promise<AvoidanceObservation[]> {
  const supabase = createServerClient();
  const observations: AvoidanceObservation[] = [];
  const now = Date.now();

  // 1. Received emails with no reply sent in the last 14 days
  const fourteenDaysAgo = new Date(now - daysMs(14)).toISOString();
  const { data: sentRows } = await supabase
    .from('tkg_signals')
    .select('content, occurred_at')
    .eq('user_id', userId)
    .eq('type', 'email_sent')
    .gte('occurred_at', fourteenDaysAgo)
    .limit(20);

  // Build set of addresses/names we have replied to
  const repliedToTokens = new Set<string>();
  for (const row of sentRows ?? []) {
    const dec = decryptWithStatus((row.content as string) ?? '');
    if (dec.usedFallback) continue;
    const toMatch = dec.plaintext.match(/^To:\s*(.+?)(?:\n|$)/im);
    if (!toMatch) continue;
    const toStr = toMatch[1].toLowerCase();
    const emails = toStr.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
    for (const e of emails) repliedToTokens.add(e);
    // Also index name fragments for fuzzy matching (e.g. "yadira" matches "yadira.gonzalez@...")
    const nameTokens = toStr.match(/\b[a-z]{3,}\b/g) ?? [];
    for (const t of nameTokens) repliedToTokens.add(t);
  }

  // Check signal evidence authors against replied-to set
  for (const sig of signalEvidence) {
    if (!sig.author || sig.source === 'email_sent' || !sig.subject) continue;
    const authorLower = sig.author.toLowerCase();
    const replied = [...repliedToTokens].some(
      (r) => authorLower.includes(r) || r.includes(authorLower.split('@')[0] ?? ''),
    );
    if (!replied) {
      const daysAgo = Math.round((now - new Date(sig.date).getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo >= 2) {
        observations.push({
          type: 'no_reply_sent',
          severity: daysAgo >= 5 ? 'high' : 'medium',
          observation: `${sig.author} sent "${sig.subject.slice(0, 60)}" ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago — no reply sent.`,
        });
      }
    }
  }

  // 2. Aging open commitments from this candidate's source signals
  const commitmentIds = (winner.sourceSignals ?? [])
    .filter((s) => s.kind === 'commitment' && s.id)
    .map((s) => s.id!)
    .slice(0, 5);

  if (commitmentIds.length > 0) {
    const { data: commitRows } = await supabase
      .from('tkg_commitments')
      .select('description, made_at')
      .in('id', commitmentIds)
      .limit(3);

    for (const row of commitRows ?? []) {
      const madeAt = row.made_at ? new Date(row.made_at as string).getTime() : null;
      if (!madeAt) continue;
      const ageDays = Math.round((now - madeAt) / (1000 * 60 * 60 * 24));
      if (ageDays >= 7) {
        observations.push({
          type: 'commitment_aging',
          severity: ageDays >= 21 ? 'high' : 'medium',
          observation: `Commitment "${(row.description as string ?? '').slice(0, 80)}" has been open ${ageDays} days with no completion signal.`,
        });
      }
    }
  }

  // Highest severity first, cap at 3
  return observations
    .sort((a, b) =>
      a.severity === 'high' && b.severity !== 'high' ? -1
      : b.severity === 'high' && a.severity !== 'high' ? 1
      : 0,
    )
    .slice(0, 3);
}

// ---------------------------------------------------------------------------
// Part 2b — Multi-candidate competition: select the most viable final winner
// ---------------------------------------------------------------------------

/**
 * Apply a viability layer on top of the scorer's raw ranking.
 *
 * The scorer ranks by behavioral loop score (stakes × urgency × tractability).
 * That score is the right signal for WHICH tension matters most — but it cannot
 * know whether the top-ranked candidate can actually produce an executable artifact.
 *
 * This function evaluates the top 3 scored candidates on execution viability and
 * selects the one most likely to produce an artifact the user can approve without
 * editing. It may select candidate #2 or #3 over the scorer's #1 when the #1 lacks
 * a real recipient, has aging signals, or was already acted on recently.
 *
 * Returns the final winner plus a competition context string injected into the
 * generation prompt so the LLM knows why this candidate beat the others.
 */
export function selectRankedCandidates(
  topCandidates: import('./scorer').ScoredLoop[],
  guardrails: { approvedRecently: RecentActionRow[]; skippedRecently?: RecentSkippedActionRow[] },
): { ranked: Array<{ candidate: import('./scorer').ScoredLoop; note: string; disqualified: boolean; disqualifyReason: string | null }>; competitionContext: string } {
  if (topCandidates.length === 0) throw new Error('selectRankedCandidates: empty candidate list');
  if (topCandidates.length === 1) return { ranked: [{ candidate: topCandidates[0], note: 'only candidate', disqualified: false, disqualifyReason: null }], competitionContext: '' };

  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const OBVIOUS_FIRST_LAYER_RE = /^(?:follow\s+up|check\s+in|touch\s+base|circle\s+back|schedule\s+(?:a\s+)?(?:\d+.?minute\s+)?(?:block|time|session))\b/i;
  const SEND_WRITE_ACTIONS = new Set<ActionType>(['send_message', 'write_document', 'make_decision', 'research']);
  const hasDiscrepancy = topCandidates.some((candidate) => candidate.type === 'discrepancy');

  interface Rated {
    candidate: import('./scorer').ScoredLoop;
    viabilityScore: number;
    note: string;
    disqualified: boolean;
    disqualifyReason: string | null;
  }

  const rated: Rated[] = topCandidates.map((candidate) => {
    // 0. Hard disqualifiers — top slots must be SEND/WRITE capable, non-generic finished-work candidates.
    if (!SEND_WRITE_ACTIONS.has(candidate.suggestedActionType)) {
      return {
        candidate,
        viabilityScore: 0,
        note: '',
        disqualified: true,
        disqualifyReason: 'candidate is not send/write capable',
      };
    }
    if (OBVIOUS_FIRST_LAYER_RE.test(candidate.title.trim())) {
      return {
        candidate,
        viabilityScore: 0,
        note: '',
        disqualified: true,
        disqualifyReason: 'obvious first-layer advice',
      };
    }

    // 1. Dedup: disqualify if user was shown a similar directive in the last 7 days.
    //    Uses the same 72% token-similarity threshold as buildStructuredContext so
    //    the eligibility check and selection check are consistent.
    const candNorm = candidate.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const alreadyActed = guardrails.approvedRecently.some((r) => {
      if (!r.directive_text) return false;
      const norm = r.directive_text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const tA = new Set(candNorm.split(' ').filter((t) => t.length >= 4));
      const tB = new Set(norm.split(' ').filter((t) => t.length >= 4));
      if (!tA.size || !tB.size) return false;
      let inter = 0;
      for (const t of tA) if (tB.has(t)) inter++;
      return inter / new Set([...tA, ...tB]).size >= 0.72;
    });
    if (alreadyActed) {
      return {
        candidate,
        viabilityScore: 0,
        note: '',
        disqualified: true,
        disqualifyReason: 'already acted on this topic in the last 7 days',
      };
    }

    // 2. Viability multipliers applied to raw scorer score.
    let mult = 1.0;
    const notes: string[] = [];

    // Discrepancy priority invariant: if discrepancy candidates exist, tasks lose
    // unless they are unusually strong, evidence-dense commitments.
    if (hasDiscrepancy) {
      if (candidate.type === 'discrepancy') {
        mult *= 1.2;
        notes.push('discrepancy-priority boost');
      } else {
        const strongCommitment =
          candidate.type === 'commitment'
          && candidate.breakdown.stakes >= 3
          && candidate.breakdown.urgency >= 0.6
          && ((candidate.relatedSignals?.length ?? 0) + (candidate.sourceSignals?.length ?? 0)) >= 3;
        mult *= strongCommitment ? 0.88 : 0.55;
        notes.push(strongCommitment ? 'softened task penalty under discrepancy priority' : 'task penalty under discrepancy priority');
      }
    }

    // Commitment/compound: real obligations the user already committed to.
    // These always produce a finished artifact — highest resolution value.
    if (candidate.type === 'commitment' || candidate.type === 'compound') {
      mult *= 1.12;
      notes.push('real commitment');
    }

    // Email presence in raw candidate data (pre-hydration scan).
    // extractAllEmailAddresses() needs a hydrated winner; at this stage we scan
    // the raw content, relatedSignals, and sourceSignal summaries directly.
    const rawText = [
      candidate.content,
      ...(candidate.relatedSignals ?? []),
      ...(candidate.sourceSignals ?? []).map((s) => s.summary ?? ''),
    ].join(' ');
    EMAIL_RE.lastIndex = 0;
    const emailHits = rawText.match(EMAIL_RE)?.filter(
      (e) => !e.includes('example') && !e.includes('placeholder') && !e.includes('noreply'),
    ) ?? [];

    if (candidate.suggestedActionType === 'send_message') {
      if (emailHits.length > 0) {
        notes.push('send_message with email in signals');
      } else {
        // Will be force-downgraded to write_document after hydration.
        // Penalise so a rival candidate with a real recipient can win.
        mult *= 0.80;
        notes.push('send_message — no email in signals, will downgrade');
      }
    }

    // Signal recency: fresher evidence → more actionable artifact today.
    const signalDates = (candidate.sourceSignals ?? [])
      .map((s) => s.occurredAt)
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d).getTime())
      .filter((t) => !Number.isNaN(t));
    const newestMs = signalDates.length > 0 ? Math.max(...signalDates) : 0;
    const ageDays = newestMs > 0 ? (Date.now() - newestMs) / (1000 * 60 * 60 * 24) : 14;
    if (ageDays <= 2) {
      mult *= 1.08;
      notes.push('signal ≤2d');
    } else if (ageDays <= 5) {
      mult *= 1.03;
    } else if (ageDays > 10) {
      mult *= 0.88;
      notes.push(`signal ${Math.round(ageDays)}d old`);
    }

    // Penalize low-novelty candidates so repeated patterns do not outrank unseen discrepancies.
    if ((candidate.breakdown.freshness ?? 1) <= 0.65) {
      mult *= 0.82;
      notes.push('low novelty');
    }

    // --- Winner tier classification ---
    // Tier 2 (3-way triangulation) outranks Tier 1 (single-signal valid).
    // Axis 1: Outcome pressure — money, job, approval, deadline, risk
    const hasOutcomePressure =
      (candidate.breakdown.stakes ?? 0) >= 2
      || (candidate.breakdown.urgency ?? 0) >= 0.6
      || !!candidate.matchedGoal;
    // Axis 2: Behavioral discrepancy — drift, avoidance, decay, contradiction
    const hasBehavioralDiscrepancy =
      candidate.type === 'discrepancy'
      || (candidate.breakdown.entityPenalty ?? 0) < -5;
    // Axis 3: Execution anchor — real recipient, real thread, real entity
    const hasExecutionAnchor =
      emailHits.length > 0
      || (candidate.relatedSignals?.length ?? 0) >= 2;

    const triangulationAxes = [hasOutcomePressure, hasBehavioralDiscrepancy, hasExecutionAnchor].filter(Boolean).length;
    if (triangulationAxes >= 3) {
      mult *= 1.35;
      notes.push('tier-2 triangulated (outcome+discrepancy+anchor)');
    } else if (triangulationAxes >= 2) {
      mult *= 1.10;
      notes.push(`tier-1+ (${triangulationAxes}/3 axes)`);
    }

    return {
      candidate,
      viabilityScore: candidate.score * mult,
      note: notes.join('; ') || 'base score',
      disqualified: false,
      disqualifyReason: null,
    };
  });

  // Sort: disqualified last, then viabilityScore desc
  rated.sort((a, b) => {
    if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
    return b.viabilityScore - a.viabilityScore;
  });

  let top = rated[0];

  const topDiscrepancy = rated
    .filter((entry) => !entry.disqualified && entry.candidate.type === 'discrepancy')
    .sort((a, b) => b.viabilityScore - a.viabilityScore)[0];
  if (topDiscrepancy && !top.disqualified && top.candidate.type !== 'discrepancy' && topDiscrepancy.viabilityScore <= top.viabilityScore) {
    topDiscrepancy.viabilityScore = top.viabilityScore + 0.001;
    topDiscrepancy.note = `${topDiscrepancy.note}; discrepancy forced above task`;
    rated.sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
      return b.viabilityScore - a.viabilityScore;
    });
    top = rated[0];
  }

  // Pathological fallback: all disqualified → still return ranked list so fallback loop can try
  if (top.disqualified) {
    return { ranked: rated.map(r => ({ candidate: r.candidate, note: r.note, disqualified: r.disqualified, disqualifyReason: r.disqualifyReason })), competitionContext: '' };
  }

  // Build competition context for the generation prompt.
  // Tells the LLM which candidates were evaluated and why the winner beat them —
  // giving it permission to write a more decisive, grounded artifact.
  const beaten = rated.slice(1).filter((r) => !r.disqualified);
  const dropped = rated.slice(1).filter((r) => r.disqualified);
  const lines: string[] = [
    `Winner: "${top.candidate.title.slice(0, 100)}" (raw score ${top.candidate.score.toFixed(2)}, type: ${top.candidate.type}; viability: ${top.note})`,
  ];
  for (const r of beaten) {
    const pct =
      top.viabilityScore > 0
        ? ((top.viabilityScore - r.viabilityScore) / top.viabilityScore * 100).toFixed(0)
        : '0';
    lines.push(
      `Beaten: "${r.candidate.title.slice(0, 100)}" — raw ${r.candidate.score.toFixed(2)}, ${pct}% below winner on viability (${r.note || 'base score'})`,
    );
  }
  for (const r of dropped) {
    lines.push(
      `Dropped: "${r.candidate.title.slice(0, 100)}" — ${r.disqualifyReason ?? 'disqualified'}`,
    );
  }

  const competitionContext =
    `CANDIDATE_COMPETITION (${rated.length} candidate${rated.length !== 1 ? 's' : ''} evaluated — final winner selected on execution viability, not just scorer rank):\n` +
    lines.join('\n') + '\n' +
    `This context proves why you are generating for this candidate today. Use it to write a specific, grounded artifact — not a generic follow-up.`;

  return { ranked: rated.map(r => ({ candidate: r.candidate, note: r.note, disqualified: r.disqualified, disqualifyReason: r.disqualifyReason })), competitionContext };
}

// Backward-compat wrapper — callers that only need the top pick
export function selectFinalWinner(
  topCandidates: import('./scorer').ScoredLoop[],
  guardrails: { approvedRecently: RecentActionRow[]; skippedRecently?: RecentSkippedActionRow[] },
): { winner: import('./scorer').ScoredLoop; competitionContext: string } {
  const { ranked, competitionContext } = selectRankedCandidates(topCandidates, guardrails);
  return { winner: ranked[0].candidate, competitionContext };
}

// ---------------------------------------------------------------------------
// Decision Payload — the canonical binding decision from scorer to generator.
// The generator RENDERS this; it does not choose the action.
// ---------------------------------------------------------------------------

function actionTypeToArtifactType(at: ActionType): ValidArtifactTypeCanonical {
  switch (at) {
    case 'send_message': return 'send_message';
    case 'write_document': return 'write_document';
    case 'schedule': return 'schedule_block';
    case 'do_nothing': return 'do_nothing';
    case 'make_decision': return 'write_document';
    case 'research': return 'write_document';
    default: return 'do_nothing';
  }
}

function buildDecisionPayload(
  winner: ScoredLoop,
  ctx: StructuredContext,
  confidence: number,
): DecisionPayload {
  // Determine freshness
  const signalDates = (winner.sourceSignals ?? [])
    .map((s) => s.occurredAt)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  const newestMs = signalDates.length > 0 ? Math.max(...signalDates) : 0;
  const ageDays = newestMs > 0
    ? (Date.now() - newestMs) / (1000 * 60 * 60 * 24)
    : STALE_SIGNAL_THRESHOLD_DAYS + 1;
  // Discrepancy candidates: absence of signals IS the structural evidence.
  // Set freshness to 'fresh' to bypass both blocking_reasons and validateDecisionPayload checks.
  const freshness_state: DecisionPayload['freshness_state'] = winner.type === 'discrepancy'
    ? 'fresh'
    : ageDays <= 7 ? 'fresh' : ageDays <= STALE_SIGNAL_THRESHOLD_DAYS ? 'aging' : 'stale';

  // Determine recommended_action — deterministic from scorer, not LLM
  let recommended_action: ValidArtifactTypeCanonical;

  // Trigger → Action Lock: discrepancy candidates use the mapping table.
  // The mapping table is the single source of truth for trigger→action.
  if (winner.type === 'discrepancy' && winner.discrepancyClass) {
    recommended_action = resolveTriggerAction(winner.discrepancyClass, ctx.has_real_recipient) as ValidArtifactTypeCanonical;
  } else {
    recommended_action = actionTypeToArtifactType(winner.suggestedActionType);

    // Legacy conversion rule: send_message without a recipient → write_document
    if (recommended_action === 'send_message' && !ctx.has_real_recipient) {
      recommended_action = 'write_document';
    }
  }

  // Build justification facts from concrete evidence
  const justification_facts: string[] = [];
  if (winner.matchedGoal) {
    justification_facts.push(`Matched goal [p${winner.matchedGoal.priority}]: ${winner.matchedGoal.text}`);
  }
  for (const sig of winner.relatedSignals.slice(0, 3)) {
    justification_facts.push(`Signal: ${sig.slice(0, 200)}`);
  }
  if (winner.relationshipContext) {
    justification_facts.push(`Relationship context: ${winner.relationshipContext.slice(0, 200)}`);
  }
  if (ctx.candidate_due_date) {
    justification_facts.push(`Due date: ${ctx.candidate_due_date}`);
  }

  // Build blocking reasons
  const blocking_reasons: string[] = [];
  // Discrepancy candidates: absence of signals IS the evidence — skip freshness gates
  if (!ctx.has_recent_evidence && winner.type !== 'discrepancy') blocking_reasons.push('No recent evidence (all signals older than 14 days)');
  // Constraint violations are ADVISORY pre-LLM, not hard blocks.
  // The constraint info is in the prompt via ctx.locked_constraints.
  // Post-LLM validation (validateDirectiveForPersistence) enforces constraints on the final artifact.
  // Blocking here kills generation based on scorer summary text, which is too aggressive.
  if (ctx.conflicts_with_locked_constraints) {
    // Log typed constraint codes for auditability
    const typedReasons = (ctx.constraint_violation_codes ?? []).map(c => `CONSTRAINT:${c}`).join(', ');
    logStructuredEvent({
      event: 'constraint_advisory', level: 'info', userId: 'system',
      artifactType: null, generationStatus: 'constraint_advisory',
      details: { scope: 'decision_payload', typed_violations: typedReasons || 'unknown', note: 'Constraint match on scorer text — advisory only' },
    });
  }
  if (ctx.already_acted_recently) blocking_reasons.push('Already acted on this topic in the last 7 days');
  if (freshness_state === 'stale' && winner.type !== 'discrepancy') blocking_reasons.push('Evidence is stale');

  // Determine readiness (initial pass — overridden by discrepancy gate below)
  let readiness_state: DecisionPayload['readiness_state'] = 'SEND';
  if (blocking_reasons.length > 0) readiness_state = 'NO_SEND';
  if (justification_facts.length === 0) readiness_state = 'INSUFFICIENT_SIGNAL';
  if (recommended_action === 'do_nothing') readiness_state = 'NO_SEND';

  // -----------------------------------------------------------------------
  // Discrepancy gate — advisory filters on thread quality.
  // Hard block only on no_thread + no_outcome (both missing = no basis).
  // Other conditions are soft signals that lower confidence, not hard blocks.
  // -----------------------------------------------------------------------

  // 1. Real thread exists (past signals only — future-dated calendar events are excluded)
  const pastSignals = (ctx.supporting_signals ?? []).filter(
    (s) => new Date(s.occurred_at).getTime() <= Date.now(),
  );
  const hasRealThread = pastSignals.length > 0;

  // 2. No reply sent (avoidance observation detected during context build)
  const hasNoReply = ctx.avoidance_observations?.some(
    (o) => o.type === 'no_reply_sent',
  ) ?? false;

  // 3. Hours elapsed since last signal in thread (past signals only)
  let hoursSinceLast: number | null = null;
  if (pastSignals.length > 0) {
    const last = pastSignals[pastSignals.length - 1];
    hoursSinceLast = (Date.now() - new Date(last.occurred_at).getTime()) / 3600000;
  }
  const meetsTimeThreshold = hoursSinceLast !== null && hoursSinceLast >= 24;

  // 4. Candidate is tied to a real outcome (matched goal present)
  const tiedToOutcome = ctx.candidate_goal !== null;

  // Hard block: no thread AND no goal = no basis to act at all
  if (!hasRealThread && !tiedToOutcome) {
    blocking_reasons.push('no_thread_no_outcome');
  }

  // Log soft signals for diagnostics (NOT in blocking_reasons — that array
  // feeds validateDecisionPayload which hard-blocks on any entry)
  const softSignals: string[] = [];
  if (!hasRealThread && tiedToOutcome) softSignals.push('no_thread_but_goal_anchored');
  if (!meetsTimeThreshold && hasRealThread) softSignals.push(`recent_activity_${Math.round(hoursSinceLast ?? 0)}h`);
  if (!hasNoReply && hasRealThread) softSignals.push('user_already_replied');
  if (softSignals.length > 0) {
    logStructuredEvent({
      event: 'discrepancy_soft_signals', level: 'info', userId: 'system',
      artifactType: null, generationStatus: 'soft_signal',
      details: { scope: 'discrepancy_gate', signals: softSignals, hoursSinceLast, winner_id: winner.id },
    });
  }

  const hardBlocked = blocking_reasons.length > 0;
  if (hardBlocked) {
    readiness_state = 'NO_SEND';
    recommended_action = 'do_nothing';
  } else {
    readiness_state = 'SEND';
    // do_nothing set by resolveTriggerAction (RECIPIENT_REQUIRED_CLASSES without a recipient)
    // must be preserved — validateDecisionPayload will block the candidate so the generator
    // falls through to the next one. Do NOT override to send_message here.
  }

  return {
    winner_id: winner.id,
    source_type: winner.type,
    lifecycle_state: winner.lifecycle?.state === 'resolved' ? 'resolved'
      : winner.lifecycle?.state === 'active_now' ? 'active'
      : 'unknown',
    readiness_state,
    recommended_action,
    action_target: winner.title.slice(0, 200),
    justification_facts,
    confidence_score: confidence,
    freshness_state,
    blocking_reasons,
    matched_goal: winner.matchedGoal?.text ?? null,
    matched_goal_priority: winner.matchedGoal?.priority ?? null,
    scorer_score: winner.score,
  };
}

// ---------------------------------------------------------------------------
// Part 3 — Structured context (preprocessing)
// ---------------------------------------------------------------------------

interface CompressedSignal {
  source: string;
  occurred_at: string;
  entity: string | null;
  summary: string;
  direction: 'sent' | 'received' | 'unknown';
}

interface AvoidanceObservation {
  type: 'no_reply_sent' | 'commitment_aging';
  severity: 'high' | 'medium';
  observation: string;
}

interface StructuredContext {
  selected_candidate: string;
  candidate_class: string;
  candidate_title: string;
  candidate_reason: string;
  candidate_goal: string | null;
  candidate_score: number;
  candidate_due_date: string | null;
  supporting_signals: CompressedSignal[];
  surgical_raw_facts: string[];
  active_goals: string[];
  locked_constraints: string | null;
  recent_action_history_7d: string[];
  // Precomputed booleans (Part 4)
  has_real_target: boolean;
  has_real_recipient: boolean;
  has_recent_evidence: boolean;
  already_acted_recently: boolean;
  decision_already_made: boolean;
  can_execute_without_editing: boolean;
  has_due_date_or_time_anchor: boolean;
  conflicts_with_locked_constraints: boolean;
  constraint_violation_codes: string[];
  // Enrichment
  researcher_insight: ResearchInsight | null;
  // User identity context (dynamic, from goals)
  user_identity_context: string | null;
  // Goal-gap analysis (all active goals with behavioral gap)
  goal_gap_analysis: GoalGapEntry[];
  // Sent mail in last 14d — what the user has already done. Model must not suggest these.
  already_sent_14d: string[];
  // Behavioral mirrors: anti-patterns + revealed-preference divergences from scorer
  // Surfaced even when they didn't win scoring, so the model can reference them as context
  behavioral_mirrors: string[];
  // Conviction math: inferred burn rate, runway, EV comparison — injected when available
  conviction_math: string | null;
  // Weekly behavioral history from signal_summaries (last 8 weeks, oldest first)
  behavioral_history: string | null;
  // Pre-computed avoidance signals — facts the model can reference directly
  avoidance_observations: AvoidanceObservation[];
  // Chronological thread showing the arc of the winner relationship (sent/received, days since reply)
  relationship_timeline: string | null;
  // Multi-candidate competition context — why this winner beat the alternatives
  competition_context: string | null;
  // Confidence prior derived from scorer (actionTypeRate + entityPenalty) — bounds generator guessing
  confidence_prior: number;
  // Canonical root-cause diagnosis inferred before rendering.
  required_causal_diagnosis: CausalDiagnosis;
  // Trigger context block — injected for discrepancy candidates only
  trigger_context: string | null;
}

type CausalMechanismClass =
  | 'unowned_dependency'
  | 'timing_asymmetry'
  | 'avoidance_pattern'
  | 'relationship_cooling'
  | 'contradiction_drift'
  | 'hidden_approval_blocker'
  | 'general';

function normalizeCausalDiagnosis(value: unknown): CausalDiagnosis | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const whyExistsNow = typeof record.why_exists_now === 'string'
    ? record.why_exists_now.trim()
    : '';
  const mechanism = typeof record.mechanism === 'string'
    ? record.mechanism.trim()
    : '';
  if (!whyExistsNow || !mechanism) return null;
  return {
    why_exists_now: whyExistsNow,
    mechanism,
  };
}

function classifyCausalMechanism(text: string): CausalMechanismClass {
  const lower = text.toLowerCase();
  if (/\b(approval|approver|sign[-\s]?off|final decision|gatekeeper)\b/.test(lower)) {
    return 'hidden_approval_blocker';
  }
  if (/\b(owner|ownership|accountable|dependency|blocked|blocker|handoff)\b/.test(lower)) {
    return 'unowned_dependency';
  }
  if (/\b(avoidance|no reply|no-response|defer|deferred|stalled thread|silence)\b/.test(lower)) {
    return 'avoidance_pattern';
  }
  if (/\b(contradiction|mismatch|drift|says|stated goal|goal vs|inconsistent)\b/.test(lower)) {
    return 'contradiction_drift';
  }
  if (/\b(deadline|due|timing|window|cutoff|late|slip)\b/.test(lower)) {
    return 'timing_asymmetry';
  }
  if (/\b(relationship|cooling|reciprocity|asymmetric effort|unanswered)\b/.test(lower)) {
    return 'relationship_cooling';
  }
  return 'general';
}

function inferRequiredCausalDiagnosis(input: {
  winner: ScoredLoop;
  candidateDueDate: string | null;
  avoidanceObservations: AvoidanceObservation[];
}): CausalDiagnosis {
  const combinedText = [
    input.winner.title,
    input.winner.content,
    ...input.winner.relatedSignals.slice(0, 2),
    ...input.avoidanceObservations.map((o) => o.observation),
  ].join(' ');
  const mechanismClass = classifyCausalMechanism(combinedText);
  const deadline = input.candidateDueDate
    ? `by ${input.candidateDueDate}`
    : 'in the next 24 hours';
  const target = input.winner.title.slice(0, 96);

  switch (mechanismClass) {
    case 'hidden_approval_blocker':
      return {
        why_exists_now: `The thread is active but the final approval owner for "${target}" is still implicit ${deadline}.`,
        mechanism: 'Hidden approval blocker: decision authority is not explicitly assigned.',
      };
    case 'unowned_dependency':
      return {
        why_exists_now: `Work is waiting on "${target}" and no accountable owner has accepted the dependency ${deadline}.`,
        mechanism: 'Unowned dependency before deadline.',
      };
    case 'avoidance_pattern':
      return {
        why_exists_now: `Signals show unresolved contact and no committed response path for "${target}" ${deadline}.`,
        mechanism: 'Avoidance pattern: uncomfortable decision kept open instead of forced closed.',
      };
    case 'relationship_cooling':
      return {
        why_exists_now: `Recent effort is asymmetric around "${target}" and response quality is cooling as timing pressure rises.`,
        mechanism: 'Relationship cooling after asymmetric effort.',
      };
    case 'contradiction_drift':
      return {
        why_exists_now: `The behavior around "${target}" conflicts with the stated outcome and the contradiction is now creating execution drag.`,
        mechanism: 'Contradiction between stated commitment and actual dependency state.',
      };
    case 'timing_asymmetry':
      return {
        why_exists_now: `The time window on "${target}" is closing faster than ownership/decision throughput.`,
        mechanism: 'Timing asymmetry: decision latency is now larger than remaining execution window.',
      };
    default:
      return {
        why_exists_now: `The discrepancy around "${target}" persists because the decision boundary is still ambiguous ${deadline}.`,
        mechanism: 'Unclear ownership and unresolved decision boundary.',
      };
  }
}

function buildStructuredContext(
  winner: ScoredLoop,
  guardrails: { approvedRecently: RecentActionRow[]; skippedRecently: RecentSkippedActionRow[] },
  userId: string,
  signalEvidence: SignalSnippet[],
  insight: ResearchInsight | null,
  userGoals?: Array<{ goal_text: string; priority: number; goal_category: string }>,
  goalGapAnalysis?: GoalGapEntry[],
  antiPatterns?: import('./scorer').AntiPattern[],
  divergences?: import('./scorer').RevealedGoalDivergence[],
  alreadySent?: string[],
  convictionDecision?: import('./conviction-engine').ConvictionDecision | null,
  behavioralHistory?: string | null,
  avoidanceObservations?: AvoidanceObservation[],
  competitionContext?: string | null,
  userEmails?: Set<string>,
): StructuredContext {
  // Type-diverse signal sampling: guarantee calendar, task, file, and drive
  // signals get representation instead of being buried under email volume.
  // Bloodhound approach: cast a wide net across signal types, then fill
  // remaining slots chronologically.
  const EMAIL_SOURCES = new Set(['gmail', 'outlook']);
  const sorted = signalEvidence
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const MAX_SIGNALS = 15;
  const nonEmailSignals = sorted.filter((s) => !EMAIL_SOURCES.has(s.source));
  const emailSignals = sorted.filter((s) => EMAIL_SOURCES.has(s.source));

  // Take up to 6 non-email signals first (calendar, tasks, files, drive)
  const diverse = nonEmailSignals.slice(0, 6);
  const usedIds = new Set(diverse.map((s) => `${s.source}:${s.date}:${s.author}`));

  // Fill remaining slots with chronological mix
  for (const s of sorted) {
    if (diverse.length >= MAX_SIGNALS) break;
    const key = `${s.source}:${s.date}:${s.author}`;
    if (!usedIds.has(key)) {
      diverse.push(s);
      usedIds.add(key);
    }
  }

  const supporting_signals: CompressedSignal[] = diverse.map((s) => ({
    source: s.source,
    occurred_at: s.date,
    entity: s.author,
    summary: [s.subject, s.snippet].filter(Boolean).join(' — '),
    direction: s.direction,
  }));

  // Extract surgical raw facts: emails, dates, names, subjects
  const surgical_raw_facts: string[] = [];
  const emailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  // Extract emails from relationship context
  if (winner.relationshipContext) {
    const bracketEmails = winner.relationshipContext.match(/<([^@\s>]+@[^@\s>]+\.[^@\s>]+)>/g);
    if (bracketEmails) {
      for (const e of bracketEmails.slice(0, 3)) {
        surgical_raw_facts.push(`recipient_email: ${e.replace(/[<>]/g, '')}`);
      }
    }
  }

  // Extract emails from signals
  for (const s of signalEvidence.slice(0, 7)) {
    if (s.subject) surgical_raw_facts.push(`email_subject: ${s.subject.slice(0, 100)}`);
    if (s.author) {
      const authorEmail = s.author.match(emailPattern);
      if (authorEmail) surgical_raw_facts.push(`contact_email: ${authorEmail[0]}`);
    }
  }

  // Extract due date from winner content
  const dateMatch = winner.content.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const candidate_due_date = dateMatch ? dateMatch[1] : null;

  // Active goals (priority 3+)
  const active_goals: string[] = [];
  if (winner.matchedGoal) {
    active_goals.push(`[${winner.matchedGoal.category}, p${winner.matchedGoal.priority}] ${winner.matchedGoal.text}`);
  }

  // Recent action history (compact)
  const recent_action_history_7d = [
    ...guardrails.approvedRecently.map((r) =>
      `[${r.generated_at.slice(0, 10)}] ${r.action_type ?? 'unknown'} APPROVED: ${(r.directive_text ?? '').slice(0, 80)}`),
    ...guardrails.skippedRecently.map((r) =>
      `[${r.generated_at.slice(0, 10)}] ${r.action_type ?? 'unknown'} SKIPPED: ${(r.directive_text ?? '').slice(0, 80)}`),
  ].slice(0, 10);

  // Precomputed booleans
  const allEmails = extractAllEmailAddresses(winner);
  for (const s of signalEvidence) {
    if (s.author) {
      const em = s.author.match(emailPattern);
      if (em) allEmails.push(em[0].toLowerCase());
    }
  }
  const uniqueEmails = [...new Set(allEmails)];

  // Filter out the user's own email addresses — self-addressed send_message
  // artifacts are never valid external actions.
  const externalEmails = userEmails && userEmails.size > 0
    ? uniqueEmails.filter((e) => !userEmails.has(e.toLowerCase()))
    : uniqueEmails;

  // Goal-linked discrepancy winners (id: discrepancy_velocity_* or discrepancy_drift_*)
  // have NO dedicated person entity — only a goal. Signal evidence emails are from
  // unrelated senders in the evidence window, not from a specific recipient for this action.
  // Counting them as has_real_recipient causes the LLM to pick a random email as `to`.
  const isGoalLinkedDiscrepancy = winner.type === 'discrepancy' &&
    !(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(winner.id));

  // Entity-linked discrepancies (decay/risk/exposure/avoidance — UUID in id) have a
  // dedicated person entity from the DB. The entity's email from relationshipContext
  // is already in surgical_raw_facts as `recipient_email:` (see extraction above).
  // Use that as the primary source — it is more reliable than signal sender history.
  const hasRecipientEmailInContext = surgical_raw_facts.some((f) => {
    if (!f.startsWith('recipient_email:')) return false;
    const email = f.slice('recipient_email: '.length).trim().toLowerCase();
    return !userEmails || userEmails.size === 0 || !userEmails.has(email);
  });

  const has_real_recipient = isGoalLinkedDiscrepancy
    // Goal-linked: only entity-db emails count (never random signal senders)
    ? hasRecipientEmailInContext
    // Entity-linked or non-discrepancy: entity-db email OR external signal senders
    : (hasRecipientEmailInContext || externalEmails.length > 0);

  // Check signal freshness
  const signalDates = (winner.sourceSignals ?? [])
    .map((s) => s.occurredAt)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  const newestSignalMs = signalDates.length > 0 ? Math.max(...signalDates) : 0;
  const newestSignalAgeDays = newestSignalMs > 0
    ? (Date.now() - newestSignalMs) / (1000 * 60 * 60 * 24)
    : STALE_SIGNAL_THRESHOLD_DAYS + 1;
  const has_recent_evidence = newestSignalAgeDays <= STALE_SIGNAL_THRESHOLD_DAYS;

  // Already acted recently: same topic in last 7 days
  const winnerNorm = normalizeText(winner.title);
  const already_acted_recently = guardrails.approvedRecently.some((r) => {
    if (!r.directive_text) return false;
    return similarityScore(winnerNorm, normalizeText(r.directive_text)) >= 0.72;
  });

  // Decision already made: check if approved recently with high similarity
  const decision_already_made = already_acted_recently;

  // Can execute: send_message needs email, write_document always can, schedule needs time anchor
  // NOTE: the pre-LLM action override (send_message → write_document) is now handled by
  // DecisionPayload construction. We still compute can_execute_without_editing for context.
  const actionType = winner.suggestedActionType;
  const can_execute_without_editing = !(actionType === 'send_message' && !has_real_recipient);

  const has_due_date_or_time_anchor = candidate_due_date !== null ||
    /\b(deadline|due|by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|end of))\b/i.test(winner.content);

  // Constraint check
  const pinnedConstraints = getPinnedConstraintPrompt(userId);
  const constraintViolations = getDirectiveConstraintViolations({
    userId,
    directive: winner.title,
    reason: winner.content,
    actionType: winner.suggestedActionType,
  });
  const conflicts_with_locked_constraints = constraintViolations.length > 0;
  const constraint_violation_codes = constraintViolations.map(v => v.code);

  // For commitment candidates, prepend entity name(s) from relationshipContext so the model
  // never has to produce a generic "follow up with [uuid]" directive.
  let selectedCandidate = winner.content.slice(0, 500);
  if (winner.type === 'commitment' && winner.relationshipContext) {
    // Extract first name from the relationship context line (format: "Name <email> | role | ...")
    const firstNameMatch = winner.relationshipContext.match(/^([^\n<|]+)/);
    const entityNamePrefix = firstNameMatch ? firstNameMatch[1].trim() : null;
    if (entityNamePrefix && entityNamePrefix !== 'self') {
      selectedCandidate = `ENTITY: ${entityNamePrefix}\n${selectedCandidate}`;
    }
  }

  const required_causal_diagnosis = inferRequiredCausalDiagnosis({
    winner,
    candidateDueDate: candidate_due_date,
    avoidanceObservations: avoidanceObservations ?? [],
  });

  return {
    selected_candidate: selectedCandidate,
    candidate_class: winner.type,
    candidate_title: winner.title,
    candidate_reason: winner.relatedSignals.slice(0, 2).join('; ').slice(0, 300) || winner.content.slice(0, 200),
    candidate_goal: winner.matchedGoal
      ? `${winner.matchedGoal.text} [${winner.matchedGoal.category}, p${winner.matchedGoal.priority}]`
      : null,
    candidate_score: winner.score,
    candidate_due_date,
    supporting_signals,
    surgical_raw_facts: surgical_raw_facts.slice(0, 5),
    active_goals,
    locked_constraints: pinnedConstraints,
    recent_action_history_7d,
    has_real_target: has_real_recipient || has_due_date_or_time_anchor,
    has_real_recipient,
    has_recent_evidence,
    already_acted_recently,
    decision_already_made,
    can_execute_without_editing,
    has_due_date_or_time_anchor,
    conflicts_with_locked_constraints,
    constraint_violation_codes,
    researcher_insight: insight,
    user_identity_context: buildUserIdentityContext(userGoals ?? []),
    goal_gap_analysis: goalGapAnalysis ?? [],
    already_sent_14d: alreadySent ?? [],
    behavioral_mirrors: buildBehavioralMirrors(antiPatterns ?? [], divergences ?? []),
    conviction_math: convictionDecision
      ? [
          `CONVICTION MATH (inferred from signals — not user-provided):`,
          convictionDecision.math,
          ``,
          `OPTIMAL ACTION: ${convictionDecision.optimalAction}`,
          convictionDecision.stopSecondGuessing ? `STOP SECOND-GUESSING: The math is definitive. Do not hedge.` : ``,
          `CATASTROPHIC SCENARIO (${convictionDecision.catastrophicProbability}% probability): ${convictionDecision.catastrophicScenario}`,
          `KEY HEDGE: ${convictionDecision.keyHedge}`,
        ].filter(Boolean).join('\n')
      : null,
    behavioral_history: behavioralHistory ?? null,
    avoidance_observations: avoidanceObservations ?? [],
    relationship_timeline: buildRelationshipTimeline(signalEvidence, winner.title),
    competition_context: competitionContext ?? null,
    confidence_prior: winner.confidence_prior,
    required_causal_diagnosis,
    trigger_context: winner.type === 'discrepancy' && winner.discrepancyClass && winner.trigger
      ? buildTriggerContextBlock(winner.discrepancyClass, winner.trigger)
      : null,
  };
}

function buildBehavioralMirrors(
  antiPatterns: import('./scorer').AntiPattern[],
  divergences: import('./scorer').RevealedGoalDivergence[],
): string[] {
  const mirrors: string[] = [];

  for (const ap of antiPatterns.slice(0, 2)) {
    mirrors.push(`[${ap.type.toUpperCase()}] ${ap.insight}`);
  }

  for (const div of divergences.slice(0, 2)) {
    const pct = Math.round(
      (div.revealedSignalCount / (div.revealedSignalCount + div.statedSignalCount + 1)) * 100,
    );
    mirrors.push(
      `[REVEALED_PREFERENCE] You say "${div.statedGoal.text}" is priority ${div.statedGoal.priority}/5, ` +
      `but ${pct}% of your last 14 days of signals are on ${div.revealedDomain} (${div.revealedSignalCount} signals vs ${div.statedSignalCount} on your stated goal). ` +
      `Are you avoiding the work, or has the goal changed?`,
    );
  }

  return mirrors;
}

/**
 * Build a chronological relationship timeline for the winner entity.
 * Shows the arc of communication — who sent what, when, and whether there was a reply gap.
 * Returns null if fewer than 2 signals involve the entity (omit section silently).
 */
function buildRelationshipTimeline(
  snippets: SignalSnippet[],
  winnerEntityName: string,
): string | null {
  const nameLower = winnerEntityName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const nameTokens = nameLower.split(/\s+/).filter((t) => t.length >= 3);

  const relevant = snippets
    .filter((s) => {
      const authorLower = (s.author ?? '').toLowerCase();
      const subjectLower = (s.subject ?? '').toLowerCase();
      const snippetLower = s.snippet.toLowerCase();
      return nameTokens.some((t) =>
        authorLower.includes(t) || subjectLower.includes(t) || snippetLower.includes(t),
      );
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (relevant.length < 2) return null;

  const lines: string[] = [];
  for (let i = 0; i < relevant.length; i++) {
    const s = relevant[i];
    const dirLabel = s.direction === 'sent' ? '[SENT] You' : s.direction === 'received' ? `[RECEIVED] ${s.author ?? 'them'}` : `[${s.author ?? 'unknown'}]`;
    const preview = s.subject ? `"${s.subject}"` : s.snippet.slice(0, 80);
    lines.push(`${s.date} ${dirLabel}: ${preview}`);

    // Detect no-reply gap after a received message
    if (s.direction === 'received') {
      const nextSent = relevant.slice(i + 1).find((n) => n.direction === 'sent');
      if (!nextSent) {
        const gapDays = Math.round((Date.now() - new Date(s.date).getTime()) / (1000 * 60 * 60 * 24));
        if (gapDays > 3) {
          lines.push(`[No reply sent — ${gapDays} days]`);
        }
      }
    }
  }

  return `RELATIONSHIP_TIMELINE:\n${lines.join('\n')}`;
}

/**
 * Build a dynamic identity context string from the user's top goals.
 * This gives the LLM a sense of who the user is and what matters to them,
 * so it can distinguish high-value directives from low-value housekeeping.
 * Never hardcodes user-specific text — derived entirely from tkg_goals.
 */
function buildUserIdentityContext(
  goals: Array<{ goal_text: string; priority: number; goal_category: string }>,
): string | null {
  console.log(`[generator] buildUserIdentityContext: ${goals.length} goals received`);
  if (goals.length === 0) return null;

  const lines: string[] = [];
  // Top goals become identity lines
  for (const g of goals.slice(0, 4)) {
    lines.push(`- [${g.goal_category}, priority ${g.priority}] ${g.goal_text}`);
  }

  return `USER CONTEXT (read-only, do not reference directly in output):
The user's stated priorities:
${lines.join('\n')}
- Use these to detect contradictions: if signal velocity goes elsewhere, that's a finding.
- Directives about tool configuration, account settings, internal system maintenance, or generic productivity are NOISE — output wait_rationale instead.
- Look for gaps between these stated priorities and what the user is actually doing in their signals. That gap IS the insight.`;
}

// ---------------------------------------------------------------------------
// Part 4 — Evidence gating (before LLM call)
// ---------------------------------------------------------------------------

// checkGenerationEligibility was removed — it was dead code (never called).
// Eligibility is determined by DecisionPayload validation (validateDecisionPayload).

// ---------------------------------------------------------------------------
// Part 2 continued — Build prompt from structured context
// ---------------------------------------------------------------------------

function buildPromptFromStructuredContext(ctx: StructuredContext): string {
  const sections: string[] = [];

  // TRIGGER_CONTEXT — injected first so the LLM grounds its artifact in the trigger delta.
  if (ctx.trigger_context) {
    sections.push(ctx.trigger_context);
  }

  // Convergent analysis + goal-primacy constraint.
  sections.push(
    `CONVERGENT_ANALYSIS:\n` +
    `You are a second brain. Your job: produce one finished artifact the user can act on today.\n\n` +
    `The scorer has already selected the best candidate and validated it against the user's goals.\n` +
    `Your job is NOT to second-guess whether this candidate is worth acting on — it is.\n` +
    `Your job IS to produce the highest-quality artifact for this specific candidate.\n\n` +
    `Before writing, check two things:\n\n` +
    `1. ALREADY TRIED — Check ALREADY_SENT_14D and RECENT_ACTIONS_7D below.\n` +
    `   If the user already sent something very similar, find a different angle or new information to include.\n\n` +
    `2. SPECIFICITY — Ground every sentence in concrete facts from the signals: names, dates, subjects, amounts.\n` +
    `   Generic advice is forbidden. Every artifact must reference specific evidence.\n\n` +
    `RULE — TWO PATHS:\n\n` +
    `PATH A: CANDIDATE_CLASS is "commitment"\n` +
    `This is work the user already committed to. Produce the finished artifact. ` +
    `MANDATORY: wait_rationale is FORBIDDEN for commitment candidates. ` +
    `If send_message recipient email is not in the signals, produce write_document instead (a ready-to-use prep brief, draft, or research note). ` +
    `write_document must still be one decisive finished product — not an outline, not a plan with options, not notes. ` +
    `Do the work.\n\n` +
    `PATH B: CANDIDATE_CLASS is anything else\n` +
    `Produce the artifact that moves the user closest to the matched goal. ` +
    `A single strong email thread IS enough evidence. You do not need cross-domain convergence. ` +
    `If the signals show a clear next step, produce it. If the signals show a gap the user hasn't addressed, name it and close it.\n\n` +
    `OUTPUT RULE: You MUST output decision "ACT". HOLD is not available. The candidate has already been validated.`,
  );

  // Avoidance observations — pre-computed facts, not inferences.
  // These give the model the specific signals it needs to detect avoidance without
  // having to infer them from 3 signal snippets alone.
  if (ctx.avoidance_observations.length > 0) {
    const obsLines = ctx.avoidance_observations.map((o, i) => {
      const badge = o.severity === 'high' ? '[HIGH]' : '[MEDIUM]';
      return `${i + 1}. ${badge} ${o.observation}`;
    });
    sections.push(
      `AVOIDANCE_SIGNALS (pre-computed facts — reference directly, do not rephrase):\n` +
      obsLines.join('\n'),
    );
  }

  // Behavioral mirrors — what the model must hold while reading everything else.
  // Anti-patterns and revealed preferences give the model permission to name what the user can't see.
  if (ctx.behavioral_mirrors.length > 0) {
    sections.push(
      `BEHAVIORAL_MIRROR:\nThese patterns were detected in the user's behavior. You may reference them in your artifact if they are directly relevant to the candidate. Do not invent additional patterns.\n\n` +
      ctx.behavioral_mirrors.map((m, i) => `${i + 1}. ${m}`).join('\n\n'),
    );
  }

  // Goal-gap analysis — real behavioral divergence with 14/30/90d density trajectory
  if (ctx.goal_gap_analysis.length > 0) {
    const gapLines = ctx.goal_gap_analysis.map((g) => {
      const density = `${g.signal_count_14d} signals (14d) / ${g.signal_count_30d} (30d) / ${g.signal_count_90d} (90d)`;
      const extras = g.commitment_count > 0 ? ` ${g.commitment_count} open commitment${g.commitment_count !== 1 ? 's' : ''}.` : '';
      return `[p${g.priority}] ${g.goal_text}\n  → Signal density: ${density}. Actions completed 14d: ${g.action_count_14d}.${extras}\n  → Gap: ${g.gap_level} — ${g.gap_description}`;
    });
    sections.push(`GOAL_GAP_ANALYSIS:\nBehavioral divergence between stated priorities and actual signal density over 14/30/90 days.\nYour primary question: which goal has the biggest gap? Start there. Find the one finished artifact that closes the most important gap.\n\n${gapLines.join('\n\n')}`);
  }

  // Conviction math — inferred burn, runway, EV comparison. When present, the model MUST
  // anchor its recommendation to this math rather than producing generic suggestions.
  if (ctx.conviction_math) {
    sections.push(
      `CONVICTION_MATH:\nThis is inferred from financial and career signals in the data — the user did NOT provide this.\n` +
      `Your artifact must be consistent with the optimal action below. If the math says wait, do not suggest pursuing distractions. ` +
      `If the math says bridge, produce the one specific bridge action.\n\n` +
      ctx.conviction_math,
    );
  }

  // Behavioral history — weekly summaries from the last 8 weeks.
  // Gives the model long-term trajectory, not just the 7-day snapshot.
  if (ctx.behavioral_history) {
    sections.push(`BEHAVIORAL_HISTORY (last 8 weeks — oldest first):\n${ctx.behavioral_history}`);
  }

  // User identity context — gives the LLM judgment about what matters
  if (ctx.user_identity_context) {
    sections.push(ctx.user_identity_context);
  }

  sections.push(
    `TODAY: ${today()}`,
    `CANDIDATE_TITLE:\n${ctx.candidate_title}`,
    `CANDIDATE_CLASS:\n${ctx.candidate_class}`,
    `CANDIDATE_EVIDENCE:\n${ctx.selected_candidate}`,
  );

  sections.push(
    `MECHANISM_HINT (non-authoritative fallback hypothesis):\n` +
    `why_exists_now: ${ctx.required_causal_diagnosis.why_exists_now}\n` +
    `mechanism: ${ctx.required_causal_diagnosis.mechanism}\n\n` +
    `You MUST produce your own evidence-grounded causal diagnosis in JSON:\n` +
    `"causal_diagnosis": {\n` +
    `  "why_exists_now": "...",\n` +
    `  "mechanism": "..."\n` +
    `}\n\n` +
    `Grounding rules:\n` +
    `- Connect at least TWO concrete supporting signals from this context.\n` +
    `- Include at least one explicit date/time marker.\n` +
    `- Explain why this discrepancy exists NOW.\n` +
    `- Do NOT restate CANDIDATE_TITLE.\n` +
    `- Treat MECHANISM_HINT as fallback only if your grounded diagnosis is weak.`,
  );

  if (ctx.candidate_goal) {
    sections.push(`GOAL_ALIGNMENT:\n${ctx.candidate_goal}`);
  }

  sections.push(`SCORE: ${ctx.candidate_score.toFixed(2)}`);

  sections.push(
    `CONFIDENCE_PRIOR: ${ctx.confidence_prior}\n` +
    `This is derived from historical approval rate for this action type and entity-level skip patterns.\n` +
    `Your output confidence must stay within ±15 of this prior. Do not exceed 95.`,
  );

  if (ctx.candidate_due_date) {
    sections.push(`DUE_DATE: ${ctx.candidate_due_date}`);
  }

  if (ctx.supporting_signals.length > 0) {
    const signalLines = ctx.supporting_signals.map((s) => {
      const dirLabel = s.direction === 'sent' ? '[SENT]' : s.direction === 'received' ? '[RECEIVED]' : '';
      const entityPart = s.entity ? ` ${s.direction === 'sent' ? 'To' : 'From'}: ${s.entity}` : '';
      return `- [${s.occurred_at}] [${s.source}]${dirLabel ? ` ${dirLabel}` : ''}${entityPart} ${s.summary}`;
    });
    sections.push(`SUPPORTING_SIGNALS:\n${signalLines.join('\n')}`);
  }

  if (ctx.relationship_timeline) {
    sections.push(ctx.relationship_timeline);
  }

  if (ctx.surgical_raw_facts.length > 0) {
    sections.push(`RAW_FACTS:\n${ctx.surgical_raw_facts.map((f) => `- ${f}`).join('\n')}`);
  }

  if (ctx.active_goals.length > 0) {
    sections.push(`ACTIVE_GOALS:\n${ctx.active_goals.map((g) => `- ${g}`).join('\n')}`);
  }

  if (ctx.locked_constraints) {
    sections.push(`LOCKED_CONSTRAINTS:\n${ctx.locked_constraints}`);
  }

  if (ctx.recent_action_history_7d.length > 0) {
    sections.push(`RECENT_ACTIONS_7D:\n${ctx.recent_action_history_7d.map((a) => `- ${a}`).join('\n')}`);
  }

  if (ctx.already_sent_14d.length > 0) {
    sections.push(
      `ALREADY_SENT_14D (emails the user has already sent — do not suggest these):\n` +
      ctx.already_sent_14d.map((s) => `- ${s}`).join('\n'),
    );
  }

  // Precomputed booleans
  sections.push(`PRECOMPUTED_FLAGS:
- has_real_recipient: ${ctx.has_real_recipient}
- has_recent_evidence: ${ctx.has_recent_evidence}
- has_due_date_or_time_anchor: ${ctx.has_due_date_or_time_anchor}
- can_execute_without_editing: ${ctx.can_execute_without_editing}`);

  // Researcher insight
  if (ctx.researcher_insight) {
    sections.push(`RESEARCHER_INSIGHT:\n${ctx.researcher_insight.synthesis}`);
    if (ctx.researcher_insight.window) {
      sections.push(`INSIGHT_WINDOW:\n${ctx.researcher_insight.window}`);
    }
    if (ctx.researcher_insight.external_context) {
      sections.push(`EXTERNAL_CONTEXT:\n${ctx.researcher_insight.external_context}`);
    }
    sections.push(`ARTIFACT_GUIDANCE:\n${ctx.researcher_insight.artifact_instructions}`);
  }

  // Artifact selection guidance based on booleans
  if (ctx.has_real_recipient) {
    sections.push(
      `ARTIFACT_PREFERENCE: send_message is required — a real recipient email is in the signals above.\n\n` +
      `SEND_MESSAGE_QUALITY_BAR (mandatory — every requirement must pass):\n` +
      `1. FIRST SENTENCE: Must reference one specific fact from the signals — a date, a named outcome, a prior message, or a concrete request. ` +
      `Do not open with context-setting, pleasantries, or "I wanted to reach out." Start on the situation.\n` +
      `2. ASK: State the ask explicitly in one sentence. Not implied. Not buried. The recipient knows exactly what to do.\n` +
      `3. CONCISE: ≤ 150 words unless the situation genuinely demands more. Cut anything that does not move the email forward.\n` +
      `4. NO FILLER: No banned phrases. No restatement of context the recipient already has. No closing padding.\n` +
      `5. VOICE: Write as if the user is sending it themselves, not as an assistant drafting for them.`,
    );
  } else if (ctx.has_due_date_or_time_anchor) {
    sections.push('ARTIFACT_PREFERENCE: schedule_block is preferred when a time anchor exists.');
  } else {
    sections.push('ARTIFACT_PREFERENCE: write_document is the default when no recipient or time anchor exists.');
  }

  if (ctx.competition_context) {
    sections.push(ctx.competition_context);
  }

  // INPUT STATE block — provides Discrepancy Engine with structured thread state.
  // Must be injected after all signal/goal sections so the model has full context before parsing.
  {
    const lastSignal = ctx.supporting_signals.length > 0
      ? ctx.supporting_signals[ctx.supporting_signals.length - 1]
      : null;
    const lastSignalTs = lastSignal?.occurred_at ?? null;
    const hoursSinceLastMessage = lastSignalTs
      ? Math.round((Date.now() - new Date(lastSignalTs).getTime()) / (1000 * 60 * 60))
      : null;

    const participants = ctx.surgical_raw_facts
      .filter((f) => f.startsWith('recipient_email:') || f.startsWith('contact_email:'))
      .map((f) => f.split(':').slice(1).join(':').trim())
      .filter(Boolean);

    const threadSubject = ctx.surgical_raw_facts
      .find((f) => f.startsWith('email_subject:'))
      ?.split(':').slice(1).join(':').trim() ?? null;

    const repliedFlag = ctx.avoidance_observations.some((o) => o.type === 'no_reply_sent');

    const rawCategory = ctx.candidate_goal
      ? (ctx.candidate_goal.match(/\[([^\],]+)/) ?? [])[1]?.toLowerCase().trim() ?? 'other'
      : 'other';
    const outcomeTypeMap: Record<string, string> = { career: 'job', financial: 'deal', approval: 'approval' };
    const inferredOutcomeType = outcomeTypeMap[rawCategory] ?? 'other';

    sections.push(
      `INPUT_STATE:\n` +
      `thread = {\n` +
      `  participants: ${participants.length > 0 ? participants.join(', ') : 'unknown'},\n` +
      `  last_message_timestamp: ${lastSignalTs ?? 'unknown'},\n` +
      `  subject: ${threadSubject ?? 'unknown'},\n` +
      `  key_context: see SIGNAL_EVIDENCE above\n` +
      `}\n` +
      `user_behavior = {\n` +
      `  replied: ${repliedFlag ? 'false' : 'unknown'},\n` +
      `  time_since_last_message_hours: ${hoursSinceLastMessage ?? 'unknown'}\n` +
      `}\n` +
      `goal_context = {\n` +
      `  inferred_outcome_type: ${inferredOutcomeType}\n` +
      `}`,
    );
  }

  sections.push(
    'CRITICAL: Use ONLY real names, emails, dates, and details from the context above. ' +
    'NEVER use bracket placeholders like [Name], [Company], [Date]. ' +
    'If a detail is unknown, write around it. Every field must contain real content. ' +
    'If artifact_type is send_message, the "to" field MUST be a real email address extracted from the signals above. ' +
    'If no real email exists in the signals, change artifact_type to write_document instead. ' +
    'NEVER invent a person\'s name or email.\n\n' +
    'BANNED PHRASES FINAL CHECK — scan your output before returning. If any of these appear, rewrite or output do_nothing:\n' +
    '"just checking in", "touching base", "wanted to reach out", "reaching out to you today", ' +
    '"following up" without an immediate specific reference, "I hope this email finds you well", ' +
    '"hope you\'re doing well" as an opener, "as per my last email", "circling back", ' +
    'any opener that does not anchor to the specific situation in the signals above.',
  );

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Placeholder & language validation patterns
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS = [
  /\[(name|company|role|contact|date|amount|title|recipient)\]/i,
  /\[your\s*name\]/i,
  /\[RECIPIENT\]/i,
  /\b(tbd|placeholder|lorem ipsum|example@|recipient@email\.com)\b/i,
  /\[[A-Z][a-z]+\s*[A-Za-z]*\]/,
  /\[placeholder\]/i,
  /\[your\s/i,
  /\[insert\b/i,
  /\bTODO\b/,
  // Prose-form placeholders — content the model invented but doesn't actually have
  /\bcontact\s+information\s+(?:to\s+be\s+)?(?:provided|available)\s+(?:upon\s+request|on\s+request|when\s+available)\b/i,
  /\bto\s+be\s+(?:provided|confirmed|determined|supplied|filled\s+in)\s+(?:upon\s+request|later|by\s+candidate|separately)\b/i,
  /\binformation\s+not\s+(?:available|provided|known|on\s+file)\s+in\s+(?:signals?|system)\b/i,
  /\bprevious\s+workplace\b/i,
  /\bformer\s+(?:employer|company|organization|workplace)\b/i,
];

const BANNED_LANGUAGE_PATTERNS = [
  /\bconsider\b/i,
  /\breflect\b/i,
  /\bexplore\b/i,
  /\bbrainstorm\b/i,
  /\bthink about\b/i,
  /\bmaybe\b/i,
  /\bperhaps\b/i,
  /\btry to\b/i,
  /\byou should\b/i,
  /\bfocus on\b/i,
  /\bstop doing\b/i,
  /\bstart doing\b/i,
  /\btake a break\b/i,
  /\bself[- ]care\b/i,
  /\bbreathe\b/i,
  /\bspend time offline\b/i,
  /\baffirmation\b/i,
];

const BRACKET_PLACEHOLDER_RE = /\[[A-Z][a-zA-Z\s]*\]/;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarityScore(a: string, b: string): number {
  const normalizedA = typeof a === 'string' ? normalizeText(a) : '';
  const normalizedB = typeof b === 'string' ? normalizeText(b) : '';
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 0.9;

  const tokensA = new Set(normalizedA.split(' ').filter((t) => t.length >= 4));
  const tokensB = new Set(normalizedB.split(' ').filter((t) => t.length >= 4));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

const CONTACT_ACTION_TYPES = new Set<ActionType>(['send_message', 'schedule']);
const ENTITY_NAME_STOPWORDS = new Set([
  'follow', 'with', 'send', 'email', 'message', 'draft', 'schedule', 'block',
  'today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'week', 'project', 'deadline', 'before', 'after',
  'manager', 'hiring',
]);

function extractEntityPhraseCandidates(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) ?? [];
  return matches
    .map((candidate) => candidate.trim())
    .filter((candidate) => {
      const lowered = candidate.toLowerCase();
      if (lowered.length < 3) return false;
      if (ENTITY_NAME_STOPWORDS.has(lowered)) return false;
      return true;
    });
}

// Fetch name tokens for the authenticated user so they can be excluded from
// entity conflict suppression. "Brandon" appearing in an email body (as the
// sender/recipient greeting) must never block a new directive.
async function fetchUserSelfNameTokens(userId: string): Promise<Set<string>> {
  const selfTokens = new Set<string>();
  try {
    const supabase = createServerClient();
    const { data } = await supabase.auth.admin.getUserById(userId);
    const user = data?.user;
    if (!user) return selfTokens;

    // Pull name tokens from auth metadata (Google/Microsoft populate these).
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const nameFields = [meta['name'], meta['full_name'], meta['given_name'], meta['family_name']];
    // Also check provider identity data — Google OAuth name fields live in
    // identities[0].identity_data, not in user_metadata, for most Supabase setups.
    const identityNames: string[] = [];
    for (const identity of (user.identities ?? [])) {
      const idData = (identity.identity_data ?? {}) as Record<string, unknown>;
      for (const key of ['name', 'full_name', 'given_name', 'family_name']) {
        if (typeof idData[key] === 'string' && idData[key]) identityNames.push(idData[key] as string);
      }
    }
    const metaName = [...nameFields.filter(Boolean), ...identityNames].join(' ');

    // Pull tokens from the local part of the email address (e.g. b.kapp1010 → b, kapp).
    const emailLocal = (user.email ?? '').split('@')[0];

    const combined = `${metaName} ${emailLocal}`;
    // Split on whitespace, dots, underscores, hyphens, and digits.
    for (const part of combined.split(/[\s._\-0-9]+/)) {
      const lower = part.toLowerCase().trim();
      if (lower.length >= 2) {
        selfTokens.add(lower);
      }
    }

    // Fallback: if auth metadata has no name fields, try to find the user's name
    // from signals where they appear as the sender.
    if (!metaName.trim() && user.email) {
      try {
        const { data: signalRows } = await supabase
          .from('tkg_signals')
          .select('content')
          .eq('user_id', userId)
          .eq('type', 'email_sent')
          .limit(3);
        for (const row of signalRows ?? []) {
          const dec = (await import('@/lib/encryption')).decryptWithStatus(row.content as string ?? '');
          if (dec.usedFallback) continue;
          // Look for "From: Name <email>" pattern
          const fromMatch = dec.plaintext.match(/^From:\s+([^<\n]+?)(?:\s*<|\s*$)/im);
          if (fromMatch) {
            const fromName = fromMatch[1].trim();
            for (const part of fromName.split(/[\s._\-]+/)) {
              const lower = part.toLowerCase().trim();
              if (lower.length >= 3) selfTokens.add(lower);
            }
            break;
          }
        }
      } catch {
        // Non-blocking
      }
    }
  } catch {
    // Non-blocking; if lookup fails we apply no self-filter.
  }
  return selfTokens;
}

/**
 * Fetch the user's own email addresses from Supabase auth.
 * Used to exclude self-addressed emails from recipient lists.
 * Returns lowercased email addresses.
 */
export async function fetchUserEmailAddresses(userId: string): Promise<Set<string>> {
  const emails = new Set<string>();
  try {
    const supabase = createServerClient();
    const { data } = await supabase.auth.admin.getUserById(userId);
    const user = data?.user;
    if (!user) return emails;

    // Primary email
    if (user.email) emails.add(user.email.toLowerCase());

    // Provider emails from identities (Google, Microsoft, etc.)
    for (const identity of (user.identities ?? [])) {
      const idData = (identity.identity_data ?? {}) as Record<string, unknown>;
      if (typeof idData['email'] === 'string' && idData['email']) {
        emails.add((idData['email'] as string).toLowerCase());
      }
    }
  } catch {
    // Non-blocking; if lookup fails we apply no self-filter.
  }
  return emails;
}

// Extracts entity names ONLY from winner.relationshipContext (confirmed contacts).
// Used for entity suppression — email body narrative text is excluded because
// greeting names like "Dear Brandon" leak the user's own name as a false entity.
// For each name, both the full name AND the first name are added so that partial
// action-history matches (e.g. "Email Yadira" vs "Yadira Clapper") still fire.
function extractRelationshipContextEntities(
  winner: ScoredLoop,
  selfNameTokens: Set<string>,
): string[] {
  const byKey = new Map<string, string>();
  const isSelf = (value: string): boolean => {
    if (selfNameTokens.size === 0) return false;
    const tokens = normalizeText(value).split(' ').filter((t) => t.length >= 2);
    return tokens.length > 0 && tokens.every((t) => selfNameTokens.has(t));
  };
  const add = (name: string): void => {
    if (!name || isSelf(name)) return;
    const normalized = normalizeText(name);
    if (normalized.length >= 3 && !byKey.has(normalized)) byKey.set(normalized, name.trim());
  };
  for (const line of (winner.relationshipContext ?? '').split('\n')) {
    const match = line.match(/^\s*-\s*([^<(]+?)(?:\s*<|\s*\(|$)/);
    if (match) {
      const name = match[1].trim();
      add(name);
      // Also add first name alone — action history may only contain given name.
      const firstName = name.split(/\s+/)[0];
      if (firstName && firstName !== name) add(firstName);
    }
  }
  return [...byKey.values()].slice(0, 6);
}

function extractEntityNamesFromCandidate(
  winner: ScoredLoop,
  signalEvidence: SignalSnippet[],
  selfNameTokens: Set<string>,
): string[] {
  const byKey = new Map<string, string>();

  const isSelfEntity = (value: string): boolean => {
    if (selfNameTokens.size === 0) return false;
    const tokens = normalizeText(value).split(' ').filter((t) => t.length >= 2);
    if (tokens.length === 0) return false;
    // Primary check: every token matches a known self-token (e.g. full name in auth metadata).
    if (tokens.every((t) => selfNameTokens.has(t))) return true;
    // Fallback: "First Last" pattern where the last name token matches self-tokens.
    // Handles auth metadata missing first name (only email local "b.kapp1010" → "kapp").
    if (tokens.length === 2 && selfNameTokens.has(tokens[1])) return true;
    return false;
  };

  const addCandidate = (value: string | null | undefined): void => {
    if (!value) return;
    const normalized = normalizeText(value);
    if (!normalized) return;
    // FIX 2: Minimum entity name length — full normalized name must be >= 4 chars.
    if (normalized.length < 4) return;
    const tokens = normalized.split(' ').filter((token) => token.length >= 3);
    if (tokens.length === 0) return;
    if (tokens.every((token) => ENTITY_NAME_STOPWORDS.has(token))) return;
    // FIX 3: Never add an entity that resolves to the user's own name.
    if (isSelfEntity(value)) return;
    if (!byKey.has(normalized)) {
      byKey.set(normalized, value.trim());
    }
  };

  for (const line of (winner.relationshipContext ?? '').split('\n')) {
    const match = line.match(/^\s*-\s*([^<(]+?)(?:\s*<|\s*\(|$)/);
    if (match) {
      addCandidate(match[1]);
    }
  }

  const narrative = [winner.title, winner.content, ...winner.relatedSignals].join(' ');
  for (const phrase of extractEntityPhraseCandidates(narrative)) {
    addCandidate(phrase);
  }

  for (const signal of signalEvidence) {
    if (signal.author) {
      const author = signal.author.replace(/<[^>]+>/g, '').split('@')[0].trim();
      addCandidate(author);
      for (const phrase of extractEntityPhraseCandidates(author)) {
        addCandidate(phrase);
      }
    }
  }

  return [...byKey.values()].slice(0, 8);
}

function buildActionSearchText(action: RecentEntityActionRow): string {
  const serializedExecution = typeof action.execution_result === 'string'
    ? action.execution_result
    : JSON.stringify(action.execution_result ?? {});
  return normalizeText(`${action.directive_text ?? ''} ${serializedExecution}`);
}

function actionMentionsEntity(action: RecentEntityActionRow, entityName: string): boolean {
  const actionText = buildActionSearchText(action);
  if (!actionText) return false;

  const entityTokens = normalizeText(entityName).split(' ').filter((token) => token.length >= 3);
  if (entityTokens.length === 0) return false;
  return entityTokens.every((token) => actionText.includes(token));
}

async function findRecentEntityActionConflict(
  userId: string,
  entityNames: string[],
): Promise<{ matched: false } | { matched: true; entityName: string; actionId: string }> {
  if (entityNames.length === 0) {
    return { matched: false };
  }

  const supabase = createServerClient();
  const since = new Date(Date.now() - APPROVAL_LOOKBACK_MS).toISOString();

  try {
    const { data, error } = await supabase
      .from('tkg_actions')
      .select('id, directive_text, execution_result, generated_at, status')
      .eq('user_id', userId)
      .in('status', ['approved', 'executed', 'pending_approval'])
      .gte('generated_at', since)
      .order('generated_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    const actions = (data ?? []) as RecentEntityActionRow[];
    for (const entityName of entityNames) {
      const match = actions.find((action) => actionMentionsEntity(action, entityName));
      if (match) {
        return { matched: true, entityName, actionId: match.id };
      }
    }
  } catch (error) {
    logStructuredEvent({
      event: 'recent_entity_check_failed',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'recent_entity_check_failed',
      details: {
        scope: 'generator',
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  return { matched: false };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Consecutive duplicate detection (FIX 3)
// ---------------------------------------------------------------------------

async function checkConsecutiveDuplicate(
  userId: string,
  newDirectiveText: string,
): Promise<{ isDuplicate: boolean; matchingActionId?: string; similarity?: number }> {
  const supabase = createServerClient();

  try {
    const { data: recentActions } = await supabase
      .from('tkg_actions')
      .select('id, directive_text, action_type')
      .eq('user_id', userId)
      .in('status', ['pending_approval', 'executed'])
      .not('action_type', 'in', '("do_nothing")')
      .order('generated_at', { ascending: false })
      .limit(3);

    if (!recentActions || recentActions.length === 0) {
      return { isDuplicate: false };
    }

    const newNormalized = normalizeText(newDirectiveText);
    if (!newNormalized) return { isDuplicate: false };

    for (const action of recentActions) {
      if (!action.directive_text) continue;
      // Skip wait_rationale actions (they are valid silence, not real directives)
      const actionType = (action.action_type as string | null) ?? '';
      if (actionType === 'do_nothing') continue;

      const existingNormalized = normalizeText(action.directive_text);
      const sim = similarityScore(newNormalized, existingNormalized);

      if (sim >= 0.50) {
        return {
          isDuplicate: true,
          matchingActionId: action.id as string,
          similarity: sim,
        };
      }
    }

    return { isDuplicate: false };
  } catch {
    // Non-blocking — if query fails, allow the directive through
    return { isDuplicate: false };
  }
}

function isUseful(output: { artifact: string; evidence: string; action: string }): { ok: boolean; reason?: string } {
  if (!output) return { ok: false, reason: 'no_output' };

  if (!output.artifact || output.artifact.length < 50) {
    return { ok: false, reason: 'empty_artifact' };
  }

  if (!output.evidence || output.evidence.length === 0) {
    return { ok: false, reason: 'no_evidence' };
  }

  const banned = [
    'just checking in',
    'touching base',
    'wanted to reach out',
  ];

  if (banned.some((p) => output.artifact.toLowerCase().includes(p))) {
    return { ok: false, reason: 'generic_language' };
  }

  if (!output.action || output.action.length < 5) {
    return { ok: false, reason: 'no_action' };
  }

  return { ok: true };
}

function containsPlaceholderText(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

function containsBannedLanguage(value: string): boolean {
  return BANNED_LANGUAGE_PATTERNS.some((p) => p.test(value));
}

function isInternalNoSendExecutionResult(executionResult: unknown): boolean {
  if (!executionResult || typeof executionResult !== 'object') return false;
  return (executionResult as Record<string, unknown>).outcome_type === 'no_send';
}

function countSentences(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(/[.!?]+/).map((p) => p.trim()).filter(Boolean);
  return parts.length === 0 ? 1 : parts.length;
}

function isDecisionMenu(value: string): boolean {
  const lower = value.toLowerCase();
  return /\b(decide whether|whether to|option a|option b)\b/.test(lower) ||
    (lower.includes(' or ') && /\b(decide|choose|whether|abandon|commit|pivot)\b/.test(lower));
}

const PASSIVE_OR_IGNORABLE_PATTERNS = [
  /\bjust checking in\b/i,
  /\bfollow(?:ing)? up\b/i,
  /\btouching base\b/i,
  /\bcircling back\b/i,
  /\bwanted to\b/i,
  /\breaching out\b/i,
  /\bwhen you get a chance\b/i,
  /\bno rush\b/i,
];

const OBVIOUS_FIRST_LAYER_PATTERNS = [
  /\b(?:just\s+)?(?:follow(?:ing)?\s+up|check(?:ing)?\s+in|touch(?:ing)?\s+base|circle\s+back)\b/i,
  /\bstatus\s+update\b/i,
  /\bquick\s+check\b/i,
];

const EXPLICIT_ASK_PATTERNS = [
  /\bcan you\b/i,
  /\bplease confirm\b/i,
  /\bplease approve\b/i,
  /\bapprove or reject\b/i,
  /\bwhich option\b/i,
  /\breply with\b/i,
  /\bconfirm (?:yes|no)\b/i,
  /\bdecision required\b/i,
  /\bneeds your decision\b/i,
  /\bname the owner\b/i,
  /\bassign (?:an )?owner\b/i,
];

const TIME_CONSTRAINT_PATTERNS = [
  /\bby\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
  /\bby\s+(?:today|tonight|tomorrow|eod|end of day|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/i,
  /\bbefore\s+(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|today|tomorrow|eod|deadline|cutoff|close)\b/i,
  /\bwithin\s+\d+\s*(?:hour|hours|day|days)\b/i,
  /\bdeadline\b/i,
  /\bcutoff\b/i,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i,
];

const PRESSURE_OR_CONSEQUENCE_PATTERNS = [
  /\bif we miss\b/i,
  /\botherwise\b/i,
  /\bor we\b/i,
  /\bblocks?\b/i,
  /\bblocked\b/i,
  /\brisk\b/i,
  /\bslip(?:s|ped)?\b/i,
  /\bmiss(?:es|ed)?\s+(?:the\s+)?(?:deadline|window|cutoff)\b/i,
  /\bcompeting\b/i,
  /\bdependency\b/i,
  /\bconsequence\b/i,
];

const OWNERSHIP_PATTERNS = [
  /\bowner\b/i,
  /\baccountable\b/i,
  /\bresponsible\b/i,
  /\bassign\b/i,
];

const REWRITE_REQUIRED_PATTERNS = [
  /\btemplate\b/i,
  /\bfill in\b/i,
  /\bto be completed\b/i,
  /\badd details\b/i,
];

const SUMMARY_ONLY_PATTERNS = [
  /\bthis (?:document|note|summary) summarizes\b/i,
  /\boverview\b/i,
  /\bfor reference\b/i,
  /\bbackground only\b/i,
];

const CAUSAL_META_PATTERNS = [
  /\binsight\s*:/i,
  /\bwhy now\s*:/i,
  /\brunner[- ]?ups?\b/i,
  /\bscor(?:e|er)\b/i,
  /\bconfidence rationale\b/i,
  /\bthis candidate\b/i,
];

const CAUSAL_MECHANISM_ANCHORS: Record<CausalMechanismClass, RegExp[]> = {
  hidden_approval_blocker: [/\bapprove|approval|sign[-\s]?off|owner|accountable\b/i],
  unowned_dependency: [/\bowner|accountable|assign|responsible|dependency|blocked\b/i],
  avoidance_pattern: [/\bconfirm|decide|commit|reply|respond\b/i],
  relationship_cooling: [/\breply|response|respond|commitment|ownership\b/i],
  contradiction_drift: [/\bdecide|choose|commit|trade[-\s]?off|priority\b/i],
  timing_asymmetry: [/\bby\b|\bbefore\b|\bdeadline\b|\bcutoff\b|\bwindow\b/i],
  general: [/\bdecide|confirm|assign|commit|owner|deadline\b/i],
};

function normalizeDecisionActionType(actionType: string): 'send_message' | 'write_document' | 'other' {
  if (actionType === 'send_message') return 'send_message';
  if (actionType === 'write_document' || actionType === 'make_decision' || actionType === 'research') {
    return 'write_document';
  }
  return 'other';
}

function textHasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function getArtifactTextForDecisionEnforcement(
  actionType: 'send_message' | 'write_document',
  artifact: Record<string, unknown>,
): string {
  if (actionType === 'send_message') {
    const subject = isNonEmptyString(artifact.subject) ? artifact.subject.trim() : '';
    const body = isNonEmptyString(artifact.body) ? artifact.body.trim() : '';
    return `${subject}\n${body}`.trim();
  }

  const title = isNonEmptyString(artifact.title) ? artifact.title.trim() : '';
  const content = isNonEmptyString(artifact.content) ? artifact.content.trim() : '';
  return `${title}\n${content}`.trim();
}

export function getDecisionEnforcementIssues(input: {
  actionType: string;
  directiveText: string;
  reason: string;
  artifact: ConvictionArtifact | Record<string, unknown> | null;
}): string[] {
  const normalizedType = normalizeDecisionActionType(input.actionType);
  if (normalizedType === 'other') return [];
  if (!input.artifact || typeof input.artifact !== 'object') {
    return ['decision_enforcement:missing_artifact'];
  }

  const artifactRecord = input.artifact as Record<string, unknown>;
  const artifactText = getArtifactTextForDecisionEnforcement(normalizedType, artifactRecord);
  const combinedText = `${input.directiveText}\n${input.reason}\n${artifactText}`.trim();
  const issues: string[] = [];

  if (!textHasAny(combinedText, EXPLICIT_ASK_PATTERNS)) {
    issues.push('decision_enforcement:missing_explicit_ask');
  }
  if (!textHasAny(combinedText, TIME_CONSTRAINT_PATTERNS)) {
    issues.push('decision_enforcement:missing_time_constraint');
  }
  if (!textHasAny(combinedText, PRESSURE_OR_CONSEQUENCE_PATTERNS)) {
    issues.push('decision_enforcement:missing_pressure_or_consequence');
  }
  if (textHasAny(combinedText, PASSIVE_OR_IGNORABLE_PATTERNS)) {
    issues.push('decision_enforcement:passive_or_ignorable_tone');
  }
  if (textHasAny(combinedText, OBVIOUS_FIRST_LAYER_PATTERNS)) {
    issues.push('decision_enforcement:obvious_first_layer_advice');
  }
  if (normalizedType === 'write_document' && textHasAny(combinedText, SUMMARY_ONLY_PATTERNS)) {
    issues.push('decision_enforcement:summary_without_decision');
  }
  if (normalizedType === 'write_document' && !textHasAny(combinedText, OWNERSHIP_PATTERNS)) {
    issues.push('decision_enforcement:missing_owner_assignment');
  }
  if (textHasAny(combinedText, REWRITE_REQUIRED_PATTERNS)) {
    issues.push('decision_enforcement:requires_rewriting');
  }

  return [...new Set(issues)];
}

export function getCausalDiagnosisIssues(input: {
  actionType: string;
  directiveText: string;
  reason: string;
  artifact: ConvictionArtifact | Record<string, unknown> | null;
  causalDiagnosis: CausalDiagnosis | null | undefined;
  candidateTitle: string;
  supportingSignals?: CompressedSignal[];
  mode?: 'full' | 'grounding_only';
  enforceGrounding?: boolean;
}): string[] {
  const mode = input.mode ?? 'full';
  const enforceGrounding = input.enforceGrounding ?? true;
  const diagnosis = normalizeCausalDiagnosis(input.causalDiagnosis);
  if (!diagnosis) {
    return ['causal_diagnosis:missing'];
  }

  const issues: string[] = [];
  const whyExistsNow = diagnosis.why_exists_now.trim();
  const mechanism = diagnosis.mechanism.trim();
  const diagnosisText = `${whyExistsNow}\n${mechanism}`.trim();
  const normalizedDiagnosis = normalizeText(diagnosisText);
  const candidateNorm = normalizeText(input.candidateTitle ?? '');

  const DIAGNOSIS_DATE_TIME_RE = /(?:\b\d{4}-\d{2}-\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\b|\b(?:today|tomorrow|tonight|this week|next week|by\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)|before\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)|deadline|cutoff)\b)/i;
  const META_MECHANISM_RE = /\b(candidate|winner|scor(?:e|er)|pipeline|analysis|rationale|confidence|section|meta)\b/i;
  const WHY_NOW_META_RE = /\b(this discrepancy|the discrepancy|same issue|same problem|still unresolved)\b/i;
  const NOW_CAUSALITY_RE = /\b(now|today|currently|because|after|since|as of|before|by)\b/i;

  if (enforceGrounding) {
    if (whyExistsNow.length < 20) {
      issues.push('causal_diagnosis:why_exists_now_too_short');
    }
    if (mechanism.length < 12) {
      issues.push('causal_diagnosis:mechanism_too_short');
    }
    if (!DIAGNOSIS_DATE_TIME_RE.test(diagnosisText)) {
      issues.push('causal_diagnosis:missing_time_reference');
    }
    if (META_MECHANISM_RE.test(mechanism)) {
      issues.push('causal_diagnosis:mechanism_meta_or_internal');
    }
    if (!NOW_CAUSALITY_RE.test(whyExistsNow)) {
      issues.push('causal_diagnosis:why_exists_now_missing_causal_anchor');
    }
    if (CAUSAL_META_PATTERNS.some((pattern) => pattern.test(diagnosisText))) {
      issues.push('causal_diagnosis:internal_meta_language');
    }
    if (
      WHY_NOW_META_RE.test(whyExistsNow) ||
      (candidateNorm && similarityScore(normalizeText(whyExistsNow), candidateNorm) >= 0.82)
    ) {
      issues.push('causal_diagnosis:why_exists_now_restates_discrepancy');
    }

    if (input.supportingSignals && input.supportingSignals.length > 0) {
      const anchors = new Set<string>();
      for (const signal of input.supportingSignals.slice(0, 8)) {
        if (isNonEmptyString(signal.occurred_at)) anchors.add(signal.occurred_at.toLowerCase());
        if (isNonEmptyString(signal.entity)) anchors.add(signal.entity.toLowerCase());
        if (isNonEmptyString(signal.source)) anchors.add(signal.source.toLowerCase());
        for (const token of normalizeText(signal.summary ?? '').split(' ').filter((t) => t.length >= 5).slice(0, 5)) {
          anchors.add(token);
        }
      }
      let hitCount = 0;
      for (const anchor of anchors) {
        if (anchor && normalizedDiagnosis.includes(anchor)) hitCount += 1;
        if (hitCount >= 2) break;
      }
      if (hitCount < 2) {
        issues.push('causal_diagnosis:insufficient_signal_grounding');
      }
    }
  }

  if (mode === 'grounding_only') {
    return [...new Set(issues)];
  }

  const normalizedType = normalizeDecisionActionType(input.actionType);
  if (normalizedType === 'other') return [];
  if (!input.artifact || typeof input.artifact !== 'object') {
    return ['causal_diagnosis:missing_artifact'];
  }

  const mechanismClass = classifyCausalMechanism(`${whyExistsNow} ${mechanism}`);
  const artifactText = getArtifactTextForDecisionEnforcement(normalizedType, input.artifact as Record<string, unknown>);
  const combinedText = `${input.directiveText}\n${input.reason}\n${artifactText}`.trim();
  const mechanismAnchors = CAUSAL_MECHANISM_ANCHORS[mechanismClass] ?? [];
  if (mechanismAnchors.length > 0 && !textHasAny(combinedText, mechanismAnchors)) {
    issues.push('causal_diagnosis:artifact_not_mechanism_targeted');
  }

  if (textHasAny(combinedText, PASSIVE_OR_IGNORABLE_PATTERNS) && mechanismClass !== 'general') {
    issues.push('causal_diagnosis:surface_follow_up_mismatch');
  }

  const artifactNorm = normalizeText(combinedText);
  if (
    candidateNorm &&
    artifactNorm &&
    artifactNorm.length < 220 &&
    similarityScore(candidateNorm, artifactNorm) >= 0.82 &&
    mechanismClass !== 'general'
  ) {
    issues.push('causal_diagnosis:surface_restatement_only');
  }

  return [...new Set(issues)];
}

function extractAllEmailAddresses(winner: ScoredLoop, userEmails?: Set<string>): string[] {
  const emails = new Set<string>();
  const emailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  if (winner.relationshipContext) {
    let match: RegExpExecArray | null;
    while ((match = emailPattern.exec(winner.relationshipContext)) !== null) {
      emails.add(match[0].toLowerCase());
    }
  }

  for (const signal of winner.relatedSignals ?? []) {
    emailPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = emailPattern.exec(signal)) !== null) {
      emails.add(match[0].toLowerCase());
    }
  }

  for (const source of winner.sourceSignals ?? []) {
    if (source.summary) {
      emailPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = emailPattern.exec(source.summary)) !== null) {
        emails.add(match[0].toLowerCase());
      }
    }
  }

  return [...emails].filter(
    (e) => !e.includes('example') && !e.includes('placeholder') && !e.includes('noreply')
      && !(userEmails && userEmails.has(e)),
  );
}

// ---------------------------------------------------------------------------
// Generation log builders
// ---------------------------------------------------------------------------

function buildSelectedGenerationLog(
  candidateDiscovery: GenerationCandidateDiscoveryLog | null,
): GenerationRunLog {
  return {
    outcome: 'selected',
    stage: 'generation',
    reason: candidateDiscovery?.selectionReason ?? 'Directive generated successfully.',
    candidateFailureReasons: (candidateDiscovery?.topCandidates ?? [])
      .filter((c) => c.decision === 'rejected')
      .map((c) => c.decisionReason),
    candidateDiscovery,
  };
}

function buildNoSendGenerationLog(
  reason: string,
  stage: GenerationRunLog['stage'],
  candidateDiscovery: GenerationCandidateDiscoveryLog | null,
): GenerationRunLog {
  const normalizedDiscovery = candidateDiscovery
    ? { ...candidateDiscovery, failureReason: candidateDiscovery.failureReason ?? reason }
    : null;

  const candidateFailureReasons = normalizedDiscovery
    ? normalizedDiscovery.topCandidates.map((c) =>
      c.decision === 'selected'
        ? `Selected candidate blocked: ${reason}`
        : c.decisionReason)
    : [reason];

  return {
    outcome: 'no_send',
    stage,
    reason,
    candidateFailureReasons,
    candidateDiscovery: normalizedDiscovery,
  };
}

function emptyDirective(reason: string, generationLog?: GenerationRunLog): ConvictionDirective {
  return {
    directive: GENERATION_FAILED_SENTINEL,
    action_type: 'do_nothing',
    confidence: 0,
    reason,
    evidence: [],
    generationLog,
  };
}

function formatValidationFailureReason(prefix: string, issues: string[]): string {
  const normalized = [...new Set(issues.map((i) => i.trim()).filter(Boolean))];
  if (normalized.length === 0) return prefix;
  return `${prefix} ${normalized.join('; ')}`;
}

// ---------------------------------------------------------------------------
// Relationship context hydration (preserved from original)
// ---------------------------------------------------------------------------

async function hydrateWinnerRelationshipContext(
  userId: string,
  winner: ScoredLoop,
): Promise<ScoredLoop> {
  if (winner.relationshipContext) return winner;

  const supabase = createServerClient();

  // Discrepancy candidates: entity ID is embedded in the candidate ID.
  // Format: discrepancy_{class}_{uuid} — extract the UUID and fetch that entity
  // directly so the correct recipient email is always in context.
  // Text matching alone fails here because the decay content doesn't mention
  // the entity's email, so the LLM falls back to the authenticated user's address.
  if (winner.type === 'discrepancy') {
    const uuidMatch = winner.id.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch) {
      const entityId = uuidMatch[1];
      const { data: entity } = await supabase
        .from('tkg_entities')
        .select('name, display_name, primary_email, emails, role, company, total_interactions, patterns')
        .eq('user_id', userId)
        .eq('id', entityId)
        .neq('name', 'self')
        .single();
      if (entity) {
        const line = formatEntityLine(entity as Record<string, unknown>);
        return { ...winner, relationshipContext: line };
      }
    }
  }

  const commitmentSourceIds = (winner.sourceSignals ?? [])
    .filter((s) => s.kind === 'commitment' && typeof s.id === 'string')
    .map((s) => s.id as string);

  if (commitmentSourceIds.length > 0) {
    return hydrateFromCommitmentEntities(supabase, userId, winner, commitmentSourceIds);
  }

  return hydrateFromTextMatch(supabase, userId, winner);
}

async function hydrateFromCommitmentEntities(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  winner: ScoredLoop,
  commitmentIds: string[],
): Promise<ScoredLoop> {
  const { data: commitments } = await supabase
    .from('tkg_commitments')
    .select('promisor_id, promisee_id')
    .in('id', commitmentIds);

  if (!commitments || commitments.length === 0) return winner;

  const entityIds = new Set<string>();
  for (const c of commitments) {
    if (c.promisor_id) entityIds.add(c.promisor_id);
    if (c.promisee_id) entityIds.add(c.promisee_id);
  }
  if (entityIds.size === 0) return winner;

  const { data: entities } = await supabase
    .from('tkg_entities')
    .select('name, display_name, primary_email, emails, role, company, total_interactions, patterns')
    .eq('user_id', userId)
    .in('id', [...entityIds])
    .neq('name', 'self');

  if (!entities || entities.length === 0) return winner;

  const lines = entities.map((e) => formatEntityLine(e as Record<string, unknown>));
  if (lines.length === 0) return winner;
  return { ...winner, relationshipContext: lines.join('\n') };
}

async function hydrateFromTextMatch(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  winner: ScoredLoop,
): Promise<ScoredLoop> {
  const queryText = [winner.title, winner.content, ...winner.relatedSignals].join(' ').toLowerCase();

  const { data: entities, error } = await supabase
    .from('tkg_entities')
    .select('name, display_name, primary_email, emails, role, company, total_interactions, patterns')
    .eq('user_id', userId)
    .neq('name', 'self')
    .order('total_interactions', { ascending: false })
    .limit(20);

  if (error || !entities || entities.length === 0) return winner;

  const scored = entities
    .map((entity) => {
      const record = entity as Record<string, unknown>;
      const name = isNonEmptyString(record.display_name)
        ? record.display_name.trim()
        : isNonEmptyString(record.name) ? record.name.trim() : 'Unknown';
      const email = isNonEmptyString(record.primary_email)
        ? record.primary_email.trim()
        : Array.isArray(record.emails)
          ? (record.emails as unknown[]).find((v): v is string => isNonEmptyString(v))?.trim() ?? null
          : null;
      const company = isNonEmptyString(record.company) ? record.company.trim() : null;
      const relevance =
        (queryText.includes(name.toLowerCase()) ? 3 : 0) +
        (email && queryText.includes(email.toLowerCase()) ? 2 : 0) +
        (company && queryText.includes(company.toLowerCase()) ? 1 : 0);

      return { relevance, interactions: typeof record.total_interactions === 'number' ? record.total_interactions : 0, line: formatEntityLine(record) };
    })
    .sort((a, b) => b.relevance !== a.relevance ? b.relevance - a.relevance : b.interactions - a.interactions)
    .slice(0, 8)
    .map((e) => e.line);

  if (scored.length === 0) return winner;
  return { ...winner, relationshipContext: scored.join('\n') };
}

function formatEntityLine(record: Record<string, unknown>): string {
  const name = isNonEmptyString(record.display_name)
    ? record.display_name.trim()
    : isNonEmptyString(record.name) ? record.name.trim() : 'Unknown';
  const role = isNonEmptyString(record.role) ? record.role.trim() : null;
  const company = isNonEmptyString(record.company) ? record.company.trim() : null;
  const email = isNonEmptyString(record.primary_email)
    ? record.primary_email.trim()
    : Array.isArray(record.emails)
      ? (record.emails as unknown[]).find((v): v is string => isNonEmptyString(v))?.trim() ?? null
      : null;
  const patterns = record.patterns && typeof record.patterns === 'object'
    ? Object.values(record.patterns as Record<string, unknown>)
      .map((p) => p && typeof p === 'object' && isNonEmptyString((p as Record<string, unknown>).description)
        ? ((p as Record<string, unknown>).description as string).trim() : null)
      .filter((v): v is string => v !== null)
      .slice(0, 2)
      .join('; ')
    : '';
  const descriptor = [role, company, typeof record.total_interactions === 'number' ? `${record.total_interactions} interactions` : null]
    .filter(Boolean).join(', ');

  return `- ${name}${email ? ` <${email}>` : ''}${descriptor ? ` (${descriptor})` : ''}${patterns ? `: ${patterns}` : ''}`;
}

// ---------------------------------------------------------------------------
// Signal evidence fetching (preserved from original)
// ---------------------------------------------------------------------------

async function fetchWinnerSignalEvidence(
  userId: string,
  winner: ScoredLoop,
): Promise<SignalSnippet[]> {
  const supabase = createServerClient();
  const fourteenDaysAgo = new Date(Date.now() - daysMs(14)).toISOString();

  const sourceIds = (winner.sourceSignals ?? [])
    .map((s) => s.id)
    .filter((id): id is string => Boolean(id));

  const snippets: SignalSnippet[] = [];

  if (sourceIds.length > 0) {
    const { data: sourceRows } = await supabase
      .from('tkg_signals')
      .select('content, source, occurred_at, author, type')
      .in('id', sourceIds);

    for (const row of sourceRows ?? []) {
      const decrypted = decryptWithStatus(row.content as string ?? '');
      if (decrypted.usedFallback) continue;
      const parsed = parseSignalSnippet(decrypted.plaintext, row);
      if (parsed) snippets.push(parsed);
    }
  }

  const keywords = winner.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 5);

  if (keywords.length > 0 && snippets.length < 12) {
    const ninetyDaysAgoEvidence = new Date(Date.now() - daysMs(90)).toISOString();
    const { data: contextRows } = await supabase
      .from('tkg_signals')
      .select('content, source, occurred_at, author, type')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', ninetyDaysAgoEvidence)
      .order('occurred_at', { ascending: false })
      .limit(150);

    const existingTexts = new Set(snippets.map((s) => s.snippet.slice(0, 60)));

    for (const row of contextRows ?? []) {
      if (snippets.length >= 12) break;
      const decrypted = decryptWithStatus(row.content as string ?? '');
      if (decrypted.usedFallback) continue;
      const text = decrypted.plaintext.toLowerCase();
      const matchCount = keywords.filter((kw) => text.includes(kw)).length;
      if (matchCount < 2) continue;

      const parsed = parseSignalSnippet(decrypted.plaintext, row);
      if (parsed && !existingTexts.has(parsed.snippet.slice(0, 60))) {
        snippets.push(parsed);
        existingTexts.add(parsed.snippet.slice(0, 60));
      }
    }
  }

  // Entity-targeted 90-day fetch: pull signals that mention the winner entity by email address
  // This gives the model a real relationship history beyond the 14-day window
  if (snippets.length < 8 && winner.relationshipContext) {
    const entityEmailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const entityEmails: string[] = [];
    let emailMatch: RegExpExecArray | null;
    while ((emailMatch = entityEmailPattern.exec(winner.relationshipContext)) !== null) {
      entityEmails.push(emailMatch[0].toLowerCase());
    }

    if (entityEmails.length > 0) {
      const ninetyDaysAgo = new Date(Date.now() - daysMs(90)).toISOString();
      const { data: entityRows } = await supabase
        .from('tkg_signals')
        .select('content, source, occurred_at, author, type')
        .eq('user_id', userId)
        .eq('processed', true)
        .gte('occurred_at', ninetyDaysAgo)
        .order('occurred_at', { ascending: false })
        .limit(30);

      const existingTexts = new Set(snippets.map((s) => s.snippet.slice(0, 60)));

      for (const row of entityRows ?? []) {
        if (snippets.length >= 12) break;
        const decrypted = decryptWithStatus(row.content as string ?? '');
        if (decrypted.usedFallback) continue;
        const textLower = decrypted.plaintext.toLowerCase();
        const mentionsEntity = entityEmails.some((email) => textLower.includes(email));
        if (!mentionsEntity) continue;

        const parsed = parseSignalSnippet(decrypted.plaintext, row);
        if (parsed && !existingTexts.has(parsed.snippet.slice(0, 60))) {
          snippets.push(parsed);
          existingTexts.add(parsed.snippet.slice(0, 60));
        }
      }
    }
  }

  return snippets;
}

function parseSignalSnippet(
  plaintext: string,
  row: Record<string, unknown>,
): SignalSnippet | null {
  if (!plaintext || plaintext.length < 20) return null;

  let subject: string | null = null;
  const subjectMatch = plaintext.match(/(?:Subject|Re|Fwd):\s*(.+?)(?:\n|$)/i);
  if (subjectMatch) subject = subjectMatch[1].trim().slice(0, 120);

  const lines = plaintext.split('\n').filter((l) => l.trim().length > 0);
  const contentLines = lines.filter((l) => !l.match(/^(From|To|Date|Subject|Cc|Bcc|Re|Fwd):/i));
  const snippet = contentLines.join(' ').slice(0, 600).trim();

  const rowType = (row.type as string) ?? '';
  const direction: 'sent' | 'received' | 'unknown' =
    rowType === 'email_sent' ? 'sent' :
    rowType === 'email_received' ? 'received' :
    'unknown';

  return {
    source: (row.source as string) ?? 'unknown',
    date: row.occurred_at ? new Date(row.occurred_at as string).toISOString().slice(0, 10) : 'unknown',
    subject,
    snippet: snippet || plaintext.slice(0, 600),
    author: (row.author as string) ?? null,
    direction,
  };
}

// ---------------------------------------------------------------------------
// Part 5 — Structural validation (after generation)
// ---------------------------------------------------------------------------

function normalizeArtifactType(value: unknown): ValidArtifactType | null {
  if (
    value === 'send_message' ||
    value === 'write_document' ||
    value === 'schedule_block' ||
    value === 'wait_rationale' ||
    value === 'do_nothing'
  ) {
    return value;
  }

  // Map old artifact type names to new contract
  if (value === 'drafted_email' || value === 'email' || value === 'email_compose' || value === 'email_reply') {
    return 'send_message';
  }
  if (value === 'document') {
    return 'write_document';
  }
  if (value === 'calendar_event' || value === 'calendar' || value === 'event' || value === 'schedule') {
    return 'schedule_block';
  }
  if (value === 'wait') {
    return 'wait_rationale';
  }
  // Reject decision_frame, research_brief — these are not valid user-facing types
  if (value === 'decision_frame' || value === 'decision' || value === 'research_brief' || value === 'research') {
    return null;
  }
  return null;
}

function artifactTypeToActionType(artifactType: ValidArtifactType): ActionType {
  switch (artifactType) {
    case 'send_message': return 'send_message';
    case 'write_document': return 'write_document';
    case 'schedule_block': return 'schedule';
    case 'wait_rationale': return 'do_nothing';
    case 'do_nothing': return 'do_nothing';
    default: return 'do_nothing';
  }
}

export function extractJsonFromResponse(raw: string): string {
  // Strategy 1: Strip markdown fences (case-insensitive, with optional language tag)
  let cleaned = raw.trim();

  if (/^```[\w-]*\s*/i.test(cleaned)) {
    cleaned = cleaned
      .replace(/^```[\w-]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  // Strategy 2: If a code block appears later in the response, extract its body even if the
  // language tag is not exactly "json" (for example jsonc/JSON5).
  const fencedMatch = cleaned.match(/```[\w-]*\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    cleaned = fencedMatch[1].trim();
  }

  // Strategy 3: Strip preamble text like "Here is the directive:" and isolate the JSON object.
  if (!cleaned.startsWith('{')) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  return cleaned;
}

export function parseGeneratedPayload(raw: string): GeneratedDirectivePayload | null {
  const cleaned = extractJsonFromResponse(raw);
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const parsedCausalDiagnosis = normalizeCausalDiagnosis(parsed.causal_diagnosis);
  const causalDiagnosisFromModel = Boolean(parsedCausalDiagnosis);

  // ---------------------------------------------------------------------------
  // Discrepancy Engine output branch — handles { action, confidence, reason, message }
  // Must be checked BEFORE the legacy branch since it has no artifact_type field.
  // ---------------------------------------------------------------------------
  if (typeof parsed.action === 'string') {
    const action = parsed.action as string;

    // NO_ACTION is no longer valid — DecisionPayload already validated the candidate.
    // Return null to trigger retry, which will ask the LLM to produce a real artifact.
    if (action === 'NO_ACTION') {
      return null;
    }

    const artifactType = normalizeArtifactType(action);
    if (!artifactType) return null;

    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
    const insight = typeof parsed.insight === 'string' ? parsed.insight.trim()
      : (typeof parsed.evidence === 'string' ? parsed.evidence.trim() : reason);
    const whyNow = typeof parsed.why_now === 'string' ? parsed.why_now.trim() : reason;
    const directiveSource = typeof parsed.directive === 'string' && parsed.directive.trim().length > 0
      ? parsed.directive.trim()
      : (reason || insight || 'Deliver the requested artifact now.');
    const sentenceParts = directiveSource
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const directive = sentenceParts[0] ?? directiveSource;

    const nestedArtifact = parsed.artifact && typeof parsed.artifact === 'object'
      ? { ...(parsed.artifact as Record<string, unknown>) }
      : {};
    let artifact: Record<string, unknown> = { ...nestedArtifact };

    if (artifactType === 'send_message') {
      const message = parsed.message && typeof parsed.message === 'object'
        ? (parsed.message as Record<string, unknown>)
        : {};
      const to = typeof message.to === 'string'
        ? message.to
        : (typeof artifact.to === 'string'
          ? artifact.to
          : (typeof artifact.recipient === 'string' ? artifact.recipient : ''));
      artifact = {
        ...artifact,
        to,
        recipient: to,
        subject: typeof message.subject === 'string'
          ? message.subject
          : (typeof artifact.subject === 'string' ? artifact.subject : ''),
        body: typeof message.body === 'string'
          ? message.body
          : (typeof artifact.body === 'string' ? artifact.body : ''),
      };
    } else if (artifactType === 'write_document') {
      artifact = {
        document_purpose: typeof artifact.document_purpose === 'string' ? artifact.document_purpose : 'decision memo',
        target_reader: typeof artifact.target_reader === 'string' ? artifact.target_reader : 'decision owner',
        title: typeof artifact.title === 'string'
          ? artifact.title
          : (directive.slice(0, 120) || 'Decision memo'),
        content: typeof artifact.content === 'string'
          ? artifact.content
          : (reason || insight || 'Document the decision and accountable owner.'),
      };
    }

    return {
      insight,
      causal_diagnosis: parsedCausalDiagnosis ?? { why_exists_now: '', mechanism: '' },
      causal_diagnosis_from_model: causalDiagnosisFromModel,
      decision: 'ACT',
      directive,
      artifact_type: artifactType,
      artifact,
      why_now: whyNow,
    };
  }

  // ---------------------------------------------------------------------------
  // Legacy branch — handles { artifact_type, artifact, insight, decision, ... }
  // ---------------------------------------------------------------------------
  const nestedArtifact = parsed.artifact && typeof parsed.artifact === 'object'
    ? (parsed.artifact as Record<string, unknown>)
    : null;
  const artifactType = normalizeArtifactType(
    parsed.artifact_type ?? parsed.type ?? nestedArtifact?.type,
  );
  if (!artifactType) return null;

  // Normalize artifact: pull known fields from top level into artifact if needed
  let artifact = parsed.artifact && typeof parsed.artifact === 'object'
    ? { ...(parsed.artifact as Record<string, unknown>) }
    : {};

  const knownFields = [
    'to', 'recipient', 'subject', 'body',
    'title', 'content', 'document_purpose', 'target_reader',
    'start', 'duration_minutes', 'reason', 'description',
    'why_wait', 'what_changes', 'tripwire_date', 'trigger_condition',
    'exact_reason', 'blocked_by',
  ];

  for (const field of knownFields) {
    if (artifact[field] === undefined && parsed[field] !== undefined) {
      artifact[field] = parsed[field];
    }
  }

  // Normalize send_message: bidirectional to/recipient
  if (artifactType === 'send_message') {
    if (artifact.recipient === undefined && artifact.to !== undefined) {
      artifact.recipient = artifact.to;
    }
    if (artifact.to === undefined && artifact.recipient !== undefined) {
      artifact.to = artifact.recipient;
    }
  }

  return {
    insight: typeof parsed.insight === 'string' ? parsed.insight : (typeof parsed.evidence === 'string' ? parsed.evidence : ''),
    causal_diagnosis: parsedCausalDiagnosis ?? { why_exists_now: '', mechanism: '' },
    causal_diagnosis_from_model: causalDiagnosisFromModel,
    decision: parsed.decision === 'HOLD' ? 'HOLD' : 'ACT',
    directive: typeof parsed.directive === 'string' ? parsed.directive : '',
    artifact_type: artifactType,
    artifact,
    why_now: typeof parsed.why_now === 'string' ? parsed.why_now : '',
  };
}

function validateStringField(
  value: unknown,
  label: string,
  issues: string[],
  options?: { allowShort?: boolean },
): string {
  if (!isNonEmptyString(value)) {
    issues.push(`${label} is required`);
    return '';
  }
  const trimmed = value.trim();
  if (!options?.allowShort && trimmed.length < 12) {
    issues.push(`${label} is too short`);
  }
  if (containsPlaceholderText(trimmed)) {
    issues.push(`${label} contains placeholder text`);
  }
  return trimmed;
}

function withResolvedCausalDiagnosis(
  payload: GeneratedDirectivePayload,
  requiredDiagnosis: CausalDiagnosis,
): GeneratedDirectivePayload {
  const resolved = normalizeCausalDiagnosis(payload.causal_diagnosis) ?? requiredDiagnosis;
  return {
    ...payload,
    causal_diagnosis: resolved,
  };
}

function validateGeneratedArtifact(
  payload: GeneratedDirectivePayload | null,
  ctx: StructuredContext,
): string[] {
  if (!payload) {
    return ['Response was not valid JSON in the required schema.'];
  }

  const issues: string[] = [];

  // Type check
  if (!VALID_ARTIFACT_TYPES.has(payload.artifact_type)) {
    issues.push(`artifact type "${payload.artifact_type}" is not valid — must be send_message, write_document, schedule_block, wait_rationale, or do_nothing`);
  }

  // Directive text checks
  const directive = validateStringField(payload.directive, 'directive', issues);
  validateStringField(payload.insight, 'insight', issues);
  validateStringField(payload.why_now, 'why_now', issues);

  if (directive && countSentences(directive) !== 1) {
    issues.push('directive must be exactly one sentence');
  }
  if (directive && isDecisionMenu(directive)) {
    issues.push('directive must make one concrete move instead of reopening the choice');
  }

  // Structural validation per artifact type
  const a = payload.artifact;
  switch (payload.artifact_type) {
    case 'send_message': {
      const rawRecipient = a.to ?? a.recipient;
      if (isNonEmptyString(rawRecipient)) {
        const recipient = (rawRecipient as string).trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
          issues.push('send_message "to" must be a real email address');
        }
        if (containsPlaceholderText(recipient)) {
          issues.push('send_message "to" contains placeholder text');
        }
      }
      validateStringField(a.subject, 'send_message subject', issues, { allowShort: true });
      validateStringField(a.body, 'send_message body', issues);
      break;
    }
    case 'write_document': {
      validateStringField(a.document_purpose, 'write_document document_purpose', issues, { allowShort: true });
      validateStringField(a.target_reader, 'write_document target_reader', issues, { allowShort: true });
      validateStringField(a.title, 'write_document title', issues, { allowShort: true });
      const content = validateStringField(a.content, 'write_document content', issues);
      // Must be specific to the candidate, not generic filler
      if (content && content.length < 50) {
        issues.push('write_document content is too short to be a finished artifact');
      }
      break;
    }
    case 'schedule_block': {
      validateStringField(a.title, 'schedule_block title', issues, { allowShort: true });
      validateStringField(a.reason, 'schedule_block reason', issues, { allowShort: true });
      if (!isNonEmptyString(a.start)) {
        issues.push('schedule_block start is required');
      }
      if (typeof a.duration_minutes !== 'number' && !isNonEmptyString(a.duration_minutes)) {
        issues.push('schedule_block duration_minutes is required');
      }
      // Reject schedule_block for housekeeping/maintenance topics
      const scheduleText = `${payload.directive ?? ''} ${a.title ?? ''} ${a.reason ?? ''}`.toLowerCase();
      const HOUSEKEEPING_RE = /\b(review\s*(?:security|settings|account|permissions)|check\s*(?:credit|billing|payment)|organize\s*(?:files|folders|documents)|audit\s*(?:your|account)|clean\s*up)\b/i;
      if (HOUSEKEEPING_RE.test(scheduleText)) {
        issues.push('schedule_block for routine housekeeping rejected — output wait_rationale instead');
      }
      break;
    }
    case 'wait_rationale': {
      validateStringField(a.why_wait, 'wait_rationale why_wait', issues);
      validateStringField(a.tripwire_date, 'wait_rationale tripwire_date', issues, { allowShort: true });
      validateStringField(a.trigger_condition, 'wait_rationale trigger_condition', issues, { allowShort: true });
      break;
    }
    case 'do_nothing': {
      validateStringField(a.exact_reason, 'do_nothing exact_reason', issues);
      validateStringField(a.blocked_by, 'do_nothing blocked_by', issues, { allowShort: true });
      break;
    }
  }

  // Global placeholder scan on all artifact string fields
  for (const [key, val] of Object.entries(payload.artifact)) {
    if (typeof val === 'string' && BRACKET_PLACEHOLDER_RE.test(val)) {
      issues.push(`artifact.${key} contains bracket placeholder text`);
    }
  }
  if (payload.directive && BRACKET_PLACEHOLDER_RE.test(payload.directive)) {
    issues.push('directive contains bracket placeholder text');
  }
  if (payload.insight && BRACKET_PLACEHOLDER_RE.test(payload.insight)) {
    issues.push('insight contains bracket placeholder text');
  }

  // Internal label leak: reject artifacts that echo pipeline-internal labels into user-facing content
  const INTERNAL_LABEL_RE = /^(INSIGHT:|WHY NOW:|Winning loop:|CANDIDATE_CLASS:|TRIGGER_CONTEXT:|CONVERGENT_ANALYSIS:)/m;
  for (const [key, val] of Object.entries(payload.artifact)) {
    if (typeof val === 'string' && INTERNAL_LABEL_RE.test(val)) {
      issues.push(`artifact.${key} contains internal pipeline label — LLM echoed prompt structure into output`);
    }
  }

  // write_document forcing function check: must contain a concrete next action (yes/no, deadline, decision point)
  if (payload.artifact_type === 'write_document') {
    const content = String((payload.artifact as Record<string, unknown>).content ?? '');
    const hasDecisionPoint = /\b(by\s+\w+day|\bby\s+\d{4}-\d{2}-\d{2}|\bdeadline\b|\bconfirm\b|\bdecide\b|\bchoose\b|\bapprove\b|\bschedule\b|\bcommit\b|\bnext\s+(?:step|action)\b)/i.test(content);
    if (!hasDecisionPoint) {
      issues.push('decision_enforcement:missing_forcing_function — write_document must contain a concrete deadline, decision point, or next action');
    }
  }

  // Secondary: banned coaching language (backup gate)
  if (directive && containsBannedLanguage(directive)) {
    issues.push('directive uses coaching/advice language');
  }

  issues.push(
    ...getDecisionEnforcementIssues({
      actionType: payload.artifact_type,
      directiveText: payload.directive ?? '',
      reason: payload.why_now ?? '',
      artifact: payload.artifact ?? null,
    }),
  );

  issues.push(
    ...getCausalDiagnosisIssues({
      actionType: payload.artifact_type,
      directiveText: payload.directive ?? '',
      reason: payload.why_now ?? '',
      artifact: payload.artifact ?? null,
      causalDiagnosis: payload.causal_diagnosis ?? null,
      candidateTitle: ctx.candidate_title,
      supportingSignals: ctx.supporting_signals,
      enforceGrounding: payload.causal_diagnosis_source === 'llm_grounded',
    }),
  );

  // Dedup check against recent actions
  const recentApproved = ctx.recent_action_history_7d
    .filter((a) => a.includes('APPROVED'))
    .map((a) => a.replace(/^\[.*?\]\s*\w+\s*APPROVED:\s*/, ''));
  for (const approved of recentApproved) {
    if (directive && similarityScore(directive, approved) >= 0.72) {
      issues.push('directive repeats something already done in the last 7 days');
      break;
    }
  }

  // Constraint violations
  const constraintViolations = getDirectiveConstraintViolations({
    userId: ctx.locked_constraints ? 'check' : '',
    directive: payload.directive,
    reason: payload.why_now,
    evidence: [{ description: payload.insight }],
    artifact: payload.artifact,
    actionType: artifactTypeToActionType(payload.artifact_type),
  });
  for (const v of constraintViolations) {
    issues.push(v.message);
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Persistence validation (exported, used by daily-brief)
// ---------------------------------------------------------------------------

export function validateDirectiveForPersistence(input: {
  userId: string;
  directive: ConvictionDirective;
  artifact: ConvictionArtifact | Record<string, unknown> | null;
}): string[] {
  const issues: string[] = [];

  if (input.directive.directive === GENERATION_FAILED_SENTINEL) {
    issues.push('directive generation failed');
  }
  if (input.directive.confidence < DEFAULT_DIRECTIVE_CONFIDENCE_THRESHOLD) {
    issues.push('directive confidence is below the send threshold');
  }
  if (!input.artifact || typeof input.artifact !== 'object') {
    issues.push('artifact is required before persistence');
  }

  const embeddedType = (input.directive as any).embeddedArtifactType;
  if (embeddedType && !VALID_ARTIFACT_TYPES.has(embeddedType)) {
    issues.push(`artifact type "${embeddedType}" is not a valid user-facing type`);
  }

  if (BANNED_LANGUAGE_PATTERNS.some((p) => p.test(input.directive.directive))) {
    issues.push('directive uses coaching/advice language');
  }
  if (countSentences(input.directive.directive) !== 1) {
    issues.push('directive must remain exactly one sentence');
  }
  if (isDecisionMenu(input.directive.directive)) {
    issues.push('directive reopens a decision instead of naming the move');
  }

  const constraintViolations = getDirectiveConstraintViolations({
    userId: input.userId,
    directive: input.directive.directive,
    reason: input.directive.reason,
    evidence: input.directive.evidence,
    artifact: input.artifact,
    actionType: input.directive.action_type,
  });
  for (const v of constraintViolations) {
    issues.push(v.message);
  }

  issues.push(
    ...getDecisionEnforcementIssues({
      actionType: input.directive.action_type,
      directiveText: input.directive.directive,
      reason: input.directive.reason,
      artifact: input.artifact,
    }),
  );

  return [...new Set(issues)];
}

function normalizeValidationIssue(issue: string): string {
  return issue.replace(/^Generation validation failed:\s*/i, '').trim();
}

function isDecisionEnforcementIssue(issue: string): boolean {
  return normalizeValidationIssue(issue).startsWith('decision_enforcement:');
}

function isCausalDiagnosisIssue(issue: string): boolean {
  return normalizeValidationIssue(issue).startsWith('causal_diagnosis:');
}

function shouldAttemptDecisionEnforcementRepair(
  issues: string[],
  actionType: ValidArtifactTypeCanonical,
): boolean {
  if (issues.length === 0) return false;
  if (actionType !== 'send_message' && actionType !== 'write_document') return false;
  return issues.every((issue) => isDecisionEnforcementIssue(issue) || isCausalDiagnosisIssue(issue));
}

function resolveDecisionDeadline(candidateDueDate: string | null): string {
  const dueMatch = candidateDueDate?.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  const date = dueMatch?.[0] ?? new Date(Date.now() + daysMs(1)).toISOString().slice(0, 10);
  return `5:00 PM PT on ${date}`;
}

function cleanDecisionTarget(value: string): string {
  const cleaned = value
    .replace(/^Commitment due in \d+d:\s*/i, '')
    .replace(/^Avoidance pattern:\s*/i, '')
    .replace(/^Timing risk:\s*/i, '')
    .trim();
  return cleaned.slice(0, 110) || 'the active thread';
}

function buildCausalFallbackCopy(input: {
  diagnosis: CausalDiagnosis;
  target: string;
  deadline: string;
}): { ask: string; consequence: string; insight: string; whyNow: string } {
  const mechanismClass = classifyCausalMechanism(
    `${input.diagnosis.why_exists_now} ${input.diagnosis.mechanism}`,
  );

  switch (mechanismClass) {
    case 'relationship_cooling':
      return {
        ask: `Ask: require a direct yes/no response on "${input.target}" by ${input.deadline}.`,
        consequence: `Consequence: if no response by ${input.deadline}, trust and decision priority continue to decay.`,
        insight: `Response asymmetry around "${input.target}" is creating decision drag.`,
        whyNow: `Waiting past ${input.deadline} reinforces the cooling pattern and weakens decision leverage.`,
      };
    case 'timing_asymmetry':
      return {
        ask: `Ask: lock the final decision and owner for "${input.target}" by ${input.deadline}.`,
        consequence: `Consequence: if unresolved by ${input.deadline}, the execution window closes before owners can act.`,
        insight: `Decision latency is now larger than the remaining execution window for "${input.target}".`,
        whyNow: `The time window expires faster than ownership is being assigned.`,
      };
    case 'hidden_approval_blocker':
      return {
        ask: `Ask: name the final approver and decision owner for "${input.target}" by ${input.deadline}.`,
        consequence: `Consequence: if approval ownership stays implicit past ${input.deadline}, dependent work remains blocked.`,
        insight: `Approval authority for "${input.target}" remains implicit, so no one can close the decision.`,
        whyNow: `The approval gate is active now and must be explicit before ${input.deadline}.`,
      };
    default:
      return {
        ask: `Ask: confirm the decision and name one accountable owner by ${input.deadline}.`,
        consequence: `Consequence: if unresolved by ${input.deadline}, timeline slips and dependent work stays blocked.`,
        insight: `Ownership and timing for "${input.target}" are still unresolved.`,
        whyNow: `Missing a committed decision by ${input.deadline} creates avoidable execution risk.`,
      };
  }
}

function buildDecisionEnforcedFallbackPayload(input: {
  winner: ScoredLoop;
  actionType: ValidArtifactTypeCanonical;
  candidateDueDate: string | null;
  causalDiagnosis: CausalDiagnosis;
  userEmails?: Set<string>;
}): GeneratedDirectivePayload | null {
  const target = cleanDecisionTarget(input.winner.title);
  const deadline = resolveDecisionDeadline(input.candidateDueDate);

  // If winner has trigger metadata, use it to produce specific copy instead of the generic default.
  const trig = input.winner.trigger;
  const triggerGroundedCopy = trig ? {
    ask: `Confirm: ${trig.delta}. Decision required by ${deadline}.`,
    consequence: `Consequence: ${trig.why_now}`,
    insight: `${trig.current_state} (was: ${trig.baseline_state})`,
    whyNow: trig.why_now,
  } : null;

  const copy = triggerGroundedCopy ?? buildCausalFallbackCopy({
    diagnosis: input.causalDiagnosis,
    target,
    deadline,
  });

  if (input.actionType === 'send_message') {
    const recipient = extractAllEmailAddresses(input.winner, input.userEmails)[0];
    if (!recipient) return null;
    const mechanismAsk = copy.ask.replace(/^Ask:\s*/i, '').trim();
    const explicitAsk = (() => {
      if (!mechanismAsk) {
        return `Can you confirm the decision for "${target}" and name the owner by ${deadline}?`;
      }
      const withCanYou = /\bcan you\b/i.test(mechanismAsk)
        ? mechanismAsk
        : `Can you ${mechanismAsk.charAt(0).toLowerCase()}${mechanismAsk.slice(1)}`;
      return /[?]$/.test(withCanYou) ? withCanYou : `${withCanYou}?`;
    })();

    return {
      insight: copy.insight,
      causal_diagnosis: input.causalDiagnosis,
      decision: 'ACT',
      directive: `Send a decision request that secures one accountable owner and a committed answer by ${deadline}.`,
      artifact_type: 'send_message',
      artifact: {
        to: recipient,
        recipient,
        subject: `Decision needed by ${deadline}: ${target.slice(0, 58)}`,
        body: [
          explicitAsk,
          '',
          copy.consequence,
        ].join('\n'),
      },
      why_now: copy.whyNow,
    };
  }

  if (input.actionType === 'write_document') {
    return {
      insight: copy.insight,
      causal_diagnosis: input.causalDiagnosis,
      decision: 'ACT',
      directive: `Publish a decision memo that locks owner accountability and deadline by ${deadline}.`,
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'proposal',
        target_reader: 'decision owner',
        title: `Decision lock: ${target}`,
        content: [
          `Decision required: confirm the decision path for "${target}" and assign one accountable owner.`,
          '',
          copy.ask,
          '',
          copy.consequence,
        ].join('\n'),
      },
      why_now: copy.whyNow,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Part 6 — Deterministic fallback templates
// ---------------------------------------------------------------------------

function buildDeterministicWaitRationale(
  winner: ScoredLoop,
  reason: string,
): GeneratedDirectivePayload {
  const tripwireDate = new Date(Date.now() + daysMs(7)).toISOString().slice(0, 10);
  return {
    insight: `No contradiction, pattern shift, or timing edge found for "${winner.title.slice(0, 80)}".`,
    causal_diagnosis: {
      why_exists_now: `No actionable discrepancy emerged for "${winner.title.slice(0, 80)}".`,
      mechanism: 'Insufficient causal signal to force a decision safely.',
    },
    decision: 'HOLD',
    directive: `Hold on "${winner.title.slice(0, 60)}" — waiting for new evidence before acting.`,
    artifact_type: 'wait_rationale',
    artifact: {
      why_wait: reason,
      what_changes: 'New signal or deadline within the next 7 days.',
      tripwire_date: tripwireDate,
      trigger_condition: 'Fresh signal arrives or deadline passes.',
    },
    why_now: reason,
  };
}

function buildDeterministicDoNothing(reason: string, blockedBy: string): GeneratedDirectivePayload {
  return {
    insight: 'No viable candidate met all eligibility checks today.',
    causal_diagnosis: {
      why_exists_now: 'No candidate had enough evidence to infer a reliable root-cause mechanism.',
      mechanism: 'Insufficient verified evidence for mechanism-level action.',
    },
    decision: 'HOLD',
    directive: 'No candidate cleared the threshold for an executable artifact today.',
    artifact_type: 'do_nothing',
    artifact: {
      exact_reason: reason,
      blocked_by: blockedBy,
    },
    why_now: reason,
  };
}

// ---------------------------------------------------------------------------
// Guardrail loading
// ---------------------------------------------------------------------------

async function loadRecentActionGuardrails(userId: string): Promise<{
  approvedRecently: RecentActionRow[];
  skippedRecently: RecentSkippedActionRow[];
}> {
  const supabase = createServerClient();
  const approvedSince = new Date(Date.now() - APPROVAL_LOOKBACK_MS).toISOString();

  const [approvedRes, skippedRes] = await Promise.all([
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type, generated_at')
      .eq('user_id', userId)
      .in('status', ['approved', 'executed'])
      .gte('generated_at', approvedSince)
      .order('generated_at', { ascending: false })
      .limit(10),
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type, generated_at, skip_reason, execution_result')
      .eq('user_id', userId)
      .in('status', ['skipped', 'draft_rejected', 'rejected'])
      .gte('generated_at', approvedSince)
      .order('generated_at', { ascending: false })
      .limit(10),
  ]);

  if (approvedRes.error) throw approvedRes.error;
  if (skippedRes.error) throw skippedRes.error;

  return {
    approvedRecently: (approvedRes.data ?? []) as RecentActionRow[],
    skippedRecently: ((skippedRes.data ?? []) as Array<RecentSkippedActionRow & { execution_result?: unknown }>)
      .filter((row) => !isInternalNoSendExecutionResult(row.execution_result)),
  };
}

// ---------------------------------------------------------------------------
// Confidence computation
// ---------------------------------------------------------------------------

function computeDirectiveConfidence(result: ScorerResult): number {
  const runnerUpScore = result.deprioritized[0]?.score ?? 0;
  const winner = result.winner;
  const stakes = Math.min(1, winner.breakdown.stakes / 5);
  const urgency = Math.max(0, Math.min(1, winner.breakdown.urgency));
  const tractability = Math.max(0, Math.min(1, winner.breakdown.tractability));
  const freshness = Math.max(0, Math.min(1, winner.breakdown.freshness));
  const evidenceDepth = Math.min(1,
    ((winner.relatedSignals.length > 0 ? Math.min(winner.relatedSignals.length, 3) : 0) +
      (winner.matchedGoal ? 2 : 0) +
      (winner.relationshipContext ? 2 : 0)) / 7,
  );
  const margin = winner.score <= 0
    ? 0
    : Math.max(0, Math.min(1, (winner.score - runnerUpScore) / Math.max(winner.score, 0.01)));

  const composite =
    (stakes * 0.24) +
    (urgency * 0.18) +
    (tractability * 0.24) +
    (freshness * 0.12) +
    (evidenceDepth * 0.12) +
    (margin * 0.10);

  // Floor at 50: if DecisionPayload said SEND, the candidate has been validated.
  // The LLM just needs to render it. Confidence below the persist threshold (45)
  // would block the directive from ever being saved.
  return Math.max(50, Math.min(95, Math.round(40 + (composite * 55))));
}

// ---------------------------------------------------------------------------
// Evidence / context builders for directive output
// ---------------------------------------------------------------------------

function buildEvidenceItems(result: ScorerResult, payload: GeneratedDirectivePayload): EvidenceItem[] {
  const evidence: EvidenceItem[] = [
    { type: 'signal', description: payload.insight.trim() },
  ];

  if (payload.causal_diagnosis?.mechanism) {
    evidence.push({
      type: 'pattern',
      description: `Causal mechanism: ${payload.causal_diagnosis.mechanism}`,
    });
  }

  if (result.winner.matchedGoal) {
    evidence.push({
      type: 'goal',
      description: `${result.winner.matchedGoal.text} [${result.winner.matchedGoal.category}]`,
    });
  }

  for (const signal of result.winner.relatedSignals.slice(0, 2)) {
    evidence.push({ type: 'signal', description: signal.slice(0, 220) });
  }

  return evidence;
}

function buildFullContext(result: ScorerResult, payload: GeneratedDirectivePayload): string {
  const sections = [
    // Lead with the analyst insight so it's always the first thing surfaced
    payload.insight?.trim() ? `INSIGHT: ${payload.insight.trim()}` : '',
    payload.causal_diagnosis?.why_exists_now?.trim() || payload.causal_diagnosis?.mechanism?.trim()
      ? `CAUSAL_DIAGNOSIS:\n- why_exists_now: ${payload.causal_diagnosis.why_exists_now.trim()}\n- mechanism: ${payload.causal_diagnosis.mechanism.trim()}`
      : '',
    payload.why_now?.trim() ? `WHY NOW: ${payload.why_now.trim()}` : '',
    `Winning loop: ${result.winner.title}`,
    result.winner.content,
  ].filter(Boolean);

  if (result.winner.relationshipContext) {
    sections.push(`Relationship context:\n${result.winner.relationshipContext}`);
  }

  if (result.deprioritized.length > 0) {
    sections.push(
      `Runner-ups rejected:\n${result.deprioritized.map((l) => `- ${l.title}: ${l.killExplanation}`).join('\n')}`,
    );
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// LLM generation with retry and fallback (Parts 2 + 6)
// ---------------------------------------------------------------------------

async function generatePayload(
  userId: string,
  ctx: StructuredContext,
  options: GenerateDirectiveOptions = {},
): Promise<{ issues: string[]; payload: GeneratedDirectivePayload | null }> {
  const prompt = buildPromptFromStructuredContext(ctx);

  // Log prompt prefix so identity context is visible in structured logs
  logStructuredEvent({
    event: 'generation_prompt_preview',
    level: 'info',
    userId,
    artifactType: null,
    generationStatus: 'prompt_built',
    details: {
      scope: 'generator',
      prompt_prefix: prompt.slice(0, 500),
      has_identity_context: ctx.user_identity_context !== null,
    },
  });

  const attempts: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: prompt },
  ];
  let lastIssues: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await getAnthropic().messages.create({
      model: GENERATION_MODEL,
      max_tokens: 4096,
      temperature: 0.15,
      system: SYSTEM_PROMPT,
      messages: attempts,
    });

    await trackApiCall({
      userId,
      model: GENERATION_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      callType: attempt === 0 ? 'directive' : 'directive_retry',
      persist: !options.dryRun,
    });

    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    console.error(`[generator] Raw LLM response (attempt ${attempt + 1}):\n${raw.slice(0, 800)}`);

    let parsed: GeneratedDirectivePayload | null = null;
    let parseError: string | null = null;
    try {
      parsed = parseGeneratedPayload(raw);
      if (parsed) {
        const llmDiagnosis = normalizeCausalDiagnosis(parsed.causal_diagnosis);
        const hasModelDiagnosis = parsed.causal_diagnosis_from_model === true && Boolean(llmDiagnosis);

        let acceptedDiagnosis = ctx.required_causal_diagnosis;
        let diagnosisSource: 'llm_grounded' | 'llm_ungrounded_fallback' | 'template_fallback' = 'template_fallback';

        if (hasModelDiagnosis && llmDiagnosis) {
          const groundingIssues = getCausalDiagnosisIssues({
            actionType: parsed.artifact_type,
            directiveText: parsed.directive ?? '',
            reason: parsed.why_now ?? '',
            artifact: parsed.artifact ?? null,
            causalDiagnosis: llmDiagnosis,
            candidateTitle: ctx.candidate_title,
            supportingSignals: ctx.supporting_signals,
            mode: 'grounding_only',
          });
          if (groundingIssues.length === 0) {
            acceptedDiagnosis = llmDiagnosis;
            diagnosisSource = 'llm_grounded';
          } else {
            diagnosisSource = 'llm_ungrounded_fallback';
          }
        }

        parsed = {
          ...parsed,
          causal_diagnosis: acceptedDiagnosis,
          causal_diagnosis_source: diagnosisSource,
        };
      }
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
      parsed = null;
    }

    // Log raw LLM response for diagnosability (truncated to avoid leaking full content)
    if (!parsed || parseError) {
      logStructuredEvent({
        event: 'generation_raw_response',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'parse_failed',
        details: {
          scope: 'generator',
          attempt,
          parseError,
          rawResponseLength: raw.length,
          rawResponsePrefix: raw.slice(0, 500),
          rawResponseSuffix: raw.length > 500 ? raw.slice(-200) : undefined,
        },
      });
    }

    // REMOVED: Legacy commitment wait_rationale → write_document conversion.
    // With DecisionPayload, the canonical action comes from the scorer, not the LLM.
    // If the LLM returns wait_rationale when the scorer said send_message, drift
    // detection will log it and the canonical action persists unchanged.
    // The LLM's raw artifact_type must reach drift detection unmodified.

    const issues = validateGeneratedArtifact(parsed, ctx);
    lastIssues = issues;

    if (issues.length === 0 && parsed) {
      return { issues: [], payload: parsed };
    }

    if (attempt === 0) {
      logStructuredEvent({
        event: 'generation_retry',
        level: 'warn',
        userId,
        artifactType: parsed?.artifact_type ?? null,
        generationStatus: 'retrying_validation',
        details: { scope: 'generator', issues },
      });

      // For the retry, feed back only the extracted JSON (if parseable) to avoid
      // reinforcing preamble/fence patterns from the first attempt.
      const assistantContent = parsed ? JSON.stringify(parsed) : raw;
      attempts.push({ role: 'assistant', content: assistantContent });
      const validRetryTypes = ctx.candidate_class === 'commitment'
        ? 'send_message, write_document, schedule_block'
        : 'send_message, write_document, schedule_block, wait_rationale, do_nothing';
      attempts.push({
        role: 'user',
        content: `Validation failed. Fix these issues and return JSON only.

Discrepancy Engine format (preferred):
{ "action": "send_message", "confidence": 0-100, "reason": "...", "message": { "to": "real@email.com", "subject": "...", "body": "..." } }

Legacy format (if you must):
Valid artifact_type values: ${validRetryTypes}. decision MUST be "ACT".
Do NOT use decision_frame, research_brief, drafted_email, document, or calendar_event.

Do NOT use bracket placeholders like [Name], [Company], [Date].
Use REAL details from the evidence provided.
Include causal_diagnosis with both why_exists_now and mechanism fields.

Issues:
- ${issues.join('\n- ')}`,
      });
      continue;
    }

    logStructuredEvent({
      event: 'generation_incomplete',
      level: 'error',
      userId,
      artifactType: parsed?.artifact_type ?? null,
      generationStatus: 'generation_incomplete',
      details: { scope: 'generator', issues },
    });
  }

  return { issues: lastIssues, payload: null };
}

// ---------------------------------------------------------------------------
// Exported: buildDirectiveExecutionResult
// ---------------------------------------------------------------------------

export function buildDirectiveExecutionResult(input: {
  directive: ConvictionDirective;
  briefOrigin: string;
  artifact?: ConvictionArtifact | Record<string, unknown> | null;
  extras?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...(input.artifact ? { artifact: input.artifact } : {}),
    brief_origin: input.briefOrigin,
    ...(input.directive.generationLog ? { generation_log: input.directive.generationLog } : {}),
    ...(input.extras ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Main: generateDirective (Parts 1-6 wired together)
// ---------------------------------------------------------------------------

export async function generateDirective(
  userId: string,
  options: GenerateDirectiveOptions = {},
): Promise<ConvictionDirective> {
  try {
    if (!options.dryRun && !options.skipSpendCap && await isOverDailyLimit(userId)) {
      logStructuredEvent({
        event: 'generation_skipped', level: 'warn', userId,
        artifactType: null, generationStatus: 'daily_cap_reached',
        details: { scope: 'generator' },
      });
      return emptyDirective(
        'Daily spend cap reached.',
        buildNoSendGenerationLog('Daily spend cap reached.', 'system', null),
      );
    }

    const [scored, guardrails] = await Promise.all([
      scoreOpenLoops(userId),
      loadRecentActionGuardrails(userId),
    ]);

    if (!scored?.winner) {
      return emptyDirective(
        'No ranked daily brief candidate.',
        buildNoSendGenerationLog('No ranked daily brief candidate.', 'scoring', null),
      );
    }

    // Part 2b: Rank all candidates by viability before trying each one.
    const { ranked: rankedCandidates, competitionContext } = selectRankedCandidates(
      scored.topCandidates ?? [scored.winner],
      guardrails,
    );
    console.log(`[generator] ${rankedCandidates.length} candidates ranked for user ${userId.slice(0, 8)}`);

    // =====================================================================
    // USER-LEVEL DATA (shared across all candidates — fetch once)
    // =====================================================================

    const supabase = createServerClient();

    const [userGoalsResult, goalGapResult, alreadySentResult, behavioralHistoryResult] = await Promise.allSettled([
      // Goals
      supabase
        .from('tkg_goals')
        .select('goal_text, priority, goal_category, source')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('priority', { ascending: false })
        .limit(10),
      // Goal-gap analysis
      buildGoalGapAnalysis(userId),
      // Sent mail 14d
      (async (): Promise<string[]> => {
        const fourteenDaysAgo = new Date(Date.now() - daysMs(14)).toISOString();
        const { data: sentRows } = await supabase
          .from('tkg_signals')
          .select('content, occurred_at')
          .eq('user_id', userId)
          .eq('type', 'email_sent')
          .gte('occurred_at', fourteenDaysAgo)
          .order('occurred_at', { ascending: false })
          .limit(15);
        const lines: string[] = [];
        for (const row of sentRows ?? []) {
          const dec = decryptWithStatus(row.content as string ?? '');
          if (dec.usedFallback) continue;
          const text = dec.plaintext;
          const rowLines = text.split('\n').filter((l) => l.trim());
          const subj = rowLines.find((l) => /^Subject:/i.test(l))?.replace(/^Subject:\s*/i, '').slice(0, 80);
          const to = rowLines.find((l) => /^To:/i.test(l))?.replace(/^To:\s*/i, '').slice(0, 60);
          const date = new Date(row.occurred_at as string).toISOString().slice(0, 10);
          if (subj || to) lines.push(`[${date}]${to ? ` To: ${to}` : ''}${subj ? ` — ${subj}` : ''}`);
        }
        return lines;
      })(),
      // Weekly behavioral history
      (async (): Promise<string | null> => {
        const { data: summaries } = await supabase
          .from('signal_summaries')
          .select('week_start, week_end, signal_count, themes, people, summary, emotional_tone')
          .eq('user_id', userId)
          .order('week_start', { ascending: false })
          .limit(8);
        if (!summaries || summaries.length === 0) return null;
        const ordered = [...summaries].reverse();
        return ordered
          .map((s) => {
            const themes = Array.isArray(s.themes) ? (s.themes as string[]).slice(0, 4).join(', ') : '';
            const people = Array.isArray(s.people) ? (s.people as string[]).slice(0, 4).join(', ') : '';
            const tone = s.emotional_tone ? ` Tone: ${s.emotional_tone}.` : '';
            const themeStr = themes ? ` Themes: ${themes}.` : '';
            const peopleStr = people ? ` People: ${people}.` : '';
            return `Week of ${s.week_start}: ${s.signal_count} signals.${themeStr}${peopleStr}${tone}\n  ${(s.summary as string ?? '').slice(0, 200)}`;
          })
          .join('\n\n');
      })(),
    ]);

    const goalsForContext = ((
      userGoalsResult.status === 'fulfilled' ? (userGoalsResult.value.data ?? []) : []
    ) as Array<{ goal_text: string; priority: number; goal_category: string; source?: string }>)
      .filter((g) => !PLACEHOLDER_GOAL_SOURCES.has(g.source ?? ''))
      .slice(0, 5);
    const goalGapAnalysis: GoalGapEntry[] = goalGapResult.status === 'fulfilled' ? goalGapResult.value : [];
    const alreadySent = alreadySentResult.status === 'fulfilled' ? alreadySentResult.value : [];
    const behavioralHistory = behavioralHistoryResult.status === 'fulfilled' ? behavioralHistoryResult.value : null;
    console.log(`[generator] goalsForContext: ${goalsForContext.length}, goalGapAnalysis: ${goalGapAnalysis.length}`);

    const dynamicThreshold = await loadDirectiveConfidenceThreshold(userId);
    const confidence = computeDirectiveConfidence(scored);

    // =====================================================================
    // CANDIDATE FALLBACK LOOP — try each candidate in rank order.
    // Only do expensive work (hydration, research, LLM) for the first
    // candidate that passes DecisionPayload validation.
    // =====================================================================

    const candidateBlockLog: Array<{ title: string; reasons: string[] }> = [];

    // Hoist self-name tokens fetch — called once for all candidates, not once per candidate.
    // If this returns empty (auth metadata missing name), entity suppression is skipped
    // to avoid false positives (can't distinguish "Brandon" the user from "Brandon" the contact).
    const [selfNameTokens, userEmails] = await Promise.all([
      fetchUserSelfNameTokens(userId),
      fetchUserEmailAddresses(userId),
    ]);

    for (const { candidate: currentCandidate, disqualified, disqualifyReason } of rankedCandidates) {
      // Skip disqualified candidates (already acted recently, etc.)
      if (disqualified) {
        candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: [disqualifyReason ?? 'disqualified'] });
        continue;
      }

      // --- Per-candidate: hydrate ---
      const hydratedWinner = await hydrateWinnerRelationshipContext(userId, currentCandidate);

      // --- Per-candidate: signal evidence ---
      let signalEvidence: SignalSnippet[] = [];
      try {
        signalEvidence = await fetchWinnerSignalEvidence(userId, hydratedWinner);
      } catch (ctxErr: unknown) {
        logStructuredEvent({
          event: 'generator_signal_evidence_failed', level: 'warn', userId,
          artifactType: null, generationStatus: 'context_degraded',
          details: { scope: 'generator', stage: 'fetchWinnerSignalEvidence', error: ctxErr instanceof Error ? ctxErr.message : String(ctxErr) },
        });
      }

      // --- Per-candidate: entity suppression ---
      // Entity suppression: only check confirmed relationship contacts (from relationshipContext),
      // never from narrative text. Email body greetings ("Dear Brandon") would otherwise
      // leak the user's own name as a false suppression target.
      // Discrepancy candidates are structural patterns, not confirmed relationship contacts.
      // Skip entity suppression — hydrated context may contain the user's own name as a co-participant.
      if (CONTACT_ACTION_TYPES.has(hydratedWinner.suggestedActionType) && currentCandidate.type !== 'discrepancy') {
        const candidateEntities = extractRelationshipContextEntities(hydratedWinner, selfNameTokens);
        const recentEntityConflict = await findRecentEntityActionConflict(userId, candidateEntities);
        if (recentEntityConflict.matched) {
          candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: [`entity_suppressed:${recentEntityConflict.entityName}`] });
          logStructuredEvent({
            event: 'candidate_skipped_entity_suppression', level: 'info', userId,
            artifactType: null, generationStatus: 'recent_entity_action_suppressed',
            details: { scope: 'generator', entity_name: recentEntityConflict.entityName, action_id: recentEntityConflict.actionId },
          });
          continue; // Try next candidate
        }
      }

      // --- Per-candidate: research ---
      let insight: ResearchInsight | null = null;
      if (currentCandidate.score >= 2.0) {
        try {
          insight = await researchWinner(userId, hydratedWinner, { dryRun: options.dryRun });
        } catch {
          logStructuredEvent({
            event: 'researcher_fallthrough', level: 'warn', userId,
            artifactType: null, generationStatus: 'researcher_fallthrough',
            details: { scope: 'generator' },
          });
        }
      }

      // --- Per-candidate: avoidance observations ---
      let avoidanceObservations: Awaited<ReturnType<typeof buildAvoidanceObservations>> = [];
      try {
        avoidanceObservations = await buildAvoidanceObservations(userId, hydratedWinner, signalEvidence);
      } catch { /* non-blocking */ }

      // --- Per-candidate: conviction engine (only for first viable candidate) ---
      let convictionDecision: import('./conviction-engine').ConvictionDecision | null = null;
      const topGoalText = currentCandidate.matchedGoal?.text ?? currentCandidate.title ?? '';
      if (topGoalText) {
        try {
          const { runConvictionEngine } = await import('./conviction-engine');
          convictionDecision = await Promise.race([
            runConvictionEngine(userId, topGoalText),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
          ]);
        } catch (ceErr) {
          console.warn(`[generator] conviction engine failed (non-fatal): ${ceErr instanceof Error ? ceErr.message : String(ceErr)}`);
        }
      }

      // --- Build structured context ---
      const ctx = buildStructuredContext(
        hydratedWinner, guardrails, userId, signalEvidence, insight,
        goalsForContext, goalGapAnalysis,
        scored.antiPatterns, scored.divergences,
        alreadySent, convictionDecision, behavioralHistory,
        avoidanceObservations, competitionContext,
        userEmails,
      );

      // --- DECISION PAYLOAD — the canonical binding contract ---
      const decisionPayload = buildDecisionPayload(hydratedWinner, ctx, confidence);
      const payloadErrors = validateDecisionPayload(decisionPayload);

      if (payloadErrors.length > 0) {
        // Log typed reasons and try next candidate
        candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: payloadErrors });
        logStructuredEvent({
          event: 'candidate_blocked', level: 'info', userId,
          artifactType: null, generationStatus: 'decision_payload_blocked',
          details: {
            scope: 'generator',
            candidate_title: currentCandidate.title.slice(0, 80),
            candidate_index: rankedCandidates.indexOf(rankedCandidates.find(r => r.candidate === currentCandidate)!),
            readiness_state: decisionPayload.readiness_state,
            blocking_reasons: decisionPayload.blocking_reasons,
            payload_errors: payloadErrors,
          },
        });
        continue; // ← THE FIX: try next candidate instead of dying
      }

      // Confidence threshold gate
      if (confidence < dynamicThreshold) {
        candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: [`confidence_${confidence}_below_${dynamicThreshold}`] });
        logStructuredEvent({
          event: 'candidate_blocked', level: 'info', userId,
          artifactType: decisionPayload.recommended_action,
          generationStatus: 'below_confidence_threshold',
          details: { scope: 'generator', confidence, threshold: dynamicThreshold },
        });
        continue;
      }

      // =====================================================================
      // THIS CANDIDATE PASSED — proceed with LLM generation.
      // Log the fallback path so we can see which candidates were skipped.
      // =====================================================================

      if (candidateBlockLog.length > 0) {
        console.log(`[generator] candidate fallback: skipped ${candidateBlockLog.length} candidate(s) before finding viable #${rankedCandidates.indexOf(rankedCandidates.find(r => r.candidate === currentCandidate)!) + 1}`);
        for (const bl of candidateBlockLog) {
          console.log(`[generator]   skipped: "${bl.title}" — ${bl.reasons.join('; ')}`);
        }
      }

    // =====================================================================
    // LLM RENDERING — the model writes prose and artifact content.
    // It does NOT choose the action type. That is locked by decisionPayload.
    // =====================================================================

    let payloadResult: { issues: string[]; payload: GeneratedDirectivePayload | null };
    try {
      payloadResult = await generatePayload(userId, ctx, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[generator] generatePayload failed: ${errorMessage}`);
      logStructuredEvent({
        event: 'generation_request_failed',
        level: 'error',
        userId,
        artifactType: null,
        generationStatus: 'generation_request_failed',
        details: { scope: 'generator', error: errorMessage },
      });
      payloadResult = {
        issues: [`Generation request failed: ${errorMessage}`],
        payload: null,
      };
    }

    // If LLM generation fails entirely, try next candidate
    if (!payloadResult.payload) {
      if (shouldAttemptDecisionEnforcementRepair(payloadResult.issues, decisionPayload.recommended_action)) {
        const originalIssues = [...payloadResult.issues];
        const repairedPayload = buildDecisionEnforcedFallbackPayload({
          winner: hydratedWinner,
          actionType: decisionPayload.recommended_action,
          candidateDueDate: ctx.candidate_due_date,
          causalDiagnosis: ctx.required_causal_diagnosis,
          userEmails,
        });

        if (repairedPayload) {
          const repairedIssues = validateGeneratedArtifact(repairedPayload, ctx);
          if (repairedIssues.length === 0) {
            payloadResult = { issues: [], payload: repairedPayload };
            logStructuredEvent({
              event: 'candidate_repaired',
              level: 'info',
              userId,
              artifactType: decisionPayload.recommended_action,
              generationStatus: 'decision_enforcement_repaired',
              details: {
                scope: 'generator',
                candidate_title: currentCandidate.title.slice(0, 80),
                repaired_from_issues: originalIssues,
              },
            });
          } else {
            logStructuredEvent({
              event: 'candidate_repair_failed',
              level: 'warn',
              userId,
              artifactType: decisionPayload.recommended_action,
              generationStatus: 'decision_enforcement_repair_failed',
              details: {
                scope: 'generator',
                candidate_title: currentCandidate.title.slice(0, 80),
                repaired_issues: repairedIssues,
              },
            });
          }
        }
      }
    }

    if (!payloadResult.payload) {
      const failureReason = formatValidationFailureReason('Generation validation failed:', payloadResult.issues);
      candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: [`llm_failed:${failureReason.slice(0, 200)}`] });
      logStructuredEvent({
        event: 'candidate_blocked', level: 'warn', userId,
        artifactType: null, generationStatus: 'llm_generation_failed',
        details: { scope: 'generator', candidate_title: currentCandidate.title.slice(0, 80), issues: payloadResult.issues },
      });
      continue;
    }

    const payload = payloadResult.payload;

    // =====================================================================
    // POST-LLM ENFORCEMENT: the canonical action is from decisionPayload,
    // NOT from the LLM's artifact_type. Log any drift for diagnostics.
    // =====================================================================

    const canonicalAction = decisionPayload.recommended_action;
    const llmAttemptedAction = payload.artifact_type;

    if (llmAttemptedAction !== canonicalAction) {
      logStructuredEvent({
        event: 'llm_action_drift_overridden',
        level: 'warn',
        userId,
        artifactType: canonicalAction,
        generationStatus: 'action_drift_corrected',
        details: {
          scope: 'generator',
          canonical_action: canonicalAction,
          llm_attempted_action: llmAttemptedAction,
          winner_id: decisionPayload.winner_id,
        },
      });
    }

    // Log if LLM attempted HOLD — but do NOT gate on it.
    // DecisionPayload is the authority. If the payload said SEND, the LLM must render.
    // The LLM's HOLD was the #1 cause of confidence=0: the demanding prompt made the
    // LLM default to HOLD, hardcoding confidence to 0 and bypassing the computed confidence.
    if (payload.decision === 'HOLD') {
      logStructuredEvent({
        event: 'llm_hold_overridden', level: 'info', userId,
        artifactType: canonicalAction, generationStatus: 'hold_overridden_by_payload',
        details: { scope: 'generator', insight: payload.insight?.trim() ?? '' },
      });
    }

    // Consecutive duplicate suppression — candidate-specific, try next
    const duplicateCheck = await checkConsecutiveDuplicate(userId, payload.directive);
    if (duplicateCheck.isDuplicate) {
      const dupReason = `duplicate_${Math.round((duplicateCheck.similarity ?? 0) * 100)}pct_similar`;
      candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: [dupReason] });
      logStructuredEvent({
        event: 'candidate_blocked', level: 'warn', userId,
        artifactType: canonicalAction, generationStatus: 'duplicate_suppressed',
        details: { scope: 'generator', candidate_title: currentCandidate.title.slice(0, 80), matching_action_id: duplicateCheck.matchingActionId, similarity: duplicateCheck.similarity },
      });
      continue;
    }

    // Usefulness gate — candidate-specific, try next
    const usefulnessCheck = isUseful({
      artifact: JSON.stringify(payload.artifact),
      evidence: payload.insight,
      action: payload.directive,
    });
    if (!usefulnessCheck.ok) {
      candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: [`usefulness:${usefulnessCheck.reason}`] });
      logStructuredEvent({
        event: 'candidate_blocked', level: 'warn', userId,
        artifactType: canonicalAction, generationStatus: 'usefulness_gate_failed',
        details: { scope: 'generator', candidate_title: currentCandidate.title.slice(0, 80), reason: usefulnessCheck.reason },
      });
      continue;
    }

    // =====================================================================
    // FINAL DIRECTIVE — action_type comes from decisionPayload, not LLM.
    // The LLM contributed: directive text, artifact content, insight, why_now.
    // =====================================================================

    const scorerTopCandidate = scored.topCandidates?.[0] ?? scored.winner;
    const selectedRatedCandidate = rankedCandidates.find((entry) => entry.candidate.id === currentCandidate.id) ?? null;
    const scorerTopRatedCandidate = rankedCandidates.find((entry) => entry.candidate.id === scorerTopCandidate.id) ?? null;

    const directive = {
      directive: payload.directive.trim(),
      action_type: artifactTypeToActionType(canonicalAction),
      confidence,
      reason: payload.why_now.trim(),
      evidence: buildEvidenceItems(scored, payload),
      fullContext: buildFullContext({ ...scored, winner: hydratedWinner }, payload),
      embeddedArtifact: payload.artifact,
      embeddedArtifactType: canonicalAction,
      acceptedCausalDiagnosis: payload.causal_diagnosis,
      causalDiagnosisSource: payload.causal_diagnosis_source ?? null,
      winnerSelectionTrace: {
        finalWinnerId: currentCandidate.id,
        finalWinnerType: currentCandidate.type,
        finalWinnerReason: selectedRatedCandidate?.note ?? null,
        scorerTopId: scorerTopCandidate.id,
        scorerTopType: scorerTopCandidate.type,
        scorerTopDisplacementReason:
          scorerTopCandidate.id === currentCandidate.id
            ? null
            : (scorerTopRatedCandidate?.disqualifyReason ?? scorerTopRatedCandidate?.note ?? 'lower_viability_than_selected_winner'),
      },
      generationLog: buildSelectedGenerationLog(scored.candidateDiscovery),
    } as ConvictionDirective & {
      embeddedArtifact?: Record<string, unknown>;
      embeddedArtifactType?: string;
      acceptedCausalDiagnosis?: CausalDiagnosis;
      causalDiagnosisSource?: string | null;
      winnerSelectionTrace?: {
        finalWinnerId: string;
        finalWinnerType: string;
        finalWinnerReason: string | null;
        scorerTopId: string;
        scorerTopType: string;
        scorerTopDisplacementReason: string | null;
      };
    };

    // Persistence validation — candidate-specific, try next
    const persistenceIssues = validateDirectiveForPersistence({
      userId,
      directive,
      artifact: payload.artifact,
    });
    if (persistenceIssues.length > 0) {
      candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: persistenceIssues.map(i => `persistence:${i}`) });
      logStructuredEvent({
        event: 'candidate_blocked', level: 'warn', userId,
        artifactType: canonicalAction, generationStatus: 'persistence_validation_failed',
        details: { scope: 'generator', candidate_title: currentCandidate.title.slice(0, 80), issues: persistenceIssues },
      });
      continue;
    }

    // Trigger action lock validation — discrepancy candidates only
    if (currentCandidate.type === 'discrepancy' && currentCandidate.discrepancyClass && currentCandidate.trigger) {
      const artifactText = typeof payload.artifact === 'object'
        ? JSON.stringify(payload.artifact)
        : String(payload.artifact ?? '');
      const triggerValidation = validateTriggerArtifact(
        currentCandidate.discrepancyClass,
        currentCandidate.trigger,
        artifactText,
        canonicalAction,
        currentCandidate.title,
      );
      if (!triggerValidation.pass) {
        logStructuredEvent({
          event: 'trigger_validation_violations', level: 'warn', userId,
          artifactType: canonicalAction, generationStatus: 'trigger_advisory',
          details: {
            scope: 'trigger_action_lock',
            trigger_class: currentCandidate.discrepancyClass,
            violations: triggerValidation.violations,
            note: 'Advisory — artifact proceeds but violations logged for quality tracking',
          },
        });
      }
    }

    logStructuredEvent({
      event: 'directive_generated', userId,
      artifactType: canonicalAction, generationStatus: 'generated',
      details: {
        scope: 'generator',
        action_type: artifactTypeToActionType(canonicalAction),
        canonical_action: canonicalAction,
        llm_attempted_action: llmAttemptedAction,
        action_drift: llmAttemptedAction !== canonicalAction,
        winner_type: currentCandidate.type,
        score: Number(currentCandidate.score.toFixed(2)),
      },
    });

    return directive;
    } // end candidate fallback loop

    // =====================================================================
    // ALL CANDIDATES BLOCKED — no viable candidate found.
    // Log detailed fallback trace so we can audit false positives.
    // =====================================================================

    const allBlockReasons = candidateBlockLog.map(
      (bl) => `"${bl.title}" → ${bl.reasons.join('; ')}`,
    ).join(' | ');
    const summaryReason = `All ${rankedCandidates.length} candidates blocked: ${allBlockReasons}`;
    console.log(`[generator] ${summaryReason}`);
    logStructuredEvent({
      event: 'all_candidates_blocked', level: 'warn', userId,
      artifactType: null, generationStatus: 'all_candidates_blocked',
      details: {
        scope: 'generator',
        candidate_count: rankedCandidates.length,
        block_log: candidateBlockLog,
      },
    });
    return emptyDirective(
      summaryReason,
      buildNoSendGenerationLog(summaryReason, 'validation', scored.candidateDiscovery),
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Sentry.captureException(error, { tags: { scope: 'generator', userId: userId?.substring(0, 8) } });
    console.error(`[generator] generateDirective failed: ${errorMessage}`);
    logStructuredEvent({
      event: 'directive_generation_failed', level: 'error', userId,
      artifactType: null, generationStatus: 'failed',
      details: { scope: 'generator', error: errorMessage },
    });
    return emptyDirective(
      'Generation failed internally.',
      buildNoSendGenerationLog('Generation failed internally.', 'system', null),
    );
  }
}

// ---------------------------------------------------------------------------
// Briefing generation (preserved)
// ---------------------------------------------------------------------------

export async function generateBriefing(userId: string): Promise<ChiefOfStaffBriefing> {
  const supabase = createServerClient();
  const directive = await generateDirective(userId);

  if (directive.directive === GENERATION_FAILED_SENTINEL) {
    throw new Error('Briefing generation failed');
  }

  const brief: ChiefOfStaffBriefing = {
    userId,
    briefingDate: today(),
    generatedAt: new Date(),
    topInsight: directive.reason,
    confidence: directive.confidence,
    recommendedAction: directive.directive,
    fullBrief: directive.fullContext ?? directive.reason,
  };

  const { error } = await supabase.from('tkg_briefings').insert({
    user_id: userId,
    briefing_date: brief.briefingDate,
    generated_at: brief.generatedAt.toISOString(),
    top_insight: brief.topInsight,
    confidence: brief.confidence,
    recommended_action: brief.recommendedAction,
    stats: {
      signalsAnalyzed: 0,
      commitmentsReviewed: 0,
      patternsActive: 0,
      fullBrief: brief.fullBrief,
      directive,
    },
  });

  if (error) {
    logStructuredEvent({
      event: 'briefing_cache_failed', level: 'warn', userId,
      artifactType: null, generationStatus: 'briefing_cache_failed',
      details: { scope: 'generator', error: error.message },
    });
  }

  return brief;
}
