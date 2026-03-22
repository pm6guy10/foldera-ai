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

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { getAllUsersWithProvider } from '@/lib/auth/user-tokens';
import {
  countUnprocessedSignals,
  listUsersWithUnprocessedSignals,
  processUnextractedSignals,
} from '@/lib/signals/signal-processor';
import {
  autoSkipStaleApprovals,
  runDailyBrief,
  toSafeDailyBriefStageStatus,
} from '@/lib/cron/daily-brief';
import { runSelfHeal } from '@/lib/cron/self-heal';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min

const SIGNAL_BATCH_SIZE = 50;
const MAX_SIGNAL_ROUNDS = 3;
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
  const userIds = await getAllUsersWithProvider('microsoft');
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
  const userIds = await getAllUsersWithProvider('google');
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
  error?: string;
}

async function stageProcessSignals(): Promise<SignalProcessingResult> {
  const staleCutoffIso = new Date(
    Date.now() - STALE_CUTOFF_HOURS * 60 * 60 * 1000,
  ).toISOString();

  let totalProcessed = 0;
  let remaining = 0;
  let rounds = 0;

  for (let round = 0; round < MAX_SIGNAL_ROUNDS; round++) {
    const userIds = await listUsersWithUnprocessedSignals({});
    if (userIds.length === 0) break;

    rounds++;
    let roundProcessed = 0;

    for (const userId of userIds) {
      if (roundProcessed >= SIGNAL_BATCH_SIZE) break;

      const capacity = SIGNAL_BATCH_SIZE - roundProcessed;
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
    for (const userId of await listUsersWithUnprocessedSignals({})) {
      remaining += await countUnprocessedSignals(userId);
    }
    if (remaining === 0) break;
  }

  return { ok: true, rounds, total_processed: totalProcessed, remaining };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const startTime = Date.now();
  const stages: Record<string, unknown> = {};

  // Stage 1: Microsoft sync
  try {
    const syncResult = await stageSyncMicrosoft();
    stages.sync_microsoft = syncResult;
    console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'sync_microsoft', ...syncResult }));
  } catch (err: any) {
    stages.sync_microsoft = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'sync_microsoft', error: err.message }));
  }

  // Stage 1b: Google sync
  try {
    const googleSyncResult = await stageSyncGoogle();
    stages.sync_google = googleSyncResult;
    console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'sync_google', ...googleSyncResult }));
  } catch (err: any) {
    stages.sync_google = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'sync_google', error: err.message }));
  }

  // Stage 2: Signal processing
  try {
    const signalResult = await stageProcessSignals();
    stages.signal_processing = signalResult;
    console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'signal_processing', ...signalResult }));
  } catch (err: any) {
    stages.signal_processing = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'signal_processing', error: err.message }));
  }

  // Stage 3: Passive rejection (auto-skip stale pending_approval > 24h)
  try {
    const passive = await autoSkipStaleApprovals();
    stages.passive_rejection = passive;
    console.log(JSON.stringify({ event: 'nightly_ops_stage', stage: 'passive_rejection', ...passive }));
  } catch (err: any) {
    stages.passive_rejection = { skipped: 0, error: err.message };
  }

  // Stage 4: Daily brief (generate + send)
  try {
    const result = await runDailyBrief();
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
    stages.self_heal = { ok: false, error: err.message };
    console.error(JSON.stringify({ event: 'nightly_ops_stage_error', stage: 'self_heal', error: err.message }));
  }

  const durationMs = Date.now() - startTime;
  const allOk = Object.values(stages).every(
    (s) => s && typeof s === 'object' && (s as any).ok !== false,
  );

  const summary = { ok: allOk, duration_ms: durationMs, stages };
  console.log(JSON.stringify({ event: 'nightly_ops_complete', ok: allOk, duration_ms: durationMs }));

  return NextResponse.json(summary, { status: allOk ? 200 : 207 });
}

export const GET = handler;
export const POST = handler;
