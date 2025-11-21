-- =====================================================
-- FOLDERA PENDING ACTIONS TABLE
-- Stores pending actions that require user approval (e.g., Drive cleanup plans)
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create pending_actions table
CREATE TABLE IF NOT EXISTS pending_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES meeting_prep_users(id) ON DELETE CASCADE,
  
  -- Action details
  type TEXT NOT NULL CHECK (type IN ('drive_cleanup', 'other')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Stores action-specific data (e.g., file moves)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for fast lookups
CREATE INDEX idx_pending_actions_user_id ON pending_actions(user_id);
CREATE INDEX idx_pending_actions_status ON pending_actions(status);
CREATE INDEX idx_pending_actions_type ON pending_actions(type);
CREATE INDEX idx_pending_actions_user_status ON pending_actions(user_id, status) WHERE status = 'pending';

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pending_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_pending_actions_updated_at
  BEFORE UPDATE ON pending_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_pending_actions_updated_at();

-- Row Level Security (RLS)
ALTER TABLE pending_actions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own pending actions
CREATE POLICY "Users can view own pending actions"
  ON pending_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = pending_actions.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can insert their own pending actions
CREATE POLICY "Users can insert own pending actions"
  ON pending_actions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = pending_actions.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can update their own pending actions
CREATE POLICY "Users can update own pending actions"
  ON pending_actions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = pending_actions.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role has full access"
  ON pending_actions
  FOR ALL
  TO service_role
  USING (true);

-- Add comments for documentation
COMMENT ON TABLE pending_actions IS 'Pending actions requiring user approval (e.g., Drive cleanup plans)';
COMMENT ON COLUMN pending_actions.data IS 'Action-specific data (e.g., file moves for drive_cleanup)';
COMMENT ON COLUMN pending_actions.status IS 'Action status: pending, completed, or cancelled';

