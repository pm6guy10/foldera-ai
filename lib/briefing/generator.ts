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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATION_FAILED_SENTINEL = '__GENERATION_FAILED__';
const GENERATION_MODEL = 'claude-sonnet-4-20250514';
const APPROVAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DIRECTIVE_CONFIDENCE_THRESHOLD = 45;
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

VALID ARTIFACT TYPES AND SCHEMAS

1. send_message — artifact_type: "send_message"
{
  "to": "real@email.com",
  "subject": "Specific subject line",
  "body": "Complete email body with greeting and sign-off"
}
Requirements: real recipient email in "to" (or empty string if none available), non-empty subject, non-empty body ready to send as-is.

2. write_document — artifact_type: "write_document"
{
  "document_purpose": "brief|plan|summary|proposal|checklist",
  "target_reader": "Who this document is for",
  "title": "Document title",
  "content": "Complete document in markdown"
}
Requirements: explicit document_purpose, target_reader, title, non-empty final content. Must be a finished artifact, not notes or an outline.

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
  action_count_14d: number;
  gap_level: 'HIGH' | 'MEDIUM' | 'LOW';
  gap_description: string;
}

/**
 * For every active (non-placeholder) goal, count how many signals and
 * completed actions relate to it in the last 14 days.  Then compute the
 * gap between stated priority and actual behavior.
 *
 * Returns up to 5 goals ordered by priority descending.
 */
async function buildGoalGapAnalysis(userId: string): Promise<GoalGapEntry[]> {
  const supabase = createServerClient();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Fetch all active goals (exclude placeholder sources)
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

  // 2. Fetch recent signals (14d) — just counts per category/keyword
  const { data: signalRows } = await supabase
    .from('tkg_signals')
    .select('content, source, occurred_at')
    .eq('user_id', userId)
    .eq('processed', true)
    .gte('occurred_at', fourteenDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(200);

  // 3. Fetch recent completed actions (14d)
  const { data: actionRows } = await supabase
    .from('tkg_actions')
    .select('directive_text, action_type, status, generated_at')
    .eq('user_id', userId)
    .in('status', ['approved', 'executed'])
    .gte('generated_at', fourteenDaysAgo)
    .limit(100);

  const signals = signalRows ?? [];
  const actions = actionRows ?? [];

  // Build keyword sets for each goal
  const goalKeywordSets = goals.map((g) => {
    const words = g.goal_text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    return { ...g, keywords: words };
  });

  const entries: GoalGapEntry[] = [];

  for (const goal of goalKeywordSets) {
    // Count signals matching this goal by keyword overlap or category
    let signalCount = 0;
    for (const s of signals) {
      const content = ((s.content as string) ?? '').toLowerCase();
      const catMatch = (s.source as string ?? '').toLowerCase().includes(goal.goal_category);
      const kwMatch = goal.keywords.length > 0 &&
        goal.keywords.filter((kw) => content.includes(kw)).length >= Math.min(2, goal.keywords.length);
      if (catMatch || kwMatch) signalCount++;
    }

    // Count actions matching this goal
    let actionCount = 0;
    for (const a of actions) {
      const text = ((a.directive_text as string) ?? '').toLowerCase();
      const kwMatch = goal.keywords.length > 0 &&
        goal.keywords.filter((kw) => text.includes(kw)).length >= Math.min(2, goal.keywords.length);
      if (kwMatch) actionCount++;
    }

    // Compute gap: high priority + low activity = HIGH gap
    let gap_level: GoalGapEntry['gap_level'];
    let gap_description: string;

    if (goal.priority >= 4 && signalCount <= 3 && actionCount === 0) {
      gap_level = 'HIGH';
      gap_description = `Stated top priority, near-zero behavioral footprint. ${signalCount} signal${signalCount !== 1 ? 's' : ''} in 14 days, 0 completed actions.`;
    } else if (goal.priority >= 3 && (signalCount <= 5 || actionCount === 0)) {
      gap_level = signalCount > 10 && actionCount === 0 ? 'MEDIUM' : (signalCount <= 5 ? 'HIGH' : 'LOW');
      gap_description = signalCount > 10 && actionCount === 0
        ? `High signal activity (${signalCount}), but no conversion to completed actions.`
        : `${signalCount} signal${signalCount !== 1 ? 's' : ''} in 14 days, ${actionCount} completed action${actionCount !== 1 ? 's' : ''}.`;
    } else {
      gap_level = 'LOW';
      gap_description = `${signalCount} signals, ${actionCount} completed actions in 14 days — behavior and priority are roughly aligned.`;
    }

    entries.push({
      goal_text: goal.goal_text,
      priority: goal.priority,
      category: goal.goal_category,
      signal_count_14d: signalCount,
      action_count_14d: actionCount,
      gap_level,
      gap_description,
    });
  }

  // Sort: HIGH gaps first, then by priority descending
  const gapOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  entries.sort((a, b) => {
    const gapDiff = gapOrder[a.gap_level] - gapOrder[b.gap_level];
    if (gapDiff !== 0) return gapDiff;
    return b.priority - a.priority;
  });

  return entries;
}

// ---------------------------------------------------------------------------
// Part 3 — Structured context (preprocessing)
// ---------------------------------------------------------------------------

interface CompressedSignal {
  source: string;
  occurred_at: string;
  entity: string | null;
  summary: string;
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
}

function buildStructuredContext(
  winner: ScoredLoop,
  guardrails: { approvedRecently: RecentActionRow[]; skippedRecently: RecentSkippedActionRow[] },
  userId: string,
  signalEvidence: SignalSnippet[],
  insight: ResearchInsight | null,
  userGoals?: Array<{ goal_text: string; priority: number; goal_category: string }>,
  goalGapAnalysis?: GoalGapEntry[],
): StructuredContext {
  // Compress supporting signals to max 5
  const supporting_signals: CompressedSignal[] = signalEvidence.slice(0, 5).map((s) => ({
    source: s.source,
    occurred_at: s.date,
    entity: s.author,
    summary: [s.subject, s.snippet.slice(0, 150)].filter(Boolean).join(' — '),
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
  for (const s of signalEvidence.slice(0, 3)) {
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
  };
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

  // Goal-gap analysis FIRST — this is the primary analytical lens
  if (ctx.goal_gap_analysis.length > 0) {
    const gapLines = ctx.goal_gap_analysis.map((g) => {
      return `[priority ${g.priority}] ${g.goal_text}\n  → ${g.signal_count_14d} signals in 14 days, ${g.action_count_14d} completed actions\n  → Gap: ${g.gap_level} — ${g.gap_description}`;
    });
    sections.push(`GOAL_GAP_ANALYSIS:\nYour primary question: which goal has the biggest gap between stated priority and actual behavior? Start there. Then find the one finished action that closes the most important gap.\n\n${gapLines.join('\n\n')}`);
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
    const signalLines = ctx.supporting_signals.map((s) =>
      `- [${s.occurred_at}] [${s.source}]${s.entity ? ` From: ${s.entity}` : ''} ${s.summary}`);
    sections.push(`SUPPORTING_SIGNALS:\n${signalLines.join('\n')}`);
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
    sections.push('ARTIFACT_PREFERENCE: send_message is strongly preferred when a real recipient email is available.');
  } else if (ctx.has_due_date_or_time_anchor) {
    sections.push('ARTIFACT_PREFERENCE: schedule_block is preferred when a time anchor exists.');
  } else {
    sections.push('ARTIFACT_PREFERENCE: write_document is the default when no recipient or time anchor exists.');
  }

  sections.push(
    'CRITICAL: Use ONLY real names, emails, dates, and details from the context above. ' +
    'NEVER use bracket placeholders like [Name], [Company], [Date]. ' +
    'If a detail is unknown, write around it. Every field must contain real content. ' +
    'If action_type is send_message, the "to" field MUST be a real email address extracted from the signals above. ' +
    'If no real email exists in the signals, change action_type to write_document instead. ' +
    'NEVER invent a person\'s name or email.',
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

function extractEntityNamesFromCandidate(
  winner: ScoredLoop,
  signalEvidence: SignalSnippet[],
): string[] {
  const byKey = new Map<string, string>();

  const addCandidate = (value: string | null | undefined): void => {
    if (!value) return;
    const normalized = normalizeText(value);
    if (!normalized) return;
    const tokens = normalized.split(' ').filter((token) => token.length >= 3);
    if (tokens.length === 0) return;
    if (tokens.every((token) => ENTITY_NAME_STOPWORDS.has(token))) return;
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
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const sourceIds = (winner.sourceSignals ?? [])
    .map((s) => s.id)
    .filter((id): id is string => Boolean(id));

  const snippets: SignalSnippet[] = [];

  if (sourceIds.length > 0) {
    const { data: sourceRows } = await supabase
      .from('tkg_signals')
      .select('content, source, occurred_at, author')
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
      .select('content, source, occurred_at, author')
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
  const snippet = contentLines.join(' ').slice(0, 300).trim();

  return {
    source: (row.source as string) ?? 'unknown',
    date: row.occurred_at ? new Date(row.occurred_at as string).toISOString().slice(0, 10) : 'unknown',
    subject,
    snippet: snippet || plaintext.slice(0, 300),
    author: (row.author as string) ?? null,
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
  const tripwireDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
      max_tokens: 3200,
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
      attempts.push({
        role: 'user',
        content: `Validation failed. Fix these issues and return JSON only.
Valid artifact_type values: send_message, write_document, schedule_block, wait_rationale, do_nothing.
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

    const hydratedWinner = await hydrateWinnerRelationshipContext(userId, scored.winner);

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
      const candidateEntities = extractEntityNamesFromCandidate(hydratedWinner, signalEvidence);
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
    if (scored.winner.score >= 2.0) {
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
          winner_score: scored.winner.score,
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

    // Part 3: Build structured context
    const ctx = buildStructuredContext(
      hydratedWinner, guardrails, userId, signalEvidence, insight,
      goalsForContext,
      goalGapAnalysis,
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

      // Try wait_rationale fallback if the candidate has grounding
      if (ctx.has_recent_evidence) {
        const waitFallback = buildDeterministicWaitRationale(hydratedWinner, failureReason);
        logStructuredEvent({
          event: 'generation_fallback', level: 'warn', userId,
          artifactType: 'wait_rationale', generationStatus: 'deterministic_fallback',
          details: { scope: 'generator', original_issues: payloadResult.issues },
        });

        return {
          directive: waitFallback.directive,
          action_type: 'do_nothing',
          confidence: 0,
          reason: failureReason,
          evidence: [],
          embeddedArtifact: waitFallback.artifact,
          embeddedArtifactType: waitFallback.artifact_type,
          generationLog: buildNoSendGenerationLog(failureReason, 'generation', scored.candidateDiscovery),
        } as ConvictionDirective & { embeddedArtifact?: Record<string, unknown>; embeddedArtifactType?: string };
      }

      return emptyDirective(
        failureReason,
        buildNoSendGenerationLog(failureReason, 'generation', scored.candidateDiscovery),
      );
    }

    const payload = payloadResult.payload;

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
        winner_type: scored.winner.type,
        score: Number(scored.winner.score.toFixed(2)),
      },
    });

    return directive;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
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
