import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { getDeployRevision } from '@/lib/config/deploy-revision';
import { resolveSettingsRunBriefPipelineDryRun } from '@/lib/config/prelaunch-spend';
import { CONFIDENCE_PERSIST_THRESHOLD } from '@/lib/config/constants';
import { runBriefLifecycle } from '@/lib/cron/brief-service';
import { extractArtifact, extractSentAt } from '@/lib/cron/daily-brief-generate';
import { createServerClient } from '@/lib/db/client';
import { syncGoogle } from '@/lib/sync/google-sync';
import { syncMicrosoft } from '@/lib/sync/microsoft-sync';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SYNC_TIMEOUT_MS = 15_000; // 15s max — remainder goes to scoring + LLM
const MANUAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for manual runs
const DRY_RUN_SERVER_COOLDOWN_MS = 5 * 60 * 1000;
const DRY_RUN_PENDING_REUSE_WINDOW_HOURS = 18;

function withSyncTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), SYNC_TIMEOUT_MS)),
  ]);
}

interface ManualSyncStageResult {
  ok: boolean;
  provider: 'google' | 'microsoft';
  skipped?: boolean;
  error?: string;
  total?: number;
}

interface RecentDryRunRow {
  created_at: string | null;
  id: string;
}

interface LatestPipelineRunRow {
  created_at: string | null;
  id: string;
  outcome: string | null;
  phase: string | null;
}

interface LatestActionMetadataRow {
  action_type: string | null;
  confidence: number | null;
  generated_at: string | null;
  id: string;
  status: string | null;
}

interface PendingApprovalReuseRow {
  action_type: string | null;
  confidence: number | null;
  execution_result: unknown;
  generated_at: string;
  id: string;
}

async function runManualSync(
  provider: 'google' | 'microsoft',
  userId: string,
): Promise<ManualSyncStageResult> {
  try {
    if (provider === 'google') {
      const result = await syncGoogle(userId, { maxLookbackMs: MANUAL_LOOKBACK_MS });
      if (result.error === 'no_token') {
        return { ok: true, provider, skipped: true };
      }

      return {
        ok: !result.error,
        provider,
        error: result.error,
        total: result.gmail_signals + result.calendar_signals + result.drive_signals,
      };
    }

    const result = await syncMicrosoft(userId, { maxLookbackMs: MANUAL_LOOKBACK_MS });
    if (result.error === 'no_token') {
      return { ok: true, provider, skipped: true };
    }

    return {
      ok: !result.error,
      provider,
      error: result.error,
      total: result.mail_signals + result.calendar_signals + result.file_signals + result.task_signals,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      provider,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isReusablePendingApproval(row: PendingApprovalReuseRow): boolean {
  if (row.action_type === 'do_nothing') return false;
  if (typeof row.confidence !== 'number' || row.confidence < CONFIDENCE_PERSIST_THRESHOLD) return false;
  if (extractArtifact(row.execution_result) === null) return false;
  if (extractSentAt(row.execution_result)) return false;
  return true;
}

async function findReusablePendingApproval(userId: string): Promise<PendingApprovalReuseRow | null> {
  try {
    const supabase = createServerClient();
    const staleCutoffIso = new Date(
      Date.now() - DRY_RUN_PENDING_REUSE_WINDOW_HOURS * 3_600_000,
    ).toISOString();
    const { data, error } = await supabase
      .from('tkg_actions')
      .select('id, generated_at, confidence, action_type, execution_result')
      .eq('user_id', userId)
      .eq('status', 'pending_approval')
      .neq('action_type', 'do_nothing')
      .gte('generated_at', staleCutoffIso)
      .order('confidence', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(5);

    if (error) {
      console.warn('[settings/run-brief] pending approval reuse lookup failed:', error.message);
      return null;
    }

    const rows = (data ?? []) as PendingApprovalReuseRow[];
    return rows.find(isReusablePendingApproval) ?? null;
  } catch (error: unknown) {
    console.warn(
      '[settings/run-brief] pending approval reuse lookup threw:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

async function findRecentPipelineDryRun(userId: string): Promise<RecentDryRunRow | null> {
  try {
    const supabase = createServerClient();
    const cooldownFloorIso = new Date(Date.now() - DRY_RUN_SERVER_COOLDOWN_MS).toISOString();
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('phase', 'user_run')
      .eq('invocation_source', 'settings_run_brief')
      .eq('outcome', 'pipeline_dry_run_returned')
      .gte('created_at', cooldownFloorIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[settings/run-brief] dry-run cooldown lookup failed:', error.message);
      return null;
    }

    return data ?? null;
  } catch (error: unknown) {
    console.warn(
      '[settings/run-brief] dry-run cooldown lookup threw:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

async function findLatestPipelineRun(userId: string): Promise<LatestPipelineRunRow | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('id, created_at, outcome, phase')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[settings/run-brief] latest pipeline run lookup failed:', error.message);
      return null;
    }

    return (data as LatestPipelineRunRow | null) ?? null;
  } catch (error: unknown) {
    console.warn(
      '[settings/run-brief] latest pipeline run lookup threw:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

async function findLatestActionMetadata(userId: string): Promise<LatestActionMetadataRow | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('tkg_actions')
      .select('id, generated_at, status, action_type, confidence')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[settings/run-brief] latest action lookup failed:', error.message);
      return null;
    }

    return (data as LatestActionMetadataRow | null) ?? null;
  } catch (error: unknown) {
    console.warn(
      '[settings/run-brief] latest action lookup threw:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

type CheapDryRunFacts = {
  latest_action: LatestActionMetadataRow | null;
  latest_pipeline_run: LatestPipelineRunRow | null;
  pending_approval: {
    id: string;
    generated_at: string;
  } | null;
  recent_dry_run: {
    id: string;
    created_at: string | null;
  } | null;
};

function buildCheapDryRunResponse(input: {
  facts: CheapDryRunFacts;
  paidLlmEffective: boolean;
  paidLlmRequested: boolean;
  pipelineDryRun: boolean;
}) {
  return NextResponse.json({
    ok: true,
    spend_policy: {
      pipeline_dry_run: input.pipelineDryRun,
      paid_llm_requested: input.paidLlmRequested,
      paid_llm_effective: input.paidLlmEffective,
    },
    short_circuit: {
      reason: 'cheap_dry_run',
      mode: 'status_only',
    },
    revision: getDeployRevision(),
    health: {
      mode: 'cheap_dry_run',
      live_generation_executed: false,
      live_sync_executed: false,
    },
    facts: input.facts,
    stages: {
      sync_microsoft: {
        ok: true,
        provider: 'microsoft',
        skipped: true,
        error: 'cheap_dry_run',
      },
      sync_google: {
        ok: true,
        provider: 'google',
        skipped: true,
        error: 'cheap_dry_run',
      },
      daily_brief: {
        ok: true,
        status: 'short_circuited',
        reason: 'cheap_dry_run',
        manual_send_fallback_attempted: false,
      },
    },
  }, { status: 200 });
}

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = auth.userId;
    const url = new URL(request.url);
    const forceFreshRun = url.searchParams.get('force') === 'true';
    const explicitDryRun = url.searchParams.get('dry_run') === 'true';
    const useLlm = url.searchParams.get('use_llm') === 'true';
    const spend = resolveSettingsRunBriefPipelineDryRun({
      explicitDryRun,
      useLlm,
    });
    const { pipelineDryRun, paidLlmRequested, paidLlmEffective } = spend;
    const [reusablePendingApproval, recentPipelineDryRun, latestActionMetadata, latestPipelineRun] =
      pipelineDryRun
        ? await Promise.all([
            findReusablePendingApproval(userId),
            findRecentPipelineDryRun(userId),
            findLatestActionMetadata(userId),
            findLatestPipelineRun(userId),
          ])
        : [null, null, null, null];

    if (pipelineDryRun) {
      return buildCheapDryRunResponse({
        pipelineDryRun,
        paidLlmRequested,
        paidLlmEffective,
        facts: {
          latest_action: latestActionMetadata,
          latest_pipeline_run: latestPipelineRun,
          pending_approval: reusablePendingApproval
            ? {
                id: reusablePendingApproval.id,
                generated_at: reusablePendingApproval.generated_at,
              }
            : null,
          recent_dry_run: recentPipelineDryRun
            ? {
                id: recentPipelineDryRun.id,
                created_at: recentPipelineDryRun.created_at,
              }
            : null,
        },
      });
    }

    const [syncMicrosoftResult, syncGoogleResult] = await Promise.all([
      withSyncTimeout(
        runManualSync('microsoft', userId),
        { ok: true, provider: 'microsoft' as const, skipped: true, error: 'sync_timeout_15s' },
      ),
      withSyncTimeout(
        runManualSync('google', userId),
        { ok: true, provider: 'google' as const, skipped: true, error: 'sync_timeout_15s' },
      ),
    ]);

    // Ceiling defense is a nightly batch (all users). Running it here per-click
    // was adding 15-30s overhead and causing 504s. Nightly-ops handles it at 4am.
    const { result: dailyBrief, sendFallbackAttempted } = await runBriefLifecycle({
      userIds: [userId],
      ensureSend: !pipelineDryRun,
      briefInvocationSource: 'settings_run_brief',
      skipStaleGate: true,
      skipSpendCap: false,
      skipManualCallLimit: false,
      ...(forceFreshRun ? { forceFreshRun: true } : {}),
      ...(pipelineDryRun ? { pipelineDryRun: true } : {}),
    });

    const ok = dailyBrief.ok && syncMicrosoftResult.ok && syncGoogleResult.ok;

    return NextResponse.json({
      ok,
      spend_policy: {
        pipeline_dry_run: pipelineDryRun,
        paid_llm_requested: paidLlmRequested,
        paid_llm_effective: paidLlmEffective,
      },
      stages: {
        sync_microsoft: syncMicrosoftResult,
        sync_google: syncGoogleResult,
        daily_brief: {
          ...dailyBrief,
          manual_send_fallback_attempted: sendFallbackAttempted,
        },
      },
    }, { status: ok ? 200 : 207 });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'settings/run-brief');
  }
}
