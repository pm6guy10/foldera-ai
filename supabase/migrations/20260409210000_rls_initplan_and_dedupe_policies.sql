-- Supabase linter:
--   auth_rls_initplan (0003): wrap auth.uid() as (select auth.uid()) so it is not re-evaluated per row.
--   multiple_permissive_policies (0006): drop legacy duplicate permissive policies on two tables.

-- ── signal_summaries: remove duplicate policy (often created outside repo migrations) ──
DROP POLICY IF EXISTS "Users can access own signal summaries" ON signal_summaries;

DROP POLICY IF EXISTS "users_manage_own_summaries" ON signal_summaries;
CREATE POLICY "users_manage_own_summaries" ON signal_summaries
  FOR ALL TO authenticated
  USING (user_id::text = (select auth.uid())::text)
  WITH CHECK (user_id::text = (select auth.uid())::text);

-- ── tkg_pattern_metrics: legacy owner policy overlaps users_manage_own_pattern_metrics ──
DROP POLICY IF EXISTS "tkg_pattern_metrics_owner" ON tkg_pattern_metrics;

DROP POLICY IF EXISTS "users_manage_own_pattern_metrics" ON tkg_pattern_metrics;
CREATE POLICY "users_manage_own_pattern_metrics" ON tkg_pattern_metrics
  FOR ALL TO authenticated
  USING (user_id::text = (select auth.uid())::text)
  WITH CHECK (user_id::text = (select auth.uid())::text);

-- ── user_tokens / tkg_goals: initplan fix only ──
DROP POLICY IF EXISTS "users_read_own_tokens" ON user_tokens;
CREATE POLICY "users_read_own_tokens" ON user_tokens
  FOR SELECT TO authenticated
  USING (user_id::text = (select auth.uid())::text);

DROP POLICY IF EXISTS "users_manage_own_goals" ON tkg_goals;
CREATE POLICY "users_manage_own_goals" ON tkg_goals
  FOR ALL TO authenticated
  USING (user_id::text = (select auth.uid())::text)
  WITH CHECK (user_id::text = (select auth.uid())::text);
