-- system_health: machine-readable verdict after every nightly-ops run.
-- One row per run per user. Classified failure + auto-remediation signals.

CREATE TABLE IF NOT EXISTS system_health (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  user_id     uuid,
  run_type    text        NOT NULL DEFAULT 'nightly',

  -- Binary verdicts (true = healthy)
  sync_healthy        boolean NOT NULL DEFAULT false,
  processing_healthy  boolean NOT NULL DEFAULT false,
  generation_healthy  boolean NOT NULL DEFAULT false,
  delivery_healthy    boolean NOT NULL DEFAULT false,

  -- Pipeline numbers
  signals_synced      int     DEFAULT 0,
  signals_processed   int     DEFAULT 0,
  signals_unprocessed int     DEFAULT 0,
  candidates_evaluated int    DEFAULT 0,
  winner_action_type  text,
  winner_confidence   int,
  winner_persisted    boolean DEFAULT false,
  winner_status       text,
  gate_that_blocked   text,
  email_sent          boolean DEFAULT false,

  -- Infinite-loop detector
  same_candidate_streak int  DEFAULT 0,
  streak_candidate_desc text,

  -- Machine-readable diagnosis
  failure_class    text,
  failure_detail   text,
  suggested_fix    text,
  cursor_prompt_ref text,

  -- Raw receipt for debugging
  raw_receipt jsonb
);

CREATE INDEX IF NOT EXISTS idx_system_health_created
  ON system_health(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_health_user
  ON system_health(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_health_failure
  ON system_health(failure_class)
  WHERE failure_class IS NOT NULL;
