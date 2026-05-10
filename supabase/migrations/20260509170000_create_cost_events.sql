-- cost_events: append-only estimated LLM spend ledger for dev cost inspection.
-- Mirrors api_usage at write time so diagnostics can read one canonical cost log
-- without changing product routes or generation behavior.

CREATE TABLE IF NOT EXISTS public.cost_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost DECIMAL(10, 6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  pipeline_run_id UUID
);

CREATE INDEX IF NOT EXISTS idx_cost_events_created_at
  ON public.cost_events (created_at DESC);

COMMENT ON TABLE public.cost_events IS
  'Append-only estimated LLM spend ledger for dev/operator cost summaries.';

COMMENT ON COLUMN public.cost_events.estimated_cost IS
  'Estimated provider cost in USD for the tracked call.';

COMMENT ON COLUMN public.cost_events.pipeline_run_id IS
  'Optional link to pipeline_runs.id for request-level cost inspection.';

REVOKE ALL ON TABLE public.cost_events FROM anon, authenticated;
GRANT ALL ON TABLE public.cost_events TO service_role;

ALTER TABLE public.cost_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_cost_events" ON public.cost_events;

CREATE POLICY "service_role_all_cost_events" ON public.cost_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
