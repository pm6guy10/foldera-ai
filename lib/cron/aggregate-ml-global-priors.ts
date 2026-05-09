/**
 * Nightly: recompute tkg_directive_ml_global_priors from labeled snapshots.
 * Only terminal outcomes; min sample count per bucket to avoid re-identification noise.
 */

import { createServerClient } from '@/lib/db/client';

const MIN_BUCKET_SAMPLES = 3;

type Agg = {
  approved: number;
  skipped: number;
  rejected: number;
  executed: number;
  failed: number;
};

function smoothedRate(agg: Agg): number {
  const pos = agg.executed + agg.approved;
  const neg = agg.skipped + agg.rejected + agg.failed;
  const total = pos + neg;
  return (pos + 1) / (total + 2);
}

async function insertGlobalPrior(
  supabase: ReturnType<typeof createServerClient>,
  payload: {
    bucket_key: string;
    approve_count: number;
    skip_count: number;
    total_count: number;
    approve_rate: number;
    updated_at: string;
    approved_count: number;
    skipped_count: number;
    rejected_count: number;
    executed_count: number;
    failed_count: number;
    total_labeled: number;
    smoothed_approve_rate: number;
  },
) {
  const primaryInsert = await supabase.from('tkg_directive_ml_global_priors').insert({
    bucket_key: payload.bucket_key,
    approve_count: payload.approve_count,
    skip_count: payload.skip_count,
    total_count: payload.total_count,
    approve_rate: payload.approve_rate,
    updated_at: payload.updated_at,
  });
  if (!primaryInsert.error) {
    return null;
  }

  const fallbackInsert = await supabase.from('tkg_directive_ml_global_priors').insert({
    bucket_key: payload.bucket_key,
    approved_count: payload.approved_count,
    skipped_count: payload.skipped_count,
    rejected_count: payload.rejected_count,
    executed_count: payload.executed_count,
    failed_count: payload.failed_count,
    total_labeled: payload.total_labeled,
    smoothed_approve_rate: payload.smoothed_approve_rate,
    updated_at: payload.updated_at,
  });
  return fallbackInsert.error;
}

export async function runAggregateMlGlobalPriors(): Promise<{
  bucketsWritten: number;
  snapshotsLabeled: number;
  error: string | null;
}> {
  const supabase = createServerClient();

  const { data: rows, error: fetchErr } = await supabase
    .from('tkg_directive_ml_snapshots')
    .select('bucket_key, outcome_label')
    .neq('outcome_label', 'pending')
    .neq('outcome_label', 'no_send_generated');

  if (fetchErr) {
    return { bucketsWritten: 0, snapshotsLabeled: 0, error: fetchErr.message };
  }

  const byBucket = new Map<string, Agg>();

  for (const row of rows ?? []) {
    const key = row.bucket_key as string;
    const label = row.outcome_label as string;
    if (!key) continue;

    let agg = byBucket.get(key);
    if (!agg) {
      agg = { approved: 0, skipped: 0, rejected: 0, executed: 0, failed: 0 };
      byBucket.set(key, agg);
    }

    switch (label) {
      case 'approved':
        agg.approved++;
        break;
      case 'skipped':
        agg.skipped++;
        break;
      case 'rejected':
        agg.rejected++;
        break;
      case 'executed':
        agg.executed++;
        break;
      case 'failed':
        agg.failed++;
        break;
      default:
        break;
    }
  }

  const { error: delErr } = await supabase
    .from('tkg_directive_ml_global_priors')
    .delete()
    .neq('bucket_key', '__never__');
  if (delErr) {
    return { bucketsWritten: 0, snapshotsLabeled: rows?.length ?? 0, error: delErr.message };
  }

  const now = new Date().toISOString();
  let bucketsWritten = 0;

  for (const [bucket_key, agg] of byBucket) {
    const total = agg.approved + agg.skipped + agg.rejected + agg.executed + agg.failed;
    if (total < MIN_BUCKET_SAMPLES) continue;

    const smoothed_approve_rate = smoothedRate(agg);
    const insErr = await insertGlobalPrior(supabase, {
      bucket_key,
      approve_count: agg.approved + agg.executed,
      skip_count: agg.skipped + agg.rejected + agg.failed,
      total_count: total,
      approve_rate: smoothed_approve_rate,
      updated_at: now,
      approved_count: agg.approved,
      skipped_count: agg.skipped,
      rejected_count: agg.rejected,
      executed_count: agg.executed,
      failed_count: agg.failed,
      total_labeled: total,
      smoothed_approve_rate,
    });
    if (!insErr) bucketsWritten++;
  }

  const { invalidateGlobalMlPriorCache } = await import('@/lib/ml/priors');
  invalidateGlobalMlPriorCache();

  return { bucketsWritten, snapshotsLabeled: rows?.length ?? 0, error: null };
}
