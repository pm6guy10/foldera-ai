-- Extend tkg_signals source and type check constraints to allow conversation signals
-- from Claude and ChatGPT exports (claude_conversation, chatgpt_conversation, conversation type)

ALTER TABLE tkg_signals DROP CONSTRAINT tkg_signals_source_check;
ALTER TABLE tkg_signals ADD CONSTRAINT tkg_signals_source_check CHECK (source = ANY (ARRAY[
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
  'chatgpt_conversation'::text
]));

ALTER TABLE tkg_signals DROP CONSTRAINT tkg_signals_type_check;
ALTER TABLE tkg_signals ADD CONSTRAINT tkg_signals_type_check CHECK (type = ANY (ARRAY[
  'email_sent'::text,
  'email_received'::text,
  'calendar_event'::text,
  'calendar_invite'::text,
  'slack_message'::text,
  'document_created'::text,
  'document_modified'::text,
  'document_shared'::text,
  'task_created'::text,
  'task_completed'::text,
  'conversation'::text
]));
