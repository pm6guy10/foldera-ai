/**
 * Last N pipeline_runs rows — session start observability (npm run scoreboard).
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const LIMIT = 7;

function formatPt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: rows, error } = await supabase
    .from('pipeline_runs')
    .select(
      'id, created_at, phase, invocation_source, cron_invocation_id, user_id, outcome, duration_ms, winner_action_type, winner_confidence, blocked_gate, gate_funnel, api_spend_snapshot, delivery, error_class',
    )
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error('pipeline_runs query failed:', error.message);
    console.error('(If migration 20260407120000 is not applied, run supabase db push.)');
    process.exit(1);
  }

  console.log('');
  console.log(`FOLDERA PIPELINE SCOREBOARD — last ${LIMIT} rows`);
  console.log('═'.repeat(72));

  for (const r of rows ?? []) {
    const row = r as Record<string, unknown>;
    const funnel = row.gate_funnel as Record<string, unknown> | null;
    const delivery = row.delivery as Record<string, unknown> | null;
    const spend = row.api_spend_snapshot as Record<string, unknown> | null;
    const filterStages = funnel?.filter_stages as Array<{ stage: string; before: number; after: number }> | undefined;
    const rejectionEntities = funnel?.rejection_filter_entities as string[] | undefined;

    console.log('');
    console.log(`${formatPt(row.created_at as string)}  ${row.phase}  ${row.invocation_source}`);
    console.log(`  cron_inv: ${String(row.cron_invocation_id).slice(0, 8)}…  user: ${row.user_id ?? '—'}`);
    console.log(`  outcome: ${row.outcome ?? '—'}  ${row.duration_ms != null ? `${row.duration_ms}ms` : ''}`);
    if (row.error_class) console.log(`  error_class: ${row.error_class}`);
    if (row.winner_action_type || row.winner_confidence != null) {
      console.log(
        `  winner: ${row.winner_action_type ?? '—'} @ ${row.winner_confidence ?? '—'}  blocked: ${row.blocked_gate ?? '—'}`,
      );
    }
    if (filterStages?.length) {
      const summary = filterStages
        .map((s) => `${s.stage}:${s.before}→${s.after}`)
        .slice(0, 6)
        .join(' | ');
      console.log(`  gates: ${summary}${filterStages.length > 6 ? ' …' : ''}`);
    }
    if (rejectionEntities?.length) {
      console.log(`  rejection_entities: ${rejectionEntities.slice(0, 12).join(', ')}${rejectionEntities.length > 12 ? ' …' : ''}`);
    }
    if (spend?.total_cents != null || spend?.total_usd != null) {
      console.log(`  api_spend: ${JSON.stringify({ cents: spend.total_cents, usd: spend.total_usd })}`);
    }
    if (delivery && Object.keys(delivery).length > 0) {
      const resendId = delivery.resend_id;
      const sentAt = delivery.email_dispatch_at;
      if (resendId || sentAt) {
        console.log(`  delivery: resend_id=${resendId ?? '—'} dispatch=${sentAt ?? '—'}`);
      }
    }
  }

  console.log('');
  console.log('═'.repeat(72));
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
