-- =====================================================
-- Email Drafts Table
-- Stores generated drafts tied to Gmail threads
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS email_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES meeting_prep_users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  email_id TEXT,
  draft TEXT NOT NULL,
  incoming_email_body TEXT,
  thread_history TEXT,
  last_user_message TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_drafts_user ON email_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_thread ON email_drafts(thread_id);

ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email drafts"
  ON email_drafts
  FOR ALL
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Service role full access to email drafts"
  ON email_drafts
  FOR ALL
  TO service_role
  USING (true);


