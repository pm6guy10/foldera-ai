-- ============================================================================
-- API Usage Tracking
-- Logs every Claude API call: model, tokens, cost, call type.
-- Used for daily spend cap enforcement and settings page spend display.
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_usage (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT,                                    -- NULL for system/cron calls
  model         TEXT          NOT NULL,
  input_tokens  INTEGER       NOT NULL DEFAULT 0,
  output_tokens INTEGER       NOT NULL DEFAULT 0,
  estimated_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,      -- USD
  call_type     TEXT          NOT NULL,                  -- 'directive', 'artifact', 'agent', 'extraction', etc.
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_created_at
  ON api_usage (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_daily
  ON api_usage (created_at)
  WHERE created_at >= NOW() - INTERVAL '24 hours';

COMMENT ON TABLE api_usage IS
  'One row per Claude API call. estimated_cost in USD. Daily spend cap enforced at $1.50.';
