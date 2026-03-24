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
const DIRECTIVE_CONFIDENCE_THRESHOLD = 45;
const STALE_SIGNAL_THRESHOLD_DAYS = 14;

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

const SYSTEM_PROMPT = `You are Foldera's insight engine. Your job is to find the ONE thing this person is most likely avoiding, not seeing, or underestimating — and deliver a finished artifact that removes the friction.

You are not a task manager, calendar app, reminder service, or productivity coach. You do not surface what's "due." You surface what's STUCK.

WHAT MAKES A GOOD DIRECTIVE
- It names something the user hasn't acted on despite having reason to.
- It connects a behavioral gap to a real goal: "You said X matters, but you haven't done Y, and the window closes on Z."
- It delivers a finished artifact that makes the avoided action trivially easy to execute.
- The user's reaction should be "oh shit, you're right" — not "yeah I know."

WHAT MAKES A BAD DIRECTIVE
- Routine maintenance: "review security settings", "check your credit score", "organize your files"
- Tasks with no urgency or consequence: anything the user could do next week with identical outcome
- Things the user already knows and is actively managing
- Generic productivity: "block time for", "schedule a review of", "set aside 30 minutes"
- Anything where the user's response would be "so what?"
- Documents that explain, rationalize, or justify inaction. "Document why X can wait" is homework. If the right answer is to wait, output wait_rationale — don't write an essay about it.
- Any artifact where the finished work IS the thinking, not the doing. A drafted email is doing. A call script is doing. A decision rationale document is thinking. Thinking is the user's job.

DECISION FRAMEWORK
1. Is there evidence the user has been AVOIDING this, not just that it exists?
   - Signals: commitment older than 7 days with no progress, deadline approaching with no prep, goal stated repeatedly but no action
   - If no avoidance signal: output wait_rationale.
2. Is there a timing window that makes TODAY matter?
   - Deadline within 7 days, relationship going cold, opportunity expiring
   - If no timing pressure: output wait_rationale.
3. Does the artifact actually remove friction?
   - Drafted email = removes friction (user just hits send).
   - Finished document = removes friction (user just shares it).
   - Calendar hold / schedule_block = removes NOTHING. The user can make their own calendar event. Never output schedule_block unless the candidate already passed tests 1 and 2 independently.
4. Would the user be surprised or relieved?
   - Surprised or relieved = GOOD.
   - Indifferent = BAD. Output wait_rationale.

EXAMPLES OF GOOD VS BAD

BAD: "Schedule a 30-minute block to review your Google account security settings"
WHY BAD: Routine maintenance. No avoidance. No timing. No friction removed. The user would say "so what?"

BAD: "Document why credit monitoring can wait until after the MA4 search cycle"
WHY BAD: Homework. The artifact IS the thinking. If waiting is correct, output wait_rationale — don't write an essay about it.

BAD: "Check your credit score through your existing monitoring service"
WHY BAD: Routine. The user knows they can check their credit score. No surprise. No relief.

GOOD: "Email Yadira Clapper to ask for the MAS3 hiring timeline" + drafted email artifact
WHY GOOD: The user has been waiting on this for 2 weeks with no action. The email removes friction — they just hit approve. Surprise: "I should have done this already."

GOOD: "Reply to the SAO Share invitation before access expires Friday" + drafted reply artifact
WHY GOOD: Real deadline. Real consequence. The drafted reply removes friction. Relief: "I almost missed this."

IF ALL CANDIDATES ARE ROUTINE/MAINTENANCE/HOUSEKEEPING: output wait_rationale. Do NOT try to dress up a bad candidate with a better artifact. The candidate itself must pass the avoidance + timing test.

SILENCE IS BETTER THAN NOISE
If no candidate passes the avoidance + timing + friction test, output wait_rationale. A correct "nothing today" protects trust. A bad directive destroys it. The user will stop opening the email if it's noise twice in a row.

CORE PRODUCT RULES
- One directive only.
- One artifact only.
- The artifact is the product.
- If approval would not materially change reality, fail.
- If the user would need to rewrite, reinterpret, or figure out next steps after approval, fail.
- Silence with a specific reason is better than fake usefulness.

NEVER OUTPUT
- affirmations, emotional support, wellness guidance
- "take a break", "reflect on", "consider", "explore", "think about"
- vague productivity suggestions, life advice
- strategic framing with no action
- placeholder text, anything requiring manual editing after approval
- decision menus asking the user to choose between options

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
Requirements: title, reason, start or scheduling target, duration.

4. wait_rationale — artifact_type: "wait_rationale"
{
  "why_wait": "Why waiting is correct now",
  "what_changes": "What would change the calculus",
  "tripwire_date": "YYYY-MM-DD",
  "trigger_condition": "Exact trigger condition if known"
}
Requirements: why_wait, tripwire_date, trigger_condition.

5. do_nothing — artifact_type: "do_nothing"
{
  "exact_reason": "Exact reason no candidate cleared threshold",
  "blocked_by": "Specific reference to the blocking condition"
}
Requirements: exact_reason, blocked_by.

OUTPUT FORMAT
Return strict JSON only:
{
  "directive": "One imperative sentence with the exact move",
  "artifact_type": "send_message|write_document|schedule_block|wait_rationale|do_nothing",
  "artifact": {},
  "evidence": "One sentence naming the decisive evidence",
  "why_now": "One sentence explaining why this wins today"
}`;

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
}

function buildStructuredContext(
  winner: ScoredLoop,
  guardrails: { approvedRecently: RecentActionRow[]; skippedRecently: RecentSkippedActionRow[] },
  userId: string,
  signalEvidence: SignalSnippet[],
  insight: ResearchInsight | null,
  userGoals?: Array<{ goal_text: string; priority: number; goal_category: string }>,
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
The user's current priorities:
${lines.join('\n')}
- Directives that move these priorities forward or handle time-sensitive obligations are high value.
- Directives about tool configuration, account settings, internal system maintenance, or generic productivity are low value and should become wait_rationale instead.
- If the best candidate is housekeeping or system maintenance, output wait_rationale with why_wait explaining no actionable candidate cleared the bar today.`;
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

  // Must have at least one anchor for a grounded artifact
  const hasAnchor =
    ctx.has_real_recipient ||
    ctx.has_due_date_or_time_anchor ||
    // write_document and wait_rationale can be grounded without recipient/time
    true; // We allow write_document and wait_rationale as always-groundable

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

  // User identity context first — gives the LLM judgment about what matters
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
    'If a detail is unknown, write around it. Every field must contain real content.',
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
  // Map old artifact type names to new contract
  if (value === 'drafted_email' || value === 'email' || value === 'email_compose' || value === 'email_reply') {
    return 'send_message';
  }
  if (value === 'document' || value === 'write_document') {
    return 'write_document';
  }
  if (value === 'calendar_event' || value === 'calendar' || value === 'event' || value === 'schedule' || value === 'schedule_block') {
    return 'schedule_block';
  }
  if (value === 'wait_rationale' || value === 'wait') {
    return 'wait_rationale';
  }
  if (value === 'do_nothing') {
    return 'do_nothing';
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

function extractJsonFromResponse(raw: string): string {
  // Strategy 1: Strip markdown fences (case-insensitive, with optional language tag)
  let cleaned = raw.replace(/```(?:json|JSON)?\s*\n?/g, '').trim();

  // Strategy 2: If the result doesn't start with '{', try to find the JSON object
  if (!cleaned.startsWith('{')) {
    // Look for the first '{' and last '}' to extract the JSON object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  return cleaned;
}

function parseGeneratedPayload(raw: string): GeneratedDirectivePayload | null {
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
  if (input.directive.confidence < DIRECTIVE_CONFIDENCE_THRESHOLD) {
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
      max_tokens: 2400,
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
    } catch {
      // Non-blocking
    }

    // Research phase
    let insight: ResearchInsight | null = null;
    try {
      insight = await researchWinner(userId, hydratedWinner, { dryRun: options.dryRun });
    } catch {
      logStructuredEvent({
        event: 'researcher_fallthrough', level: 'warn', userId,
        artifactType: null, generationStatus: 'researcher_fallthrough',
        details: { scope: 'generator' },
      });
    }

    // Fetch user goals for identity context (top 4 by priority)
    const supabase = createServerClient();
    const { data: userGoalsData } = await supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category')
      .eq('user_id', userId)
      .gte('priority', 3)
      .order('priority', { ascending: false })
      .limit(4);

    // Part 3: Build structured context
    const goalsForContext = (userGoalsData ?? []) as Array<{ goal_text: string; priority: number; goal_category: string }>;
    console.log(`[generator] goalsForContext: ${goalsForContext.length} goals for user ${userId.slice(0, 8)}`);
    const ctx = buildStructuredContext(
      hydratedWinner, guardrails, userId, signalEvidence, insight,
      goalsForContext,
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

    // Confidence check
    const confidence = computeDirectiveConfidence(scored);
    if (confidence < DIRECTIVE_CONFIDENCE_THRESHOLD) {
      logStructuredEvent({
        event: 'generation_skipped', level: 'warn', userId,
        artifactType: payload.artifact_type, generationStatus: 'below_confidence_threshold',
        details: { scope: 'generator', confidence, threshold: DIRECTIVE_CONFIDENCE_THRESHOLD },
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
