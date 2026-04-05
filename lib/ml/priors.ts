/**
 * Load pooled global priors (smoothed approve rates by bucket). Service-role only.
 */

import { createServerClient } from '@/lib/db/client';

const CACHE_TTL_MS = 60_000;
let cachedMap: Map<string, number> | null = null;
let cachedAt = 0;

/**
 * Returns map bucket_key -> smoothed_approve_rate (0–1). Empty map on failure.
 * Short in-memory cache to avoid hammering DB inside tight scorer loops.
 */
export async function fetchGlobalMlPriorMap(): Promise<Map<string, number>> {
  const now = Date.now();
  if (cachedMap && now - cachedAt < CACHE_TTL_MS) {
    return cachedMap;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tkg_directive_ml_global_priors')
    .select('bucket_key, smoothed_approve_rate');

  if (error || !data?.length) {
    cachedMap = new Map();
    cachedAt = now;
    return cachedMap;
  }

  const m = new Map<string, number>();
  for (const row of data) {
    const key = row.bucket_key as string;
    const rate = row.smoothed_approve_rate as number;
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
