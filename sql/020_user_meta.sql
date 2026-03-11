-- tkg_user_meta: tracks free directive usage and trial expiry per onboarding user
CREATE TABLE IF NOT EXISTS public.tkg_user_meta (
  user_id         TEXT PRIMARY KEY,
  free_directive_used  BOOLEAN NOT NULL DEFAULT FALSE,
  free_directive_date  TIMESTAMPTZ,
  -- NULL = permanent (subscribed). Non-null = trial data expires at this time.
  graph_expires_at     TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: service role only (no public access)
ALTER TABLE public.tkg_user_meta ENABLE ROW LEVEL SECURITY;

-- Index for the cleanup cron
CREATE INDEX IF NOT EXISTS idx_user_meta_expires ON public.tkg_user_meta (graph_expires_at)
  WHERE graph_expires_at IS NOT NULL;
