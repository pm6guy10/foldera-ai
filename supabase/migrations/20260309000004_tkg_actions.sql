-- ============================================================================
-- tkg_actions: Action registry for the conviction engine.
-- Every directive the engine generates is logged here, approved or not.
-- Rejected actions are negative training signal.
-- Approved + executed actions are positive training signal.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tkg_actions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The directive
  directive_text TEXT NOT NULL,
  action_type    TEXT NOT NULL CHECK (action_type IN (
    'write_document', 'send_message', 'make_decision',
    'do_nothing', 'schedule', 'research'
  )),
  confidence     INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  reason         TEXT NOT NULL,   -- one sentence grounded in behavioral evidence

  -- Evidence: the specific signals/commitments/goals that drove the recommendation
  evidence       JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Lifecycle
  status         TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN (
    'pending_approval', 'approved', 'rejected', 'executed', 'skipped'
  )),
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at    TIMESTAMPTZ,
  executed_at    TIMESTAMPTZ,

  -- Execution result (populated after execution stub runs)
  execution_result JSONB
);

CREATE INDEX idx_tkg_actions_user_id ON tkg_actions (user_id);
CREATE INDEX idx_tkg_actions_status ON tkg_actions (user_id, status);
CREATE INDEX idx_tkg_actions_generated ON tkg_actions (user_id, generated_at DESC);

-- RLS: users see only their own actions
ALTER TABLE tkg_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tkg_actions_user_select ON tkg_actions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY tkg_actions_user_update ON tkg_actions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY tkg_actions_service_all ON tkg_actions
  FOR ALL USING (auth.role() = 'service_role');
