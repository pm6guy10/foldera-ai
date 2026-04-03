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
import { enrichRelationshipContext, scoreOpenLoops } from './scorer';
import { isOverDailyLimit, isOverManualCallLimit, trackApiCall } from '@/lib/utils/api-tracker';
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
  SIGNAL_RETENTION_DAYS,
  daysMs,
} from '@/lib/config/constants';
import { resolveUserPromptNames, type UserPromptNames } from '@/lib/auth/user-display-name';
import {
  TRIGGER_ACTION_MAP,
  artifactContainsDecayPipelineLeak,
  buildTriggerContextBlock,
  resolveTriggerAction,
  validateTriggerArtifact,
} from './trigger-action-map';
import type { EntityBehavioralStats } from '@/lib/signals/behavioral-graph';
import type { DiscrepancyClass } from './discrepancy-detector';
import { effectiveDiscrepancyClassForGates } from './effective-discrepancy-class';
import {
  directiveLooksLikeScheduleConflict,
  scheduleConflictArtifactIsOwnerProcedure,
} from './schedule-conflict-guards';
import {
  filterPastSupportingSignals,
  getNewestEvidenceTimestampMs,
  hasPastWinnerSourceSignals,
  needsNoThreadNoOutcomeBlock,
} from './thread-evidence-for-payload';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATION_FAILED_SENTINEL = '__GENERATION_FAILED__';
const GENERATION_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_DIRECTIVE_CONFIDENCE_THRESHOLD = CONFIDENCE_PERSIST_THRESHOLD;
const STALE_SIGNAL_THRESHOLD_DAYS = 21;

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
const PLACEHOLDER_GOAL_SOURCES = new Set(['onboarding_bucket', 'onboarding_marker', 'system_config']);

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

/** Prepended to user prompt so the model renders DecisionPayload, not a self-chosen type. */
function buildCanonicalActionPreamble(committed: ValidArtifactTypeCanonical): string {
  const executable = EXECUTABLE_ARTIFACT_TYPES.has(committed);
  return (
    `CANONICAL_ACTION (system commitment — non-negotiable):\n` +
    `DecisionPayload has locked artifact type: ${committed}.\n` +
    `Your JSON MUST set action="${committed}" (Discrepancy Engine format) and artifact_type="${committed}" (legacy format) with a complete artifact for exactly this type.\n` +
    (executable
      ? `wait_rationale and do_nothing are invalid here — the system already committed to an executable move.\n`
      : '')
  );
}

// ---------------------------------------------------------------------------
// Part 2 — System prompt (execution layer, not advisor)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `SYSTEM — FOLDERA CONVICTION ENGINE

You are the user's strategic partner. You have access to
their email, calendar, goals, commitments, and behavioral
patterns. You know what they care about and what they're
avoiding.

Your job is NOT to summarize their inbox or remind them of
tasks. Your job is to:

NAME THE PATTERN they haven't connected.
Not "you have an unreplied email." Instead: "You've received
4 messages from this person in 2 weeks and replied to none.
Last time this happened with [other entity], the relationship
went cold and you lost the opportunity."

EXPLAIN WHY NOW with their own history.
Not "this is overdue." Instead: "This commitment is 11 days
old with zero activity. You made a similar commitment to [X]
in January and it died at day 14. Today is day 11."

DELIVER THE FINISHED WORK.
The artifact is not a suggestion. It is the completed action.
A draft email ready to send. A document ready to submit. A
decision framed with options and a recommendation.
If the user has to do ANY work after approving, you have failed.

Voice rules:
- Direct. No hedging. No "consider" or "you might want to" or "perhaps."
- Specific. Use real names, real dates, real numbers from the signals. Never generic.
- Brief. The directive text is 1-2 sentences that name the pattern. The artifact is the work.
- Grounded. Every claim must trace to a signal. If you cannot ground it, do not say it.
- No self-reference. Never say "I noticed" or "Foldera detected" or "based on your data." Just state the pattern as fact.

The scoring system has selected a candidate. The user should
read the directive and think: "How did it know that?" Not
"I already knew that." If the evidence is thin, make the
artifact shorter and more cautious. Do NOT fill gaps with
confidence. A short grounded artifact beats a long speculative one.

When behavioral_pattern candidates are the winner, lead with the
cross-signal connection the user hasn't made. Name the pattern
explicitly in the directive text.

ARTIFACT QUALITY CONTRACT (mandatory for send_message and write_document):
Every artifact must demonstrate at least one cross-signal connection the user has not explicitly made. Examples of cross-signal connections: linking a decaying contact to an active goal, linking response-time degradation across multiple threads to a relationship risk, linking calendar gaps to email commitments. If the generator cannot produce a cross-signal connection for the winning candidate, it must set recommended_action: 'do_nothing' with a wait_rationale explaining what additional signal would unlock a real directive. Never send filler.

NEGATIVE EXAMPLES (never produce these):
- "Quick question about DSHS processes" to a DSHS admin during active DSHS job search (generic, no connection made)
- "Schedule 30 minutes to review your credit score" (chore, user already knows)
- "Document why X can wait" (busy work)

POSITIVE EXAMPLES (this is the bar):
- "You've applied to two DSHS roles in 30 days. Cheryl Anderson is a DSHS employee you haven't contacted in 79 days. Here's a reconnection email that references your interest in HCLA and asks for 15 minutes on the division's current priorities." (cross-signal: decay + active applications + specific department)
- "14 unread emails from Marissa in 7 days, up from 3/week in February. 9 unanswered. Here are responses to all 9 batched into 3 messages." (cross-signal: frequency change + response gap + relationship priority)
- "You emailed Yadira twice, both on Mondays. State HR response rates peak Wednesday 8-10am. Here's the follow-up, scheduled for Wednesday 8am." (cross-signal: timing pattern + external data + specific contact)

INSIGHT CANDIDATES / INSIGHT_SCAN_WINNER (apply only when the user prompt includes the INSIGHT_SCAN_WINNER block):
The winner may come from the Insight Scan — an unsupervised read of raw signals for patterns the user has not named (not structural gap rules). When that block is present:
1. Lead with the PATTERN, not a generic task or reminder.
2. The directive states what they have not connected about their own behavior; the artifact is still finished work (email or document) framed as: what the footprint shows, then the concrete move.
3. Never say "Foldera noticed", "the system detected", or "I detected" — state the pattern as observable fact.
4. Do not replace the pattern with a shallow follow-up line; the user should feel the blind spot was named.

QUALITY EXAMPLES:

Good directive: "4 emails from Holly in 12 days, 0 replies. Last time you went silent on a reference contact (Teo, January), it took 3 weeks to re-engage. Holly is your active DVA reference."

Bad directive: "You have unreplied emails from Holly Stenglein. Consider responding."

Good directive: "You committed to following up on the ESD overpayment waiver 18 days ago. No activity since. The hardship waiver has a 30-day response window. Here's the call script for 800-318-6022."

Bad directive: "Your ESD overpayment commitment is stale. Take action."

Good artifact (send_message): A complete email with subject, recipient, body that references the specific thread, answers specific questions, and includes a concrete ask with a date.

Bad artifact: "Hi [name], just wanted to follow up on our previous conversation. Let me know if you have any updates."

EVIDENCE RULES:
- Only use facts from the signals provided
- No placeholders, no brackets, no TODOs
- Real names, dates, and details only
- If evidence is thin, write a SHORT artifact. Thin = short, not skip.

ENTITY_ANALYSIS and CANDIDATE_ANALYSIS are for YOUR understanding only. Never paste metric values, ratios, baselines, or system terminology into the artifact body. The email must read like a human wrote it, not like a data dump. Use the analysis to understand context, then write naturally. The same applies to numeric or pipeline phrasing from TRIGGER_CONTEXT (e.g. interaction counts, "/14d" baselines, arrows between states) — translate into normal language if at all, never as a statistics recap.

CONFIDENCE SCORING (0-100):
- 80+ = multiple corroborating signals, clear deadline or consequence
- 60-79 = strong single-source evidence with clear next step
- 40-59 = reasonable evidence, some inference required
- Below 40 = thin evidence, flag uncertainty in the artifact

CAUSAL DIAGNOSIS (required):
- "why_exists_now": what changed that makes this urgent today
- "mechanism": the root cause creating this situation
- The artifact must resolve the mechanism, not restate symptoms

OUTPUT FORMAT (send_message example):
{
  "action": "send_message",
  "confidence": 0-100,
  "reason": "one sentence: why this matters NOW, not eventually",
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

For write_document, schedule_block, wait_rationale, or do_nothing: use the same top-level fields with "action" set accordingly; include an "artifact" object with the finished fields (e.g. title and content for documents; start, end, or duration_minutes for schedules).

CRITICAL: Return ONLY a JSON object. No markdown fences,
no explanation, no text before or after. Start with { end with }.

Valid action values: send_message, write_document,
schedule_block, wait_rationale, do_nothing.

MANDATORY EMAIL PATH RULE:
If the user prompt starts with "Write an email from the user to:",
you MUST write the email. do_nothing and wait_rationale are
FORBIDDEN on the email path. Thin context = short email,
not refusal. A 3-sentence genuine email is always better than do_nothing.

DECAY_RECONNECTION EXCEPTION (overrides MANDATORY EMAIL PATH RULE when applicable):
When the user prompt contains "DECAY_RECONNECTION_RULE", do_nothing IS allowed if the prompt states
that no specific past interaction can be grounded in RECENT SIGNALS, TRIGGER_CONTEXT, or relationship
lines. Do not invent financial or unrelated threads to satisfy the email path — prefer do_nothing over a mis-addressed email.

Forbidden phrases in any artifact:
- "follow up", "check in", "circle back", "touching base"
- "I hope this email finds you well", "just reaching out"
- Any opener not anchored to specific evidence from the signals.

---

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
}`;

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
  /** Explicit ACT/HOLD decision: ACT to produce an artifact, HOLD to surface the insight only */
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

export interface SignalSnippet {
  source: string;
  date: string;
  subject: string | null;
  snippet: string;
  author: string | null;
  direction: 'sent' | 'received' | 'unknown';
  /** Original `tkg_signals.type` when present (e.g. response_pattern). */
  row_type?: string | null;
}

interface GenerateDirectiveOptions {
  dryRun?: boolean;
  /** Skip daily spend cap check — used for manual Generate Now so testing doesn't cost money */
  skipSpendCap?: boolean;
  /**
   * Skip per-day manual directive call count (api_usage directive rows).
   * ONLY for owner-gated `/api/dev/brain-receipt` — keeps prod proof path unblocked
   * without widening Generate Now / smoke-test budgets.
   */
  skipManualCallLimit?: boolean;
}

/** Internal: generatePayload only — locks LLM render to DecisionPayload.recommended_action */
type GeneratePayloadOptions = GenerateDirectiveOptions & {
  committedArtifactType: ValidArtifactTypeCanonical;
};

interface GeneratePayloadResult {
  issues: string[];
  payload: GeneratedDirectivePayload | null;
  /** When true, caller should persist wait_rationale (cross-signal gate exhausted after retry). */
  lowCrossSignalWaitRationale?: boolean;
  /**
   * LLM retries exhausted with low_cross_signal; caller should try deterministic repair first,
   * then build wait_rationale if still no payload.
   */
  pendingLowCrossSignalFallback?: boolean;
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
  lockedContactNames?: Set<string>,
): DecisionPayload {
  // Determine freshness — union of hydrated supporting_signals and scorer refs (AZ-24 slice 2)
  const newestMs = getNewestEvidenceTimestampMs(ctx.supporting_signals, winner.sourceSignals);
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
  if (winner.type === 'discrepancy' && winner.discrepancyClass) {
    if (winner.discrepancyPreferredAction) {
      recommended_action = actionTypeToArtifactType(winner.discrepancyPreferredAction) as ValidArtifactTypeCanonical;
    } else {
      recommended_action = resolveTriggerAction(winner.discrepancyClass, ctx.has_real_recipient) as ValidArtifactTypeCanonical;
    }
  } else {
    recommended_action = actionTypeToArtifactType(winner.suggestedActionType);

    // Legacy conversion rule: send_message without a recipient → write_document
    if (recommended_action === 'send_message' && !ctx.has_real_recipient) {
      recommended_action = 'write_document';
    }
  }

  if (winner.type === 'discrepancy' && recommended_action === 'send_message' && !ctx.has_real_recipient) {
    recommended_action = 'write_document';
  }

  // Build justification facts from concrete evidence
  const justification_facts: string[] = [];
  if (winner.matchedGoal) {
    justification_facts.push(`Matched goal [p${winner.matchedGoal.priority}]: ${winner.matchedGoal.text}`);
  }
  for (const sig of winner.relatedSignals.slice(0, 5)) {
    justification_facts.push(`Signal: ${sig.slice(0, 200)}`);
  }
  if (ctx.candidate_context_enrichment) {
    justification_facts.push(ctx.candidate_context_enrichment.slice(0, 800));
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

  // Hard block: entity is in tkg_constraints locked_contact — never contact regardless of signal state.
  // Checked before generation so the LLM never even sees the candidate.
  if (recommended_action === 'send_message' && lockedContactNames && lockedContactNames.size > 0 && winner.entityName) {
    const normalized = winner.entityName.replace(/\s+/g, '').toLowerCase();
    if (lockedContactNames.has(normalized)) {
      blocking_reasons.push('locked_contact_suppression');
    }
  }

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

  // 1. Real thread exists (past signals only — future-dated calendar events are excluded).
  // Hydrated supporting_signals may be empty while winner.sourceSignals still lists past scorer refs.
  const pastSignals = filterPastSupportingSignals(ctx.supporting_signals);
  const hasRealThread =
    pastSignals.length > 0 || hasPastWinnerSourceSignals(winner.sourceSignals);

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

  // Hard block: no thread AND no goal = no basis to act at all.
  // Discrepancy candidates are exempt: absence of signals / drift / decay IS the
  // structural evidence for this class. Blocking them here inverts the logic.
  if (needsNoThreadNoOutcomeBlock(winner.type, hasRealThread, tiedToOutcome)) {
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

export interface StructuredContext {
  selected_candidate: string;
  candidate_class: string;
  candidate_title: string;
  candidate_reason: string;
  candidate_goal: string | null;
  candidate_score: number;
  candidate_due_date: string | null;
  candidate_context_enrichment: string | null;
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
  /** Display name for send_message prompts and fallbacks (never empty; min "the user"). */
  user_full_name: string;
  /** First name for natural phrasing; empty → use "you" / "the user" in copy. */
  user_first_name: string;
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
  /** Formatted lines from `tkg_signals.type = response_pattern` (reply latency, RSVP, unreplied thread). */
  response_pattern_lines?: string[];
  // Multi-candidate competition context — why this winner beat the alternatives
  competition_context: string | null;
  // Confidence prior derived from scorer (actionTypeRate + entityPenalty) — bounds generator guessing
  confidence_prior: number;
  // Canonical root-cause diagnosis inferred before rendering.
  required_causal_diagnosis: CausalDiagnosis;
  // Trigger context block — injected for discrepancy candidates only
  trigger_context: string | null;
  // Human-readable recipient brief — name, email, role, last contact, context.
  // Populated for send_message candidates with a confirmed external recipient.
  // When present, non-decay send_message path strips most system metrics; decay keeps rich context.
  recipient_brief: string | null;
  /** Discrepancy subclass when candidate_class is discrepancy (e.g. schedule_conflict). */
  discrepancy_class: string | null;
  /** True when the winner originated from runInsightScan (see INSIGHT_SCAN_WINNER in system prompt). */
  insight_scan_winner?: boolean;
  /** Scorer breakdown — why this candidate ranked (internal; do not paste raw numbers into user emails). */
  candidate_analysis: string;
  /** Per-entity bx_stats when available (discrepancy UUID entity, etc.). */
  entity_analysis: string | null;
  /** Per-entity conversation state — last sent, last reply, SENT_AWAITING_REPLY flag. Null when no prior sent email found. */
  entity_conversation_state: string | null;
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
    ...input.winner.relatedSignals.slice(0, 5),
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

/** Extra lines for calendar/drive/conversation discrepancy winners. */
function enrichCandidateContext(winner: ScoredLoop, evidenceSortedChrono: SignalSnippet[]): string | null {
  if (winner.type !== 'discrepancy' || !winner.discrepancyClass) return null;
  const cls = winner.discrepancyClass;
  const parts: string[] = [];

  // Decay: entity-scoped email/calendar lines so CONTEXT_ENRICHMENT reaches the LLM (keyword path skips decay).
  if (cls === 'decay') {
    const anchors = extractDecayEntityAnchors(winner);
    const EMAIL_SOURCES = new Set(['gmail', 'outlook']);
    const CAL_SOURCES = new Set(['google_calendar', 'outlook_calendar']);
    const decayExtras = evidenceSortedChrono
      .filter((e) => EMAIL_SOURCES.has(e.source) || CAL_SOURCES.has(e.source))
      .filter((e) => signalSnippetMatchesDecayEntity(e, anchors))
      .slice(0, 8);
    for (const e of decayExtras) {
      const head = [e.subject, e.snippet].filter(Boolean).join(' — ');
      parts.push(`• [${e.source} @ ${e.date}] ${head.slice(0, 220)}`);
    }
  }

  for (const s of winner.sourceSignals ?? []) {
    const src = s.source ? `${s.kind}/${s.source}` : s.kind;
    parts.push(`• [${src}] ${(s.summary ?? '').slice(0, 220)}`);
  }

  const EMAIL_SOURCES = new Set(['gmail', 'outlook']);
  const CAL_SOURCES = new Set(['google_calendar', 'outlook_calendar']);

  const extra = evidenceSortedChrono.filter((e) => {
    if (cls === 'preparation_gap' || cls === 'meeting_open_thread' || cls === 'schedule_conflict') {
      return CAL_SOURCES.has(e.source) || EMAIL_SOURCES.has(e.source);
    }
    if (cls === 'stale_document' || cls === 'document_followup_gap') {
      return e.source === 'drive' || e.source === 'onedrive';
    }
    if (cls === 'unresolved_intent') {
      return /claude_conversation|chatgpt_conversation|conversation/i.test(e.source);
    }
    if (cls === 'convergence') {
      return CAL_SOURCES.has(e.source) || EMAIL_SOURCES.has(e.source) || e.source === 'drive' || e.source === 'onedrive';
    }
    return false;
  }).slice(0, 8);

  for (const e of extra) {
    const head = [e.subject, e.snippet].filter(Boolean).join(' — ');
    parts.push(`• [${e.source} @ ${e.date}] ${head.slice(0, 220)}`);
  }

  if (parts.length === 0) return null;
  return `CONTEXT_ENRICHMENT (${cls}):\n${parts.join('\n')}`;
}

/**
 * Calendar double-booking must surface calendar copy in the lead — the LLM often drifts to
 * relationship/reconnect framing when enrichment mentions family. Scorer title/content/trigger stay aligned.
 */
export function applyScheduleConflictCanonicalUserFacingCopy(
  payload: GeneratedDirectivePayload,
  winner: ScoredLoop,
): void {
  if (winner.type !== 'discrepancy') return;
  const isScheduleConflict =
    winner.discrepancyClass === 'schedule_conflict' || winner.id.startsWith('discrepancy_conflict_');
  if (!isScheduleConflict) return;

  const rawTitle = winner.title.split(/\r?\n/)[0]?.trim() ?? '';
  if (!rawTitle) return;
  const directiveLine = (rawTitle.endsWith('.') ? rawTitle : `${rawTitle}.`).slice(0, 220).replace(/\s+/g, ' ');

  let whyNow = winner.trigger?.why_now?.trim();
  if (!whyNow) {
    const c = winner.content.trim();
    const m = c.match(/^[\s\S]{1,400}?[.!?](?:\s|$)/);
    whyNow = m ? m[0].trim() : c.slice(0, 320);
  }
  if (whyNow.length > 400) whyNow = `${whyNow.slice(0, 397)}...`;

  payload.directive = directiveLine;
  payload.why_now = whyNow;
}

function parseBxStatsFromPatterns(patterns: unknown): EntityBehavioralStats | null {
  if (!patterns || typeof patterns !== 'object') return null;
  const bx = (patterns as Record<string, unknown>).bx_stats;
  if (!bx || typeof bx !== 'object') return null;
  const b = bx as Record<string, unknown>;
  if (
    typeof b.signal_count_14d !== 'number' ||
    typeof b.signal_count_30d !== 'number' ||
    typeof b.signal_count_90d !== 'number' ||
    typeof b.silence_detected !== 'boolean' ||
    typeof b.computed_at !== 'string'
  ) {
    return null;
  }
  const vr = b.velocity_ratio;
  if (vr !== null && typeof vr !== 'number') return null;
  const ola = b.open_loop_age_days;
  if (ola !== null && typeof ola !== 'number') return null;
  return {
    signal_count_14d: b.signal_count_14d,
    signal_count_30d: b.signal_count_30d,
    signal_count_90d: b.signal_count_90d,
    velocity_ratio: vr as number | null,
    silence_detected: b.silence_detected,
    open_loop_age_days: ola as number | null,
    computed_at: b.computed_at,
  };
}

function buildCandidateAnalysisBlock(winner: ScoredLoop): string {
  const b = winner.breakdown;
  const stakesRaw = b.stakes_raw ?? b.stakes;
  const urgEff = b.urgency_effective ?? b.urgency;
  const execPot = b.exec_potential ?? 0;
  const behRate = b.behavioral_rate ?? 0;
  const fmt = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : String(n);
  const lines: string[] = [
    `CANDIDATE_ANALYSIS: stakes=${fmt(stakesRaw)}, urgency=${fmt(urgEff)}, exec=${fmt(execPot)}, behavioral_rate=${fmt(behRate)}`,
    'CANDIDATE_DETAIL (scorer rationale — internal grounding; do not dump raw metrics into the user-facing email):',
    `- aggregate_score: ${winner.score.toFixed(2)}`,
    `- stakes: ${b.stakes}`,
    `- urgency: ${b.urgency}`,
    `- tractability: ${b.tractability}`,
    `- freshness: ${b.freshness}`,
    `- action_type_approval_rate: ${b.actionTypeRate}`,
    `- entity_penalty: ${b.entityPenalty}`,
  ];
  if (b.specificityAdjustedStakes != null) {
    lines.push(`- specificity_adjusted_stakes: ${b.specificityAdjustedStakes}`);
  }
  if (b.urgency_effective != null) lines.push(`- urgency_effective: ${b.urgency_effective}`);
  if (b.exec_potential != null) lines.push(`- exec_potential: ${b.exec_potential}`);
  if (b.behavioral_rate != null) lines.push(`- behavioral_rate: ${b.behavioral_rate}`);
  if (b.novelty_multiplier != null) lines.push(`- novelty_multiplier: ${b.novelty_multiplier}`);
  if (b.suppression_multiplier != null) lines.push(`- suppression_multiplier: ${b.suppression_multiplier}`);
  return `(INTERNAL CONTEXT - do not paste into artifact)\n${lines.join('\n')}`;
}

function buildEntityAnalysisBlock(
  entityName: string | null | undefined,
  bx: EntityBehavioralStats | null | undefined,
): string | null {
  if (!bx) return null;
  const name = (entityName ?? '').trim() || 'entity';
  const vr = bx.velocity_ratio === null ? 'null' : bx.velocity_ratio.toFixed(2);
  const ola = bx.open_loop_age_days === null ? 'null' : String(bx.open_loop_age_days);
  return (
    `(INTERNAL CONTEXT - do not paste into artifact)\n` +
    `ENTITY_ANALYSIS (entity behavioral stats / bx_stats — internal reasoning only; never paste into user-facing email):\n` +
    `- entity: ${name}\n` +
    `- velocity_ratio: ${vr} (14d rate vs 90d baseline; <1 = cooling)\n` +
    `- signal_count_14d: ${bx.signal_count_14d}\n` +
    `- signal_count_30d: ${bx.signal_count_30d}\n` +
    `- signal_count_90d: ${bx.signal_count_90d}\n` +
    `- silence_detected: ${bx.silence_detected}\n` +
    `- open_loop_age_days: ${ola}\n` +
    `- bx_stats_computed_at: ${bx.computed_at}`
  );
}

function buildResponsePatternPromptBlock(lines: string[]): string | null {
  if (lines.length === 0) return null;
  return (
    `RESPONSE_PATTERN_LINES (derived reply/RSVP/latency rows — internal; use facts in natural language only):\n` +
    lines.join('\n')
  );
}

async function enrichWinnerWithEntityBxStats(userId: string, winner: ScoredLoop): Promise<ScoredLoop> {
  if (winner.entityBxStats != null) {
    return winner;
  }
  if (winner.type !== 'discrepancy') return winner;
  const uuidMatch = winner.id.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  if (!uuidMatch) return winner;
  const supabase = createServerClient();
  const { data: entity } = await supabase
    .from('tkg_entities')
    .select('patterns')
    .eq('user_id', userId)
    .eq('id', uuidMatch[1])
    .neq('name', 'self')
    .maybeSingle();
  const bx = parseBxStatsFromPatterns(entity?.patterns);
  if (!bx) return winner;
  return { ...winner, entityBxStats: bx };
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
  userPromptNames?: UserPromptNames,
  entityConversationState?: string | null,
): StructuredContext {
  const names: UserPromptNames = userPromptNames ?? {
    user_full_name: 'the user',
    user_first_name: '',
  };
  // Type-diverse signal sampling: guarantee calendar, task, file, and drive
  // signals get representation instead of being buried under email volume.
  // Bloodhound approach: cast a wide net across signal types, then fill
  // remaining slots chronologically.
  const EMAIL_SOURCES = new Set(['gmail', 'outlook']);
  const sorted = signalEvidence
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const response_pattern_lines = sorted
    .filter((s) => s.row_type === 'response_pattern')
    .slice(0, 24)
    .map((s) => {
      const head = [s.subject, s.snippet].filter(Boolean).join(' — ');
      const auth = s.author?.trim() ? `${s.author.trim()}: ` : '';
      return `- [${s.date}] [response_pattern] ${auth}${head.slice(0, 280)}`;
    });

  const maxSignals =
    winner.type === 'discrepancy' && winner.discrepancyClass === 'decay' ? 40 : 15;
  const nonEmailCap = winner.type === 'discrepancy' && winner.discrepancyClass === 'decay' ? 12 : 6;
  const nonEmailSignals = sorted.filter((s) => !EMAIL_SOURCES.has(s.source));

  // Take non-email signals first (calendar, tasks, files, drive); decay gets a larger cap so the LLM sees full thread context.
  const diverse = nonEmailSignals.slice(0, nonEmailCap);
  const usedIds = new Set(diverse.map((s) => `${s.source}:${s.date}:${s.author}`));

  // Fill remaining slots with chronological mix
  for (const s of sorted) {
    if (diverse.length >= maxSignals) break;
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

  // Active goals: all DB goals passed in (tkg_goals), scorer-matched first, deduped — not only matchedGoal
  const formatActiveGoalLine = (category: string, priority: number, text: string) =>
    `[${category}, p${priority}] ${text}`;
  const activeGoalSeen = new Set<string>();
  const pushActiveGoalUnique = (category: string, priority: number, text: string, out: string[]) => {
    const line = formatActiveGoalLine(category, priority, text);
    const key = normalizeText(line);
    if (activeGoalSeen.has(key)) return;
    activeGoalSeen.add(key);
    out.push(line);
  };
  const active_goals: string[] = [];
  if (winner.matchedGoal) {
    pushActiveGoalUnique(winner.matchedGoal.category, winner.matchedGoal.priority, winner.matchedGoal.text, active_goals);
  }
  for (const g of userGoals ?? []) {
    pushActiveGoalUnique(g.goal_category, g.priority, g.goal_text, active_goals);
    if (active_goals.length >= 5) break;
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
  const isEntityLinkedDiscrepancy = winner.type === 'discrepancy' && !isGoalLinkedDiscrepancy;

  // Use that as the primary source — it is more reliable than signal sender history.
  const hasRecipientEmailInContext = surgical_raw_facts.some((f) => {
    if (!f.startsWith('recipient_email:')) return false;
    const email = f.slice('recipient_email: '.length).trim().toLowerCase();
    return !userEmails || userEmails.size === 0 || !userEmails.has(email);
  });

  // For entity-linked discrepancies, ONLY the entity's DB email counts as a confirmed
  // recipient. Signal senders in the evidence window are unrelated parties, not the
  // target person — using them causes the LLM to address emails to random senders.
  const has_real_recipient = (isGoalLinkedDiscrepancy || isEntityLinkedDiscrepancy)
    // Discrepancy (goal-linked or entity-linked): only entity-db email counts
    ? hasRecipientEmailInContext
    // Non-discrepancy (commitment, signal, relationship): entity-db email OR signal senders
    : (hasRecipientEmailInContext || externalEmails.length > 0);

  // Check signal freshness — union of hydrated supporting_signals and scorer refs (AZ-24 slice 2)
  const newestSignalMs = getNewestEvidenceTimestampMs(supporting_signals, winner.sourceSignals);
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

  const candidate_context_enrichment = enrichCandidateContext(winner, sorted);

  return {
    selected_candidate: selectedCandidate,
    candidate_class: winner.type,
    candidate_title: winner.title,
    candidate_reason:
      winner.relatedSignals.slice(0, 5).join('; ').slice(0, 800) || winner.content.slice(0, 200),
    candidate_goal: winner.matchedGoal
      ? `${winner.matchedGoal.text} [${winner.matchedGoal.category}, p${winner.matchedGoal.priority}]`
      : null,
    candidate_score: winner.score,
    candidate_due_date,
    supporting_signals,
    candidate_context_enrichment,
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
    user_full_name: names.user_full_name,
    user_first_name: names.user_first_name,
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
    relationship_timeline: buildRelationshipTimeline(
      signalEvidence,
      (winner.type === 'discrepancy' && winner.discrepancyClass === 'decay' && winner.entityName)
        ? winner.entityName
        : winner.title,
    ),
    response_pattern_lines,
    competition_context: competitionContext ?? null,
    confidence_prior: winner.confidence_prior,
    required_causal_diagnosis,
    trigger_context:
      winner.type === 'discrepancy' && winner.discrepancyClass && winner.trigger
        ? buildTriggerContextBlock(winner.discrepancyClass, winner.trigger, {
            evidenceJson: winner.discrepancyEvidence ?? null,
          })
        : null,
    recipient_brief: (() => {
      if (!has_real_recipient) return null;
      const brief = buildRecipientBrief(winner.relationshipContext ?? null, signalEvidence);
      if (brief) return brief;
      if (winner.type === 'discrepancy' && winner.discrepancyClass === 'decay') {
        return buildDecayRecipientBriefFromEntity(winner, signalEvidence);
      }
      return null;
    })(),
    discrepancy_class:
      winner.discrepancyClass ??
      (winner.id.startsWith('discrepancy_conflict_') ? 'schedule_conflict' : null),
    insight_scan_winner: Boolean(winner.fromInsightScan),
    candidate_analysis: buildCandidateAnalysisBlock(winner),
    entity_analysis: buildEntityAnalysisBlock(winner.entityName, winner.entityBxStats),
    entity_conversation_state: entityConversationState ?? null,
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
 * Build a per-entity conversation state block for the LLM prompt.
 *
 * Scans already-fetched signalEvidence (sent/received) for threads involving
 * `entityName`, then supplements with recently approved send_message tkg_actions
 * to cover Foldera-approved emails that haven't synced back into tkg_signals yet.
 *
 * Returns null when no outbound email to this entity is found in the last 30 days
 * (nothing to report, no SENT_AWAITING_REPLY risk).
 */
export async function buildEntityConversationState(
  userId: string,
  entityName: string,
  signalEvidence: SignalSnippet[],
): Promise<string | null> {
  const nameLower = entityName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const nameTokens = nameLower.split(/\s+/).filter((t) => t.length >= 3);
  if (nameTokens.length === 0) return null;

  const thirtyDaysAgo = Date.now() - daysMs(30);

  // --- Step 1: scan signal evidence for sent/received emails involving this entity ---
  type ThreadEvent = { date: string; dateMs: number; direction: 'sent' | 'received'; subject: string | null };
  const events: ThreadEvent[] = [];

  for (const s of signalEvidence) {
    if (s.direction !== 'sent' && s.direction !== 'received') continue;
    const dateMs = new Date(s.date).getTime();
    if (isNaN(dateMs) || dateMs < thirtyDaysAgo) continue;
    const authorLower = (s.author ?? '').toLowerCase();
    const subjectLower = (s.subject ?? '').toLowerCase();
    const snippetLower = s.snippet.toLowerCase();
    const matches = nameTokens.some(
      (t) => authorLower.includes(t) || subjectLower.includes(t) || snippetLower.includes(t),
    );
    if (!matches) continue;
    events.push({ date: s.date, dateMs, direction: s.direction, subject: s.subject ?? null });
  }

  // --- Step 2: supplement with approved send_message tkg_actions (sync-lag coverage) ---
  try {
    const supabase = createServerClient();
    const fourteenDaysAgo = new Date(Date.now() - daysMs(14)).toISOString();
    const { data: actionRows } = await supabase
      .from('tkg_actions')
      .select('directive_text, generated_at')
      .eq('user_id', userId)
      .eq('action_type', 'send_message')
      .in('status', ['approved', 'executed'])
      .gte('generated_at', fourteenDaysAgo)
      .order('generated_at', { ascending: false })
      .limit(10);

    for (const row of actionRows ?? []) {
      const text = (row.directive_text as string ?? '').toLowerCase();
      const matches = nameTokens.some((t) => text.includes(t));
      if (!matches) continue;
      const dateMs = new Date(row.generated_at as string).getTime();
      if (isNaN(dateMs)) continue;
      const date = new Date(row.generated_at as string).toISOString().slice(0, 10);
      // Extract a rough subject from the directive_text first non-empty line
      const firstLine = (row.directive_text as string ?? '')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0)
        ?.slice(0, 80) ?? null;
      // Only add if not already covered by signal evidence on the same date
      const alreadyCovered = events.some(
        (e) => e.direction === 'sent' && e.date.slice(0, 10) === date,
      );
      if (!alreadyCovered) {
        events.push({ date, dateMs, direction: 'sent', subject: firstLine });
      }
    }
  } catch {
    // Non-blocking — continue with signal-evidence-only data
  }

  if (events.length === 0) return null;

  // Sort chronologically
  events.sort((a, b) => a.dateMs - b.dateMs);

  // Find the most recent sent email
  const sentEvents = events.filter((e) => e.direction === 'sent');
  if (sentEvents.length === 0) return null;
  const lastSent = sentEvents[sentEvents.length - 1];

  // Find the first received email after lastSent
  const lastReply = events.find(
    (e) => e.direction === 'received' && e.dateMs > lastSent.dateMs,
  ) ?? null;

  const daysSinceLastSent = Math.round((Date.now() - lastSent.dateMs) / (1000 * 60 * 60 * 24));
  const awaitingReply = !lastReply;

  const subjectLine = lastSent.subject ? ` — "${lastSent.subject}"` : '';
  const replyLine = lastReply
    ? `Last reply received: ${lastReply.date.slice(0, 10)}${lastReply.subject ? ` — "${lastReply.subject}"` : ''}`
    : `Last reply received: No reply in signals`;

  return (
    `CONVERSATION_STATE with ${entityName}:\n` +
    `- Last email sent: ${lastSent.date.slice(0, 10)}${subjectLine}\n` +
    `- ${replyLine}\n` +
    `- Days since last sent: ${daysSinceLastSent}\n` +
    `- SENT_AWAITING_REPLY: ${awaitingReply}`
  );
}

/**
 * Build a dynamic identity context string from the user's top goals.
 * This gives the LLM a sense of who the user is and what matters to them,
 * so it can distinguish high-value directives from low-value housekeeping.
 * Never hardcodes user-specific text — derived entirely from tkg_goals.
 */
export function buildUserIdentityContext(
  goals: Array<{ goal_text: string; priority: number; goal_category: string }>,
): string | null {
  console.log(`[generator] buildUserIdentityContext: ${goals.length} goals received`);
  if (goals.length === 0) return null;

  const lines: string[] = [];
  // Top goals become identity lines
  for (const g of goals.slice(0, 4)) {
    lines.push(`- [${g.goal_category}, priority ${g.priority}] ${g.goal_text}`);
  }

  return `USER CONTEXT (internal briefing — do not paste this block into the user-facing email):
The user's stated priorities:
${lines.join('\n')}
- Use these to infer legitimate, evidence-aligned connections (employer, role, pipeline, applications) when the thread and recipient support it. Do not fabricate links the signals do not support.
- Do not paste meta phrasing from this block into the email body. The final email must still follow SEND_MESSAGE_ARTIFACT_RULES (no banned words like "goal" or "signal" in the message text).
- Use these to detect contradictions: if signal velocity goes elsewhere, that's a finding.
- Directives about tool configuration, account settings, internal system maintenance, or generic productivity are NOISE — the scorer should not have selected them; render only the CANONICAL_ACTION with evidence-grounded content, never a substitute wait_rationale.
- Look for gaps between these stated priorities and what the user is actually doing in their signals. That gap IS the insight.`;
}

/** Shared GOAL_GAP_ANALYSIS block for long and recipient-short prompt paths. */
function formatGoalGapAnalysisBlock(goalGapAnalysis: GoalGapEntry[] | undefined): string | null {
  if (!goalGapAnalysis || goalGapAnalysis.length === 0) return null;
  const gapLines = goalGapAnalysis.map((g) => {
    const density = `${g.signal_count_14d} signals (14d) / ${g.signal_count_30d} (30d) / ${g.signal_count_90d} (90d)`;
    const extras = g.commitment_count > 0 ? ` ${g.commitment_count} open commitment${g.commitment_count !== 1 ? 's' : ''}.` : '';
    return `[p${g.priority}] ${g.goal_text}\n  → Signal density: ${density}. Actions completed 14d: ${g.action_count_14d}.${extras}\n  → Gap: ${g.gap_level} — ${g.gap_description}`;
  });
  return (
    `GOAL_GAP_ANALYSIS:\nBehavioral divergence between stated priorities and actual signal density over 14/30/90 days.\nYour primary question: which goal has the biggest gap? Start there. Find the one finished artifact that closes the most important gap.\n\n${gapLines.join('\n\n')}`
  );
}

// ---------------------------------------------------------------------------
// Part 4 — Evidence gating (before LLM call)
// ---------------------------------------------------------------------------

// checkGenerationEligibility was removed — it was dead code (never called).
// Eligibility is determined by DecisionPayload validation (validateDecisionPayload).

// ---------------------------------------------------------------------------
// Part 2 continued — Build prompt from structured context
// ---------------------------------------------------------------------------

/**
 * Parse winner.relationshipContext into a concise human-readable recipient block.
 * Format of relationshipContext line: "- Name <email> (role, company, N interactions): pattern"
 * Used by the send_message minimal-prompt path to give the LLM a clean person description
 * instead of a wall of system metrics.
 */
function buildRecipientBrief(
  relationshipContext: string | null,
  signalEvidence: SignalSnippet[],
): string | null {
  if (!relationshipContext) return null;

  const firstLine = relationshipContext.split('\n')[0].replace(/^-\s*/, '');

  const nameMatch = firstLine.match(/^([^<(]+)/);
  const name = nameMatch ? nameMatch[1].trim() : null;
  if (!name || name.toLowerCase() === 'unknown') return null;

  const emailMatch = firstLine.match(/<([^@\s>]+@[^@\s>]+\.[^@\s>]+)>/);
  const email = emailMatch ? emailMatch[1] : null;

  // Extract role/company from parens, stripping the "N interactions" count
  const parenMatch = firstLine.match(/\(([^)]+)\)/);
  let roleCompany: string | null = null;
  if (parenMatch) {
    const parts = parenMatch[1].split(',').map((p) => p.trim());
    const nonInteraction = parts.filter((p) => !/^\d+\s+interaction/.test(p));
    if (nonInteraction.length > 0) roleCompany = nonInteraction.join(', ');
  }

  // Extract relationship description (text after closing paren colon)
  const patternMatch = firstLine.match(/\):\s*(.+)$/);
  const pattern = patternMatch ? patternMatch[1].trim() : null;

  // Last contact from most recent signal date
  const sortedDates = signalEvidence
    .map((s) => s.date)
    .filter(Boolean)
    .sort()
    .reverse();
  const lastContactDate = sortedDates.length > 0
    ? new Date(sortedDates[0]).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const lines: string[] = [`${name}${email ? ` <${email}>` : ''}`];
  if (roleCompany) lines.push(`Role: ${roleCompany}`);
  if (lastContactDate) lines.push(`Last contact: ${lastContactDate}`);
  if (pattern) lines.push(`Context: ${pattern}`);

  const intelTail = relationshipContext.split(/\r?\n/).slice(1).join('\n').trim();
  if (intelTail) {
    lines.push(`Relationship intel (signals, response patterns, linked goals/commitments):\n${intelTail.slice(0, 3800)}`);
  }

  return lines.join('\n');
}

/**
 * Minimal recipient block for decay discrepancy when `buildRecipientBrief` returns null
 * (e.g. name parse edge cases) but relationshipContext still has a confirmed entity email.
 * Keeps the short email prompt path so CONVERGENT_ANALYSIS / CONVICTION_MATH are not injected.
 */
function buildDecayRecipientBriefFromEntity(
  winner: ScoredLoop,
  signalEvidence: SignalSnippet[],
): string | null {
  if (winner.type !== 'discrepancy' || winner.discrepancyClass !== 'decay') return null;
  const rc = winner.relationshipContext?.trim();
  if (!rc) return null;

  const firstLine = rc.split('\n')[0].replace(/^-\s*/, '');
  const emailMatch = firstLine.match(/<([^@\s>]+@[^@\s>]+\.[^@\s>]+)>/);
  const email = emailMatch ? emailMatch[1] : null;
  if (!email) return null;

  let displayName =
    (winner.entityName?.trim()) ||
    ((): string | null => {
      const idx = winner.title.lastIndexOf(':');
      if (idx >= 0 && idx < winner.title.length - 1) {
        return winner.title.slice(idx + 1).trim();
      }
      return null;
    })();
  if (!displayName || displayName.toLowerCase() === 'unknown') {
    displayName = email.split('@')[0] ?? 'Contact';
  }

  const sortedDates = signalEvidence
    .map((s) => s.date)
    .filter(Boolean)
    .sort()
    .reverse();
  const lastContactDate = sortedDates.length > 0
    ? new Date(sortedDates[0]).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const lines: string[] = [`${displayName} <${email}>`];
  if (lastContactDate) lines.push(`Last contact: ${lastContactDate}`);
  const intelTail = rc.split(/\r?\n/).slice(1).join('\n').trim();
  if (intelTail) {
    lines.push(`Relationship intel (signals, response patterns, linked goals/commitments):\n${intelTail.slice(0, 3800)}`);
  }
  return lines.join('\n');
}

function extractDecayEntityAnchors(winner: ScoredLoop): { emails: string[]; tokens: string[] } {
  const emails: string[] = [];
  if (winner.relationshipContext) {
    const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(winner.relationshipContext)) !== null) {
      emails.push(m[0].toLowerCase());
    }
  }
  const nameSource =
    (winner.entityName ?? '').trim()
    || (winner.title.includes(':') ? winner.title.split(':').pop()?.trim() ?? '' : '');
  const tokens: string[] = [];
  for (const w of nameSource.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (w.length >= 3) tokens.push(w);
  }
  return { emails: [...new Set(emails)], tokens: [...new Set(tokens)] };
}

function signalSnippetMatchesDecayEntity(
  s: SignalSnippet,
  anchors: { emails: string[]; tokens: string[] },
): boolean {
  const hay = `${s.author ?? ''} ${s.subject ?? ''} ${s.snippet}`.toLowerCase();
  if (anchors.emails.some((e) => hay.includes(e))) return true;
  if (anchors.tokens.length === 0) return false;
  const hits = anchors.tokens.filter((t) => hay.includes(t));
  return anchors.tokens.length >= 2 ? hits.length >= 2 : hits.length >= 1;
}

export function buildPromptFromStructuredContext(
  ctx: StructuredContext,
  committedArtifactType?: ValidArtifactTypeCanonical,
): string {
  const preamble = committedArtifactType
    ? `${buildCanonicalActionPreamble(committedArtifactType).trim()}\n\n`
    : '';
  const insightScanBanner = ctx.insight_scan_winner
    ? `INSIGHT_SCAN_WINNER:\nThe scorer elevated a candidate from the Insight Scan (unsupervised pattern read across raw signals — not a structural gap checklist). Follow INSIGHT_SCAN_WINNER rules in the system prompt.\n\n`
    : '';
  const responsePatternSection = buildResponsePatternPromptBlock(ctx.response_pattern_lines ?? []);
  const sections: string[] = [];
  const wantPhrase = ctx.user_first_name.trim()
    ? `One clear sentence about what ${ctx.user_first_name} wants or is sharing`
    : `One clear sentence about what you want or are sharing`;
  const senderFromLine = `You are drafting a real email from ${ctx.user_full_name} to a specific person.`;
  const authenticSendLine = ctx.user_first_name.trim()
    ? `The email must be something ${ctx.user_first_name} would actually send without editing. If context is thin, keep it short and genuine rather than long and vague.\n\n`
    : `The email must be something the user would actually send without editing. If context is thin, keep it short and genuine rather than long and vague.\n\n`;
  const exampleTone =
    '"Hi [Name], I wanted to follow up on our conversation last week about the project timeline. ' +
    'Can you confirm the revised deadline works on your end? Thanks, [User]"';

  // For send_message with a confirmed external recipient: strip all system metrics and pipeline
  // labels. The LLM should see the person and the signals — not discrepancy classes, signal
  // density numbers, causal diagnosis mechanisms, or scorer breakdowns.
  if (ctx.has_real_recipient && ctx.recipient_brief) {
    const m: string[] = [];
    const isDecayReconnect =
      ctx.candidate_class === 'discrepancy' && ctx.discrepancy_class === 'decay';

    m.push(
      `Write an email from the user to:\n${ctx.recipient_brief}\n\nTODAY: ${today()}`,
    );

    // Recipient-short path used to omit TRIGGER_CONTEXT — discrepancy decay then had no delta/why_now.
    if (ctx.trigger_context) {
      m.push(ctx.trigger_context);
    }

    // Same goal / gap material as long path so decay and send_message can cross-link (e.g. employer + applications).
    if (ctx.user_identity_context) {
      m.push(ctx.user_identity_context);
    }
    const recipientShortGoalGap = formatGoalGapAnalysisBlock(ctx.goal_gap_analysis);
    if (recipientShortGoalGap) {
      m.push(recipientShortGoalGap);
    }
    const shortPathGoals = ctx.active_goals ?? [];
    if (shortPathGoals.length > 0) {
      m.push(`ACTIVE_GOALS:\n${shortPathGoals.map((g) => `- ${g}`).join('\n')}`);
    }

    if (isDecayReconnect) {
      m.push(ctx.candidate_analysis);
      if (ctx.entity_analysis) {
        m.push(ctx.entity_analysis);
      }
      m.push(`CANDIDATE_TITLE:\n${ctx.candidate_title}`);
      m.push(`CANDIDATE_CLASS:\n${ctx.candidate_class}`);
      m.push(`CANDIDATE_EVIDENCE:\n${ctx.selected_candidate}`);
      if (ctx.candidate_context_enrichment) {
        m.push(ctx.candidate_context_enrichment);
      }
      if (ctx.behavioral_mirrors.length > 0) {
        m.push(
          `BEHAVIORAL_MIRROR:\nThese patterns were detected in the user's behavior. You may reference them in your artifact if they are directly relevant to the candidate. Do not invent additional patterns.\n\n` +
            ctx.behavioral_mirrors.map((mir, i) => `${i + 1}. ${mir}`).join('\n\n'),
        );
      }
      if (ctx.avoidance_observations.length > 0) {
        const obsLines = ctx.avoidance_observations.map((o, i) => {
          const badge = o.severity === 'high' ? '[HIGH]' : '[MEDIUM]';
          return `${i + 1}. ${badge} ${o.observation}`;
        });
        m.push(
          `AVOIDANCE_SIGNALS (pre-computed facts — reference directly, do not rephrase):\n` +
            obsLines.join('\n'),
        );
      }
      if (ctx.supporting_signals.length > 0) {
        const signalLines = ctx.supporting_signals.map((s) => {
          const dirLabel = s.direction === 'sent' ? '[SENT]' : s.direction === 'received' ? '[RECEIVED]' : '';
          const entityPart = s.entity ? ` ${s.direction === 'sent' ? 'To' : 'From'}: ${s.entity}` : '';
          return `- [${s.occurred_at}] [${s.source}]${dirLabel ? ` ${dirLabel}` : ''}${entityPart} ${s.summary}`;
        });
        m.push(`SUPPORTING_SIGNALS:\n${signalLines.join('\n')}`);
      }
    } else if (ctx.supporting_signals.length > 0) {
      const signalLines = ctx.supporting_signals.slice(0, 8).map((s) => {
        const dir = s.direction === 'sent' ? '[You →]' : s.direction === 'received' ? '[← Them]' : '';
        return `- ${s.occurred_at}${dir ? ` ${dir}` : ''} ${s.summary}`;
      });
      m.push(`RECENT SIGNALS:\n${signalLines.join('\n')}`);
    }

    if (ctx.relationship_timeline) {
      m.push(ctx.relationship_timeline);
    }

    if (responsePatternSection) {
      m.push(responsePatternSection);
    }

    if (ctx.competition_context) {
      m.push(ctx.competition_context);
    }

    if (isDecayReconnect) {
      m.push(
        `DECAY_RECONNECTION_RULE (mandatory for this candidate):\n` +
        `- Do NOT write "it's been a while", "been a while", "just checking in", "touching base", or generic check-in language.\n` +
        `- The email MUST reference something specific from your last real interaction with this person (subject, topic, commitment, or thread — from RECENT SIGNALS / relationship context above).\n` +
        `- You MUST give a concrete reason this reconnection matters NOW (not only that time passed).\n` +
        `- You MUST include one specific ask or topic that fits what they can actually help with (role, past thread, or goal link above).\n` +
        `- Do NOT pivot to unrelated financial, benefits, or third-party threads not involving this recipient.\n` +
        `- If you cannot ground the email in at least one specific fact from the provided context, output decision "HOLD" with artifact_type do_nothing — generic reconnection emails are worse than no email. (System DECAY_RECONNECTION EXCEPTION allows do_nothing here.)`,
      );
    }

    if (ctx.already_sent_14d.length > 0) {
      m.push(
        `ALREADY SENT — do not repeat these:\n` +
        ctx.already_sent_14d.map((s) => `- ${s}`).join('\n'),
      );
    }

    if (ctx.entity_conversation_state) {
      m.push(ctx.entity_conversation_state);
      m.push(
        `CONVERSATION_STATE_RULE: If SENT_AWAITING_REPLY is true, you MUST identify a genuinely ` +
        `new angle (new information, escalated urgency, or a different specific ask) not covered ` +
        `in the prior email shown above. If you cannot identify one from the provided signals, ` +
        `output do_nothing with artifact_type=do_nothing and reason='waiting_for_reply'.`,
      );
    }

    if (ctx.recent_action_history_7d.length > 0) {
      m.push(`RECENT_ACTIONS_7D:\n${ctx.recent_action_history_7d.map((a) => `- ${a}`).join('\n')}`);
    }

    m.push(
      `CONFIDENCE_PRIOR: ${ctx.confidence_prior}\n` +
      `Your output confidence must stay within ±15 of this prior. Do not exceed 95.`,
    );

    m.push(
      `SEND_MESSAGE_ARTIFACT_RULES (apply these before writing a single word):\n\n` +
      `${senderFromLine}\n` +
      `Write it exactly as a competent professional would write it. Short. Warm but not gushing. Clear reason for writing. One ask or one piece of information. No filler.\n\n` +
      `NEVER include:\n` +
      `- Any line copied from ENTITY_ANALYSIS, CANDIDATE_ANALYSIS, or TRIGGER_CONTEXT baselines/deltas (interaction counts, "/14d", velocity_ratio, arrows like "→", or "X interactions in Y days")\n` +
      `- Metrics, percentages, or system language ("52% drop", "signal density", "goal-aligned activity")\n` +
      `- "Decision required by" or deadline ultimatums that sound like a system alert\n` +
      `- "Can you confirm" as an opener\n` +
      `- Any language that sounds like a dashboard alert or automated report\n` +
      `- The word "goal", "commitment", "discrepancy", "signal", or "artifact"\n` +
      `- Any reference to Foldera or the system generating this email\n` +
      `- Any fabricated professional relationship, shared project, or organizational role that does not appear in the signal data\n\n` +
      (isDecayReconnect
        ? `GROUNDING RULE (decay): Every sentence must cite facts from RECENT SIGNALS, TRIGGER_CONTEXT, or relationship lines above. ` +
          `If there is not enough specific context to meet DECAY_RECONNECTION_RULE, output do_nothing — never send a generic reconnect.\n\n`
        : `GROUNDING RULE (mandatory): Every sentence in the email must reference only facts that are explicitly present in the signals and entity history provided above. ` +
          `Do NOT invent a shared project, shared employer, budget discussion, organizational membership, or working relationship that is not documented in the signals. ` +
          `If the signal data does not contain enough context for a specific reason to reconnect, write a simple warm check-in with no fabricated premise — do not invent one.\n\n`) +
      `ALWAYS include:\n` +
      `- A natural greeting using their first name\n` +
      `- A specific reason for reaching out tied to real context (their role, a past interaction, a shared project, a job posting, a recent event)\n` +
      `- ${wantPhrase}\n` +
      `- A warm close\n\n` +
      `Example tone (do not copy verbatim — adapt every detail to the actual context from the signals; [Name] and [User] are placeholders only):\n` +
      `${exampleTone}\n\n` +
      authenticSendLine +
      `SEND_MESSAGE_QUALITY_BAR (mandatory — every requirement must pass):\n` +
      `1. FIRST SENTENCE: Must reference one specific fact from the signals — a date, a named outcome, a prior message, or a concrete request. ` +
      `Do not open with context-setting, pleasantries, or "I wanted to reach out." Start on the situation.\n` +
      `2. ASK: State the ask explicitly in one sentence. Not implied. Not buried. The recipient knows exactly what to do.\n` +
      `3. CONCISE: ≤ 150 words unless the situation genuinely demands more. Cut anything that does not move the email forward.\n` +
      `4. NO FILLER: No banned phrases. No restatement of context the recipient already has. No closing padding.\n` +
      `5. VOICE: Write as if the user is sending it themselves, not as an assistant drafting for them.`,
    );

    m.push(
      'CRITICAL: Use ONLY real names, emails, dates, and details from the context above. ' +
      'NEVER use bracket placeholders like [Name], [Company], [Date]. ' +
      'If a detail is unknown, write around it. Every field must contain real content. ' +
      'For the "to" field: use ONLY the email address shown in angle brackets <email@domain.com> in the recipient line at the top of this prompt. ' +
      'Do NOT use any email address from the signals — those are senders, not recipients. ' +
      'Do NOT use the user\'s own email address. ' +
      'If the recipient line has NO email address in angle brackets, output write_document instead of send_message. ' +
      'NEVER invent a person\'s name or email.\n\n' +
      (isDecayReconnect
        ? 'BANNED PHRASES — if you write an email, rewrite until none of these appear in the opener/body: ' +
          '"just checking in", "touching base", "wanted to reach out", "reaching out to you today", ' +
          '"following up" without an immediate specific reference, "I hope this email finds you well", ' +
          '"hope you\'re doing well" as an opener, "as per my last email", "circling back", ' +
          'any opener that does not anchor to this person\'s thread in the signals above. ' +
          'If DECAY_RECONNECTION_RULE cannot be satisfied with grounded facts about this recipient, output do_nothing (do not invent context).\n'
        : 'BANNED PHRASES FINAL CHECK — scan your output before returning. If any of these appear, rewrite the email until none remain. Do NOT output do_nothing:\n' +
          '"just checking in", "touching base", "wanted to reach out", "reaching out to you today", ' +
          '"following up" without an immediate specific reference, "I hope this email finds you well", ' +
          '"hope you\'re doing well" as an opener, "as per my last email", "circling back", ' +
          'any opener that does not anchor to the specific situation in the signals above.'),
    );

    return `${preamble}${insightScanBanner}${m.join('\n\n')}`;
  }

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
  const longPathGoalGap = formatGoalGapAnalysisBlock(ctx.goal_gap_analysis);
  if (longPathGoalGap) {
    sections.push(longPathGoalGap);
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

  if (ctx.candidate_context_enrichment) {
    sections.push(ctx.candidate_context_enrichment);
  }

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

  sections.push(ctx.candidate_analysis);
  if (ctx.entity_analysis) {
    sections.push(ctx.entity_analysis);
  }
  if (responsePatternSection) {
    sections.push(responsePatternSection);
  }

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

  if (ctx.entity_conversation_state) {
    sections.push(ctx.entity_conversation_state);
    sections.push(
      `CONVERSATION_STATE_RULE: If SENT_AWAITING_REPLY is true, you MUST identify a genuinely ` +
      `new angle (new information, escalated urgency, or a different specific ask) not covered ` +
      `in the prior email shown above. If you cannot identify one from the provided signals, ` +
      `output do_nothing with artifact_type=do_nothing and reason='waiting_for_reply'.`,
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
    const decayLongPath =
      ctx.candidate_class === 'discrepancy' && ctx.discrepancy_class === 'decay';
    sections.push(
      (decayLongPath
        ? `DECAY_RECONNECTION_RULE:\n` +
          `- Do NOT use "it's been a while" / generic check-in. Anchor to last interaction, concrete why-now, specific ask tied to their utility.\n` +
          `- If context is too thin for that, output do_nothing.\n\n`
        : '') +
      `ARTIFACT_PREFERENCE: send_message is required — a real recipient email is in the signals above.\n\n` +
      `SEND_MESSAGE_ARTIFACT_RULES (apply these before writing a single word):\n\n` +
      `${senderFromLine}\n` +
      `Write it exactly as a competent professional would write it. Short. Warm but not gushing. Clear reason for writing. One ask or one piece of information. No filler.\n\n` +
      `NEVER include:\n` +
      `- Any line copied from ENTITY_ANALYSIS, CANDIDATE_ANALYSIS, or TRIGGER_CONTEXT baselines/deltas (interaction counts, "/14d", velocity_ratio, arrows like "→", or "X interactions in Y days")\n` +
      `- Metrics, percentages, or system language ("52% drop", "signal density", "goal-aligned activity")\n` +
      `- "Decision required by" or deadline ultimatums that sound like a system alert\n` +
      `- "Can you confirm" as an opener\n` +
      `- Any language that sounds like a dashboard alert or automated report\n` +
      `- The word "goal", "commitment", "discrepancy", "signal", or "artifact"\n` +
      `- Any reference to Foldera or the system generating this email\n` +
      `- Any fabricated professional relationship, shared project, or organizational role that does not appear in the signal data\n\n` +
      `GROUNDING RULE (mandatory): Every sentence in the email must reference only facts that are explicitly present in the signals and entity history provided above. ` +
      `Do NOT invent a shared project, shared employer, budget discussion, organizational membership, or working relationship that is not documented in the signals. ` +
      `If the signal data does not contain enough context for a specific reason to reconnect, write a simple warm check-in with no fabricated premise — do not invent one.\n\n` +
      `ALWAYS include:\n` +
      `- A natural greeting using their first name\n` +
      `- A specific reason for reaching out tied to real context (their role, a past interaction, a shared project, a job posting, a recent event)\n` +
      `- ${wantPhrase}\n` +
      `- A warm close\n\n` +
      `Example tone (do not copy verbatim — adapt every detail to the actual context from the signals; [Name] and [User] are placeholders only):\n` +
      `${exampleTone}\n\n` +
      authenticSendLine +
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

  const isScheduleConflictPrompt =
    ctx.discrepancy_class === 'schedule_conflict' ||
    (ctx.candidate_class === 'discrepancy' &&
      /\boverlapping events on \d{4}-\d{2}-\d{2}\b/i.test(ctx.candidate_title));
  if (isScheduleConflictPrompt) {
    sections.push(
      'SCHEDULE_CONFLICT_RULE: The two events overlap. Your only job is to produce a ready-to-send message from the user to the relevant person(s) proposing a resolution. Subject line, body, send-ready. Do NOT produce: Objective: blocks, Execution Notes: blocks, questions directed at the user, contact dumps, numbered owner steps, or planning notes. If no real external recipient exists in the overlapping events, output do_nothing.',
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

  return `${preamble}${insightScanBanner}${sections.join('\n\n')}`;
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
// entity conflict suppression. The user's own name in a greeting line must never
// block a new directive as a false "entity" match.
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

    // Generic email-local name hint: split on . and -, longest alphabetic token (3+ chars, strip trailing digits).
    const emailLocal = (user.email ?? '').split('@')[0] ?? '';
    const segments = emailLocal.split(/[.\-]+/).filter(Boolean);
    let bestLocal: string | null = null;
    let bestLocalLen = 0;
    for (const seg of segments) {
      const alpha = seg.replace(/\d+$/, '').toLowerCase();
      if (alpha.length >= 3 && alpha.length >= bestLocalLen) {
        if (alpha.length > bestLocalLen) {
          bestLocalLen = alpha.length;
          bestLocal = alpha;
        }
      }
    }
    if (bestLocal) {
      selfTokens.add(bestLocal);
    }

    const combined = `${metaName} ${emailLocal}`;
    // Split on whitespace, dots, underscores, hyphens, and digits (metadata + full local part).
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
    // Handles auth metadata missing first name (email local part yields a surname-length token).
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
  /\bit(?:'|’)?s been a while\b/i,
  /\bbeen a while\b/i,
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
  /\bcould (?:we|you)\b/i,
  /\bwould you\b/i,
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
  /\boverlapp(?:ing|ed)?\b/i,
  /\bdouble[- ]book/i,
  /\b(?:calendar|schedule)\s+conflict\b/i,
  /\bconflict\b/i,
  /\bconflicting\s+events?\b/i,
  /\bsame\s+time\b/i,
  /\btrade[-‐‑–—]?\s*off\b/u,
  /\bwhich\s+(?:takes\s+priority|(?:event|meeting)\s+wins)\b/i,
];

const OWNERSHIP_PATTERNS = [
  /\bowner\b/i,
  /\baccountable\b/i,
  /\bresponsible\b/i,
  /\bassign\b/i,
  /\byour\s+(?:calendar|schedule)\b/i,
  /\bI(?:'m| am)\s+.{0,60}(?:double[\s-]?book(?:ed)?|overlap(?:ping)?|conflict(?:ing)?)\b/i,
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
  discrepancyClass?: string | null;
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

  let out = [...new Set(issues)];
  // Decay reconnect emails are timed to relationship silence — not deadline/consequence memos.
  if (input.discrepancyClass === 'decay' && normalizedType === 'send_message') {
    out = out.filter(
      (i) =>
        i !== 'decision_enforcement:missing_time_constraint' &&
        i !== 'decision_enforcement:missing_pressure_or_consequence',
    );
  }
  return out;
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
  briefContextDebug?: { active_goals?: string[] },
): GenerationRunLog {
  return {
    outcome: 'selected',
    stage: 'generation',
    reason: candidateDiscovery?.selectionReason ?? 'Directive generated successfully.',
    candidateFailureReasons: (candidateDiscovery?.topCandidates ?? [])
      .filter((c) => c.decision === 'rejected')
      .map((c) => c.decisionReason),
    candidateDiscovery,
    ...(briefContextDebug?.active_goals?.length
      ? { brief_context_debug: { active_goals: briefContextDebug.active_goals } }
      : {}),
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
        const record = entity as Record<string, unknown>;
        const bx = parseBxStatsFromPatterns(record.patterns);
        const bxField = bx ? { entityBxStats: bx } : {};
        const nameForIntel = isNonEmptyString(record.display_name)
          ? record.display_name.trim()
          : isNonEmptyString(record.name)
            ? record.name.trim()
            : '';
        let merged = line;
        if (nameForIntel) {
          try {
            const intel = await enrichRelationshipContext(userId, nameForIntel, undefined);
            if (intel.trim()) merged = `${line}\n${intel}`;
          } catch {
            // non-blocking
          }
        }
        return { ...winner, relationshipContext: merged, ...bxField };
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
  const isDecayDiscrepancy =
    winner.type === 'discrepancy' && winner.discrepancyClass === 'decay';

  const sourceIds = (winner.sourceSignals ?? [])
    .map((s) => s.id)
    .filter((id): id is string => Boolean(id));

  let snippets: SignalSnippet[] = [];

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

  // Decay: broad keyword scan pulls unrelated high-volume threads (e.g. benefits/finance).
  if (!isDecayDiscrepancy && keywords.length > 0 && snippets.length < 12) {
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

  // Decay discrepancy: scorer attaches synthetic sourceSignals (no tkg_signals.id). Without a deep
  // entity-targeted scan, evidence is empty and the 30-row fallback misses older threads in busy inboxes.
  if (isDecayDiscrepancy) {
    const anchors = extractDecayEntityAnchors(winner);
    const entityEmailsSet = new Set(anchors.emails);
    if (winner.relationshipContext) {
      const entityEmailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      let emailMatch: RegExpExecArray | null;
      while ((emailMatch = entityEmailPattern.exec(winner.relationshipContext)) !== null) {
        entityEmailsSet.add(emailMatch[0].toLowerCase());
      }
    }
    const entityEmails = [...entityEmailsSet];
    if (entityEmails.length > 0 || anchors.tokens.length > 0) {
      const lookbackIso = new Date(Date.now() - daysMs(SIGNAL_RETENTION_DAYS)).toISOString();
      const { data: decayRows } = await supabase
        .from('tkg_signals')
        .select('content, source, occurred_at, author, type')
        .eq('user_id', userId)
        .eq('processed', true)
        .gte('occurred_at', lookbackIso)
        .order('occurred_at', { ascending: false })
        .limit(500);

      const existingTexts = new Set(snippets.map((s) => s.snippet.slice(0, 60)));
      const DECAY_ENTITY_SNIPPET_CAP = 40;

      for (const row of decayRows ?? []) {
        if (snippets.length >= DECAY_ENTITY_SNIPPET_CAP) break;
        const decrypted = decryptWithStatus(row.content as string ?? '');
        if (decrypted.usedFallback) continue;
        const plain = decrypted.plaintext;
        const hay = plain.toLowerCase();
        let entityHit = entityEmails.some((email) => hay.includes(email));
        if (!entityHit && anchors.tokens.length > 0) {
          const hits = anchors.tokens.filter((t) => hay.includes(t));
          entityHit =
            anchors.tokens.length >= 2 ? hits.length >= 2 : hits.length >= 1;
        }
        if (!entityHit) continue;

        const parsed = parseSignalSnippet(plain, row);
        if (parsed && !existingTexts.has(parsed.snippet.slice(0, 60))) {
          snippets.push(parsed);
          existingTexts.add(parsed.snippet.slice(0, 60));
        }
      }

      // Derived reply-latency / unreplied-thread / RSVP lines (type response_pattern), entity-scoped.
      // 1) Explicit DB filter: author matches known entity emails (when stored on the row).
      // 2) Broad fetch + decrypt: content matches entity email/name (author may be a display name).
      const RESPONSE_PATTERN_DECAY_CAP = 20;
      const rpExisting = new Set(snippets.map((s) => s.snippet.slice(0, 60)));
      const ninetyRpIso = new Date(Date.now() - daysMs(90)).toISOString();
      let rpAdded = 0;

      if (entityEmails.length > 0) {
        const { data: rpAuthorRows } = await supabase
          .from('tkg_signals')
          .select('content, source, occurred_at, author, type')
          .eq('user_id', userId)
          .eq('type', 'response_pattern')
          .eq('processed', true)
          .in('author', entityEmails)
          .gte('occurred_at', ninetyRpIso)
          .order('occurred_at', { ascending: false })
          .limit(80);

        for (const row of rpAuthorRows ?? []) {
          if (rpAdded >= RESPONSE_PATTERN_DECAY_CAP) break;
          const decrypted = decryptWithStatus(row.content as string ?? '');
          if (decrypted.usedFallback) continue;
          const parsed = parseSignalSnippet(decrypted.plaintext, row);
          if (!parsed || rpExisting.has(parsed.snippet.slice(0, 60))) continue;
          snippets.push(parsed);
          rpExisting.add(parsed.snippet.slice(0, 60));
          rpAdded++;
        }
      }

      const { data: rpRows } = await supabase
        .from('tkg_signals')
        .select('content, source, occurred_at, author, type')
        .eq('user_id', userId)
        .eq('type', 'response_pattern')
        .eq('processed', true)
        .gte('occurred_at', ninetyRpIso)
        .order('occurred_at', { ascending: false })
        .limit(150);

      for (const row of rpRows ?? []) {
        if (rpAdded >= RESPONSE_PATTERN_DECAY_CAP) break;
        const decrypted = decryptWithStatus(row.content as string ?? '');
        if (decrypted.usedFallback) continue;
        const parsed = parseSignalSnippet(decrypted.plaintext, row);
        if (!parsed) continue;
        if (!signalSnippetMatchesDecayEntity(parsed, anchors)) continue;
        if (rpExisting.has(parsed.snippet.slice(0, 60))) continue;
        snippets.push(parsed);
        rpExisting.add(parsed.snippet.slice(0, 60));
        rpAdded++;
      }
    }
  }

  // Entity-targeted 90-day fetch: pull signals that mention the winner entity by email address
  // This gives the model a real relationship history beyond the 14-day window.
  // Decay uses the deep scan above instead of this shallow 30-row pass.
  if (!isDecayDiscrepancy && snippets.length < 8 && winner.relationshipContext) {
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

  if (isDecayDiscrepancy) {
    const anchors = extractDecayEntityAnchors(winner);
    if (anchors.emails.length > 0 || anchors.tokens.length > 0) {
      snippets = snippets.filter((s) => signalSnippetMatchesDecayEntity(s, anchors));
    }
  }

  return snippets;
}

function parseSignalSnippet(
  plaintext: string,
  row: Record<string, unknown>,
): SignalSnippet | null {
  const rowType = (row.type as string) ?? '';
  if (!plaintext || (plaintext.length < 20 && rowType !== 'response_pattern')) return null;

  let subject: string | null = null;
  const subjectMatch = plaintext.match(/(?:Subject|Re|Fwd):\s*(.+?)(?:\n|$)/i);
  if (subjectMatch) subject = subjectMatch[1].trim().slice(0, 120);

  const lines = plaintext.split('\n').filter((l) => l.trim().length > 0);
  const contentLines = lines.filter((l) => !l.match(/^(From|To|Date|Subject|Cc|Bcc|Re|Fwd):/i));
  const snippet = contentLines.join(' ').slice(0, 600).trim();

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
    row_type: rowType || null,
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

const LOW_CROSS_SIGNAL_ISSUE_PREFIX = 'low_cross_signal:';

/**
 * Single-thread revenue / reply paths (derived unreplied signals, open-thread discrepancies)
 * are already grounded in one concrete conversation; requiring two distinct cross-signal anchors
 * incorrectly forces wait_rationale. See plan: Outcome 1 thread-backed send_message.
 */
function shouldSkipLowCrossSignalForThreadBackedOutreach(ctx: StructuredContext): boolean {
  const lines = ctx.response_pattern_lines ?? [];
  if (lines.some((line) => /\bunreplied|no reply after\b/i.test(line))) {
    return true;
  }
  const dc = (ctx.discrepancy_class ?? '').toLowerCase();
  return dc === 'meeting_open_thread' || dc === 'document_followup_gap';
}

/** Grounding tokens from context: signal sources, entities, goals, recipient line — used to enforce cross-signal artifacts. */
function collectCrossSignalAnchors(ctx: StructuredContext): string[] {
  const set = new Set<string>();
  for (const s of ctx.supporting_signals) {
    const src = (s.source || '').trim().toLowerCase();
    if (src.length >= 3) set.add(src);
    const ent = (s.entity || '').trim().toLowerCase();
    if (ent.length >= 2) {
      set.add(ent);
      for (const w of ent.split(/\s+/)) {
        if (w.length >= 3) set.add(w);
      }
    }
  }
  for (const g of ctx.active_goals) {
    const gl = g.trim().toLowerCase();
    if (gl.length >= 4) set.add(gl);
    for (const w of gl.split(/\s+/)) {
      if (
        w.length >= 4 &&
        !['that', 'this', 'with', 'from', 'your', 'goal', 'career', 'health', 'other', 'land', 'work'].includes(w)
      ) {
        set.add(w);
      }
    }
  }
  if (ctx.recipient_brief) {
    const brief = ctx.recipient_brief;
    const firstLine = brief.split('\n')[0] ?? brief;
    const namePart = firstLine.replace(/^-\s*/, '').split('<')[0]?.trim().toLowerCase();
    if (namePart && namePart.length >= 3) {
      set.add(namePart);
      for (const w of namePart.split(/\s+/)) {
        if (w.length >= 3) set.add(w);
      }
    }
    const emails = brief.match(/<[^>]+>/g) ?? [];
    for (const m of emails) {
      const inner = m.slice(1, -1).split('@')[0]?.toLowerCase();
      if (inner && inner.length >= 3) set.add(inner);
    }
  }
  const title = (ctx.candidate_title || '').trim().toLowerCase();
  if (title.length >= 6) set.add(title);
  for (const w of title.split(/\s+/)) {
    if (w.length >= 4) set.add(w);
  }
  return [...set];
}

function countDistinctAnchorHits(haystackLower: string, anchors: string[]): number {
  const matched = new Set<string>();
  for (const a of anchors) {
    if (a.length < 2) continue;
    if (haystackLower.includes(a)) matched.add(a);
  }
  return matched.size;
}

function getLowCrossSignalIssues(
  payload: GeneratedDirectivePayload,
  ctx: StructuredContext,
  canonicalArtifactType: ValidArtifactTypeCanonical,
): string[] {
  if (canonicalArtifactType !== 'send_message' && canonicalArtifactType !== 'write_document') {
    return [];
  }
  if (canonicalArtifactType === 'send_message' && shouldSkipLowCrossSignalForThreadBackedOutreach(ctx)) {
    return [];
  }
  const anchors = collectCrossSignalAnchors(ctx);
  if (anchors.length < 2) {
    return [];
  }
  const parts: string[] = [
    String(payload.directive ?? ''),
    String(payload.insight ?? ''),
    String(payload.why_now ?? ''),
  ];
  if (canonicalArtifactType === 'send_message') {
    const a = payload.artifact as Record<string, unknown>;
    parts.push(String(a.subject ?? ''), String(a.body ?? ''));
  } else {
    const a = payload.artifact as Record<string, unknown>;
    parts.push(String(a.title ?? ''), String(a.content ?? ''));
  }
  const haystack = parts.join('\n').toLowerCase();
  if (countDistinctAnchorHits(haystack, anchors) >= 2) {
    return [];
  }
  return [
    `${LOW_CROSS_SIGNAL_ISSUE_PREFIX}artifact must reference at least two distinct grounded entities or signal sources from context`,
  ];
}

function buildLowCrossSignalWaitRationalePayload(
  ctx: StructuredContext,
  _originalCommit: 'send_message' | 'write_document',
): GeneratedDirectivePayload {
  const trip = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  return withResolvedCausalDiagnosis(
    {
      insight:
        'Cross-signal bar not met: the draft did not tie this winner to at least two grounded entities or signal sources already in context.',
      causal_diagnosis: ctx.required_causal_diagnosis,
      decision: 'HOLD',
      directive: 'Wait for clearer cross-signal linkage before sending outreach on this thread.',
      artifact_type: 'wait_rationale',
      artifact: {
        why_wait:
          'Two distinct anchors from your live context (e.g. contact + goal, or two signal sources) must appear in the finished artifact so the move is non-obvious. Add or sync the missing thread, application, or calendar tie-in, then regenerate.',
        tripwire_date: trip,
        trigger_condition:
          'When new signals explicitly connect this thread to your stated goals or parallel activity (names, employers, roles, or program codes present in context).',
      },
      why_now:
        'Sending a generic message would not add value over what you could draft yourself without Foldera.',
    },
    ctx.required_causal_diagnosis,
  );
}

function validateGeneratedArtifact(
  payload: GeneratedDirectivePayload | null,
  ctx: StructuredContext,
  canonicalArtifactType: ValidArtifactTypeCanonical,
): string[] {
  if (!payload) {
    return ['Response was not valid JSON in the required schema.'];
  }

  const issues: string[] = [];

  // Type check
  if (!VALID_ARTIFACT_TYPES.has(payload.artifact_type)) {
    issues.push(`artifact type "${payload.artifact_type}" is not valid — must be send_message, write_document, schedule_block, wait_rationale, or do_nothing`);
  }

  if (payload.artifact_type !== canonicalArtifactType) {
    issues.push(
      `artifact_type must be "${canonicalArtifactType}" (system commitment) but model returned "${payload.artifact_type}"`,
    );
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

  // Structural validation per artifact type — always the system-committed type
  const a = payload.artifact;
  switch (canonicalArtifactType) {
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
        issues.push('schedule_block for routine housekeeping rejected — rewrite with a substantive outcome-moving purpose');
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

  issues.push(...getLowCrossSignalIssues(payload, ctx, canonicalArtifactType));

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

  if (
    ctx.candidate_class === 'discrepancy' &&
    ctx.discrepancy_class === 'decay' &&
    canonicalArtifactType === 'send_message'
  ) {
    const a = payload.artifact as Record<string, unknown>;
    const combined = `${String(a.subject ?? '')}\n${String(a.body ?? '')}`;
    if (artifactContainsDecayPipelineLeak(combined)) {
      issues.push('send_message echoes internal decay metrics — rewrite subject/body in natural language only');
    }
  }

  // Secondary: banned coaching language (backup gate)
  if (directive && containsBannedLanguage(directive)) {
    issues.push('directive uses coaching/advice language');
  }

  // Discrepancy candidates (relationship decay, risk, engagement collapse, etc.) produce
  // warm reconnect or relationship-maintenance artifacts, not commitment decision memos.
  // These artifacts will never have explicit deadlines, consequence language, or
  // mechanism-targeted diagnostic anchors — that's correct behaviour, not a failure.
  // Skip the decision enforcement and causal diagnosis gates for discrepancy candidates.
  const isDiscrepancyCandidate = ctx.candidate_class === 'discrepancy';

  if (!isDiscrepancyCandidate) {
    // write_document forcing function check: must contain a concrete next action
    if (canonicalArtifactType === 'write_document') {
      const content = String((payload.artifact as Record<string, unknown>).content ?? '');
      const hasDecisionPoint = /\b(by\s+\w+day|\bby\s+\d{4}-\d{2}-\d{2}|\bdeadline\b|\bconfirm\b|\bdecide\b|\bchoose\b|\bapprove\b|\bschedule\b|\bcommit\b|\bnext\s+(?:step|action)\b)/i.test(content);
      if (!hasDecisionPoint) {
        issues.push('decision_enforcement:missing_forcing_function — write_document must contain a concrete deadline, decision point, or next action');
      }
    }

    issues.push(
      ...getDecisionEnforcementIssues({
        actionType: canonicalArtifactType,
        directiveText: payload.directive ?? '',
        reason: payload.why_now ?? '',
        artifact: payload.artifact ?? null,
      }),
    );

    issues.push(
      ...getCausalDiagnosisIssues({
        actionType: canonicalArtifactType,
        directiveText: payload.directive ?? '',
        reason: payload.why_now ?? '',
        artifact: payload.artifact ?? null,
        causalDiagnosis: payload.causal_diagnosis ?? null,
        candidateTitle: ctx.candidate_title,
        supportingSignals: ctx.supporting_signals,
        enforceGrounding: payload.causal_diagnosis_source === 'llm_grounded',
      }),
    );
  }

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
    actionType: artifactTypeToActionType(canonicalArtifactType),
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
  candidateType?: string;
}): string[] {
  const issues: string[] = [];

  if (input.directive.generationLog?.firstMorningBypass) {
    return [];
  }

  if (
    input.artifact &&
    typeof input.artifact === 'object' &&
    (input.artifact as Record<string, unknown>).emergency_fallback === true
  ) {
    const art = input.artifact as Record<string, unknown>;
    if (
      directiveLooksLikeScheduleConflict(input.directive) &&
      input.directive.action_type === 'write_document'
    ) {
      const t = typeof art.title === 'string' ? art.title : '';
      const c = typeof art.content === 'string' ? art.content : '';
      if (scheduleConflictArtifactIsOwnerProcedure(`${t}\n${c}`)) {
        return ['schedule_conflict artifact must be finished outbound work, not owner instructions'];
      }
    }
    return [];
  }

  if (input.directive.directive === GENERATION_FAILED_SENTINEL) {
    issues.push('directive generation failed');
  }
  if (input.directive.confidence < DEFAULT_DIRECTIVE_CONFIDENCE_THRESHOLD) {
    issues.push('directive confidence is below the send threshold');
  }
  if (!input.artifact || typeof input.artifact !== 'object') {
    issues.push('artifact is required before persistence');
  } else if (input.directive.action_type === 'write_document') {
    if (directiveLooksLikeScheduleConflict(input.directive)) {
      const art = input.artifact as Record<string, unknown>;
      const t = typeof art.title === 'string' ? art.title : '';
      const c = typeof art.content === 'string' ? art.content : '';
      if (scheduleConflictArtifactIsOwnerProcedure(`${t}\n${c}`)) {
        issues.push('schedule_conflict artifact must be finished outbound work, not an owner checklist');
      }
    }
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

  // Discrepancy candidates (relationship decay, risk, etc.) produce warm reconnect or
  // relationship-maintenance artifacts. These naturally have no explicit asks, deadlines,
  // or consequence language — skip decision enforcement for them.
  if (input.candidateType !== 'discrepancy' && input.candidateType !== 'insight') {
    issues.push(
      ...getDecisionEnforcementIssues({
        actionType: input.directive.action_type,
        directiveText: input.directive.directive,
        reason: input.directive.reason,
        artifact: input.artifact,
        discrepancyClass: effectiveDiscrepancyClassForGates(input.directive),
      }),
    );
  }

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

// Catches: "do_nothing exact_reason is required", "do_nothing blocked_by is required"
// These appear when the LLM incorrectly outputs do_nothing for a send_message/write_document candidate.
function isDoNothingSchemaIssue(issue: string): boolean {
  return issue.startsWith('do_nothing ');
}

function isLowCrossSignalValidationIssue(issue: string): boolean {
  return issue.toLowerCase().startsWith(LOW_CROSS_SIGNAL_ISSUE_PREFIX);
}

function shouldAttemptDecisionEnforcementRepair(
  issues: string[],
  actionType: ValidArtifactTypeCanonical,
): boolean {
  if (issues.length === 0) return false;
  if (actionType !== 'send_message' && actionType !== 'write_document') return false;
  const hasReparable = issues.some(
    (issue) =>
      isDecisionEnforcementIssue(issue) ||
      isCausalDiagnosisIssue(issue) ||
      isDoNothingSchemaIssue(issue),
  );
  if (!hasReparable) return false;
  const hardBlockers = issues.filter(
    (issue) =>
      !isDecisionEnforcementIssue(issue) &&
      !isCausalDiagnosisIssue(issue) &&
      !isDoNothingSchemaIssue(issue) &&
      !isLowCrossSignalValidationIssue(issue),
  );
  return hardBlockers.length === 0;
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
  userPromptNames: UserPromptNames;
}): GeneratedDirectivePayload | null {
  const target = cleanDecisionTarget(input.winner.title);
  const deadline = resolveDecisionDeadline(input.candidateDueDate);

  // If winner has trigger metadata, use it to produce specific copy.
  // But skip trigger metadata that contains system metric strings (e.g. "52% drop in
  // goal-aligned activity", "signal density halved") — those are internal labels not
  // suitable for human-facing artifact copy.
  const trig = input.winner.trigger;
  const SYSTEM_METRIC_RE = /\b\d+%|\bsignal\s+density\b|\bgoal.aligned\b|\bsignal\s+count\b|\bactivity\s+drop\b|\bdrop\s+in\b/i;
  const triggerHasSystemMetrics =
    trig &&
    (SYSTEM_METRIC_RE.test(trig.delta ?? '') || SYSTEM_METRIC_RE.test(trig.why_now ?? ''));
  const triggerGroundedCopy =
    trig && !triggerHasSystemMetrics
      ? {
          ask: `Confirm: ${trig.delta}. Decision required by ${deadline}.`,
          consequence: `Consequence: ${trig.why_now}`,
          insight: `${trig.current_state} (was: ${trig.baseline_state})`,
          whyNow: trig.why_now,
        }
      : null;

  const copy = triggerGroundedCopy ?? buildCausalFallbackCopy({
    diagnosis: input.causalDiagnosis,
    target,
    deadline,
  });

  if (input.actionType === 'send_message') {
    const recipient = extractAllEmailAddresses(input.winner, input.userEmails)[0];
    if (!recipient) return null;

    // For relationship decay/risk candidates, produce a warm reconnect email
    // rather than the "decision required by" template which is designed for commitments.
    const isRelationshipReconnect =
      input.winner.discrepancyClass &&
      ['decay', 'risk', 'engagement_collapse', 'relationship_dropout'].includes(
        input.winner.discrepancyClass,
      ) &&
      Boolean(input.winner.entityName);

    if (isRelationshipReconnect) {
      const rawFirst = (input.winner.entityName ?? 'there').split(/\s+/)[0];
      const firstName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase();
      const simpleDate = new Date(Date.now() + daysMs(7)).toISOString().slice(0, 10);
      const signOff = input.userPromptNames.user_first_name.trim()
        ? input.userPromptNames.user_first_name
        : '';

      if (input.winner.discrepancyClass === 'decay') {
        const rc = (input.winner.relationshipContext ?? '').trim();
        const lines = rc.split(/\n/).map((l) => l.trim()).filter(Boolean);
        const afterLastIx = lines.findIndex((l) => /Last interactions/i.test(l));
        const intelLine =
          (afterLastIx >= 0 ? lines.slice(afterLastIx + 1).find((l) => l.length > 40) : undefined) ??
          lines.find((l) => /^\[\d{4}-\d{2}-\d{2}\]/.test(l) && l.length > 40);
        const hasCleanTrigger =
          trig && !triggerHasSystemMetrics && (trig.why_now?.trim().length ?? 0) >= 12;
        if (!intelLine && !hasCleanTrigger) return null;

        const threadHook = intelLine
          ? intelLine.replace(/^\s*-\s*/, '').slice(0, 280)
          : `${trig!.baseline_state.slice(0, 120)} → ${trig!.current_state.slice(0, 120)}`;
        const whyNow = hasCleanTrigger
          ? trig!.why_now!.trim()
          : 'I need to move this thread forward while the context is still actionable.';
        const askBit = hasCleanTrigger && trig!.delta?.trim()
          ? trig!.delta!.trim().slice(0, 160)
          : 'where you stand on the open item from our last exchange';

        return {
          insight: whyNow.slice(0, 240),
          causal_diagnosis: input.causalDiagnosis,
          decision: 'ACT',
          directive: `Send ${firstName} a note that cites the last interaction, names why reconnection matters now, and asks one concrete thing by ${simpleDate}.`,
          artifact_type: 'send_message',
          artifact: {
            to: recipient,
            recipient,
            subject: `Quick follow-up: ${threadHook.slice(0, 55)}`,
            body: [
              `Hi ${firstName},`,
              ``,
              `I'm writing about ${threadHook.slice(0, 220)} — ${whyNow.slice(0, 220)}`,
              ``,
              `Could you reply by ${simpleDate} with ${askBit}?`,
              ``,
              `Thanks,${signOff ? `\n${signOff}` : ''}`,
            ].join('\n'),
          },
          why_now: whyNow.slice(0, 320),
        };
      }

      return {
        insight: `Relationship with ${input.winner.entityName} has gone silent — reconnection attempt before the window closes.`,
        causal_diagnosis: input.causalDiagnosis,
        decision: 'ACT',
        directive: `Send ${firstName} a short reconnect note asking if they're open to catching up by ${simpleDate}.`,
        artifact_type: 'send_message',
        artifact: {
          to: recipient,
          recipient,
          subject: `From ${input.userPromptNames.user_full_name}`,
          body: [
            `Hi ${firstName},`,
            ``,
            `Can you confirm if you're open to a brief catch-up by ${simpleDate}? I wanted to reconnect while the thread is still actionable on my side.`,
            ``,
            `If the timing isn't right, no problem — a quick yes/no still helps me plan.`,
            ``,
            `Best,${signOff ? `\n${signOff}` : ''}`,
          ].join('\n'),
        },
        why_now: `${input.winner.entityName} has been unreachable — delay past ${simpleDate} increases the risk of losing this connection permanently.`,
      };
    }

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

  for (const signal of result.winner.relatedSignals.slice(0, 5)) {
    evidence.push({ type: 'signal', description: signal.slice(0, 220) });
  }

  return evidence;
}

function buildFullContext(result: ScorerResult, payload: GeneratedDirectivePayload): string {
  const sections = [
    // Lead with the non-obvious insight so it's always the first thing surfaced
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

/** Buckets for structured logs — avoids shipping full validation strings to production logs. */
function bucketValidationIssuesForLogs(issues: string[]): string[] {
  const buckets = new Set<string>();
  for (const i of issues) {
    const low = i.toLowerCase();
    if (low.startsWith(LOW_CROSS_SIGNAL_ISSUE_PREFIX)) buckets.add('low_cross_signal');
    else if (low.includes('json') || low.includes('parse')) buckets.add('parse');
    else if (low.includes('enforcement') || low.includes('canonical')) buckets.add('decision_enforcement');
    else if (low.includes('placeholder')) buckets.add('placeholder');
    else if (low.includes('ground')) buckets.add('grounding');
    else buckets.add('other');
  }
  return [...buckets];
}

/**
 * Validation retries after the first Sonnet call (hard cap: 1 retry → 2 LLM calls max).
 * At most one `directive_retry` per `generatePayload`; no third round-trip.
 * After the last attempt fails, caller gets payload null (empty directive path).
 */
const MAX_DIRECTIVE_VALIDATION_RETRIES = 1;
const MAX_DIRECTIVE_LLM_ATTEMPTS = 1 + MAX_DIRECTIVE_VALIDATION_RETRIES;

async function generatePayload(
  userId: string,
  ctx: StructuredContext,
  options: GeneratePayloadOptions,
): Promise<GeneratePayloadResult> {
  const committed = options.committedArtifactType;
  const prompt = buildPromptFromStructuredContext(ctx, committed);

  if (
    process.env.NODE_ENV !== 'production' &&
    ctx.candidate_class === 'discrepancy' &&
    ctx.discrepancy_class === 'decay'
  ) {
    console.log(`[generator] decay_candidate_full_prompt\n${prompt}`);
  }

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
  let issuesAttempt0: string[] | null = null;

  for (let attempt = 0; attempt < MAX_DIRECTIVE_LLM_ATTEMPTS; attempt++) {
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
            actionType: committed,
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

    // DecisionPayload committed type is validated here — wrong artifact_type fails closed.
    // Post-parse drift logging still compares llm artifact_type to canonical on success.

    const issues = validateGeneratedArtifact(parsed, ctx, committed);
    lastIssues = issues;
    if (attempt === 0) {
      issuesAttempt0 = [...issues];
    }

    if (issues.length === 0 && parsed) {
      return { issues: [], payload: parsed };
    }

    if (attempt < MAX_DIRECTIVE_LLM_ATTEMPTS - 1) {
      logStructuredEvent({
        event: 'generation_retry',
        level: 'warn',
        userId,
        artifactType: parsed?.artifact_type ?? null,
        generationStatus: 'retrying_validation',
        details: {
          scope: 'generator',
          attempt_index: attempt,
          max_attempts: MAX_DIRECTIVE_LLM_ATTEMPTS,
          issue_count: issues.length,
          issue_buckets: bucketValidationIssuesForLogs(issues),
        },
      });

      // For the retry, feed back only the extracted JSON (if parseable) to avoid
      // reinforcing preamble/fence patterns from the first attempt.
      const assistantContent = parsed ? JSON.stringify(parsed) : raw;
      attempts.push({ role: 'assistant', content: assistantContent });
      const executableCommit = EXECUTABLE_ARTIFACT_TYPES.has(committed);
      const validRetryTypes = executableCommit
        ? 'send_message, write_document, schedule_block'
        : `${committed} (only)`;
      attempts.push({
        role: 'user',
        content: `Validation failed. Fix these issues and return JSON only.

CANONICAL_ACTION is still: ${committed}. Your action and artifact MUST match exactly.

Discrepancy Engine format (preferred):
{ "action": "${committed}", "confidence": 0-100, "reason": "...", ... }

Legacy format (if you must):
artifact_type MUST be "${committed}"${executableCommit ? ' — do not use wait_rationale or do_nothing' : ''}. decision MUST be "ACT".
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
      details: {
        scope: 'generator',
        attempt_index: attempt,
        max_attempts: MAX_DIRECTIVE_LLM_ATTEMPTS,
        issues,
      },
    });
  }

  logStructuredEvent({
    event: 'generation_validation_exhausted',
    level: 'warn',
    userId,
    artifactType: null,
    generationStatus: 'validation_exhausted',
    details: {
      scope: 'generator',
      max_attempts: MAX_DIRECTIVE_LLM_ATTEMPTS,
      max_validation_retries: MAX_DIRECTIVE_VALIDATION_RETRIES,
      issue_count: lastIssues.length,
    },
  });

  const lowCrossRetryExhausted =
    issuesAttempt0 !== null &&
    issuesAttempt0.some((i) => i.toLowerCase().startsWith(LOW_CROSS_SIGNAL_ISSUE_PREFIX)) &&
    lastIssues.some((i) => i.toLowerCase().startsWith(LOW_CROSS_SIGNAL_ISSUE_PREFIX));

  if (
    lowCrossRetryExhausted &&
    (committed === 'send_message' || committed === 'write_document')
  ) {
    // Defer wait_rationale to generateDirective so deterministic decision-enforcement
    // repair can run first (mixed validation failures often pair low_cross with enforcement).
    return { issues: lastIssues, payload: null, pendingLowCrossSignalFallback: true };
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

    // Manual/interactive runs bypass the spend cap (skipSpendCap=true) but are
    // still bounded by a per-day call count so smoke tests can't burn $2.50/day.
    if (
      !options.dryRun &&
      options.skipSpendCap &&
      !options.skipManualCallLimit &&
      (await isOverManualCallLimit(userId))
    ) {
      logStructuredEvent({
        event: 'generation_skipped', level: 'warn', userId,
        artifactType: null, generationStatus: 'manual_call_limit_reached',
        details: { scope: 'generator' },
      });
      return emptyDirective(
        'Manual directive call limit reached for today.',
        buildNoSendGenerationLog('Manual directive call limit reached for today.', 'system', null),
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

    const [userGoalsResult, goalGapResult, alreadySentResult, behavioralHistoryResult, approvedActionsResult] = await Promise.allSettled([
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
      // Sent mail 14d (from tkg_signals email_sent)
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
      // Approved send_message tkg_actions 14d — supplements alreadySent to close sync-lag gap
      // (Foldera-approved emails may not have synced back into tkg_signals yet)
      (async (): Promise<string[]> => {
        const fourteenDaysAgo = new Date(Date.now() - daysMs(14)).toISOString();
        const { data: actionRows } = await supabase
          .from('tkg_actions')
          .select('directive_text, generated_at')
          .eq('user_id', userId)
          .eq('action_type', 'send_message')
          .in('status', ['approved', 'executed'])
          .gte('generated_at', fourteenDaysAgo)
          .order('generated_at', { ascending: false })
          .limit(10);
        const lines: string[] = [];
        for (const row of actionRows ?? []) {
          const date = new Date(row.generated_at as string).toISOString().slice(0, 10);
          const firstLine = (row.directive_text as string ?? '')
            .split('\n')
            .map((l: string) => l.trim())
            .find((l: string) => l.length > 0)
            ?.slice(0, 80) ?? null;
          if (firstLine) lines.push(`[${date}] (Foldera-sent) — ${firstLine}`);
        }
        return lines;
      })(),
    ]);

    const goalsForContext = ((
      userGoalsResult.status === 'fulfilled' ? (userGoalsResult.value.data ?? []) : []
    ) as Array<{ goal_text: string; priority: number; goal_category: string; source?: string }>)
      .filter((g) => !PLACEHOLDER_GOAL_SOURCES.has(g.source ?? ''))
      .slice(0, 5);
    const goalGapAnalysis: GoalGapEntry[] = goalGapResult.status === 'fulfilled' ? goalGapResult.value : [];
    const approvedActionLines: string[] = approvedActionsResult.status === 'fulfilled' ? approvedActionsResult.value : [];
    // Merge approved tkg_actions lines into alreadySent (dedup by first 40 chars)
    const alreadySentRaw = alreadySentResult.status === 'fulfilled' ? alreadySentResult.value : [];
    const alreadySentKeys = new Set(alreadySentRaw.map((l) => l.slice(0, 40)));
    const alreadySent = [...alreadySentRaw, ...approvedActionLines.filter((l) => !alreadySentKeys.has(l.slice(0, 40)))];
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
    const [selfNameTokens, userEmails, lockedContacts, userPromptNames] = await Promise.all([
      fetchUserSelfNameTokens(userId),
      fetchUserEmailAddresses(userId),
      // Fetch locked contacts from tkg_constraints once — hard blocks any send_message to these entities.
      (async (): Promise<Set<string>> => {
        const set = new Set<string>();
        try {
          const { data } = await supabase
            .from('tkg_constraints')
            .select('normalized_entity')
            .eq('user_id', userId)
            .eq('constraint_type', 'locked_contact')
            .eq('is_active', true);
          for (const row of data ?? []) {
            if (row.normalized_entity) set.add((row.normalized_entity as string).toLowerCase());
          }
        } catch {
          // Non-blocking — if the fetch fails, proceed without suppression
          logStructuredEvent({
            event: 'locked_contacts_fetch_failed', level: 'warn', userId,
            artifactType: null, generationStatus: 'locked_contacts_degraded',
            details: { scope: 'generator' },
          });
        }
        return set;
      })(),
      resolveUserPromptNames(userId),
    ]);

    for (const { candidate: currentCandidate, disqualified, disqualifyReason } of rankedCandidates) {
      // Skip disqualified candidates (already acted recently, etc.)
      if (disqualified) {
        candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: [disqualifyReason ?? 'disqualified'] });
        continue;
      }

      // --- Per-candidate: hydrate + entity bx_stats for discrepancy UUID winners ---
      let hydratedWinner = await hydrateWinnerRelationshipContext(userId, currentCandidate);
      hydratedWinner = await enrichWinnerWithEntityBxStats(userId, hydratedWinner);

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

      // --- Per-candidate: conversation state (sent/received thread for this entity) ---
      // Built from signal evidence + approved tkg_actions; non-blocking.
      let entityConversationState: string | null = null;
      if (hydratedWinner.entityName) {
        try {
          entityConversationState = await buildEntityConversationState(
            userId, hydratedWinner.entityName, signalEvidence,
          );
        } catch { /* non-blocking — omit if unavailable */ }
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
      const isDecayDiscrepancy =
        hydratedWinner.type === 'discrepancy' && hydratedWinner.discrepancyClass === 'decay';
      if (!isDecayDiscrepancy && currentCandidate.score >= 2.0) {
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
      // Decay reconnection: skip conviction math — it keys off matchedGoal (often financial runway)
      // and would instruct the model to prioritize unrelated "bridge" actions over the reconnect.
      let convictionDecision: import('./conviction-engine').ConvictionDecision | null = null;
      if (!isDecayDiscrepancy) {
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
      }

      // --- Build structured context ---
      const ctx = buildStructuredContext(
        hydratedWinner, guardrails, userId, signalEvidence, insight,
        goalsForContext, goalGapAnalysis,
        scored.antiPatterns, scored.divergences,
        alreadySent, convictionDecision, behavioralHistory,
        avoidanceObservations, competitionContext,
        userEmails,
        userPromptNames,
        entityConversationState,
      );

      // --- DECISION PAYLOAD — the canonical binding contract ---
      const decisionPayload = buildDecisionPayload(hydratedWinner, ctx, confidence, lockedContacts);
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

    let payloadResult: GeneratePayloadResult;
    try {
      payloadResult = await generatePayload(userId, ctx, {
        ...options,
        committedArtifactType: decisionPayload.recommended_action,
      });
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

    // If LLM generation fails entirely, try deterministic repair; preserve pending low-cross
    // fallback so we can emit wait_rationale after repair if still blocked.
    if (!payloadResult.payload) {
      const pendingLowCross = Boolean(payloadResult.pendingLowCrossSignalFallback);
      if (shouldAttemptDecisionEnforcementRepair(payloadResult.issues, decisionPayload.recommended_action)) {
        const originalIssues = [...payloadResult.issues];
        const repairedPayload = buildDecisionEnforcedFallbackPayload({
          winner: hydratedWinner,
          actionType: decisionPayload.recommended_action,
          candidateDueDate: ctx.candidate_due_date,
          causalDiagnosis: ctx.required_causal_diagnosis,
          userEmails,
          userPromptNames: {
            user_full_name: ctx.user_full_name,
            user_first_name: ctx.user_first_name,
          },
        });

        if (repairedPayload) {
          const repairedIssues = validateGeneratedArtifact(
            repairedPayload,
            ctx,
            decisionPayload.recommended_action,
          );
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
            payloadResult = {
              issues: repairedIssues,
              payload: null,
              pendingLowCrossSignalFallback: pendingLowCross,
            };
          }
        } else if (pendingLowCross) {
          payloadResult = { ...payloadResult, pendingLowCrossSignalFallback: true };
        }
      } else if (pendingLowCross) {
        payloadResult = { ...payloadResult, pendingLowCrossSignalFallback: true };
      }

      if (
        !payloadResult.payload &&
        payloadResult.pendingLowCrossSignalFallback &&
        (decisionPayload.recommended_action === 'send_message' ||
          decisionPayload.recommended_action === 'write_document')
      ) {
        const fallback = buildLowCrossSignalWaitRationalePayload(
          ctx,
          decisionPayload.recommended_action,
        );
        const fbIssues = validateGeneratedArtifact(fallback, ctx, 'wait_rationale');
        if (fbIssues.length === 0) {
          logStructuredEvent({
            event: 'low_cross_signal_wait_rationale',
            level: 'info',
            userId,
            artifactType: 'wait_rationale',
            generationStatus: 'cross_signal_gate_degraded',
            details: {
              scope: 'generator',
              original_commitment: decisionPayload.recommended_action,
            },
          });
          payloadResult = { issues: [], payload: fallback, lowCrossSignalWaitRationale: true };
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
    applyScheduleConflictCanonicalUserFacingCopy(payload, currentCandidate);

    // =====================================================================
    // POST-LLM ENFORCEMENT: the canonical action is from decisionPayload,
    // NOT from the LLM's artifact_type. Log any drift for diagnostics.
    // Cross-signal gate may degrade send_message/write_document to wait_rationale.
    // =====================================================================

    let canonicalAction: ValidArtifactTypeCanonical = decisionPayload.recommended_action;
    if (payloadResult.lowCrossSignalWaitRationale) {
      canonicalAction = 'wait_rationale';
    }
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

    // When the actual generation winner is NOT the scorer's top pick (fallback occurred),
    // re-derive confidence from the actual winner's breakdown so that a low-tractability
    // scorer winner (e.g. goal_velocity_mismatch with tractability=0.30) does not drag
    // the confidence below the send threshold for an entity-linked fallback winner.
    let effectiveConfidence = confidence;
    if (currentCandidate.id !== scorerTopCandidate.id && currentCandidate.breakdown) {
      const fb = currentCandidate.breakdown;
      const fbStakes = Math.min(1, fb.stakes / 5);
      const fbUrgency = Math.max(0, Math.min(1, fb.urgency));
      const fbTractability = Math.max(0, Math.min(1, fb.tractability));
      const fbFreshness = Math.max(0, Math.min(1, fb.freshness));
      const fbEvidenceDepth = Math.min(1,
        ((currentCandidate.relatedSignals.length > 0 ? Math.min(currentCandidate.relatedSignals.length, 3) : 0) +
          (currentCandidate.matchedGoal ? 2 : 0) +
          (hydratedWinner.relationshipContext ? 2 : 0)) / 7,
      );
      const deprioritizedScore = scored.deprioritized[0]?.score ?? 0;
      const fbMargin = currentCandidate.score <= 0
        ? 0
        : Math.max(0, Math.min(1, (currentCandidate.score - deprioritizedScore) / Math.max(currentCandidate.score, 0.01)));
      const fbComposite = (fbStakes * 0.24) + (fbUrgency * 0.18) + (fbTractability * 0.24) +
        (fbFreshness * 0.12) + (fbEvidenceDepth * 0.12) + (fbMargin * 0.10);
      effectiveConfidence = Math.max(50, Math.min(95, Math.round(40 + (fbComposite * 55))));
    }

    const directive = {
      directive: payload.directive.trim(),
      action_type: artifactTypeToActionType(canonicalAction),
      confidence: effectiveConfidence,
      reason: payload.why_now.trim(),
      evidence: buildEvidenceItems(scored, payload),
      fullContext: buildFullContext({ ...scored, winner: hydratedWinner }, payload),
      embeddedArtifact: payload.artifact,
      embeddedArtifactType: canonicalAction,
      ...(currentCandidate.type === 'discrepancy'
        ? (() => {
            const dc =
              currentCandidate.discrepancyClass
              ?? (currentCandidate.id.startsWith('discrepancy_conflict_') ? 'schedule_conflict' as const : undefined);
            return dc ? { discrepancyClass: dc } : {};
          })()
        : {}),
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
      generationLog: buildSelectedGenerationLog(scored.candidateDiscovery, {
        active_goals: ctx.active_goals,
      }),
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
      candidateType: currentCandidate.fromInsightScan ? 'insight' : currentCandidate.type,
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

    // Trigger action lock validation — discrepancy candidates only (skip when cross-signal degraded to wait_rationale)
    if (
      !payloadResult.lowCrossSignalWaitRationale &&
      currentCandidate.type === 'discrepancy' &&
      currentCandidate.discrepancyClass &&
      currentCandidate.trigger
    ) {
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
      const hardTriggerViolations = triggerValidation.violations.filter(
        (v) =>
          v.startsWith('action_mismatch:') ||
          v.startsWith('banned_phrase:') ||
          v.startsWith('decay_pipeline_metric_echo:') ||
          v.startsWith('missing_relationship_decay_theme:'),
      );
      if (hardTriggerViolations.length > 0) {
        const trigReasons = hardTriggerViolations.map((v) => `trigger_lock:${v}`);
        candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: trigReasons });
        logStructuredEvent({
          event: 'candidate_blocked', level: 'warn', userId,
          artifactType: canonicalAction, generationStatus: 'trigger_validation_failed',
          details: {
            scope: 'trigger_action_lock',
            trigger_class: currentCandidate.discrepancyClass,
            violations: hardTriggerViolations,
          },
        });
        continue;
      }
      if (!triggerValidation.pass) {
        logStructuredEvent({
          event: 'trigger_validation_violations', level: 'warn', userId,
          artifactType: canonicalAction, generationStatus: 'trigger_advisory',
          details: {
            scope: 'trigger_action_lock',
            trigger_class: currentCandidate.discrepancyClass,
            violations: triggerValidation.violations,
            note: 'Soft violations only — artifact proceeds (delta/ask wording)',
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
