-- =====================================================
-- FOLDERA CONTEXT ENGINE - Knowledge Graph Persistence
-- Phase 3.1: The Cortex
-- Stores WorkSignal nodes and SignalRelationship edges
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create work_signals table
CREATE TABLE IF NOT EXISTS work_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES meeting_prep_users(id) ON DELETE CASCADE,
  
  -- Signal identity
  signal_id TEXT NOT NULL, -- Original signal ID from source (e.g., "calendar:phoenix-kickoff-2024-01-15")
  source TEXT NOT NULL CHECK (source IN ('gmail', 'slack', 'linear', 'notion', 'calendar')),
  author TEXT NOT NULL,
  
  -- Signal content
  content TEXT NOT NULL,
  context_tags TEXT[] DEFAULT '{}', -- Array of tags like ["Project Phoenix", "Urgent"]
  
  -- Raw metadata from source system (Slack ts, Email ID, etc.)
  raw_metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one signal per user_id + signal_id combination
  UNIQUE(user_id, signal_id)
);

-- Create signal_relationships table
CREATE TABLE IF NOT EXISTS signal_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relationship endpoints
  source_signal_id UUID NOT NULL REFERENCES work_signals(id) ON DELETE CASCADE,
  target_signal_id UUID NOT NULL REFERENCES work_signals(id) ON DELETE CASCADE,
  
  -- Relationship details
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('blocks', 'relates_to', 'contradicts', 'duplicates') OR relationship_type LIKE 'custom:%'),
  reason TEXT NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate relationships
  UNIQUE(source_signal_id, target_signal_id, relationship_type)
);

-- Indexes for work_signals
CREATE INDEX idx_work_signals_user_id ON work_signals(user_id);
CREATE INDEX idx_work_signals_source ON work_signals(source);
CREATE INDEX idx_work_signals_signal_id ON work_signals(signal_id);
CREATE INDEX idx_work_signals_user_source ON work_signals(user_id, source);
CREATE INDEX idx_work_signals_context_tags ON work_signals USING GIN(context_tags); -- GIN index for array search

-- Indexes for signal_relationships
CREATE INDEX idx_signal_relationships_source ON signal_relationships(source_signal_id);
CREATE INDEX idx_signal_relationships_target ON signal_relationships(target_signal_id);
CREATE INDEX idx_signal_relationships_type ON signal_relationships(relationship_type);
CREATE INDEX idx_signal_relationships_both ON signal_relationships(source_signal_id, target_signal_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_work_signals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_work_signals_updated_at
  BEFORE UPDATE ON work_signals
  FOR EACH ROW
  EXECUTE FUNCTION update_work_signals_updated_at();

-- Row Level Security (RLS) - work_signals
ALTER TABLE work_signals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own work signals
CREATE POLICY "Users can view own work signals"
  ON work_signals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = work_signals.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can insert their own work signals
CREATE POLICY "Users can insert own work signals"
  ON work_signals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = work_signals.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can update their own work signals
CREATE POLICY "Users can update own work signals"
  ON work_signals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = work_signals.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = work_signals.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Row Level Security (RLS) - signal_relationships
ALTER TABLE signal_relationships ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view relationships for their own signals
CREATE POLICY "Users can view own signal relationships"
  ON signal_relationships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_signals ws
      JOIN meeting_prep_users mpu ON mpu.id = ws.user_id
      WHERE ws.id = signal_relationships.source_signal_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can insert relationships for their own signals
CREATE POLICY "Users can insert own signal relationships"
  ON signal_relationships
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_signals ws
      JOIN meeting_prep_users mpu ON mpu.id = ws.user_id
      WHERE ws.id = signal_relationships.source_signal_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM work_signals ws
      JOIN meeting_prep_users mpu ON mpu.id = ws.user_id
      WHERE ws.id = signal_relationships.target_signal_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Service role can do everything (for cron jobs and scripts)
CREATE POLICY "Service role has full access - work_signals"
  ON work_signals
  FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role has full access - signal_relationships"
  ON signal_relationships
  FOR ALL
  TO service_role
  USING (true);

-- Add comments for documentation
COMMENT ON TABLE work_signals IS 'Knowledge graph nodes - work signals from all sources (Gmail, Slack, Calendar, etc.)';
COMMENT ON TABLE signal_relationships IS 'Knowledge graph edges - relationships between work signals';
COMMENT ON COLUMN work_signals.signal_id IS 'Original signal ID from source system (format: source:id)';
COMMENT ON COLUMN work_signals.raw_metadata IS 'Source-specific metadata (e.g., Slack ts, Gmail message ID, Calendar event ID)';
COMMENT ON COLUMN signal_relationships.relationship_type IS 'Type of relationship: blocks, relates_to, contradicts, duplicates, or custom:type';

