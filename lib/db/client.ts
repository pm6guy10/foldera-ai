import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type { SupabaseClient };

/**
 * Returns a Supabase admin client using the service-role key.
 * Call inside each request handler or lib function — never at module level.
 * Throws if env vars are missing so misconfiguration surfaces at call time.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}
