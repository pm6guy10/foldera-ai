-- ============================================
-- SHADOW MODE & BRIEFING SYSTEM
-- Database schema for proactive monitoring
-- ============================================

-- AI Usage Tracking
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);

-- Shadow Mode Signals
CREATE TABLE IF NOT EXISTS shadow_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  
  type TEXT NOT NULL,
  urgency TEXT NOT NULL,
  
  title TEXT NOT NULL,
  description TEXT,
  
  contact_email TEXT,
  contact_name TEXT,
  thread_subject TEXT,
  source_provider TEXT,
  
  commitment_text TEXT,
  due_date TIMESTAMPTZ,
  
  recommended_action TEXT,
  draft_message TEXT,
  
  confidence DECIMAL(3, 2),
  
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  
  source_message_id TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shadow_signals_user ON shadow_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_shadow_signals_scan ON shadow_signals(scan_id);
CREATE INDEX IF NOT EXISTS idx_shadow_signals_urgency ON shadow_signals(urgency);

-- Briefings
CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  title TEXT NOT NULL,
  subtitle TEXT,
  summary TEXT,
  
  critical_count INTEGER NOT NULL DEFAULT 0,
  action_count INTEGER NOT NULL DEFAULT 0,
  
  content JSONB NOT NULL DEFAULT '{}',
  
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_briefings_user ON briefings(user_id);
CREATE INDEX IF NOT EXISTS idx_briefings_generated ON briefings(generated_at);

-- Relationships (persistent cache)
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  contact_email TEXT NOT NULL,
  contact_name TEXT,
  contact_company TEXT,
  contact_domain TEXT,
  
  health_status TEXT NOT NULL,
  health_score INTEGER NOT NULL DEFAULT 50,
  
  trajectory JSONB NOT NULL DEFAULT '{}',
  commitments JSONB NOT NULL DEFAULT '[]',
  
  first_interaction TIMESTAMPTZ,
  last_interaction TIMESTAMPTZ,
  total_messages INTEGER NOT NULL DEFAULT 0,
  
  predicted_status TEXT,
  days_until_dormant INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, contact_email)
);

CREATE INDEX IF NOT EXISTS idx_relationships_user ON relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_health ON relationships(health_status);
CREATE INDEX IF NOT EXISTS idx_relationships_score ON relationships(health_score);

-- Enable RLS
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE shadow_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Service Role bypasses these)
-- Note: These assume Supabase Auth is being used. Adjust if using NextAuth only.
CREATE POLICY IF NOT EXISTS "Users can view own ai_usage" ON ai_usage
  FOR SELECT USING (true); -- Service role handles auth

CREATE POLICY IF NOT EXISTS "Users can view own signals" ON shadow_signals
  FOR SELECT USING (true); -- Service role handles auth

CREATE POLICY IF NOT EXISTS "Users can view own briefings" ON briefings
  FOR SELECT USING (true); -- Service role handles auth

CREATE POLICY IF NOT EXISTS "Users can view own relationships" ON relationships
  FOR SELECT USING (true); -- Service role handles auth

