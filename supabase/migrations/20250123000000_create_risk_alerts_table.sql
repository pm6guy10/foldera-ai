-- =====================================================
-- FOLDERA RISK ALERTS TABLE
-- Stores detected risks/contradictions from email drafts vs contracts
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create risk_alerts table
CREATE TABLE IF NOT EXISTS risk_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES meeting_prep_users(id) ON DELETE CASCADE,
  
  -- Alert details
  source_id TEXT NOT NULL, -- e.g., Gmail draft ID, thread ID
  source_type TEXT NOT NULL DEFAULT 'gmail_draft', -- 'gmail_draft', 'email', etc.
  risk_type TEXT NOT NULL CHECK (risk_type IN ('contradiction', 'sentiment', 'ghost', 'other')),
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  description TEXT NOT NULL, -- Detailed explanation of the risk
  
  -- Additional context
  draft_subject TEXT,
  draft_excerpt TEXT, -- Relevant excerpt from draft
  contract_name TEXT, -- Name of contract file if applicable
  contract_excerpt TEXT, -- Relevant excerpt from contract
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved', 'dismissed')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX idx_risk_alerts_user_id ON risk_alerts(user_id);
CREATE INDEX idx_risk_alerts_status ON risk_alerts(status);
CREATE INDEX idx_risk_alerts_severity ON risk_alerts(severity);
CREATE INDEX idx_risk_alerts_risk_type ON risk_alerts(risk_type);
CREATE INDEX idx_risk_alerts_user_status ON risk_alerts(user_id, status) WHERE status = 'new';
CREATE INDEX idx_risk_alerts_user_severity ON risk_alerts(user_id, severity) WHERE severity = 'high';

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_risk_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_risk_alerts_updated_at
  BEFORE UPDATE ON risk_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_risk_alerts_updated_at();

-- Row Level Security (RLS)
ALTER TABLE risk_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own risk alerts
CREATE POLICY "Users can view own risk alerts"
  ON risk_alerts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = risk_alerts.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can insert their own risk alerts
CREATE POLICY "Users can insert own risk alerts"
  ON risk_alerts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = risk_alerts.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can update their own risk alerts
CREATE POLICY "Users can update own risk alerts"
  ON risk_alerts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = risk_alerts.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Service role can do everything (for cron jobs and scripts)
CREATE POLICY "Service role has full access"
  ON risk_alerts
  FOR ALL
  TO service_role
  USING (true);

-- Add comments for documentation
COMMENT ON TABLE risk_alerts IS 'Risk alerts detected from email drafts vs contracts (contradictions, sentiment issues, etc.)';
COMMENT ON COLUMN risk_alerts.source_id IS 'ID of the source (e.g., Gmail draft ID, thread ID)';
COMMENT ON COLUMN risk_alerts.risk_type IS 'Type of risk: contradiction, sentiment, ghost, other';
COMMENT ON COLUMN risk_alerts.severity IS 'Risk severity: high, medium, low';
COMMENT ON COLUMN risk_alerts.description IS 'Detailed explanation of the detected risk';
COMMENT ON COLUMN risk_alerts.status IS 'Alert status: new, reviewed, resolved, dismissed';

