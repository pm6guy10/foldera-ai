import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Schema contract — permanent guard against migration drift.
// Every entry here must exist in production. If anything is missing,
// /api/health returns status='degraded' + schema_errors[].
// The nightly health-check and prod E2E tests both hit this endpoint.
// ─────────────────────────────────────────────────────────────────────────────

// [table, column] — verified by attempting a zero-row select
const REQUIRED_COLUMNS: [string, string][] = [
  ['tkg_goals',          'status'],
  ['tkg_goals',          'current_priority'],
  ['tkg_goals',          'entity_id'],
  ['tkg_goals',          'goal_type'],
  ['tkg_goals',          'updated_at'],
  ['tkg_signals',        'outcome_label'],
  ['tkg_signals',        'content_hash'],
  ['tkg_signals',        'processed'],
  ['tkg_actions',        'artifact'],
  ['tkg_actions',        'skip_reason'],
  ['tkg_actions',        'generation_attempts'],
  ['tkg_commitments',    'suppressed_at'],
  ['tkg_commitments',    'suppressed_reason'],
  ['user_tokens',        'disconnected_at'],
  ['user_tokens',        'last_health_alert_at'],
  ['user_tokens',        'refresh_token'],
  ['user_subscriptions', 'user_id'],
  ['user_subscriptions', 'data_deletion_scheduled_at'],
  ['api_usage',          'endpoint'],
  ['api_usage',          'estimated_cost'],
  ['tkg_pattern_metrics','user_id'],
];


export async function GET() {
  const supabase = createServerClient();
  const schemaErrors: string[] = [];

  // ── DB connectivity ────────────────────────────────────────────────────────
  let dbOk = false;
  try {
    const { error } = await supabase.from('tkg_goals').select('id').limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  // ── Schema checks (only if DB is reachable) ────────────────────────────────
  if (dbOk) {
    // Column existence: a missing column returns error code 42703
    for (const [table, col] of REQUIRED_COLUMNS) {
      try {
        const { error } = await (supabase as ReturnType<typeof createServerClient>)
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

    // RPC existence: call each with valid (but harmless) params.
    // PGRST202 = function not found by PostgREST, 42883 = undefined function.
    const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [
      { fn: 'get_auth_user_id_by_email',  params: { lookup_email: '__health_check__' } },
      // null-UUID rows don't exist, so delete/update is a safe no-op
      { fn: 'replace_onboarding_goals',   params: { p_user_id: '00000000-0000-0000-0000-000000000000', p_rows: [] } },
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
  }

  // ── Env check ──────────────────────────────────────────────────────────────
  const envOk = !!(
    process.env.ANTHROPIC_API_KEY &&
    process.env.RESEND_API_KEY &&
    process.env.ENCRYPTION_KEY
  );

  const schemaOk = schemaErrors.length === 0;
  const allOk = dbOk && envOk && schemaOk;

  return NextResponse.json({
    status: allOk ? 'ok' : 'degraded',
    ts: new Date().toISOString(),
    db: dbOk,
    env: envOk,
    schema: schemaOk ? 'ok' : 'degraded',
    ...(schemaErrors.length > 0 ? { schema_errors: schemaErrors } : {}),
  });
}
