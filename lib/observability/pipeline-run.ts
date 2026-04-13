/**
 * Pipeline observability — cron heartbeats + per-user funnel rows in pipeline_runs.
 * All inserts/updates are best-effort (log errors, never throw into callers).
 */

import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/db/client';
import type { ScorerDiagnostics } from '@/lib/briefing/scorer';

export type PipelinePhase = 'cron_start' | 'cron_complete' | 'user_run';

/** Extract entity tokens from entity_reality_gate drop reasons for "did rejection filter stick?" */
function extractRejectionEntitiesFromDiagnostics(diag: ScorerDiagnostics | null): string[] {
  if (!diag?.filterStages?.length) return [];
  const out = new Set<string>();
  for (const fs of diag.filterStages) {
    if (fs.stage !== 'entity_reality_gate') continue;
    for (const d of fs.dropped) {
      const m = /\(\s*entity:\s*([^)]+)\)/.exec(d.reason);
      if (m?.[1]) out.add(m[1].trim().slice(0, 120));
    }
  }
  return [...out];
}

function stakesKilledSummary(diag: ScorerDiagnostics | null): Array<{ reason: string; count: number }> {
  if (!diag?.filterStages?.length) return [];
  const stage = diag.filterStages.find((s) => s.stage === 'stakes_gate');
  if (!stage?.dropped?.length) return [];
  const counts = new Map<string, number>();
  for (const d of stage.dropped) {
    const key = d.reason.slice(0, 200);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count }));
}

const DISCREPANCY_PREVIEW_CAP = 8;

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Bounded discrepancy observability for pipeline_runs.gate_funnel — distinguishes
 * detector emission vs pool injection vs downstream drops (no raw evidence blobs).
 */
function buildDiscrepancyObservability(diag: ScorerDiagnostics): Record<string, unknown> {
  const det = diag.discrepancyDetectorSummary;
  const detCount = det?.count ?? 0;
  const detClasses = det?.classes ?? [];
  const detPreview = det?.preview ?? [];

  const poolPreview = diag.discrepancies.slice(0, DISCREPANCY_PREVIEW_CAP).map((d) => ({
    class: d.class,
    action_type: d.actionType ?? 'unknown',
    score: round4(d.score),
    urgency: round4(d.urgency),
    title: d.title.slice(0, 80),
  }));

  const candidatesPreview =
    poolPreview.length > 0
      ? poolPreview
      : detPreview.slice(0, DISCREPANCY_PREVIEW_CAP).map((p) => ({
          class: p.class,
          action_type: p.action_type,
          stakes: round4(p.stakes),
          urgency: round4(p.urgency),
          title: p.title,
          score: null as number | null,
        }));

  const skips = diag.discrepancyInjectionSkips ?? { locked_contact: 0, failure_suppression: 0 };
  const discSurvivors = diag.survivors.filter((s) => s.type === 'discrepancy');

  const dropsByStage: Record<string, number> = {};
  for (const fs of diag.filterStages) {
    let n = 0;
    for (const drop of fs.dropped) {
      if (drop.type === 'discrepancy') n += 1;
    }
    if (n > 0) dropsByStage[fs.stage] = n;
  }

  return {
    discrepancy_count: detCount,
    discrepancy_classes: detClasses,
    discrepancy_candidates_preview: candidatesPreview,
    discrepancy_structural_injected_count: diag.discrepancies.length,
    discrepancy_insight_scored_count: diag.insightDiscrepanciesScored ?? 0,
    discrepancy_skipped_pre_pool: {
      locked_contact: skips.locked_contact,
      failure_suppression: skips.failure_suppression,
    },
    discrepancy_survivor_count: discSurvivors.length,
    has_discrepancy_survivor: discSurvivors.length > 0,
    discrepancy_drops_by_stage: dropsByStage,
  };
}

/**
 * Build gate_funnel JSON for pipeline_runs from post-scoreOpenLoops diagnostics.
 */
export function buildGateFunnelFromScorerDiagnostics(
  diag: ScorerDiagnostics | null,
  extras?: Record<string, unknown>,
): Record<string, unknown> {
  if (!diag) {
    return { ...(extras ?? {}), scorer_diagnostics: null };
  }
  const firstBefore = diag.filterStages[0]?.before ?? null;
  const lastAfter =
    diag.filterStages.length > 0
      ? diag.filterStages[diag.filterStages.length - 1]!.after
      : null;

  return {
    ...(extras ?? {}),
    source_counts: diag.sourceCounts,
    candidate_pool: diag.candidatePool,
    filter_stages: diag.filterStages.map((f) => ({
      stage: f.stage,
      before: f.before,
      after: f.after,
      dropped_count: f.dropped.length,
    })),
    rejection_filter_entities: extractRejectionEntitiesFromDiagnostics(diag),
    stakes_killed: stakesKilledSummary(diag),
    candidates_raw_estimate: firstBefore,
    candidates_after_last_filter: lastAfter,
    survivors_count: diag.survivors.length,
    final_outcome: diag.finalOutcome,
    early_exit_stage: diag.earlyExitStage ?? null,
    ...buildDiscrepancyObservability(diag),
  };
}

export async function insertPipelineCronPhase(params: {
  phase: 'cron_start' | 'cron_complete';
  invocationSource: string;
  cronInvocationId: string;
  outcome?: string | null;
  errorClass?: string | null;
  durationMs?: number | null;
  rawExtras?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createServerClient();
    const id = randomUUID();
    const { error } = await supabase.from('pipeline_runs').insert({
      id,
      phase: params.phase,
      invocation_source: params.invocationSource,
      cron_invocation_id: params.cronInvocationId,
      user_id: null,
      started_at: new Date().toISOString(),
      completed_at: params.phase === 'cron_complete' ? new Date().toISOString() : null,
      outcome: params.outcome ?? null,
      error_class: params.errorClass ?? null,
      duration_ms: params.durationMs ?? null,
      gate_funnel: {},
      delivery: {},
      raw_extras: params.rawExtras ?? {},
    });
    if (error) {
      console.error(
        JSON.stringify({ event: 'pipeline_runs_cron_insert_error', message: error.message }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'pipeline_runs_cron_insert_throw',
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

export async function insertUserPipelineRunStart(params: {
  id: string;
  userId: string;
  cronInvocationId: string;
  invocationSource: string;
}): Promise<void> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('pipeline_runs').insert({
      id: params.id,
      phase: 'user_run',
      invocation_source: params.invocationSource,
      cron_invocation_id: params.cronInvocationId,
      user_id: params.userId,
      started_at: new Date().toISOString(),
      gate_funnel: { status: 'generation_started' },
      delivery: {},
      raw_extras: {},
    });
    if (error) {
      console.error(
        JSON.stringify({
          event: 'pipeline_runs_user_start_error',
          userId: params.userId,
          message: error.message,
        }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'pipeline_runs_user_start_throw',
        userId: params.userId,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

export async function finalizeUserPipelineRun(params: {
  id: string;
  userId: string;
  outcome: string;
  gateFunnel: Record<string, unknown>;
  winnerActionType?: string | null;
  winnerConfidence?: number | null;
  blockedGate?: string | null;
  candidatesEvaluated?: number | null;
  rawExtras?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('pipeline_runs')
      .update({
        completed_at: new Date().toISOString(),
        outcome: params.outcome,
        gate_funnel: params.gateFunnel,
        winner_action_type: params.winnerActionType ?? null,
        winner_confidence: params.winnerConfidence ?? null,
        blocked_gate: params.blockedGate ?? null,
        candidates_evaluated: params.candidatesEvaluated ?? null,
        raw_extras: params.rawExtras ?? {},
      })
      .eq('id', params.id)
      .eq('user_id', params.userId);

    if (error) {
      console.error(
        JSON.stringify({
          event: 'pipeline_runs_user_finalize_error',
          userId: params.userId,
          message: error.message,
        }),
      );
      return;
    }

    await attachApiSpendSnapshot(params.id);
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'pipeline_runs_user_finalize_throw',
        userId: params.userId,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

export async function attachApiSpendSnapshot(pipelineRunId: string): Promise<void> {
  try {
    const supabase = createServerClient();
    const { data: rows, error: qErr } = await supabase
      .from('api_usage')
      .select('model, endpoint, estimated_cost')
      .eq('pipeline_run_id', pipelineRunId);

    if (qErr || !rows?.length) {
      if (qErr) {
        console.error(
          JSON.stringify({
            event: 'pipeline_runs_spend_query_error',
            message: qErr.message,
          }),
        );
      }
      return;
    }

    let totalUsd = 0;
    const byModel: Record<string, number> = {};
    const byEndpoint: Record<string, number> = {};
    for (const r of rows as Array<{ model: string; endpoint: string; estimated_cost: number }>) {
      const c = Number(r.estimated_cost) || 0;
      totalUsd += c;
      byModel[r.model] = (byModel[r.model] ?? 0) + c;
      const ep = r.endpoint ?? 'unknown';
      byEndpoint[ep] = (byEndpoint[ep] ?? 0) + c;
    }

    const snapshot = {
      total_usd: Math.round(totalUsd * 1_000_000) / 1_000_000,
      total_cents: Math.round(totalUsd * 100),
      by_model: byModel,
      by_endpoint: byEndpoint,
      call_count: rows.length,
    };

    const { error: uErr } = await supabase
      .from('pipeline_runs')
      .update({ api_spend_snapshot: snapshot })
      .eq('id', pipelineRunId);

    if (uErr) {
      console.error(
        JSON.stringify({ event: 'pipeline_runs_spend_update_error', message: uErr.message }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'pipeline_runs_spend_snapshot_throw',
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

/**
 * Best-effort: update outcome + merge raw_extras after verification-stub persistence (initial finalize
 * runs before artifact stage).
 */
export async function patchUserPipelineRunOutcome(params: {
  id: string;
  userId: string;
  outcome: string;
  rawExtrasPatch?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createServerClient();
    const { data: row, error: fetchErr } = await supabase
      .from('pipeline_runs')
      .select('raw_extras')
      .eq('id', params.id)
      .eq('user_id', params.userId)
      .maybeSingle();

    if (fetchErr || !row) {
      if (fetchErr) {
        console.error(
          JSON.stringify({
            event: 'pipeline_runs_patch_fetch_error',
            message: fetchErr.message,
          }),
        );
      }
      return;
    }

    const prev =
      row.raw_extras && typeof row.raw_extras === 'object'
        ? (row.raw_extras as Record<string, unknown>)
        : {};
    const merged = { ...prev, ...(params.rawExtrasPatch ?? {}) };

    const { error: upErr } = await supabase
      .from('pipeline_runs')
      .update({
        outcome: params.outcome,
        raw_extras: merged,
      })
      .eq('id', params.id)
      .eq('user_id', params.userId);

    if (upErr) {
      console.error(
        JSON.stringify({ event: 'pipeline_runs_patch_update_error', message: upErr.message }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'pipeline_runs_patch_throw',
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

export async function mergePipelineRunDelivery(params: {
  userId: string;
  cronInvocationId: string;
  delivery: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createServerClient();
    const { data: latest, error: findErr } = await supabase
      .from('pipeline_runs')
      .select('id, delivery')
      .eq('user_id', params.userId)
      .eq('cron_invocation_id', params.cronInvocationId)
      .eq('phase', 'user_run')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findErr || !latest?.id) {
      if (findErr) {
        console.error(
          JSON.stringify({
            event: 'pipeline_runs_delivery_lookup_error',
            message: findErr.message,
          }),
        );
      }
      return;
    }

    const prev =
      latest.delivery && typeof latest.delivery === 'object'
        ? (latest.delivery as Record<string, unknown>)
        : {};
    const merged = { ...prev, ...params.delivery };

    const { error: uErr } = await supabase
      .from('pipeline_runs')
      .update({ delivery: merged })
      .eq('id', latest.id);

    if (uErr) {
      console.error(
        JSON.stringify({ event: 'pipeline_runs_delivery_update_error', message: uErr.message }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'pipeline_runs_delivery_merge_throw',
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}
