-- Unified CHECK constraint migration
-- Fixes Class A defects (D-01, D-02, D-06): silent data loss from constraint mismatches.
-- This is the single source of truth for all CHECK constraints.

-- tkg_signals.source
ALTER TABLE tkg_signals DROP CONSTRAINT IF EXISTS tkg_signals_source_check;
ALTER TABLE tkg_signals ADD CONSTRAINT tkg_signals_source_check CHECK (
  source IN (
    'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
    'drive', 'google_drive', 'onedrive', 'microsoft_todo',
    'slack', 'notion', 'dropbox',
    'uploaded_document', 'manual_entry',
    'claude_conversation', 'chatgpt_conversation',
    'user_feedback', 'artifact', 'resend_webhook'
  )
);

-- tkg_signals.type
ALTER TABLE tkg_signals DROP CONSTRAINT IF EXISTS tkg_signals_type_check;
ALTER TABLE tkg_signals ADD CONSTRAINT tkg_signals_type_check CHECK (
  type IN (
    'email', 'calendar_event', 'chat_message', 'social_post',
    'file_modified', 'task', 'daily_brief_opened', 'document',
    'research', 'outcome_feedback', 'approval'
  )
);

-- tkg_actions.status
ALTER TABLE tkg_actions DROP CONSTRAINT IF EXISTS tkg_actions_status_check;
ALTER TABLE tkg_actions ADD CONSTRAINT tkg_actions_status_check CHECK (
  status IN (
    'pending_approval', 'approved', 'executed', 'skipped', 'rejected',
    'expired', 'failed', 'draft', 'draft_rejected'
  )
);

-- tkg_commitments.source
ALTER TABLE tkg_commitments DROP CONSTRAINT IF EXISTS tkg_commitments_source_check;
ALTER TABLE tkg_commitments ADD CONSTRAINT tkg_commitments_source_check CHECK (
  source IN (
    'signal_extraction', 'email_analysis', 'calendar_event',
    'document_analysis', 'manual_entry', 'ai_inference',
    'task_sync', 'meeting_notes', 'chat_message'
  )
);
