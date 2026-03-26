/**
 * GET /api/cron/nightly-ops
 *
 * Nightly orchestrator — runs the full pipeline in sequence:
 *   1a. Sync Microsoft (all users)
 *   1b. Sync Google (all users)
 *   2. Process unprocessed signals (up to 3 rounds of 50)
 *   3. Daily brief (generate + send)
 *
 * Auth: CRON_SECRET Bearer token.
 * Schedule: 0 11 * * * (4am PT / 11:00 UTC)
 */

import * as Sentry from '@sentry/nextjs';
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
import {
  autoSkipStaleApprovals,
  runDailyBrief,
  toSafeDailyBriefStageStatus,
} from '@/lib/cron/daily-brief';
import { runCommitmentCeilingDefense, runSelfHeal } from '@/lib/cron/self-heal';
import { runAcceptanceGate } from '@/lib/cron/acceptance-gate';
import { checkConnectorHealth } from '@/lib/cron/connector-health';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { TEST_USER_ID, SIGNAL_RETENTION_DAYS } from '@/lib/config/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min

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
  const backlogMode = resolveSignalBacklogMode(totalUnprocessed);

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

async function completeSuppressedCommitments(): Promise<number> {
  const supabase = createServerClient();
  const { data: updatedRows, error } = await supabase
    .from('tkg_commitments')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .not('suppressed_at', 'is', null)
    .eq('status', 'active')
    .select('id');

  if (error) {
    throw error;
  }

  const updatedCount = (updatedRows ?? []).length;
  console.log(`[nightly-ops] Completed ${updatedCount} suppressed commitments`);
  return updatedCount;
}

async function listNightlyBriefUserIds(): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('user_tokens')
    .select('user_id')
    .is('disconnected_at', null);

  if (error) {
    throw error;
  }

  return [...new Set((data ?? []).map((row) => row.user_id as string))]
    .filter((id) => id !== TEST_USER_ID);
}

async function purgeOldExtractedSignals(userIds: string[]): Promise<{ ok: boolean; deleted: number }> {
  const supabase = createServerClient();
  const cutoffIso = new Date(Date.now() - SIGNAL_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let deleted = 0;

  for (const userId of userIds) {
    const { data, error } = await supabase
      .from('tkg_signals')
      .delete()
      .eq('user_id', userId)
      .lt('occurred_at', cutoffIso)
      .not('extracted_entities', 'is', null)
      .select('id');

    if (error) {
      throw error;
    }

    deleted += (data ?? []).length;
  }

  return { ok: true, deleted };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const startTime = Date.now();
  const stages: Record<string, unknown> = {};
  const nightlyBriefUserIds = await listNightlyBriefUserIds();

  // Double-fire guard: if ALL users already have today's email sent, skip the entire run.
  // This handles the common Vercel double-fire case where both invocations start within seconds.
  if (nightlyBriefUserIds.length > 0) {
    const supabase = createServerClient();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayActions } = await supabase
      .from('tkg_actions')
      .select('user_id, execution_result')
      .gte('generated_at', todayStart.toISOString())
      .in('user_id', nightlyBriefUserIds);

    const usersAlreadySent = new Set(
      (todayActions ?? [])
        .filter((a) => {
          const er = a.execution_result as Record<string, unknown> | null;
          return er?.daily_brief_sent_at;
        })
        .map((a) => a.user_id as string),
    );

    const allSent = nightlyBriefUserIds.every((uid) => usersAlreadySent.has(uid));
    if (allSent) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: 'already_ran_today', duration_ms: Date.now() - startTime },
        { status: 200 },
      );
    }
  }

  // Stage 0: Cleanup old extracted signals before any pipeline work
  try {
    const cleanupResult = await purgeOldExtractedSignals(nightlyBriefUserIds);
    stages.signal_retention_cleanup = cleanupResult;
    console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'signal_retention_cleanup', ...cleanupResult }));
  } catch (err: any) {
    Sentry.captureException(err);
    stages.signal_retention_cleanup = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'signal_retention_cleanup', error: err.message }));
  }

  // Stage 0b: Commitment ceiling before signal/scoring pipeline stages
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

  // Stage 0c: Token refresh before sync attempts — expired tokens cause sync to
  // fail on stale data, and the watchdog in Stage 5 only fixes it for tomorrow.
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

  // Stage 1: Microsoft sync
  try {
    const syncResult = await stageSyncMicrosoft();
    stages.sync_microsoft = syncResult;
    console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'sync_microsoft', ...syncResult }));
  } catch (err: any) {
    Sentry.captureException(err);
    stages.sync_microsoft = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'sync_microsoft', error: err.message }));
  }

  // Stage 1b: Google sync
  try {
    const googleSyncResult = await stageSyncGoogle();
    stages.sync_google = googleSyncResult;
    console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'sync_google', ...googleSyncResult }));
  } catch (err: any) {
    Sentry.captureException(err);
    stages.sync_google = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'sync_google', error: err.message }));
  }

  // Stage 1c: Connector health
  try {
    const connectorHealth = await checkConnectorHealth();
    stages.connector_health = connectorHealth;
    console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'connector_health', ...connectorHealth }));
  } catch (err: any) {
    Sentry.captureException(err);
    stages.connector_health = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'connector_health', error: err.message }));
  }

  // Stage 2: Signal processing
  try {
    const signalResult = await stageProcessSignals();
    stages.signal_processing = signalResult;
    console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'signal_processing', ...signalResult }));
  } catch (err: any) {
    Sentry.captureException(err);
    stages.signal_processing = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'signal_processing', error: err.message }));
  }

  // Stage 2b: Complete suppressed commitments
  try {
    const updatedCount = await completeSuppressedCommitments();
    stages.suppressed_commitments = { ok: true, updated: updatedCount };
    console.log(JSON.stringify({
      event: 'nightly_ops_stage',
      stage: 'suppressed_commitments',
      ok: true,
      updated: updatedCount,
    }));
  } catch (err: any) {
    Sentry.captureException(err);
    stages.suppressed_commitments = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'suppressed_commitments', error: err.message }));
  }

  // Stage 3: Passive rejection (auto-skip stale pending_approval > 24h)
  try {
    const passive = await autoSkipStaleApprovals();
    stages.passive_rejection = { ok: true, ...passive };
    console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'passive_rejection', ...passive }));
  } catch (err: any) {
    Sentry.captureException(err);
    stages.passive_rejection = { ok: false, skipped: 0, error: err.message };
  }

  // Stage 3b: Credit canary before generation — if credits are exhausted,
  // skip generation but continue to self-heal/acceptance gate so the alert email fires.
  let skipDailyBrief = false;
  try {
    const { checkApiCreditCanary } = await import('@/lib/cron/acceptance-gate');
    const canary = await checkApiCreditCanary();
    stages.credit_canary_pre = { ok: canary.pass, ...canary };
    if (!canary.pass) {
      skipDailyBrief = true;
      stages.daily_brief = { ok: false, error: 'Skipped: Anthropic credit canary failed pre-generation' };
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'credit_canary_pre', pass: false }));
    }
  } catch (err: any) {
    Sentry.captureException(err);
    stages.credit_canary_pre = { ok: false, error: err.message };
  }

  // Stage 4: Daily brief (generate + send) — skipped if credit canary failed
  if (!skipDailyBrief) try {
    const result = await runDailyBrief({ userIds: nightlyBriefUserIds });
    const signalProcessing = toSafeDailyBriefStageStatus(result.signal_processing);
    const generate = toSafeDailyBriefStageStatus(result.generate);
    const send = toSafeDailyBriefStageStatus(result.send);

    stages.daily_brief = {
      date: result.date,
      ok: result.ok,
      signal_processing: { ...signalProcessing, results: result.signal_processing.results },
      generate: { ...generate, results: result.generate.results },
      send: { ...send, results: result.send.results },
    };
    console.log(JSON.stringify({
      event: 'nightly_ops_stage',
      stage: 'daily_brief',
      date: result.date,
      ok: result.ok,
    }));
  } catch (err: any) {
    Sentry.captureException(err);
    stages.daily_brief = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'daily_brief', error: err.message }));
  }

  // Stage 5: Self-heal (immune system — final phase)
  try {
    const healResult = await runSelfHeal();
    stages.self_heal = {
      ok: healResult.ok,
      alert_sent: healResult.alert_sent,
      duration_ms: healResult.duration_ms,
      defenses: healResult.defenses.map((d) => ({ defense: d.defense, ok: d.ok })),
    };
    console.log(JSON.stringify({
      event: 'nightly_ops_stage',
      stage: 'self_heal',
      ok: healResult.ok,
      alert_sent: healResult.alert_sent,
    }));
  } catch (err: any) {
    Sentry.captureException(err);
    stages.self_heal = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'self_heal', error: err.message }));
  }

  // Stage 6: Acceptance gate (final — checks all production invariants)
  try {
    const gateResult = await runAcceptanceGate();
    stages.acceptance_gate = {
      ok: gateResult.ok,
      alert_sent: gateResult.alert_sent,
      duration_ms: gateResult.duration_ms,
      checks: gateResult.checks.map((c) => ({ check: c.check, pass: c.pass, detail: c.detail })),
    };
    console.log(JSON.stringify({
      event: 'nightly_ops_stage',
      stage: 'acceptance_gate',
      ok: gateResult.ok,
      alert_sent: gateResult.alert_sent,
      checks_passed: gateResult.checks.filter((c) => c.pass).length,
      checks_total: gateResult.checks.length,
    }));
  } catch (err: any) {
    Sentry.captureException(err);
    stages.acceptance_gate = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'acceptance_gate', error: err.message }));
  }

  // Stage 7: Weekly goal refresh (Sundays only)
  const dayOfWeek = new Date().getUTCDay();
  if (dayOfWeek === 0) {
    try {
      const { refreshGoalContext, inferGoalsFromBehavior, abandonRejectedGoals } = await import('@/lib/cron/goal-refresh');
      const refreshResult = await refreshGoalContext();
      (stages as any).goal_refresh = refreshResult;
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'goal_refresh', ...refreshResult }));

      // Infer new goals from behavioral signal patterns (runs after refresh so inferred
      // goals aren't immediately re-inferred in the same cycle)
      const inferResult = await inferGoalsFromBehavior();
      (stages as any).goal_infer = inferResult;
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'goal_infer', ...inferResult }));

      // CE-5: auto-abandon goals that have a rejection signal in their thread
      const abandonResult = await abandonRejectedGoals();
      (stages as any).goal_abandon = abandonResult;
      console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'goal_abandon', ...abandonResult }));
    } catch (err: any) {
      Sentry.captureException(err);
      (stages as any).goal_refresh = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'goal_refresh', error: err.message }));
    }
  }

  const durationMs = Date.now() - startTime;
  // Strict allOk: every stage MUST have an explicit `ok: true` field.
  // Stages without `ok` or with `ok: false` are treated as failures.
  // This prevents the Class B silent-success pattern where stages returning
  // objects without an `ok` field were counted as successes.
  const allOk = Object.values(stages).every(
    (s) => s && typeof s === 'object' && (s as any).ok === true,
  );

  const summary = { ok: allOk, duration_ms: durationMs, stages };
  console.log(JSON.stringify({ event: 'nightly_ops_complete', ok: allOk, duration_ms: durationMs }));

  return NextResponse.json(summary, { status: allOk ? 200 : 207 });
}

export const GET = handler;
export const POST = handler;
