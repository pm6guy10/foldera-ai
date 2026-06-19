-- Pass 2 finding D-3 (Master Audit #445): cost_events had a user_id column but no
-- user_id-leading index, while its twin api_usage does (idx_api_usage_user_date).
-- Add the matching composite so per-user cost lookups don't seq-scan as the table grows.
CREATE INDEX IF NOT EXISTS idx_cost_events_user_created
  ON public.cost_events USING btree (user_id, created_at DESC);
