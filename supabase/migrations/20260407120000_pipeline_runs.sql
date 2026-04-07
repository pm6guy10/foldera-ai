-- pipeline_runs: append-only observability — cron heartbeats, per-user funnel, delivery chain.
-- Queried by npm run scoreboard; api_usage.pipeline_run_id links spend to a row.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id                    UUID PRIMARY KEY,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phase                 TEXT NOT NULL CHECK (phase IN ('cron_start', 'cron_complete', 'user_run')),
  invocation_source     TEXT NOT NULL,
  cron_invocation_id    UUID NOT NULL,
  user_id               UUID,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  outcome               TEXT,
  error_class           TEXT,
  duration_ms           INTEGER,
  gate_funnel           JSONB NOT NULL DEFAULT '{}',
  winner_action_type    TEXT,
  winner_confidence     INTEGER,
  blocked_gate          TEXT,
  candidates_evaluated  INTEGER,
  api_spend_snapshot    JSONB,
  delivery              JSONB NOT NULL DEFAULT '{}',
  raw_extras            JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created
  ON pipeline_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_cron
  ON pipeline_runs (cron_invocation_id, phase);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_created
  ON pipeline_runs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE pipeline_runs IS
  'Observability: cron start/complete markers, per-user scorer/generator funnel, Resend delivery metadata.';

ALTER TABLE public.api_usage
  ADD COLUMN IF NOT EXISTS pipeline_run_id UUID;

CREATE INDEX IF NOT EXISTS idx_api_usage_pipeline_run
  ON public.api_usage (pipeline_run_id)
  WHERE pipeline_run_id IS NOT NULL;

COMMENT ON COLUMN public.api_usage.pipeline_run_id IS
  'Optional link to pipeline_runs.id for per-run Anthropic spend rollup.';

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_pipeline_runs" ON public.pipeline_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
