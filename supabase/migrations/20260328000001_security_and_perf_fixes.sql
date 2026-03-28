-- Fix Supabase linter warnings: RLS, duplicate index, function search_path

-- 1. Enable RLS on tkg_constraints (SECURITY: rls_disabled_in_public)
ALTER TABLE public.tkg_constraints ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (matches pattern used by other tables)
CREATE POLICY "service_role_all" ON public.tkg_constraints
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Drop duplicate index on api_usage (PERFORMANCE: duplicate_index)
-- idx_api_usage_daily and idx_api_usage_user_date are identical — keep one
DROP INDEX IF EXISTS idx_api_usage_daily;

-- 3. Fix mutable search_path on function (SECURITY: function_search_path_mutable)
ALTER FUNCTION public.get_auth_user_id_by_email SET search_path = '';

-- 4. Add composite index on tkg_signals for the heaviest query pattern
-- (user_id, processed, occurred_at) — covers the top 3 slowest queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tkg_signals_user_processed_occurred
  ON public.tkg_signals (user_id, processed, occurred_at DESC);

-- 5. Add index on tkg_signals (user_id, created_at) for the signal retention cleanup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tkg_signals_user_created
  ON public.tkg_signals (user_id, created_at);
