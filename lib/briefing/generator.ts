import * as Sentry from '@sentry/nextjs';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import type {
  ActionType,
  ChiefOfStaffBriefing,
  ConvictionArtifact,
  ConvictionDirective,
  DecisionPayload,
  EvidenceBundleReceipt,
  EvidenceItem,
  GenerationCandidateDiscoveryLog,
  GenerationRunLog,
  PipelineDryRunReceipt,
  ValidArtifactTypeCanonical,
} from './types';
import { validateDecisionPayload } from './types';
import type {
  DeprioritizedLoop,
  ScoredLoop,
  ScorerExactBlocker,
  ScorerResult,
  ScorerResultNoValidAction,
  ScorerResultWinnerSelected,
} from './scorer';
import {
  enrichRelationshipContext,
  isThreadBackedSendableLoop,
  passesTop3RankingInvariants,
  scoreOpenLoops,
} from './scorer';
import {
  ANTHROPIC_BUDGET_RESERVE_ESTIMATE_CENTS,
  reserveAnthropicBudgetSlot,
} from '@/lib/cron/api-budget';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { assertPaidLlmAllowed } from '@/lib/llm/paid-llm-gate';
import { isOverDailyLimit, isOverManualCallLimit, trackApiCall } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import {
  getDirectiveConstraintViolations,
  getPinnedConstraintPrompt,
} from './pinned-constraints';
import { researchWinner } from './researcher';
import type { ResearchInsight } from './researcher';
import { decryptWithStatus } from '@/lib/encryption';
import { getSendMessageRecipientGroundingIssues } from '@/lib/conviction/artifact-generator';
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
import { isAutomatedRoutingRecipient } from '@/lib/email/automated-routing-recipient';
import { isLowValueHuntSendMessagePresentation } from './hunt-anomalies';
import { isBlockedSender } from '@/lib/signals/sender-blocklist';
import type { DiscrepancyClass } from './discrepancy-detector';
import { effectiveDiscrepancyClassForGates } from './effective-discrepancy-class';
import { isVerificationStubPersistExecutionResult } from '@/lib/cron/duplicate-truth';
import { looksLikeDiscrepancyTriageOrChoreList } from './discrepancy-finished-work';
import {
  directiveLooksLikeScheduleConflict,
  scheduleConflictArtifactHasResolutionShape,
  scheduleConflictArtifactIsMessageShaped,
  scheduleConflictArtifactIsOwnerProcedure,
} from './schedule-conflict-guards';
import {
  filterPastSupportingSignals,
  getNewestEvidenceTimestampMs,
  hasPastWinnerSourceSignals,
  needsNoThreadNoOutcomeBlock,
} from './thread-evidence-for-payload';
import { buildDiagnosticLensBlock, getVagueMechanismIssues } from './diagnostic-lenses';
import { directiveHasStalePastDates, userFacingStaleDateScanText } from './scorer-failure-suppression';
import {
  findLockedContactsInUserFacingPayload,
  sanitizeConvictionPayloadLockedContactsInPlace,
} from './locked-contact-scan';
import { hasBracketTemplatePlaceholder } from './bracket-placeholder';
import { resolveEvidenceSignalIdsForWinner } from './resolve-evidence-signal-ids';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATION_FAILED_SENTINEL = '__GENERATION_FAILED__';
/** Persisted to `tkg_actions.directive_text` when Postgres budget gate blocks generation. */
export const BUDGET_CAP_DIRECTIVE_SENTINEL = '__BUDGET_CAP_REACHED__';
/** Main directive JSON + retries — Haiku for cost (structured output from fixed prompt). */
const GENERATION_MODEL_FAST = 'claude-haiku-4-5-20251001';
/** Pass-1 anomaly sentence only — Sonnet when quality matters; Haiku when `FOLDERA_ANOMALY_USE_HAIKU=true`. */
const GENERATION_MODEL_REASON = 'claude-sonnet-4-20250514';

const ANOMALY_PROMPT_CHARS_SONNET = 14_000;
const ANOMALY_PROMPT_CHARS_HAIKU = 8_000;

function getAnomalyPassModelAndPromptCap(): { model: string; maxPromptChars: number } {
  if (process.env.FOLDERA_ANOMALY_USE_HAIKU === 'true') {
    return { model: GENERATION_MODEL_FAST, maxPromptChars: ANOMALY_PROMPT_CHARS_HAIKU };
  }
  return { model: GENERATION_MODEL_REASON, maxPromptChars: ANOMALY_PROMPT_CHARS_SONNET };
}
const DEFAULT_DIRECTIVE_CONFIDENCE_THRESHOLD = CONFIDENCE_PERSIST_THRESHOLD;
const STALE_SIGNAL_THRESHOLD_DAYS = 21;

/**
 * Thread-backed external `send_message` proof path: no write_document / schedule_block /
 * wait_rationale / do_nothing wins when enabled.
 *
 * Defaults **on** in production; defaults **off** when `NODE_ENV=test` so Vitest integration
 * tests stay unchanged. Override anytime with `FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY=true|false`.
 */
export function isProofModeThreadBackedSendOnly(): boolean {
  const o = process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY;
  if (o === 'true' || o === '1') return true;
  if (o === 'false' || o === '0') return false;
  return process.env.NODE_ENV !== 'test';
}

/**
 * Thread-backed send-only enforcement: external `send_message` is the only allowed persisted
 * proof outcome — except for **discrepancy winners whose canonical action is not `send_message`**.
 * Those are structural cross-source artifacts (`write_document`, `make_decision`, …); applying
 * send preflight + artifact_type=send gates to them collapses the run to the
 * generation-failed sentinel even when the decision payload is valid.
 * Discrepancy winners that resolve to `send_message` still run the full proof-mode stack.
 */
export function proofModeThreadBackedSendEnforcementApplies(
  winner: Pick<ScoredLoop, 'type'>,
  recommendedAction: ValidArtifactTypeCanonical,
): boolean {
  if (!isProofModeThreadBackedSendOnly()) return false;
  if (winner.type === 'discrepancy' && recommendedAction !== 'send_message') {
    return false;
  }
  return true;
}

/**
 * `unresolved_intent` may set discrepancyPreferredAction=send_message when an entity is matched,
 * but assistant-chat-only rows have no mail thread — proof-mode preflight then blocks every run.
 * In that case fall back to TRIGGER_ACTION_MAP (make_decision → write_document), which is exempt
 * from send-only proof enforcement for discrepancy winners.
 */
function winnerSourceSignalsLookMailBacked(
  sourceSignals: ScoredLoop['sourceSignals'] | undefined,
): boolean {
  return (sourceSignals ?? []).some((s) => {
    const src = `${s.source ?? ''}`.toLowerCase();
    if (src.includes('gmail') || src.includes('outlook')) return true;
    return /\b(?:email_received|email_sent|mail_received|mail_sent)\b/.test(src);
  });
}

export function shouldFallbackUnresolvedIntentSendToTriggerCanonical(
  winner: Pick<ScoredLoop, 'type' | 'discrepancyClass' | 'discrepancyPreferredAction' | 'sourceSignals'>,
): boolean {
  if (winner.type !== 'discrepancy' || winner.discrepancyClass !== 'unresolved_intent') return false;
  if (winner.discrepancyPreferredAction !== 'send_message') return false;
  return !winnerSourceSignalsLookMailBacked(winner.sourceSignals);
}

/** Exact operator-visible mock body for HTTP `dry_run=true` / `pipelineDryRun` (no Anthropic). */
export const PIPELINE_DRY_RUN_MOCK_ARTIFACT = '[DRY RUN - no API call made]';

/** Plain-language blurb for API responses and operators (dry run only). */
function buildPipelineDryRunOperatorSummary(input: {
  title: string;
  canonicalAction: ValidArtifactTypeCanonical;
  confidence: number;
}): string {
  const t = input.title.trim().slice(0, 400);
  const verb =
    input.canonicalAction === 'send_message'
      ? 'draft an email for you to send'
      : input.canonicalAction === 'write_document'
        ? 'write a short document or memo for you to approve'
        : input.canonicalAction === 'schedule_block'
          ? 'suggest a calendar block'
          : 'pause on outbound action this cycle';
  return `Foldera's top focus right now: "${t}". It would next ${verb}. The internal match score is ${input.confidence} out of 100. This was a dry run — no AI wrote real subject or body text; use Generate with AI when you want an actual draft.`;
}

function isAbsenceDrivenWinnerType(t: string): boolean {
  return t === 'discrepancy' || t === 'hunt';
}

/** Post-LLM thin-entry / weasel phrases — deterministic gate (Check 3). */
const THIN_ENTRY_PHRASES = [
  'requires review',
  'pending verification',
  'needs status check',
  'to be determined',
  'requires thread analysis',
  'needs further analysis',
];

function findThinEntryPhrase(combinedLower: string): string | null {
  for (const p of THIN_ENTRY_PHRASES) {
    if (combinedLower.includes(p)) return p;
  }
  return null;
}

const HOMEWORK_HANDOFF_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  {
    reason: 'research_handoff',
    pattern: /(?:research|review|look up|read up on)[\s\S]{0,120}(?:website|site|news|materials|documentation|policy changes|initiatives)/i,
  },
  {
    reason: 'familiarize_handoff',
    pattern: /familiarize yourself with/i,
  },
  {
    reason: 'prepare_examples_handoff',
    pattern: /prepare[\s\S]{0,80}(?:example|answer|story|talking point|brief|materials)/i,
  },
  {
    reason: 'conditional_homework_menu',
    pattern: /if this is (?:a|an)[\s\S]{0,160}(?:prepare|confirm|review|locate)/i,
  },
  {
    reason: 'locate_source_handoff',
    pattern: /(?:locate|find)[\s\S]{0,80}(?:original|invitation|thread|email|materials)/i,
  },
];

function findHomeworkHandoffReason(value: string): string | null {
  for (const { reason, pattern } of HOMEWORK_HANDOFF_PATTERNS) {
    if (pattern.test(value)) return reason;
  }
  return null;
}

/** Dollar amounts in artifact JSON must appear verbatim in grounding blob (Check 4). */
function ungroundedDollarAmounts(artifactJson: string, groundingBlob: string): string[] {
  const dollars = artifactJson.match(/\$\s*[\d,]+(?:\.\d{2})?/g) ?? [];
  const blob = groundingBlob.replace(/\s+/g, ' ').toLowerCase();
  const bad: string[] = [];
  for (const d of dollars) {
    const norm = d.replace(/\s/g, '').toLowerCase();
    if (!blob.includes(norm)) bad.push(d.trim());
  }
  return bad;
}

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

export const SYSTEM_PROMPT = `SYSTEM — FOLDERA CONVICTION ENGINE

You are the user's strategic partner. You have access to
their email, calendar, goals, commitments, and behavioral
patterns. You know what they care about and what they're
avoiding.

OBSERVATION VS DIAGNOSIS (mandatory cognitive move):
- Observation = what the signals show (counts, dates, who, what thread).
- Diagnosis = a testable hypothesis about WHY that footprint exists: an unmade decision, fear of a specific outcome, uncertainty blocking a reply, a process window closing, a bottleneck starving several threads, or misread silence versus a busy counterparty.
- causal_diagnosis.mechanism must be diagnosis, not a paraphrase of the observation. Ban mechanisms that only restate volume or lateness without naming the underlying driver.
- directive, reason, and why_now must tie to the concrete cost of continued inaction using dates, windows, or parallels from their signals — evidence-based urgency, not manipulation.

DOMAIN DIAGNOSTIC LENSES (apply the lens that matches the active goal category in context; DIAGNOSTIC_LENS in the user prompt names the primary lens):
- career: process windows, momentum vs stall, whether activity is producing forward motion.
- financial: compounding delay, deadline-driven loss, amounts and dates from signals.
- relationship: observable interaction patterns (velocity, reciprocity, silence vs baseline) — no mind-reading.
- health: scheduling and follow-through vs intent — non-clinical, no diagnoses.
- project: single-bottleneck framing; motion vs real progress.
- other: default generic diagnosis rules above.

NAMED FAILURE MODES (do not ship these):
- Prescribing an action the signals show the user already took or already scheduled (respect ALREADY_SENT / RECENT_ACTIONS when present).
- Obvious single-line reminders the user would infer from one subject alone — the output must add a non-obvious cross-signal connection (see ARTIFACT QUALITY CONTRACT).
- Vague causal theater: mechanism that a reasonable person cannot disagree with, or generic busywork labels ("just busy", "needs to prioritize") instead of a specific avoided decision or uncertainty.
- Cognitive-load failure: approving still requires the user to decide, research, or draft — the artifact must be finished work.
- Bracket fill-ins: any [INSERT ...], [DATE], [TBD], or similar template slot in send_message, write_document, or directive — use grounded sentences about missing details instead (see MISSING DETAILS — NEVER BRACKET FILL-INS).

MOTIVATION (evidence-based urgency):
- People are not rational optimizers; show cost of delay grounded in THEIR timeline (dates, windows, prior similar episode from signals when present).
- Mirror the data plainly. No guilt, shame, or moralizing. No manipulation.

Your job is NOT to summarize their inbox or remind them of
tasks. Your job is to:

NAME THE PATTERN they haven't connected.
Not "you have an unreplied email." Instead: "You've received
4 messages from this person in 2 weeks and replied to none.
Last time this happened with another contact, the relationship
went cold and you lost the opportunity."

EXPLAIN WHY NOW with their own history.
Not "this is overdue." Instead: "This commitment is 11 days
old with zero activity. You made a similar commitment in January
and it died at day 14. Today is day 11."

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

LOCKED CONTACTS — HARD RULE:
The following contacts must NEVER appear in any artifact, email,
document, or directive for any reason. Do not mention them, do
not reference them, do not suggest actions involving them, do not
include them in multi-entity documents. If a candidate involves
multiple entities and one is locked, produce the artifact WITHOUT
the locked entity. If removing the locked entity leaves nothing
actionable, return do_nothing.

This is not a suggestion. This is a constraint. Locked contacts
are locked because the user has decided they should never be
surfaced. Respect that decision absolutely.

The locked contacts list is provided in the LOCKED_CONTACTS block
of your input. If no LOCKED_CONTACTS block is present, there are
no locked contacts.

The scoring system has selected a candidate. The user should
read the directive and think: "How did it know that?" Not
"I already knew that." If the evidence is thin, make the
artifact shorter and more cautious. Do NOT fill gaps with
confidence. A short grounded artifact beats a long speculative one.

When behavioral_pattern candidates are the winner, lead with the
cross-signal connection the user hasn't made. Name the pattern
explicitly in the directive text — except for financial winners where
the scorer surfaced a concrete payment or statement deadline: then the
directive is one factual sentence (issuer, amount or minimum, due date),
not a character sketch.
Behavioral-pattern artifacts must include an explicit stop rule (e.g.
"If there is no reply after this, mark the thread stalled and stop
allocating attention to it.").

ARTIFACT QUALITY CONTRACT (mandatory for send_message and write_document):
Every artifact must demonstrate at least one cross-signal connection the user has not explicitly made. Examples of cross-signal connections: linking a decaying contact to an active goal, linking response-time degradation across multiple threads to a relationship risk, linking calendar gaps to email commitments. If the generator cannot produce a cross-signal connection for the winning candidate, it must set recommended_action: 'do_nothing' with a wait_rationale explaining what additional signal would unlock a real directive. Never send filler.

SINGLE-FOCUS EXCEPTION (payment / statement deadlines — mandatory):
When signals include a statement or bill for one issuer with a specific balance or minimum due and a calendar due date, that single obligation IS the directive and the entire artifact. Do not bundle unrelated same-day informational emails (credits posted, payment confirmations, peer-to-peer receipts, marketing, surveys, job portal mail) into one "backlog" or "notification digest" — they dilute the one decision that matters. Cross-signal is satisfied by issuer + amounts + due date that appear in the evidence; you do not need a second vendor to "prove" insight.

TONE — BILLING AND ROUTINE ADMIN (when the winner is not a relationship discrepancy about unanswered threads):
State amounts, due dates, and pay paths plainly. Do not use judgment labels about the user's character or habits ("pattern of avoidance," "complete avoidance," "deflected decisions," "compounds daily") for routine statements or admin mail — that reads as moralizing, not help. Reserve behavioral framing for genuine relationship/commitment discrepancy candidates where the scorer explicitly selected an avoidance or risk pattern.

JSON OUTPUT — PAYMENT / STATEMENT WINNERS (when the user prompt includes a bill with dollar amounts and a due/statement window):
- The directive, insight, why_now, and causal_diagnosis fields must stay in plain operational language (issuer, amounts, dates). Forbidden vocabulary in those fields for this situation: "avoidance," "systematic," "compounds" (daily or otherwise), "inbound → outbound," "pattern of deflection," "deflected," or any inbox-velocity / character sketch.
- One obligation only — never a multi-vendor digest in the artifact body.

NEGATIVE EXAMPLES (never produce these):
- Generic ping to Agency A during an active job search with no link to the user's applications, goals, or dormant contacts (no cross-signal).
- "Schedule 30 minutes to review your credit score" (chore, user already knows).
- "Document why X can wait" (busy work).

POSITIVE EXAMPLES (this is the bar — synthetic entities only):
- "You applied to two roles at Company X in 30 days. Contact A at Company X has had no thread in 79 days while your applications reference that division. Here's a reconnection email that ties your stated interest to a 15-minute ask on current priorities." (cross-signal: applications + decay + department)
- "14 inbound messages from Contact B in 7 days, up from 3/week last month; 9 unanswered. Here are draft replies batched into 3 send-ready messages." (cross-signal: frequency change + response gap)
- "You emailed Contact C twice, both on Mondays; external response data for that org peaks mid-morning Wednesday. Here's the follow-up timed to that window." (cross-signal: timing pattern + external data + specific contact)

INSIGHT CANDIDATES / INSIGHT_SCAN_WINNER (apply only when the user prompt includes the INSIGHT_SCAN_WINNER block):
The winner may come from the Insight Scan — an unsupervised read of raw signals for patterns the user has not named (not structural gap rules). When that block is present:
1. Lead with the PATTERN, not a generic task or reminder.
2. The directive states what they have not connected about their own behavior; the artifact is still finished work (email or document) framed as: what the footprint shows, then the concrete move.
3. Never say "Foldera noticed", "the system detected", or "I detected" — state the pattern as observable fact.
4. Do not replace the pattern with a shallow follow-up line; the user should feel the blind spot was named.

DISCREPANCY_WINNERS (CANDIDATE_CLASS is discrepancy):
Discrepancy winners still require finished work — never a triage list or numbered chores ("Complete survey", "Schedule payment"). For avoidance-style patterns, output copy-paste-ready reply drafts or a complete send_message. If the evidence cannot support finished work, use wait_rationale or do_nothing per schema — do not ship instructions for the user to do the work.

QUALITY EXAMPLES:

Good directive: "4 emails from Contact D in 12 days, 0 replies. Last time you went silent on a reference (Contact E, January), re-engagement took 3 weeks. Contact D is tied to your active reference goal."

Bad directive: "You have unreplied emails from Contact D. Consider responding."

Good directive: "You committed to following up on the benefits waiver 18 days ago; no activity since; the window in the thread closes in 12 days. Here's the call script with the number from the signal."

Bad directive: "Your waiver follow-up is stale. Take action."

Good artifact (send_message): A complete email with subject, recipient, body that references the specific thread, answers specific questions, and includes a concrete ask with a date.

Bad artifact: A generic follow-up with no thread specifics, no dates, and no concrete ask.

WRITE_DOCUMENT — SIGNAL-GROUNDED VALUES (mandatory):
Every specific value — dates, amounts, names, deadlines, account numbers — must be populated from the signal data you were given. Never use placeholder language like "insert date here" or "verify amount" when that data exists in the signals. If the data exists in signals, use it. If it does not exist, do not include the field (omit the line or state honestly in prose that the signal set does not show it — never a blank or bracket for the user to fill).

BAD (never ship):
A document that contains placeholders, asks the user to verify information they could only get by opening mail or accounts themselves, or tells the user to complete the work after reading (e.g. "check your credit card," "deadline: [insert date]," "verify this transaction" when amounts and dates are already in the signals).

GOOD (this is the bar):
Your signals show the American Express statement: $9,540.53 due April 11, minimum $198, last payment March 3. The document states those facts plainly and includes a pre-drafted payment-confirmation note (or self-email) with due date, amount, and account reference filled from the thread — copy-ready. The user's job is read and approve, not hunt values.

You are not a task manager. You are an analyst who does the work. The document you produce is the finished deliverable, not instructions for producing a deliverable. Fill in the answers. Do not ask the questions.

VERBATIM_GROUNDING_RULE (mandatory):
Every dollar amount (e.g. $1,234.56) and every calendar date (month-day-year or YYYY-MM-DD) in the directive, insight, and artifact MUST appear verbatim in the signal excerpts, HUNT_ANOMALY_FINDING block, RAW_FACTS, or SUPPORTING_SIGNALS you were given. If a value is not present in that evidence, do not invent it — omit it or use prose that does not assert the missing value.

HUNT_WINNERS (CANDIDATE_CLASS is hunt):
The winner is a deterministic hunt anomaly (absence or cross-mail pattern). Lead with the specific counted facts in the hunt summary. The artifact is still finished work — never a triage list. Ground every number and date in the hunt evidence and supporting signals.

WRITE_DOCUMENT QUALITY EXAMPLES:

Good write_document (discrepancy: deadline pattern across contacts):
title: "Deadline Status: 4 Active Commitments — April 2026"
content: Fills in every field with real data from the signals.
- Contact F: reference packet, committed date A, due before hiring timeline from Contact G's last message date B. Status: overdue by N days. Impact: blocks role if check runs first.
- Vendor H: account reactivation, plan tier from signals, deletion risk stated in thread. Next step: exact login or action from signals.
- Third and fourth rows: only if signals supply date, deliverable, status, consequence; otherwise omit the row.
The document IS the audit. Approving it = done.

Bad write_document (same candidate):
title: "Cross-Contact Deadline Tracking System"
content: "Four contacts have deadline themes. Each deadline needs:
- Specific date and deliverable
- Relationship impact if missed
- Current status
- Next action with owner"
This is a TEMPLATE. This fails the product test.

Good write_document (discrepancy: avoidance — unanswered threads):
title: "Unanswered Threads: Contact D (4 messages, 0 replies, 12 days)"
content: Drafts all 4 reply emails in one document; each references the thread and questions from signals; copy-paste ready.

Bad write_document (same candidate):
title: "Communication Gap Analysis: Contact D"
content: "You have 4 unreplied emails. Consider prioritizing responses. 1. Review 2. Draft 3. Send by Friday"
This is a TO-DO LIST. The product did zero work.

Good write_document (commitment: process named in signals, date not in signals):
title: "SHPC4 interview — confirm schedule"
content: States what the commitment is from the candidate text, states clearly that no interview date appears in the provided signals, and gives one finished next step (e.g. reply in-thread to propose two windows, or call the recruiter using a number only if it appears in the signals). No brackets; every line is readable prose.

Bad write_document (same thin context):
content: Contains [INSERT DATE], [CONFIRM WITH HR], or any bracketed slot instead of honest sentences.

THE RULE: A good write_document contains THE ACTUAL CONTENT the user
needs, filled in with real data from the signals. A bad write_document
contains a framework, template, checklist, or plan that the user has
to populate. If the document has blank fields, bullet-point templates,
or instructions like "review," "check," "assess," or "complete," it
is a bad document. Fill in the answers, don't ask the questions.

MISSING DETAILS — NEVER BRACKET FILL-INS (commitment and all write_document):
- If a date, time, phone, email, or name is NOT explicit in the signals, you MUST NOT output [INSERT DATE], [TBD], [PHONE], [EMAIL], or any bracketed slot or ALL-CAPS pseudo-field meant for the user to fill later.
- Write finished prose that states what the signals do and do not show: e.g. "Your signals mention the SHPC4 interview but no confirmed date appears — reply in the existing thread or contact the coordinator to lock a time." That sentence is a complete artifact; a bracket is a failed artifact.
- Approximate or gap-aware language grounded in the evidence is always acceptable; template tokens are never acceptable.
- For commitment winners forced to write_document (no recipient email in signals), the prep brief must still be send-ready narrative: name the commitment from the candidate, list what is confirmed from signals, and give one concrete next step that does not require inventing missing facts.

EVIDENCE RULES:
- Only use facts from the signals provided
- No placeholders, no brackets, no TODOs
- Real names, dates, and details only when present; when absent, say so in plain sentences — never substitute a bracket
- If evidence is thin for a single-topic artifact (one entity or one thread), write a SHORT artifact. Thin = short, not skip.
- For write_document with multiple entities or items: if you cannot fill in specific details from
the signals for an entity or item, DROP THAT ENTITY ENTIRELY.
Do not write "requires review," "pending verification," "needs
status check," or "requires thread analysis." Those phrases
mean you don't have data. Entries without data don't belong in
the document.

A document with 2 fully-grounded entries is better than a
document with 2 grounded entries and 2 padding entries. The
user will notice the padding and lose trust.

NEVER use these phrases in any artifact:
- "requires review"
- "requires verification"
- "pending analysis"
- "needs status check"
- "requires thread review"
- "needs further analysis"
- "to be determined"
- "pending thread analysis"

If you find yourself writing any of these, delete that entire
entry from the document. Fewer real entries > more padded entries.

For single-topic write_document: if you cannot ground details, write a SHORTER
document with only what you can ground. A 3-sentence document with
real data beats a 3-paragraph template with blank fields. Never
produce a framework the user has to complete. Produce the completed
framework with real data, or produce nothing.

ENTITY_ANALYSIS and CANDIDATE_ANALYSIS are for YOUR understanding only. Never paste metric values, ratios, baselines, or system terminology into the artifact body. The email must read like a human wrote it, not like a data dump. Use the analysis to understand context, then write naturally. The same applies to numeric or pipeline phrasing from TRIGGER_CONTEXT (e.g. interaction counts, "/14d" baselines, arrows between states) — translate into normal language if at all, never as a statistics recap.

CONFIDENCE SCORING (0-100):
- 80+ = multiple corroborating signals, clear deadline or consequence
- 60-79 = strong single-source evidence with clear next step
- 40-59 = reasonable evidence, some inference required
- Below 40 = thin evidence, flag uncertainty in the artifact

CAUSAL DIAGNOSIS (required):
- "why_exists_now": what changed that makes this urgent today (dates, windows, deltas — tied to signals).
- "mechanism": underlying driver the user is avoiding or stuck on — a specific decision, uncertainty, fear of an outcome, or closing window — NOT a restatement of counts or "they are busy."
- The finished artifact must address that mechanism, not restate symptoms.

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

const DISCREPANCY_FINISHED_WORK_USER_BLOCK =
  `DISCREPANCY_WINNER_FINISHED_WORK (mandatory):
The scorer selected a discrepancy. Your artifact must be finished work the user approves once — not a triage list, chore checklist, or numbered "Complete / Schedule / Review" instructions.
- Avoidance / unanswered-thread patterns: copy-paste-ready draft reply(ies) in write_document, or a complete send_message (subject + body) to the real recipient.
- Other discrepancy classes: one coherent document that names the pattern and contains the concrete resolved content (drafts, scripts, audit with filled facts) — not templates or "suggested approach" steps.
If the evidence cannot support real finished output, return wait_rationale or do_nothing per JSON schema — never substitute a chores list.`;

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
  /** When loaded from `tkg_signals`, the row id — used to ground hunt recipients to the winning thread only. */
  signal_id?: string;
}

interface GenerateDirectiveOptions {
  dryRun?: boolean;
  /**
   * Skip every Anthropic call in this path (generator + researcher); assemble prompt only.
   * Distinct from `dryRun` (Vitest / api_usage persistence semantics).
   */
  pipelineDryRun?: boolean;
  /** Merged into scorer failure-suppression keys for this run (e.g. loop guard). */
  extraSuppressedCandidateKeys?: Set<string>;
  /** Skip daily spend cap check — used for manual Generate Now so testing doesn't cost money */
  skipSpendCap?: boolean;
  /**
   * Skip per-day manual directive call count (api_usage directive rows).
   * ONLY for owner-gated `/api/dev/brain-receipt` — keeps prod proof path unblocked
   * without widening Generate Now / smoke-test budgets.
   */
  skipManualCallLimit?: boolean;
  /**
   * With `pipelineDryRun`, use canonical stub text that passes one-sentence + persistence checks so the
   * daily-brief path can reach real artifact validation and DB writes without Anthropic (owner verification).
   */
  verificationStubPersist?: boolean;
  /**
   * Owner verification only: when set with `verificationStubPersist`, try `write_document` discrepancy
   * classes first (`schedule_conflict`, then `stale_document`) so the stub hits `write_document` without
   * paid LLM when those rows exist. Default true with `verificationStubPersist` (opt out with `false`).
   */
  verificationGoldenPathWriteDocument?: boolean;
}

/** Internal: generatePayload only — locks LLM render to DecisionPayload.recommended_action */
type GeneratePayloadOptions = GenerateDirectiveOptions & {
  committedArtifactType: ValidArtifactTypeCanonical;
};

interface GeneratePayloadResult {
  issues: string[];
  payload: GeneratedDirectivePayload | null;
  /** Full assembled user prompt (operator dry run only). */
  assembledPrompt?: string;
  /** Pass-1 LLM one-sentence anomaly (persisted on directive / execution_result). */
  anomalyIdentification?: string;
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
function authorEmailLooksLikeSelfOrProductNoise(author: string, userMailboxEmails: Set<string>): boolean {
  const lower = author.toLowerCase();
  const found = lower.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
  for (const e of found) {
    if (userMailboxEmails.has(e)) return true;
    const domain = e.split('@')[1] ?? '';
    if (domain === 'foldera.ai' || domain.endsWith('.foldera.ai')) return true;
    if (domain === 'resend.dev' || domain.endsWith('.resend.dev')) return true;
    if (domain === 'resend.com') return true;
  }
  return false;
}

async function buildAvoidanceObservations(
  userId: string,
  winner: ScoredLoop,
  signalEvidence: SignalSnippet[],
  userMailboxEmails: Set<string>,
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
    if (userMailboxEmails.size > 0 && authorEmailLooksLikeSelfOrProductNoise(sig.author, userMailboxEmails)) {
      continue;
    }
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

  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const OBVIOUS_FIRST_LAYER_RE = /^(?:follow\s+up|check\s+in|touch\s+base|circle\s+back|schedule\s+(?:a\s+)?(?:\d+.?minute\s+)?(?:block|time|session))\b/i;
  const SEND_WRITE_ACTIONS = new Set<ActionType>(['send_message', 'write_document', 'make_decision', 'research', 'schedule']);
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
      const recipientAnchored =
        typeof candidate.relationshipContext === 'string' && candidate.relationshipContext.includes('@');
      if (!recipientAnchored) {
        return {
          candidate,
          viabilityScore: 0,
          note: '',
          disqualified: true,
          disqualifyReason: 'obvious first-layer advice',
        };
      }
    }
    if (isLowValueHuntSendMessagePresentation(candidate)) {
      return {
        candidate,
        viabilityScore: 0,
        note: '',
        disqualified: true,
        disqualifyReason: 'low_value_inbound_promotional_thread',
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

    // 1b. Hard suppression: 3+ consecutive not_relevant skips for this entity.
    if (candidate.entityName && guardrails.skippedRecently && guardrails.skippedRecently.length > 0) {
      const entityFirstName = candidate.entityName.split(/\s+/)[0]?.toLowerCase();
      if (entityFirstName && entityFirstName.length >= 3) {
        const entitySkips = guardrails.skippedRecently.filter((r) =>
          (r.directive_text ?? '').toLowerCase().includes(entityFirstName),
        );
        let consecutiveNotRelevant = 0;
        for (const s of entitySkips) {
          if (s.skip_reason === 'not_relevant') consecutiveNotRelevant++;
          else break;
        }
        if (consecutiveNotRelevant >= 3) {
          return {
            candidate,
            viabilityScore: 0,
            note: '',
            disqualified: true,
            disqualifyReason: `repeated_not_relevant_skip: ${consecutiveNotRelevant} consecutive not_relevant skips for ${candidate.entityName}`,
          };
        }
      }
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
      } else if (
        isThreadBackedSendableLoop(candidate)
        && passesTop3RankingInvariants(candidate)
      ) {
        notes.push('thread-backed sendable exempt from discrepancy task penalty');
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

  // Mirror scorer: a valid thread-backed external send must not lose viability to an internal
  // discrepancy (write_document / make_decision) when both are in the shortlist.
  if (
    !top.disqualified
    && top.candidate.type === 'discrepancy'
    && !isThreadBackedSendableLoop(top.candidate)
  ) {
    const sendableEntry = rated
      .filter(
        (r) =>
          !r.disqualified
          && isThreadBackedSendableLoop(r.candidate)
          && passesTop3RankingInvariants(r.candidate),
      )
      .sort((a, b) => b.viabilityScore - a.viabilityScore)[0];
    if (sendableEntry) {
      sendableEntry.viabilityScore = Math.max(
        sendableEntry.viabilityScore,
        top.viabilityScore + 0.001,
      );
      sendableEntry.note = [sendableEntry.note, 'preferred over internal discrepancy'].filter(Boolean).join('; ');
      rated.sort((a, b) => {
        if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
        return b.viabilityScore - a.viabilityScore;
      });
      top = rated[0];
    }
  }

  const topDiscrepancy = rated
    .filter((entry) => !entry.disqualified && entry.candidate.type === 'discrepancy')
    .sort((a, b) => b.viabilityScore - a.viabilityScore)[0];
  if (topDiscrepancy && !top.disqualified && top.candidate.type !== 'discrepancy' && topDiscrepancy.viabilityScore <= top.viabilityScore) {
    const runner = top.candidate;
    const discCand = topDiscrepancy.candidate;
    const protectThreadBackedSendable =
      isThreadBackedSendableLoop(runner)
      && !isThreadBackedSendableLoop(discCand)
      && passesTop3RankingInvariants(runner);
    if (!protectThreadBackedSendable) {
      topDiscrepancy.viabilityScore = top.viabilityScore + 0.001;
      topDiscrepancy.note = `${topDiscrepancy.note}; discrepancy forced above task`;
      rated.sort((a, b) => {
        if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
        return b.viabilityScore - a.viabilityScore;
      });
      top = rated[0];
    }
  }

  const scorerPriorityCareerOutcome = topCandidates.find((candidate) =>
    isPriorityCareerOutcomeArtifactCandidateForGenerator(candidate),
  );
  if (scorerPriorityCareerOutcome) {
    const scorerPriorityEntry = rated.find(
      (entry) =>
        !entry.disqualified
        && entry.candidate.id === scorerPriorityCareerOutcome.id,
    );
    if (scorerPriorityEntry && top.candidate.id !== scorerPriorityCareerOutcome.id) {
      scorerPriorityEntry.viabilityScore = Math.max(
        scorerPriorityEntry.viabilityScore,
        top.viabilityScore + 0.001,
      );
      scorerPriorityEntry.note = [
        scorerPriorityEntry.note,
        'scorer-priority career outcome forced first',
      ].filter(Boolean).join('; ');
      rated.sort((a, b) => {
        if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
        return b.viabilityScore - a.viabilityScore;
      });
      top = rated[0];
    }
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

function scoredLoopSearchTextForGeneratorCareerPriority(candidate: import('./scorer').ScoredLoop): string {
  const sourceText = (candidate.sourceSignals ?? [])
    .map((signal) => [signal.summary, signal.source, signal.occurredAt].filter(Boolean).join(' '))
    .join(' ');
  const triggerText = candidate.trigger
    ? [
        candidate.trigger.baseline_state,
        candidate.trigger.current_state,
        candidate.trigger.delta,
        candidate.trigger.timeframe,
        candidate.trigger.why_now,
        candidate.trigger.outcome_class,
      ].join(' ')
    : '';
  return [
    candidate.title,
    candidate.content,
    sourceText,
    triggerText,
    candidate.discrepancyEvidence ?? '',
    candidate.matchedGoal?.text ?? '',
  ].join(' ').toLowerCase();
}

function isPriorityCareerOutcomeArtifactCandidateForGenerator(
  candidate: import('./scorer').ScoredLoop,
): boolean {
  if (candidate.suggestedActionType !== 'write_document') return false;

  const text = scoredLoopSearchTextForGeneratorCareerPriority(candidate);
  const hasInterviewOrHiringPressure =
    /\binterview|phone screen|panel interview|screening interview|candidate interview|hiring decision|offer\b/i.test(text);
  const isCareerGoalMatched = candidate.matchedGoal?.category === 'career';
  const hasOutcomeValue = (candidate.breakdown.stakes ?? 0) >= 3 && (candidate.breakdown.urgency ?? 0) >= 0.7;

  return hasOutcomeValue && (isCareerGoalMatched || hasInterviewOrHiringPressure);
}

/** Discrepancy classes that lock to `write_document` — verification mode tries these before other winners. */
const VERIFICATION_GOLDEN_PATH_WRITE_DOC_CLASSES = ['schedule_conflict', 'stale_document'] as const;

/**
 * Owner verification: prefer discrepancy rows whose trigger maps to `write_document`
 * (`schedule_conflict` first, then `stale_document`) so the deterministic stub hits the same
 * payload branch when those candidates exist and are not disqualified.
 */
export function reorderRankedCandidatesForVerificationGoldenPathWriteDocument<
  T extends {
    candidate: { id: string; type: string; discrepancyClass?: string | null };
    disqualified: boolean;
  },
>(ranked: T[]): T[] {
  const tiers: T[][] = VERIFICATION_GOLDEN_PATH_WRITE_DOC_CLASSES.map((cls) =>
    ranked.filter(
      (r) =>
        !r.disqualified &&
        r.candidate.type === 'discrepancy' &&
        r.candidate.discrepancyClass === cls,
    ),
  );
  const preferred = tiers.flat();
  if (preferred.length === 0) return ranked;
  const preferredIds = new Set(preferred.map((p) => p.candidate.id));
  return [...preferred, ...ranked.filter((r) => !preferredIds.has(r.candidate.id))];
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
  const freshness_state: DecisionPayload['freshness_state'] = isAbsenceDrivenWinnerType(winner.type)
    ? 'fresh'
    : ageDays <= 7 ? 'fresh' : ageDays <= STALE_SIGNAL_THRESHOLD_DAYS ? 'aging' : 'stale';

  // Determine recommended_action — deterministic from scorer, not LLM
  let recommended_action: ValidArtifactTypeCanonical;

  // Trigger → Action Lock: discrepancy candidates use the mapping table.
  if (winner.type === 'discrepancy' && winner.discrepancyClass) {
    if (winner.discrepancyPreferredAction) {
      recommended_action = actionTypeToArtifactType(winner.discrepancyPreferredAction) as ValidArtifactTypeCanonical;
    } else {
      recommended_action = actionTypeToArtifactType(
        resolveTriggerAction(winner.discrepancyClass, ctx.has_real_recipient),
      ) as ValidArtifactTypeCanonical;
    }
  } else {
    recommended_action = actionTypeToArtifactType(winner.suggestedActionType);

    // Legacy conversion rule: send_message without a recipient → write_document
    if (recommended_action === 'send_message' && !ctx.has_real_recipient) {
      recommended_action = 'write_document';
    }
  }

  if (isAbsenceDrivenWinnerType(winner.type) && recommended_action === 'send_message' && !ctx.has_real_recipient) {
    recommended_action = 'write_document';
  }

  if (shouldFallbackUnresolvedIntentSendToTriggerCanonical(winner)) {
    recommended_action = actionTypeToArtifactType(
      resolveTriggerAction('unresolved_intent', ctx.has_real_recipient),
    ) as ValidArtifactTypeCanonical;
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
  if (!ctx.has_recent_evidence && !isAbsenceDrivenWinnerType(winner.type)) blocking_reasons.push('No recent evidence (all signals older than 14 days)');
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
  if (freshness_state === 'stale' && !isAbsenceDrivenWinnerType(winner.type)) blocking_reasons.push('Evidence is stale');

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

export interface CompressedSignal {
  source: string;
  occurred_at: string;
  entity: string | null;
  summary: string;
  direction: 'sent' | 'received' | 'unknown';
}

/** True when the winner is payment/statement shaped — narrows SUPPORTING_SIGNALS and softens avoidant prompt blocks. */
export function shouldApplyFinancialSingleFocus(winner: ScoredLoop): boolean {
  if (winner.matchedGoal?.category === 'financial') return true;
  const blob = `${winner.title}\n${winner.content}`.toLowerCase();
  return (
    /\$\s*[\d,]+(?:\.\d{2})?/.test(blob) &&
    /\b(minimum|due|statement|balance|payment\s+due)\b/.test(blob)
  );
}

/** Keep the single highest-stakes payment row; exported for unit tests. */
export function pickHighestStakesPaymentSignal(signals: CompressedSignal[]): CompressedSignal[] {
  if (signals.length <= 1) return signals;
  const score = (s: CompressedSignal): number => {
    const t = `${s.summary} ${s.entity ?? ''}`.toLowerCase();
    let n = 0;
    if (/\$\s*[\d,]+(?:\.\d{2})?/.test(t)) n += 6;
    if (/\bminimum\b/.test(t)) n += 4;
    if (/\b(due|deadline|pay\s+by|payment\s+due)\b/.test(t)) n += 4;
    if (/\bstatement\b/.test(t)) n += 2;
    if (/\b(balance|amount\s+owed)\b/.test(t)) n += 2;
    if (/\b(payment\s+received|thank\s+you\s+for\s+your\s+payment|credit\s+applied|confirmation\s+of\s+payment)\b/.test(t)) n -= 5;
    if (/\bvenmo\b/.test(t) && !/\b(due|minimum|statement)\b/.test(t)) n -= 2;
    return n;
  };
  let best = signals[0]!;
  let bestScore = score(best);
  for (const s of signals.slice(1)) {
    const sc = score(s);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  if (bestScore < 2) return [signals[0]!];
  return [best];
}

function isPaymentDeadlinePromptContextSlice(
  matched_goal_category: string | null,
  candidate_title: string,
  selected_candidate: string,
): boolean {
  if (matched_goal_category === 'financial') return true;
  const b = `${candidate_title}\n${selected_candidate}`.toLowerCase();
  return (
    /\$\s*[\d,]+(?:\.\d{2})?/.test(b) &&
    /\b(minimum|due|statement|balance|payment\s+due)\b/.test(b)
  );
}

function isPaymentDeadlinePromptContext(ctx: StructuredContext): boolean {
  return isPaymentDeadlinePromptContextSlice(
    ctx.matched_goal_category,
    ctx.candidate_title,
    ctx.selected_candidate,
  );
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
  /** Primary goal category for the matched goal (drives DIAGNOSTIC_LENS in user prompt). */
  matched_goal_category: string | null;
  candidate_score: number;
  candidate_due_date: string | null;
  candidate_context_enrichment: string | null;
  supporting_signals: CompressedSignal[];
  /**
   * Non-mail cross-source snapshot for LIFE_CONTEXT in the user prompt — not stripped by
   * financial single-focus mail collapse.
   */
  life_context_signals: CompressedSignal[];
  surgical_raw_facts: string[];
  active_goals: string[];
  locked_constraints: string | null;
  /** Lines from tkg_constraints locked_contact for LLM; must not appear in any artifact (see SYSTEM_PROMPT). */
  locked_contacts_prompt: string | null;
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
  /**
   * Hunt + send_message only: lowercase emails allowed as artifact.to — strictly peers extracted
   * from winning hunt source signal rows (same set as hunt_grounded_peer_email / recipient_brief).
   * Relationship context never expands this list. Empty for non-hunt candidates.
   */
  hunt_send_message_recipient_allowlist: string[];
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
  /** Voice grounding — style extracted from approved emails. Null when insufficient data. */
  user_voice_patterns: string | null;
}

/** Distinct `tkg_signals.source` in supporting + life snapshot (generator bundle audit). */
export function buildEvidenceBundleReceipt(ctx: StructuredContext): EvidenceBundleReceipt {
  const sup = new Set(ctx.supporting_signals.map((s) => s.source).filter(Boolean));
  const life = new Set((ctx.life_context_signals ?? []).map((s) => s.source).filter(Boolean));
  const combined = new Set([...sup, ...life]);
  const combinedArr = [...combined].sort();
  return {
    supporting_signal_sources: [...sup].sort(),
    supporting_signal_source_count: sup.size,
    life_context_sources: [...life].sort(),
    combined_distinct_sources: combinedArr,
    combined_distinct_source_count: combined.size,
    meets_three_source_bar: combined.size >= 3,
  };
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
export function enrichCandidateContext(winner: ScoredLoop, evidenceSortedChrono: SignalSnippet[]): string | null {
  if (winner.type === 'hunt') {
    const parts: string[] = [];
    for (const s of winner.sourceSignals ?? []) {
      const src = s.source ? `${s.kind}/${s.source}` : s.kind;
      parts.push(`• [${src}] ${(s.summary ?? '').slice(0, 220)}`);
    }
    const huntSourceIds = new Set(
      (winner.sourceSignals ?? [])
        .filter((sig) => sig.kind === 'signal' && typeof sig.id === 'string' && sig.id.length > 0)
        .map((sig) => sig.id as string),
    );
    const EMAIL_SOURCES = new Set(['gmail', 'outlook']);
    // Do not append arbitrary recent inbox lines: they pull unrelated threads into HUNT_CONTEXT and
    // the model then cites another hunt's subject in send_message while To: stays hunt-allowlisted.
    const extras = evidenceSortedChrono
      .filter((e) => EMAIL_SOURCES.has(e.source))
      .filter(
        (e) =>
          huntSourceIds.size > 0 &&
          typeof e.signal_id === 'string' &&
          huntSourceIds.has(e.signal_id),
      )
      .slice(0, 6);
    for (const e of extras) {
      const head = [e.subject, e.snippet].filter(Boolean).join(' — ');
      parts.push(`• [${e.source} @ ${e.date}] ${head.slice(0, 220)}`);
    }
    if (parts.length === 0) return null;
    return `HUNT_CONTEXT:\n${parts.join('\n')}`;
  }
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

/** True when an address can be a send_message To: peer (not self, not automated/bulk per blocklist). */
function isEligibleExternalPeerEmail(address: string, userEmails?: Set<string>): boolean {
  const lower = address.trim().toLowerCase();
  if (!lower.includes('@')) return false;
  if (userEmails && userEmails.size > 0 && userEmails.has(lower)) return false;
  if (isBlockedSender(lower)) return false;
  if (isAutomatedRoutingRecipient(lower)) return false;
  return true;
}

/** At least one grounded recipient line in facts is a non-self, non-automated external address. */
function proofModeHasEligibleExternalRecipientInFacts(
  ctx: StructuredContext,
  userEmails: Set<string> | undefined,
): boolean {
  for (const f of ctx.surgical_raw_facts) {
    const m = f.match(/^(?:recipient_email|hunt_grounded_peer_email|contact_email):\s*(.+)$/i);
    if (!m?.[1]) continue;
    const email = m[1].trim();
    if (isEligibleExternalPeerEmail(email, userEmails)) return true;
  }
  return false;
}

export type ProofModePreflightSkipEvent =
  | 'proof_mode_candidate_skipped_non_send'
  | 'proof_mode_candidate_skipped_no_real_recipient'
  | 'proof_mode_candidate_skipped_not_thread_backed'
  | 'proof_mode_candidate_skipped_low_value_promo';

export type ProofModeThreadBackedSendPreflightResult =
  | { ok: true }
  | { ok: false; event: ProofModePreflightSkipEvent; detail?: string };

/**
 * Proof-mode gates before LLM spend: only ranked candidates that can still end in
 * real external thread-backed send_message are allowed through.
 */
export function evaluateProofModeThreadBackedSendPreflight(input: {
  proofModeEnabled: boolean;
  decisionRecommendedAction: ValidArtifactTypeCanonical;
  ctx: StructuredContext;
  hydratedWinner: ScoredLoop;
  userEmails: Set<string> | undefined;
}): ProofModeThreadBackedSendPreflightResult {
  if (!input.proofModeEnabled) return { ok: true };
  const { decisionRecommendedAction, ctx, hydratedWinner, userEmails } = input;
  if (decisionRecommendedAction !== 'send_message') {
    return {
      ok: false,
      event: 'proof_mode_candidate_skipped_non_send',
      detail: decisionRecommendedAction,
    };
  }
  if (!ctx.has_real_recipient) {
    return {
      ok: false,
      event: 'proof_mode_candidate_skipped_no_real_recipient',
      detail: 'has_real_recipient_false',
    };
  }
  if (!proofModeHasEligibleExternalRecipientInFacts(ctx, userEmails)) {
    return {
      ok: false,
      event: 'proof_mode_candidate_skipped_no_real_recipient',
      detail: 'no_eligible_external_recipient_in_facts',
    };
  }
  if (!isThreadBackedSendableLoop(hydratedWinner)) {
    return {
      ok: false,
      event: 'proof_mode_candidate_skipped_not_thread_backed',
      detail: `${hydratedWinner.type}:${hydratedWinner.id.slice(0, 48)}`,
    };
  }
  if (isLowValueHuntSendMessagePresentation(hydratedWinner)) {
    return { ok: false, event: 'proof_mode_candidate_skipped_low_value_promo' };
  }
  return { ok: true };
}

/** In proof mode, success means persisted canonical action is send_message only. */
export function proofModeCanonicalCountsAsProofSuccess(
  proofModeEnabled: boolean,
  canonicalAction: ValidArtifactTypeCanonical,
): boolean {
  if (!proofModeEnabled) return true;
  return canonicalAction === 'send_message';
}

/**
 * Eligible external emails from relationshipContext bracket forms — shared by surgical_raw_facts
 * and hasRecipientEmailInContext for non-hunt candidates. Hunt uses the same parser but only emits
 * `recipient_email:` facts when the address is also on the winning hunt signal thread.
 */
function extractEligibleBracketEmailsFromRelationshipContext(
  relationshipContext: string | null | undefined,
  userEmails?: Set<string>,
): string[] {
  if (!relationshipContext) return [];
  const bracketEmails = relationshipContext.match(/<([^@\s>]+@[^@\s>]+\.[^@\s>]+)>/g);
  if (!bracketEmails) return [];
  const out: string[] = [];
  for (const e of bracketEmails.slice(0, 3)) {
    const addr = e.replace(/[<>]/g, '').trim();
    if (!isEligibleExternalPeerEmail(addr, userEmails)) continue;
    out.push(addr.toLowerCase());
  }
  return out;
}

/**
 * Recipient short-path for hunt when there is no relationshipContext but peers are grounded
 * on winning `tkg_signals` rows (see hunt_grounded_peer_email / signal_id).
 */
function buildHuntRecipientBriefFromGroundedPeers(
  emails: string[],
  groundedSnippets: SignalSnippet[],
): string | null {
  if (emails.length === 0) return null;
  const primary = emails[0];
  let displayName: string | null = null;
  for (const s of groundedSnippets) {
    if (!s.author?.toLowerCase().includes(primary)) continue;
    const au = s.author.trim();
    const lt = au.indexOf('<');
    if (lt > 0) {
      const cand = au.slice(0, lt).replace(/^["']|["']$/g, '').trim();
      if (cand && !cand.includes('@')) {
        displayName = cand;
        break;
      }
    }
  }
  if (!displayName) {
    const local = primary.split('@')[0] ?? 'Contact';
    displayName = local.replace(/[._]/g, ' ');
  }
  const sortedDates = groundedSnippets
    .map((s) => s.date)
    .filter(Boolean)
    .sort()
    .reverse();
  const lastSignal = sortedDates.length > 0
    ? new Date(sortedDates[0]).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const lines = [
    `${displayName} <${primary}>`,
    'Recipient is grounded in the winning hunt signal thread — To: must be this address.',
  ];
  if (lastSignal) lines.push(`Last signal in thread: ${lastSignal}`);
  return lines.join('\n');
}

export function buildStructuredContext(
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
  userVoicePatterns?: string | null,
  lockedContactPromptLines?: string[],
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

  let response_pattern_lines = sorted
    .filter((s) => s.row_type === 'response_pattern')
    .slice(0, 24)
    .map((s) => {
      const head = [s.subject, s.snippet].filter(Boolean).join(' — ');
      const auth = s.author?.trim() ? `${s.author.trim()}: ` : '';
      return `- [${s.date}] [response_pattern] ${auth}${head.slice(0, 280)}`;
    });
  if (shouldApplyFinancialSingleFocus(winner)) {
    response_pattern_lines = [];
  }

  const maxSignals =
    winner.type === 'discrepancy' && winner.discrepancyClass === 'decay'
      ? 40
      : winner.type === 'hunt'
        ? 22
        : 15;
  const nonEmailCap =
    winner.type === 'discrepancy' && winner.discrepancyClass === 'decay'
      ? 12
      : winner.type === 'hunt'
        ? 8
        : 6;
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

  const snippetToCompressed = (s: SignalSnippet): CompressedSignal => ({
    source: s.source,
    occurred_at: s.date,
    entity: s.author,
    summary: [s.subject, s.snippet].filter(Boolean).join(' — '),
    direction: s.direction,
  });

  const LIFE_CONTEXT_SNIPPET_CAP = 10;
  const lifeContextSnippets = sorted
    .filter((s) => !EMAIL_SOURCES.has(s.source))
    .slice(0, LIFE_CONTEXT_SNIPPET_CAP);
  const lifeSeen = new Set<string>();
  const life_context_signals: CompressedSignal[] = [];
  for (const s of lifeContextSnippets) {
    const c = snippetToCompressed(s);
    const k = `${c.source}|${c.occurred_at}|${(c.summary ?? '').slice(0, 72)}`;
    if (lifeSeen.has(k)) continue;
    lifeSeen.add(k);
    life_context_signals.push(c);
  }

  let supporting_signals: CompressedSignal[] = diverse.map(snippetToCompressed);

  if (shouldApplyFinancialSingleFocus(winner)) {
    const nonMail = supporting_signals.filter((s) => !EMAIL_SOURCES.has(s.source));
    const mailOnly = supporting_signals.filter((s) => EMAIL_SOURCES.has(s.source));
    let pickedMail: CompressedSignal[] = mailOnly;
    try {
      if (mailOnly.length > 0) {
        pickedMail = pickHighestStakesPaymentSignal(mailOnly);
      } else if (supporting_signals.length > 0) {
        pickedMail = pickHighestStakesPaymentSignal(supporting_signals);
      }
    } catch (e) {
      console.warn('[generator] pickHighestStakesPaymentSignal failed (keeping unfiltered signals):', e);
    }
    const mergeSeen = new Set(
      nonMail.map((s) => `${s.source}|${s.occurred_at}|${(s.summary ?? '').slice(0, 40)}`),
    );
    const merged: CompressedSignal[] = [...nonMail];
    for (const m of pickedMail) {
      const mk = `${m.source}|${m.occurred_at}|${(m.summary ?? '').slice(0, 40)}`;
      if (mergeSeen.has(mk)) continue;
      mergeSeen.add(mk);
      merged.push(m);
      if (merged.length >= maxSignals) break;
    }
    supporting_signals = merged.slice(0, maxSignals);
  }

  // Extract surgical raw facts: emails, dates, names, subjects
  const surgical_raw_facts: string[] = [];
  const emailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  const huntSourceSignalIds =
    winner.type === 'hunt'
      ? new Set(
          (winner.sourceSignals ?? [])
            .filter((s) => s.kind === 'signal' && typeof s.id === 'string' && s.id.length > 0)
            .map((s) => s.id as string),
        )
      : new Set<string>();

  const huntGroundedSnippets =
    winner.type === 'hunt' && huntSourceSignalIds.size > 0
      ? signalEvidence.filter(
          (s) => typeof s.signal_id === 'string' && huntSourceSignalIds.has(s.signal_id),
        )
      : [];

  const collectEligiblePeerEmailsFromSnippets = (snippets: SignalSnippet[]): string[] => {
    const out = new Set<string>();
    for (const s of snippets) {
      if (!s.author) continue;
      emailPattern.lastIndex = 0;
      const em = s.author.match(emailPattern);
      if (!em) continue;
      const addr = em[0].toLowerCase();
      if (!isEligibleExternalPeerEmail(addr, userEmails)) continue;
      out.add(addr);
    }
    return [...out];
  };

  const huntGroundedPeerEmails = collectEligiblePeerEmailsFromSnippets(huntGroundedSnippets);
  const huntGroundedPeerEmailSet = new Set(huntGroundedPeerEmails);

  const evidenceForSurgicalFacts =
    winner.type === 'hunt'
      ? huntGroundedSnippets.length > 0
        ? huntGroundedSnippets
        : huntSourceSignalIds.size > 0
          ? []
          : signalEvidence.slice(0, 7)
      : shouldApplyFinancialSingleFocus(winner) && supporting_signals.length > 0
        ? signalEvidence.filter((e) =>
            supporting_signals.some((cs) => cs.occurred_at === e.date),
          )
        : signalEvidence.slice(0, 7);

  const relationshipContextEligibleEmails = extractEligibleBracketEmailsFromRelationshipContext(
    winner.relationshipContext,
    userEmails,
  );
  if (winner.type === 'hunt') {
    // Hunt: only label recipient_email when DB relationship context agrees with a thread-grounded peer.
    for (const addr of relationshipContextEligibleEmails) {
      if (huntGroundedPeerEmailSet.has(addr)) {
        surgical_raw_facts.push(`recipient_email: ${addr}`);
      }
    }
  } else {
    for (const addr of relationshipContextEligibleEmails) {
      surgical_raw_facts.push(`recipient_email: ${addr}`);
    }
  }

  const hunt_send_message_recipient_allowlist =
    winner.type === 'hunt' ? [...huntGroundedPeerEmails] : [];

  // Extract emails from signals
  for (const s of evidenceForSurgicalFacts.slice(0, 7)) {
    if (s.subject) surgical_raw_facts.push(`email_subject: ${s.subject.slice(0, 100)}`);
    if (s.author) {
      const authorEmail = s.author.match(emailPattern);
      if (authorEmail) {
        const raw = authorEmail[0];
        if (isEligibleExternalPeerEmail(raw, userEmails)) {
          surgical_raw_facts.push(`contact_email: ${raw}`);
        }
      }
    }
  }

  for (const addr of huntGroundedPeerEmails.slice(0, 3)) {
    surgical_raw_facts.push(`hunt_grounded_peer_email: ${addr}`);
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
    ...guardrails.skippedRecently.map((r) => {
      const reason = r.skip_reason ? ` (reason: ${r.skip_reason})` : '';
      return `[${r.generated_at.slice(0, 10)}] ${r.action_type ?? 'unknown'} SKIPPED${reason}: ${(r.directive_text ?? '').slice(0, 80)}`;
    }),
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
    return isEligibleExternalPeerEmail(email, userEmails);
  });

  // Hunt: never treat relationshipContext or LIFE_CONTEXT senders as To: unless the same address
  // appears on the winning hunt source signal rows (huntGroundedPeerEmails).
  const hasHuntGroundedPeerRecipient = winner.type === 'hunt' && huntGroundedPeerEmails.length > 0;

  // For entity-linked discrepancies, ONLY the entity's DB email counts as a confirmed
  // recipient. Signal senders in the evidence window are unrelated parties, not the
  // target person — using them causes the LLM to address emails to random senders.
  const has_real_recipient =
    winner.type === 'hunt'
      ? hasHuntGroundedPeerRecipient
      : (isGoalLinkedDiscrepancy || isEntityLinkedDiscrepancy)
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
  let selectedCandidate =
    winner.type === 'hunt' ? winner.content.slice(0, 8000) : winner.content.slice(0, 500);
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

  const evidenceForTimeline =
    shouldApplyFinancialSingleFocus(winner) && supporting_signals.length > 0
      ? signalEvidence.filter((e) =>
          supporting_signals.some((cs) => cs.occurred_at === e.date),
        )
      : signalEvidence;

  return {
    selected_candidate: selectedCandidate,
    candidate_class: winner.type,
    candidate_title: winner.title,
    candidate_reason:
      winner.relatedSignals.slice(0, 5).join('; ').slice(0, 800) || winner.content.slice(0, 200),
    candidate_goal: winner.matchedGoal
      ? `${winner.matchedGoal.text} [${winner.matchedGoal.category}, p${winner.matchedGoal.priority}]`
      : null,
    matched_goal_category: winner.matchedGoal?.category ?? null,
    candidate_score: winner.score,
    candidate_due_date,
    supporting_signals,
    life_context_signals,
    candidate_context_enrichment,
    surgical_raw_facts: surgical_raw_facts.slice(0, 15),
    active_goals,
    locked_constraints: pinnedConstraints,
    locked_contacts_prompt:
      lockedContactPromptLines && lockedContactPromptLines.length > 0
        ? lockedContactPromptLines.map((l) => `- ${l.trim()}`).join('\n')
        : null,
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
    already_sent_14d: entityConversationState && winner.entityName
      ? (alreadySent ?? []).filter((line) => {
          const lower = line.toLowerCase();
          const entityTokens = winner.entityName!.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
          return !entityTokens.some((t) => lower.includes(t));
        })
      : (alreadySent ?? []),
    behavioral_mirrors: shouldApplyFinancialSingleFocus(winner)
      ? []
      : buildBehavioralMirrors(antiPatterns ?? [], divergences ?? []),
    conviction_math: (() => {
      if (shouldApplyFinancialSingleFocus(winner)) return null;
      if (!convictionDecision) return null;
      return [
        `CONVICTION MATH (inferred from signals — not user-provided):`,
        convictionDecision.math,
        ``,
        `OPTIMAL ACTION: ${convictionDecision.optimalAction}`,
        convictionDecision.stopSecondGuessing ? `STOP SECOND-GUESSING: The math is definitive. Do not hedge.` : ``,
        `CATASTROPHIC SCENARIO (${convictionDecision.catastrophicProbability}% probability): ${convictionDecision.catastrophicScenario}`,
        `KEY HEDGE: ${convictionDecision.keyHedge}`,
      ]
        .filter(Boolean)
        .join('\n');
    })(),
    behavioral_history: shouldApplyFinancialSingleFocus(winner) ? null : behavioralHistory ?? null,
    avoidance_observations: shouldApplyFinancialSingleFocus(winner) ? [] : avoidanceObservations ?? [],
    relationship_timeline: buildRelationshipTimeline(
      evidenceForTimeline,
      (winner.type === 'discrepancy' && winner.discrepancyClass === 'decay' && winner.entityName)
        ? winner.entityName
        : winner.type === 'hunt' && winner.entityName
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
      if (winner.type === 'hunt' && huntGroundedPeerEmails.length > 0) {
        return buildHuntRecipientBriefFromGroundedPeers(huntGroundedPeerEmails, huntGroundedSnippets);
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
    user_voice_patterns: userVoicePatterns ?? null,
    hunt_send_message_recipient_allowlist,
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
 * Extract voice patterns from the user's recently approved+executed send_message artifacts.
 * Returns a short style block like:
 *   USER_VOICE: Short sentences, signs off with "Best, Brandon", warm but direct
 * Returns null if insufficient data (< 3 approved emails).
 */
async function extractUserVoicePatterns(userId: string): Promise<string | null> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();

  const { data: rows } = await supabase
    .from('tkg_actions')
    .select('execution_result')
    .eq('user_id', userId)
    .eq('action_type', 'send_message')
    .in('status', ['approved', 'executed'])
    .gte('generated_at', thirtyDaysAgo)
    .order('generated_at', { ascending: false })
    .limit(10);

  if (!rows || rows.length < 3) return null;

  const bodies: string[] = [];
  for (const row of rows) {
    const result = row.execution_result as Record<string, unknown> | null;
    const artifact = result?.artifact as Record<string, unknown> | undefined;
    const body = artifact?.body as string | undefined;
    if (body && body.length > 20) bodies.push(body);
  }
  if (bodies.length < 3) return null;

  const sentenceLengths: number[] = [];
  const greetings: string[] = [];
  const signoffs: string[] = [];

  for (const body of bodies) {
    const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    for (const s of sentences) {
      sentenceLengths.push(s.trim().split(/\s+/).length);
    }
    const firstLine = body.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
    if (/^(Hi|Hey|Hello|Dear|Good\s)/i.test(firstLine)) {
      greetings.push(firstLine.split(/[,!]/)[0]);
    }
    const lines = body.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const lastTwo = lines.slice(-2).join(' ');
    const signoffMatch = lastTwo.match(/(?:Best|Thanks|Cheers|Regards|Warmly|Sincerely|Talk soon|Looking forward).*$/i);
    if (signoffMatch) signoffs.push(signoffMatch[0].slice(0, 40));
  }

  const avgLen = sentenceLengths.length > 0
    ? Math.round(sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length)
    : 12;
  const lenLabel = avgLen <= 8 ? 'Very short sentences' : avgLen <= 14 ? 'Short sentences' : 'Medium-length sentences';

  const traits: string[] = [lenLabel];
  if (greetings.length >= 2) {
    const topGreeting = mode(greetings);
    traits.push(`opens with "${topGreeting}"`);
  }
  if (signoffs.length >= 2) {
    const topSignoff = mode(signoffs);
    traits.push(`signs off with "${topSignoff}"`);
  }

  return `USER_VOICE (match this style — do not deviate): ${traits.join(', ')}`;
}

function mode(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const s of arr) {
    const lower = s.toLowerCase();
    counts.set(lower, (counts.get(lower) ?? 0) + 1);
  }
  let best = arr[0];
  let bestCount = 0;
  for (const [k, v] of counts) {
    if (v > bestCount) { bestCount = v; best = arr.find((s) => s.toLowerCase() === k) ?? arr[0]; }
  }
  return best;
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

function formatLifeContextPromptBlock(signals: CompressedSignal[]): string | null {
  if (!signals.length) return null;
  const lines = signals.map((s) => {
    const dirLabel = s.direction === 'sent' ? '[SENT]' : s.direction === 'received' ? '[RECEIVED]' : '';
    const entityPart = s.entity ? ` ${s.direction === 'sent' ? 'To' : 'From'}: ${s.entity}` : '';
    return `- [${s.occurred_at}] [${s.source}]${dirLabel ? ` ${dirLabel}` : ''}${entityPart} ${s.summary}`;
  });
  return (
    'LIFE_CONTEXT (cross-source snapshot — your life beyond this thread; reference when relevant; ' +
    'do not invent facts not listed):\n' +
    lines.join('\n')
  );
}

/** When LIFE_CONTEXT is in the user prompt, require a concrete cross-surface detail in outputs ("how did it know that"). */
const LIFE_CONTEXT_WEAVE_RULE =
  'LIFE_CONTEXT_WEAVE (mandatory when LIFE_CONTEXT appears above):\n' +
  '- In `directive`, `why_now`, and (for send_message) the email `body`, include at least one concrete detail clearly grounded in LIFE_CONTEXT (calendar event title or date, file or doc name, task title, chat topic). Paraphrase closely; do not invent facts not listed there.\n' +
  '- The reader should feel you noticed their life beyond the primary email thread. If LIFE_CONTEXT items are unrelated to this recipient, one short grounded phrase still counts.\n' +
  '- Do not output the labels "LIFE_CONTEXT", "cross-source snapshot", or other system jargon in `directive`, `why_now`, subject, or body.\n';

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
  const diagnosticLensBlock = buildDiagnosticLensBlock(ctx.matched_goal_category);
  const diagnosticLensSection = diagnosticLensBlock ? `DIAGNOSTIC_LENS:\n${diagnosticLensBlock}` : '';
  const responsePatternSection = buildResponsePatternPromptBlock(
    isPaymentDeadlinePromptContext(ctx) ? [] : ctx.response_pattern_lines ?? [],
  );
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

    if (diagnosticLensSection) {
      m.push(diagnosticLensSection);
    }

    m.push(
      `Write an email from the user to:\n${ctx.recipient_brief}\n\nTODAY: ${today()}`,
    );

    if (ctx.candidate_class === 'discrepancy') {
      m.push(DISCREPANCY_FINISHED_WORK_USER_BLOCK);
    }

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

    const lifeCtxRecipient = formatLifeContextPromptBlock(ctx.life_context_signals ?? []);
    if (lifeCtxRecipient) {
      m.push(lifeCtxRecipient);
      m.push(LIFE_CONTEXT_WEAVE_RULE);
    }

    if (ctx.locked_contacts_prompt) {
      m.push(
        `LOCKED_CONTACTS (never mention these in any artifact):\n${ctx.locked_contacts_prompt}`,
      );
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
      if (!isPaymentDeadlinePromptContext(ctx) && ctx.behavioral_mirrors.length > 0) {
        m.push(
          `BEHAVIORAL_MIRROR:\nThese patterns were detected in the user's behavior. You may reference them in your artifact if they are directly relevant to the candidate. Do not invent additional patterns.\n\n` +
            ctx.behavioral_mirrors.map((mir, i) => `${i + 1}. ${mir}`).join('\n\n'),
        );
      }
      if (!isPaymentDeadlinePromptContext(ctx) && ctx.avoidance_observations.length > 0) {
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
        return `- [${s.occurred_at}] [${s.source}]${dir ? ` ${dir}` : ''} ${s.summary}`;
      });
      m.push(`RECENT_SIGNALS:\n${signalLines.join('\n')}`);
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

    if (ctx.user_voice_patterns) {
      m.push(ctx.user_voice_patterns);
    }

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
  if (diagnosticLensSection) {
    sections.push(diagnosticLensSection);
  }
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
    `If a specific date or contact detail is missing from SUPPORTING_SIGNALS, write honest finished sentences (e.g. "No interview date appears in the signals — contact them to confirm") — never [INSERT DATE] or any bracket placeholder. ` +
    `Do the work.\n\n` +
    `PATH B: CANDIDATE_CLASS is anything else\n` +
    `Produce the artifact that moves the user closest to the matched goal. ` +
    `A single strong email thread IS enough evidence. You do not need cross-domain convergence. ` +
    `If the signals show a clear next step, produce it. If the signals show a gap the user hasn't addressed, name it and close it.\n\n` +
    `MULTI-SIGNAL SAME CALENDAR DAY: If SUPPORTING_SIGNALS list several brands or threads on one date but only one line has a dated payment obligation with dollar amounts for that issuer, the write_document covers that obligation only — omit informational noise (credits applied, "payment received," small P2P, marketing). One finished payment artifact, not a digest.\n\n` +
    `OUTPUT RULE: You MUST output decision "ACT". HOLD is not available. The candidate has already been validated.`,
  );

  // Avoidance observations — pre-computed facts, not inferences.
  // These give the model the specific signals it needs to detect avoidance without
  // having to infer them from 3 signal snippets alone.
  if (!isPaymentDeadlinePromptContext(ctx) && ctx.avoidance_observations.length > 0) {
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
  if (!isPaymentDeadlinePromptContext(ctx) && ctx.behavioral_mirrors.length > 0) {
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
  if (ctx.conviction_math && !isPaymentDeadlinePromptContext(ctx)) {
    sections.push(
      `CONVICTION_MATH:\nThis is inferred from financial and career signals in the data — the user did NOT provide this.\n` +
      `Your artifact must be consistent with the optimal action below. If the math says wait, do not suggest pursuing distractions. ` +
      `If the math says bridge, produce the one specific bridge action.\n\n` +
      ctx.conviction_math,
    );
  }

  // Behavioral history — weekly summaries from the last 8 weeks.
  // Gives the model long-term trajectory, not just the 7-day snapshot.
  if (ctx.behavioral_history && !isPaymentDeadlinePromptContext(ctx)) {
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

  if (ctx.candidate_class === 'hunt') {
    sections.push(
      'HUNT_WINNER_RULE: The evidence block contains HUNT_ANOMALY_FINDING — counts, domains, and dates there are authoritative. Expand into one finished artifact; never replace with generic advice.',
    );
  }

  if (ctx.candidate_class === 'discrepancy') {
    sections.push(DISCREPANCY_FINISHED_WORK_USER_BLOCK);
  }

  if (ctx.candidate_context_enrichment) {
    sections.push(ctx.candidate_context_enrichment);
  }

  const mechanismGroundingRules =
    ctx.matched_goal_category === 'financial'
      ? `Grounding rules (financial lens — payment/statement winners):\n` +
        `- One concrete financial signal (issuer + amount or minimum + due date from SUPPORTING_SIGNALS or RAW_FACTS) can anchor the diagnosis; do not invent a second vendor just to satisfy a multi-signal checklist.\n` +
        `- Mechanism should be logistical (deadline proximity, fee risk, cash timing) — not a lecture on the user's habits.\n` +
        `- Include at least one explicit date/time marker.\n` +
        `- Do NOT restate CANDIDATE_TITLE.\n` +
        `- Treat MECHANISM_HINT as fallback only if your grounded diagnosis is weak.\n`
      : `Grounding rules:\n` +
        `- Connect at least TWO concrete supporting signals from this context.\n` +
        `- Include at least one explicit date/time marker.\n` +
        `- Explain why this discrepancy exists NOW.\n` +
        `- Do NOT restate CANDIDATE_TITLE.\n` +
        `- Treat MECHANISM_HINT as fallback only if your grounded diagnosis is weak.\n`;

  if (ctx.matched_goal_category === 'financial') {
    sections.push(
      'FINANCIAL_SINGLE_FOCUS:\n' +
        'When a card/loan/utility statement in context has a minimum or balance and a due date, the artifact is only that payment path: copy-ready text (self-email or calendar note) with amounts and dates verbatim from signals. Include a pay URL only if the same URL appears verbatim in the evidence — never invent links.',
    );
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
    mechanismGroundingRules,
  );

  if (ctx.candidate_goal) {
    sections.push(`GOAL_ALIGNMENT:\n${ctx.candidate_goal}`);
  }

  sections.push(`SCORE: ${ctx.candidate_score.toFixed(2)}`);

  sections.push(ctx.candidate_analysis);
  if (ctx.locked_contacts_prompt) {
    sections.push(
      `LOCKED_CONTACTS (never mention these in any artifact):\n${ctx.locked_contacts_prompt}`,
    );
  }
  if (ctx.entity_analysis && !isPaymentDeadlinePromptContext(ctx)) {
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

  if (isPaymentDeadlinePromptContext(ctx)) {
    sections.push(
      'SINGLE_FINDING_OUTPUT (mandatory — hard rule):\n' +
        '- Output exactly ONE payment or statement obligation across the entire JSON. `directive`, `insight`, and `why_now` must each be one neutral operational sentence (issuer + amount or minimum + due date/window from SUPPORTING_SIGNALS or RAW_FACTS only).\n' +
        '- Forbidden in those fields and in `causal_diagnosis`: inbox velocity, "inbound → outbound", "avoidance," "systematic," "compounds daily," "pattern of," habit or character judgment, or naming any second vendor, bill, or brand.\n' +
        '- `artifact.title` + `artifact.content` must address that single obligation only — no "FINANCIAL NOTIFICATIONS" digests, no multi-brand bullet lists, no seven-item rundowns. If SUPPORTING_SIGNALS shows one row, that is the only bill you may discuss.\n' +
        '- Treat every other signal in the day as non-user-visible context you must not surface in any JSON field.\n' +
        '- Violations are invalid output — rewrite until compliant.',
    );
  }

  const lifeCtxLong = formatLifeContextPromptBlock(ctx.life_context_signals ?? []);
  if (lifeCtxLong) {
    sections.push(lifeCtxLong);
    sections.push(LIFE_CONTEXT_WEAVE_RULE);
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
      (ctx.user_voice_patterns ? `${ctx.user_voice_patterns}\n\n` : '') +
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
  // Omit for payment-deadline runs — "replied: false" / thread framing steers listicles and moralizing.
  if (!isPaymentDeadlinePromptContext(ctx)) {
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

    const { data: connectorEmailRows } = await supabase
      .from('user_tokens')
      .select('email')
      .eq('user_id', userId)
      .in('provider', ['google', 'microsoft'])
      .is('disconnected_at', null);
    for (const row of connectorEmailRows ?? []) {
      const em = row.email as string | null | undefined;
      if (typeof em === 'string' && em.trim()) emails.add(em.trim().toLowerCase());
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

export async function checkConsecutiveDuplicate(
  userId: string,
  newDirectiveText: string,
): Promise<{ isDuplicate: boolean; matchingActionId?: string; similarity?: number }> {
  const DUPLICATE_SHAPE_LOOKBACK_MS = daysMs(1);
  const DUPLICATE_SHAPE_REPEAT_SIMILARITY = 0.88;
  const DUPLICATE_SHAPE_IMMEDIATE_SIMILARITY = 0.5;
  const DUPLICATE_SHAPE_MAX_VISIBLE_COPIES = 2;
  const supabase = createServerClient();

  try {
    const since = new Date(Date.now() - DUPLICATE_SHAPE_LOOKBACK_MS).toISOString();
    const { data: recentActions } = await supabase
      .from('tkg_actions')
      .select('id, directive_text, action_type, execution_result, status')
      .eq('user_id', userId)
      .in('status', ['pending_approval', 'approved', 'executed', 'skipped', 'draft_rejected', 'rejected'])
      .gte('generated_at', since)
      .not('action_type', 'in', '("do_nothing")')
      .order('generated_at', { ascending: false })
      .limit(25);

    if (!recentActions || recentActions.length === 0) {
      return { isDuplicate: false };
    }

    const newNormalized = normalizeText(newDirectiveText);
    if (!newNormalized) return { isDuplicate: false };

    const similarVisibleActions: Array<{ id: string; similarity: number }> = [];

    for (const action of recentActions) {
      if (!isNonEmptyString(action.directive_text)) continue;
      const actionType = (action.action_type as string | null) ?? '';
      if (actionType === 'do_nothing' || actionType === 'wait_rationale') continue;
      if (isInternalNoSendExecutionResult(action.execution_result)) continue;
      if (isVerificationStubPersistExecutionResult(action.execution_result)) continue;
      if (isDevForceFreshAutoSuppressedExecutionResult(action.execution_result)) continue;

      const existingNormalized = normalizeText(action.directive_text);
      const sim = similarityScore(newNormalized, existingNormalized);
      const actionId = action.id as string;
      const status = (action.status as string | null) ?? '';

      if (
        ['pending_approval', 'approved', 'executed'].includes(status) &&
        sim >= DUPLICATE_SHAPE_IMMEDIATE_SIMILARITY
      ) {
        return {
          isDuplicate: true,
          matchingActionId: actionId,
          similarity: sim,
        };
      }

      if (sim >= DUPLICATE_SHAPE_REPEAT_SIMILARITY) {
        similarVisibleActions.push({ id: actionId, similarity: sim });
      }
    }

    if (similarVisibleActions.length >= DUPLICATE_SHAPE_MAX_VISIBLE_COPIES) {
      return {
        isDuplicate: true,
        matchingActionId: similarVisibleActions[0]?.id,
        similarity: similarVisibleActions[0]?.similarity,
      };
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

  const homeworkReason = findHomeworkHandoffReason(`${output.action}\n${output.artifact}`);
  if (homeworkReason) {
    return { ok: false, reason: `homework_handoff_${homeworkReason}` };
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

function isDevForceFreshAutoSuppressedExecutionResult(executionResult: unknown): boolean {
  if (!executionResult || typeof executionResult !== 'object') return false;
  const reason = (executionResult as Record<string, unknown>).auto_suppression_reason;
  if (typeof reason !== 'string') return false;
  return /dev brain-receipt force-fresh run|forced fresh generation/i.test(reason);
}

/**
 * Mask dots inside email addresses, then split on whitespace that follows true sentence
 * enders (. ! ?). Avoids splitting on dots inside emails and on year decimals like "2026."
 * when not followed by space (single-sentence directives ending in a year stay one sentence).
 */
export function countSentences(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const masked = trimmed.replace(/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi, (email) =>
    email.replace(/\./g, '\u00b7'),
  );
  const parts = masked.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
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
  /(?:^|[\r\n])\s*ask\s*:/i,
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
  /\blet me know\b/i,
  /\bplease let me know\b/i,
  /\bplease advise\b/i,
  /\bwould\s+\w+\s+work\b/i,
  /\bare you available\b/i,
  /\bdo you have\b/i,
  /\bhappy to\b/i,
  /\?$/m,
  // Mid-sentence questions (write_document title/content often use ? not at line end; send_message already scans artifact for any ?).
  /\?/,
  // Finished-work anchors (payment / submission) — do NOT use task-manager lines like NEXT_ACTION:
  /https?:\/\/[^\s)\]]+/i,
  /\bpay\s+(?:the\s+)?(?:minimum|balance)\b/i,
  /\bpay\s+(?:the\s+)?\$\s*[\d,]+(?:\.\d{2})?\b/i,
  /\bsubmit\s+(?:the\s+)?payment\b/i,
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
  /\b(?:this|next)\s+week\b/i,
  /\b(?:last|past)\s+\d+\s+days?\b/i,
  /\bin\s+the\s+last\s+\d+\s+days?\b/i,
  /\b\d+\s+days?\s+(?:ago|without)\b/i,
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
  /\b(?:late fee|late fees)\b/i,
  /\bavoid\s+(?:a\s+)?late\b/i,
  /\b(?:no|zero)\s+replies?\b/i,
  /\bunreplied\b/i,
  /\bwithout\s+(?:a\s+)?response\b/i,
  /\bstill\s+(?:waiting|no\s+word)\b/i,
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
  if (
    actionType === 'write_document' ||
    actionType === 'make_decision' ||
    actionType === 'research' ||
    actionType === 'document'
  ) {
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

type ResolvedTemporalAnchor = {
  dayKey: string;
  timeMinutes: number | null;
};

function toDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function parseTimeMinutes(text: string): number | null {
  const twelveHour = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (twelveHour) {
    const hourRaw = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] ?? '0');
    if (!Number.isFinite(hourRaw) || hourRaw < 1 || hourRaw > 12 || minute < 0 || minute > 59) return null;
    const suffix = twelveHour[3].toLowerCase();
    let hour = hourRaw % 12;
    if (suffix === 'pm') hour += 12;
    return (hour * 60) + minute;
  }

  const twentyFourHour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    const minute = Number(twentyFourHour[2]);
    return (hour * 60) + minute;
  }

  return null;
}

function resolveTemporalAnchor(text: string, now = new Date()): ResolvedTemporalAnchor | null {
  if (!isNonEmptyString(text)) return null;
  const lower = text.toLowerCase();
  const timeMinutes = parseTimeMinutes(lower);

  if (/\btomorrow\b/i.test(lower)) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 1);
    return { dayKey: toDayKey(d), timeMinutes };
  }
  if (/\b(?:today|tonight)\b/i.test(lower)) {
    return { dayKey: toDayKey(now), timeMinutes };
  }

  const iso = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) {
    const day = new Date(`${iso[1]}T00:00:00Z`);
    if (!Number.isNaN(day.getTime())) return { dayKey: toDayKey(day), timeMinutes };
  }

  const monthDay = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,\s*(20\d{2}))?\b/i);
  if (monthDay) {
    const monthToken = monthDay[1].slice(0, 3).toLowerCase();
    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const month = monthMap[monthToken];
    const day = Number(monthDay[2]);
    const year = monthDay[3] ? Number(monthDay[3]) : now.getUTCFullYear();
    if (month !== undefined && Number.isFinite(day) && day >= 1 && day <= 31) {
      const resolved = new Date(Date.UTC(year, month, day));
      if (!Number.isNaN(resolved.getTime())) return { dayKey: toDayKey(resolved), timeMinutes };
    }
  }

  return null;
}

function getSendMessageTemporalConsistencyIssues(
  directiveText: string,
  artifact: Record<string, unknown> | null,
): string[] {
  if (!artifact || typeof artifact !== 'object') return [];
  const subject = isNonEmptyString(artifact.subject) ? artifact.subject : '';
  const body = isNonEmptyString(artifact.body) ? artifact.body : '';
  const content = isNonEmptyString(artifact.content) ? artifact.content : '';
  const artifactText = `${subject}\n${body || content}`.trim();
  if (!artifactText) return [];

  const directiveAnchor = resolveTemporalAnchor(directiveText);
  const artifactAnchor = resolveTemporalAnchor(artifactText);
  if (!directiveAnchor || !artifactAnchor) return [];

  if (directiveAnchor.dayKey !== artifactAnchor.dayKey) {
    return ['send_message temporal reference conflicts with directive timing'];
  }
  if (
    directiveAnchor.timeMinutes !== null &&
    artifactAnchor.timeMinutes !== null &&
    directiveAnchor.timeMinutes !== artifactAnchor.timeMinutes
  ) {
    return ['send_message temporal reference conflicts with directive timing'];
  }
  return [];
}

/** Finished documents must not use task-manager scaffolding (applies even when full decision-enforcement is skipped for discrepancy/insight). */
function getWriteDocumentTaskManagerLabelIssues(artifact: Record<string, unknown> | null): string[] {
  if (!artifact || typeof artifact !== 'object') return [];
  const title = isNonEmptyString(artifact.title) ? artifact.title.trim() : '';
  const content = isNonEmptyString(artifact.content) ? artifact.content.trim() : '';
  const text = `${title}\n${content}`.trim();
  const out: string[] = [];
  if (/\bNEXT_ACTION\s*:/i.test(text)) {
    out.push('decision_enforcement:forbidden_task_manager_next_action_label');
  }
  if (/\bOwner\s*:\s*you\b/i.test(text)) {
    out.push('decision_enforcement:forbidden_owner_you_task_line');
  }
  return out;
}

export type WriteDocumentMode = 'outbound_resolution_note' | 'internal_execution_brief';

const INTERNAL_EXECUTION_PURPOSE_RE =
  /\b(interview|answer architecture|answer script|close[_\s-]?the[_\s-]?loop|execution brief)\b/i;
const INTERNAL_EXECUTION_CONTEXT_RE =
  /\b(interview|phone screen|panel interview|role-specific answer|answer architecture|answer script)\b/i;
const INTERNAL_EXECUTION_TARGET_RE = /\b(candidate|user|yourself|you)\b/i;
const INTERNAL_EXECUTION_MOVE_RE =
  /\b(use this|answer script|send this(?: email)?(?: (?:today|now|tonight|tomorrow))?|send the email above|copy(?:\/|-)?paste|open with|say:|draft email to send|execution\b)\b/i;
const INTERNAL_EXECUTION_CHECKLIST_LINE_RE =
  /^\s*(?:[-*]|\d+\.)\s*(?:prepare|review|research|gather|brainstorm|locate|find|list|outline|draft|confirm|write)\b/gim;
const INTERNAL_EXECUTION_QUESTION_RE =
  /\b(?:questions?\s+(?:to answer|for yourself)|ask yourself)\b|^\s*(?:[-*]|\d+\.)\s*(?:what|which|who|how|when|where|why)\b/gim;
const INTERNAL_EXECUTION_FUTURE_ARTIFACT_RE =
  /\b(?:starting point|outline for later|notes for later|future artifact|future brief|turn this into|build the full|draft for later|prep brief)\b/i;

function collectWriteDocumentArtifactText(input: {
  artifact?: Record<string, unknown> | null;
}): string {
  const artifact = input.artifact ?? null;
  return [
    typeof artifact?.document_purpose === 'string' ? artifact.document_purpose : '',
    typeof artifact?.target_reader === 'string' ? artifact.target_reader : '',
    typeof artifact?.title === 'string' ? artifact.title : '',
    typeof artifact?.content === 'string' ? artifact.content : '',
  ].join('\n');
}

function collectWriteDocumentModeText(input: {
  artifact?: Record<string, unknown> | null;
  candidateTitle?: string | null;
  directiveText?: string | null;
  reason?: string | null;
}): string {
  return [
    collectWriteDocumentArtifactText({ artifact: input.artifact }),
    input.candidateTitle ?? '',
    input.directiveText ?? '',
    input.reason ?? '',
  ].join('\n');
}

export function getWriteDocumentMode(input: {
  actionType?: string | null;
  artifact?: Record<string, unknown> | null;
  discrepancyClass?: string | null;
  candidateTitle?: string | null;
  directiveText?: string | null;
  reason?: string | null;
}): WriteDocumentMode | null {
  if (normalizeDecisionActionType(input.actionType ?? '') !== 'write_document') {
    return null;
  }

  if (input.discrepancyClass === 'behavioral_pattern') {
    return 'internal_execution_brief';
  }

  const artifactText = collectWriteDocumentArtifactText({ artifact: input.artifact });
  const targetReader = typeof input.artifact?.target_reader === 'string'
    ? input.artifact.target_reader.trim()
    : '';
  if (!artifactText.trim()) {
    const fallbackCombined = collectWriteDocumentModeText(input);
    if (!fallbackCombined.trim()) {
      return 'outbound_resolution_note';
    }
    if (INTERNAL_EXECUTION_PURPOSE_RE.test(fallbackCombined)) {
      return 'internal_execution_brief';
    }
    if (
      INTERNAL_EXECUTION_CONTEXT_RE.test(fallbackCombined) &&
      INTERNAL_EXECUTION_MOVE_RE.test(fallbackCombined)
    ) {
      return 'internal_execution_brief';
    }
    return 'outbound_resolution_note';
  }

  if (INTERNAL_EXECUTION_PURPOSE_RE.test(artifactText)) {
    return 'internal_execution_brief';
  }

  if (targetReader && !INTERNAL_EXECUTION_TARGET_RE.test(targetReader)) {
    return 'outbound_resolution_note';
  }

  if (INTERNAL_EXECUTION_CONTEXT_RE.test(artifactText) && INTERNAL_EXECUTION_MOVE_RE.test(artifactText)) {
    return 'internal_execution_brief';
  }

  return 'outbound_resolution_note';
}

export function getInternalExecutionBriefIssues(
  artifact: Record<string, unknown> | null,
): Array<'missing_execution_move' | 'owner_checklist' | 'user_questions' | 'future_artifact'> {
  if (!artifact || typeof artifact !== 'object') return ['missing_execution_move'];
  const title = isNonEmptyString(artifact.title) ? artifact.title.trim() : '';
  const content = isNonEmptyString(artifact.content) ? artifact.content.trim() : '';
  const combined = `${title}\n${content}`.trim();
  const issues: Array<'missing_execution_move' | 'owner_checklist' | 'user_questions' | 'future_artifact'> = [];

  if (!INTERNAL_EXECUTION_MOVE_RE.test(combined)) {
    issues.push('missing_execution_move');
  }

  const checklistMatches = combined.match(INTERNAL_EXECUTION_CHECKLIST_LINE_RE) ?? [];
  if (checklistMatches.length >= 2) {
    issues.push('owner_checklist');
  }

  if (INTERNAL_EXECUTION_QUESTION_RE.test(combined)) {
    issues.push('user_questions');
  }

  if (INTERNAL_EXECUTION_FUTURE_ARTIFACT_RE.test(combined)) {
    issues.push('future_artifact');
  }

  return issues;
}

const BEHAVIORAL_PATTERN_GOAL_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'about',
  'after', 'before', 'while', 'where', 'when', 'what', 'have', 'will', 'would',
  'could', 'should', 'them', 'they', 'their', 'there', 'then', 'than', 'just',
  'real', 'yes', 'no', 'thread', 'decision',
]);

function extractBehavioralPatternGoalLabel(candidateGoal: string | null | undefined): string | null {
  if (!isNonEmptyString(candidateGoal)) return null;
  const cleaned = candidateGoal.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeBehavioralPatternText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function behavioralPatternGoalAppearsInText(text: string, goalLabel: string): boolean {
  const normalizedText = normalizeBehavioralPatternText(text);
  const normalizedGoal = normalizeBehavioralPatternText(goalLabel);
  if (!normalizedText || !normalizedGoal) return false;
  if (normalizedText.includes(normalizedGoal)) return true;

  const goalTokens = normalizedGoal
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !BEHAVIORAL_PATTERN_GOAL_STOPWORDS.has(token));
  if (goalTokens.length === 0) return false;

  const matched = goalTokens.filter((token) => normalizedText.includes(token));
  return matched.length >= Math.min(2, goalTokens.length);
}

function parseBehavioralPatternRepairFacts(text: string): {
  entityName?: string;
  count?: string;
  window?: string;
} {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const patterns: Array<{ pattern: RegExp; entityIndex: number; countIndex: number; windowIndex: number }> = [
    { pattern: /^(.+?)\s+has not replied after\s+(\d+)\s+messages?\s+in\s+(\d+\s+\w+)/i, entityIndex: 1, countIndex: 2, windowIndex: 3 },
    { pattern: /^(\d+)\s+(?:inbound\s+)?messages?\s+(?:to|for)\s+(.+?)\s+in\s+(\d+\s+\w+)(?:,?\s*\d+\s+replies?)?/i, entityIndex: 2, countIndex: 1, windowIndex: 3 },
    { pattern: /^(\d+)\s+unresolved\s+follow-?ups?\s+(?:to|for)\s+(.+?)\s+in\s+(\d+\s+\w+)(?:,?\s*\d+\s+replies?)?/i, entityIndex: 2, countIndex: 1, windowIndex: 3 },
    { pattern: /^(.+?)\s+after\s+(\d+)\s+(?:inbound\s+)?messages?\s+in\s+(\d+\s+\w+)/i, entityIndex: 1, countIndex: 2, windowIndex: 3 },
  ];

  for (const { pattern, entityIndex, countIndex, windowIndex } of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const entityName = match[entityIndex]?.trim().replace(/[.,;:!?]+$/, '');
    const count = match[countIndex]?.trim();
    const window = match[windowIndex]?.trim();
    if (entityName && count && window) {
      return { entityName, count, window };
    }
  }

  return {};
}

function getBehavioralPatternFinishedWorkIssues(input: {
  directiveText: string;
  reason: string;
  artifact: Record<string, unknown> | null;
  candidateGoal: string | null;
}): string[] {
  if (!input.artifact || typeof input.artifact !== 'object') return [];

  const title = isNonEmptyString(input.artifact.title) ? input.artifact.title.trim() : '';
  const content = isNonEmptyString(input.artifact.content) ? input.artifact.content.trim() : '';
  const combined = `${input.directiveText}\n${input.reason}\n${title}\n${content}`.trim();
  const issues: string[] = [];
  const goalLabel = extractBehavioralPatternGoalLabel(input.candidateGoal);

  if (goalLabel && !behavioralPatternGoalAppearsInText(combined, goalLabel)) {
    issues.push('decision_enforcement:behavioral_pattern_missing_goal_anchor');
  }
  const hasSendReadyLead =
    /\bSend this (?:today|now|tonight|tomorrow)\b/i.test(content) ||
    /\bSend this email\b/i.test(content) ||
    /\bSend (?:it|this) (?:today|now|tonight|tomorrow)\b/i.test(content) ||
    /\bSend (?:today|now|tonight|tomorrow)\b/i.test(content) ||
    /\bDRAFT EMAIL TO SEND\b/i.test(content) ||
    /\bEXECUTION\b[\s\S]{0,220}\bSend this email\b/i.test(content);
  const hasQuotedCopyPasteBlock = /[“"][^"”\n]{20,}[”"]/.test(content);
  if (!hasSendReadyLead && !hasQuotedCopyPasteBlock) {
    issues.push('decision_enforcement:behavioral_pattern_missing_send_ready_move');
  }
  const hasNoReplyStopCondition =
    /\bif (?:there is )?no (?:reply|response|answer)\b/i.test(content) ||
    /\bif no (?:reply|response|answer) (?:arrives?|comes?) by\b/i.test(content) ||
    /\bif silence continues past\b/i.test(content) ||
    /\bif you (?:do not|don['’]t) hear back\b/i.test(content) ||
    /\bif (?:they|he|she|we)\s+(?:do not|don['’]t)\s+(?:reply|respond|get back)\b/i.test(content);
  const hasStopAction =
    /\bmark (?:the |this )?(?:thread|conversation)\s+(?:as\s+)?stalled\b/i.test(content) ||
    /\bstop\b[^.\n]{0,40}\b(?:allocating attention|spending attention|following up|pursuing|chasing)\b/i.test(content) ||
    /\bclose the loop\b/i.test(content) ||
    /\barchive (?:the )?(?:thread|conversation)\b/i.test(content);
  if (!hasNoReplyStopCondition || !hasStopAction) {
    issues.push('decision_enforcement:behavioral_pattern_missing_stop_rule');
  }

  return issues;
}

/** Payment deadline write_document with $ + pay path — ownership lines like "Owner: you" are not required. */
function financialPaymentWriteDocumentLooksFinished(combinedText: string): boolean {
  const hasDollar = /\$\s*[\d,]+(?:\.\d{2})?/.test(combinedText);
  const hasPayPath =
    /https?:\/\/[^\s)\]]+/i.test(combinedText) ||
    /\bpay\s+(?:the\s+)?(?:minimum|balance)\b/i.test(combinedText) ||
    /\bpay\s+(?:the\s+)?\$\s*[\d,]+(?:\.\d{2})?/i.test(combinedText);
  return hasDollar && hasPayPath;
}

export function getDecisionEnforcementIssues(input: {
  actionType: string;
  directiveText: string;
  reason: string;
  artifact: ConvictionArtifact | Record<string, unknown> | null;
  discrepancyClass?: string | null;
  /** When `financial` and the artifact is a payment-deadline doc, drop the generic owner-assignment requirement. */
  matchedGoalCategory?: string | null;
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
  const writeDocumentMode = getWriteDocumentMode({
    actionType: input.actionType,
    artifact: artifactRecord,
    discrepancyClass: input.discrepancyClass ?? null,
    directiveText: input.directiveText,
    reason: input.reason,
  });
  const isInternalExecutionBrief = writeDocumentMode === 'internal_execution_brief';

  const sendMessageHasQuestion =
    normalizedType === 'send_message' && artifactText.length > 0 && /\?/.test(artifactText);
  const internalExecutionIssues =
    normalizedType === 'write_document' && isInternalExecutionBrief
      ? getInternalExecutionBriefIssues(artifactRecord)
      : [];
  const internalExecutionHasMove = !internalExecutionIssues.includes('missing_execution_move');
  if (!textHasAny(combinedText, EXPLICIT_ASK_PATTERNS) && !sendMessageHasQuestion && !internalExecutionHasMove) {
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
  if (normalizedType === 'write_document' && !isInternalExecutionBrief && !textHasAny(combinedText, OWNERSHIP_PATTERNS)) {
    issues.push('decision_enforcement:missing_owner_assignment');
  }
  if (textHasAny(combinedText, REWRITE_REQUIRED_PATTERNS)) {
    issues.push('decision_enforcement:requires_rewriting');
  }
  if (normalizedType === 'write_document') {
    issues.push(...getWriteDocumentTaskManagerLabelIssues(artifactRecord));
    if (isInternalExecutionBrief) {
      if (internalExecutionIssues.includes('owner_checklist')) {
        issues.push('decision_enforcement:internal_execution_brief_owner_checklist');
      }
      if (internalExecutionIssues.includes('user_questions')) {
        issues.push('decision_enforcement:internal_execution_brief_user_questions');
      }
      if (internalExecutionIssues.includes('future_artifact')) {
        issues.push('decision_enforcement:internal_execution_brief_future_artifact');
      }
    }
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
  // Discrepancy-sourced send_message (relationship decay, avoidance, risk, drift,
  // exposure) produces outreach emails whose purpose IS the reconnection action.
  // The existence of a real recipient + substantive body is sufficient — strip
  // missing_explicit_ask so the gate doesn't block warm reconnect emails.
  if (normalizedType === 'send_message' && input.discrepancyClass) {
    const artRec = input.artifact as Record<string, unknown>;
    const to = typeof artRec.to === 'string' ? artRec.to : '';
    const body = typeof artRec.body === 'string' ? artRec.body : '';
    if (to.includes('@') && body.length > 50) {
      out = out.filter(i => i !== 'decision_enforcement:missing_explicit_ask');
    }
  }
  if (
    input.matchedGoalCategory === 'financial' &&
    normalizedType === 'write_document' &&
    financialPaymentWriteDocumentLooksFinished(combinedText)
  ) {
    out = out.filter((i) => i !== 'decision_enforcement:missing_owner_assignment');
  }
  // Real question in outbound copy — “following up…” openers are common; don’t fail the whole run.
  if (sendMessageHasQuestion) {
    out = out.filter(
      (i) =>
        i !== 'decision_enforcement:passive_or_ignorable_tone' &&
        i !== 'decision_enforcement:obvious_first_layer_advice',
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
  matchedGoalCategory?: string | null;
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
        const financialSingleSignalOk =
          input.matchedGoalCategory === 'financial' &&
          /\$\s*[\d,]+/.test(diagnosisText) &&
          DIAGNOSIS_DATE_TIME_RE.test(diagnosisText);
        if (!financialSingleSignalOk) {
          issues.push('causal_diagnosis:insufficient_signal_grounding');
        }
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
  extras?: {
    active_goals?: string[];
    pipeline_dry_run?: PipelineDryRunReceipt;
    evidence_bundle?: EvidenceBundleReceipt;
  },
): GenerationRunLog {
  return {
    outcome: 'selected',
    stage: 'generation',
    reason: candidateDiscovery?.selectionReason ?? 'Directive generated successfully.',
    candidateFailureReasons: (candidateDiscovery?.topCandidates ?? [])
      .filter((c) => c.decision === 'rejected')
      .map((c) => c.decisionReason),
    candidateDiscovery,
    ...(extras?.active_goals?.length
      ? { brief_context_debug: { active_goals: extras.active_goals } }
      : {}),
    ...(extras?.pipeline_dry_run ? { pipeline_dry_run: extras.pipeline_dry_run } : {}),
    ...(extras?.evidence_bundle ? { evidence_bundle: extras.evidence_bundle } : {}),
  };
}

function buildBlockedCandidateReasonMessage(input: {
  title: string;
  reasons: string[];
}): string {
  return `BLOCKED: "${input.title.slice(0, 120)}" — ${input.reasons.join('; ')}`;
}

function buildNoSendGenerationLog(
  reason: string,
  stage: GenerationRunLog['stage'],
  candidateDiscovery: GenerationCandidateDiscoveryLog | null,
  blockedCandidate?: {
    candidateId: string;
    title: string;
    reasons: string[];
  },
): GenerationRunLog {
  const blockedCandidateReason = blockedCandidate
    ? buildBlockedCandidateReasonMessage({
        title: blockedCandidate.title,
        reasons: blockedCandidate.reasons,
      })
    : null;
  const normalizedDiscovery: GenerationCandidateDiscoveryLog | null = candidateDiscovery
    ? {
        ...candidateDiscovery,
        selectionReason: blockedCandidateReason ?? candidateDiscovery.selectionReason,
        failureReason: blockedCandidateReason ?? candidateDiscovery.failureReason ?? reason,
        topCandidates: blockedCandidateReason
          ? candidateDiscovery.topCandidates.map((candidate) =>
              candidate.id === blockedCandidate?.candidateId
                ? {
                    ...candidate,
                    decision: 'selected' as const,
                    decisionReason: blockedCandidateReason,
                  }
                : candidate,
            )
          : candidateDiscovery.topCandidates,
      }
    : null;

  const candidateFailureReasons = blockedCandidateReason
    ? normalizedDiscovery
      ? normalizedDiscovery.topCandidates.map((candidate) =>
          candidate.id === blockedCandidate?.candidateId
            ? blockedCandidateReason
            : candidate.decisionReason,
        )
      : [blockedCandidateReason]
    : normalizedDiscovery
    ? normalizedDiscovery.topCandidates.map((c) =>
      c.decision === 'selected'
        ? `Selected candidate blocked: ${reason}`
        : c.decisionReason)
    : [reason];

  return {
    outcome: 'no_send',
    stage,
    reason: blockedCandidateReason ?? reason,
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

/**
 * Deterministic operator-facing copy from scorer exact_blocker (one sentence directive + concrete fields).
 */
export function formatExactBlockerToOperatorText(block: ScorerExactBlocker): {
  directive: string;
  why_now: string;
  blocked_by: string;
} {
  const title = block.top_blocked_candidate_title?.trim();
  const stages = Object.entries(block.rejected_by_stage)
    .map(([k, v]) => `${k}=${v}`)
    .slice(0, 14)
    .join(', ');

  const directive = title
    ? `Foldera is not authorizing an outbound send while “${title.slice(0, 110)}” remains below the final authorization bar.`
    : `Foldera is not authorizing an outbound send today because ${block.blocker_reason.charAt(0).toLowerCase()}${block.blocker_reason.slice(1)}`.replace(/\s+/g, ' ').trim();

  const why_now = block.suppression_goal_text
    ? `A suppression goal still applies: ${block.suppression_goal_text.slice(0, 420).trim()}`
    : `The strongest surfaced rows were notifications, suppressed, or failed ranking invariants — none cleared a thread-backed outbound move.`;

  const blocked_by = [
    block.blocker_reason,
    title ? `Top surfaced row: “${title.slice(0, 100)}” (${block.top_blocked_candidate_type ?? 'unknown'} / ${block.top_blocked_candidate_action_type ?? 'unknown'}).` : null,
    `Survivors above score floor before final gate: ${block.survivors_before_final_gate}.`,
    stages ? `Stage drops: ${stages}.` : null,
    block.suppression_goal_text ? `Suppression: ${block.suppression_goal_text.slice(0, 320)}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    directive: directive.replace(/\s+/g, ' ').trim(),
    why_now: why_now.replace(/\s+/g, ' ').trim(),
    blocked_by: blocked_by.replace(/\s+/g, ' ').trim(),
  };
}

function buildNoValidActionBlockerDirective(scored: ScorerResultNoValidAction): ConvictionDirective {
  const b = scored.exact_blocker;
  const { directive, why_now, blocked_by } = formatExactBlockerToOperatorText(b);
  const baseLog = buildNoSendGenerationLog(b.blocker_reason, 'scoring', scored.candidateDiscovery);
  const generationLog: GenerationRunLog = { ...baseLog, no_valid_action_blocker: true };

  const embeddedArtifact = {
    type: 'wait_rationale' as const,
    context: `${why_now} ${blocked_by}`.slice(0, 3800),
    evidence: blocked_by.slice(0, 1800),
    tripwires: [
      b.suppression_goal_text
        ? `Re-evaluate when this suppression goal no longer applies: ${b.suppression_goal_text.slice(0, 220)}`
        : 'Unlock when a thread-backed candidate clears the score floor and ranking invariants (fresh reply-worthy mail or commitment).',
    ],
  };

  const evidence: EvidenceItem[] = [{ type: 'pattern', description: blocked_by.slice(0, 420) }];
  if (b.suppression_goal_text) {
    evidence.push({ type: 'goal', description: b.suppression_goal_text.slice(0, 420) });
  }

  return {
    directive,
    action_type: 'do_nothing',
    confidence: 55,
    reason: why_now,
    evidence,
    generationLog,
    embeddedArtifact,
    embeddedArtifactType: 'wait_rationale',
  } as ConvictionDirective;
}

function buildBudgetCapDirectiveFromScored(
  scored: ScorerResultWinnerSelected,
  budgetRaw: unknown,
  rpcErrorMessage?: string,
): ConvictionDirective {
  const reason = rpcErrorMessage
    ? `Monthly Anthropic API budget gate closed (${rpcErrorMessage.slice(0, 160)}).`
    : 'Monthly Anthropic API budget cap reached; generation skipped before LLM calls.';
  return {
    directive: BUDGET_CAP_DIRECTIVE_SENTINEL,
    action_type: 'do_nothing',
    confidence: 0,
    reason,
    evidence: [
      {
        type: 'pattern',
        description: 'api_budget_check_and_reserve returned allowed=false or failed closed',
      },
    ],
    generationLog: buildNoSendGenerationLog(
      'Monthly API budget cap reached.',
      'system',
      scored.candidateDiscovery,
    ),
    embeddedArtifact: {
      type: 'wait_rationale',
      why_wait:
        'Foldera reached the configured monthly Anthropic API budget. No LLM calls were made for this directive.',
      tripwire_date: 'After credits are added or the cap is raised',
      trigger_condition: 'Anthropic billing replenished or Postgres api_budget configuration updated.',
    },
    embeddedArtifactType: 'wait_rationale',
  } as ConvictionDirective;
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

/** Inbox-only sources; calendar/drive/tasks/conversations use other `source` values. */
const EVIDENCE_BUNDLE_EMAIL_SOURCES = new Set(['gmail', 'outlook']);

/** Default hard ceiling on snippet count returned from cross-source merge (prompt / token guard). */
const CROSS_SOURCE_BUNDLE_MAX_SNIPPETS_DEFAULT = 28;

export type CrossSourceLifeMergeOpts = {
  maxBundleCap?: number;
  maxPerSource?: number;
  scanLimit?: number;
};

function capCrossSourceSnippetBundle(
  snippets: SignalSnippet[],
  maxBundle: number,
): SignalSnippet[] {
  if (snippets.length <= maxBundle) return snippets;
  return snippets.slice(0, maxBundle);
}

/** Minimum distinct `source` values we try to surface when DB rows exist (life-aware bundle). */
const EVIDENCE_DISTINCT_SOURCE_FLOOR = 3;

const LIFE_SNAPSHOT_SOURCE_BUCKETS: string[][] = [
  ['google_calendar', 'outlook_calendar'],
  ['drive', 'onedrive'],
  ['microsoft_todo'],
  ['claude_conversation', 'chatgpt_conversation', 'conversation_ingest'],
];

async function ensureMinimumEvidenceSourceDiversity(
  userId: string,
  snippets: SignalSnippet[],
): Promise<SignalSnippet[]> {
  const distinct = new Set(snippets.map((s) => s.source).filter(Boolean));
  if (distinct.size >= EVIDENCE_DISTINCT_SOURCE_FLOOR) return snippets;

  const supabase = createServerClient();
  const lookbackIso = new Date(Date.now() - daysMs(90)).toISOString();
  const used = new Set(snippets.map(signalSnippetDedupeKey));
  const out = [...snippets];

  for (const bucket of LIFE_SNAPSHOT_SOURCE_BUCKETS) {
    if (new Set(out.map((s) => s.source).filter(Boolean)).size >= EVIDENCE_DISTINCT_SOURCE_FLOOR) {
      break;
    }
    if (bucket.some((src) => distinct.has(src))) continue;

    let rows: Array<Record<string, unknown>> | null = null;
    try {
      const res = await supabase
        .from('tkg_signals')
        .select('id, content, source, occurred_at, author, type')
        .eq('user_id', userId)
        .eq('processed', true)
        .gte('occurred_at', lookbackIso)
        .in('source', bucket)
        .order('occurred_at', { ascending: false })
        .limit(6);
      rows = (res?.data ?? null) as Array<Record<string, unknown>> | null;
    } catch {
      continue;
    }

    for (const row of rows ?? []) {
      if (isBlockedSender(row.author as string)) continue;
      const decrypted = decryptWithStatus(String((row as { content?: string }).content ?? ''));
      if (decrypted.usedFallback) continue;
      const parsed = parseSignalSnippet(decrypted.plaintext, row as Record<string, unknown>);
      if (!parsed) continue;
      const key = signalSnippetDedupeKey(parsed);
      if (used.has(key)) continue;
      used.add(key);
      out.push(parsed);
      distinct.add(parsed.source);
      break;
    }
  }

  return out;
}

function signalSnippetDedupeKey(s: SignalSnippet): string {
  return `${s.source}|${s.date}|${(s.snippet ?? '').slice(0, 80)}`;
}

/**
 * Merges recent processed non-email signals into winner-scoped evidence so the generator
 * sees a cross-source slice of the user's life (calendar, drive, tasks, chats), not only
 * the winning mail thread IDs from the scorer.
 *
 * Never returns more than `opts.maxBundleCap` (default {@link CROSS_SOURCE_BUNDLE_MAX_SNIPPETS_DEFAULT}) snippets (existing + new).
 */
async function appendCrossSourceLifeContextSnippets(
  userId: string,
  existing: SignalSnippet[],
  opts?: CrossSourceLifeMergeOpts,
): Promise<SignalSnippet[]> {
  const maxBundleCap = opts?.maxBundleCap ?? CROSS_SOURCE_BUNDLE_MAX_SNIPPETS_DEFAULT;
  const MAX_PER_SOURCE = opts?.maxPerSource ?? 5;
  const scanLimit = opts?.scanLimit ?? 400;

  const supabase = createServerClient();
  const lookbackIso = new Date(Date.now() - daysMs(90)).toISOString();
  const { data: rows, error } = await supabase
    .from('tkg_signals')
    .select('id, content, source, occurred_at, author, type')
    .eq('user_id', userId)
    .eq('processed', true)
    .gte('occurred_at', lookbackIso)
    .order('occurred_at', { ascending: false })
    .limit(scanLimit);

  if (error || !rows?.length) {
    const out = capCrossSourceSnippetBundle(existing, maxBundleCap);
    logStructuredEvent({
      event: 'cross_source_life_context_merge',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'cross_source_skipped',
      details: {
        scope: 'appendCrossSourceLifeContextSnippets',
        cross_source_snippet_count: out.length,
        existing_snippet_count: existing.length,
        cross_source_new_added: 0,
        merged_before_cap: existing.length,
        db_row_scan_count: 0,
        db_error: Boolean(error),
        max_bundle_cap: maxBundleCap,
      },
    });
    return out;
  }

  const used = new Set(existing.map(signalSnippetDedupeKey));
  const perSource = new Map<string, number>();
  /** Room for new snippets after winner-scoped rows — total bundle must stay ≤ cap. */
  const maxNew = Math.max(0, maxBundleCap - existing.length);
  const extra: SignalSnippet[] = [];

  for (const row of rows) {
    if (extra.length >= maxNew) break;
    const src = String((row as { source?: string }).source ?? '');
    if (EVIDENCE_BUNDLE_EMAIL_SOURCES.has(src)) continue;
    const n = perSource.get(src) ?? 0;
    if (n >= MAX_PER_SOURCE) continue;
    if (isBlockedSender((row as { author?: string }).author as string)) continue;
    const decrypted = decryptWithStatus(String((row as { content?: string }).content ?? ''));
    if (decrypted.usedFallback) continue;
    const parsed = parseSignalSnippet(decrypted.plaintext, row as Record<string, unknown>);
    if (!parsed) continue;
    const key = signalSnippetDedupeKey(parsed);
    if (used.has(key)) continue;
    used.add(key);
    perSource.set(src, n + 1);
    extra.push(parsed);
  }

  const merged = extra.length === 0 ? existing : [...existing, ...extra];
  const out = capCrossSourceSnippetBundle(merged, maxBundleCap);
  logStructuredEvent({
    event: 'cross_source_life_context_merge',
    level: 'info',
    userId,
    artifactType: null,
    generationStatus: 'cross_source_merged',
    details: {
      scope: 'appendCrossSourceLifeContextSnippets',
      cross_source_snippet_count: out.length,
      existing_snippet_count: existing.length,
      cross_source_new_added: extra.length,
      merged_before_cap: merged.length,
      db_row_scan_count: rows.length,
      max_bundle_cap: maxBundleCap,
    },
  });
  return out;
}

async function fetchWinnerSignalEvidence(
  userId: string,
  winner: ScoredLoop,
): Promise<SignalSnippet[]> {
  const supabase = createServerClient();
  const isDecayDiscrepancy =
    winner.type === 'discrepancy' && winner.discrepancyClass === 'decay';

  const sourceIds = await resolveEvidenceSignalIdsForWinner(supabase, userId, winner);

  let snippets: SignalSnippet[] = [];
  let senderBlockedCount = 0;

  if (sourceIds.length > 0) {
    const { data: sourceRows } = await supabase
      .from('tkg_signals')
      .select('id, content, source, occurred_at, author, type')
      .eq('user_id', userId)
      .in('id', sourceIds);

    for (const row of sourceRows ?? []) {
      if (isBlockedSender(row.author as string)) { senderBlockedCount++; continue; }
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
      .select('id, content, source, occurred_at, author, type')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', ninetyDaysAgoEvidence)
      .order('occurred_at', { ascending: false })
      .limit(150);

    const existingTexts = new Set(snippets.map((s) => s.snippet.slice(0, 60)));

    for (const row of contextRows ?? []) {
      if (snippets.length >= 12) break;
      if (isBlockedSender(row.author as string)) { senderBlockedCount++; continue; }
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
        .select('id, content, source, occurred_at, author, type')
        .eq('user_id', userId)
        .eq('processed', true)
        .gte('occurred_at', lookbackIso)
        .order('occurred_at', { ascending: false })
        .limit(500);

      const existingTexts = new Set(snippets.map((s) => s.snippet.slice(0, 60)));
      const DECAY_ENTITY_SNIPPET_CAP = 40;

      for (const row of decayRows ?? []) {
        if (snippets.length >= DECAY_ENTITY_SNIPPET_CAP) break;
        if (isBlockedSender(row.author as string)) { senderBlockedCount++; continue; }
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
          .select('id, content, source, occurred_at, author, type')
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
        .select('id, content, source, occurred_at, author, type')
        .eq('user_id', userId)
        .eq('type', 'response_pattern')
        .eq('processed', true)
        .gte('occurred_at', ninetyRpIso)
        .order('occurred_at', { ascending: false })
        .limit(150);

      for (const row of rpRows ?? []) {
        if (rpAdded >= RESPONSE_PATTERN_DECAY_CAP) break;
        if (isBlockedSender(row.author as string)) { senderBlockedCount++; continue; }
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
        .select('id, content, source, occurred_at, author, type')
        .eq('user_id', userId)
        .eq('processed', true)
        .gte('occurred_at', ninetyDaysAgo)
        .order('occurred_at', { ascending: false })
        .limit(30);

      const existingTexts = new Set(snippets.map((s) => s.snippet.slice(0, 60)));

      for (const row of entityRows ?? []) {
        if (snippets.length >= 12) break;
        if (isBlockedSender(row.author as string)) { senderBlockedCount++; continue; }
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

  const preMergeSources = [...new Set(snippets.map((s) => s.source))];
  const mergeOpts: CrossSourceLifeMergeOpts = shouldApplyFinancialSingleFocus(winner)
    ? { maxBundleCap: 34, maxPerSource: 2, scanLimit: 600 }
    : { maxBundleCap: 30, maxPerSource: 5, scanLimit: 700 };
  try {
    snippets = await appendCrossSourceLifeContextSnippets(userId, snippets, mergeOpts);
  } catch (e) {
    console.warn(
      '[generator] appendCrossSourceLifeContextSnippets failed (non-fatal):',
      e instanceof Error ? e.message : String(e),
    );
  }

  if (!isDecayDiscrepancy) {
    try {
      snippets = await ensureMinimumEvidenceSourceDiversity(userId, snippets);
    } catch (e) {
      console.warn(
        '[generator] ensureMinimumEvidenceSourceDiversity failed (non-fatal):',
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  const postMergeSources = [...new Set(snippets.map((s) => s.source))];

  logStructuredEvent({
    event: 'winner_signal_evidence_sources',
    level: 'info',
    userId,
    artifactType: null,
    generationStatus: 'fetch_winner_evidence_complete',
    details: {
      scope: 'fetchWinnerSignalEvidence',
      pre_merge_distinct_sources: [...preMergeSources].sort(),
      post_merge_distinct_sources: [...postMergeSources].sort(),
      snippet_count: snippets.length,
      financial_single_focus: shouldApplyFinancialSingleFocus(winner),
    },
  });

  if (senderBlockedCount > 0) {
    logStructuredEvent({
      event: 'sender_blocked',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'context_filtered',
      details: { scope: 'fetchWinnerSignalEvidence', sender_blocked_count: senderBlockedCount },
    });
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
  const snippet = contentLines.join(' ').slice(0, 1500).trim();

  const direction: 'sent' | 'received' | 'unknown' =
    rowType === 'email_sent' ? 'sent' :
    rowType === 'email_received' ? 'received' :
    'unknown';

  const idRaw = row.id;
  const signal_id =
    typeof idRaw === 'string' && idRaw.length > 0 ? idRaw : undefined;

  return {
    source: (row.source as string) ?? 'unknown',
    date: row.occurred_at ? new Date(row.occurred_at as string).toISOString().slice(0, 10) : 'unknown',
    subject,
    snippet: snippet || plaintext.slice(0, 1500),
    author: (row.author as string) ?? null,
    direction,
    row_type: rowType || null,
    ...(signal_id ? { signal_id } : {}),
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
  const ingest = (signals: CompressedSignal[]) => {
    for (const s of signals) {
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
  };
  ingest(ctx.supporting_signals);
  ingest(ctx.life_context_signals ?? []);
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

/** Exported for deterministic tests of the cross-signal anchor gate. */
export function getLowCrossSignalIssues(
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
  // Structural discrepancy winners (schedule_conflict, behavioral patterns, etc.) are already
  // cross-source by scorer construction. Requiring two literal token hits from
  // collectCrossSignalAnchors causes spurious validation failures when the model paraphrases
  // titles (gen_stage validation → all candidates blocked → generation_failed_sentinel).
  if (canonicalArtifactType === 'write_document' && ctx.candidate_class === 'discrepancy') {
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
  if (
    canonicalArtifactType === 'write_document' &&
    ctx.matched_goal_category === 'financial' &&
    /\$\s*[\d,]+(?:\.\d{2})?/.test(haystack) &&
    /\b(?:due|deadline|minimum\s+payment|payment\s+due|pay\s+before|statement)\b/.test(haystack)
  ) {
    return [];
  }
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

const FINANCIAL_PAYMENT_MORALIZING_PATTERNS: RegExp[] = [
  /\bavoidance\b/i,
  /\bcompounds?\s+daily\b/i,
  /\bsystematic\s+avoidance\b/i,
  /\binbound\s*[^\n]{0,40}0\s+outbound/i,
  /\binbound\s*→\s*0\s+outbound/i,
  /\bpattern\s+of\s+avoidance\b/i,
  /\bdeflected\s+decisions?\b/i,
];

const FINANCIAL_MULTI_VENDOR_HEADER_RE = /\bFINANCIAL\s+NOTIFICATIONS\b/i;

function financialPaymentToneIssuesFromText(combinedText: string, artifactContent: string): string[] {
  const issues: string[] = [];
  if (FINANCIAL_PAYMENT_MORALIZING_PATTERNS.some((p) => p.test(combinedText))) {
    issues.push(
      'financial_payment_tone:forbidden_behavioral_framing — use neutral issuer/amount/due language only',
    );
  }
  if (FINANCIAL_MULTI_VENDOR_HEADER_RE.test(combinedText)) {
    issues.push('financial_payment_tone:multi_vendor_digest_header');
  }
  const bulletLines = artifactContent.split('\n').filter((l) => /^\s*[-•*]\s+\S/.test(l));
  if (bulletLines.length >= 4) {
    issues.push('financial_payment_tone:artifact_lists_multiple_items — one obligation only');
  }
  return issues;
}

/** Payment-deadline contexts: ban moralizing / multi-item digests in JSON outputs. Exported for unit tests. */
export function getFinancialPaymentToneValidationIssues(
  ctx: Pick<StructuredContext, 'matched_goal_category' | 'candidate_title' | 'selected_candidate'>,
  payload: {
    directive?: string | null;
    insight?: string | null;
    why_now?: string | null;
    causal_diagnosis?: CausalDiagnosis | null;
    artifact: Record<string, unknown>;
  },
): string[] {
  if (
    !isPaymentDeadlinePromptContextSlice(
      ctx.matched_goal_category,
      ctx.candidate_title,
      ctx.selected_candidate,
    )
  ) {
    return [];
  }
  try {
    const art = payload.artifact ?? {};
    const primaryDoc =
      typeof art.content === 'string' && art.content.trim()
        ? art.content
        : typeof art.body === 'string'
          ? art.body
          : '';
    // Intentionally exclude causal_diagnosis from this scan — the internal mechanism
    // label (e.g. "Avoidance pattern: …") is a structural classifier, not user-facing
    // copy. Scanning it produces false positives for legitimate commitment candidates.
    const combined = [
      payload.directive ?? '',
      payload.insight ?? '',
      payload.why_now ?? '',
      primaryDoc,
      String(art.title ?? ''),
      String(art.subject ?? ''),
    ].join('\n');
    return financialPaymentToneIssuesFromText(combined, primaryDoc);
  } catch (err) {
    console.warn('[generator] getFinancialPaymentToneValidationIssues failed (ignored):', err);
    return [];
  }
}

function artifactPrimaryBodyOrContent(art: Record<string, unknown>): string {
  if (typeof art.content === 'string' && art.content.trim()) return art.content;
  if (typeof art.body === 'string' && art.body.trim()) return art.body;
  return '';
}

function persistedDirectiveLooksLikePaymentDeadline(input: {
  directive: ConvictionDirective;
  matchedGoalCategory?: string | null;
  artifact: unknown;
}): boolean {
  try {
    if (input.matchedGoalCategory === 'financial') return true;
    const art = input.artifact as Record<string, unknown>;
    const ac = artifactPrimaryBodyOrContent(art);
    const ev = Array.isArray(input.directive.evidence) ? input.directive.evidence : [];
    const b =
      `${String(input.directive.directive ?? '')}\n${String(input.directive.reason ?? '')}\n${ev.map((e) => e.description ?? '').join('\n')}\n${ac}`.toLowerCase();
    return (
      /\$\s*[\d,]+(?:\.\d{2})?/.test(b) &&
      /\b(minimum|due|statement|balance|payment\s+due)\b/.test(b)
    );
  } catch (err) {
    console.warn('[generator] persistedDirectiveLooksLikePaymentDeadline failed (ignored):', err);
    return false;
  }
}

/** Do not salvage bracket tokens into email routing fields. */
const BRACKET_SALVAGE_SKIP_ARTIFACT_KEYS = new Set([
  'to',
  'recipient',
  'gmail_thread_id',
  'in_reply_to',
  'references',
]);

function buildBracketSalvageFallbackText(ctx: StructuredContext): string {
  const raw = (ctx.candidate_reason || ctx.candidate_title || '').trim();
  const head = raw.slice(0, 80).trim() || 'Priority follow-up based on your recent signals and goals';
  if (head.length >= 50) return head;
  return `${head} — full thread context is available in Foldera.`.slice(0, 220);
}

/**
 * Replaces template-style bracket fields with scorer context so validation can pass.
 * Exported for unit tests only.
 */
export function applyBracketTemplateSalvage(
  payload: GeneratedDirectivePayload,
  ctx: StructuredContext,
  userId?: string,
): boolean {
  const fallback = buildBracketSalvageFallbackText(ctx);
  let salvaged = false;
  const salvagedKeys: string[] = [];
  const art = payload.artifact as Record<string, unknown>;
  for (const key of Object.keys(art)) {
    if (BRACKET_SALVAGE_SKIP_ARTIFACT_KEYS.has(key)) continue;
    const val = art[key];
    if (typeof val !== 'string' || !hasBracketTemplatePlaceholder(val)) continue;
    art[key] = fallback;
    salvaged = true;
    salvagedKeys.push(key);
  }
  if (typeof payload.directive === 'string' && hasBracketTemplatePlaceholder(payload.directive)) {
    payload.directive = fallback;
    salvaged = true;
    salvagedKeys.push('directive');
  }
  if (typeof payload.insight === 'string' && hasBracketTemplatePlaceholder(payload.insight)) {
    payload.insight = fallback;
    salvaged = true;
    salvagedKeys.push('insight');
  }
  if (salvaged && userId) {
    logStructuredEvent({
      event: 'bracket_strip_salvage',
      level: 'info',
      userId,
      artifactType: payload.artifact_type ?? null,
      generationStatus: 'bracket_strip_salvage',
      details: {
        bracket_strip_salvage: true,
        scope: 'validateGeneratedArtifact',
        salvaged_keys: salvagedKeys,
        candidate_title: ctx.candidate_title?.slice(0, 80),
      },
    });
  }
  return salvaged;
}

/**
 * Hunt + send_message: artifact.to must match hunt_send_message_recipient_allowlist from
 * buildStructuredContext (winning hunt source signals only). Exported for unit tests.
 */
export function collectHuntSendMessageToValidationIssues(
  ctx: Pick<StructuredContext, 'candidate_class' | 'hunt_send_message_recipient_allowlist'>,
  canonicalArtifactType: ValidArtifactTypeCanonical,
  rawRecipient: unknown,
): string[] {
  if (ctx.candidate_class !== 'hunt' || canonicalArtifactType !== 'send_message') return [];
  const allow = ctx.hunt_send_message_recipient_allowlist;
  if (!allow.length) {
    return [
      'send_message hunt candidate has no hunt-grounded recipient (eligible external peer on winning hunt signal rows only)',
    ];
  }
  if (!isNonEmptyString(rawRecipient)) {
    return ['send_message "to" is required for hunt candidates with a grounded recipient'];
  }
  const recipientNorm = String(rawRecipient).trim().toLowerCase();
  if (!allow.includes(recipientNorm)) {
    return [
      'send_message "to" must be one of the hunt-grounded recipient emails from the winning hunt signal thread only',
    ];
  }
  return [];
}

/**
 * When the winning hunt thread has exactly one eligible external peer, the model sometimes
 * invents a plausible address (e.g. name@example.com). Deterministically set To: to the
 * singleton allowlist entry before validation so a grounded hunt can persist.
 */
export function applyHuntSendMessageRecipientCoercion(
  parsed: GeneratedDirectivePayload,
  ctx: Pick<StructuredContext, 'candidate_class' | 'hunt_send_message_recipient_allowlist'>,
  canonicalArtifactType: ValidArtifactTypeCanonical,
  userId?: string,
): boolean {
  if (ctx.candidate_class !== 'hunt' || canonicalArtifactType !== 'send_message') return false;
  const allow = ctx.hunt_send_message_recipient_allowlist;
  if (allow.length !== 1) return false;
  if (!parsed.artifact || typeof parsed.artifact !== 'object') return false;
  const art = parsed.artifact as Record<string, unknown>;
  const raw = art.to ?? art.recipient;
  const norm = isNonEmptyString(raw) ? String(raw).trim().toLowerCase() : '';
  if (allow.includes(norm)) return false;
  const canonical = allow[0];
  art.to = canonical;
  art.recipient = canonical;
  if (userId) {
    logStructuredEvent({
      event: 'hunt_send_to_coerced',
      level: 'info',
      userId,
      artifactType: 'send_message',
      generationStatus: 'hunt_recipient_coerced',
      details: {
        scope: 'generator',
        prior_to: norm || '(missing)',
        coerced_to: canonical,
        allowlist_size: 1,
      },
    });
  }
  return true;
}

function validateGeneratedArtifact(
  payload: GeneratedDirectivePayload | null,
  ctx: StructuredContext,
  canonicalArtifactType: ValidArtifactTypeCanonical,
  relax?: { pipelineDryRun?: boolean; userIdForLogs?: string },
): string[] {
  if (!payload) {
    return ['Response was not valid JSON in the required schema.'];
  }

  const issues: string[] = [];
  const pipelineDry = relax?.pipelineDryRun === true;
  if (!pipelineDry) {
    applyBracketTemplateSalvage(payload, ctx, relax?.userIdForLogs);
    // Diagnostic: compare model output vs salvage. In production log lengths only unless
    // FOLDERA_LOG_SALVAGE_ARTIFACT=true (avoids shipping full title/subject in default logs).
    const art = payload.artifact as Record<string, unknown>;
    const title = art.title;
    const subject = art.subject;
    const allowFullSalvagePeek =
      process.env.NODE_ENV !== 'production' || process.env.FOLDERA_LOG_SALVAGE_ARTIFACT === 'true';
    if (allowFullSalvagePeek) {
      console.log('[generator] post_bracket_salvage_artifact_peek', { title, subject });
    } else {
      console.log('[generator] post_bracket_salvage_artifact_peek', {
        title_len: typeof title === 'string' ? title.length : typeof title,
        subject_len: typeof subject === 'string' ? subject.length : typeof subject,
      });
    }
  }

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

  if (!pipelineDry) {
    try {
      issues.push(
        ...getFinancialPaymentToneValidationIssues(ctx, {
          directive: payload.directive,
          insight: payload.insight,
          why_now: payload.why_now,
          causal_diagnosis: payload.causal_diagnosis,
          artifact: payload.artifact,
        }),
      );
    } catch (err) {
      console.warn('[generator] validateGeneratedArtifact tone gate failed (ignored):', err);
    }
  }

  if (directive && countSentences(directive) !== 1) {
    issues.push('directive must be exactly one sentence');
  }
  if (directive && isDecisionMenu(directive)) {
    issues.push('directive must make one concrete move instead of reopening the choice');
  }

  if (
    canonicalArtifactType === 'send_message' &&
    directive &&
    BANNED_GENERIC_SEND_MESSAGE_DIRECTIVE_RE.test(directive)
  ) {
    issues.push('directive_template:generic_accountable_owner_request');
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
      issues.push(
        ...collectHuntSendMessageToValidationIssues(ctx, canonicalArtifactType, rawRecipient),
      );
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
      if (
        content &&
        content.length < 50 &&
        !(pipelineDry && content === PIPELINE_DRY_RUN_MOCK_ARTIFACT)
      ) {
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

  if (!pipelineDry) {
    issues.push(...getLowCrossSignalIssues(payload, ctx, canonicalArtifactType));
  }

  if (!pipelineDry && canonicalArtifactType === 'write_document') {
    const writeDocumentMode = getWriteDocumentMode({
      actionType: canonicalArtifactType,
      artifact: (payload.artifact as Record<string, unknown>) ?? null,
      discrepancyClass: ctx.discrepancy_class ?? null,
      candidateTitle: ctx.candidate_title,
      directiveText: payload.directive ?? '',
      reason: payload.why_now ?? '',
    });
    if (writeDocumentMode === 'internal_execution_brief') {
      const internalExecutionIssues = getInternalExecutionBriefIssues(
        (payload.artifact as Record<string, unknown>) ?? null,
      );
      if (internalExecutionIssues.includes('missing_execution_move')) {
        issues.push('decision_enforcement:missing_explicit_ask');
      }
      if (internalExecutionIssues.includes('owner_checklist')) {
        issues.push('decision_enforcement:internal_execution_brief_owner_checklist');
      }
      if (internalExecutionIssues.includes('user_questions')) {
        issues.push('decision_enforcement:internal_execution_brief_user_questions');
      }
      if (internalExecutionIssues.includes('future_artifact')) {
        issues.push('decision_enforcement:internal_execution_brief_future_artifact');
      }
    }

    const homeworkReason = findHomeworkHandoffReason(
      [
        payload.directive ?? '',
        payload.why_now ?? '',
        JSON.stringify(payload.artifact ?? {}),
      ].join('\n'),
    );
    if (homeworkReason) {
      issues.push(
        `homework_handoff:${homeworkReason} — artifact hands unfinished prep or research back to the user`,
      );
    }
  }

  if (
    !pipelineDry &&
    ctx.candidate_class === 'discrepancy' &&
    canonicalArtifactType === 'write_document'
  ) {
    const content = String((payload.artifact as Record<string, unknown>).content ?? '');
    const combined = `${payload.directive ?? ''}\n${payload.why_now ?? ''}\n${content}`;
    if (looksLikeDiscrepancyTriageOrChoreList(combined)) {
      issues.push(
        'discrepancy_finished_work:triage_or_chore_list — produce copy-paste-ready replies or one finished document; no chore checklists',
      );
    }
  }

  if (
    !pipelineDry &&
    ctx.candidate_class === 'discrepancy' &&
    ctx.discrepancy_class === 'behavioral_pattern' &&
    canonicalArtifactType === 'write_document'
  ) {
    issues.push(
      ...getBehavioralPatternFinishedWorkIssues({
        directiveText: payload.directive ?? '',
        reason: payload.why_now ?? '',
        artifact: payload.artifact ?? null,
        candidateGoal: ctx.candidate_goal,
      }),
    );
  }

  // Global placeholder scan on all artifact string fields (template slots only — not real names)
  for (const [key, val] of Object.entries(payload.artifact)) {
    if (typeof val === 'string' && hasBracketTemplatePlaceholder(val)) {
      issues.push(`artifact.${key} contains bracket placeholder text`);
    }
  }
  if (payload.directive && hasBracketTemplatePlaceholder(payload.directive)) {
    issues.push('directive contains bracket placeholder text');
  }
  if (payload.insight && hasBracketTemplatePlaceholder(payload.insight)) {
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
        discrepancyClass: ctx.candidate_class === 'discrepancy' ? ctx.discrepancy_class : undefined,
        matchedGoalCategory: ctx.matched_goal_category,
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
        matchedGoalCategory: ctx.matched_goal_category,
      }),
    );

    const normalizedDiag = normalizeCausalDiagnosis(payload.causal_diagnosis);
    if (normalizedDiag) {
      issues.push(...getVagueMechanismIssues(normalizedDiag.mechanism));
    }
  }

  // Discrepancy/insight paths skip full decision-enforcement above — still ban task-manager lines on documents.
  if (isDiscrepancyCandidate && canonicalArtifactType === 'write_document') {
    issues.push(...getWriteDocumentTaskManagerLabelIssues(payload.artifact as Record<string, unknown>));
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
  matchedGoalCategory?: string | null;
}): string[] {
  const issues: string[] = [];

  if (input.directive.generationLog?.firstMorningBypass) {
    return [];
  }

  if (input.directive.directive === BUDGET_CAP_DIRECTIVE_SENTINEL) {
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
      normalizeDecisionActionType(String(input.directive.action_type)) === 'write_document'
    ) {
      const t = typeof art.title === 'string' ? art.title : '';
      const c = typeof art.content === 'string' ? art.content : '';
      const blob = `${t}\n${c}`;
      if (scheduleConflictArtifactIsOwnerProcedure(blob)) {
        return ['schedule_conflict artifact must be a grounded resolution decision note, not owner chore instructions'];
      }
      if (scheduleConflictArtifactIsMessageShaped(blob)) {
        return ['schedule_conflict artifact must be a grounded resolution decision note, not outbound message copy'];
      }
      if (!scheduleConflictArtifactHasResolutionShape(blob)) {
        return [
          'schedule_conflict artifact must include situation, conflict, recommendation, owner/next step, and timing',
        ];
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
  } else if (normalizeDecisionActionType(String(input.directive.action_type)) === 'write_document') {
    if (directiveLooksLikeScheduleConflict(input.directive)) {
      const art = input.artifact as Record<string, unknown>;
      const t = typeof art.title === 'string' ? art.title : '';
      const c = typeof art.content === 'string' ? art.content : '';
      const blob = `${t}\n${c}`;
      if (scheduleConflictArtifactIsOwnerProcedure(blob)) {
        issues.push('schedule_conflict artifact must be a grounded resolution decision note, not an owner checklist');
      }
      if (scheduleConflictArtifactIsMessageShaped(blob)) {
        issues.push('schedule_conflict artifact must be a grounded resolution decision note, not outbound message copy');
      }
      if (!scheduleConflictArtifactHasResolutionShape(blob)) {
        issues.push(
          'schedule_conflict artifact must include situation, conflict, recommendation, owner/next step, and timing',
        );
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
        matchedGoalCategory: input.matchedGoalCategory ?? null,
      }),
    );
  } else if (normalizeDecisionActionType(input.directive.action_type) === 'write_document') {
    issues.push(...getWriteDocumentTaskManagerLabelIssues(input.artifact as Record<string, unknown>));
    if (effectiveDiscrepancyClassForGates(input.directive) === 'behavioral_pattern') {
      issues.push(
        ...getBehavioralPatternFinishedWorkIssues({
          directiveText: input.directive.directive,
          reason: input.directive.reason,
          artifact: input.artifact as Record<string, unknown>,
          candidateGoal:
            input.directive.generationLog?.candidateDiscovery?.topCandidates?.[0]?.targetGoal?.text ??
            null,
        }),
      );
    }
  }

  const writeDocumentMode = getWriteDocumentMode({
    actionType: input.directive.action_type,
    artifact: input.artifact as Record<string, unknown> | null,
    discrepancyClass: effectiveDiscrepancyClassForGates(input.directive),
    directiveText: input.directive.directive,
    reason: input.directive.reason,
  });
  if (
    normalizeDecisionActionType(String(input.directive.action_type)) === 'write_document' &&
    writeDocumentMode === 'internal_execution_brief' &&
    (input.candidateType === 'discrepancy' || input.candidateType === 'insight')
  ) {
    const internalExecutionIssues = getInternalExecutionBriefIssues(
      input.artifact as Record<string, unknown> | null,
    );
    if (internalExecutionIssues.includes('missing_execution_move')) {
      issues.push('decision_enforcement:missing_explicit_ask');
    }
    if (internalExecutionIssues.includes('owner_checklist')) {
      issues.push('decision_enforcement:internal_execution_brief_owner_checklist');
    }
    if (internalExecutionIssues.includes('user_questions')) {
      issues.push('decision_enforcement:internal_execution_brief_user_questions');
    }
    if (internalExecutionIssues.includes('future_artifact')) {
      issues.push('decision_enforcement:internal_execution_brief_future_artifact');
    }
  }

  if (
    input.artifact &&
    typeof input.artifact === 'object' &&
    persistedDirectiveLooksLikePaymentDeadline({
      directive: input.directive,
      matchedGoalCategory: input.matchedGoalCategory,
      artifact: input.artifact,
    })
  ) {
    try {
      const art = input.artifact as Record<string, unknown>;
      const primary = artifactPrimaryBodyOrContent(art);
      const ev = Array.isArray(input.directive.evidence) ? input.directive.evidence : [];
      // Exclude 'pattern' evidence items (causal mechanism descriptions — internal
      // behavioral labels that legitimately use words like "avoidance"). Only scan
      // user-facing signal/goal descriptions and artifact copy.
      const evTexts = ev.filter((e) => e.type !== 'pattern').map((e) => e.description ?? '');
      const combined = [
        input.directive.directive,
        input.directive.reason,
        ...evTexts,
        primary,
        String(art.title ?? ''),
        String(art.subject ?? ''),
      ].join('\n');
      issues.push(...financialPaymentToneIssuesFromText(combined, primary));
    } catch (err) {
      console.warn('[generator] validateDirectiveForPersistence financial tone gate failed (ignored):', err);
    }
  }

  if (
    input.artifact &&
    typeof input.artifact === 'object' &&
    normalizeDecisionActionType(String(input.directive.action_type)) === 'send_message'
  ) {
    issues.push(
      ...getSendMessageRecipientGroundingIssues(
        'send_message',
        input.artifact as Record<string, unknown>,
        input.directive,
      ),
    );
    issues.push(
      ...getSendMessageTemporalConsistencyIssues(
        input.directive.directive,
        input.artifact as Record<string, unknown>,
      ),
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

/** Local-part only for dashboard directive lines — avoids extra "." that breaks one-sentence validation. */
function formatEmailLocalPartForDirective(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.indexOf('@');
  const local = (at > 0 ? e.slice(0, at) : e).replace(/\./g, ' ').trim();
  const cleaned = local.replace(/\s+/g, ' ').slice(0, 48);
  return cleaned || e.slice(0, 48);
}

/** Decision-enforcement repair must not ship the old generic "accountable owner" dashboard line — use recipient + concrete ask (eval rubric D/C). */
function buildGroundedSendMessageDirective(recipientEmail: string, explicitAsk: string): string {
  const who = formatEmailLocalPartForDirective(recipientEmail);
  const core = `Email ${who}: ${explicitAsk.trim()}`;
  if (core.length <= 340) return core;
  return `${core.slice(0, 337)}…`;
}

const BANNED_GENERIC_SEND_MESSAGE_DIRECTIVE_RE =
  /send a decision request that secures one accountable owner and a committed answer by/i;

function resolveDecisionDeadline(candidateDueDate: string | null): string {
  const dueMatch = candidateDueDate?.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const now = new Date();
  const startTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let date = dueMatch?.[1] ?? new Date(Date.now() + daysMs(1)).toISOString().slice(0, 10);
  if (dueMatch?.[1]) {
    const [y, mo, d] = dueMatch[1].split('-').map(Number);
    const dueStart = Date.UTC(y, mo - 1, d);
    // Overdue commitment dates must not be echoed into user-facing directive/repair copy —
    // they trip stale-date rejection and read as dead copy in production.
    if (dueStart < startTodayUtc) {
      date = new Date(startTodayUtc).toISOString().slice(0, 10);
    }
  }
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

type InterviewRepairEvidence = {
  roleTitle: string | null;
  organization: string | null;
  scheduledAt: string | null;
  location: string | null;
  contactName: string | null;
  contactEmail: string | null;
  roleAnchors: string[];
  processAnchors: string[];
};

function looksLikeInterviewWriteDocumentCandidate(
  winner: ScoredLoop,
  supportingSignals: CompressedSignal[],
): boolean {
  const blob = [
    winner.title,
    winner.content,
    winner.trigger?.baseline_state ?? '',
    winner.trigger?.current_state ?? '',
    ...supportingSignals.map((signal) => signal.summary),
  ]
    .join('\n')
    .toLowerCase();
  return /\b(interview|phone screen|teams interview|microsoft teams)\b/.test(blob);
}

function dedupeInterviewLines(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const cleaned = line.trim().replace(/\s+/g, ' ').replace(/[.;:]+$/g, '');
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function extractInterviewRoleTitle(text: string): string | null {
  const patterns = [
    /\bJob:\s*([^\n]+?)(?:\s+Employer:|$)/i,
    /\bposition at [^.\n]+? for the ([^.\n]+?)(?:\s+position|\.)/i,
    /\bapplying to the ([^.\n]+?) at\b/i,
    /\bfor the ([^.\n]+?) position\b/i,
    /\b(Care Coordinator role)\b/i,
    /\b(ES BENEFITS TECHNICIAN\/Telework)\b/i,
    /\b(Health Benefits Specialist 3 \(MAS3\/AHSO\)\s*[–-]\s*Project)\b/i,
    /\b(DSHS HCLA Benefits and Customer Care Specialist)\b/i,
    /\b(DSHS HCLA Developmental Disabilities Case\/Resource Manager)\b/i,
    /\b(Developmental Disabilities Case\/Resource Manager)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const raw = match?.[1]?.trim();
    if (raw) return raw.replace(/\s+/g, ' ');
  }
  return null;
}

function extractInterviewOrganization(text: string): string | null {
  const patterns = [
    /\bEmployer:\s*([^\n]+)$/im,
    /\bposition at the ([^.\n]+?)(?:\.|$)/i,
    /\brole at ([^.\n]+?)(?: in |!|\.|,|$)/i,
    /\b(Comprehensive Healthcare)\b/i,
    /\b(Health Care Authority)\b/i,
    /\b(Employment Security Department)\b/i,
    /\b(Dept\. of Social and Health Services)\b/i,
    /\b(Department of Social and Health Services)\b/i,
    /\b(State of Washington)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const raw = match?.[1]?.trim();
    if (raw) return raw.replace(/\s+/g, ' ');
  }
  return null;
}

function extractInterviewScheduleLine(text: string): string | null {
  const patterns = [
    /\bDate and Time:\s*([^\n]+?)(?:\s+Location:|$)/i,
    /\bAppointment:\s*([^\n]+)$/im,
    /\bInterview\s+(Thursday,\s+[A-Za-z]+\s+\d+\s*@\s*\d{1,2}:\d{2})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const raw = match?.[1]?.trim();
    if (raw) return raw.replace(/\s+/g, ' ');
  }
  return null;
}

function extractInterviewLocation(text: string): string | null {
  const match = text.match(/\bLocation:\s*([^\n]+?)(?:\s+Job:|$)/i);
  const raw = match?.[1]?.trim();
  return raw ? raw.replace(/\s+/g, ' ') : null;
}

function extractInterviewContactName(text: string): string | null {
  const patterns = [
    /^From:\s*([^<\n]+?)(?:\s*<|$)/im,
    /\bSincerely,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/i,
    /\bThank you,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const raw = match?.[1]?.trim();
    if (raw) return raw.replace(/\s+/g, ' ');
  }
  return null;
}

function extractInterviewContactEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match?.[0]?.toLowerCase() ?? null;
}

function collectInterviewAnchors(text: string): { roleAnchors: string[]; processAnchors: string[] } {
  const roleAnchors: string[] = [];
  const processAnchors: string[] = [];
  const rolePatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\bcommunity-based\b/i, label: 'community-based' },
    { pattern: /\bmeet(?:ing)? with clients at meetings and appointments\b/i, label: 'meeting clients at meetings and appointments' },
    { pattern: /\btravel(?:ing)? to (?:their )?homes for check-?in\b/i, label: 'traveling to homes for check-in' },
    { pattern: /\bmileage is reimbursed\b/i, label: 'mileage is reimbursed' },
    { pattern: /\bpersonal vehicle\b/i, label: 'uses your personal vehicle' },
    { pattern: /\bnot be responsible for transporting (?:and )?clients\b/i, label: 'not responsible for transporting clients' },
    { pattern: /\bcommunity resources\b/i, label: 'finding community resources' },
    { pattern: /\bsupport their recovery\b/i, label: 'supporting client recovery' },
    { pattern: /\btelework\b/i, label: 'telework' },
  ];
  const processPatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\bMS Teams\b/i, label: 'MS Teams interview' },
    { pattern: /\bMicrosoft Teams\b/i, label: 'Microsoft Teams interview' },
    { pattern: /\bfirst-come,\s*first-served\b/i, label: 'first-come, first-served scheduling' },
    { pattern: /\bBackground and Reference Check Authorization forms\b/i, label: 'background and reference authorization forms' },
    { pattern: /\bRelease of Information \(ROI\) form\b/i, label: 'ROI form required' },
    { pattern: /\bTeams link\b/i, label: 'Teams link confirmation' },
    { pattern: /\bnext steps including the interview process\b/i, label: 'next steps in the interview process' },
  ];

  for (const { pattern, label } of rolePatterns) {
    if (pattern.test(text)) roleAnchors.push(label);
  }
  for (const { pattern, label } of processPatterns) {
    if (pattern.test(text)) processAnchors.push(label);
  }

  return {
    roleAnchors: dedupeInterviewLines(roleAnchors),
    processAnchors: dedupeInterviewLines(processAnchors),
  };
}

function collectInterviewRepairEvidence(
  winner: ScoredLoop,
  supportingSignals: CompressedSignal[],
): InterviewRepairEvidence {
  const combined = [
    winner.title,
    winner.content,
    winner.trigger?.baseline_state ?? '',
    winner.trigger?.current_state ?? '',
    winner.trigger?.why_now ?? '',
    ...supportingSignals.map((signal) => `${signal.summary}\n${signal.entity ?? ''}`),
  ].join('\n');
  const { roleAnchors, processAnchors } = collectInterviewAnchors(combined);

  return {
    roleTitle: extractInterviewRoleTitle(combined),
    organization: extractInterviewOrganization(combined),
    scheduledAt: extractInterviewScheduleLine(combined),
    location: extractInterviewLocation(combined),
    contactName: extractInterviewContactName(combined),
    contactEmail: extractInterviewContactEmail(combined),
    roleAnchors,
    processAnchors,
  };
}

function buildInterviewAnswerScript(evidence: InterviewRepairEvidence): string {
  const roleLabel = evidence.roleTitle ?? 'this role';
  const orgLabel = evidence.organization ? ` at ${evidence.organization}` : '';
  const strongestRoleAnchors = evidence.roleAnchors.slice(0, 4);
  const anchorLead = strongestRoleAnchors.length > 0
    ? strongestRoleAnchors.join(', ')
    : 'the exact operating details already named in the thread';
  const closingQuestion = evidence.contactName
    ? `Is that the right way to frame the strongest fit for this ${roleLabel} with ${evidence.contactName.split(/\s+/)[0]}?`
    : `Is that the right way to frame the strongest fit for this ${roleLabel}?`;

  return [
    `“What makes me a fit for ${roleLabel}${orgLabel} is that the role is already defined around ${anchorLead}.`,
    `That matters to me because I do better in work that is concrete, field-facing, and tied to helping people move through real systems instead of staying stuck in abstraction.`,
    `The thread already makes clear this is not a generic office role, so I would answer from that operating reality first and then show that I can stay steady, organized, and useful inside it.`,
    closingQuestion + '”',
  ].join(' ');
}

function buildInterviewWriteDocumentPayload(input: {
  winner: ScoredLoop;
  candidateDueDate: string | null;
  causalDiagnosis: CausalDiagnosis;
  supportingSignals: CompressedSignal[];
}): GeneratedDirectivePayload | null | undefined {
  if (!looksLikeInterviewWriteDocumentCandidate(input.winner, input.supportingSignals)) {
    return undefined;
  }

  const evidence = collectInterviewRepairEvidence(input.winner, input.supportingSignals);
  const hasRoleSpecificEvidence =
    Boolean(evidence.roleTitle) &&
    (evidence.roleAnchors.length >= 2 ||
      (evidence.roleAnchors.length >= 1 && evidence.organization !== null && evidence.processAnchors.length >= 1));

  if (!hasRoleSpecificEvidence) {
    return null;
  }

  const deadline = resolveDecisionDeadline(input.candidateDueDate);
  const roleLabel = evidence.roleTitle ?? cleanDecisionTarget(input.winner.title);
  const scheduleLabel = evidence.scheduledAt ?? deadline;
  const locationLabel = evidence.location ?? 'the interview slot already on your calendar';
  const pressureLine =
    evidence.roleAnchors.length > 0
      ? `This is a real interview risk: if this answer stays generic, you lose the clearest fit signal before ${deadline}. Anchor to ${evidence.roleAnchors.slice(0, 3).join(', ')}, or the panel only hears motivation.`
      : `This is a real interview risk: if this answer stays generic, you lose the clearest fit signal before ${deadline}.`;
  const processLine = evidence.processAnchors.length > 0
    ? `The thread also confirms ${evidence.processAnchors.slice(0, 2).join(' and ')}, so keep the answer tied to the real process already in motion.`
    : '';
  const contactLine = evidence.contactEmail
    ? `Thread anchor: ${evidence.contactEmail}.`
    : evidence.contactName
      ? `Thread anchor: ${evidence.contactName}.`
      : '';
  const directive = `Write the role-specific answer architecture Brandon can use in the ${roleLabel} interview before ${scheduleLabel}.`.slice(0, 340);

  return {
    insight: `${roleLabel} already has enough role evidence in the thread to justify one anchored answer instead of another prep brief.`,
    causal_diagnosis: input.causalDiagnosis,
    decision: 'ACT',
    directive,
    artifact_type: 'write_document',
    artifact: {
      document_purpose: 'interview answer architecture',
      target_reader: 'candidate',
      title: `${roleLabel} — role-specific answer architecture`,
      content: [
        `Use this in ${locationLabel} on ${scheduleLabel} when they ask, “Why are you a fit for this role?”`,
        '',
        `You are responsible for landing one clear match before ${deadline}: ${roleLabel} is already grounded in ${evidence.roleAnchors.slice(0, 4).join(', ')}.`,
        '',
        `Deadline: ${deadline}.`,
        '',
        pressureLine,
        processLine,
        contactLine,
        '',
        'Answer script:',
        buildInterviewAnswerScript(evidence),
      ].filter(Boolean).join('\n'),
    },
    why_now: `${roleLabel} is already on the calendar for ${scheduleLabel}, and the evidence in the thread is specific enough to turn into one reusable answer before the window closes.`,
  };
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

export function buildDecisionEnforcedFallbackPayload(input: {
  winner: ScoredLoop;
  actionType: ValidArtifactTypeCanonical;
  candidateDueDate: string | null;
  candidateGoal: string | null;
  causalDiagnosis: CausalDiagnosis;
  supportingSignals?: CompressedSignal[];
  huntRecipientAllowlist?: string[];
  userEmails?: Set<string>;
  userPromptNames: UserPromptNames;
}): GeneratedDirectivePayload | null {
  const target = cleanDecisionTarget(input.winner.title);
  const deadline = resolveDecisionDeadline(input.candidateDueDate);
  const supportingSignals = input.supportingSignals ?? [];

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
    const recipient = (
      input.huntRecipientAllowlist?.find((email) => isEligibleExternalPeerEmail(email, input.userEmails)) ??
      extractAllEmailAddresses(input.winner, input.userEmails)[0]
    )?.toLowerCase();
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
      directive: buildGroundedSendMessageDirective(recipient, explicitAsk),
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
    const interviewPayload = buildInterviewWriteDocumentPayload({
      winner: input.winner,
      candidateDueDate: input.candidateDueDate,
      causalDiagnosis: input.causalDiagnosis,
      supportingSignals,
    });
    if (interviewPayload !== undefined) {
      return interviewPayload;
    }

    if (input.winner.discrepancyClass === 'behavioral_pattern') {
      const factText = `${input.winner.title}. ${input.winner.content}`;
      const parsedFacts = parseBehavioralPatternRepairFacts(factText);
      const entityName = parsedFacts.entityName ?? input.winner.entityName ?? 'This thread';
      const count = parsedFacts.count ?? '1';
      const window = parsedFacts.window ?? '14 days';
      const firstName = entityName.split(/\s+/)[0] || entityName;
      const goalLabel = extractBehavioralPatternGoalLabel(input.candidateGoal);
      const title = goalLabel
        ? `${entityName} going dark is now blocking the ${goalLabel}`
        : `${entityName} going dark is now blocking the thread`;
      const intro = goalLabel
        ? `You were trying to get this thread to a real yes/no on the ${goalLabel}. ${count} follow-ups in ${window} without a reply means it is no longer active, just mentally open.`
        : `${count} follow-ups in ${window} without a reply means this thread is stalled, not active.`;

      return {
        insight: goalLabel
          ? `${entityName} going quiet is now blocking the ${goalLabel}.`
          : `${entityName} going quiet is no longer a live thread; it is open attention with no movement.`,
        causal_diagnosis: input.causalDiagnosis,
        decision: 'ACT',
        directive: title.endsWith('.') ? title : `${title}.`,
        artifact_type: 'write_document',
        artifact: {
          document_purpose: 'close_the_loop',
          target_reader: 'user',
          title,
          content: [
            intro,
            '',
            'Send this today:',
            '',
            `“Hey ${firstName} — I’ve followed up a few times and don’t want to keep this half-open if priorities have shifted. Is this something you still want to pursue, or should I close the loop on my side?”`,
            '',
            'If there is no reply after this, mark the thread stalled and stop allocating attention to it.',
            '',
            `Deadline: ${input.candidateDueDate ? deadline : 'today'}`,
          ].join('\n'),
        },
        why_now: goalLabel
          ? `The ${goalLabel} is still mentally open, but the thread has already stopped moving.`
          : 'Each extra follow-up keeps this mentally open without increasing the chance of a real answer.',
      };
    }

    const memoAsk = copy.ask.replace(/^Ask:\s*/i, '').trim();
    const safeTarget = target.replace(/[.!?]+$/g, '').trim().slice(0, 72) || target.slice(0, 72);
    const writeDirective = `Write a decision memo on "${safeTarget}" — ${memoAsk}`.slice(0, 340);

    return {
      insight: copy.insight,
      causal_diagnosis: input.causalDiagnosis,
      decision: 'ACT',
      directive: writeDirective,
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'proposal',
        target_reader: 'decision owner',
        title: `Decision lock: ${target.slice(0, 90)}`,
        content: [
          `Decision required for "${safeTarget}": confirm the path, name one owner, and time-bound the commitment.`,
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

function computeDirectiveConfidence(result: ScorerResultWinnerSelected): number {
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

function buildEvidenceItems(result: ScorerResultWinnerSelected, payload: GeneratedDirectivePayload): EvidenceItem[] {
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

export function appendHuntRecipientGroundingEvidence(
  evidence: EvidenceItem[],
  options: {
    candidateClass: string;
    canonicalArtifactType: ValidArtifactTypeCanonical;
    artifact: unknown;
    huntRecipientAllowlist: string[];
  },
): EvidenceItem[] {
  if (options.candidateClass !== 'hunt' || options.canonicalArtifactType !== 'send_message') {
    return evidence;
  }

  if (!options.artifact || typeof options.artifact !== 'object') return evidence;
  const artifactRecord = options.artifact as Record<string, unknown>;
  const rawRecipient = artifactRecord.to ?? artifactRecord.recipient;
  if (!isNonEmptyString(rawRecipient)) return evidence;

  const recipient = rawRecipient.trim().toLowerCase();
  if (!options.huntRecipientAllowlist.includes(recipient)) return evidence;

  const alreadyGrounded = evidence.some((item) => {
    if (!isNonEmptyString(item.description)) return false;
    return item.description.toLowerCase().includes(recipient);
  });
  if (alreadyGrounded) return evidence;

  return [
    ...evidence,
    {
      type: 'signal',
      description: `Hunt grounded recipient from winning signal thread: ${recipient}`,
    },
  ];
}

function buildFullContext(result: ScorerResultWinnerSelected, payload: GeneratedDirectivePayload): string {
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

function extractFirstGroundedDollar(groundingBlob: string): string | null {
  const m = groundingBlob.match(/\$\s*[\d,]+(?:\.\d{2})?/);
  return m ? m[0] : null;
}

/** Synthetic payload when dryRun — skips Sonnet loop; must pass validateGeneratedArtifact(…, committed). */
function buildDryRunGeneratedPayload(
  committed: ValidArtifactTypeCanonical,
  ctx: StructuredContext,
): GeneratedDirectivePayload {
  const cd = ctx.required_causal_diagnosis;
  const insight =
    'Dry-run fixture: FOLDERA_DRY_RUN prevented model calls; copy is synthetic for local UI and persistence checks.';
  const anchors = collectCrossSignalAnchors(ctx);
  const anchorLine =
    anchors.length >= 2
      ? `Grounded ties: ${anchors[0]} and ${anchors[1]}.`
      : anchors.length === 1
        ? `Grounded tie: ${anchors[0]}.`
        : '';
  const groundingForMoney = [
    ctx.candidate_title,
    ctx.selected_candidate,
    ...ctx.surgical_raw_facts,
    ...ctx.supporting_signals.map((s) => `${s.summary ?? ''} ${s.occurred_at ?? ''}`),
  ].join('\n');
  const groundedDollarRaw = extractFirstGroundedDollar(groundingForMoney);
  const whyNow =
    'Because today still leaves a dated obligation in your synced activity before the April 11 cutoff, confirming now avoids compounding fee risk.';

  if (committed === 'send_message') {
    const directive = groundedDollarRaw
      ? `[DRY RUN] Confirm the ${groundedDollarRaw.trim()} item before April 11.`
      : '[DRY RUN] Confirm the open item before April 11.';
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'ACT',
      directive,
      artifact_type: 'send_message',
      artifact: {
        to: 'dry-run@foldera.ai',
        subject: '[DRY RUN] Deadline check',
        body: `Can you confirm before 2026-04-11? If we miss the deadline, late fee risk applies. ${anchorLine} Assign yourself to send payment.`,
        draft_type: 'email_compose',
      },
      why_now: whyNow,
    };
  }

  if (committed === 'write_document') {
    const dollarSentence = groundedDollarRaw
      ? `Pay ${groundedDollarRaw.trim()} before 2026-04-11 using the linked pay path.`
      : 'Pay the amount shown in your statement before 2026-04-11 using your issuer portal.';
    const directive = groundedDollarRaw
      ? `[DRY RUN] AmEx ${groundedDollarRaw.trim()} due April 11.`
      : '[DRY RUN] Confirm your card payment before April 11.';
    const content = [
      'DRY RUN — synthetic finished document for local testing; no LLM was invoked.',
      `${dollarSentence} Avoid a late fee.`,
      'Confirm payment today at https://example.com/pay (placeholder URL for dry run only).',
      'You are accountable to submit before the deadline; assign the payment task to yourself today.',
      'If we miss April 11, the account risks fees and blocks the next cash-flow decision.',
      anchorLine,
    ].join('\n\n');
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'ACT',
      directive,
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'Payment deadline confirmation (dry run)',
        target_reader: 'Account owner',
        title: '[DRY RUN] Payment by April 11',
        content,
      },
      why_now: whyNow,
    };
  }

  if (committed === 'schedule_block') {
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'ACT',
      directive: 'Block focused time tomorrow to close the April 11 payment decision.',
      artifact_type: 'schedule_block',
      artifact: {
        title: '[DRY RUN] Payment closeout block',
        reason: 'Dry-run placeholder to reserve time before the April 11 fee window.',
        start: new Date(Date.now() + 86400000).toISOString(),
        duration_minutes: 30,
      },
      why_now: whyNow,
    };
  }

  if (committed === 'wait_rationale') {
    const trip = new Date(Date.now() + daysMs(7)).toISOString().slice(0, 10);
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'HOLD',
      directive: 'Wait until live generation is enabled — dry run only.',
      artifact_type: 'wait_rationale',
      artifact: {
        why_wait: 'FOLDERA_DRY_RUN=true: model calls disabled for local testing.',
        tripwire_date: trip,
        trigger_condition: 'Unset FOLDERA_DRY_RUN and regenerate to use real generation.',
      },
      why_now: whyNow,
    };
  }

  return {
    insight,
    causal_diagnosis: cd,
    causal_diagnosis_source: 'template_fallback',
    decision: 'HOLD',
    directive: 'No live generation in dry-run mode.',
    artifact_type: 'do_nothing',
    artifact: {
      exact_reason: 'FOLDERA_DRY_RUN=true',
      blocked_by: 'local_testing_fixture',
    },
    why_now: whyNow,
  };
}

/** Synthetic payload for HTTP `pipelineDryRun` — zero Anthropic; exact mock artifact string. */
function buildPipelineDryRunGeneratedPayload(
  committed: ValidArtifactTypeCanonical,
  ctx: StructuredContext,
): GeneratedDirectivePayload {
  const cd = ctx.required_causal_diagnosis;
  const insight = 'Pipeline dry run: no Anthropic API calls were made.';
  const whyNow = 'Inspect assembled_prompt in generation_log.pipeline_dry_run; re-run without dry_run to invoke the model.';
  const mock = PIPELINE_DRY_RUN_MOCK_ARTIFACT;

  if (committed === 'send_message') {
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'ACT',
      directive: mock,
      artifact_type: 'send_message',
      artifact: {
        to: 'dry-run@foldera.ai',
        subject: '[DRY RUN]',
        body: mock,
        draft_type: 'email_compose',
      },
      why_now: whyNow,
    };
  }

  if (committed === 'write_document') {
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'ACT',
      directive: mock,
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'Pipeline dry run (no model)',
        target_reader: 'Operator',
        title: '[DRY RUN]',
        content: mock,
      },
      why_now: whyNow,
    };
  }

  if (committed === 'schedule_block') {
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'ACT',
      directive: mock,
      artifact_type: 'schedule_block',
      artifact: {
        title: '[DRY RUN]',
        reason: mock,
        start: new Date(Date.now() + 86400000).toISOString(),
        duration_minutes: 30,
      },
      why_now: whyNow,
    };
  }

  if (committed === 'wait_rationale') {
    const trip = new Date(Date.now() + daysMs(7)).toISOString().slice(0, 10);
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'HOLD',
      directive: mock,
      artifact_type: 'wait_rationale',
      artifact: {
        why_wait: mock,
        tripwire_date: trip,
        trigger_condition: 'Unset pipelineDryRun and regenerate.',
      },
      why_now: whyNow,
    };
  }

  return {
    insight,
    causal_diagnosis: cd,
    causal_diagnosis_source: 'template_fallback',
    decision: 'HOLD',
    directive: mock,
    artifact_type: 'do_nothing',
    artifact: {
      exact_reason: mock,
      blocked_by: 'pipeline_dry_run',
    },
    why_now: whyNow,
  };
}

/**
 * Same shape as pipeline dry-run, but prose is long enough and concrete enough to pass
 * `validateGeneratedArtifact`, `isSendWorthy`, and `evaluateBottomGate` for typical winners — without Anthropic.
 * Directive lines must stay a single sentence (generator contract).
 */
function buildVerificationStubPersistGeneratedPayload(
  committed: ValidArtifactTypeCanonical,
  ctx: StructuredContext,
): GeneratedDirectivePayload {
  const cd = ctx.required_causal_diagnosis;
  const insight =
    'Owner verification stub: deterministic payload exercises downstream validation without Anthropic.';
  const whyNow =
    'Verification path uses the real scorer winner and gates; model output is replaced by canonical stub text.';
  const dirSend =
    'Please email partner@example.com by Friday 2026-04-18 to confirm the Q2 delivery plan and deadline.';
  const bodySend =
    'We need a written confirmation before COB Friday 2026-04-18 so Legal can file the renewal; ' +
    'please reply with approval or the specific blocker so we can escalate to the board before the window closes.';
  const dirDoc =
    'Send Alex Morgan at alex@partner.example.com a concrete resolution for the 2026-04-16 overlap before Friday 2026-04-18.';
  const contentDoc =
    '## Situation\n' +
    'Partner review and Customer Success renewal prep both sit on 2026-04-16; Alex Morgan (alex@partner.example.com) is on the partner thread.\n\n' +
    '## Conflicting commitments or risk\n' +
    'Overlapping calendar blocks risk missing the renewal filing before Friday 2026-04-18.\n\n' +
    '## Recommendation / decision\n' +
    'Move or delegate the partner review so Customer Success can protect the COB Friday 2026-04-18 deadline.\n\n' +
    '## Owner / next step\n' +
    'Please confirm whether you can move the partner review with Alex Morgan before 2026-04-17 so invites update.\n\n' +
    '## Timing / deadline\n' +
    'Decide before Friday 2026-04-18; the hard overlap is 2026-04-16.';

  if (committed === 'send_message') {
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'ACT',
      directive: dirSend,
      artifact_type: 'send_message',
      artifact: {
        to: 'partner@example.com',
        subject: 'Q2 plan — confirmation needed before 2026-04-18 (action required)',
        body: bodySend,
        draft_type: 'email_compose',
      },
      why_now: whyNow,
    };
  }

  if (committed === 'write_document') {
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'ACT',
      directive: dirDoc,
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'Foldera owner verification — calendar conflict resolution draft',
        target_reader: 'External partner contact',
        title: 'Resolution note — April 2026 calendar overlap',
        content: contentDoc,
      },
      why_now: whyNow,
    };
  }

  if (committed === 'schedule_block') {
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'ACT',
      directive:
        'Block 45 minutes before Friday 2026-04-18 to finalize the partner escalation with the team.',
      artifact_type: 'schedule_block',
      artifact: {
        title: 'Partner escalation — finalize plan',
        reason: 'Verification stub: timeboxed working session before the 2026-04-18 deadline.',
        start: new Date(Date.now() + 86400000).toISOString(),
        duration_minutes: 45,
      },
      why_now: whyNow,
    };
  }

  if (committed === 'wait_rationale') {
    const trip = new Date(Date.now() + daysMs(7)).toISOString().slice(0, 10);
    return {
      insight,
      causal_diagnosis: cd,
      causal_diagnosis_source: 'template_fallback',
      decision: 'HOLD',
      directive: 'Wait until fresh inbound signals arrive before pushing the partner thread again.',
      artifact_type: 'wait_rationale',
      artifact: {
        why_wait:
          'No new external signal in the verification stub path — hold until the next inbox or calendar change.',
        tripwire_date: trip,
        trigger_condition: 'Unset verification mode and regenerate with live Anthropic when allowed.',
      },
      why_now: whyNow,
    };
  }

  return {
    insight,
    causal_diagnosis: cd,
    causal_diagnosis_source: 'template_fallback',
    decision: 'HOLD',
    directive: 'No outbound action in the verification stub path for this action class.',
    artifact_type: 'do_nothing',
    artifact: {
      exact_reason: 'verification_stub_do_nothing',
      blocked_by: 'verification_stub',
    },
    why_now: whyNow,
  };
}

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

  if (process.env.FOLDERA_DRY_RUN === 'true') {
    return {
      issues: [],
      payload: buildDryRunGeneratedPayload(options.committedArtifactType, ctx),
      anomalyIdentification: undefined,
    };
  }

  if (options.pipelineDryRun) {
    const dryPayload =
      options.verificationStubPersist === true
        ? buildVerificationStubPersistGeneratedPayload(options.committedArtifactType, ctx)
        : buildPipelineDryRunGeneratedPayload(options.committedArtifactType, ctx);
    const dryIssues = validateGeneratedArtifact(dryPayload, ctx, options.committedArtifactType, {
      pipelineDryRun: true,
    });
    if (dryIssues.length > 0) {
      return {
        issues: dryIssues,
        payload: null,
        assembledPrompt: prompt,
        anomalyIdentification: undefined,
      };
    }
    return {
      issues: [],
      payload: dryPayload,
      assembledPrompt: prompt,
      anomalyIdentification: undefined,
    };
  }

  const allowOwnerDevPaidLlmBypass =
    userId === OWNER_USER_ID && options.skipSpendCap === true && options.skipManualCallLimit === true;
  if (!allowOwnerDevPaidLlmBypass) {
    assertPaidLlmAllowed('generator.generatePayload');
  } else {
    logStructuredEvent({
      event: 'paid_llm_gate_bypassed',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'paid_llm_bypass_active',
      details: { scope: 'generator', reason: 'owner_dev_brain_receipt' },
    });
  }

  let anomalyIdentification: string | undefined;
  if (!options.dryRun) {
    const { model: anomalyModel, maxPromptChars } = getAnomalyPassModelAndPromptCap();
    const anomalyUserMsg =
      `${prompt.slice(0, maxPromptChars)}\n\nTASK: Reply with ONE sentence only (max 45 words). ` +
      `State the single most surprising actionable finding using ONLY names, dollar amounts, or dates that appear verbatim in the text above. ` +
      `No preamble, no JSON, no bullet points.`;
    try {
      const anomalyRes = await getAnthropic().messages.create({
        model: anomalyModel,
        max_tokens: 150,
        temperature: 0.1,
        system: 'You output one factual sentence only. No meta-commentary.',
        messages: [{ role: 'user', content: anomalyUserMsg }],
      });
      await trackApiCall({
        userId,
        model: anomalyModel,
        inputTokens: anomalyRes.usage.input_tokens,
        outputTokens: anomalyRes.usage.output_tokens,
        callType: 'anomaly_identification',
        persist: true,
      });
      const rawAn = anomalyRes.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();
      anomalyIdentification = rawAn.replace(/^["']|["']$/g, '').slice(0, 500);
    } catch (e) {
      logStructuredEvent({
        event: 'anomaly_identification_failed',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'anomaly_pass_skipped',
        details: { scope: 'generator', error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  const augmentedPrompt =
    anomalyIdentification && anomalyIdentification.length > 0
      ? `ANOMALY_IDENTIFICATION (pass-1 thesis — ground the finished artifact in it; do not contradict named facts):\n${anomalyIdentification}\n\n---\n\n${prompt}`
      : prompt;

  const attempts: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: augmentedPrompt },
  ];
  let lastIssues: string[] = [];
  let issuesAttempt0: string[] | null = null;

  for (let attempt = 0; attempt < MAX_DIRECTIVE_LLM_ATTEMPTS; attempt++) {
    const response = await getAnthropic().messages.create({
      model: GENERATION_MODEL_FAST,
      max_tokens: 4096,
      temperature: 0.15,
      system: SYSTEM_PROMPT,
      messages: attempts,
    });

    await trackApiCall({
      userId,
      model: GENERATION_MODEL_FAST,
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
            matchedGoalCategory: ctx.matched_goal_category,
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

    // Pre-validation artifact visibility (full JSON only when FOLDERA_LOG_PRE_VALIDATION_ARTIFACT=true or non-production).
    if (parsed) {
      const pre = JSON.stringify(parsed);
      if (
        process.env.FOLDERA_LOG_PRE_VALIDATION_ARTIFACT === 'true' ||
        process.env.NODE_ENV !== 'production'
      ) {
        console.log('[generator] pre_validate_artifact_json', pre);
      } else {
        console.log(
          '[generator] pre_validate_artifact_json (redacted)',
          JSON.stringify({
            artifact_type: parsed.artifact_type,
            artifact_keys: parsed.artifact && typeof parsed.artifact === 'object' ? Object.keys(parsed.artifact) : [],
            payload_char_len: pre.length,
          }),
        );
      }
    }

    if (parsed) {
      applyHuntSendMessageRecipientCoercion(parsed, ctx, committed, userId);
    }

    const issues = validateGeneratedArtifact(parsed, ctx, committed, { userIdForLogs: userId });
    lastIssues = issues;
    if (attempt === 0) {
      issuesAttempt0 = [...issues];
    }

    if (issues.length === 0 && parsed) {
      return { issues: [], payload: parsed, anomalyIdentification };
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

Do NOT use bracket placeholders like [Name], [Company], [Date], [INSERT DATE], or any [ALL CAPS SLOT].
Use REAL details from the evidence when present; when a detail is missing, say so in complete sentences (e.g. no confirmed date in the signals — follow up to confirm) — never a fill-in token.
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
    return { issues: lastIssues, payload: null, anomalyIdentification, pendingLowCrossSignalFallback: true };
  }

  return { issues: lastIssues, payload: null, anomalyIdentification };
}

// ---------------------------------------------------------------------------
// Exported: buildDirectiveExecutionResult
// ---------------------------------------------------------------------------

/**
 * Email artifacts use `body`; documents use `content`. Mirror `body` → `content` when absent
 * so analytics/SQL like execution_result->'artifact'->>'content' works for send_message rows.
 */
export function normalizeEmailArtifactContentField(
  artifact: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!artifact || typeof artifact !== 'object') return undefined;
  const out = { ...artifact } as Record<string, unknown>;
  const body = out.body;
  const content = out.content;
  if (
    typeof body === 'string' &&
    body.trim().length > 0 &&
    (content === undefined || content === null || String(content).trim() === '')
  ) {
    out.content = body;
  }
  return out;
}

export function buildDirectiveExecutionResult(input: {
  directive: ConvictionDirective;
  briefOrigin: string;
  artifact?: ConvictionArtifact | Record<string, unknown> | null;
  extras?: Record<string, unknown>;
}): Record<string, unknown> {
  const normalizedArtifact = input.artifact
    ? normalizeEmailArtifactContentField(input.artifact as Record<string, unknown>) ??
      (input.artifact as Record<string, unknown>)
    : undefined;
  return {
    ...(normalizedArtifact ? { artifact: normalizedArtifact } : {}),
    brief_origin: input.briefOrigin,
    ...(input.directive.generationLog ? { generation_log: input.directive.generationLog } : {}),
    ...(typeof input.directive.anomaly_identification === 'string' &&
    input.directive.anomaly_identification.trim().length > 0
      ? { anomaly_identification: input.directive.anomaly_identification.trim() }
      : {}),
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
  /** Env-only: synthetic payload, zero Anthropic (distinct from test `dryRun` = skip api_usage persist). */
  const envFixture = process.env.FOLDERA_DRY_RUN === 'true';
  try {
    if (
      !options.dryRun &&
      !envFixture &&
      !options.pipelineDryRun &&
      !options.skipSpendCap &&
      (await isOverDailyLimit(userId))
    ) {
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
      !envFixture &&
      !options.pipelineDryRun &&
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
      scoreOpenLoops(userId, {
        pipelineDryRun: options.pipelineDryRun,
        extraSuppressedCandidateKeys: options.extraSuppressedCandidateKeys,
      }),
      loadRecentActionGuardrails(userId),
    ]);

    if (scored.outcome === 'no_valid_action') {
      return buildNoValidActionBlockerDirective(scored);
    }

    // Part 2b: Rank all candidates by viability before trying each one.
    let { ranked: rankedCandidates, competitionContext } = selectRankedCandidates(
      scored.topCandidates ?? [scored.winner],
      guardrails,
    );
    const goldenPathReorder =
      options.verificationGoldenPathWriteDocument === true ||
      (options.verificationStubPersist === true && options.verificationGoldenPathWriteDocument !== false);
    if (goldenPathReorder) {
      rankedCandidates = reorderRankedCandidatesForVerificationGoldenPathWriteDocument(rankedCandidates);
    }
    console.log(`[generator] ${rankedCandidates.length} candidates ranked for user ${userId.slice(0, 8)}`);

    // =====================================================================
    // USER-LEVEL DATA (shared across all candidates — fetch once)
    // =====================================================================

    const supabase = createServerClient();

    const [userGoalsResult, goalGapResult, alreadySentResult, behavioralHistoryResult, approvedActionsResult, voicePatternsResult] = await Promise.allSettled([
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
          .select('directive_text, generated_at, execution_result')
          .eq('user_id', userId)
          .eq('action_type', 'send_message')
          .in('status', ['approved', 'executed'])
          .gte('generated_at', fourteenDaysAgo)
          .order('generated_at', { ascending: false })
          .limit(10);
        const lines: string[] = [];
        for (const row of actionRows ?? []) {
          const date = new Date(row.generated_at as string).toISOString().slice(0, 10);
          const execResult = row.execution_result as Record<string, unknown> | null;
          const artifact = execResult?.artifact as Record<string, unknown> | undefined;
          const to = (artifact?.to as string | undefined)?.slice(0, 60);
          const subj = (artifact?.subject as string | undefined)?.slice(0, 80);
          const toPart = to ? ` To: ${to}` : '';
          const subjPart = subj ? ` — ${subj}` : '';
          if (toPart || subjPart) {
            lines.push(`[${date}]${toPart}${subjPart}`);
          } else {
            const firstLine = (row.directive_text as string ?? '')
              .split('\n')
              .map((l: string) => l.trim())
              .find((l: string) => l.length > 0)
              ?.slice(0, 80) ?? null;
            if (firstLine) lines.push(`[${date}] — ${firstLine}`);
          }
        }
        return lines;
      })(),
      // Voice patterns from approved emails
      extractUserVoicePatterns(userId),
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
    const userVoicePatterns = voicePatternsResult.status === 'fulfilled' ? voicePatternsResult.value : null;
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
    const [selfNameTokens, userEmails, lockedContactsResult, userPromptNames] = await Promise.all([
      fetchUserSelfNameTokens(userId),
      fetchUserEmailAddresses(userId),
      // Fetch locked contacts from tkg_constraints once — Set for matching; prompt lines for LLM (human-readable).
      (async (): Promise<{ set: Set<string>; promptLines: string[] }> => {
        const set = new Set<string>();
        const promptLines: string[] = [];
        const seenLineKeys = new Set<string>();
        try {
          const { data } = await supabase
            .from('tkg_constraints')
            .select('normalized_entity, entity_text')
            .eq('user_id', userId)
            .eq('constraint_type', 'locked_contact')
            .eq('is_active', true);
          for (const row of data ?? []) {
            const raw = row.normalized_entity;
            if (typeof raw === 'string' && raw.trim()) {
              set.add(raw.replace(/\s+/g, '').toLowerCase());
            }
            const entityText =
              typeof row.entity_text === 'string' && row.entity_text.trim()
                ? row.entity_text.trim()
                : '';
            if (entityText) {
              set.add(entityText.replace(/\s+/g, '').toLowerCase());
            }
            const displayName =
              entityText || (typeof raw === 'string' && raw.trim() ? raw.trim() : '');
            if (!displayName) continue;
            const lineKey = displayName.replace(/\s+/g, '').toLowerCase();
            if (seenLineKeys.has(lineKey)) continue;
            seenLineKeys.add(lineKey);
            promptLines.push(displayName);
          }
        } catch {
          logStructuredEvent({
            event: 'locked_contacts_fetch_failed', level: 'warn', userId,
            artifactType: null, generationStatus: 'locked_contacts_degraded',
            details: { scope: 'generator' },
          });
        }
        return { set, promptLines };
      })(),
      resolveUserPromptNames(userId),
    ]);
    const lockedContacts = lockedContactsResult.set;
    const lockedContactPromptLines = lockedContactsResult.promptLines;

    if (!(options.dryRun || envFixture || options.pipelineDryRun)) {
      const budget = await reserveAnthropicBudgetSlot(ANTHROPIC_BUDGET_RESERVE_ESTIMATE_CENTS);
      if (!budget.allowed) {
        logStructuredEvent({
          event: 'generation_skipped',
          level: 'warn',
          userId,
          artifactType: null,
          generationStatus: 'api_monthly_budget_cap',
          details: {
            scope: 'generator',
            budget: budget.raw,
            rpc_error: budget.errorMessage ?? null,
          },
        });
        return buildBudgetCapDirectiveFromScored(scored, budget.raw, budget.errorMessage);
      }
    }

    for (const { candidate: currentCandidate, disqualified, disqualifyReason } of rankedCandidates) {
      // Skip disqualified candidates (already acted recently, etc.)
      if (disqualified) {
        candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: [disqualifyReason ?? 'disqualified'] });
        continue;
      }

      if (currentCandidate.id.toLowerCase().includes('foldera')) {
        console.log(`[generator] noise_winner_excluded id=${currentCandidate.id}`);
        candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: ['noise_winner:foldera_id'] });
        logStructuredEvent({
          event: 'candidate_blocked',
          level: 'info',
          userId,
          artifactType: null,
          generationStatus: 'noise_winner_excluded',
          details: { scope: 'generator', candidate_id: currentCandidate.id },
        });
        continue;
      }

      // Locked contacts: filtered in scoreOpenLoops (locked_contact_pre_filter) before scoring.
      // buildDecisionPayload still enforces locked_contact_suppression for send_message if a winner slips through.

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
      if (
        CONTACT_ACTION_TYPES.has(hydratedWinner.suggestedActionType) &&
        currentCandidate.type !== 'discrepancy' &&
        currentCandidate.type !== 'hunt'
      ) {
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
      if (!isDecayDiscrepancy && currentCandidate.type !== 'hunt' && currentCandidate.score >= 2.0) {
        try {
          insight = await researchWinner(userId, hydratedWinner, {
            dryRun: options.dryRun,
            pipelineDryRun: options.pipelineDryRun,
          });
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
        avoidanceObservations = await buildAvoidanceObservations(userId, hydratedWinner, signalEvidence, userEmails);
      } catch { /* non-blocking */ }

      // --- Per-candidate: conviction engine (only for first viable candidate) ---
      // Decay reconnection: skip conviction math — it keys off matchedGoal (often financial runway)
      // and would instruct the model to prioritize unrelated "bridge" actions over the reconnect.
      let convictionDecision: import('./conviction-engine').ConvictionDecision | null = null;
      if (!envFixture && !options.pipelineDryRun && !isDecayDiscrepancy && currentCandidate.type !== 'hunt') {
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
        userVoicePatterns,
        lockedContactPromptLines,
      );

      const evidenceBundleReceipt = buildEvidenceBundleReceipt(ctx);
      logStructuredEvent({
        event: 'evidence_bundle_commit',
        level: evidenceBundleReceipt.meets_three_source_bar ? 'info' : 'warn',
        userId,
        artifactType: null,
        generationStatus: evidenceBundleReceipt.meets_three_source_bar
          ? 'evidence_bundle_ok'
          : 'evidence_bundle_under_3_sources',
        details: {
          scope: 'generator',
          ...evidenceBundleReceipt,
        },
      });

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

      if (proofModeThreadBackedSendEnforcementApplies(hydratedWinner, decisionPayload.recommended_action)) {
        const proofPre = evaluateProofModeThreadBackedSendPreflight({
          proofModeEnabled: true,
          decisionRecommendedAction: decisionPayload.recommended_action,
          ctx,
          hydratedWinner,
          userEmails,
        });
        if (!proofPre.ok) {
          candidateBlockLog.push({
            title: currentCandidate.title.slice(0, 80),
            reasons: [`${proofPre.event}${proofPre.detail ? `:${proofPre.detail}` : ''}`],
          });
          logStructuredEvent({
            event: proofPre.event,
            level: 'info',
            userId,
            artifactType: null,
            generationStatus: 'proof_mode_preflight_skip',
            details: {
              scope: 'generator',
              detail: proofPre.detail ?? null,
              candidate_title: currentCandidate.title.slice(0, 80),
              candidate_id: currentCandidate.id,
            },
          });
          continue;
        }
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
          candidateGoal: ctx.candidate_goal,
          causalDiagnosis: ctx.required_causal_diagnosis,
          supportingSignals: ctx.supporting_signals,
          huntRecipientAllowlist: ctx.hunt_send_message_recipient_allowlist,
          userEmails,
          userPromptNames: {
            user_full_name: ctx.user_full_name,
            user_first_name: ctx.user_first_name,
          },
        });

        if (repairedPayload) {
          applyHuntSendMessageRecipientCoercion(
            repairedPayload,
            ctx,
            decisionPayload.recommended_action,
            userId,
          );
          const repairedIssues = validateGeneratedArtifact(
            repairedPayload,
            ctx,
            decisionPayload.recommended_action,
            { userIdForLogs: userId },
          );
          if (repairedIssues.length === 0) {
            if (
              isProofModeThreadBackedSendOnly() &&
              decisionPayload.recommended_action === 'send_message' &&
              repairedPayload.artifact_type !== 'send_message'
            ) {
              logStructuredEvent({
                event: 'proof_mode_candidate_skipped_non_send',
                level: 'info',
                userId,
                artifactType: repairedPayload.artifact_type ?? null,
                generationStatus: 'proof_mode_repair_non_send_blocked',
                details: {
                  scope: 'generator',
                  candidate_title: currentCandidate.title.slice(0, 80),
                  repaired_artifact_type: repairedPayload.artifact_type,
                },
              });
              payloadResult = {
                issues: [...originalIssues, 'proof_mode: decision-enforcement repair produced non-send artifact'],
                payload: null,
                pendingLowCrossSignalFallback: pendingLowCross,
              };
            } else {
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
            }
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
        !proofModeThreadBackedSendEnforcementApplies(hydratedWinner, decisionPayload.recommended_action) &&
        !payloadResult.payload &&
        payloadResult.pendingLowCrossSignalFallback &&
        (decisionPayload.recommended_action === 'send_message' ||
          decisionPayload.recommended_action === 'write_document')
      ) {
        const fallback = buildLowCrossSignalWaitRationalePayload(
          ctx,
          decisionPayload.recommended_action,
        );
        const fbIssues = validateGeneratedArtifact(fallback, ctx, 'wait_rationale', {
          userIdForLogs: userId,
        });
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
      } else if (
        proofModeThreadBackedSendEnforcementApplies(hydratedWinner, decisionPayload.recommended_action) &&
        !payloadResult.payload &&
        payloadResult.pendingLowCrossSignalFallback &&
        (decisionPayload.recommended_action === 'send_message' ||
          decisionPayload.recommended_action === 'write_document')
      ) {
        logStructuredEvent({
          event: 'proof_mode_candidate_skipped_non_send',
          level: 'info',
          userId,
          artifactType: null,
          generationStatus: 'proof_mode_low_cross_wait_blocked',
          details: {
            scope: 'generator',
            candidate_title: currentCandidate.title.slice(0, 80),
            original_commitment: decisionPayload.recommended_action,
            note: 'low_cross_signal would degrade to wait_rationale — blocked in proof mode',
          },
        });
        candidateBlockLog.push({
          title: currentCandidate.title.slice(0, 80),
          reasons: ['proof_mode:low_cross_wait_rationale_blocked'],
        });
        continue;
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

    const staleDateCheck = directiveHasStalePastDates(userFacingStaleDateScanText(payload));
    if (staleDateCheck.stale) {
      const staleReason = `stale_date_in_directive:${staleDateCheck.matches.slice(0, 4).join(',')}`;
      candidateBlockLog.push({
        title: currentCandidate.title.slice(0, 80),
        reasons: [staleReason],
      });
      logStructuredEvent({
        event: 'candidate_blocked',
        level: 'warn',
        userId,
        artifactType: decisionPayload.recommended_action,
        generationStatus: 'stale_date_in_directive',
        details: {
          scope: 'generator',
          candidate_title: currentCandidate.title.slice(0, 80),
          matches: staleDateCheck.matches.slice(0, 6),
        },
      });
      continue;
    }

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

    if (
      proofModeThreadBackedSendEnforcementApplies(currentCandidate, decisionPayload.recommended_action) &&
      !proofModeCanonicalCountsAsProofSuccess(true, canonicalAction)
    ) {
      candidateBlockLog.push({
        title: currentCandidate.title.slice(0, 80),
        reasons: [`proof_mode:blocked_canonical_${canonicalAction}`],
      });
      logStructuredEvent({
        event: 'proof_mode_candidate_skipped_non_send',
        level: 'info',
        userId,
        artifactType: canonicalAction,
        generationStatus: 'proof_mode_blocked_canonical_outcome',
        details: {
          scope: 'generator',
          canonical_action: canonicalAction,
          low_cross_wait_rationale: Boolean(payloadResult.lowCrossSignalWaitRationale),
          candidate_title: currentCandidate.title.slice(0, 80),
        },
      });
      continue;
    }

    if (
      proofModeThreadBackedSendEnforcementApplies(currentCandidate, decisionPayload.recommended_action) &&
      payload.artifact_type !== 'send_message'
    ) {
      candidateBlockLog.push({
        title: currentCandidate.title.slice(0, 80),
        reasons: [`proof_mode:artifact_type_${payload.artifact_type}`],
      });
      logStructuredEvent({
        event: 'proof_mode_candidate_skipped_non_send',
        level: 'info',
        userId,
        artifactType: payload.artifact_type ?? null,
        generationStatus: 'proof_mode_blocked_artifact_type',
        details: {
          scope: 'generator',
          artifact_type: payload.artifact_type,
          candidate_title: currentCandidate.title.slice(0, 80),
        },
      });
      continue;
    }

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
    const duplicateCheck = options.pipelineDryRun && !options.verificationStubPersist
      ? { isDuplicate: false as const }
      : await checkConsecutiveDuplicate(userId, payload.directive);
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

    // Stale ISO / slash-ISO / month dates in brief-visible fields only (`directiveHasStalePastDates` above
    // scans directive, why_now, evidence, insight). Do not scan full artifact bodies: repair paths and
    // write_document content may cite historical cutoff dates from scorer context by design.

    const artTo = typeof payload.artifact === 'object' && payload.artifact && 'to' in payload.artifact
      ? String((payload.artifact as Record<string, unknown>).to ?? '').toLowerCase()
      : '';
    if (artTo.includes('@resend.dev')) {
      console.log(`[generator] noise_winner_excluded id=${currentCandidate.id}`);
      candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: ['noise_winner:resend_recipient'] });
      logStructuredEvent({
        event: 'candidate_blocked',
        level: 'info',
        userId,
        artifactType: canonicalAction,
        generationStatus: 'noise_winner_excluded',
        details: { scope: 'generator', candidate_id: currentCandidate.id, artifact_to: artTo.slice(0, 80) },
      });
      continue;
    }

    // Usefulness gate — candidate-specific, try next
    const usefulnessCheck = options.pipelineDryRun
      ? { ok: true as const }
      : isUseful({
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

    // Strip locked display names from directive + artifact strings before persistence
    // and post-LLM validation. The model often echoes candidate titles (discrepancy lists).
    if (lockedContactPromptLines.length > 0) {
      const scrubbed = sanitizeConvictionPayloadLockedContactsInPlace(payload, lockedContactPromptLines);
      if (scrubbed) {
        logStructuredEvent({
          event: 'locked_contact_names_scrubbed',
          level: 'info',
          userId,
          artifactType: canonicalAction,
          generationStatus: 'locked_contact_artifact_sanitized',
          details: { scope: 'generator', candidate_title: currentCandidate.title.slice(0, 80) },
        });
      }
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
      evidence: appendHuntRecipientGroundingEvidence(buildEvidenceItems(scored, payload), {
        candidateClass: currentCandidate.type,
        canonicalArtifactType: canonicalAction,
        artifact: payload.artifact,
        huntRecipientAllowlist: ctx.hunt_send_message_recipient_allowlist,
      }),
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
        evidence_bundle: evidenceBundleReceipt,
        ...(options.pipelineDryRun && payloadResult.assembledPrompt
          ? {
              pipeline_dry_run: {
                assembled_prompt: payloadResult.assembledPrompt,
                mock_artifact_body: PIPELINE_DRY_RUN_MOCK_ARTIFACT,
                candidate_title: currentCandidate.title,
                candidate_id: currentCandidate.id,
                candidate_type: currentCandidate.type,
                operator_summary: buildPipelineDryRunOperatorSummary({
                  title: currentCandidate.title,
                  canonicalAction,
                  confidence: effectiveConfidence,
                }),
              },
            }
          : {}),
      }),
      ...(payloadResult.anomalyIdentification
        ? { anomaly_identification: payloadResult.anomalyIdentification }
        : {}),
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
      matchedGoalCategory: ctx.matched_goal_category,
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

    // Hard post-LLM locked contact check: if the artifact or directive text
    // mentions any locked contact (case-insensitive, space-normalized), block
    // and try the next candidate. The LLM prompt asks the model to omit them,
    // but this enforcement is deterministic and cannot be overridden.
    if (lockedContactPromptLines.length > 0) {
      const violatingContacts = findLockedContactsInUserFacingPayload(
        lockedContactPromptLines,
        directive.directive.toLowerCase(),
        payload.artifact,
      );
      if (violatingContacts.length > 0) {
        const reason = `locked_contact_in_artifact:${violatingContacts.join(',')}`;
        candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: [reason] });
        logStructuredEvent({
          event: 'candidate_blocked', level: 'warn', userId,
          artifactType: canonicalAction, generationStatus: 'locked_contact_in_artifact',
          details: { scope: 'post_llm_validation', violating_contacts: violatingContacts },
        });
        continue;
      }
    }

    const combinedForThin = `${directive.directive} ${JSON.stringify(payload.artifact)}`.toLowerCase();
    const thinHit = findThinEntryPhrase(combinedForThin);
    if (thinHit) {
      candidateBlockLog.push({ title: currentCandidate.title.slice(0, 80), reasons: [`thin_entry_phrase:${thinHit}`] });
      logStructuredEvent({
        event: 'candidate_blocked', level: 'warn', userId,
        artifactType: canonicalAction, generationStatus: 'thin_entry_phrase_blocked',
        details: { scope: 'post_llm_validation', phrase: thinHit },
      });
      continue;
    }

    const artStr = JSON.stringify(payload.artifact);
    const groundingBlob = [
      ctx.selected_candidate,
      ctx.candidate_title,
      ...ctx.surgical_raw_facts,
      ...ctx.supporting_signals.map((s) => `${s.summary} ${s.occurred_at}`),
      ctx.candidate_context_enrichment ?? '',
      payload.directive,
      payload.why_now ?? '',
      typeof payload.insight === 'string' ? payload.insight : '',
    ].join('\n');
    const badDollars = ungroundedDollarAmounts(artStr, groundingBlob);
    if (badDollars.length > 0) {
      candidateBlockLog.push({
        title: currentCandidate.title.slice(0, 80),
        reasons: [`ungrounded_currency:${badDollars.slice(0, 4).join(',')}`],
      });
      logStructuredEvent({
        event: 'candidate_blocked', level: 'warn', userId,
        artifactType: canonicalAction, generationStatus: 'ungrounded_currency_blocked',
        details: { scope: 'post_llm_validation', amounts: badDollars.slice(0, 4) },
      });
      continue;
    }

    // Trigger action lock validation — discrepancy candidates only (skip when cross-signal degraded to wait_rationale
    // or when running in pipeline dry-run mode because the mock artifact cannot satisfy theme checks)
    if (
      !payloadResult.lowCrossSignalWaitRationale &&
      !options.pipelineDryRun &&
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

    if (proofModeThreadBackedSendEnforcementApplies(currentCandidate, decisionPayload.recommended_action)) {
      logStructuredEvent({
        event: 'proof_mode_send_message_success',
        level: 'info',
        userId,
        artifactType: 'send_message',
        generationStatus: 'proof_mode_send_message_success',
        details: {
          scope: 'generator',
          candidate_id: currentCandidate.id,
          candidate_title: currentCandidate.title.slice(0, 80),
        },
      });
    }

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
    const proofModeFailureMessage =
      'No thread-backed external send_message candidate cleared proof-mode gates.';
    const blockLogMentionsProofModeGates = candidateBlockLog.some((bl) =>
      bl.reasons.some(
        (r) =>
          r.includes('proof_mode_candidate_') ||
          r.includes('proof_mode:') ||
          r.startsWith('proof_mode:'),
      ),
    );
    const failureUserReason =
      isProofModeThreadBackedSendOnly() && blockLogMentionsProofModeGates
        ? proofModeFailureMessage
        : summaryReason;
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
    if (isProofModeThreadBackedSendOnly() && blockLogMentionsProofModeGates) {
      logStructuredEvent({
        event: 'proof_mode_all_candidates_failed',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'proof_mode_all_candidates_failed',
        details: {
          scope: 'generator',
          candidate_count: rankedCandidates.length,
          block_log: candidateBlockLog,
          summary_reason: summaryReason,
        },
      });
    }
    return emptyDirective(
      failureUserReason,
      buildNoSendGenerationLog(failureUserReason, 'validation', scored.candidateDiscovery),
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
  const directive = await generateDirective(userId, {
    dryRun: process.env.FOLDERA_DRY_RUN === 'true',
  });

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
