-- Restore the feedback signal source value used by executeAction().
-- The current tkg_signals source check lost 'user_feedback' in a later migration,
-- which causes approve/skip feedback inserts to fail at runtime.

ALTER TABLE tkg_signals
  DROP CONSTRAINT IF EXISTS tkg_signals_source_check;

ALTER TABLE tkg_signals
  ADD CONSTRAINT tkg_signals_source_check CHECK (source = ANY (ARRAY[
    'gmail'::text,
    'outlook'::text,
    'google_calendar'::text,
    'outlook_calendar'::text,
    'slack'::text,
    'notion'::text,
    'drive'::text,
    'dropbox'::text,
    'uploaded_document'::text,
    'manual_entry'::text,
    'claude_conversation'::text,
    'chatgpt_conversation'::text,
    'user_feedback'::text
  ]));
