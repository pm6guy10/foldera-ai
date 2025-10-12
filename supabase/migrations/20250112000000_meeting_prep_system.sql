-- =====================================================
-- FOLDERA MEETING PREP MVP - DATABASE SCHEMA
-- Migration: Meeting prep system tables
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: meeting_prep_users
-- Stores user data specific to meeting prep feature
-- =====================================================
CREATE TABLE IF NOT EXISTS meeting_prep_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  
  -- Google OAuth tokens (encrypted at application level)
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expires_at TIMESTAMPTZ,
  
  -- User preferences
  settings JSONB DEFAULT '{
    "notification_timing_minutes": 30,
    "email_notifications": true,
    "briefing_detail_level": "detailed",
    "timezone": "America/Los_Angeles"
  }'::jsonb,
  
  -- Sync metadata
  last_calendar_sync TIMESTAMPTZ,
  last_gmail_sync TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast email lookups
CREATE INDEX idx_meeting_prep_users_email ON meeting_prep_users(email);

-- =====================================================
-- TABLE: meetings
-- Stores calendar meetings/events
-- =====================================================
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES meeting_prep_users(id) ON DELETE CASCADE,
  
  -- Google Calendar data
  google_event_id TEXT UNIQUE NOT NULL,
  calendar_id TEXT, -- Which calendar this event is from
  
  -- Meeting details
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  attendees JSONB DEFAULT '[]'::jsonb, -- [{email, name, responseStatus}]
  
  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  
  -- Brief status
  brief_generated BOOLEAN DEFAULT FALSE,
  brief_sent BOOLEAN DEFAULT FALSE,
  brief_generation_attempted_at TIMESTAMPTZ,
  brief_generation_error TEXT,
  
  -- Metadata
  is_cancelled BOOLEAN DEFAULT FALSE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_event_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_meetings_user_id ON meetings(user_id);
CREATE INDEX idx_meetings_google_event_id ON meetings(google_event_id);
CREATE INDEX idx_meetings_start_time ON meetings(start_time);
CREATE INDEX idx_meetings_brief_status ON meetings(user_id, brief_generated, start_time) 
  WHERE brief_generated = FALSE AND is_cancelled = FALSE;

-- =====================================================
-- TABLE: briefs
-- Stores generated meeting briefs
-- =====================================================
CREATE TABLE IF NOT EXISTS briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES meeting_prep_users(id) ON DELETE CASCADE,
  
  -- Brief content (structured JSON)
  content JSONB NOT NULL, -- {key_context, what_to_say, what_to_avoid, open_threads, relationship_notes}
  
  -- Context used to generate brief
  raw_context JSONB, -- {emails: [...], calendar_data: {...}}
  
  -- AI metadata
  ai_model TEXT DEFAULT 'claude-3-5-sonnet-20241022',
  ai_tokens_used INTEGER,
  generation_time_ms INTEGER,
  
  -- Delivery tracking
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ, -- For future analytics
  email_message_id TEXT, -- Resend message ID
  
  -- Quality/feedback (for future)
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_briefs_meeting_id ON briefs(meeting_id);
CREATE INDEX idx_briefs_user_id ON briefs(user_id);
CREATE INDEX idx_briefs_generated_at ON briefs(generated_at DESC);

-- =====================================================
-- TABLE: emails_cache
-- Caches Gmail emails for context
-- =====================================================
CREATE TABLE IF NOT EXISTS emails_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES meeting_prep_users(id) ON DELETE CASCADE,
  
  -- Gmail data
  gmail_message_id TEXT UNIQUE NOT NULL,
  thread_id TEXT NOT NULL,
  
  -- Email metadata
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_emails TEXT[] NOT NULL,
  cc_emails TEXT[] DEFAULT '{}',
  subject TEXT,
  
  -- Content
  snippet TEXT, -- Gmail's auto-generated snippet
  body_text TEXT, -- Plain text body
  body_html TEXT, -- HTML body
  
  -- Timing
  received_at TIMESTAMPTZ NOT NULL,
  
  -- Metadata
  labels TEXT[] DEFAULT '{}', -- Gmail labels
  is_sent BOOLEAN DEFAULT FALSE, -- True if from user's sent folder
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for finding relevant emails
CREATE INDEX idx_emails_cache_user_id ON emails_cache(user_id);
CREATE INDEX idx_emails_cache_gmail_message_id ON emails_cache(gmail_message_id);
CREATE INDEX idx_emails_cache_thread_id ON emails_cache(thread_id);
CREATE INDEX idx_emails_cache_from_email ON emails_cache(from_email);
CREATE INDEX idx_emails_cache_to_emails ON emails_cache USING GIN(to_emails);
CREATE INDEX idx_emails_cache_received_at ON emails_cache(received_at DESC);

-- Composite index for attendee email lookups
CREATE INDEX idx_emails_cache_user_emails_date ON emails_cache(user_id, received_at DESC) 
  WHERE received_at > NOW() - INTERVAL '90 days';

-- =====================================================
-- TABLE: sync_logs
-- Tracks sync operations for debugging
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES meeting_prep_users(id) ON DELETE CASCADE,
  
  sync_type TEXT NOT NULL, -- 'calendar', 'gmail', 'brief_generation'
  status TEXT NOT NULL, -- 'success', 'partial', 'error'
  
  -- Results
  items_synced INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  error_message TEXT,
  details JSONB, -- Additional context
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- =====================================================
-- FUNCTIONS: Update timestamps automatically
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers
CREATE TRIGGER update_meeting_prep_users_updated_at 
  BEFORE UPDATE ON meeting_prep_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at 
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE meeting_prep_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own data" ON meeting_prep_users
  FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own data" ON meeting_prep_users
  FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Users can view own meetings" ON meetings
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can view own briefs" ON briefs
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can view own emails" ON emails_cache
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can view own sync logs" ON sync_logs
  FOR SELECT USING (auth.uid()::text = user_id::text);

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role has full access" ON meeting_prep_users
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to meetings" ON meetings
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to briefs" ON briefs
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to emails" ON emails_cache
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to sync logs" ON sync_logs
  FOR ALL TO service_role USING (true);

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View: Upcoming meetings needing briefs
CREATE OR REPLACE VIEW meetings_needing_briefs AS
SELECT 
  m.*,
  u.email as user_email,
  u.name as user_name,
  u.settings as user_settings
FROM meetings m
JOIN meeting_prep_users u ON m.user_id = u.id
WHERE 
  m.brief_generated = FALSE
  AND m.is_cancelled = FALSE
  AND m.start_time > NOW()
  AND m.start_time <= NOW() + INTERVAL '2 hours'
  AND (m.attendees::jsonb != '[]'::jsonb) -- Has attendees
ORDER BY m.start_time ASC;

-- =====================================================
-- SAMPLE DATA (for testing - remove in production)
-- =====================================================

-- Commented out - uncomment for local testing
/*
INSERT INTO meeting_prep_users (email, name, settings) VALUES
('test@example.com', 'Test User', '{
  "notification_timing_minutes": 30,
  "email_notifications": true
}'::jsonb);
*/

-- =====================================================
-- END OF MIGRATION
-- =====================================================

-- Add comments for documentation
COMMENT ON TABLE meeting_prep_users IS 'Users of the meeting prep feature with Google OAuth credentials';
COMMENT ON TABLE meetings IS 'Calendar meetings/events synced from Google Calendar';
COMMENT ON TABLE briefs IS 'AI-generated meeting briefs';
COMMENT ON TABLE emails_cache IS 'Cached Gmail emails for context gathering';
COMMENT ON TABLE sync_logs IS 'Audit log of sync operations';

