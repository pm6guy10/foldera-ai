-- =====================================================
-- FOLDERA INTEGRATIONS TABLE
-- Stores user's connected integrations (Gmail, Drive, Calendar, Notion)
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES meeting_prep_users(id) ON DELETE CASCADE,
  
  -- Integration details
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'google_drive', 'google_calendar', 'notion')),
  is_active BOOLEAN DEFAULT TRUE,
  
  -- OAuth credentials (encrypted at application level)
  credentials JSONB DEFAULT '{}'::jsonb,
  
  -- Sync metadata
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
  sync_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one integration per provider per user
  UNIQUE(user_id, provider)
);

-- Index for fast lookups
CREATE INDEX idx_integrations_user_id ON integrations(user_id);
CREATE INDEX idx_integrations_provider ON integrations(provider);
CREATE INDEX idx_integrations_active ON integrations(user_id, is_active) WHERE is_active = TRUE;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_integrations_updated_at();

-- Row Level Security (RLS)
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own integrations
-- Match by email from meeting_prep_users table
CREATE POLICY "Users can view own integrations"
  ON integrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = integrations.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can insert their own integrations
CREATE POLICY "Users can insert own integrations"
  ON integrations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = integrations.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can update their own integrations
CREATE POLICY "Users can update own integrations"
  ON integrations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = integrations.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can delete their own integrations
CREATE POLICY "Users can delete own integrations"
  ON integrations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = integrations.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role has full access"
  ON integrations
  FOR ALL
  TO service_role
  USING (true);

-- Add comments for documentation
COMMENT ON TABLE integrations IS 'User integrations with external services (Gmail, Drive, Calendar, Notion)';
COMMENT ON COLUMN integrations.credentials IS 'OAuth tokens and configuration (encrypted at application level)';
COMMENT ON COLUMN integrations.sync_status IS 'Current sync state: idle, syncing, or error';

