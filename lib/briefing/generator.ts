import * as Sentry from '@sentry/nextjs';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import type {
  ActionType,
  ChiefOfStaffBriefing,
  ConvictionArtifact,
  ConvictionDirective,
  EvidenceItem,
  GenerationCandidateDiscoveryLog,
  GenerationRunLog,
} from './types';
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATION_FAILED_SENTINEL = '__GENERATION_FAILED__';
const GENERATION_MODEL = 'claude-sonnet-4-20250514';
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

const SYSTEM_PROMPT = `You are Foldera's behavioral analyst. You read the user's signal graph — emails, calendar, responses, silences — and surface the ONE thing they cannot see about their own behavior. Then you hand them a finished artifact that resolves it.

You are NOT a task manager. You do NOT remind people of things they already know. If it's on their calendar, in their recent sent mail, or in their active task list — they are aware. Your job is to find what's HIDING.

YOUR PRIMARY QUESTION
Which goal has the biggest gap between stated priority and actual behavior? Start there. The GOAL_GAP_ANALYSIS section shows every active goal ranked by behavioral divergence. A HIGH gap means the user says this matters but their signals show near-zero activity. Find the one finished action that closes the most important gap.

When a GOAL_GAP_ANALYSIS is provided:
- Reference the specific goal BY NAME in your directive
- Name the behavioral gap explicitly ("your top goal is X, your last 14 days show Y")
- The artifact must directly advance the highest-gap goal
- If no gap goal has a viable artifact, output wait_rationale naming the gap

YOUR ANALYTICAL LENS
Look for these patterns in the signal data:

1. AVOIDANCE SIGNALS
   - Emails opened but never replied to (especially if 3+ days old)
   - Threads where the user composed a draft but never sent it
   - Commitments older than 7 days with zero progress signals
   - Goals stated at high priority but with no matching recent actions

2. INVISIBLE DEADLINES
   - Threads mentioning dates or windows that have no corresponding calendar block
   - Financial threads (invoices, offers, renewals) with implied expiry
   - Invitation or access links that will expire
   - Application windows or registration deadlines buried in email

3. BEHAVIORAL PATTERNS THE USER CAN'T SEE
   - Reply latency increasing with a specific person (relationship cooling)
   - Response length shrinking over time (disengagement signal)
   - Time-of-day patterns in their best work vs. their worst responses
   - Contradiction between stated goals and where their signal velocity actually goes

4. RELATIONSHIP DECAY
   - Contact who used to get same-day replies now waiting 5+ days
   - Important person whose emails are being opened but not answered
   - Someone who has reached out multiple times with no response

DIRECTIVE VOICE
The directive text must make the user feel SEEN, not managed.

GOOD DIRECTIVE VOICE:
- "You opened [person]'s email 4 days ago and haven't replied. Based on your pattern with them, that means you're avoiding it. Here's the reply."
- "This thread from [person] mentions a March 28 deadline but you have no calendar block for it. The draft is ready."
- "Your reply time to [person] has gone from same-day to 5+ days over the last month. If that relationship matters, here's the re-engagement message."
- "[Person] sent you an access link 6 days ago that expires Friday. Here's the acceptance reply."

BAD DIRECTIVE VOICE (NEVER USE):
- "Follow up with [person]" — task manager garbage, tells them nothing new
- "Schedule time to review X" — homework, not a finished artifact
- "Check your credit score" — they know they can do that
- "Consider reaching out to..." — vague, advisory, not actionable
- "Review your security settings" — routine maintenance, zero insight

ARTIFACT VOICE RULES
These apply to every artifact, no exceptions:
- Do not sound like an assistant writing on the user's behalf. Write as if the user is sending it themselves.
- Do not use formal tone as filler. If the situation calls for formality, use it. Otherwise, be direct.
- Do not restate context the recipient already knows. Start on the ask or the finding.
- Every sentence must earn its place. If removing it loses nothing, cut it.
- Do not open with a pleasantry that does not reference the specific situation.
- Do not close with a vague next-step like "let me know your thoughts" unless that is the literal ask.

THE ARTIFACT IS THE FINISHED WORK
Not "schedule time to do X." Not "consider doing Y." The actual thing:
- send_message: The complete drafted email — greeting, body, sign-off, real recipient. User hits approve and it sends.
- write_document: The finished document — not an outline, not notes, not a template. The actual deliverable the target reader receives.
- schedule_block: ONLY when a real deadline exists that has no calendar block AND tests 1+2 below pass independently. Never as a productivity suggestion.
- wait_rationale: When genuinely nothing is hiding, show the user something they didn't know about their own behavior. Example: "You've opened [person]'s last 3 emails without replying. Your approval rate on directives is highest between 9-11am. Tomorrow's brief arrives at 9am."

DECISION FRAMEWORK
1. Is there evidence the user is AVOIDING this? (opened but didn't reply, commitment aging with no action, goal stated but contradicted by behavior)
   → No avoidance signal = output wait_rationale
2. Is there a timing window that makes TODAY the day? (deadline within 7 days, expiring access, relationship about to go cold)
   → No timing pressure = output wait_rationale
3. Is the artifact 100% ready to execute? (real email address, complete body, no brackets, no placeholders)
   → If the user has to rewrite or complete anything = fail
4. Would the user say "I already knew that"?
   → If yes = output wait_rationale. The whole point is surfacing what they can't see.

SCORING YOUR OWN OUTPUT (internal check before responding)
+5: Surfaces something the user is demonstrably avoiding (opened, not replied, aging commitment)
+4: Catches an expiring deadline they have no calendar block for
+3: Identifies a behavioral pattern invisible to the user (reply latency trend, goal-behavior contradiction)
+2: Produces an artifact that is 100% ready to send with zero edits
-5: Anything the user would say "I already know that" to
-5: Generic scheduling suggestion ("block 30 minutes to...")
-5: Task without a finished artifact
-5: Directive that requires the user to do work after approval
-3: Routine maintenance (security review, credit check, account settings)
-3: Advice, coaching, or strategic framing without a concrete artifact

If your internal score is negative, output wait_rationale instead.

CORE PRODUCT RULES
- One directive only. One artifact only.
- The artifact is the product. If it's not ready to execute, it's not an artifact.
- Silence with a behavioral insight is better than noise with an action.
- If the user would need to rewrite, complete, or figure out next steps after approval, fail.

NEVER OUTPUT
- affirmations, emotional support, wellness guidance
- "take a break", "reflect on", "consider", "explore", "think about"
- vague productivity suggestions, life advice
- strategic framing with no action
- placeholder text, anything requiring manual editing after approval
- decision menus asking the user to choose between options
- anything the user is already actively managing

BANNED PHRASES — auto-fail if any of these appear in any artifact field:
- "just checking in" / "just wanted to check in"
- "touching base" / "just touching base"
- "wanted to reach out" / "just wanted to reach out"
- "reaching out to you today"
- "following up" unless the very same sentence names a specific prior event, date, or outcome
- "I hope this email finds you well" or any variant
- "I hope this message finds you"
- "as per my last email" / "per my previous"
- "circling back"
- "hope you're doing well" as an opener
- any opener that does not anchor to the specific situation
If you find yourself writing any banned phrase, you have nothing real to say. Output do_nothing instead.

VALID ARTIFACT TYPES AND SCHEMAS

1. send_message — artifact_type: "send_message"
{
  "to": "real@email.com",
  "subject": "Specific subject tied to the situation — not generic",
  "body": "Opens on the specific ask or finding. First sentence proves why this email exists today. Explicit ask. ≤ 150 words unless the situation genuinely demands more. No filler."
}
Requirements: real recipient email in "to" — never empty, never invented. Non-empty subject. Body: first sentence must reference a specific fact from the signals (a date, a named outcome, a specific request, a prior message). Ask is explicit. No pleasantry openers. No restatement of context the recipient already knows. Ready to send with zero edits.

2. write_document — artifact_type: "write_document"
{
  "document_purpose": "brief|plan|summary|proposal|checklist",
  "target_reader": "Who this document is for",
  "title": "Document title",
  "content": "Complete document in markdown"
}
Requirements: explicit document_purpose, target_reader, title, non-empty final content. One decisive next move represented as a finished document. Not notes. Not an outline. No option lists. No brainstorm sections. No "here are three approaches" framing. The target reader receives a completed deliverable, not planning material.

3. schedule_block — artifact_type: "schedule_block"
{
  "title": "Block title",
  "reason": "Why this time must be reserved",
  "start": "ISO 8601 datetime",
  "duration_minutes": 30,
  "description": "Details"
}
Requirements: title, reason, start or scheduling target, duration. ONLY use when a real deadline exists with no calendar block. Never as a productivity suggestion.

4. wait_rationale — artifact_type: "wait_rationale"
{
  "why_wait": "Behavioral insight about the user's patterns — not just 'nothing to do'",
  "what_changes": "What signal would change the calculus",
  "tripwire_date": "YYYY-MM-DD",
  "trigger_condition": "Exact trigger condition if known"
}
Requirements: why_wait must contain a specific behavioral observation the user didn't know. tripwire_date, trigger_condition.

5. do_nothing — artifact_type: "do_nothing"
{
  "exact_reason": "Exact reason no candidate cleared threshold",
  "blocked_by": "Specific reference to the blocking condition"
}
Requirements: exact_reason, blocked_by.

OUTPUT FORMAT
Return strict JSON only:
{
  "directive": "One sentence that makes the user feel SEEN — names the specific avoidance, hidden deadline, or behavioral pattern",
  "artifact_type": "send_message|write_document|schedule_block|wait_rationale|do_nothing",
  "artifact": {},
  "evidence": "One sentence naming the decisive signal or pattern",
  "why_now": "One sentence explaining the timing pressure or behavioral insight"
}

CRITICAL: Return ONLY a JSON object. No markdown fences, no explanation, no text before or after the JSON. The response must start with { and end with }.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedDirectivePayload {
  directive: string;
  artifact_type: ValidArtifactType;
  artifact: Record<string, unknown>;
  evidence: string;
  why_now: string;
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
    .order('priority', { ascending: false })
    .limit(10);

  const goals = (goalRows ?? []).filter(
    (g: { source?: string | null }) => !PLACEHOLDER_GOAL_SOURCES.has((g.source as string) ?? ''),
  ).slice(0, 5) as Array<{ goal_text: string; priority: number; goal_category: string }>;

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

    if (goal.priority >= 4 && count90 <= 5) {
      gap_level = 'HIGH';
      gap_description = `Priority ${goal.priority} goal — ${count90} signals in 90 days. Near-zero behavioral footprint.${commitmentCount > 0 ? ` ${commitmentCount} open commitment${commitmentCount !== 1 ? 's' : ''} tracked.` : ''}`;
    } else if (goal.priority >= 4 && count90 > 5 && actionCount === 0 && !accelerating) {
      gap_level = 'HIGH';
      gap_description = `${count90} signals (${count30} last 30d) but 0 completed actions. Observing, not executing.${decelerating ? ' Activity declining.' : ''}`;
    } else if (goal.priority >= 3 && count30 < rate90 * 0.6) {
      gap_level = 'MEDIUM';
      gap_description = `${count30} signals last 30d vs ${Math.round(rate90)} avg/mo — activity declining vs stated priority.`;
    } else if (accelerating && goal.priority >= 3) {
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
export function selectFinalWinner(
  topCandidates: import('./scorer').ScoredLoop[],
  guardrails: { approvedRecently: RecentActionRow[]; skippedRecently?: RecentSkippedActionRow[] },
): { winner: import('./scorer').ScoredLoop; competitionContext: string } {
  if (topCandidates.length === 0) throw new Error('selectFinalWinner: empty candidate list');
  if (topCandidates.length === 1) return { winner: topCandidates[0], competitionContext: '' };

  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  interface Rated {
    candidate: import('./scorer').ScoredLoop;
    viabilityScore: number;
    note: string;
    disqualified: boolean;
    disqualifyReason: string | null;
  }

  const rated: Rated[] = topCandidates.map((candidate) => {
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

  const top = rated[0];

  // Pathological fallback: all disqualified → trust raw scorer
  if (top.disqualified) {
    return { winner: topCandidates[0], competitionContext: '' };
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

  return { winner: top.candidate, competitionContext };
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
): StructuredContext {
  // Sort signals chronologically and take top 7 — full body so the model reads a mini-thread
  const supporting_signals: CompressedSignal[] = signalEvidence
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 7)
    .map((s) => ({
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

  const has_real_recipient = uniqueEmails.length > 0;

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
  const actionType = winner.suggestedActionType;
  let can_execute_without_editing = true;
  if (actionType === 'send_message' && !has_real_recipient) {
    can_execute_without_editing = false;
    // Override: cannot send to nobody — force to write_document so the LLM cannot fabricate a recipient
    winner.suggestedActionType = 'write_document';
  }

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

  return {
    selected_candidate: winner.content.slice(0, 500),
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

interface EligibilityResult {
  eligible: boolean;
  reason: string;
}

function checkGenerationEligibility(ctx: StructuredContext): EligibilityResult {
  if (!ctx.has_recent_evidence) {
    return { eligible: false, reason: 'No recent evidence (all signals older than 14 days)' };
  }
  if (ctx.conflicts_with_locked_constraints) {
    return { eligible: false, reason: 'Candidate conflicts with locked constraints' };
  }
  if (ctx.already_acted_recently) {
    return { eligible: false, reason: 'Already acted on this topic in the last 7 days' };
  }

  // Must have at least one anchor for a grounded artifact.
  // write_document, wait_rationale, and do_nothing are groundable without a recipient or time.
  // send_message and schedule_block require a real recipient or due date.
  const SELF_GROUNDABLE_TYPES = new Set(['write_document', 'wait_rationale', 'do_nothing']);
  const hasAnchor =
    ctx.has_real_recipient ||
    ctx.has_due_date_or_time_anchor ||
    SELF_GROUNDABLE_TYPES.has(ctx.candidate_class);

  if (!hasAnchor) {
    return { eligible: false, reason: 'No real recipient, due date, or groundable artifact type' };
  }

  return { eligible: true, reason: 'Passed all eligibility checks' };
}

// ---------------------------------------------------------------------------
// Part 2 continued — Build prompt from structured context
// ---------------------------------------------------------------------------

function buildPromptFromStructuredContext(ctx: StructuredContext): string {
  const sections: string[] = [];

  // Convergent analysis + goal-primacy constraint.
  sections.push(
    `CONVERGENT_ANALYSIS:\n` +
    `You are not a task manager. You are a second brain analyzing someone's life across all domains simultaneously.\n\n` +
    `The user is intelligent. They have already thought of the obvious moves.\n` +
    `The only acceptable artifact is one they could not have generated themselves.\n\n` +
    `Before selecting any artifact type, work through these four questions in order:\n\n` +
    `1. ALREADY TRIED — Check ALREADY_SENT_14D and RECENT_ACTIONS_7D below.\n` +
    `   What has the user already done? Any artifact that the user has already attempted — ` +
    `even reworded — is disqualified. If your candidate appears in either list, discard it and find another angle.\n\n` +
    `2. NON-OBVIOUS LEVER — What is the second or third move?\n` +
    `   Not "follow up with X." The thing you only see if you look across ALL signals at once. ` +
    `What changes the geometry of the problem rather than nudging it?\n\n` +
    `3. DOMAIN CROSSING — What does career + financial + relationship combined reveal?\n` +
    `   The stuck feeling lives at the intersection of domains, not inside one of them. ` +
    `What is visible only when you hold all three simultaneously?\n\n` +
    `4. COUNTDOWN NOT YET VISIBLE — What deadline or closing window is implied by the situation ` +
    `but not yet named by the user? Not the date they stated — the one the signals imply.\n\n` +
    `RULE — TWO PATHS:\n\n` +
    `PATH A: CANDIDATE_CLASS is "commitment"\n` +
    `This is work the user already committed to. Produce the finished artifact. ` +
    `MANDATORY: wait_rationale is FORBIDDEN for commitment candidates. ` +
    `If send_message recipient email is not in the signals, produce write_document instead (a ready-to-use prep brief, draft, or research note). ` +
    `write_document must still be one decisive finished product — not an outline, not a plan with options, not notes. ` +
    `Do the work.\n\n` +
    `PATH B: CANDIDATE_CLASS is anything else\n` +
    `Apply the four questions above. You may only fire if you can complete: ` +
    `"This moves [user] toward [specific goal] because [specific non-obvious gap] means [specific action] is right on [today's date]." ` +
    `If you cannot complete that sentence, output wait_rationale — but only with a specific behavioral insight the user genuinely didn't know, not a status report.`,
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

  if (ctx.candidate_goal) {
    sections.push(`GOAL_ALIGNMENT:\n${ctx.candidate_goal}`);
  }

  sections.push(`SCORE: ${ctx.candidate_score.toFixed(2)}`);

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

  sections.push(
    'CRITICAL: Use ONLY real names, emails, dates, and details from the context above. ' +
    'NEVER use bracket placeholders like [Name], [Company], [Date]. ' +
    'If a detail is unknown, write around it. Every field must contain real content. ' +
    'If action_type is send_message, the "to" field MUST be a real email address extracted from the signals above. ' +
    'If no real email exists in the signals, change action_type to write_document instead. ' +
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
    const metaName = nameFields.filter(Boolean).join(' ');

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

function extractAllEmailAddresses(winner: ScoredLoop): string[] {
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
    (e) => !e.includes('example') && !e.includes('placeholder') && !e.includes('noreply'),
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

  if (keywords.length > 0 && snippets.length < 8) {
    const { data: contextRows } = await supabase
      .from('tkg_signals')
      .select('content, source, occurred_at, author, type')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', fourteenDaysAgo)
      .order('occurred_at', { ascending: false })
      .limit(50);

    const existingTexts = new Set(snippets.map((s) => s.snippet.slice(0, 60)));

    for (const row of contextRows ?? []) {
      if (snippets.length >= 8) break;
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
        if (snippets.length >= 8) break;
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
    directive: typeof parsed.directive === 'string' ? parsed.directive : '',
    artifact_type: artifactType,
    artifact,
    evidence: typeof parsed.evidence === 'string' ? parsed.evidence : '',
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
  validateStringField(payload.evidence, 'evidence', issues);
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
  if (payload.evidence && BRACKET_PLACEHOLDER_RE.test(payload.evidence)) {
    issues.push('evidence contains bracket placeholder text');
  }

  // Secondary: banned coaching language (backup gate)
  if (directive && containsBannedLanguage(directive)) {
    issues.push('directive uses coaching/advice language');
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
    evidence: [{ description: payload.evidence }],
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

  return [...new Set(issues)];
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
    directive: `Hold on "${winner.title.slice(0, 60)}" — waiting for new evidence before acting.`,
    artifact_type: 'wait_rationale',
    artifact: {
      why_wait: reason,
      what_changes: 'New signal or deadline within the next 7 days.',
      tripwire_date: tripwireDate,
      trigger_condition: 'Fresh signal arrives or deadline passes.',
    },
    evidence: `Based on: ${winner.title.slice(0, 100)}`,
    why_now: reason,
  };
}

function buildDeterministicDoNothing(reason: string, blockedBy: string): GeneratedDirectivePayload {
  return {
    directive: 'No candidate cleared the threshold for an executable artifact today.',
    artifact_type: 'do_nothing',
    artifact: {
      exact_reason: reason,
      blocked_by: blockedBy,
    },
    evidence: 'No viable candidate met all eligibility checks.',
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

  return Math.max(40, Math.min(95, Math.round(40 + (composite * 55))));
}

// ---------------------------------------------------------------------------
// Evidence / context builders for directive output
// ---------------------------------------------------------------------------

function buildEvidenceItems(result: ScorerResult, payload: GeneratedDirectivePayload): EvidenceItem[] {
  const evidence: EvidenceItem[] = [
    { type: 'signal', description: payload.evidence.trim() },
  ];

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
    `Winning loop: ${result.winner.title}`,
    result.winner.content,
    payload.evidence.trim(),
    payload.why_now.trim(),
  ];

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

    // Commitment override: if the model returned wait_rationale for a commitment candidate,
    // convert to write_document. Build content from signal context, not the model's why_wait
    // (which is internal reasoning about why it can't act — not a useful document body).
    if (parsed && parsed.artifact_type === 'wait_rationale' && ctx.candidate_class === 'commitment') {
      const signalLines = ctx.supporting_signals
        .slice(0, 3)
        .map((s) => `- ${s.summary || s.entity || ''}`.trim())
        .filter((line) => line.length > 2);
      const signalContext = signalLines.length > 0
        ? `\n\nRelated signals:\n${signalLines.join('\n')}`
        : '';
      parsed = {
        ...parsed,
        directive: `Prep brief ready for: ${ctx.candidate_title.slice(0, 80)}`,
        artifact_type: 'write_document',
        artifact: {
          title: `Prep brief: ${ctx.candidate_title.slice(0, 80)}`,
          content: `Committed action: ${ctx.candidate_title}${signalContext}\n\nReview the above context and execute when ready.`,
          document_purpose: 'Reference material for the committed action',
          target_reader: 'Brandon',
        },
      };
      console.error('[generator] Commitment candidate: converted wait_rationale → write_document (prep brief)');
    }

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
Valid artifact_type values: ${validRetryTypes}.
Do NOT use decision_frame, research_brief, drafted_email, document, or calendar_event.
Do NOT use bracket placeholders like [Name], [Company], [Date].
Use REAL details from the evidence provided.

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
    if (!options.dryRun && await isOverDailyLimit(userId)) {
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

    // Part 2b: Multi-candidate viability competition — select final winner from top candidates
    // before any hydration or expensive DB work fires on the wrong candidate.
    const { winner: finalWinner, competitionContext } = selectFinalWinner(
      scored.topCandidates ?? [scored.winner],
      guardrails,
    );

    // CE-1: Run conviction engine in parallel with winner hydration — both only need userId.
    // Non-blocking: if burn rate cannot be inferred, returns null; generator continues normally.
    const topGoalText = finalWinner.matchedGoal?.text ?? finalWinner.title ?? '';
    const [hydratedWinner, convictionDecision] = await Promise.all([
      hydrateWinnerRelationshipContext(userId, finalWinner),
      topGoalText
        ? (async (): Promise<import('./conviction-engine').ConvictionDecision | null> => {
            try {
              const { runConvictionEngine } = await import('./conviction-engine');
              // Hard 4-second cap so conviction math never blocks the pipeline
              const result = await Promise.race([
                runConvictionEngine(userId, topGoalText),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
              ]);
              if (result) {
                console.log(`[generator] conviction math: prob=${result.situationModel.primaryOutcomeProbability}, stopSecondGuessing=${result.stopSecondGuessing}`);
              }
              return result;
            } catch (ceErr) {
              console.warn(`[generator] conviction engine failed (non-fatal): ${ceErr instanceof Error ? ceErr.message : String(ceErr)}`);
              return null;
            }
          })()
        : Promise.resolve(null),
    ]);

    // Fetch signal evidence
    let signalEvidence: SignalSnippet[] = [];
    try {
      signalEvidence = await fetchWinnerSignalEvidence(userId, hydratedWinner);
    } catch (ctxErr: unknown) {
      // Non-blocking but log context degradation so it's visible in Sentry/Vercel
      logStructuredEvent({
        event: 'generator_signal_evidence_failed',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'context_degraded',
        details: {
          scope: 'generator',
          stage: 'fetchWinnerSignalEvidence',
          error: ctxErr instanceof Error ? ctxErr.message : String(ctxErr),
        },
      });
    }

    if (CONTACT_ACTION_TYPES.has(hydratedWinner.suggestedActionType)) {
      const selfNameTokens = await fetchUserSelfNameTokens(userId);
      const candidateEntities = extractEntityNamesFromCandidate(hydratedWinner, signalEvidence, selfNameTokens);
      const recentEntityConflict = await findRecentEntityActionConflict(userId, candidateEntities);
      if (recentEntityConflict.matched) {
        const suppressionReason = `Suppressed: action for "${recentEntityConflict.entityName}" already exists in the last 7 days.`;
        const fallbackPayload = buildDeterministicDoNothing(
          suppressionReason,
          `Recent action id ${recentEntityConflict.actionId}`,
        );

        logStructuredEvent({
          event: 'generation_skipped',
          level: 'info',
          userId,
          artifactType: hydratedWinner.suggestedActionType === 'schedule' ? 'schedule_block' : 'send_message',
          generationStatus: 'recent_entity_action_suppressed',
          details: {
            scope: 'generator',
            entity_name: recentEntityConflict.entityName,
            action_id: recentEntityConflict.actionId,
          },
        });

        return {
          directive: fallbackPayload.directive,
          action_type: 'do_nothing',
          confidence: 0,
          reason: suppressionReason,
          evidence: [],
          embeddedArtifact: fallbackPayload.artifact,
          embeddedArtifactType: fallbackPayload.artifact_type,
          generationLog: buildNoSendGenerationLog(suppressionReason, 'validation', scored.candidateDiscovery),
        } as ConvictionDirective & { embeddedArtifact?: Record<string, unknown>; embeddedArtifactType?: string };
      }
    }

    // Research phase
    let insight: ResearchInsight | null = null;
    if (finalWinner.score >= 2.0) {
      try {
        insight = await researchWinner(userId, hydratedWinner, { dryRun: options.dryRun });
      } catch {
        logStructuredEvent({
          event: 'researcher_fallthrough', level: 'warn', userId,
          artifactType: null, generationStatus: 'researcher_fallthrough',
          details: { scope: 'generator' },
        });
      }
    } else {
      logStructuredEvent({
        event: 'researcher_skipped_low_score',
        level: 'info',
        userId,
        artifactType: null,
        generationStatus: 'researcher_skipped',
        details: {
          scope: 'generator',
          winner_score: finalWinner.score,
          threshold: 2.0,
        },
      });
    }

    // Fetch user goals for identity context (top 5 by priority, exclude placeholders)
    const supabase = createServerClient();
    const { data: userGoalsData } = await supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category, source')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: false })
      .limit(10);

    const goalsForContext = ((userGoalsData ?? []) as Array<{ goal_text: string; priority: number; goal_category: string; source?: string }>)
      .filter((g) => !PLACEHOLDER_GOAL_SOURCES.has(g.source ?? ''))
      .slice(0, 5);
    console.log(`[generator] goalsForContext: ${goalsForContext.length} goals for user ${userId.slice(0, 8)}`);

    // Build goal-gap analysis (parallel-safe, queries its own data)
    let goalGapAnalysis: GoalGapEntry[] = [];
    try {
      goalGapAnalysis = await buildGoalGapAnalysis(userId);
      console.log(`[generator] goalGapAnalysis: ${goalGapAnalysis.length} entries, top gap: ${goalGapAnalysis[0]?.gap_level ?? 'none'}`);
    } catch (err) {
      console.error(`[generator] goalGapAnalysis failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Fetch sent mail (14d), weekly behavioral history, and avoidance observations in parallel
    const [alreadySentResult, behavioralHistoryResult, avoidanceObservationsResult] = await Promise.allSettled([
      // Sent mail — what user has already done; model must not re-suggest
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

      // Weekly behavioral history — last 8 weeks of signal_summaries
      (async (): Promise<string | null> => {
        const { data: summaries } = await supabase
          .from('signal_summaries')
          .select('week_start, week_end, signal_count, themes, people, summary, emotional_tone')
          .eq('user_id', userId)
          .order('week_start', { ascending: false })
          .limit(8);
        if (!summaries || summaries.length === 0) return null;
        // Oldest first so the model reads chronologically
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

      // Pre-computed avoidance signals — unopened replies and aging commitments
      buildAvoidanceObservations(userId, hydratedWinner, signalEvidence),
    ]);

    const alreadySent = alreadySentResult.status === 'fulfilled' ? alreadySentResult.value : [];
    const behavioralHistory = behavioralHistoryResult.status === 'fulfilled' ? behavioralHistoryResult.value : null;
    const avoidanceObservations = avoidanceObservationsResult.status === 'fulfilled' ? avoidanceObservationsResult.value : [];

    // Part 3: Build structured context (conviction math + behavioral history injected when available)
    const ctx = buildStructuredContext(
      hydratedWinner, guardrails, userId, signalEvidence, insight,
      goalsForContext,
      goalGapAnalysis,
      scored.antiPatterns,
      scored.divergences,
      alreadySent,
      convictionDecision,
      behavioralHistory,
      avoidanceObservations,
      competitionContext,
    );

    // Part 4: Evidence gating — check eligibility before calling LLM
    const eligibility = checkGenerationEligibility(ctx);
    if (!eligibility.eligible) {
      logStructuredEvent({
        event: 'generation_skipped', level: 'warn', userId,
        artifactType: null, generationStatus: 'eligibility_gate_failed',
        details: { scope: 'generator', reason: eligibility.reason },
      });

      // Deterministic do_nothing — no LLM call
      const fallbackPayload = buildDeterministicDoNothing(
        eligibility.reason,
        `Candidate: ${hydratedWinner.title.slice(0, 80)}`,
      );

      return {
        directive: fallbackPayload.directive,
        action_type: 'do_nothing',
        confidence: 0,
        reason: eligibility.reason,
        evidence: [],
        embeddedArtifact: fallbackPayload.artifact,
        embeddedArtifactType: fallbackPayload.artifact_type,
        generationLog: buildNoSendGenerationLog(eligibility.reason, 'validation', scored.candidateDiscovery),
      } as ConvictionDirective & { embeddedArtifact?: Record<string, unknown>; embeddedArtifactType?: string };
    }

    // Generate with LLM
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
        details: {
          scope: 'generator',
          error: errorMessage,
        },
      });
      payloadResult = {
        issues: [`Generation request failed: ${errorMessage}`],
        payload: null,
      };
    }

    // Part 6: If generation fails, deterministic fallback
    if (!payloadResult.payload) {
      const failureReason = formatValidationFailureReason('Generation validation failed:', payloadResult.issues);

      // Generation validation failed after all retries. Return empty — no LLM output to preserve.

      return emptyDirective(
        failureReason,
        buildNoSendGenerationLog(failureReason, 'generation', scored.candidateDiscovery),
      );
    }

    const payload = payloadResult.payload;

    // Gate 3: wait_rationale means the goal-primacy constraint couldn't be met.
    // Preserve the model's behavioral insight in fullContext so buildWaitRationale can surface it.
    if (payload.artifact_type === 'wait_rationale') {
      const whyWait = (payload.artifact as Record<string, unknown>)?.why_wait;
      const modelInsight = typeof whyWait === 'string' ? whyWait.trim() : '';
      logStructuredEvent({
        event: 'generation_skipped', level: 'info', userId,
        artifactType: 'wait_rationale', generationStatus: 'goal_primacy_gate_suppressed',
        details: { scope: 'generator', why_wait: modelInsight },
      });
      return {
        directive: GENERATION_FAILED_SENTINEL,
        action_type: 'do_nothing',
        confidence: 0,
        reason: 'Goal-primacy gate: candidate could not be anchored to a goal today.',
        evidence: [],
        fullContext: modelInsight || undefined,
        generationLog: buildNoSendGenerationLog('goal_primacy_gate_suppressed', 'generation', scored.candidateDiscovery),
      };
    }

    // Part 5b: Consecutive duplicate suppression — reject if >70% similar to last 3 directives
    const duplicateCheck = await checkConsecutiveDuplicate(userId, payload.directive);
    if (duplicateCheck.isDuplicate) {
      logStructuredEvent({
        event: 'duplicate_directive_suppressed', level: 'warn', userId,
        artifactType: payload.artifact_type, generationStatus: 'duplicate_suppressed',
        details: {
          scope: 'generator',
          new_directive: payload.directive.slice(0, 100),
          matching_action_id: duplicateCheck.matchingActionId,
          similarity: duplicateCheck.similarity,
        },
      });

      const dupReason = `Duplicate directive suppressed (${Math.round((duplicateCheck.similarity ?? 0) * 100)}% similar to recent action ${duplicateCheck.matchingActionId})`;
      return emptyDirective(
        dupReason,
        buildNoSendGenerationLog(dupReason, 'validation', scored.candidateDiscovery),
      );
    }

    // Confidence check — load per-user dynamic threshold from DB
    const confidence = computeDirectiveConfidence(scored);
    const dynamicThreshold = await loadDirectiveConfidenceThreshold(userId);
    if (confidence < dynamicThreshold) {
      logStructuredEvent({
        event: 'generation_skipped', level: 'warn', userId,
        artifactType: payload.artifact_type, generationStatus: 'below_confidence_threshold',
        details: { scope: 'generator', confidence, threshold: dynamicThreshold },
      });
      return emptyDirective(
        'No directive cleared the confidence bar.',
        buildNoSendGenerationLog('No directive cleared the confidence bar.', 'validation', scored.candidateDiscovery),
      );
    }

    const directive = {
      directive: payload.directive.trim(),
      action_type: artifactTypeToActionType(payload.artifact_type),
      confidence,
      reason: payload.why_now.trim(),
      evidence: buildEvidenceItems(scored, payload),
      fullContext: buildFullContext({ ...scored, winner: hydratedWinner }, payload),
      embeddedArtifact: payload.artifact,
      embeddedArtifactType: payload.artifact_type,
      generationLog: buildSelectedGenerationLog(scored.candidateDiscovery),
    } as ConvictionDirective & {
      embeddedArtifact?: Record<string, unknown>;
      embeddedArtifactType?: string;
    };

    // Persistence validation
    const persistenceIssues = validateDirectiveForPersistence({
      userId,
      directive,
      artifact: payload.artifact,
    });
    if (persistenceIssues.length > 0) {
      logStructuredEvent({
        event: 'generation_skipped', level: 'warn', userId,
        artifactType: payload.artifact_type, generationStatus: 'persistence_validation_failed',
        details: { scope: 'generator', issues: persistenceIssues },
      });
      return emptyDirective(
        formatValidationFailureReason('Directive rejected by persistence validation:', persistenceIssues),
        buildNoSendGenerationLog(
          formatValidationFailureReason('Directive rejected by persistence validation:', persistenceIssues),
          'validation',
          scored.candidateDiscovery,
        ),
      );
    }

    logStructuredEvent({
      event: 'directive_generated', userId,
      artifactType: payload.artifact_type, generationStatus: 'generated',
      details: {
        scope: 'generator',
        action_type: artifactTypeToActionType(payload.artifact_type),
        winner_type: finalWinner.type,
        score: Number(finalWinner.score.toFixed(2)),
      },
    });

    return directive;
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
