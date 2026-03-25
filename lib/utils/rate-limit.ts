/**
 * Supabase-backed rate limiting.
 *
 * Uses the api_usage table to count recent requests per user+endpoint.
 * Survives Vercel cold starts (unlike the previous in-memory Map).
 */

import { createServerClient } from '@/lib/db/client';

interface RateLimitConfig {
  limit: number;      // Max requests per window
  window: number;     // Time window in seconds
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: Date;
}

export async function rateLimit(
  identifier: string,
  config: RateLimitConfig = { limit: 10, window: 60 }
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = config.window * 1000;
  const windowStart = new Date(now - windowMs).toISOString();
  const resetAt = new Date(now + windowMs);

  const supabase = createServerClient();

  // Count recent rows for this identifier in the window
  const { count, error } = await supabase
    .from('api_usage')
    .select('id', { count: 'exact', head: true })
    .eq('endpoint', identifier)
    .gte('created_at', windowStart);

  if (error) {
    // On DB error, fail open (allow the request) to avoid blocking legitimate traffic
    console.warn('[rate-limit] DB query failed, allowing request:', error.message);
    return { success: true, remaining: config.limit - 1, resetAt };
  }

  const currentCount = count ?? 0;

  if (currentCount >= config.limit) {
    return { success: false, remaining: 0, resetAt };
  }

  // Insert a tracking row
  await supabase.from('api_usage').insert({
    endpoint: identifier,
    model: 'rate_limit',
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost: 0,
  });

  return {
    success: true,
    remaining: config.limit - currentCount - 1,
    resetAt,
  };
}
