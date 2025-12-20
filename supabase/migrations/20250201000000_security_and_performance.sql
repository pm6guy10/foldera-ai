-- =====================================================
-- SECURITY & PERFORMANCE IMPROVEMENTS
-- Based on repository audit findings
-- =====================================================

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Work signals indexes
CREATE INDEX IF NOT EXISTS idx_work_signals_user_id ON work_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_work_signals_created_at ON work_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_signals_source ON work_signals(source);
CREATE INDEX IF NOT EXISTS idx_work_signals_user_created ON work_signals(user_id, created_at DESC);

-- Integrations indexes
CREATE INDEX IF NOT EXISTS idx_integrations_user_provider ON integrations(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(sync_status) WHERE sync_status = 'active';

-- Meeting prep users indexes
CREATE INDEX IF NOT EXISTS idx_meeting_prep_users_email ON meeting_prep_users(email);

-- =====================================================
-- AI USAGE TRACKING TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES meeting_prep_users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
  operation TEXT NOT NULL, -- e.g., 'conflict-detection', 'draft-generation'
  prompt_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for AI usage
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_operation ON ai_usage(operation);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage(user_id, created_at DESC);

-- =====================================================
-- SOFT DELETES (for compliance/audit)
-- =====================================================

-- Add deleted_at column to work_signals if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'work_signals' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE work_signals ADD COLUMN deleted_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_work_signals_deleted_at ON work_signals(deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- =====================================================
-- RLS POLICIES (if not already set)
-- =====================================================

-- Ensure RLS is enabled on sensitive tables
ALTER TABLE work_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies should be created separately based on your auth setup
-- These are examples - adjust based on your NextAuth + Supabase setup

-- Example policy for work_signals (users can only see their own)
-- CREATE POLICY "Users can view own work signals"
--   ON work_signals FOR SELECT
--   USING (user_id = auth.uid());

-- Example policy for integrations (users can view own integrations)
-- CREATE POLICY "Users can view own integrations"
--   ON integrations FOR SELECT
--   USING (user_id = auth.uid());

