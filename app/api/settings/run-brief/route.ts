import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { resolveUser } from '@/lib/auth/resolve-user';
import { getDeployRevision } from '@/lib/config/deploy-revision';
import { resolveSettingsRunBriefPipelineDryRun } from '@/lib/config/prelaunch-spend';
import { CONFIDENCE_PERSIST_THRESHOLD } from '@/lib/config/constants';
import { runBriefLifecycle } from '@/lib/cron/brief-service';
import { extractArtifact, extractSentAt } from '@/lib/cron/daily-brief-generate';
import { ACTION_RUN_BRIEF_FACTS_SELECT } from '@/lib/conviction/action-read-shapes';
import { createServerClient } from '@/lib/db/client';
import { getConnectorHealthSummary } from '@/lib/integrations/connector-health';
import { rateLimit } from '@/lib/utils/rate-limit';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import {
  getRunBriefRouteStatus,
  RUN_BRIEF_CHEAP_DRY_RUN_STAGE,
  RUN_BRIEF_TRANSPORT_DIAGNOSTIC_INVOCATION_SOURCE,
  RUN_BRIEF_TRANSPORT_DIAGNOSTIC_OUTCOME,
  RUN_BRIEF_TRANSPORT_DIAGNOSTIC_PARAM,
} from './contract';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const DRY_RUN_SERVER_COOLDOWN_MS = 5 * 60 * 1000;
const DRY_RUN_PENDING_REUSE_WINDOW_HOURS = 18;
const RUN_BRIEF_ACTION_FACTS_LIMIT = 20;

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

interface TransportDiagnosticPipelineRow {
  completed_at: string | null;
  created_at: string | null;
  id: string;
  invocation_source: string | null;
  outcome: string | null;
  raw_extras: unknown;
  started_at: string | null;
}

interface RunBriefActionFactsRow extends LatestActionMetadataRow {
  execution_result: unknown;
}

interface PendingApprovalReuseRow extends RunBriefActionFactsRow {
  generated_at: string;
}

type QueryBudgetEntry = {
  call_count: number;
  row_limit: number | null;
  selected_columns: string;
  table: string;
};

type QueryBudgetRecorder = {
  record: (input: Omit<QueryBudgetEntry, 'call_count'>) => void;
  receipt: () => {
    duplicate_read_guard: {
      tkg_actions: 'one action-facts read covers reusable pending approval + latest action metadata for the same user/run';
      tkg_goals: 'no run-brief route read';
      tkg_signals: 'no run-brief route content read';
      auth_admin_user_lookup: 'no run-brief route admin lookup';
    };
    egress_target: {
      green_monthly_gb: 5;
      safe_green_daily_mb: 125;
      warning_daily_mb: '125-160';
      fail_daily_mb: '>160';
    };
    route: 'settings/run-brief';
    tables: QueryBudgetEntry[];
  };
};

function createQueryBudgetRecorder(): QueryBudgetRecorder {
  const entries = new Map<string, QueryBudgetEntry>();
  return {
    record(input) {
      const key = `${input.table}:${input.selected_columns}:${input.row_limit ?? 'none'}`;
      const existing = entries.get(key);
      if (existing) {
        existing.call_count += 1;
        return;
      }
      entries.set(key, { ...input, call_count: 1 });
    },
    receipt() {
      return {
        route: 'settings/run-brief',
        tables: [...entries.values()].sort((a, b) => a.table.localeCompare(b.table)),
        duplicate_read_guard: {
          tkg_actions:
            'one action-facts read covers reusable pending approval + latest action metadata for the same user/run',
          tkg_goals: 'no run-brief route read',
          tkg_signals: 'no run-brief route content read',
          auth_admin_user_lookup: 'no run-brief route admin lookup',
        },
        egress_target: {
          green_monthly_gb: 5,
          safe_green_daily_mb: 125,
          warning_daily_mb: '125-160',
          fail_daily_mb: '>160',
        },
      };
    },
  };
}

function isReusablePendingApproval(
  row: RunBriefActionFactsRow,
  staleCutoffIso: string,
): row is PendingApprovalReuseRow {
  if (typeof row.generated_at !== 'string' || row.generated_at.trim().length === 0) return false;
  if (row.generated_at < staleCutoffIso) return false;
  if (row.status !== 'pending_approval') return false;
  if (row.action_type === 'do_nothing') return false;
  if (typeof row.confidence !== 'number' || row.confidence < CONFIDENCE_PERSIST_THRESHOLD) return false;
  if (extractArtifact(row.execution_result) === null) return false;
  if (extractSentAt(row.execution_result)) return false;
  return true;
}

function latestActionMetadataFromRows(rows: RunBriefActionFactsRow[]): LatestActionMetadataRow | null {
  const latest = rows[0];
  if (!latest) return null;
  return {
    id: latest.id,
    generated_at: latest.generated_at,
    status: latest.status,
    action_type: latest.action_type,
    confidence: latest.confidence,
  };
}

async function fetchRunBriefActionFacts(
  userId: string,
  queryBudget: QueryBudgetRecorder,
): Promise<{
  latestAction: LatestActionMetadataRow | null;
  pendingApproval: PendingApprovalReuseRow | null;
}> {
  try {
    const supabase = createServerClient();
    const staleCutoffIso = new Date(
      Date.now() - DRY_RUN_PENDING_REUSE_WINDOW_HOURS * 3_600_000,
    ).toISOString();

    queryBudget.record({
      table: 'tkg_actions',
      selected_columns: ACTION_RUN_BRIEF_FACTS_SELECT,
      row_limit: RUN_BRIEF_ACTION_FACTS_LIMIT,
    });

    const { data, error } = await supabase
      .from('tkg_actions')
      .select(ACTION_RUN_BRIEF_FACTS_SELECT)
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(RUN_BRIEF_ACTION_FACTS_LIMIT);

    if (error) {
      console.warn('[settings/run-brief] action facts lookup failed:', error.message);
      return { latestAction: null, pendingApproval: null };
    }

    const rows = (data ?? []) as RunBriefActionFactsRow[];
    return {
      latestAction: latestActionMetadataFromRows(rows),
      pendingApproval: rows.find((row) => isReusablePendingApproval(row, staleCutoffIso)) ?? null,
    };
  } catch (error: unknown) {
    console.warn(
      '[settings/run-brief] action facts lookup threw:',
      error instanceof Error ? error.message : String(error),
    );
    return { latestAction: null, pendingApproval: null };
  }
}

async function findRecentPipelineDryRun(
  userId: string,
  queryBudget: QueryBudgetRecorder,
): Promise<RecentDryRunRow | null> {
  try {
    const supabase = createServerClient();
    const cooldownFloorIso = new Date(Date.now() - DRY_RUN_SERVER_COOLDOWN_MS).toISOString();
    queryBudget.record({
      table: 'pipeline_runs',
      selected_columns: 'id, created_at',
      row_limit: 1,
    });
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

async function findLatestPipelineRun(
  userId: string,
  queryBudget: QueryBudgetRecorder,
): Promise<LatestPipelineRunRow | null> {
  try {
    const supabase = createServerClient();
    queryBudget.record({
      table: 'pipeline_runs',
      selected_columns: 'id, created_at, outcome, phase',
      row_limit: 1,
    });
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

type TransportDiagnosticReceipt = {
  auth_resolved: true;
  lifecycle_started: false;
  paid_generation_started: false;
  receipt: {
    completed_at: string | null;
    created_at: string | null;
    id: string;
    invocation_source: string | null;
    outcome: string | null;
    started_at: string | null;
  } | null;
  receipt_error?: string;
  receipt_persisted: boolean;
  receipt_read_back: boolean;
  route_entered: true;
};

async function persistTransportDiagnosticReceipt(input: {
  forceFreshRun: boolean;
  paidLlmEffective: boolean;
  paidLlmRequested: boolean;
  pipelineDryRun: boolean;
  queryBudget: QueryBudgetRecorder;
  requestUrl: URL;
  revision: ReturnType<typeof getDeployRevision>;
  userId: string;
}): Promise<TransportDiagnosticReceipt> {
  const supabase = createServerClient();
  const receiptId = randomUUID();
  const receivedAt = new Date().toISOString();
  const rawExtras = {
    receipt_type: 'settings_run_brief_transport_diagnostic',
    route: 'settings/run-brief',
    route_entered: true,
    auth_resolved: true,
    request_received_at: receivedAt,
    request_path: input.requestUrl.pathname,
    request_flags: {
      force: input.forceFreshRun,
      dry_run: true,
      transport_diagnostic: true,
      use_llm_requested: input.paidLlmRequested,
    },
    revision: input.revision,
    spend_policy: {
      pipeline_dry_run: input.pipelineDryRun,
      paid_llm_requested: input.paidLlmRequested,
      paid_llm_effective: input.paidLlmEffective,
    },
    lifecycle_started: false,
    paid_generation_started: false,
    live_generation_executed: false,
    live_sync_executed: false,
  };

  input.queryBudget.record({
    table: 'pipeline_runs',
    selected_columns: 'insert transport diagnostic receipt',
    row_limit: 1,
  });
  const { error: insertError } = await supabase.from('pipeline_runs').insert({
    id: receiptId,
    phase: 'user_run',
    invocation_source: RUN_BRIEF_TRANSPORT_DIAGNOSTIC_INVOCATION_SOURCE,
    cron_invocation_id: receiptId,
    user_id: input.userId,
    started_at: receivedAt,
    completed_at: receivedAt,
    outcome: RUN_BRIEF_TRANSPORT_DIAGNOSTIC_OUTCOME,
    duration_ms: 0,
    gate_funnel: {
      status: 'route_entered_before_lifecycle',
      auth_resolved: true,
      lifecycle_started: false,
      paid_generation_started: false,
    },
    delivery: {},
    raw_extras: rawExtras,
  });

  if (insertError) {
    return {
      route_entered: true,
      auth_resolved: true,
      lifecycle_started: false,
      paid_generation_started: false,
      receipt_persisted: false,
      receipt_read_back: false,
      receipt: null,
      receipt_error: insertError.message,
    };
  }

  input.queryBudget.record({
    table: 'pipeline_runs',
    selected_columns: 'id, created_at, started_at, completed_at, outcome, invocation_source, raw_extras',
    row_limit: 1,
  });
  const { data, error: readError } = await supabase
    .from('pipeline_runs')
    .select('id, created_at, started_at, completed_at, outcome, invocation_source, raw_extras')
    .eq('id', receiptId)
    .eq('user_id', input.userId)
    .limit(1)
    .maybeSingle();

  if (readError) {
    return {
      route_entered: true,
      auth_resolved: true,
      lifecycle_started: false,
      paid_generation_started: false,
      receipt_persisted: true,
      receipt_read_back: false,
      receipt: null,
      receipt_error: readError.message,
    };
  }

  const row = (data as TransportDiagnosticPipelineRow | null) ?? null;
  return {
    route_entered: true,
    auth_resolved: true,
    lifecycle_started: false,
    paid_generation_started: false,
    receipt_persisted: true,
    receipt_read_back: Boolean(row?.id),
    receipt: row
      ? {
          id: row.id,
          created_at: row.created_at,
          started_at: row.started_at,
          completed_at: row.completed_at,
          outcome: row.outcome,
          invocation_source: row.invocation_source,
        }
      : null,
    ...(row?.id ? {} : { receipt_error: 'receipt_inserted_but_not_read_back' }),
  };
}

function buildCheapDryRunResponse(input: {
  connectorHealth: Awaited<ReturnType<typeof getConnectorHealthSummary>>;
  facts: CheapDryRunFacts;
  paidLlmEffective: boolean;
  paidLlmRequested: boolean;
  pipelineDryRun: boolean;
  queryBudget: QueryBudgetRecorder;
  transportDiagnostic?: TransportDiagnosticReceipt | null;
}) {
  const diagnosticOk = input.transportDiagnostic
    ? input.transportDiagnostic.receipt_persisted && input.transportDiagnostic.receipt_read_back
    : true;
  const mode = input.transportDiagnostic ? 'transport_diagnostic' : 'status_only';

  return NextResponse.json(
    {
      ok: diagnosticOk,
      spend_policy: {
        pipeline_dry_run: input.pipelineDryRun,
        paid_llm_requested: input.paidLlmRequested,
        paid_llm_effective: input.paidLlmEffective,
      },
      short_circuit: {
        reason: 'cheap_dry_run',
        mode,
      },
      revision: getDeployRevision(),
      health: {
        mode: input.transportDiagnostic ? 'transport_diagnostic' : 'cheap_dry_run',
        live_generation_executed: false,
        live_sync_executed: false,
      },
      ...(input.transportDiagnostic ? { transport_diagnostic: input.transportDiagnostic } : {}),
      connector_health: input.connectorHealth,
      facts: input.facts,
      query_budget: input.queryBudget.receipt(),
      stages: {
        daily_brief: { ...RUN_BRIEF_CHEAP_DRY_RUN_STAGE },
      },
    },
    { status: getRunBriefRouteStatus(diagnosticOk) },
  );
}

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  const queryBudget = createQueryBudgetRecorder();

  try {
    const userId = auth.userId;
    const url = new URL(request.url);
    const forceFreshRun = url.searchParams.get('force') === 'true';
    const transportDiagnostic = url.searchParams.get(RUN_BRIEF_TRANSPORT_DIAGNOSTIC_PARAM) === 'true';
    const explicitDryRun = url.searchParams.get('dry_run') === 'true' || transportDiagnostic;
    const useLlm = url.searchParams.get('use_llm') === 'true';
    const spend = resolveSettingsRunBriefPipelineDryRun({
      explicitDryRun,
      useLlm,
    });
    const { pipelineDryRun, paidLlmRequested, paidLlmEffective } = spend;
    const rl = await rateLimit(`run-brief:${userId}`, { limit: 2, window: 600 });
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Run brief rate limit exceeded. Try again shortly.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)),
          },
        },
      );
    }
    const revision = getDeployRevision();
    const connectorHealth = await getConnectorHealthSummary({ userId });
    const transportDiagnosticReceipt =
      pipelineDryRun && transportDiagnostic
        ? await persistTransportDiagnosticReceipt({
            userId,
            requestUrl: url,
            forceFreshRun,
            pipelineDryRun,
            paidLlmRequested,
            paidLlmEffective,
            revision,
            queryBudget,
          })
        : null;
    const [actionFacts, recentPipelineDryRun, latestPipelineRun] = pipelineDryRun
      ? await Promise.all([
          fetchRunBriefActionFacts(userId, queryBudget),
          findRecentPipelineDryRun(userId, queryBudget),
          findLatestPipelineRun(userId, queryBudget),
        ])
      : [{ latestAction: null, pendingApproval: null }, null, null];

    if (pipelineDryRun) {
      return buildCheapDryRunResponse({
        connectorHealth,
        pipelineDryRun,
        paidLlmRequested,
        paidLlmEffective,
        transportDiagnostic: transportDiagnosticReceipt,
        queryBudget,
        facts: {
          latest_action: actionFacts.latestAction,
          latest_pipeline_run: latestPipelineRun,
          pending_approval: actionFacts.pendingApproval
            ? {
                id: actionFacts.pendingApproval.id,
                generated_at: actionFacts.pendingApproval.generated_at,
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

    if (connectorHealth.generation_gate.level === 'block') {
      return NextResponse.json(
        {
          ok: false,
          spend_policy: {
            pipeline_dry_run: pipelineDryRun,
            paid_llm_requested: paidLlmRequested,
            paid_llm_effective: paidLlmEffective,
          },
          short_circuit: {
            reason: 'connector_health_blocked',
            mode: 'live_generation_guard',
          },
          revision,
          health: {
            mode: 'connector_health_blocked',
            live_generation_executed: false,
            live_sync_executed: false,
          },
          connector_health: connectorHealth,
          query_budget: queryBudget.receipt(),
        },
        { status: getRunBriefRouteStatus(false) },
      );
    }

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

    const ok = dailyBrief.ok;

    return NextResponse.json(
      {
        ok,
        spend_policy: {
          pipeline_dry_run: pipelineDryRun,
          paid_llm_requested: paidLlmRequested,
          paid_llm_effective: paidLlmEffective,
        },
        connector_health: connectorHealth,
        query_budget: queryBudget.receipt(),
        stages: {
          daily_brief: {
            ...dailyBrief,
            manual_send_fallback_attempted: sendFallbackAttempted,
          },
        },
      },
      { status: getRunBriefRouteStatus(ok) },
    );
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'settings/run-brief');
  }
}
