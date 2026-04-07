-- Per-user throttle: at most one expensive brief generation cycle (signal processing onward)
-- within a 20-hour window, regardless of which route invokes runDailyGenerate.

CREATE TABLE IF NOT EXISTS user_brief_cycle_gates (
  user_id       TEXT PRIMARY KEY,
  last_cycle_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_brief_cycle_gates_last_cycle
  ON user_brief_cycle_gates (last_cycle_at);

ALTER TABLE user_brief_cycle_gates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON user_brief_cycle_gates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
