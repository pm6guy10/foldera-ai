import { NextRequest, NextResponse } from 'next/server';
import { getDeployBuildLabel, getDeployRevision } from '@/lib/config/deploy-revision';
import { createServerClient } from '@/lib/db/client';
import { checkApiCreditCanary } from '@/lib/cron/acceptance-gate';
import { REQUEST_ID_HEADER, resolveRequestIdForRequest } from '@/lib/utils/request-id-core';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Health endpoint — two depths:
// - Default (lite): one DB round-trip + env + canary. Use for UptimeRobot, link checks,
//   and anything that hammers the URL often — avoids ~25 schema queries + 3 RPCs.
// - ?depth=full (or ?full=1): column + RPC contract used by cron alerts, schema smoke.
// The nightly health-check and prod schema smoke use depth=full.
// ─────────────────────────────────────────────────────────────────────────────

// [table, column] — verified by attempting a zero-row select
const REQUIRED_COLUMNS: [string, string][] = [
  ['tkg_goals', 'status'],
  ['tkg_goals', 'current_priority'],
  ['tkg_goals', 'entity_id'],
  ['tkg_goals', 'goal_type'],
  ['tkg_goals', 'updated_at'],
  ['tkg_signals', 'outcome_label'],
  ['tkg_signals', 'content_hash'],
  ['tkg_signals', 'processed'],
  ['tkg_actions', 'artifact'],
  ['tkg_actions', 'skip_reason'],
  ['tkg_actions', 'generation_attempts'],
  ['tkg_commitments', 'suppressed_at'],
  ['tkg_commitments', 'suppressed_reason'],
  ['user_tokens', 'disconnected_at'],
  ['user_tokens', 'last_health_alert_at'],
  ['user_tokens', 'refresh_token'],
  ['user_subscriptions', 'user_id'],
  ['user_subscriptions', 'data_deletion_scheduled_at'],
  ['api_usage', 'endpoint'],
  ['api_usage', 'estimated_cost'],
  ['tkg_pattern_metrics', 'user_id'],
];

function wantsFullHealth(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  return p.get('depth') === 'full' || p.get('full') === '1';
}

/** Column + RPC validation — only for depth=full and reachable DB. */
async function runSchemaProbes(
  supabase: NonNullable<ReturnType<typeof createServerClient>>,
): Promise<string[]> {
  const schemaErrors: string[] = [];

  for (const [table, col] of REQUIRED_COLUMNS) {
    try {
      const { error } = await supabase
        .from(table as 'tkg_goals')
        .select(col)
        .limit(0);
      if (error?.code === '42703' || error?.message?.includes('does not exist')) {
        schemaErrors.push(`column missing: ${table}.${col}`);
      }
    } catch {
      schemaErrors.push(`column check failed: ${table}.${col}`);
    }
  }

  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [
    { fn: 'get_auth_user_id_by_email', params: { lookup_email: '__health_check__' } },
    { fn: 'replace_onboarding_goals', params: { p_user_id: '00000000-0000-0000-0000-000000000000', p_rows: [] } },
    { fn: 'replace_current_priorities', params: { p_user_id: '00000000-0000-0000-0000-000000000000', p_rows: [] } },
  ];
  for (const { fn, params } of rpcCalls) {
    try {
      const { error } = await supabase.rpc(fn as 'get_auth_user_id_by_email', params as never);
      if (error?.code === 'PGRST202' || error?.code === '42883') {
        schemaErrors.push(`rpc missing: ${fn}`);
      }
    } catch {
      schemaErrors.push(`rpc check failed: ${fn}`);
    }
  }

  return schemaErrors;
}

export async function GET(request: NextRequest) {
  const full = wantsFullHealth(request);
  const requestId = resolveRequestIdForRequest(request.headers.get(REQUEST_ID_HEADER));

  const hasSupabaseCfg = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );

  let dbOk = false;
  let supabase: ReturnType<typeof createServerClient> | null = null;

  if (hasSupabaseCfg) {
    try {
      supabase = createServerClient();
      const { error } = await supabase.from('tkg_goals').select('id').limit(1);
      dbOk = !error;
    } catch {
      dbOk = false;
      supabase = null;
    }
  }

  let schemaErrors: string[] = [];
  if (full && dbOk && supabase) {
    schemaErrors = await runSchemaProbes(supabase);
  }

  const envOk = !!(
    process.env.ANTHROPIC_API_KEY &&
    process.env.RESEND_API_KEY &&
    process.env.ENCRYPTION_KEY
  );

  let creditOk = true;
  let creditError: string | undefined;
  if (envOk) {
    try {
      const canary = await checkApiCreditCanary();
      creditOk = canary.pass;
      if (!canary.pass) creditError = canary.detail;
    } catch (err) {
      creditOk = false;
      creditError = err instanceof Error ? err.message : 'canary threw';
    }
  }

  const schemaOk = full ? schemaErrors.length === 0 : true;
  const allOk = full
    ? dbOk && envOk && schemaOk && creditOk
    : dbOk && envOk && creditOk;

  const revision = getDeployRevision();
  const build = getDeployBuildLabel(revision);

  const headers = new Headers();
  headers.set(REQUEST_ID_HEADER, requestId);
  if (revision.git_sha) {
    headers.set('x-foldera-git-sha', revision.git_sha);
  }
  if (revision.deployment_id) {
    headers.set('x-foldera-deployment-id', revision.deployment_id);
  }

  const schemaPayload = full
    ? {
        schema: schemaOk ? ('ok' as const) : ('degraded' as const),
        ...(schemaErrors.length > 0 ? { schema_errors: schemaErrors } : {}),
      }
    : { schema: 'not_checked' as const };

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      depth: full ? 'full' : 'lite',
      ts: new Date().toISOString(),
      build,
      revision: {
        git_sha: revision.git_sha,
        git_sha_short: revision.git_sha_short,
        git_ref: revision.git_ref,
        deployment_id: revision.deployment_id,
        vercel_env: revision.vercel_env,
      },
      db: dbOk,
      env: envOk,
      ...schemaPayload,
      credits: creditOk ? 'ok' : 'degraded',
      ...(creditError ? { credit_error: creditError } : {}),
    },
    { headers },
  );
}
