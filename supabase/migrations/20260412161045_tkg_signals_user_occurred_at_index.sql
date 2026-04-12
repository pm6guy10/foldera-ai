-- Speed up user-scoped scans ordered by occurred_at (e.g. summarizer:
-- WHERE user_id = ? AND created_at < ? ORDER BY occurred_at ASC LIMIT n).
-- Without this, Postgres uses idx_tkg_signals_user_id and sorts by occurred_at.

CREATE INDEX IF NOT EXISTS idx_tkg_signals_user_occurred_at
  ON public.tkg_signals (user_id, occurred_at);
