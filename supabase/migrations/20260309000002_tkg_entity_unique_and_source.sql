-- ============================================================================
-- Fix: add unique constraint on tkg_entities(user_id, name) so the
-- conversation extractor can reliably upsert the 'self' entity.
-- Also expand tkg_signals and tkg_commitments source check to include
-- 'claude_conversation' for future use (code currently uses 'uploaded_document').
-- ============================================================================

-- Unique constraint so each user has at most one entity per name
CREATE UNIQUE INDEX IF NOT EXISTS idx_tkg_entities_user_name
  ON tkg_entities (user_id, name);

-- Drop and re-add source check on tkg_signals to include claude_conversation
ALTER TABLE tkg_signals
  DROP CONSTRAINT IF EXISTS tkg_signals_source_check;

ALTER TABLE tkg_signals
  ADD CONSTRAINT tkg_signals_source_check CHECK (source IN (
    'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
    'slack', 'notion', 'drive', 'dropbox',
    'uploaded_document', 'manual_entry', 'claude_conversation'
  ));

-- Drop and re-add source check on tkg_commitments to include claude_conversation
ALTER TABLE tkg_commitments
  DROP CONSTRAINT IF EXISTS tkg_commitments_source_check;

ALTER TABLE tkg_commitments
  ADD CONSTRAINT tkg_commitments_source_check CHECK (source IN (
    'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
    'slack', 'notion', 'drive', 'dropbox',
    'uploaded_document', 'manual_entry', 'claude_conversation'
  ));
