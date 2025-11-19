-- =====================================================
-- Email Drafts metadata enhancements
-- Adds sender + subject fields for UI + sending
-- =====================================================

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS sender_email TEXT,
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT;

CREATE INDEX IF NOT EXISTS idx_email_drafts_created_at
  ON email_drafts (created_at DESC);


