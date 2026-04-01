-- Add service_role bypass policies for all tables that need them.
-- The service_role key is used by cron jobs and API routes that require
-- unrestricted access regardless of the authenticated user context.
--
-- Also tightens over-permissive public-role policies (applied in a second
-- migration named tighten_public_role_policies via MCP).

-- ── New service_role ALL policies ────────────────────────────────────────────

CREATE POLICY "service_role_all" ON api_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON signal_summaries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON tkg_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON tkg_briefings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON tkg_commitments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON tkg_conflicts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON tkg_entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON tkg_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON tkg_goals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON tkg_pattern_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON tkg_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON tkg_user_meta
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON user_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON referral_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON waitlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Tighten over-permissive public-role policies ──────────────────────────────

-- referral_accounts: drop the legacy "service_role_only" policy that incorrectly
-- granted ALL to public.
DROP POLICY IF EXISTS "service_role_only" ON referral_accounts;

-- user_subscriptions: same legacy misconfigured policy.
DROP POLICY IF EXISTS "service_role_only" ON user_subscriptions;

-- user_tokens: replace ALL-to-public with SELECT-only for authenticated users.
-- service_role handles INSERT/UPDATE/DELETE via separate policy.
DROP POLICY IF EXISTS "users_own_tokens" ON user_tokens;

CREATE POLICY "users_read_own_tokens" ON user_tokens
  FOR SELECT TO authenticated
  USING (user_id::text = auth.uid()::text);

-- tkg_goals: scope "Users manage own goals" from public ALL to authenticated ALL.
DROP POLICY IF EXISTS "Users manage own goals" ON tkg_goals;

CREATE POLICY "users_manage_own_goals" ON tkg_goals
  FOR ALL TO authenticated
  USING (user_id::text = auth.uid()::text)
  WITH CHECK (user_id::text = auth.uid()::text);

-- signal_summaries: drop any public ALL policies, create authenticated-only.
DROP POLICY IF EXISTS "Users manage own summaries" ON signal_summaries;
DROP POLICY IF EXISTS "users_manage_own_summaries" ON signal_summaries;
DROP POLICY IF EXISTS "service_role_only" ON signal_summaries;

CREATE POLICY "users_manage_own_summaries" ON signal_summaries
  FOR ALL TO authenticated
  USING (user_id::text = auth.uid()::text)
  WITH CHECK (user_id::text = auth.uid()::text);

-- tkg_pattern_metrics: same pattern.
DROP POLICY IF EXISTS "Users manage own pattern metrics" ON tkg_pattern_metrics;
DROP POLICY IF EXISTS "users_manage_own_pattern_metrics" ON tkg_pattern_metrics;
DROP POLICY IF EXISTS "service_role_only" ON tkg_pattern_metrics;

CREATE POLICY "users_manage_own_pattern_metrics" ON tkg_pattern_metrics
  FOR ALL TO authenticated
  USING (user_id::text = auth.uid()::text)
  WITH CHECK (user_id::text = auth.uid()::text);
