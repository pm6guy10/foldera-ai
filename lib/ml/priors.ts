/**
 * Load pooled global priors (smoothed approve rates by bucket). Service-role only.
 */

import { createServerClient } from '@/lib/db/client';

const CACHE_TTL_MS = 60_000;
let cachedMap: Map<string, number> | null = null;
let cachedAt = 0;

type MlPriorRow = {
  bucket_key?: unknown;
  approve_rate?: unknown;
  smoothed_approve_rate?: unknown;
};

/**
 * Returns map bucket_key -> approve-rate prior (0–1). Empty map on failure.
 * Supports both the current production columns and the older local-dev shape.
 * Short in-memory cache to avoid hammering DB inside tight scorer loops.
 */
export async function fetchGlobalMlPriorMap(): Promise<Map<string, number>> {
  const now = Date.now();
  if (cachedMap && now - cachedAt < CACHE_TTL_MS) {
    return cachedMap;
  }

  const supabase = createServerClient();
  let data: MlPriorRow[] | null = null;
  let error: { message?: string } | null = null;

  for (const selectClause of ['bucket_key, approve_rate', 'bucket_key, smoothed_approve_rate']) {
    const result = await supabase
      .from('tkg_directive_ml_global_priors')
      .select(selectClause);
    if (!result.error) {
      data = (result.data ?? []) as unknown as MlPriorRow[];
      error = null;
      break;
    }
    error = result.error;
  }

  if (error || !data?.length) {
    cachedMap = new Map();
    cachedAt = now;
    return cachedMap;
  }

  const m = new Map<string, number>();
  for (const row of data) {
    const key = row.bucket_key as string;
    const rate = (row.approve_rate ?? row.smoothed_approve_rate) as number;
    if (typeof key === 'string' && typeof rate === 'number' && rate >= 0 && rate <= 1) {
      m.set(key, rate);
    }
  }
  cachedMap = m;
  cachedAt = now;
  return m;
}

/** Invalidate cache after global priors refresh or in tests. */
export function invalidateGlobalMlPriorCache(): void {
  cachedMap = null;
  cachedAt = 0;
}
