/**
 * Stage status/result formatting for the daily brief pipeline.
 * Owns: message builders, stage normalizer, response normalizer.
 */

import type {
  DailyBriefFailureCode,
  DailyBriefOrchestrationResult,
  DailyBriefRunResult,
  DailyBriefUserResult,
  SafeDailyBriefStageStatus,
} from './daily-brief-types';

export const SAFE_ERROR_MESSAGES: Record<DailyBriefFailureCode, string> = {
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

export function buildRunResult(date: string, message: string, results: DailyBriefUserResult[]): DailyBriefRunResult {
  return {
    date,
    message,
    results,
    succeeded: results.filter((r) => r.success).length,
    total: results.length,
  };
}

function formatEligibleUserCount(count: number): string {
  return `${count} eligible user${count === 1 ? '' : 's'}`;
}

function collectResultDetails(
  results: DailyBriefUserResult[],
  predicate: (r: DailyBriefUserResult) => boolean,
): string[] {
  return [
    ...new Set(
      results
        .filter(predicate)
        .map((r) => r.detail?.trim())
        .filter((d): d is string => Boolean(d)),
    ),
  ];
}

function appendBlockerSummary(message: string, details: string[]): string {
  if (details.length === 0) return message;
  return `${message} Blocker${details.length === 1 ? '' : 's'}: ${details.join(' ')}`;
}

export function buildSignalProcessingMessage(results: DailyBriefUserResult[], total: number): string {
  const caughtUpCount = results.filter(
    (r) => r.code === 'signals_caught_up' || r.code === 'no_unprocessed_signals',
  ).length;
  const backlogCount = results.filter((r) => r.code === 'stale_signal_backlog_remaining').length;
  const failedCount = results.filter((r) => r.code === 'signal_processing_failed').length;

  if (total === 0) {
    return 'Signal processing skipped because no eligible users were available.';
  }

  const segments = [`Signals were ready for ${caughtUpCount} of ${formatEligibleUserCount(total)}.`];
  if (backlogCount > 0) {
    segments.push(`Unprocessed signals older than 24 hours remained for ${backlogCount} user${backlogCount === 1 ? '' : 's'}.`);
  }
  if (failedCount > 0) {
    segments.push(`Signal processing failed for ${failedCount} user${failedCount === 1 ? '' : 's'}.`);
  }

  return appendBlockerSummary(
    segments.join(' '),
    collectResultDetails(results, (r) => r.code === 'stale_signal_backlog_remaining' || r.code === 'signal_processing_failed'),
  );
}

export function buildGenerateMessage(results: DailyBriefUserResult[], total: number): string {
  const generatedCount = results.filter(
    (r) =>
      r.code === 'pending_approval_persisted' ||
      r.code === 'pending_approval_reused' ||
      r.code === 'pipeline_dry_run',
  ).length;
  const noSendCount = results.filter(
    (r) => r.code === 'no_send_persisted' || r.code === 'no_send_reused',
  ).length;

  if (generatedCount === total) {
    return `A valid pending_approval action exists for ${generatedCount} eligible user${generatedCount === 1 ? '' : 's'}.`;
  }

  if (generatedCount === 0 && noSendCount === total) {
    return appendBlockerSummary(
      `No pending_approval brief was persisted for ${formatEligibleUserCount(total)}. Explicit no-send evidence was saved.`,
      collectResultDetails(results, (r) => r.code === 'no_send_persisted' || r.code === 'no_send_reused'),
    );
  }

  const segments = [`A valid pending_approval action exists for ${generatedCount} of ${formatEligibleUserCount(total)}.`];
  if (noSendCount > 0) {
    segments.push(`Explicit no-send evidence was saved for ${noSendCount} user${noSendCount === 1 ? '' : 's'}.`);
  }

  return appendBlockerSummary(
    segments.join(' '),
    collectResultDetails(results, (r) => r.code === 'no_send_persisted' || r.code === 'no_send_reused'),
  );
}

export function buildSendMessage(results: DailyBriefUserResult[], total: number): string {
  const sentCount = results.filter(
    (r) =>
      r.code === 'email_sent' ||
      r.code === 'email_already_sent' ||
      r.code === 'send_skipped_pipeline_dry_run',
  ).length;
  const blockedNoSendCount = results.filter((r) => r.code === 'no_send_blocker_persisted').length;
  const missingDirectiveCount = results.filter((r) => r.code === 'no_generated_directive').length;

  if (sentCount === total) {
    return `Sent briefs for ${sentCount} eligible user${sentCount === 1 ? '' : 's'}.`;
  }

  const segments = [`Sent briefs for ${sentCount} of ${formatEligibleUserCount(total)}.`];
  if (blockedNoSendCount > 0) {
    segments.push(`No brief email was sent for ${blockedNoSendCount} user${blockedNoSendCount === 1 ? '' : 's'} because an explicit no-send blocker was recorded.`);
  }
  if (missingDirectiveCount > 0) {
    segments.push(`No generated brief was available to send for ${missingDirectiveCount} user${missingDirectiveCount === 1 ? '' : 's'}.`);
  }

  return appendBlockerSummary(
    segments.join(' '),
    collectResultDetails(results, (r) => r.code === 'no_send_blocker_persisted' || r.code === 'no_generated_directive'),
  );
}

export function toSafeDailyBriefStageStatus(result: DailyBriefRunResult): SafeDailyBriefStageStatus {
  const attempted = result.total;
  const failed = result.results.filter((r) => !r.success).length;
  const errors = [
    ...new Set(
      result.results
        .filter((r): r is DailyBriefUserResult & { code: DailyBriefFailureCode } => !r.success)
        .map((r) => r.detail?.trim() || SAFE_ERROR_MESSAGES[r.code]),
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

export function getTriggerResponseStatus(
  signalProcessing: SafeDailyBriefStageStatus,
  generate: SafeDailyBriefStageStatus,
  send: SafeDailyBriefStageStatus,
): number {
  const statuses = [signalProcessing.status, generate.status, send.status];
  if (statuses.includes('failed')) return 500;
  if (statuses.includes('partial')) return 207;
  return 200;
}

/**
 * Normalize a DailyBriefOrchestrationResult into the canonical response shape
 * used by both the manual route and nightly cron.
 *
 * Pass sendOverride when the caller re-ran the send stage after runDailyBrief
 * (e.g. the manual send-fallback in run-brief).
 */
export function normalizeBriefResult(
  result: DailyBriefOrchestrationResult,
  sendOverride?: DailyBriefRunResult,
): {
  date: string;
  ok: boolean;
  signal_processing: SafeDailyBriefStageStatus & { results: DailyBriefUserResult[] };
  generate: SafeDailyBriefStageStatus & { results: DailyBriefUserResult[] };
  send: SafeDailyBriefStageStatus & { results: DailyBriefUserResult[] };
} {
  const sp = toSafeDailyBriefStageStatus(result.signal_processing);
  const gen = toSafeDailyBriefStageStatus(result.generate);
  const effectiveSend = sendOverride ?? result.send;
  const snd = toSafeDailyBriefStageStatus(effectiveSend);
  const ok =
    (sp.status === 'ok' || sp.status === 'skipped') &&
    (gen.status === 'ok' || gen.status === 'skipped') &&
    (snd.status === 'ok' || snd.status === 'skipped');

  return {
    date: result.date,
    ok,
    signal_processing: { ...sp, results: result.signal_processing.results },
    generate: { ...gen, results: result.generate.results },
    send: { ...snd, results: effectiveSend.results },
  };
}
