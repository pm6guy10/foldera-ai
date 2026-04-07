-- PostgREST upsert onConflict(user_id,content_hash) requires a non-partial unique index
-- arbiter. Partial index tkg_signals_user_content_hash_idx (WHERE content_hash IS NOT NULL)
-- caused Postgres 42P10 "no unique or exclusion constraint matching the ON CONFLICT specification"
-- for sync upserts even though content_hash is NOT NULL.
DROP INDEX IF EXISTS public.tkg_signals_user_content_hash_idx;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tkg_signals_user_content_hash
  ON public.tkg_signals (user_id, content_hash);
