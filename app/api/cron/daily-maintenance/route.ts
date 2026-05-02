/**
 * GET /api/cron/daily-maintenance
 *
 * Post-delivery maintenance stage for the orchestrated morning cron pipeline.
 * Scheduled production invocations now arrive through /api/cron/morning-pipeline
 * after nightly-ops and daily-brief. This route remains callable directly for manual/operator use.
 *
 * Auth: CRON_SECRET Bearer token.
 * Scheduled via /api/cron/morning-pipeline after daily-brief.
 */

import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { TEST_USER_ID } from '@/lib/config/constants';
import { logApiBudgetStatusToSystemHealth } from '@/lib/cron/api-budget';
import {
  completeSuppressedCommitments,
  listSignalRetentionUserIds,
  purgeOldExtractedSignals,
  runConfidenceCalibration,
  trackReplyOutcomes,
} from '@/lib/cron/daily-maintenance';
import { runSelfHeal, runSelfOptimize } from '@/lib/cron/self-heal';
import { runAcceptanceGate } from '@/lib/cron/acceptance-gate';
import { computeAndPersistHealthVerdict } from '@/lib/cron/health-verdict';
import { insertPipelineCronPhase } from '@/lib/observability/pipeline-run';
import { runAttentionDecay } from '@/lib/signals/entity-attention-runtime';
import { runBehavioralGraph } from '@/lib/signals/behavioral-graph';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const cronInvocationId = randomUUID();
  const cronT0 = Date.now();
  void insertPipelineCronPhase({
    phase: 'cron_start',
    invocationSource: 'daily_maintenance',
    cronInvocationId,
  });

  let cronOutcome = 'success';
  let cronError: string | undefined;

  try {
    void logApiBudgetStatusToSystemHealth('daily_maintenance');

    const startTime = Date.now();
    const stages: Record<string, unknown> = {};
    const retentionUserIds = await listSignalRetentionUserIds(TEST_USER_ID);

    try {
      const cleanupResult = await purgeOldExtractedSignals(retentionUserIds);
      stages.signal_retention_cleanup = cleanupResult;
      console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'signal_retention_cleanup', ...cleanupResult }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.signal_retention_cleanup = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'signal_retention_cleanup', error: err.message }));
    }

    try {
      const { recordUnopenedDailyBriefSignals } = await import('@/lib/cron/brief-engagement-signals');
      const engagement = await recordUnopenedDailyBriefSignals();
      stages.brief_engagement_signals = { ok: true, ...engagement };
      console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'brief_engagement_signals', ...engagement }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.brief_engagement_signals = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'brief_engagement_signals', error: err.message }));
    }

    try {
      const bxResult = await runBehavioralGraph(retentionUserIds);
      stages.behavioral_graph = bxResult;
      console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'behavioral_graph', ...bxResult }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.behavioral_graph = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'behavioral_graph', error: err.message }));
    }

    try {
      const attResult = await runAttentionDecay(retentionUserIds);
      stages.attention_decay = attResult;
      console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'attention_decay', ...attResult }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.attention_decay = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'attention_decay', error: err.message }));
    }

    try {
      const updatedCount = await completeSuppressedCommitments();
      stages.suppressed_commitments = { ok: true, updated: updatedCount };
      console.log(JSON.stringify({
        event: 'daily_maintenance_stage',
        stage: 'suppressed_commitments',
        ok: true,
        updated: updatedCount,
      }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.suppressed_commitments = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'suppressed_commitments', error: err.message }));
    }

    try {
      const replyResult = await trackReplyOutcomes();
      stages.reply_outcome_tracking = replyResult;
      console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'reply_outcome_tracking', ...replyResult }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.reply_outcome_tracking = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'reply_outcome_tracking', error: err.message }));
    }

    try {
      const calibrationResult = await runConfidenceCalibration();
      stages.confidence_calibration = calibrationResult;
      console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'confidence_calibration', ...calibrationResult }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.confidence_calibration = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'confidence_calibration', error: err.message }));
    }

    try {
      const healResult = await runSelfHeal();
      stages.self_heal = {
        ok: healResult.ok,
        alert_sent: healResult.alert_sent,
        duration_ms: healResult.duration_ms,
        defenses: healResult.defenses.map((d) => ({ defense: d.defense, ok: d.ok })),
      };
      console.log(JSON.stringify({
        event: 'daily_maintenance_stage',
        stage: 'self_heal',
        ok: healResult.ok,
        alert_sent: healResult.alert_sent,
      }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.self_heal = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'self_heal', error: err.message }));
    }

    try {
      const gateResult = await runAcceptanceGate();
      stages.acceptance_gate = {
        ok: gateResult.ok,
        alert_sent: gateResult.alert_sent,
        duration_ms: gateResult.duration_ms,
        checks: gateResult.checks.map((c) => ({ check: c.check, pass: c.pass, detail: c.detail })),
      };
      console.log(JSON.stringify({
        event: 'daily_maintenance_stage',
        stage: 'acceptance_gate',
        ok: gateResult.ok,
        alert_sent: gateResult.alert_sent,
        checks_passed: gateResult.checks.filter((c) => c.pass).length,
        checks_total: gateResult.checks.length,
      }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.acceptance_gate = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'acceptance_gate', error: err.message }));
    }

    try {
      const optimizeResult = await runSelfOptimize();
      stages.self_optimize = optimizeResult;
      console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'self_optimize', ...optimizeResult }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.self_optimize = { ok: false, error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'self_optimize', error: err.message }));
    }

    try {
      const { runAggregateMlGlobalPriors } = await import('@/lib/cron/aggregate-ml-global-priors');
      const mlAgg = await runAggregateMlGlobalPriors();
      const mlGlobalPriorsStage = {
        ok: true,
        buckets_written: mlAgg.bucketsWritten,
        snapshots_labeled: mlAgg.snapshotsLabeled,
        last_error: mlAgg.error,
      };
      stages.ml_global_priors = mlGlobalPriorsStage;
      console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'ml_global_priors', ...mlGlobalPriorsStage }));
    } catch (err: any) {
      Sentry.captureException(err);
      stages.ml_global_priors = { ok: true, buckets_written: 0, snapshots_labeled: 0, last_error: err.message };
      console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'ml_global_priors', error: err.message }));
    }

    const dayOfWeek = new Date().getUTCDay();
    if (dayOfWeek === 0) {
      try {
        const { refreshGoalContext, inferGoalsFromBehavior, abandonRejectedGoals } = await import('@/lib/cron/goal-refresh');
        const refreshResult = await refreshGoalContext();
        (stages as any).goal_refresh = refreshResult;
        console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'goal_refresh', ...refreshResult }));

        const inferResult = await inferGoalsFromBehavior();
        (stages as any).goal_infer = inferResult;
        console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'goal_infer', ...inferResult }));

        const abandonResult = await abandonRejectedGoals();
        (stages as any).goal_abandon = abandonResult;
        console.log(JSON.stringify({ event: 'daily_maintenance_stage', stage: 'goal_abandon', ...abandonResult }));
      } catch (err: any) {
        Sentry.captureException(err);
        (stages as any).goal_refresh = { ok: false, error: err.message };
        console.error(JSON.stringify({ event: 'daily_maintenance_stage_error', stage: 'goal_refresh', error: err.message }));
      }
    }

    const durationMs = Date.now() - startTime;
    const allOk = Object.values(stages).every(
      (s) => s && typeof s === 'object' && (s as any).ok === true,
    );

    try {
      const ingestUserId = process.env.INGEST_USER_ID;
      if (ingestUserId && ingestUserId !== TEST_USER_ID) {
        await computeAndPersistHealthVerdict(ingestUserId, stages);
      }
    } catch (verdictErr: any) {
      console.error(
        JSON.stringify({ event: 'daily_maintenance_health_verdict_error', error: verdictErr?.message ?? String(verdictErr) }),
      );
    }

    cronOutcome = allOk ? 'success' : 'degraded';
    return NextResponse.json(
      { ok: allOk, duration_ms: durationMs, stages, cron_invocation_id: cronInvocationId },
      { status: allOk ? 200 : 207 },
    );
  } catch (err: unknown) {
    cronOutcome = 'error';
    cronError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    void insertPipelineCronPhase({
      phase: 'cron_complete',
      invocationSource: 'daily_maintenance',
      cronInvocationId,
      outcome: cronOutcome,
      errorClass: cronError ?? null,
      durationMs: Date.now() - cronT0,
    });
  }
}

export const GET = handler;
export const POST = handler;
