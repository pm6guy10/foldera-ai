/**
 * Type declarations for the daily brief pipeline.
 * No runtime code — pure types only.
 */

export type DailyBriefFailureCode =
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

export type DailyBriefSuccessCode =
  | 'signals_caught_up'
  | 'no_unprocessed_signals'
  | 'pending_approval_persisted'
  | 'pending_approval_reused'
  | 'pending_approval_guard'
  | 'generation_cycle_cooldown'
  | 'pipeline_dry_run'
  | 'send_skipped_pipeline_dry_run'
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
  /** When true, skip the stale-signal backlog gate so generation proceeds
   *  even when unprocessed signals remain.  Used for manual "Generate Now". */
  skipStaleGate?: boolean;
  /** When true, skip the daily API spend cap so manual runs are free to test. */
  skipSpendCap?: boolean;
  /** When true, skip manual directive call-count cap (owner brain-receipt only). */
  skipManualCallLimit?: boolean;
  /**
   * When true, manual/debug run (e.g. `?force=true`). Does **not** bypass pending reuse:
   * a valid `pending_approval` within STALE_PENDING_HOURS is still returned. Use after
   * approve/skip clears the queue to get a new generation pass.
   */
  forceFreshRun?: boolean;
  /** Caller label for structured logs (cron vs settings vs dev). Not a security boundary. */
  briefInvocationSource?: string;
  /**
   * When true (e.g. `POST .../run-brief?dry_run=true`): score + assemble prompt + synthetic artifact only;
   * no Anthropic calls, no DB persist of a new action, no email. Inspect `generate.results[].meta.pipeline_dry_run`.
   */
  pipelineDryRun?: boolean;
}

export interface SafeDailyBriefStageStatus {
  attempted: number;
  errors: string[];
  failed: number;
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  succeeded: number;
  summary: string;
}

/**
 * Pre-generation gate decision.
 *   SEND              — fresh signal activity detected; proceed to generateDirective()
 *   NO_SEND           — cooldown active; skip silently, no DB write
 *   INSUFFICIENT_SIGNAL — no new signals / processing error; persist skipped evidence, stay silent
 */
export type ReadinessDecision = 'SEND' | 'NO_SEND' | 'INSUFFICIENT_SIGNAL';

export interface ReadinessCheckResult {
  decision: ReadinessDecision;
  reason: string;
  stage: 'system';
}
