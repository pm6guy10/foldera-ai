/**
 * Generate stage for the daily brief pipeline.
 * Owns: signal processing, pending queue reconciliation, no-send persistence,
 *       directive generation and persistence, runDailyGenerate orchestration.
 */

import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/db/client';
import {
  buildDirectiveExecutionResult,
  fetchUserEmailAddresses,
  generateDirective,
  getDecisionEnforcementIssues,
  validateDirectiveForPersistence,
} from '@/lib/briefing/generator';
import { generateArtifact, getArtifactPersistenceIssues } from '@/lib/conviction/artifact-generator';
import { persistDirectiveHistorySignal } from '@/lib/signals/directive-history-signal';
import {
  countUnprocessedSignals,
  processUnextractedSignals,
  resolveSignalBacklogMode,
} from '@/lib/signals/signal-processor';
import { summarizeSignals } from '@/lib/signals/summarizer';
import type {
  ConvictionArtifact,
  ConvictionDirective,
  GenerationCandidateDiscoveryLog,
  GenerationRunLog,
} from '@/lib/briefing/types';
import { filterDailyBriefEligibleUserIds } from '@/lib/auth/daily-brief-users';
import { listConnectedUserIds } from '@/lib/auth/user-tokens';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { runCommitmentCeilingDefense } from '@/lib/cron/self-heal';
import { CONFIDENCE_PERSIST_THRESHOLD, CONFIDENCE_SEND_THRESHOLD } from '@/lib/config/constants';
import type {
  DailyBriefFailureCode,
  DailyBriefGenerateRunResult,
  DailyBriefSignalWindowOptions,
  DailyBriefUserResult,
  ReadinessCheckResult,
} from './daily-brief-types';
import {
  buildGenerateMessage,
  buildRunResult,
  buildSignalProcessingMessage,
  SAFE_ERROR_MESSAGES,
} from './daily-brief-status';
import {
  directiveLooksLikeScheduleConflict,
  scheduleConflictArtifactIsOwnerProcedure,
} from '@/lib/briefing/schedule-conflict-guards';
import { effectiveDiscrepancyClassForGates } from '@/lib/briefing/effective-discrepancy-class';

export { effectiveDiscrepancyClassForGates };

// Sourced from lib/config/constants.ts — single source of truth.
const CONFIDENCE_THRESHOLD = CONFIDENCE_PERSIST_THRESHOLD;
const DAILY_SIGNAL_BATCH_SIZE = 5;
const DAILY_SIGNAL_PROCESSING_BUDGET_MS = 20_000;
const DO_NOTHING_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/**
 * Placeholder patterns that indicate a draft was not grounded in real context.
 * Matches exact tokens like [NAME] and prefix tokens like [INSERT relevant detail].
 */
const PLACEHOLDER_PATTERN =
  /\[(?:NAME|RECIPIENT|EMAIL|PERSON|CONTACT|SUBJECT|DATE|TODO|TBD)\]|\[INSERT[^\]]*\]|\[[^\]]*phone[^\]]*\]|\[[^\]]*specific[^\]]*\]|\bfrom recent contact\b/i;

/**
 * Generic opener phrases that indicate the email body has no specific context.
 * A genuinely grounded email opens with the actual topic, not social filler.
 */
const GENERIC_LANGUAGE_PATTERN =
  /\b(i hope this (message |email )?(finds you well|reaches you well)|just (wanted to )?(check in|reach out|touch base|follow up)|as per my (last|previous) (email|message)|touching base|reaching out to (?:you )?today)\b/i;

/**
 * Weak winner patterns — auto-fail artifact classes that do not force a reply,
 * decision, approval, or deadline movement. These are polished sludge.
 */
const WEAK_WINNER_PATTERN =
  /\b(wanted to (loop|circle|reconnect)|keep(ing)? you (in the loop|posted|updated)|thought (you('d| would) want to know|i'?d share)|sharing (an update|some thoughts)|for your (awareness|reference|records)|no action (needed|required)|just (a )?(heads[- ]?up|quick note|friendly reminder)|hope(fully)? this helps|let me know (if|what) you think)\b/i;

/**
 * Vague subject lines that signal generic / template output.
 */
const VAGUE_SUBJECT_PATTERN =
  /^(re:?\s*)?(follow(ing)? up|quick (question|note|check)|hi|hey|check[- ]?in|catch[- ]?up|touching base|fyi|update|reaching out)\s*\.?$/i;

// ---------------------------------------------------------------------------
// Hard bottom gate — blocks operationally empty winners before persistence
// ---------------------------------------------------------------------------

export type BottomGateBlockReason =
  | 'NO_EXTERNAL_TARGET'
  | 'NO_CONCRETE_ASK'
  | 'NO_REAL_PRESSURE'
  | 'SELF_REFERENTIAL_DOCUMENT'
  | 'GENERIC_SOCIAL_MOTION'
  | 'NON_EXECUTABLE_ARTIFACT'
  | 'FINISHED_WORK_REQUIRED';

export interface BottomGateResult {
  pass: boolean;
  blocked_reasons: BottomGateBlockReason[];
}

/**
 * Checks for an external person/entity the artifact is directed at.
 * write_document artifacts that talk only about the user = self-referential.
 * send_message artifacts must have a real external recipient.
 */
const EXTERNAL_TARGET_PATTERN =
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:'s)?\b|@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}/;

/**
 * Concrete ask: a direct question, request, or action directed at another person.
 * Not "I should reflect" or "consider the following" — but "can you confirm",
 * "please send", "reply by", "let's schedule".
 */
const CONCRETE_ASK_PATTERN =
  /\b(can you|could you|would you|will you|please\s+\w+|I need you to|confirm (by|whether|that|if)|reply (by|with|to)|send (me|us|the)|schedule (a |the )?|approve (the |this )?|decide (on |by |whether )|commit to|sign off on|let('s| us) (schedule|set|finalize|lock|confirm))\b|\?\s*$/im;

/**
 * Real-world pressure: deadline, consequence, external forcing function.
 * Not "it would be nice" but "by Friday", "before the deadline", "or we lose".
 */
const REAL_PRESSURE_PATTERN =
  /\b(by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|end of (day|week|month)|close of business|COB|EOD|EOW|\w+day\b|20\d{2}-\d{2}-\d{2})|\bdeadline\b|\bexpir(es?|ing|ation)\b|\boverdue\b|\blast chance\b|\bfinal\b|\burgent\b|\bbefore\s+(the|we|it|they)\b|\bwindow clos(es?|ing)\b|\bif (not|no|we don't)\b.*\b(lose|miss|fail|forfeit|expire|default)\b|\bconsequence\b|\bat risk\b|\btime.sensitive\b|\bdue\s+(date|by|on)\b)\b/i;

/**
 * Self-referential document: the artifact is a memo/reflection/framework directed
 * at the user themselves, not at any external party.
 */
const SELF_REFERENTIAL_DOC_PATTERN =
  /\b(reflect(ion|ing)?(\s+on)?|my (thoughts|analysis|framework|plan|priorities|goals|observations)|personal (note|memo|journal|reflection)|note to self|internal (memo|review|analysis)|self[- ]assessment|brainstorm(ing)?(\s+session)?|thinking (through|about)|consider(ing|ation of)? (my|your|the following))\b/i;

/**
 * Generic social motion: reaching out just to maintain the relationship,
 * with no concrete business purpose, ask, or forcing function.
 */
const SOCIAL_MOTION_PATTERN =
  /\b(just (to )?(say hi|stay in touch|maintain|keep the connection|reconnect)|catch(ing)? up (on|with) life|see how (you're|you are|things are) (doing|going)|been (a while|too long)|miss(ing)? (you|our|catching)|long time no (see|talk|hear)|thinking (of|about) you|how('s| is| are) (everything|things|life|the family))\b/i;

/**
 * Non-executable artifact: a document that is a framework, set of questions,
 * reflection, or analysis — not something that can be sent/used as-is.
 */
const NON_EXECUTABLE_ARTIFACT_PATTERN =
  /\b(key (questions|considerations|takeaways|themes)|things to (consider|think about|reflect on)|questions (to ask|for) (yourself|consideration)|framework for (thinking|deciding|evaluating)|areas (of|for) (focus|consideration|improvement)|action items (to consider|for review)|potential (approaches|strategies|options to explore)|next steps.{0,20}(to consider|to think|for reflection)|food for thought)\b/i;


/**
 * Hard bottom gate: blocks operationally empty winners before pending_approval.
 *
 * Pure function — no DB, no side effects.
 *
 * Checks:
 *   1. External execution target exists
 *   2. Concrete ask exists
 *   3. Real-world pressure exists
 *   4. Not a self-referential document
 *   5. Not generic social motion
 *   6. Artifact is immediately executable
 *
 * If ANY check fails, the winner is blocked and never reaches pending_approval.
 */
export function evaluateBottomGate(
  directive: ConvictionDirective,
  artifact: ConvictionArtifact,
): BottomGateResult {
  if (directive.generationLog?.firstMorningBypass) {
    return { pass: true, blocked_reasons: [] };
  }

  const blocked_reasons: BottomGateBlockReason[] = [];

  const artifactRecord = artifact as unknown as Record<string, unknown>;
  const directiveText = directive.directive ?? '';
  const reason = directive.reason ?? '';

  // Build combined text for pattern matching
  const artifactBody =
    (typeof artifactRecord.body === 'string' ? artifactRecord.body : '') +
    (typeof artifactRecord.content === 'string' ? artifactRecord.content : '') +
    (typeof artifactRecord.subject === 'string' ? artifactRecord.subject : '') +
    (typeof artifactRecord.title === 'string' ? artifactRecord.title : '');
  const combined = `${directiveText}\n${reason}\n${artifactBody}`;

  const scheduleConflictWriteDoc =
    directive.action_type === 'write_document' && directiveLooksLikeScheduleConflict(directive);

  const topCandidateTypeForGate = directive.generationLog?.candidateDiscovery?.topCandidates?.[0]?.candidateType;
  const isDiscrepancyCandidate = topCandidateTypeForGate === 'discrepancy' || topCandidateTypeForGate === 'insight';

  if (scheduleConflictWriteDoc && scheduleConflictArtifactIsOwnerProcedure(artifactBody)) {
    blocked_reasons.push('FINISHED_WORK_REQUIRED');
  }

  // 1. Self-referential document — check FIRST because this is the primary memo-sludge class
  if (
    (directive.action_type === 'write_document' || directive.action_type === 'make_decision') &&
    SELF_REFERENTIAL_DOC_PATTERN.test(combined)
  ) {
    blocked_reasons.push('SELF_REFERENTIAL_DOCUMENT');
  }

  // 2. External execution target
  //    send_message must have a real recipient; write_document must reference someone external
  if (directive.action_type === 'send_message') {
    const to = artifactRecord.to;
    if (typeof to !== 'string' || !to.includes('@')) {
      blocked_reasons.push('NO_EXTERNAL_TARGET');
    }
  } else {
    // write_document / make_decision — must mention a real external person,
    // except pure calendar trade-offs (double-booking) where the user resolves their own schedule.
    if (!EXTERNAL_TARGET_PATTERN.test(combined) && !scheduleConflictWriteDoc) {
      blocked_reasons.push('NO_EXTERNAL_TARGET');
    }
  }

  // 3–5. Concrete ask, real pressure, and social motion checks.
  // send_message emails are exempt: warm reconnection emails (relationship decay candidates)
  // naturally have no hard deadline or explicit request. Quality for outbound emails is
  // already enforced by isSendWorthy (real recipient, body length, banned phrases, etc.).
  // These three checks are designed for documents and commitment artifacts, not personal email.
  if (directive.action_type !== 'send_message') {
    if (scheduleConflictWriteDoc) {
      const hasAnchoredTime =
        REAL_PRESSURE_PATTERN.test(combined) || /\b20\d{2}-\d{2}-\d{2}\b/.test(combined);
      const hasExecutableMotion =
        CONCRETE_ASK_PATTERN.test(combined) ||
        /\bMESSAGE TO\b/i.test(artifactBody) ||
        /\?/.test(artifactBody) ||
        /\b(Hi\b|Hello\b|Dear\b)/i.test(artifactBody);
      if (!hasAnchoredTime) {
        blocked_reasons.push('NO_REAL_PRESSURE');
      }
      if (!hasExecutableMotion) {
        blocked_reasons.push('NO_CONCRETE_ASK');
      }
    } else if (!isDiscrepancyCandidate) {
      // 3. Concrete ask — must ask someone to DO something
      if (!CONCRETE_ASK_PATTERN.test(combined)) {
        blocked_reasons.push('NO_CONCRETE_ASK');
      }

      // 4. Real-world pressure — deadline, consequence, or forcing function
      if (!REAL_PRESSURE_PATTERN.test(combined)) {
        blocked_reasons.push('NO_REAL_PRESSURE');
      }
    }

    // 5. Generic social motion — polished relationship maintenance with no purpose
    if (SOCIAL_MOTION_PATTERN.test(combined)) {
      blocked_reasons.push('GENERIC_SOCIAL_MOTION');
    }
  }

  // 6. Non-executable artifact — framework/reflection/questions, not a finished product
  if (NON_EXECUTABLE_ARTIFACT_PATTERN.test(combined)) {
    blocked_reasons.push('NON_EXECUTABLE_ARTIFACT');
  }

  return {
    pass: blocked_reasons.length === 0,
    blocked_reasons,
  };
}

// ---------------------------------------------------------------------------
// Pre-generation gate
// ---------------------------------------------------------------------------

/**
 * Decide whether generation should run for a user.
 *
 * Pure function — no DB access, no side effects.
 *
 * SEND              — proceed to generateDirective()
 * NO_SEND           — cooldown active; return no_send_reused silently
 * INSUFFICIENT_SIGNAL — stale backlog / no signals; persist skipped evidence, stay silent
 */
export function evaluateReadiness(
  signalResult: DailyBriefUserResult,
  pendingQueue: { recentDoNothingGeneratedAt: string | null },
): ReadinessCheckResult {
  // 1. Hard blockers — processing failed or stale backlog too large
  if (!signalResult.success) {
    const reason =
      signalResult.detail?.trim() ||
      SAFE_ERROR_MESSAGES[signalResult.code as DailyBriefFailureCode] ||
      'Signal processing blocked generation.';
    return { decision: 'INSUFFICIENT_SIGNAL', reason, stage: 'system' };
  }

  const freshSignals =
    (signalResult.meta as Record<string, unknown> | undefined)?.['processed_fresh_signals_count'] as
      | number
      | undefined ?? 0;

  // 2. Cooldown — do_nothing generated < 4h ago AND no fresh signals this run
  if (pendingQueue.recentDoNothingGeneratedAt && freshSignals === 0) {
    const ageMs = Date.now() - new Date(pendingQueue.recentDoNothingGeneratedAt).getTime();
    if (ageMs < DO_NOTHING_COOLDOWN_MS) {
      return {
        decision: 'NO_SEND',
        reason: 'No new signals since recent no-send decision.',
        stage: 'system',
      };
    }
  }

  return { decision: 'SEND', reason: '', stage: 'system' };
}

// ---------------------------------------------------------------------------
// Post-generation quality gate
// ---------------------------------------------------------------------------

/**
 * Final send-worthiness check after artifact generation.
 *
 * Pure function — no DB access, no side effects.
 *
 * Blocks:
 *   - do_nothing directives (never email a wait_rationale)
 *   - confidence below the send threshold (70)
 *   - zero evidence (not grounded in real context)
 *   - placeholder strings in the artifact body
 */
export function isSendWorthy(
  directive: ConvictionDirective,
  artifact: ConvictionArtifact,
  userEmails?: Set<string>,
): { worthy: boolean; reason: string } {
  // Must be a real action — do_nothing is a no-send outcome, not a user-facing directive
  if (directive.action_type === 'do_nothing') {
    return { worthy: false, reason: 'do_nothing_directive' };
  }

  if (directive.generationLog?.firstMorningBypass) {
    return { worthy: true, reason: 'first_morning_welcome' };
  }

  const artifactRecord = artifact as unknown as Record<string, unknown>;

  // send_message and write_document use lower send floors (65 and 67 vs 70).
  // The LLM anchors near 69; the artifact quality gate is the real filter for send_message.
  // make_decision and other action types keep the 70 floor.
  const effectiveSendThreshold = directive.action_type === 'send_message' ? 65
    : directive.action_type === 'write_document' ? 67
    : CONFIDENCE_SEND_THRESHOLD;

  // Discrepancy candidates (relationship decay, risk, exposure) skip quality-gate checks
  // (generic opener, weak winner, decision enforcement) — their absence-of-signal IS the evidence.
  const topCandidateType = directive.generationLog?.candidateDiscovery?.topCandidates?.[0]?.candidateType;
  const isDiscrepancyCandidate = topCandidateType === 'discrepancy' || topCandidateType === 'insight';
  const isDiscrepancyWithRecipient =
    isDiscrepancyCandidate &&
    directive.action_type === 'send_message' &&
    typeof (artifact as unknown as Record<string, unknown>).to === 'string' &&
    ((artifact as unknown as Record<string, unknown>).to as string).includes('@');

  // Must clear the send confidence threshold
  if (directive.confidence < effectiveSendThreshold) {
    return { worthy: false, reason: 'below_send_threshold' };
  }

  // Must be grounded in real context
  if (!directive.evidence || directive.evidence.length === 0) {
    return { worthy: false, reason: 'no_evidence' };
  }

  const artifactJson = JSON.stringify(artifact);

  // Must not contain template placeholders
  if (PLACEHOLDER_PATTERN.test(artifactJson)) {
    return { worthy: false, reason: 'placeholder_content' };
  }

  if (directive.action_type === 'write_document' && directiveLooksLikeScheduleConflict(directive)) {
    const scheduleBody =
      (typeof artifactRecord.content === 'string' ? artifactRecord.content : '') +
      (typeof artifactRecord.body === 'string' ? artifactRecord.body : '') +
      (typeof artifactRecord.title === 'string' ? artifactRecord.title : '');
    if (scheduleConflictArtifactIsOwnerProcedure(scheduleBody)) {
      return { worthy: false, reason: 'schedule_conflict_not_finished_outbound' };
    }
  }

  // send_message: require a real email recipient and a substantive body
  if (directive.action_type === 'send_message') {
    const to = artifactRecord.to;
    if (typeof to !== 'string' || !to.includes('@')) {
      return { worthy: false, reason: 'invalid_recipient' };
    }
    // Self-addressed emails are never valid external actions.
    if (userEmails && userEmails.size > 0 && userEmails.has(to.toLowerCase())) {
      return { worthy: false, reason: 'self_addressed' };
    }
    const body = artifactRecord.body;
    if (typeof body !== 'string' || body.trim().length < 30) {
      return { worthy: false, reason: 'body_too_short' };
    }
    const subject = artifactRecord.subject;
    if (typeof subject === 'string' && VAGUE_SUBJECT_PATTERN.test(subject.trim())) {
      return { worthy: false, reason: 'vague_subject' };
    }
  }

  // Discrepancy candidates (relationship decay, risk, engagement collapse, avoidance,
  // drift, exposure) skip quality-gate checks (generic opener, weak winner, decision
  // enforcement) regardless of whether they produce send_message or write_document.
  // For send_message the recipient/body/subject checks above are the quality filter.
  // For write_document the insight document itself is the artifact — it doesn't need
  // "can you confirm" language; the user approves or skips it directly.
  if (!isDiscrepancyCandidate) {
    // Must not contain generic opener language that signals no specific context
    if (GENERIC_LANGUAGE_PATTERN.test(artifactJson)) {
      return { worthy: false, reason: 'generic_language' };
    }

    // Must not be a weak winner — polished sludge that doesn't force a reply,
    // decision, approval, or deadline movement.
    if (WEAK_WINNER_PATTERN.test(artifactJson)) {
      return { worthy: false, reason: 'weak_winner_no_pressure' };
    }

    const decisionIssues = getDecisionEnforcementIssues({
      actionType: directive.action_type,
      directiveText: directive.directive,
      reason: directive.reason,
      artifact: artifactRecord,
      discrepancyClass: effectiveDiscrepancyClassForGates(directive),
    });
    if (decisionIssues.length > 0) {
      const firstIssue = decisionIssues[0].replace('decision_enforcement:', '');
      return { worthy: false, reason: `decision_enforcement_${firstIssue}` };
    }
  }

  return { worthy: true, reason: '' };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Extract both scorer EV and generator confidence for structured logging. */
function extractThresholdValues(directive: ConvictionDirective | null): {
  scorer_ev: number | null;
  generator_confidence: number | null;
} {
  if (!directive) return { scorer_ev: null, generator_confidence: null };
  const topCandidate = directive.generationLog?.candidateDiscovery?.topCandidates?.[0];
  return {
    scorer_ev: typeof topCandidate?.score === 'number' ? topCandidate.score : null,
    generator_confidence: typeof directive.confidence === 'number' ? directive.confidence : null,
  };
}

export function artifactTypeForAction(actionType: string | null | undefined): string | null {
  switch (actionType) {
    case 'send_message': return 'drafted_email';
    case 'write_document': return 'document';
    case 'make_decision': return 'decision_frame';
    case 'do_nothing': return 'wait_rationale';
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Outcome Receipt — production-visible observability at the winner/persistence
// boundary.  Answers: why did this winner exist, why was it allowed or blocked,
// and is the final artifact sendable?
// ---------------------------------------------------------------------------

export interface WinnerReceipt {
  winner_candidate_id: string | null;
  winner_type: string | null;
  discrepancy_class: string | null;
  action_type: string | null;
  artifact_type: string | null;
  matched_goal: string | null;
  external_target: string | null;
  concrete_ask: boolean;
  pressure_signal: boolean;
  why_now: string | null;
  top_3_runner_ups: Array<{
    id: string;
    type: string;
    title: string;
    score: number;
    why_lost: string;
  }>;
}

export interface PersistenceReceipt {
  external_target_present: boolean;
  concrete_ask_present: boolean;
  real_pressure_present: boolean;
  immediately_usable: boolean;
  self_referential: boolean;
  generic_social_motion: boolean;
  blocked_reason: string | null;
  allowed_reason: string | null;
}

export interface ArtifactReceipt {
  artifact_text: string | null;
  artifact_is_sendable: boolean;
  artifact_changes_probability_now: boolean;
  artifact_requires_more_thinking: boolean;
  artifact_pass_fail: 'PASS' | 'FAIL';
}

export interface OutcomeReceipt {
  winner: WinnerReceipt;
  persistence: PersistenceReceipt;
  artifact: ArtifactReceipt;
  generated_at: string;
}

/**
 * Build the winner receipt from the directive's generation log.
 * Extracts: who won, why, what goal it matches, and who lost.
 */
function buildWinnerReceipt(
  directive: ConvictionDirective,
): WinnerReceipt {
  const discovery = directive.generationLog?.candidateDiscovery;
  const topCandidates = discovery?.topCandidates ?? [];
  const winner = topCandidates.find((c) => c.decision === 'selected') ?? topCandidates[0] ?? null;

  const runnerUps = topCandidates
    .filter((c) => c !== winner)
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      type: c.candidateType,
      title: c.id.slice(0, 60),
      score: c.score,
      why_lost: c.decisionReason || `score ${c.score} < winner`,
    }));

  return {
    winner_candidate_id: winner?.id ?? null,
    winner_type: winner?.candidateType ?? null,
    discrepancy_class: null, // populated below if available
    action_type: directive.action_type ?? null,
    artifact_type: artifactTypeForAction(directive.action_type) ?? null,
    matched_goal: winner?.targetGoal?.text ?? null,
    external_target: extractExternalTarget(directive),
    concrete_ask: CONCRETE_ASK_PATTERN.test(
      `${directive.directive ?? ''}\n${directive.reason ?? ''}`,
    ),
    pressure_signal: REAL_PRESSURE_PATTERN.test(
      `${directive.directive ?? ''}\n${directive.reason ?? ''}`,
    ),
    why_now: discovery?.selectionReason ?? null,
    top_3_runner_ups: runnerUps,
  };
}

/** Extract the external target (email to: or named person) from directive+artifact. */
function extractExternalTarget(directive: ConvictionDirective): string | null {
  const evidence = directive.evidence ?? [];
  // Check for email recipient in evidence
  for (const ev of evidence) {
    const emailMatch = ev.description?.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
    if (emailMatch) return emailMatch[0];
  }
  // Fallback: first capitalized proper noun in directive text
  const nameMatch = (directive.directive ?? '').match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  return nameMatch?.[1] ?? null;
}

/**
 * Build the persistence receipt by running the same checks the bottom gate uses.
 * If the bottom gate passed, `allowed_reason` explains why. If blocked, `blocked_reason` explains why.
 */
function buildPersistenceReceipt(
  directive: ConvictionDirective,
  artifact: ConvictionArtifact,
  bottomGate: BottomGateResult,
): PersistenceReceipt {
  const artifactRecord = artifact as unknown as Record<string, unknown>;
  const directiveText = directive.directive ?? '';
  const reason = directive.reason ?? '';
  const artifactBody =
    (typeof artifactRecord.body === 'string' ? artifactRecord.body : '') +
    (typeof artifactRecord.content === 'string' ? artifactRecord.content : '') +
    (typeof artifactRecord.subject === 'string' ? artifactRecord.subject : '') +
    (typeof artifactRecord.title === 'string' ? artifactRecord.title : '');
  const combined = `${directiveText}\n${reason}\n${artifactBody}`;

  const hasExternalTarget =
    directive.action_type === 'send_message'
      ? typeof artifactRecord.to === 'string' && (artifactRecord.to as string).includes('@')
      : EXTERNAL_TARGET_PATTERN.test(combined);

  return {
    external_target_present: hasExternalTarget,
    concrete_ask_present: CONCRETE_ASK_PATTERN.test(combined),
    real_pressure_present: REAL_PRESSURE_PATTERN.test(combined),
    immediately_usable: !NON_EXECUTABLE_ARTIFACT_PATTERN.test(combined),
    self_referential: SELF_REFERENTIAL_DOC_PATTERN.test(combined),
    generic_social_motion: SOCIAL_MOTION_PATTERN.test(combined),
    blocked_reason: bottomGate.pass ? null : bottomGate.blocked_reasons.join(', '),
    allowed_reason: bottomGate.pass
      ? 'All 6 bottom-gate checks passed'
      : null,
  };
}

/**
 * Build the artifact receipt — machine judgment on the final artifact.
 */
function buildArtifactReceipt(
  directive: ConvictionDirective,
  artifact: ConvictionArtifact,
): ArtifactReceipt {
  const artifactRecord = artifact as unknown as Record<string, unknown>;
  const artifactBody =
    (typeof artifactRecord.body === 'string' ? artifactRecord.body : '') +
    (typeof artifactRecord.content === 'string' ? artifactRecord.content : '');

  const artifactText = artifactBody.slice(0, 2000) || null;

  // Is it sendable? Must have real content, no placeholders, no generic openers
  const hasPlaceholder = PLACEHOLDER_PATTERN.test(JSON.stringify(artifact));
  const hasGenericLanguage = GENERIC_LANGUAGE_PATTERN.test(JSON.stringify(artifact));
  const hasWeakWinner = WEAK_WINNER_PATTERN.test(JSON.stringify(artifact));
  const isSendable = !hasPlaceholder && !hasGenericLanguage && !hasWeakWinner && artifactBody.length >= 30;

  // Does it change probability now? Must have a concrete ask + pressure
  const combined = `${directive.directive ?? ''}\n${directive.reason ?? ''}\n${artifactBody}`;
  const changesProb = CONCRETE_ASK_PATTERN.test(combined) && REAL_PRESSURE_PATTERN.test(combined);

  // Does it require more thinking? Non-executable patterns signal this
  const requiresMoreThinking = NON_EXECUTABLE_ARTIFACT_PATTERN.test(combined);

  return {
    artifact_text: artifactText,
    artifact_is_sendable: isSendable,
    artifact_changes_probability_now: changesProb,
    artifact_requires_more_thinking: requiresMoreThinking,
    artifact_pass_fail: isSendable && changesProb && !requiresMoreThinking ? 'PASS' : 'FAIL',
  };
}

/**
 * Build the full outcome receipt combining all three sub-receipts.
 */
export function buildOutcomeReceipt(
  directive: ConvictionDirective,
  artifact: ConvictionArtifact,
  bottomGate: BottomGateResult,
): OutcomeReceipt {
  return {
    winner: buildWinnerReceipt(directive),
    persistence: buildPersistenceReceipt(directive, artifact, bottomGate),
    artifact: buildArtifactReceipt(directive, artifact),
    generated_at: new Date().toISOString(),
  };
}

/**
 * Build a blocked outcome receipt when persistence is denied.
 */
export function buildBlockedOutcomeReceipt(
  directive: ConvictionDirective,
  artifact: ConvictionArtifact,
  bottomGate: BottomGateResult,
): OutcomeReceipt {
  const receipt = buildOutcomeReceipt(directive, artifact, bottomGate);
  // Override artifact pass_fail — it was blocked regardless of artifact quality
  receipt.artifact.artifact_pass_fail = 'FAIL';
  return receipt;
}

export function extractArtifact(executionResult: unknown): ConvictionArtifact | null {
  if (!executionResult || typeof executionResult !== 'object') return null;
  const artifact = (executionResult as Record<string, unknown>).artifact;
  if (!artifact || typeof artifact !== 'object') return null;
  return artifact as ConvictionArtifact;
}

export function extractNoSendBlockerReason(record: {
  reason?: unknown;
  execution_result?: unknown;
}): string | null {
  const executionResult =
    record.execution_result && typeof record.execution_result === 'object'
      ? (record.execution_result as Record<string, unknown>)
      : null;
  const generationLog =
    executionResult?.generation_log && typeof executionResult.generation_log === 'object'
      ? (executionResult.generation_log as Record<string, unknown>)
      : null;
  const noSend =
    executionResult?.no_send && typeof executionResult.no_send === 'object'
      ? (executionResult.no_send as Record<string, unknown>)
      : null;

  const candidates = [
    typeof record.reason === 'string' ? record.reason : null,
    typeof generationLog?.reason === 'string' ? generationLog.reason : null,
    typeof noSend?.reason === 'string' ? noSend.reason : null,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function extractSentAt(executionResult: unknown): string | null {
  if (!executionResult || typeof executionResult !== 'object') return null;
  const sentAt = (executionResult as Record<string, unknown>).daily_brief_sent_at;
  return typeof sentAt === 'string' && sentAt.trim().length > 0 ? sentAt : null;
}

function buildSyntheticNoSendDirective(
  reason: string,
  stage: GenerationRunLog['stage'],
  candidateDiscovery: GenerationCandidateDiscoveryLog | null = null,
): ConvictionDirective {
  return {
    directive: '__GENERATION_FAILED__',
    action_type: 'do_nothing',
    confidence: 0,
    reason,
    evidence: [],
    generationLog: {
      outcome: 'no_send',
      stage,
      reason,
      candidateFailureReasons: candidateDiscovery
        ? (candidateDiscovery.topCandidates ?? []).map((c) =>
          c.decision === 'selected' ? `Selected candidate blocked: ${reason}` : c.decisionReason)
        : [reason],
      candidateDiscovery: candidateDiscovery
        ? { ...candidateDiscovery, failureReason: candidateDiscovery.failureReason ?? reason }
        : null,
    },
  };
}

function getCandidateDiscoveryFailureReason(
  candidateDiscovery: GenerationCandidateDiscoveryLog | null | undefined,
): string | null {
  if (!candidateDiscovery) {
    return 'Candidate discovery log missing from generation output.';
  }
  // A single strong candidate that survives all 7 invariant checks is sufficient.
  // The invariant wall (actionable, send/write capable, decision-moving, not noise,
  // not obvious, not stale, evidence density >= 2) already ensures quality.
  // Requiring 3+ companions blocks valid winners when the pool is naturally sparse
  // after admission cleanup.
  if (candidateDiscovery.candidateCount === 0) {
    return 'Acceptance gate blocked send because zero candidates were evaluated.';
  }
  if ((candidateDiscovery.topCandidates?.length ?? 0) === 0) {
    return 'Acceptance gate blocked send because no candidates passed ranking.';
  }
  return null;
}

export function todayStartIso(): string {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

/**
 * Returns the start of the Pacific-time "day" expressed in UTC.
 * We anchor at 08:00 UTC which is midnight PST (UTC-8).
 * In PDT (UTC-7) this is 1:00 AM, which is still safely before the
 * 4:00 AM PT / 11:00 UTC cron window.
 *
 * Why this matters: evening test/manual sessions (e.g. 7 PM PT = 02:00 UTC)
 * fall BEFORE 08:00 UTC, so they belong to "yesterday's PT day" and do NOT
 * set the already-sent flag that would block the morning cron.
 */
export function ptDayStartIso(): string {
  const now = new Date();
  const anchor = new Date(now);
  anchor.setUTCHours(8, 0, 0, 0);
  // If we haven't yet crossed 08:00 UTC today, step back to yesterday's 08:00
  if (now.getTime() < anchor.getTime()) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }
  return anchor.toISOString();
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Signal counting helper (used by runSignalProcessingForUser)
// ---------------------------------------------------------------------------

async function countUnprocessedSignalsOlderThan(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  beforeIso: string,
  options: DailyBriefSignalWindowOptions = {},
): Promise<number> {
  let query = supabase
    .from('tkg_signals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('processed', false)
    .lt('occurred_at', beforeIso);

  if (options.signalCreatedAtGte) {
    query = query.gte('created_at', options.signalCreatedAtGte);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Pending queue reconciliation
// ---------------------------------------------------------------------------

interface PendingActionRow {
  action_type: string | null;
  confidence: number | null;
  directive_text: string | null;
  execution_result: unknown;
  generated_at: string;
  id: string;
  reason: string | null;
}

async function reconcilePendingApprovalQueue(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  todayStart: string,
  options: DailyBriefSignalWindowOptions = {},
): Promise<{
  error: Error | null;
  preservedAction: PendingActionRow | null;
  skippedActionIds: string[];
  recentDoNothingGeneratedAt: string | null;
}> {
  const { data, error } = await supabase
    .from('tkg_actions')
    .select('id, generated_at, confidence, action_type, directive_text, reason, execution_result')
    .eq('user_id', userId)
    .eq('status', 'pending_approval')
    .order('confidence', { ascending: false })
    .limit(20);

  if (error) {
    return { error, preservedAction: null, skippedActionIds: [], recentDoNothingGeneratedAt: null };
  }

  const rows = (data ?? []) as PendingActionRow[];
  const forceFreshRun = options.forceFreshRun === true;
  let preservedAction: PendingActionRow | null = null;
  const skippedActionIds: string[] = [];
  let recentDoNothingGeneratedAt: string | null = null;

  for (const row of rows) {
    const artifact = extractArtifact(row.execution_result);
    const sentAt = extractSentAt(row.execution_result);
    const alreadySent = typeof sentAt === 'string' && sentAt.trim().length > 0;
    const isToday = row.generated_at >= todayStart;
    const isDoNothing = row.action_type === 'do_nothing';
    const isValid =
      !alreadySent &&
      !isDoNothing &&
      artifact !== null &&
      typeof row.confidence === 'number' &&
      row.confidence >= CONFIDENCE_THRESHOLD;

    if (forceFreshRun || !isToday || !isValid) {
      const executionResult =
        row.execution_result && typeof row.execution_result === 'object'
          ? (row.execution_result as Record<string, unknown>)
          : {};
      const suppressionReason = forceFreshRun
        ? 'Auto-suppressed pending action before forced fresh generation.'
        : alreadySent
        ? 'Auto-suppressed already-sent pending action before daily brief generation.'
        : isDoNothing
        ? 'Auto-suppressed do_nothing pending action — never send to user.'
        : !isToday
        ? 'Auto-suppressed stale pending action before daily brief generation.'
        : 'Auto-suppressed invalid pending action before daily brief generation.';

      if (isDoNothing && isToday && row.generated_at > (recentDoNothingGeneratedAt ?? '')) {
        recentDoNothingGeneratedAt = row.generated_at;
      }

      const { error: updateError } = await supabase
        .from('tkg_actions')
        .update({
          status: 'skipped',
          skip_reason: suppressionReason,
          execution_result: {
            ...executionResult,
            auto_suppressed_at: new Date().toISOString(),
            auto_suppression_reason: suppressionReason,
          },
        })
        .eq('id', row.id);

      if (updateError) {
        return { error: updateError, preservedAction: null, skippedActionIds, recentDoNothingGeneratedAt: null };
      }

      skippedActionIds.push(row.id);
      continue;
    }

    if (!preservedAction) {
      preservedAction = row;
      continue;
    }

    const executionResult =
      row.execution_result && typeof row.execution_result === 'object'
        ? (row.execution_result as Record<string, unknown>)
        : {};
    const suppressionReason = 'Auto-suppressed duplicate pending action before daily brief generation.';
    const { error: updateError } = await supabase
      .from('tkg_actions')
      .update({
        status: 'skipped',
        skip_reason: suppressionReason,
        execution_result: {
          ...executionResult,
          auto_suppressed_at: new Date().toISOString(),
          auto_suppression_reason: suppressionReason,
        },
      })
      .eq('id', row.id);

    if (updateError) {
      return { error: updateError, preservedAction: null, skippedActionIds, recentDoNothingGeneratedAt: null };
    }

    skippedActionIds.push(row.id);
  }

  return { error: null, preservedAction, skippedActionIds, recentDoNothingGeneratedAt };
}

// ---------------------------------------------------------------------------
// No-send persistence
// ---------------------------------------------------------------------------

export async function findPersistedNoSendBlocker(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  sinceIso: string,
): Promise<{ error: Error | null; id: string | null; reason: string | null }> {
  const { data, error } = await supabase
    .from('tkg_actions')
    .select('id, reason, execution_result, generated_at')
    .eq('user_id', userId)
    .eq('status', 'skipped')
    .gte('generated_at', sinceIso)
    .order('generated_at', { ascending: false })
    .limit(10);

  if (error) return { error, id: null, reason: null };

  const blocker = (data ?? []).find((candidate) => {
    const executionResult =
      candidate.execution_result && typeof candidate.execution_result === 'object'
        ? (candidate.execution_result as Record<string, unknown>)
        : null;
    return executionResult?.outcome_type === 'no_send';
  });

  if (!blocker) return { error: null, id: null, reason: null };

  return {
    error: null,
    id: blocker.id as string,
    reason: extractNoSendBlockerReason(blocker),
  };
}

function buildNoSendGenerationLog(
  directive: ConvictionDirective,
  reason: string,
  stage: GenerationRunLog['stage'],
): GenerationRunLog {
  const candidateDiscovery = directive.generationLog?.candidateDiscovery
    ? {
      ...directive.generationLog.candidateDiscovery,
      failureReason: directive.generationLog.candidateDiscovery.failureReason ?? reason,
    }
    : null;

  return {
    outcome: 'no_send',
    stage,
    reason,
    candidateFailureReasons: candidateDiscovery
      ? (candidateDiscovery.topCandidates ?? []).map((c) =>
        c.decision === 'selected' ? `Selected candidate blocked: ${reason}` : c.decisionReason)
      : [reason],
    candidateDiscovery,
  };
}

function buildNoSendExecutionResult(
  directive: ConvictionDirective,
  reason: string,
  stage: GenerationRunLog['stage'],
): Record<string, unknown> {
  return buildDirectiveExecutionResult({
    directive,
    briefOrigin: 'daily_cron',
    extras: {
      outcome_type: 'no_send',
      generation_log: directive.generationLog?.outcome === 'no_send'
        ? directive.generationLog
        : buildNoSendGenerationLog(directive, reason, stage),
      no_send: { reason, stage },
    },
  });
}

function buildWaitRationale(
  directive: ConvictionDirective,
  reason: string,
): { directiveText: string; artifact: Record<string, unknown> } {
  const discovery = directive.generationLog?.candidateDiscovery;
  const candidateCount = discovery?.candidateCount ?? 0;
  const topCandidates = discovery?.topCandidates ?? [];
  const oneLiner = typeof directive.directive === 'string' ? directive.directive.trim() : '';
  const modelInsight = typeof directive.fullContext === 'string' && directive.fullContext.trim()
    ? directive.fullContext.trim()
    : null;

  const contextParts: string[] = [];
  if (candidateCount > 0) {
    contextParts.push(`Foldera evaluated ${candidateCount} candidates today.`);
  }
  for (const candidate of topCandidates.slice(0, 3)) {
    const action = candidate.actionType ?? 'action';
    const score = typeof candidate.score === 'number' ? candidate.score.toFixed(2) : '?';
    const goalText = candidate.targetGoal?.text
      ? ` (goal: ${candidate.targetGoal.text.slice(0, 80)})`
      : '';
    const blocked = candidate.decision === 'selected' ? ' [SELECTED — not sent]' : '';
    contextParts.push(`• ${action} scored ${score}${goalText}${blocked}`);
  }
  if (contextParts.length === 0) {
    contextParts.push('No actionable candidates were found today.');
  }

  const context = modelInsight
    ? `${modelInsight}\n\n${contextParts.join('\n')}`
    : contextParts.join('\n');
  // Prefer the real lead sentence for `directive_text` so no-send rows match the attempted winner.
  const directiveText =
    oneLiner.length > 0 && oneLiner.length <= 500 && !/^INSIGHT:/i.test(oneLiner)
      ? oneLiner
      : modelInsight
        ? modelInsight
        : candidateCount > 0
        ? `Nothing cleared the bar today — ${candidateCount} candidates evaluated, none ready to send.`
        : 'Nothing cleared the bar today.';

  return {
    directiveText,
    artifact: {
      type: 'wait_rationale',
      context,
      evidence: reason,
      tripwires: topCandidates
        .filter((c) => c.decision === 'selected')
        .slice(0, 3)
        .map((c) => `Activate when: new signals arrive for "${c.targetGoal?.text?.slice(0, 60) ?? 'unknown'}"`),
    },
  };
}

async function persistNoSendOutcome(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  directive: ConvictionDirective,
  reason: string,
  stage: GenerationRunLog['stage'],
): Promise<{ id: string } | null> {
  const executionResult = buildNoSendExecutionResult(directive, reason, stage);
  const waitRationale = buildWaitRationale(directive, reason);

  const { data, error } = await supabase
    .from('tkg_actions')
    .insert({
      user_id: userId,
      action_type: 'do_nothing',
      directive_text: waitRationale.directiveText,
      reason,
      status: 'skipped',
      confidence: 45,
      evidence: directive.evidence,
      generated_at: new Date().toISOString(),
      generation_attempts: 1,
      artifact: waitRationale.artifact,
      execution_result: {
        ...executionResult,
        artifact: waitRationale.artifact,
        original_candidate: {
          action_type: directive.action_type,
          candidate_description: typeof directive.directive === 'string' ? directive.directive.trim().slice(0, 500) : null,
          blocked_by: reason,
        },
      },
    })
    .select('id')
    .single();

  if (error || !data?.id) return null;
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// User resolution
// ---------------------------------------------------------------------------

export async function resolveDailyBriefUserIds(explicitUserIds?: string[]): Promise<string[]> {
  const uniqueExplicitUserIds = [...new Set((explicitUserIds ?? []).filter(Boolean))];
  if (uniqueExplicitUserIds.length > 0) return uniqueExplicitUserIds;
  return getEligibleDailyBriefUserIds();
}

async function getEligibleDailyBriefUserIds(): Promise<string[]> {
  const supabase = createServerClient();
  const connected = await listConnectedUserIds(supabase);
  const { data: entities, error } = await supabase
    .from('tkg_entities')
    .select('user_id')
    .eq('name', 'self');

  if (error) throw error;

  const fromGraph = (entities ?? []).map((e: { user_id: string }) => e.user_id);
  const userIds = [...new Set([...connected, ...fromGraph])];
  if (userIds.length === 0) return [];
  return filterDailyBriefEligibleUserIds(userIds, supabase);
}

const FIRST_MORNING_SIGNAL_CAP = 5;
const FIRST_MORNING_ACCOUNT_MAX_MS = 48 * 60 * 60 * 1000;
const ONBOARDING_GOAL_SOURCES = ['onboarding_bucket', 'onboarding_stated'] as const;

async function countTotalSignalsForUser(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('tkg_signals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

async function userAccountCreatedAtMs(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<number | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user?.created_at) return null;
  const t = new Date(data.user.created_at).getTime();
  return Number.isFinite(t) ? t : null;
}

async function hasPriorFirstMorningBrief(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tkg_actions')
    .select('execution_result')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(80);
  if (error) return false;
  return (data ?? []).some((row) => {
    const er = row.execution_result as Record<string, unknown> | null;
    return er?.brief_origin === 'first_morning';
  });
}

async function loadOnboardingGoalsForFirstMorning(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<Array<{ goal_text: string; goal_category: string | null; source: string }>> {
  const { data, error } = await supabase
    .from('tkg_goals')
    .select('goal_text, goal_category, source')
    .eq('user_id', userId)
    .in('source', [...ONBOARDING_GOAL_SOURCES]);
  if (error) throw error;
  return (data ?? []).filter(
    (g: { goal_text: string }) =>
      typeof g.goal_text === 'string' &&
      g.goal_text.trim().length > 0 &&
      g.goal_text !== '__ONBOARDING_COMPLETE__',
  ) as Array<{ goal_text: string; goal_category: string | null; source: string }>;
}

function buildFirstMorningWelcome(
  goals: Array<{ goal_text: string; goal_category: string | null }>,
): { directive: ConvictionDirective; artifact: ConvictionArtifact } {
  const directiveText =
    'Foldera is syncing your last 90 days of email and will watch for patterns tied to the priorities you set during onboarding.';

  const lines: string[] = [
    'Welcome — here is what Foldera will track for you while your history finishes importing.',
    '',
    'We pull roughly the last 90 days from your connected inbox and calendar, turn that into signals, and score what deserves a finished move tomorrow.',
    '',
    'Your stated priorities:',
  ];
  for (const g of goals) {
    const cat = g.goal_category ? ` (${g.goal_category})` : '';
    lines.push(`• ${g.goal_text.trim()}${cat}`);
  }
  lines.push(
    '',
    'What we watch per goal:',
    '• Missed replies, stalled threads, and calendar drift that conflict with that priority.',
    '• Commitments and deadlines that show up across mail and events.',
    '• Relationship silence where you historically had momentum.',
    '',
    'You will get one directive with finished work attached — approve or skip. No extra setup.',
  );
  const content = lines.join('\n');

  const directive: ConvictionDirective = {
    directive: directiveText,
    action_type: 'write_document',
    confidence: 78,
    reason:
      'Based on the onboarding goals you saved — we are calibrating the model to those outcomes while signals ingest.',
    evidence: goals.slice(0, 6).map((g) => ({
      type: 'goal' as const,
      description: g.goal_text.trim(),
    })),
    generationLog: {
      outcome: 'selected',
      stage: 'persistence',
      reason: 'first_morning_welcome',
      candidateFailureReasons: [],
      candidateDiscovery: null,
      firstMorningBypass: true,
    },
  };

  const artifact: ConvictionArtifact = {
    type: 'document',
    title: 'Your first 48 hours — what Foldera is watching',
    content,
  };

  return { directive, artifact };
}

// ---------------------------------------------------------------------------
// Signal processing stage (per user)
// ---------------------------------------------------------------------------

async function runSignalProcessingForUser(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  options: DailyBriefSignalWindowOptions = {},
): Promise<DailyBriefUserResult> {
  const staleCutoffIso = isoHoursAgo(24);
  const deadline = Date.now() + DAILY_SIGNAL_PROCESSING_BUDGET_MS;

  try {
    const staleBefore = await countUnprocessedSignalsOlderThan(supabase, userId, staleCutoffIso, options);
    const totalBeforeAllSources = await countUnprocessedSignals(userId, {
      createdAtGte: options.signalCreatedAtGte,
      includeAllSources: true,
    });
    const totalBefore = await countUnprocessedSignals(userId, { createdAtGte: options.signalCreatedAtGte });
    const backlogMode = resolveSignalBacklogMode(totalBeforeAllSources);

    logStructuredEvent({
      event: 'daily_brief_signal_mode',
      userId,
      artifactType: null,
      generationStatus: 'mode_selected',
      details: {
        scope: 'daily-brief',
        nightly_ops_signal_mode: backlogMode.mode,
        total_unprocessed_signals_before_processing: totalBeforeAllSources,
        signal_batch_size: backlogMode.maxSignals,
        max_signal_rounds: backlogMode.rounds,
      },
    });

    let signalsProcessed = 0;
    let summariesCreated = 0;
    let staleAfter = staleBefore;
    let totalAfter = totalBefore;
    const deferredSignalIds = new Set<string>();
    const errors: string[] = [];

    while (Date.now() < deadline) {
      const extraction = await processUnextractedSignals(userId, {
        createdAtGte: options.signalCreatedAtGte,
        maxSignals: DAILY_SIGNAL_BATCH_SIZE,
        prioritizeOlderThanIso: staleCutoffIso,
        quarantineDeferredOlderThanIso: staleCutoffIso,
      });
      signalsProcessed += extraction.signals_processed;
      for (const signalId of extraction.deferred_signal_ids ?? []) deferredSignalIds.add(signalId);
      for (const err of extraction.errors ?? []) errors.push(err);

      staleAfter = await countUnprocessedSignalsOlderThan(supabase, userId, staleCutoffIso, options);
      totalAfter = await countUnprocessedSignals(userId, { createdAtGte: options.signalCreatedAtGte });

      if (extraction.signals_processed === 0) break;
      if (staleAfter === 0 && totalAfter === 0) break;
    }

    try {
      summariesCreated = await summarizeSignals(userId);
      if (summariesCreated > 0) {
        logStructuredEvent({
          event: 'daily_generate_summary',
          userId,
          artifactType: null,
          generationStatus: 'summary_complete',
          details: { scope: 'daily-brief', summaries_created: summariesCreated },
        });
      }
    } catch (sumErr: unknown) {
      errors.push(sumErr instanceof Error ? sumErr.message : String(sumErr));
      logStructuredEvent({
        event: 'daily_generate_summary_failed',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'summary_failed',
        details: {
          scope: 'daily-brief',
          error: sumErr instanceof Error ? sumErr.message : String(sumErr),
        },
      });
    }

    const meta = {
      processed_fresh_signals_count: signalsProcessed,
      stale_unprocessed_signals_before_generation: staleAfter,
      stale_unprocessed_signals_before_generation_initial: staleBefore,
      summaries_created: summariesCreated,
      total_unprocessed_signals_before_processing_all_sources: totalBeforeAllSources,
      total_unprocessed_signals_after_processing: totalAfter,
      total_unprocessed_signals_before_processing: totalBefore,
      deferred_signal_ids: [...deferredSignalIds],
      route_budget_exhausted: Date.now() >= deadline,
    };

    if (staleAfter >= 10 && !options.skipStaleGate) {
      return {
        code: 'stale_signal_backlog_remaining',
        detail: `${staleAfter} unprocessed signals older than 24 hours remained after the signal-processing budget.`,
        meta,
        success: false,
        userId,
      };
    }

    if (errors.length > 0 && signalsProcessed === 0 && totalBefore > 0) {
      return {
        code: 'signal_processing_failed',
        detail: errors.join(' '),
        meta: { ...meta, errors },
        success: false,
        userId,
      };
    }

    return {
      code: totalBefore === 0 ? 'no_unprocessed_signals' : 'signals_caught_up',
      meta: { ...meta, errors },
      success: true,
      userId,
    };
  } catch (error: unknown) {
    return {
      code: 'signal_processing_failed',
      detail: error instanceof Error ? error.message : String(error),
      success: false,
      userId,
    };
  }
}

// ---------------------------------------------------------------------------
// runDailyGenerate — generate stage entrypoint
// ---------------------------------------------------------------------------

export async function runDailyGenerate(
  options: DailyBriefSignalWindowOptions = {},
): Promise<DailyBriefGenerateRunResult> {
  const supabase = createServerClient();
  const date = new Date().toISOString().slice(0, 10);
  const todayStart = todayStartIso();

  const { error: expireError } = await supabase
    .from('user_subscriptions')
    .update({ status: 'expired' })
    .eq('plan', 'trial')
    .eq('status', 'active')
    .lte('current_period_end', new Date().toISOString());

  if (expireError) throw expireError;

  const eligibleUserIds = await resolveDailyBriefUserIds(options.userIds);
  if (eligibleUserIds.length === 0) {
    const emptySignalStage = buildRunResult(
      date,
      'Signal processing skipped because no eligible users with graph data were available.',
      [],
    );
    return {
      ...buildRunResult(date, 'No eligible users with graph data.', []),
      signalProcessing: emptySignalStage,
    };
  }

  const signalResults: DailyBriefUserResult[] = [];
  const results: DailyBriefUserResult[] = [];
  const totalUsers = eligibleUserIds.length;

  for (let ui = 0; ui < eligibleUserIds.length; ui++) {
    const userId = eligibleUserIds[ui];
    console.log(`[daily-generate] Generating for user ${userId} (${ui + 1} of ${totalUsers})`);

    // Early guard: skip signal processing entirely if a valid pending_approval already exists today.
    // reconcilePendingApprovalQueue handles the same case later, but running it before
    // runSignalProcessingForUser avoids unnecessary extraction work.
    // Skipped for forceFreshRun (must regenerate) and rows that were already sent (need fresh).
    if (!options?.forceFreshRun) {
      const { data: pendingRows } = await supabase
        .from('tkg_actions')
        .select('id, generated_at, execution_result')
        .eq('user_id', userId)
        .eq('status', 'pending_approval')
        .neq('action_type', 'do_nothing')
        .gte('generated_at', todayStart)
        .limit(5);

      const existingPending = (pendingRows ?? []).find((row) => {
        const er = (row as { execution_result?: Record<string, unknown> | null }).execution_result;
        return !er?.['daily_brief_sent_at'];
      }) ?? null;

      if (existingPending) {
        results.push({
          code: 'pending_approval_guard',
          meta: { action_id: (existingPending as { id: string }).id },
          success: true,
          userId,
        });
        continue;
      }
    }

    const userEmails = await fetchUserEmailAddresses(userId);
    const signalResult = await runSignalProcessingForUser(supabase, userId, options);
    signalResults.push(signalResult);

    try {
      const pendingQueue = await reconcilePendingApprovalQueue(supabase, userId, todayStart, options);
      if (pendingQueue.error) {
        results.push({
          code: 'directive_persist_failed',
          detail: pendingQueue.error.message,
          success: false,
          userId,
        });
        continue;
      }

      const cleanupMeta = {
        skipped_pending_action_ids: pendingQueue.skippedActionIds,
        signal_processing: signalResult.meta ?? {},
      };

      if (pendingQueue.preservedAction) {
        results.push({
          code: 'pending_approval_reused',
          meta: {
            ...cleanupMeta,
            action_id: pendingQueue.preservedAction.id,
            artifact_present: extractArtifact(pendingQueue.preservedAction.execution_result) !== null,
            daily_brief_sent_at: extractSentAt(pendingQueue.preservedAction.execution_result),
          },
          success: true,
          userId,
        });
        continue;
      }

      // Recovery: if a high-confidence directive was user-skipped today (skip_reason IS NULL),
      // restore it to pending_approval rather than generating do_nothing.
      {
        const { data: recoverable } = await supabase
          .from('tkg_actions')
          .select('id, confidence, action_type, directive_text, execution_result')
          .eq('user_id', userId)
          .eq('status', 'skipped')
          .is('skip_reason', null)
          .neq('action_type', 'do_nothing')
          .gte('confidence', 70)
          .gte('generated_at', todayStart)
          .order('confidence', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recoverable && !options.forceFreshRun) {
          await supabase
            .from('tkg_actions')
            .update({ status: 'pending_approval', skip_reason: null })
            .eq('id', recoverable.id);

          results.push({
            code: 'pending_approval_reused',
            meta: {
              ...cleanupMeta,
              action_id: recoverable.id,
              artifact_present: extractArtifact(recoverable.execution_result) !== null,
              recovered: true,
            },
            success: true,
            userId,
          });
          continue;
        }
      }

      // First-morning welcome: goals-only directive for brand-new accounts with few signals.
      try {
        const signalTotal = await countTotalSignalsForUser(supabase, userId);
        const createdMs = await userAccountCreatedAtMs(supabase, userId);
        const accountYoung =
          createdMs !== null && Date.now() - createdMs < FIRST_MORNING_ACCOUNT_MAX_MS;
        if (
          signalTotal < FIRST_MORNING_SIGNAL_CAP &&
          accountYoung &&
          !(await hasPriorFirstMorningBrief(supabase, userId))
        ) {
          const goals = await loadOnboardingGoalsForFirstMorning(supabase, userId);
          if (goals.length > 0) {
            const { directive, artifact } = buildFirstMorningWelcome(goals);
            const persistenceIssues = [
              ...getArtifactPersistenceIssues(directive.action_type, artifact, directive),
              ...validateDirectiveForPersistence({ userId, directive, artifact }),
            ];
            if (persistenceIssues.length === 0) {
              const bottomGate = evaluateBottomGate(directive, artifact);
              if (bottomGate.pass) {
                const outcomeReceipt = buildOutcomeReceipt(directive, artifact, bottomGate);
                const { data: savedFm, error: saveFmErr } = await supabase
                  .from('tkg_actions')
                  .insert({
                    user_id: userId,
                    action_type: directive.action_type,
                    directive_text: directive.directive,
                    reason: directive.reason,
                    status: 'pending_approval',
                    confidence: directive.confidence,
                    evidence: directive.evidence,
                    generated_at: new Date().toISOString(),
                    generation_attempts: 1,
                    artifact,
                    execution_result: {
                      ...buildDirectiveExecutionResult({
                        directive,
                        artifact,
                        briefOrigin: 'first_morning',
                        extras: {},
                      }),
                      approve: null,
                      outcome_receipt: outcomeReceipt,
                    },
                  })
                  .select('id')
                  .single();

                if (!saveFmErr && savedFm?.id) {
                  logStructuredEvent({
                    event: 'first_morning_brief_persisted',
                    userId,
                    artifactType: 'document',
                    generationStatus: 'generated',
                    details: { scope: 'daily-generate', action_id: savedFm.id, signal_total: signalTotal },
                  });
                  results.push({
                    code: 'pending_approval_persisted',
                    meta: {
                      ...cleanupMeta,
                      action_id: savedFm.id,
                      brief_origin: 'first_morning',
                      first_morning: true,
                    },
                    success: true,
                    userId,
                  });
                  continue;
                }
              }
            }
          }
        }
      } catch (fmErr: unknown) {
        Sentry.captureException(fmErr instanceof Error ? fmErr : new Error(String(fmErr)));
        console.error('[daily-generate] first_morning path failed:', fmErr);
      }

      // Gate: single named decision point before any generation work.
      const readiness = evaluateReadiness(signalResult, pendingQueue);
      logStructuredEvent({
        event: 'brief_gate_decision',
        userId,
        artifactType: null,
        generationStatus: readiness.decision === 'SEND' ? 'gate_passed' : 'gate_blocked',
        details: {
          scope: 'pre_generation_gate',
          decision: readiness.decision,
          reason: readiness.reason || 'ok',
          signal_code: signalResult.code,
          fresh_signals:
            (signalResult.meta as Record<string, unknown> | undefined)?.['processed_fresh_signals_count'] ?? 0,
        },
      });

      if (readiness.decision === 'NO_SEND') {
        results.push({
          code: 'no_send_reused',
          detail: readiness.reason,
          meta: cleanupMeta,
          success: true,
          userId,
        });
        continue;
      }

      if (readiness.decision === 'INSUFFICIENT_SIGNAL') {
        const savedNoSend = await persistNoSendOutcome(
          supabase,
          userId,
          buildSyntheticNoSendDirective(readiness.reason, readiness.stage),
          readiness.reason,
          readiness.stage,
        );
        if (!savedNoSend) {
          results.push({
            code: 'directive_persist_failed',
            detail: 'Failed to persist pre-generation no-send evidence.',
            success: false,
            userId,
          });
          continue;
        }
        results.push({
          code: 'no_send_persisted',
          detail: readiness.reason,
          meta: { ...cleanupMeta, action_id: savedNoSend.id, readiness_decision: readiness.decision },
          success: true,
          userId,
        });
        continue;
      }

      // readiness.decision === 'SEND' — proceed to generation

      // Run ceiling defense immediately before scoring
      try {
        await runCommitmentCeilingDefense();
      } catch (err) {
        console.warn('[daily-brief] pre-generate commitment ceiling defense failed:', err);
      }

      let directive;
      try {
        directive = await generateDirective(userId, {
          skipSpendCap: options.skipSpendCap,
          skipManualCallLimit: options.skipManualCallLimit,
        });
      } catch (genErr: unknown) {
        const message = genErr instanceof Error ? genErr.message : String(genErr);
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'error',
          userId,
          artifactType: null,
          generationStatus: 'generation_failed',
          details: { scope: 'daily-generate', error: message },
        });
        results.push({
          code: 'generation_failed',
          detail: message,
          meta: cleanupMeta,
          success: false,
          userId,
        });
        continue;
      }

      if (directive.directive === '__GENERATION_FAILED__') {
        const savedNoSend = await persistNoSendOutcome(
          supabase, userId, directive, directive.reason, directive.generationLog?.stage ?? 'generation',
        );

        if (!savedNoSend) {
          logStructuredEvent({
            event: 'daily_generate_failed',
            level: 'error',
            userId,
            artifactType: null,
            generationStatus: 'persist_failed',
            details: { scope: 'daily-generate', error: 'Failed to persist no-send outcome.' },
          });
          results.push({
            code: 'directive_persist_failed',
            detail: 'Failed to persist no-send outcome.',
            meta: cleanupMeta,
            success: false,
            userId,
          });
          continue;
        }

        results.push({
          code: 'no_send_persisted',
          detail: directive.reason,
          meta: {
            ...cleanupMeta,
            action_id: savedNoSend.id,
            candidate_count: directive.generationLog?.candidateDiscovery?.candidateCount ?? 0,
            top_candidate_count: directive.generationLog?.candidateDiscovery?.topCandidates?.length ?? 0,
            ...extractThresholdValues(directive),
          },
          success: true,
          userId,
        });
        continue;
      }

      const candidateDiscoveryFailure = getCandidateDiscoveryFailureReason(
        directive.generationLog?.candidateDiscovery,
      );
      if (candidateDiscoveryFailure) {
        const savedNoSend = await persistNoSendOutcome(
          supabase,
          userId,
          buildSyntheticNoSendDirective(
            candidateDiscoveryFailure,
            'validation',
            directive.generationLog?.candidateDiscovery ?? null,
          ),
          candidateDiscoveryFailure,
          'validation',
        );
        if (!savedNoSend) {
          results.push({
            code: 'directive_persist_failed',
            detail: 'Failed to persist acceptance-gated no-send outcome.',
            meta: cleanupMeta,
            success: false,
            userId,
          });
          continue;
        }

        results.push({
          code: 'no_send_persisted',
          detail: candidateDiscoveryFailure,
          meta: {
            ...cleanupMeta,
            action_id: savedNoSend.id,
            candidate_count: directive.generationLog?.candidateDiscovery?.candidateCount ?? 0,
            top_candidate_count: directive.generationLog?.candidateDiscovery?.topCandidates?.length ?? 0,
            ...extractThresholdValues(directive),
          },
          success: true,
          userId,
        });
        continue;
      }

      let artifact = null;
      try {
        artifact = await generateArtifact(userId, directive);
      } catch (artErr: unknown) {
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'warn',
          userId,
          artifactType: artifactTypeForAction(directive.action_type),
          generationStatus: 'artifact_failed',
          details: {
            scope: 'daily-generate',
            error: artErr instanceof Error ? artErr.message : String(artErr),
          },
        });
      }

      if (!artifact) {
        const savedNoSend = await persistNoSendOutcome(supabase, userId, directive, 'Artifact generation failed.', 'artifact');
        if (!savedNoSend) {
          results.push({
            code: 'directive_persist_failed',
            detail: 'Failed to persist artifact-generation no-send outcome.',
            meta: cleanupMeta,
            success: false,
            userId,
          });
          continue;
        }
        results.push({
          code: 'no_send_persisted',
          detail: 'Artifact generation failed.',
          meta: {
            ...cleanupMeta,
            action_id: savedNoSend.id,
            candidate_count: directive.generationLog?.candidateDiscovery?.candidateCount ?? 0,
            top_candidate_count: directive.generationLog?.candidateDiscovery?.topCandidates?.length ?? 0,
            ...extractThresholdValues(directive),
          },
          success: true,
          userId,
        });
        continue;
      }

      const candidateType = directive.generationLog?.candidateDiscovery?.topCandidates?.[0]?.candidateType;
      const persistenceIssues = [
        ...getArtifactPersistenceIssues(directive.action_type, artifact, directive),
        ...validateDirectiveForPersistence({ userId, directive, artifact, candidateType }),
      ];
      if (persistenceIssues.length > 0) {
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'warn',
          userId,
          artifactType: artifactTypeForAction(directive.action_type),
          generationStatus: 'persistence_validation_failed',
          details: { scope: 'daily-generate', issues: persistenceIssues },
        });
        const savedNoSend = await persistNoSendOutcome(
          supabase,
          userId,
          directive,
          `Directive rejected by persistence validation: ${persistenceIssues.join('; ')}`,
          'validation',
        );
        if (!savedNoSend) {
          results.push({
            code: 'directive_persist_failed',
            detail: 'Failed to persist persistence-validation no-send outcome.',
            meta: cleanupMeta,
            success: false,
            userId,
          });
          continue;
        }
        results.push({
          code: 'no_send_persisted',
          detail: `Directive rejected by persistence validation: ${persistenceIssues.join('; ')}`,
          meta: {
            ...cleanupMeta,
            action_id: savedNoSend.id,
            candidate_count: directive.generationLog?.candidateDiscovery?.candidateCount ?? 0,
            top_candidate_count: directive.generationLog?.candidateDiscovery?.topCandidates?.length ?? 0,
            ...extractThresholdValues(directive),
          },
          success: true,
          userId,
        });
        continue;
      }

      // Post-generation quality gate — block outputs that are not worth sending.
      const sendWorthiness = isSendWorthy(directive, artifact, userEmails);
      if (!sendWorthiness.worthy) {
        // Build a receipt even for quality-gate blocks so the reason is visible
        const qualityGateReceipt = buildBlockedOutcomeReceipt(
          directive,
          artifact,
          { pass: false, blocked_reasons: [] }, // no bottom-gate reasons — quality gate is separate
        );
        qualityGateReceipt.persistence.blocked_reason = `quality_gate: ${sendWorthiness.reason}`;
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'warn',
          userId,
          artifactType: artifactTypeForAction(directive.action_type),
          generationStatus: 'quality_gate_failed',
          details: {
            scope: 'daily-generate',
            quality_gate_reason: sendWorthiness.reason,
            outcome_receipt: qualityGateReceipt,
          },
        });
        const savedNoSend = await persistNoSendOutcome(
          supabase,
          userId,
          directive,
          `Output blocked by quality gate: ${sendWorthiness.reason}`,
          'validation',
        );
        if (!savedNoSend) {
          results.push({
            code: 'directive_persist_failed',
            detail: 'Failed to persist quality-gate no-send outcome.',
            meta: cleanupMeta,
            success: false,
            userId,
          });
          continue;
        }
        results.push({
          code: 'no_send_persisted',
          detail: `Output blocked by quality gate: ${sendWorthiness.reason}`,
          meta: {
            ...cleanupMeta,
            action_id: savedNoSend.id,
            quality_gate_reason: sendWorthiness.reason,
            outcome_receipt: qualityGateReceipt,
            ...extractThresholdValues(directive),
          },
          success: true,
          userId,
        });
        continue;
      }

      // -----------------------------------------------------------------------
      // HARD BOTTOM GATE — blocks operationally empty / fortune-cookie winners
      // -----------------------------------------------------------------------
      const bottomGate = evaluateBottomGate(directive, artifact);
      if (!bottomGate.pass) {
        const blockDetail = `Hard bottom gate blocked: ${bottomGate.blocked_reasons.join(', ')}`;
        const blockedReceipt = buildBlockedOutcomeReceipt(directive, artifact, bottomGate);
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'warn',
          userId,
          artifactType: artifactTypeForAction(directive.action_type),
          generationStatus: 'bottom_gate_blocked',
          details: {
            scope: 'daily-generate',
            blocked_reasons: bottomGate.blocked_reasons,
            directive_text: directive.directive,
            action_type: directive.action_type,
            confidence: directive.confidence,
            outcome_receipt: blockedReceipt,
          },
        });
        const savedNoSend = await persistNoSendOutcome(
          supabase,
          userId,
          directive,
          blockDetail,
          'validation',
        );
        if (!savedNoSend) {
          results.push({
            code: 'directive_persist_failed',
            detail: 'Failed to persist bottom-gate no-send outcome.',
            meta: cleanupMeta,
            success: false,
            userId,
          });
          continue;
        }
        results.push({
          code: 'no_send_persisted',
          detail: blockDetail,
          meta: {
            ...cleanupMeta,
            action_id: savedNoSend.id,
            bottom_gate_blocked_reasons: bottomGate.blocked_reasons,
            outcome_receipt: blockedReceipt,
            ...extractThresholdValues(directive),
          },
          success: true,
          userId,
        });
        continue;
      }

      const directiveWithInspection = directive as ConvictionDirective & {
        acceptedCausalDiagnosis?: { mechanism: string; why_exists_now: string };
        causalDiagnosisSource?: string;
        winnerSelectionTrace?: {
          finalWinnerId: string;
          finalWinnerType: string;
          finalWinnerReason: string | null;
          scorerTopId: string;
          scorerTopType: string;
          scorerTopDisplacementReason: string | null;
        };
      };
      const inspectionMeta = {
        accepted_causal_diagnosis: directiveWithInspection.acceptedCausalDiagnosis ?? null,
        causal_diagnosis_source: directiveWithInspection.causalDiagnosisSource ?? null,
        winner_selection_trace: directiveWithInspection.winnerSelectionTrace ?? null,
      };

      // Build the outcome receipt — the single source of truth for "why did
      // this winner exist and why was it allowed to persist?"
      const outcomeReceipt = buildOutcomeReceipt(directive, artifact, bottomGate);

      const { data: saved, error: saveErr } = await supabase
        .from('tkg_actions')
        .insert({
          user_id: userId,
          action_type: directive.action_type,
          directive_text: directive.directive,
          reason: directive.reason,
          status: 'pending_approval',
          confidence: directive.confidence,
          evidence: directive.evidence,
          generated_at: new Date().toISOString(),
          generation_attempts: 1,
          artifact: artifact ?? null,
          execution_result: {
            ...buildDirectiveExecutionResult({
              directive,
              artifact,
              briefOrigin: 'daily_cron',
              extras: { inspection: inspectionMeta },
            }),
            approve: null,
            outcome_receipt: outcomeReceipt,
          },
        })
        .select('id')
        .single();

      if (saveErr || !saved?.id) {
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'error',
          userId,
          artifactType: artifactTypeForAction(directive.action_type),
          generationStatus: 'persist_failed',
          details: { scope: 'daily-generate', error: saveErr?.message ?? 'Missing inserted action id' },
        });
        results.push({
          code: 'directive_persist_failed',
          detail: saveErr?.message ?? 'Missing inserted action id',
          meta: cleanupMeta,
          success: false,
          userId,
        });
        continue;
      }

      try {
        await persistDirectiveHistorySignal({
          userId,
          actionId: saved.id,
          directiveText: directive.directive ?? '',
          actionType: directive.action_type,
          status: 'pending_approval',
        });
      } catch (feedErr: unknown) {
        const message = feedErr instanceof Error ? feedErr.message : String(feedErr);
        logStructuredEvent({
          event: 'daily_generate_directive_signal_failed',
          level: 'warn',
          userId,
          artifactType: artifactTypeForAction(directive.action_type),
          generationStatus: 'directive_signal_failed',
          details: { scope: 'daily-generate', error: message },
        });
      }

      results.push({
        code: 'pending_approval_persisted',
        meta: {
          ...cleanupMeta,
          action_id: saved.id,
          artifact_type: artifact.type,
          artifact_valid: true,
          candidate_count: directive.generationLog?.candidateDiscovery?.candidateCount ?? 0,
          top_candidate_count: directive.generationLog?.candidateDiscovery?.topCandidates?.length ?? 0,
          outcome_receipt: outcomeReceipt,
          ...extractThresholdValues(directive),
        },
        success: true,
        userId,
      });
      const artifactRecord = artifact as unknown as Record<string, unknown>;
      logStructuredEvent({
        event: 'daily_generate_complete',
        userId,
        artifactType: artifactTypeForAction(directive.action_type),
        generationStatus: 'generated',
        details: {
          scope: 'daily-generate',
          action_id: saved.id,
          ...extractThresholdValues(directive),
          evidence_count: directive.evidence?.length ?? 0,
          body_chars: typeof artifactRecord.body === 'string' ? artifactRecord.body.length : null,
          to_domain: typeof artifactRecord.to === 'string'
            ? (artifactRecord.to.split('@')[1] ?? null)
            : null,
          subject_length: typeof artifactRecord.subject === 'string' ? artifactRecord.subject.length : null,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      Sentry.captureException(err instanceof Error ? err : new Error(message));
      logStructuredEvent({
        event: 'daily_generate_failed',
        level: 'error',
        userId,
        artifactType: null,
        generationStatus: 'failed',
        details: { scope: 'daily-generate', error: message },
      });
      results.push({
        code: 'generation_failed',
        detail: message,
        success: false,
        userId,
      });
    }
  }

  return {
    ...buildRunResult(date, buildGenerateMessage(results, eligibleUserIds.length), results),
    signalProcessing: buildRunResult(
      date,
      buildSignalProcessingMessage(signalResults, eligibleUserIds.length),
      signalResults,
    ),
  };
}
