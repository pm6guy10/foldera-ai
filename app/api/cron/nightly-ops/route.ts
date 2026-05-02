/**
 * GET /api/cron/nightly-ops
 *
 * Nightly ingest/sync stage for the orchestrated morning cron pipeline:
 *   token refresh, commitment ceiling, Microsoft/Google sync, connector health,
 *   signal processing, passive rejection.
 *
 * Scheduled production invocations now arrive through /api/cron/morning-pipeline,
 * which calls this route first and then runs daily-brief and daily-maintenance.
 * This route remains callable directly for manual/operator use.
 *
 * Auth: CRON_SECRET Bearer token.
 * Scheduled via /api/cron/morning-pipeline at 0 11 * * * (4am PT / 11:00 UTC)
 */

import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { getAllUsersWithProvider } from '@/lib/auth/user-tokens';
import { createServerClient } from '@/lib/db/client';
import {
  countUnprocessedSignals,
  HIGH_BACKLOG_MAX_SIGNAL_ROUNDS,
  HIGH_BACKLOG_SIGNAL_BATCH_SIZE,
  LOW_BACKLOG_MAX_SIGNAL_ROUNDS,
  LOW_BACKLOG_SIGNAL_BATCH_SIZE,
  listUsersWithUnprocessedSignals,
  processUnextractedSignals,
  resolveSignalBacklogMode,
} from '@/lib/signals/signal-processor';
import { autoSkipStaleApprovals } from '@/lib/cron/daily-brief';
import { runCommitmentCeilingDefense } from '@/lib/cron/self-heal';
import { checkConnectorHealth } from '@/lib/cron/connector-health';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { TEST_USER_ID, NIGHTLY_OPS_SIGNAL_BATCH_MULTIPLIER } from '@/lib/config/constants';
import { logApiBudgetStatusToSystemHealth } from '@/lib/cron/api-budget';
import { computeAndPersistHealthVerdict } from '@/lib/cron/health-verdict';
import { insertPipelineCronPhase } from '@/lib/observability/pipeline-run';
import { NIGHTLY_OPS_INGEST_STAGE_ORDER } from './contract';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STALE_SIGNAL_RESET_BACKLOG_THRESHOLD = 200;
const STALE_CUTOFF_HOURS = 24;

// ---------------------------------------------------------------------------
// Stage 1: Microsoft sync (all users)
// ---------------------------------------------------------------------------
interface SyncResult {
  ok: boolean;
  users: number;
  succeeded: number;
  failed: number;
  error?: string;
}

async function stageSyncMicrosoft(): Promise<SyncResult> {
  const userIds = (await getAllUsersWithProvider('microsoft')).filter((id) => id !== TEST_USER_ID);
  if (userIds.length === 0) {
    return { ok: true, users: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  const { syncMicrosoft } = await import('@/lib/sync/microsoft-sync');
  for (const userId of userIds) {
    try {
      const result = await syncMicrosoft(userId);
      if (result.error) failed++;
      else succeeded++;
    } catch (err: any) {
      Sentry.captureException(err);
      console.error(
        JSON.stringify({ event: 'nightly_ops_sync_error', userId, error: err.message }),
      );
      failed++;
    }
  }

  return { ok: failed === 0, users: userIds.length, succeeded, failed };
}

// ---------------------------------------------------------------------------
// Stage 1b: Google sync (all users)
// ---------------------------------------------------------------------------

async function stageSyncGoogle(): Promise<SyncResult> {
  const userIds = (await getAllUsersWithProvider('google')).filter((id) => id !== TEST_USER_ID);
  if (userIds.length === 0) {
    return { ok: true, users: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  const { syncGoogle } = await import('@/lib/sync/google-sync');
  for (const userId of userIds) {
    try {
      const result = await syncGoogle(userId);
      if (result.error) failed++;
      else succeeded++;
    } catch (err: any) {
      Sentry.captureException(err);
      console.error(
        JSON.stringify({ event: 'nightly_ops_sync_error', provider: 'google', userId, error: err.message }),
      );
      failed++;
    }
  }

  return { ok: failed === 0, users: userIds.length, succeeded, failed };
}

// ---------------------------------------------------------------------------
// Stage 2: Signal processing (up to 3 rounds of 50)
// ---------------------------------------------------------------------------
interface SignalProcessingResult {
  ok: boolean;
  rounds: number;
  total_processed: number;
  remaining: number;
  reset_stale_signals?: number;
  error?: string;
}

async function countNightlyOpsUnprocessedSignals(): Promise<number> {
  const userIds = (await listUsersWithUnprocessedSignals({ includeAllSources: true }))
    .filter((id) => id !== TEST_USER_ID);
  let totalUnprocessed = 0;

  for (const userId of userIds) {
    totalUnprocessed += await countUnprocessedSignals(userId, { includeAllSources: true });
  }

  return totalUnprocessed;
}

async function resetStaleSignalsForReprocessing(totalUnprocessed: number): Promise<number> {
  // Always reset at least 10 stale signals per run regardless of backlog.
  // Previously, high-backlog periods completely skipped stale resets, causing
  // stale signals to become permanently stranded after the backlog cleared.
  const resetLimit = Math.max(10, Math.min(50, STALE_SIGNAL_RESET_BACKLOG_THRESHOLD - totalUnprocessed));

  const supabase = createServerClient();
  const { data: staleSignals, error } = await supabase
    .from('tkg_signals')
    .select('id')
    .eq('processed', true)
    .is('extracted_entities', null)
    .limit(resetLimit);

  if (error) {
    throw error;
  }

  const staleIds = (staleSignals ?? []).map((signal) => signal.id as string);
  if (staleIds.length === 0) {
    console.log('[nightly-ops] Reset 0 stale signals for reprocessing');
    return 0;
  }

  const { error: updateError } = await supabase
    .from('tkg_signals')
    .update({
      processed: false,
      updated_at: new Date().toISOString(),
    })
    .in('id', staleIds);

  if (updateError) {
    throw updateError;
  }

  console.log(`[nightly-ops] Reset ${staleIds.length} stale signals for reprocessing`);
  return staleIds.length;
}

async function stageProcessSignals(): Promise<SignalProcessingResult> {
  const staleCutoffIso = new Date(
    Date.now() - STALE_CUTOFF_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const totalUnprocessedBeforeReset = await countNightlyOpsUnprocessedSignals();
  const resetStaleSignals = await resetStaleSignalsForReprocessing(totalUnprocessedBeforeReset);
  const totalUnprocessed = resetStaleSignals > 0
    ? await countNightlyOpsUnprocessedSignals()
    : totalUnprocessedBeforeReset;
  const userIdsWithBacklog = (await listUsersWithUnprocessedSignals({})).filter((id) => id !== TEST_USER_ID);
  const baseBacklogMode = resolveSignalBacklogMode(totalUnprocessed);
  const backlogMode = {
    ...baseBacklogMode,
    maxSignals: Math.ceil(baseBacklogMode.maxSignals * NIGHTLY_OPS_SIGNAL_BATCH_MULTIPLIER),
  };

  logStructuredEvent({
    event: 'nightly_ops_signal_mode',
    userId: null,
    artifactType: null,
    generationStatus: 'mode_selected',
    details: {
      scope: 'nightly-ops',
      nightly_ops_signal_mode: backlogMode.mode,
      unprocessed_signals: totalUnprocessed,
      unprocessed_signals_before_reset: totalUnprocessedBeforeReset,
      reset_stale_signals: resetStaleSignals,
      signal_batch_size: backlogMode.maxSignals,
      signal_batch_size_base: baseBacklogMode.maxSignals,
      nightly_ops_signal_batch_multiplier: NIGHTLY_OPS_SIGNAL_BATCH_MULTIPLIER,
      max_signal_rounds: backlogMode.rounds,
      low_backlog_signal_batch_size: LOW_BACKLOG_SIGNAL_BATCH_SIZE,
      low_backlog_max_signal_rounds: LOW_BACKLOG_MAX_SIGNAL_ROUNDS,
      high_backlog_signal_batch_size: HIGH_BACKLOG_SIGNAL_BATCH_SIZE,
      high_backlog_max_signal_rounds: HIGH_BACKLOG_MAX_SIGNAL_ROUNDS,
    },
  });

  let totalProcessed = 0;
  let remaining = 0;
  let rounds = 0;

  for (let round = 0; round < backlogMode.rounds; round++) {
    const userIds = (round === 0
      ? userIdsWithBacklog
      : await listUsersWithUnprocessedSignals({})).filter((id) => id !== TEST_USER_ID);
    if (userIds.length === 0) break;

    rounds++;
    let roundProcessed = 0;

    for (const userId of userIds) {
      if (roundProcessed >= backlogMode.maxSignals) break;

      const capacity = backlogMode.maxSignals - roundProcessed;
      const extraction = await processUnextractedSignals(userId, {
        maxSignals: capacity,
        prioritizeOlderThanIso: staleCutoffIso,
        quarantineDeferredOlderThanIso: staleCutoffIso,
      });
      roundProcessed += extraction.signals_processed;
    }

    totalProcessed += roundProcessed;

    // Check if there are still unprocessed signals
    remaining = 0;
    for (const userId of (await listUsersWithUnprocessedSignals({})).filter((id) => id !== TEST_USER_ID)) {
      remaining += await countUnprocessedSignals(userId);
    }
    if (remaining === 0) break;
  }

  return {
    ok: true,
    rounds,
    total_processed: totalProcessed,
    remaining,
    reset_stale_signals: resetStaleSignals,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const cronInvocationId = randomUUID();
  const cronT0 = Date.now();
  void insertPipelineCronPhase({
    phase: 'cron_start',
    invocationSource: 'nightly_ops',
    cronInvocationId,
  });

  let nightlyCronOutcome = 'success';
  let nightlyCronError: string | undefined;

  try {
    void logApiBudgetStatusToSystemHealth('nightly_ops');

    const startTime = Date.now();
    const stages: Record<string, unknown> = {};

    // Stage 0: Commitment ceiling before sync/scoring pipeline stages
    try {
      const ceilingResult = await runCommitmentCeilingDefense();
      stages.commitment_ceiling_pre = {
        ok: ceilingResult.ok,
        details: ceilingResult.details,
      };
      console.log(JSON.stringify({
        event: 'nightly_ops_stage',
        stage: 'commitment_ceiling_pre',
        ok: ceilingResult.ok,
      }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.commitment_ceiling_pre = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'commitment_ceiling_pre', error: err.message }));
    }

    // Stage 1: Token refresh before sync attempts.
    try {
      const { runTokenWatchdog } = await import('@/lib/cron/self-heal');
      const tokenResult = await runTokenWatchdog();
      stages.token_refresh_pre = {
        ok: true,
        defense: tokenResult.defense,
        details: tokenResult.details,
      };
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'token_refresh_pre', ok: true }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.token_refresh_pre = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'token_refresh_pre', error: err.message }));
    }

    // Stage 2: Microsoft sync
    try {
      const syncResult = await stageSyncMicrosoft();
      stages.sync_microsoft = syncResult;
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'sync_microsoft', ...syncResult }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.sync_microsoft = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'sync_microsoft', error: err.message }));
    }

    // Stage 3: Google sync
    try {
      const googleSyncResult = await stageSyncGoogle();
      stages.sync_google = googleSyncResult;
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'sync_google', ...googleSyncResult }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.sync_google = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'sync_google', error: err.message }));
    }

    // Stage 4: Connector health
    try {
      const connectorHealth = await checkConnectorHealth();
      stages.connector_health = connectorHealth;
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'connector_health', ...connectorHealth }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.connector_health = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'connector_health', error: err.message }));
    }

    // Stage 5: Sync staleness detection — alert when any provider hasn't synced in 48h+
    try {
      const supabaseStaleness = createServerClient();
      const { data: tokenRows } = await supabaseStaleness
        .from('user_tokens')
        .select('user_id, provider, last_synced_at, email, access_token, disconnected_at')
        .is('disconnected_at', null);

      const STALENESS_THRESHOLD_MS = 48 * 60 * 60 * 1000;
      const now = Date.now();
      const staleProviders: Array<{ user_id: string; provider: string; stale_hours: number; email: string | null }> = [];

      for (const row of tokenRows ?? []) {
        if (!row.access_token || !row.last_synced_at) continue;
        const lastSyncMs = new Date(row.last_synced_at).getTime();
        const staleMs = now - lastSyncMs;
        if (staleMs > STALENESS_THRESHOLD_MS) {
          staleProviders.push({
            user_id: row.user_id,
            provider: row.provider,
            stale_hours: Math.round(staleMs / (60 * 60 * 1000)),
            email: row.email,
          });
        }
      }

      if (staleProviders.length > 0) {
        for (const sp of staleProviders) {
          Sentry.captureMessage(`Sync stale: ${sp.provider} for user ${sp.user_id} (${sp.stale_hours}h)`, 'warning');
        }
        console.warn(JSON.stringify({
          event: 'nightly_ops_sync_stale',
          stale_providers: staleProviders.map((sp) => ({
            provider: sp.provider,
            stale_hours: sp.stale_hours,
          })),
        }));
      }

      stages.sync_staleness = {
        ok: staleProviders.length === 0,
        stale_count: staleProviders.length,
        stale_providers: staleProviders,
      };
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'sync_staleness', stale_count: staleProviders.length }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.sync_staleness = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'sync_staleness', error: err.message }));
    }

    // Stage 6: Signal processing
    try {
      const signalResult = await stageProcessSignals();
      stages.signal_processing = signalResult;
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'signal_processing', ...signalResult }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.signal_processing = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'signal_processing', error: err.message }));
    }

    // Stage 7: Passive rejection (auto-skip stale pending_approval > 24h)
    try {
      const passive = await autoSkipStaleApprovals();
      stages.passive_rejection = { ok: true, ...passive };
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'passive_rejection', ...passive }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.passive_rejection = { ok: false, skipped: 0, error: err.message };
    }

    const durationMs = Date.now() - startTime;
    const allOk = NIGHTLY_OPS_INGEST_STAGE_ORDER.every(
      (stage) => {
        const stageResult = stages[stage] as { ok?: boolean } | undefined;
        return stageResult?.ok === true;
      },
    );

    const summary = { ok: allOk, duration_ms: durationMs, stages };
    console.log(JSON.stringify({ event: 'nightly_ops_complete', ok: allOk, duration_ms: durationMs }));

    try {
      const ingestUserId = process.env.INGEST_USER_ID;
      if (ingestUserId && ingestUserId !== TEST_USER_ID) {
        await computeAndPersistHealthVerdict(ingestUserId, stages);
      }
    } catch (verdictErr: any) {
      console.error(
        JSON.stringify({ event: 'nightly_ops_health_verdict_error', error: verdictErr?.message ?? String(verdictErr) }),
      );
    }

    nightlyCronOutcome = allOk ? 'success' : 'degraded';
    return NextResponse.json(
      { ...summary, cron_invocation_id: cronInvocationId },
      { status: allOk ? 200 : 207 },
    );
  } catch (err: unknown) {
    nightlyCronOutcome = 'error';
    nightlyCronError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    void insertPipelineCronPhase({
      phase: 'cron_complete',
      invocationSource: 'nightly_ops',
      cronInvocationId,
      outcome: nightlyCronOutcome,
      errorClass: nightlyCronError ?? null,
      durationMs: Date.now() - cronT0,
    });
  }
}

export const GET = handler;
export const POST = handler;
