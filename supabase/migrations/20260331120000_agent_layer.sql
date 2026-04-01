-- Autonomous agent layer: system kill-switch goals + action_source for DraftQueue filtering.

ALTER TABLE tkg_goals
  DROP CONSTRAINT IF EXISTS tkg_goals_source_check;

ALTER TABLE tkg_goals
  ADD CONSTRAINT tkg_goals_source_check CHECK (source IN (
    'extracted', 'manual', 'auto_suppression',
    'onboarding_bucket', 'onboarding_stated', 'onboarding_marker',
    'system_config'
  ));

ALTER TABLE tkg_actions
  ADD COLUMN IF NOT EXISTS action_source TEXT;

COMMENT ON COLUMN tkg_actions.action_source IS
  'Optional provenance, e.g. agent_health_watchdog. Null = user-facing directive pipeline.';

CREATE INDEX IF NOT EXISTS idx_tkg_actions_action_source
  ON tkg_actions (user_id, action_source)
  WHERE action_source IS NOT NULL;
