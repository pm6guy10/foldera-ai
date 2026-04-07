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
 * │    - CONFIDENCE_THRESHOLD = 70 in daily-brief-generate.ts         │
 * │      Used in reconcilePendingApprovalQueue to auto-skip stale     │
 * │      actions with confidence < 70 before re-generation.            │
 * │                                                                    │
 * │ When debugging "no-send", check BOTH:                              │
 * │   scorer_ev   = top candidate score from scorer (EV scale)         │
 * │   confidence  = LLM self-rated confidence (0–100 scale)            │
 * │ They are independent — a high EV candidate can still fail the      │
 * │ confidence gate if the LLM is uncertain about its own output.      │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Thin façade / compatibility entrypoint.
 *
 * Business logic lives in:
 *   lib/cron/daily-brief-types.ts      — types
 *   lib/cron/daily-brief-status.ts     — stage formatting, normalizeBriefResult
 *   lib/cron/daily-brief-generate.ts   — generate stage + all helpers
 *   lib/cron/daily-brief-send.ts       — send stage
 *   lib/cron/brief-service.ts          — runBriefLifecycle (single authority)
 *
 * External consumers import from this file; internal modules import
 * directly from the sub-modules above.
 */

import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/db/client';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { buildRunResult, toSafeDailyBriefStageStatus } from './daily-brief-status';
import { runDailyGenerate } from './daily-brief-generate';
import { runDailySend } from './daily-brief-send';

// Re-export all types
export type {
  DailyBriefFailureCode,
  DailyBriefGenerateRunResult,
  DailyBriefOrchestrationResult,
  DailyBriefRunResult,
  DailyBriefSignalWindowOptions,
  DailyBriefSuccessCode,
  DailyBriefUserResult,
  SafeDailyBriefStageStatus,
} from './daily-brief-types';

// Re-export formatting / normalization
export {
  getTriggerResponseStatus,
  normalizeBriefResult,
  toSafeDailyBriefStageStatus,
} from './daily-brief-status';

// Re-export stage functions (consumed by daily-generate/route.ts, daily-send/route.ts, etc.)
export { runDailyGenerate } from './daily-brief-generate';
export { runDailySend } from './daily-brief-send';

import type { DailyBriefOrchestrationResult, DailyBriefSignalWindowOptions } from './daily-brief-types';

// ---------------------------------------------------------------------------
// runDailyBrief — core orchestration (generate + send)
// Used by: brief-service.ts (primary), trigger/route.ts, app/api/cron/daily-brief/route.ts
// ---------------------------------------------------------------------------

export async function runDailyBrief(
  options: DailyBriefSignalWindowOptions = {},
): Promise<DailyBriefOrchestrationResult> {
  const cronInvocationId = options.cronInvocationId ?? randomUUID();
  const merged: DailyBriefSignalWindowOptions = { ...options, cronInvocationId };

  const generate = await runDailyGenerate(merged);
  const date = generate.date;
  const send = merged.pipelineDryRun
    ? buildRunResult(
        date,
        'Send skipped (pipeline dry run — no email, no new action row).',
        (merged.userIds ?? []).map((userId) => ({
          code: 'send_skipped_pipeline_dry_run' as const,
          success: true,
          userId,
          detail: 'pipelineDryRun: send stage not executed',
        })),
      )
    : await runDailySend(merged);
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

// ---------------------------------------------------------------------------
// autoSkipStaleApprovals — passive rejection (used by nightly-ops Stage 3)
// ---------------------------------------------------------------------------

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

    if (!staleActions || staleActions.length === 0) return { skipped: 0 };

    const ids = staleActions.map((a) => a.id as string);
    const { error } = await supabase
      .from('tkg_actions')
      .update({ status: 'skipped', skip_reason: 'passive_timeout' })
      .in('id', ids);

    if (error) {
      console.error('[auto-skip] Failed to update stale approvals:', error.message);
      return { skipped: 0 };
    }

    const { updateMlSnapshotOutcome } = await import('@/lib/ml/directive-ml-snapshot');
    for (const id of ids) {
      void updateMlSnapshotOutcome(supabase, { actionId: id, outcomeLabel: 'skipped' });
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
