/**
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ THRESHOLD REFERENCE                                                │
 * │                                                                    │
 * │ Two independent scales gate whether a directive is sent:           │
 * │                                                                    │
 * │ 1. SCORER EV (lib/briefing/scorer.ts)                              │
 * │    Scale: 0–~5 (continuous). No production threshold — scorer      │
 * │    ranks candidates and the top one is selected regardless of      │
 * │    score. The "2.0" number only exists in the scorer benchmark     │
 * │    test file (scorer-benchmark.test.ts). A low EV score (< 1.0)   │
 * │    usually means no candidate is urgent enough to act on today.    │
 * │                                                                    │
 * │ 2. GENERATOR CONFIDENCE (lib/briefing/generator.ts)                │
 * │    Scale: 0–100 (LLM self-rated). Two gates:                      │
 * │    - DIRECTIVE_CONFIDENCE_THRESHOLD = 45 in generator.ts           │
 * │      Rejects at generation time if the LLM rates its own output   │
 * │      below 45/100.                                                 │
 * │    - CONFIDENCE_THRESHOLD = 70 in this file (line ~92)             │
 * │      Used in reconcilePendingApprovalQueue to auto-skip stale     │
 * │      actions with confidence < 70 before re-generation.            │
 * │                                                                    │
 * │ When debugging "no-send", check BOTH:                              │
 * │   scorer_ev   = top candidate score from scorer (EV scale)         │
 * │   confidence  = LLM self-rated confidence (0–100 scale)            │
 * │ They are independent — a high EV candidate can still fail the      │
 * │ confidence gate if the LLM is uncertain about its own output.      │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { createServerClient } from '@/lib/db/client';
import {
  buildDirectiveExecutionResult,
  generateDirective,
  validateDirectiveForPersistence,
} from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import {
  countUnprocessedSignals,
  processUnextractedSignals,
  resolveSignalBacklogMode,
} from '@/lib/signals/signal-processor';
import { summarizeSignals } from '@/lib/signals/summarizer';
import { sendDailyDirective, type HealthSummary } from '@/lib/email/resend';
import type { DirectiveItem } from '@/lib/email/resend';
import type {
  ConvictionArtifact,
  ConvictionDirective,
  GenerationCandidateDiscoveryLog,
  GenerationRunLog,
} from '@/lib/briefing/types';
import {
  filterDailyBriefEligibleUserIds,
  getVerifiedDailyBriefRecipientEmail,
} from '@/lib/auth/daily-brief-users';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { runCommitmentCeilingDefense } from '@/lib/cron/self-heal';

type DailyBriefFailureCode =
  | 'signal_processing_failed'
  | 'stale_signal_backlog_remaining'
  | 'generation_failed'
  | 'artifact_generation_failed'
  | 'directive_persist_failed'
  | 'no_verified_email'
  | 'directive_lookup_failed'
  | 'no_generated_directive'
  | 'email_send_failed'
  | 'status_update_failed';

type DailyBriefSuccessCode =
  | 'signals_caught_up'
  | 'no_unprocessed_signals'
  | 'pending_approval_persisted'
  | 'pending_approval_reused'
  | 'no_send_persisted'
  | 'no_send_reused'
  | 'email_sent'
  | 'email_already_sent'
  | 'no_send_blocker_persisted';

export interface DailyBriefUserResult {
  code: DailyBriefFailureCode | DailyBriefSuccessCode;
  detail?: string;
  meta?: Record<string, unknown>;
  success: boolean;
  userId?: string;
}

export interface DailyBriefRunResult {
  date: string;
  message: string;
  results: DailyBriefUserResult[];
  succeeded: number;
  total: number;
}

export interface DailyBriefGenerateRunResult extends DailyBriefRunResult {
  signalProcessing: DailyBriefRunResult;
}

export interface DailyBriefOrchestrationResult {
  date: string;
  generate: DailyBriefRunResult;
  ok: boolean;
  send: DailyBriefRunResult;
  signal_processing: DailyBriefRunResult;
}

export interface DailyBriefSignalWindowOptions {
  signalCreatedAtGte?: string;
  userIds?: string[];
}

export interface SafeDailyBriefStageStatus {
  attempted: number;
  errors: string[];
  failed: number;
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  succeeded: number;
  summary: string;
}

// Must match DIRECTIVE_CONFIDENCE_THRESHOLD in generator.ts (45).
// Previously was 70, which created zombie actions: actions persisted at confidence
// 45-69 were never reconciled (too low for the 70 threshold) but were sent by
// the send stage (which doesn't check confidence). Aligning prevents the gap.
const CONFIDENCE_THRESHOLD = 45;
const DAILY_SIGNAL_BATCH_SIZE = 5;

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
const DAILY_SIGNAL_PROCESSING_BUDGET_MS = 20_000;

const SAFE_ERROR_MESSAGES: Record<DailyBriefFailureCode, string> = {
  signal_processing_failed: 'Signal processing failed.',
  stale_signal_backlog_remaining: 'Unprocessed signals older than 24 hours remain.',
  generation_failed: 'Directive generation failed.',
  artifact_generation_failed: 'Artifact generation failed.',
  directive_persist_failed: 'Directive save failed.',
  no_verified_email: 'No verified recipient email was available.',
  directive_lookup_failed: 'Generated brief lookup failed.',
  no_generated_directive: 'No generated brief was available to send.',
  email_send_failed: 'Email delivery failed.',
  status_update_failed: 'Action status update failed.',
};

function formatEligibleUserCount(count: number): string {
  return `${count} eligible user${count === 1 ? '' : 's'}`;
}

function collectResultDetails(
  results: DailyBriefUserResult[],
  predicate: (result: DailyBriefUserResult) => boolean,
): string[] {
  return [
    ...new Set(
      results
        .filter(predicate)
        .map((result) => result.detail?.trim())
        .filter((detail): detail is string => Boolean(detail)),
    ),
  ];
}

function appendBlockerSummary(message: string, details: string[]): string {
  if (details.length === 0) {
    return message;
  }

  return `${message} Blocker${details.length === 1 ? '' : 's'}: ${details.join(' ')}`;
}

function todayStartIso(): string {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();
}

function buildRunResult(date: string, message: string, results: DailyBriefUserResult[]): DailyBriefRunResult {
  return {
    date,
    message,
    results,
    succeeded: results.filter((result) => result.success).length,
    total: results.length,
  };
}

function buildSignalProcessingMessage(results: DailyBriefUserResult[], total: number): string {
  const caughtUpCount = results.filter(
    (result) => result.code === 'signals_caught_up' || result.code === 'no_unprocessed_signals',
  ).length;
  const backlogCount = results.filter(
    (result) => result.code === 'stale_signal_backlog_remaining',
  ).length;
  const failedCount = results.filter((result) => result.code === 'signal_processing_failed').length;

  if (total === 0) {
    return 'Signal processing skipped because no eligible users were available.';
  }

  const segments = [`Signals were ready for ${caughtUpCount} of ${formatEligibleUserCount(total)}.`];
  if (backlogCount > 0) {
    segments.push(
      `Unprocessed signals older than 24 hours remained for ${backlogCount} user${backlogCount === 1 ? '' : 's'}.`,
    );
  }
  if (failedCount > 0) {
    segments.push(
      `Signal processing failed for ${failedCount} user${failedCount === 1 ? '' : 's'}.`,
    );
  }

  return appendBlockerSummary(
    segments.join(' '),
    collectResultDetails(
      results,
      (result) =>
        result.code === 'stale_signal_backlog_remaining' ||
        result.code === 'signal_processing_failed',
    ),
  );
}

function buildGenerateMessage(results: DailyBriefUserResult[], total: number): string {
  const generatedCount = results.filter(
    (result) =>
      result.code === 'pending_approval_persisted' || result.code === 'pending_approval_reused',
  ).length;
  const noSendCount = results.filter(
    (result) => result.code === 'no_send_persisted' || result.code === 'no_send_reused',
  ).length;

  if (generatedCount === total) {
    return `A valid pending_approval action exists for ${generatedCount} eligible user${generatedCount === 1 ? '' : 's'}.`;
  }

  if (generatedCount === 0 && noSendCount === total) {
    return appendBlockerSummary(
      `No pending_approval brief was persisted for ${formatEligibleUserCount(total)}. Explicit no-send evidence was saved.`,
      collectResultDetails(
        results,
        (result) => result.code === 'no_send_persisted' || result.code === 'no_send_reused',
      ),
    );
  }

  const segments = [
    `A valid pending_approval action exists for ${generatedCount} of ${formatEligibleUserCount(total)}.`,
  ];
  if (noSendCount > 0) {
    segments.push(
      `Explicit no-send evidence was saved for ${noSendCount} user${noSendCount === 1 ? '' : 's'}.`,
    );
  }

  return appendBlockerSummary(
    segments.join(' '),
    collectResultDetails(
      results,
      (result) => result.code === 'no_send_persisted' || result.code === 'no_send_reused',
    ),
  );
}

function buildSendMessage(results: DailyBriefUserResult[], total: number): string {
  const sentCount = results.filter(
    (result) => result.code === 'email_sent' || result.code === 'email_already_sent',
  ).length;
  const blockedNoSendCount = results.filter(
    (result) => result.code === 'no_send_blocker_persisted',
  ).length;
  const missingDirectiveCount = results.filter(
    (result) => result.code === 'no_generated_directive',
  ).length;

  if (sentCount === total) {
    return `Sent briefs for ${sentCount} eligible user${sentCount === 1 ? '' : 's'}.`;
  }

  const segments = [`Sent briefs for ${sentCount} of ${formatEligibleUserCount(total)}.`];
  if (blockedNoSendCount > 0) {
    segments.push(
      `No brief email was sent for ${blockedNoSendCount} user${blockedNoSendCount === 1 ? '' : 's'} because an explicit no-send blocker was recorded.`,
    );
  }
  if (missingDirectiveCount > 0) {
    segments.push(
      `No generated brief was available to send for ${missingDirectiveCount} user${missingDirectiveCount === 1 ? '' : 's'}.`,
    );
  }

  return appendBlockerSummary(
    segments.join(' '),
    collectResultDetails(
      results,
      (result) =>
        result.code === 'no_send_blocker_persisted' || result.code === 'no_generated_directive',
    ),
  );
}

function artifactTypeForAction(actionType: string | null | undefined): string | null {
  switch (actionType) {
    case 'send_message':
      return 'drafted_email';
    case 'make_decision':
      return 'decision_frame';
    case 'do_nothing':
      return 'wait_rationale';
    default:
      return null;
  }
}

function extractArtifact(executionResult: unknown): ConvictionArtifact | null {
  if (!executionResult || typeof executionResult !== 'object') {
    return null;
  }

  const artifact = (executionResult as Record<string, unknown>).artifact;
  if (!artifact || typeof artifact !== 'object') {
    return null;
  }

  return artifact as ConvictionArtifact;
}

function extractNoSendBlockerReason(record: {
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
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
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
        ? candidateDiscovery.topCandidates.map((candidate) =>
          candidate.decision === 'selected'
            ? `Selected candidate blocked: ${reason}`
            : candidate.decisionReason)
        : [reason],
      candidateDiscovery: candidateDiscovery
        ? {
          ...candidateDiscovery,
          failureReason: candidateDiscovery.failureReason ?? reason,
        }
        : null,
    },
  };
}

function extractSentAt(executionResult: unknown): string | null {
  if (!executionResult || typeof executionResult !== 'object') {
    return null;
  }

  const sentAt = (executionResult as Record<string, unknown>).daily_brief_sent_at;
  return typeof sentAt === 'string' && sentAt.trim().length > 0 ? sentAt : null;
}

function getCandidateDiscoveryFailureReason(
  candidateDiscovery: GenerationCandidateDiscoveryLog | null | undefined,
): string | null {
  if (!candidateDiscovery) {
    return 'Candidate discovery log missing from generation output.';
  }

  if (candidateDiscovery.candidateCount < 3 || candidateDiscovery.topCandidates.length < 3) {
    return 'Acceptance gate blocked send because fewer than 3 candidates were evaluated.';
  }

  if (candidateDiscovery.selectionMargin === null && !candidateDiscovery.selectionReason?.trim()) {
    return 'Acceptance gate blocked send because the selection margin or tie-break reason was not logged.';
  }

  return null;
}

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

  if (error) {
    throw error;
  }

  return count ?? 0;
}

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
): Promise<{
  error: Error | null;
  preservedAction: PendingActionRow | null;
  skippedActionIds: string[];
}> {
  const { data, error } = await supabase
    .from('tkg_actions')
    .select('id, generated_at, confidence, action_type, directive_text, reason, execution_result')
    .eq('user_id', userId)
    .eq('status', 'pending_approval')
    .order('generated_at', { ascending: false })
    .limit(20);

  if (error) {
    return { error, preservedAction: null, skippedActionIds: [] };
  }

  const rows = (data ?? []) as PendingActionRow[];
  let preservedAction: PendingActionRow | null = null;
  const skippedActionIds: string[] = [];

  for (const row of rows) {
    const artifact = extractArtifact(row.execution_result);
    const isToday = row.generated_at >= todayStart;
    const isValid =
      artifact !== null &&
      typeof row.confidence === 'number' &&
      row.confidence >= CONFIDENCE_THRESHOLD;

    if (!isToday || !isValid) {
      const executionResult =
        row.execution_result && typeof row.execution_result === 'object'
          ? (row.execution_result as Record<string, unknown>)
          : {};
      const suppressionReason = !isToday
        ? 'Auto-suppressed stale pending action before daily brief generation.'
        : 'Auto-suppressed invalid pending action before daily brief generation.';

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
        return { error: updateError, preservedAction: null, skippedActionIds };
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
      return { error: updateError, preservedAction: null, skippedActionIds };
    }

    skippedActionIds.push(row.id);
  }

  return {
    error: null,
    preservedAction,
    skippedActionIds,
  };
}

async function findPersistedNoSendBlocker(
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

  if (error) {
    return { error, id: null, reason: null };
  }

  const blocker = (data ?? []).find((candidate) => {
    const executionResult =
      candidate.execution_result && typeof candidate.execution_result === 'object'
        ? (candidate.execution_result as Record<string, unknown>)
        : null;
    return executionResult?.outcome_type === 'no_send';
  });

  if (!blocker) {
    return { error: null, id: null, reason: null };
  }

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
      ? candidateDiscovery.topCandidates.map((candidate) =>
        candidate.decision === 'selected'
          ? `Selected candidate blocked: ${reason}`
          : candidate.decisionReason)
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
      no_send: {
        reason,
        stage,
      },
    },
  });
}

/**
 * Build a human-readable wait_rationale summary from candidate discovery data.
 * This gets emailed — the morning email always arrives. Silence is a bug.
 */
function buildWaitRationale(
  directive: ConvictionDirective,
  reason: string,
): { directiveText: string; artifact: Record<string, unknown> } {
  const discovery = directive.generationLog?.candidateDiscovery;
  const candidateCount = discovery?.candidateCount ?? 0;
  const topCandidates = discovery?.topCandidates ?? [];

  // Build context: what was evaluated and why nothing was sent
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
    const blocked = candidate.decision === 'selected' ? ' [BLOCKED by constraint]' : '';
    contextParts.push(`• ${action} scored ${score}${goalText}${blocked}`);
  }
  if (contextParts.length === 0) {
    contextParts.push('No actionable candidates were found today.');
  }

  const context = contextParts.join('\n');
  const evidence = reason;

  const directiveText = candidateCount > 0
    ? `Nothing cleared the bar today — ${candidateCount} candidates evaluated, none ready to send.`
    : 'Nothing cleared the bar today.';

  return {
    directiveText,
    artifact: {
      type: 'wait_rationale',
      context,
      evidence,
      tripwires: topCandidates
        .filter((c) => c.decision === 'selected')
        .slice(0, 3)
        .map((c) => `Unblocked when: constraint on "${c.targetGoal?.text?.slice(0, 60) ?? 'unknown'}" is lifted`),
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

  // Persist as pending_approval do_nothing so the send stage emails it.
  // The morning email always arrives. Silence is a bug.
  // Uses do_nothing action_type (constraint-safe) with wait_rationale artifact.
  const { data, error } = await supabase
    .from('tkg_actions')
    .insert({
      user_id: userId,
      action_type: 'do_nothing',
      directive_text: waitRationale.directiveText,
      reason,
      status: 'pending_approval',
      confidence: 45,
      evidence: directive.evidence,
      generated_at: new Date().toISOString(),
      generation_attempts: 1,
      artifact: waitRationale.artifact,
      execution_result: {
        ...executionResult,
        artifact: waitRationale.artifact,
      },
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    return null;
  }

  return { id: data.id };
}

async function resolveDailyBriefUserIds(explicitUserIds?: string[]): Promise<string[]> {
  const uniqueExplicitUserIds = [...new Set((explicitUserIds ?? []).filter(Boolean))];
  if (uniqueExplicitUserIds.length > 0) {
    return uniqueExplicitUserIds;
  }

  return getEligibleDailyBriefUserIds();
}

async function getEligibleDailyBriefUserIds(): Promise<string[]> {
  const supabase = createServerClient();
  const { data: entities, error } = await supabase
    .from('tkg_entities')
    .select('user_id')
    .eq('name', 'self');

  if (error) {
    throw error;
  }

  const userIds = [...new Set((entities ?? []).map((entity: { user_id: string }) => entity.user_id))];
  if (userIds.length === 0) {
    return [];
  }

  return filterDailyBriefEligibleUserIds(userIds, supabase);
}

async function runSignalProcessingForUser(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  options: DailyBriefSignalWindowOptions = {},
): Promise<DailyBriefUserResult> {
  const staleCutoffIso = isoHoursAgo(24);
  const deadline = Date.now() + DAILY_SIGNAL_PROCESSING_BUDGET_MS;

  try {
    const staleBefore = await countUnprocessedSignalsOlderThan(
      supabase,
      userId,
      staleCutoffIso,
      options,
    );
    const totalBeforeAllSources = await countUnprocessedSignals(userId, {
      createdAtGte: options.signalCreatedAtGte,
      includeAllSources: true,
    });
    const totalBefore = await countUnprocessedSignals(userId, {
      createdAtGte: options.signalCreatedAtGte,
    });
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
      for (const signalId of extraction.deferred_signal_ids ?? []) {
        deferredSignalIds.add(signalId);
      }
      for (const error of extraction.errors ?? []) {
        errors.push(error);
      }

      staleAfter = await countUnprocessedSignalsOlderThan(
        supabase,
        userId,
        staleCutoffIso,
        options,
      );
      totalAfter = await countUnprocessedSignals(userId, {
        createdAtGte: options.signalCreatedAtGte,
      });

      if (extraction.signals_processed === 0) {
        break;
      }

      if (staleAfter === 0 && totalAfter === 0) {
        break;
      }
    }

    try {
      summariesCreated = await summarizeSignals(userId);
      if (summariesCreated > 0) {
        logStructuredEvent({
          event: 'daily_generate_summary',
          userId,
          artifactType: null,
          generationStatus: 'summary_complete',
          details: {
            scope: 'daily-brief',
            summaries_created: summariesCreated,
          },
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

    // 1-9 stale signals do not block generation. Combined with decrypt quarantine
    // (Fix 1), undecryptable signals are immediately marked processed so this
    // guard will rarely trigger. Previously any single stale signal blocked everything.
    if (staleAfter >= 10) {
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
        meta: {
          ...meta,
          errors,
        },
        success: false,
        userId,
      };
    }

    return {
      code: totalBefore === 0 ? 'no_unprocessed_signals' : 'signals_caught_up',
      meta: {
        ...meta,
        errors,
      },
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

  if (expireError) {
    throw expireError;
  }

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

  for (const userId of eligibleUserIds) {
    const signalResult = await runSignalProcessingForUser(supabase, userId, options);
    signalResults.push(signalResult);

    try {
      const pendingQueue = await reconcilePendingApprovalQueue(supabase, userId, todayStart);
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

      // NOTE: We intentionally do NOT check for a persisted no_send blocker here.
      // Previous failed generations should not prevent retries — the LLM is
      // nondeterministic and fresh signals may have been processed since the last
      // attempt. The send path still checks for no_send blockers to avoid sending
      // a brief that was explicitly blocked.

      if (!signalResult.success) {
        const preconditionReason =
          signalResult.detail?.trim() ||
          SAFE_ERROR_MESSAGES[signalResult.code as DailyBriefFailureCode];
        const savedNoSend = await persistNoSendOutcome(
          supabase,
          userId,
          buildSyntheticNoSendDirective(preconditionReason, 'system'),
          preconditionReason,
          'system',
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
          detail: preconditionReason,
          meta: {
            ...cleanupMeta,
            action_id: savedNoSend.id,
          },
          success: true,
          userId,
        });
        continue;
      }

      // Run ceiling defense immediately before scoring so the scorer sees <=150 commitments
      // even if signal processing just extracted new ones during this run
      try {
        await runCommitmentCeilingDefense();
      } catch (err) {
        console.warn('[daily-brief] pre-generate commitment ceiling defense failed:', err);
      }

      let directive;
      try {
        directive = await generateDirective(userId);
      } catch (genErr: unknown) {
        const message = genErr instanceof Error ? genErr.message : String(genErr);
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'error',
          userId,
          artifactType: null,
          generationStatus: 'generation_failed',
          details: {
            scope: 'daily-generate',
            error: message,
          },
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
          supabase,
          userId,
          directive,
          directive.reason,
          directive.generationLog?.stage ?? 'generation',
        );

        if (!savedNoSend) {
          logStructuredEvent({
            event: 'daily_generate_failed',
            level: 'error',
            userId,
            artifactType: null,
            generationStatus: 'persist_failed',
            details: {
              scope: 'daily-generate',
              error: 'Failed to persist no-send outcome.',
            },
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
            top_candidate_count: directive.generationLog?.candidateDiscovery?.topCandidates.length ?? 0,
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
            top_candidate_count: directive.generationLog?.candidateDiscovery?.topCandidates.length ?? 0,
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
        const savedNoSend = await persistNoSendOutcome(
          supabase,
          userId,
          directive,
          'Artifact generation failed.',
          'artifact',
        );
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
            top_candidate_count: directive.generationLog?.candidateDiscovery?.topCandidates.length ?? 0,
            ...extractThresholdValues(directive),
          },
          success: true,
          userId,
        });
        continue;
      }

      const persistenceIssues = validateDirectiveForPersistence({
        userId,
        directive,
        artifact,
      });
      if (persistenceIssues.length > 0) {
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'warn',
          userId,
          artifactType: artifactTypeForAction(directive.action_type),
          generationStatus: 'persistence_validation_failed',
          details: {
            scope: 'daily-generate',
            issues: persistenceIssues,
          },
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
            top_candidate_count: directive.generationLog?.candidateDiscovery?.topCandidates.length ?? 0,
            ...extractThresholdValues(directive),
          },
          success: true,
          userId,
        });
        continue;
      }

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
          execution_result: buildDirectiveExecutionResult({
            directive,
            artifact,
            briefOrigin: 'daily_cron',
          }),
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
          details: {
            scope: 'daily-generate',
            error: saveErr?.message ?? 'Missing inserted action id',
          },
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
        const feedText = [
          `[Foldera Directive — ${date}]`,
          `Action: ${directive.action_type}`,
          `Directive: ${directive.directive}`,
        ].join('\n');
        await extractFromConversation(feedText, userId);
      } catch (feedErr: unknown) {
        const message = feedErr instanceof Error ? feedErr.message : String(feedErr);
        if (!message.includes('already ingested')) {
          logStructuredEvent({
            event: 'daily_generate_self_feed_failed',
            level: 'warn',
            userId,
            artifactType: artifactTypeForAction(directive.action_type),
            generationStatus: 'self_feed_failed',
            details: {
              scope: 'daily-generate',
              error: message,
            },
          });
        }
      }

      results.push({
        code: 'pending_approval_persisted',
        meta: {
          ...cleanupMeta,
          action_id: saved.id,
          artifact_type: artifact.type,
          artifact_valid: true,
          candidate_count: directive.generationLog?.candidateDiscovery?.candidateCount ?? 0,
          top_candidate_count: directive.generationLog?.candidateDiscovery?.topCandidates.length ?? 0,
          ...extractThresholdValues(directive),
        },
        success: true,
        userId,
      });
      logStructuredEvent({
        event: 'daily_generate_complete',
        userId,
        artifactType: artifactTypeForAction(directive.action_type),
        generationStatus: 'generated',
        details: {
          scope: 'daily-generate',
          action_id: saved.id,
          ...extractThresholdValues(directive),
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logStructuredEvent({
        event: 'daily_generate_failed',
        level: 'error',
        userId,
        artifactType: null,
        generationStatus: 'failed',
        details: {
          scope: 'daily-generate',
          error: message,
        },
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

export async function runDailySend(
  options: DailyBriefSignalWindowOptions = {},
): Promise<DailyBriefRunResult> {
  const supabase = createServerClient();
  const date = new Date().toISOString().slice(0, 10);
  const todayStart = todayStartIso();

  const eligibleUserIds = await resolveDailyBriefUserIds(options.userIds);
  if (eligibleUserIds.length === 0) {
    return buildRunResult(date, 'No eligible users.', []);
  }

  const results: DailyBriefUserResult[] = [];

  for (const userId of eligibleUserIds) {
    try {
      const to = await getVerifiedDailyBriefRecipientEmail(userId, supabase);
      if (!to) {
        results.push({ code: 'no_verified_email', success: false, userId });
        continue;
      }

      const { data: actions, error: actionsError } = await supabase
        .from('tkg_actions')
        .select('id, action_type, directive_text, reason, confidence, execution_result, generated_at')
        .eq('user_id', userId)
        .eq('status', 'pending_approval')
        .gte('generated_at', todayStart)
        .order('confidence', { ascending: false })
        .limit(10);

      if (actionsError) {
        results.push({
          code: 'directive_lookup_failed',
          detail: actionsError.message,
          success: false,
          userId,
        });
        continue;
      }

      const action = actions?.find((candidate) => {
        const executionResult =
          candidate.execution_result && typeof candidate.execution_result === 'object'
            ? (candidate.execution_result as Record<string, unknown>)
            : null;
        const artifact = extractArtifact(executionResult);

        return artifact !== null;
      });
      if (!action) {
        const noSendBlocker = await findPersistedNoSendBlocker(
          supabase,
          userId,
          todayStart,
        );
        if (noSendBlocker.error) {
          results.push({
            code: 'directive_lookup_failed',
            detail: noSendBlocker.error.message,
            success: false,
            userId,
          });
          continue;
        }
        if (noSendBlocker.id) {
          results.push({
            code: 'no_send_blocker_persisted',
            detail: noSendBlocker.reason ?? 'A no-send blocker was already persisted for today.',
            meta: {
              action_id: noSendBlocker.id,
            },
            success: true,
            userId,
          });
          continue;
        }

        results.push({ code: 'no_generated_directive', success: false, userId });
        continue;
      }

      const executionResult =
        action.execution_result && typeof action.execution_result === 'object'
          ? (action.execution_result as Record<string, unknown>)
          : {};
      const sentAt = extractSentAt(executionResult);
      if (sentAt) {
        results.push({
          code: 'email_already_sent',
          meta: {
            action_id: action.id,
            daily_brief_sent_at: sentAt,
          },
          success: true,
          userId,
        });
        continue;
      }

      const directiveItem: DirectiveItem = {
        id: action.id,
        directive: action.directive_text as string,
        action_type: action.action_type as string,
        confidence: (action.confidence as number) ?? 0,
        reason: ((action.reason as string) ?? '').split('[score=')[0].trim(),
        artifact: extractArtifact(action.execution_result),
      };

      const words = directiveItem.directive.split(/\s+/).slice(0, 6).join(' ');
      const subject = `Foldera: ${words.length > 50 ? `${words.slice(0, 47)}...` : words}`;

      // Gather health summary for email footer
      let healthSummary: HealthSummary | undefined;
      try {
        const [signalRes, commitRes, goalRes, syncRes] = await Promise.all([
          supabase.from('tkg_signals').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('processed', true),
          supabase.from('tkg_commitments').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('suppressed_at', null),
          supabase.from('tkg_goals').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('priority', 3),
          supabase.from('user_tokens').select('last_synced_at').eq('user_id', userId).order('last_synced_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        healthSummary = {
          signalCount: signalRes.count ?? 0,
          commitmentCount: commitRes.count ?? 0,
          goalCount: goalRes.count ?? 0,
          lastSyncTime: (syncRes.data?.last_synced_at as string) ?? null,
          gateStatus: 'OK',
        };
      } catch {
        // Non-fatal — send without health summary
      }

      let delivery: unknown;
      try {
        delivery = await sendDailyDirective({ to, directives: [directiveItem], date, subject, userId, healthSummary });
      } catch (sendErr: unknown) {
        logStructuredEvent({
          event: 'daily_send_failed',
          level: 'error',
          userId,
          artifactType: artifactTypeForAction(action.action_type as string | null | undefined),
          generationStatus: 'failed',
          details: {
            scope: 'daily-send',
            error: sendErr instanceof Error ? sendErr.message : String(sendErr),
          },
        });
        results.push({
          code: 'email_send_failed',
          detail: sendErr instanceof Error ? sendErr.message : String(sendErr),
          success: false,
          userId,
        });
        continue;
      }

      const { error: updateError } = await supabase
        .from('tkg_actions')
        .update({
          execution_result: {
            ...executionResult,
            daily_brief_sent_at: new Date().toISOString(),
          },
        })
        .eq('id', action.id);

      if (updateError) {
        results.push({
          code: 'status_update_failed',
          detail: updateError.message,
          success: false,
          userId,
        });
        continue;
      }

      const deliveryId =
        delivery &&
        typeof delivery === 'object' &&
        'data' in (delivery as Record<string, unknown>) &&
        typeof (delivery as { data?: { id?: unknown } }).data?.id === 'string'
          ? ((delivery as { data?: { id?: string } }).data?.id ?? null)
          : null;

      results.push({
        code: 'email_sent',
        meta: {
          action_id: action.id,
          artifact_type: directiveItem.artifact?.type ?? null,
          resend_id: deliveryId,
        },
        success: true,
        userId,
      });
      logStructuredEvent({
        event: 'daily_send_complete',
        userId,
        artifactType: artifactTypeForAction(action.action_type as string | null | undefined),
        generationStatus: 'sent',
        details: {
          scope: 'daily-send',
          action_id: action.id,
        },
      });
    } catch (err: unknown) {
      logStructuredEvent({
        event: 'daily_send_failed',
        level: 'error',
        userId,
        artifactType: null,
        generationStatus: 'failed',
        details: {
          scope: 'daily-send',
          error: err instanceof Error ? err.message : String(err),
        },
      });
      results.push({
        code: 'email_send_failed',
        detail: err instanceof Error ? err.message : String(err),
        success: false,
        userId,
      });
    }
  }

  return buildRunResult(date, buildSendMessage(results, eligibleUserIds.length), results);
}

export async function runDailyBrief(
  options: DailyBriefSignalWindowOptions = {},
): Promise<DailyBriefOrchestrationResult> {
  const generate = await runDailyGenerate(options);
  const send = await runDailySend(options);
  const signalProcessing = generate.signalProcessing;
  const ok =
    (toSafeDailyBriefStageStatus(signalProcessing).status === 'ok' ||
      toSafeDailyBriefStageStatus(signalProcessing).status === 'skipped') &&
    (toSafeDailyBriefStageStatus(generate).status === 'ok' ||
      toSafeDailyBriefStageStatus(generate).status === 'skipped') &&
    (toSafeDailyBriefStageStatus(send).status === 'ok' ||
      toSafeDailyBriefStageStatus(send).status === 'skipped');

  return {
    date: generate.date,
    generate,
    ok,
    send,
    signal_processing: signalProcessing,
  };
}

export function toSafeDailyBriefStageStatus(result: DailyBriefRunResult): SafeDailyBriefStageStatus {
  const attempted = result.total;
  const failed = result.results.filter((entry) => !entry.success).length;
  const errors = [
    ...new Set(
      result.results
        .filter((entry): entry is DailyBriefUserResult & { code: DailyBriefFailureCode } => !entry.success)
        .map((entry) => entry.detail?.trim() || SAFE_ERROR_MESSAGES[entry.code]),
    ),
  ];

  let status: SafeDailyBriefStageStatus['status'] = 'ok';
  if (attempted === 0) {
    status = 'skipped';
  } else if (failed === attempted) {
    status = 'failed';
  } else if (failed > 0) {
    status = 'partial';
  }

  return {
    attempted,
    errors,
    failed,
    status,
    succeeded: result.succeeded,
    summary: result.message,
  };
}

/**
 * Passive rejection: auto-skip any pending_approval actions older than 36 hours.
 * Clears the queue AND feeds the feedback loop — these count as skips.
 */
export async function autoSkipStaleApprovals(): Promise<{ skipped: number }> {
  const supabase = createServerClient();
  const thirtySixHoursAgo = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

  try {
    const { data: staleActions } = await supabase
      .from('tkg_actions')
      .select('id')
      .eq('status', 'pending_approval')
      .lt('generated_at', thirtySixHoursAgo)
      .limit(50);

    if (!staleActions || staleActions.length === 0) {
      return { skipped: 0 };
    }

    const ids = staleActions.map((a) => a.id as string);
    const { error } = await supabase
      .from('tkg_actions')
      .update({
        status: 'skipped',
        skip_reason: 'passive_timeout',
      })
      .in('id', ids);

    if (error) {
      console.error('[auto-skip] Failed to update stale approvals:', error.message);
      return { skipped: 0 };
    }

    logStructuredEvent({
      event: 'passive_timeout_skip',
      level: 'info',
      userId: null,
      artifactType: null,
      generationStatus: 'auto_skipped',
      details: { count: ids.length },
    });

    return { skipped: ids.length };
  } catch (err) {
    console.error('[auto-skip] Error:', err instanceof Error ? err.message : String(err));
    return { skipped: 0 };
  }
}

export function getTriggerResponseStatus(
  signalProcessing: SafeDailyBriefStageStatus,
  generate: SafeDailyBriefStageStatus,
  send: SafeDailyBriefStageStatus,
): number {
  const statuses = [signalProcessing.status, generate.status, send.status];
  if (statuses.includes('failed')) {
    return 500;
  }
  if (statuses.includes('partial')) {
    return 207;
  }
  return 200;
}
