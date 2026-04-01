-- Widen signal pool: derived mail/calendar intelligence, directive history, Resend engagement.
-- Replaces CHECK constraints with a superset that includes all values the app writes.

ALTER TABLE tkg_signals DROP CONSTRAINT IF EXISTS tkg_signals_source_check;
ALTER TABLE tkg_signals ADD CONSTRAINT tkg_signals_source_check CHECK (
  source IN (
    'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
    'drive', 'google_drive', 'onedrive', 'microsoft_todo',
    'slack', 'notion', 'dropbox',
    'uploaded_document', 'manual_entry',
    'claude_conversation', 'chatgpt_conversation',
    'user_feedback', 'artifact', 'resend_webhook',
    'foldera_directive'
  )
);

ALTER TABLE tkg_signals DROP CONSTRAINT IF EXISTS tkg_signals_type_check;
ALTER TABLE tkg_signals ADD CONSTRAINT tkg_signals_type_check CHECK (
  type IN (
    'email', 'email_sent', 'email_received',
    'calendar_event', 'chat_message', 'social_post',
    'file_modified', 'task',
    'daily_brief_opened', 'daily_brief_clicked', 'daily_brief_unopened',
    'document', 'research', 'outcome_feedback', 'approval', 'rejection',
    'response_pattern'
  )
);
