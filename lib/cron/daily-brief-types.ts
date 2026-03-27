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
