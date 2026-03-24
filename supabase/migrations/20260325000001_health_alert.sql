ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS last_health_alert_at TIMESTAMPTZ;

ALTER TABLE tkg_actions
  DROP CONSTRAINT IF EXISTS tkg_actions_status_check;

ALTER TABLE tkg_actions
  ADD CONSTRAINT tkg_actions_status_check CHECK (status IN (
    'pending_approval', 'approved', 'rejected', 'executed', 'skipped', 'failed'
  ));
