-- ============================================================================
-- Brain Upgrade: current priorities, skip feedback, proactive scanner signals
-- ============================================================================

-- 1. Add current_priority flag to tkg_goals
ALTER TABLE tkg_goals
  ADD COLUMN IF NOT EXISTS current_priority BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tkg_goals_current_priority
  ON tkg_goals (user_id) WHERE current_priority = true;

-- 2. Add skip_reason to tkg_actions
ALTER TABLE tkg_actions
  ADD COLUMN IF NOT EXISTS skip_reason TEXT CHECK (skip_reason IS NULL OR skip_reason IN (
    'not_relevant', 'already_handled', 'wrong_approach'
  ));

COMMENT ON COLUMN tkg_actions.skip_reason IS
  'Why the user skipped: not_relevant, already_handled, wrong_approach. NULL if not skipped or no reason given.';

-- 3. Expand tkg_signals source CHECK to include proactive_scan, user_feedback, artifact
ALTER TABLE tkg_signals
  DROP CONSTRAINT IF EXISTS tkg_signals_source_check;

ALTER TABLE tkg_signals
  DROP CONSTRAINT IF EXISTS signals_source_check;

ALTER TABLE tkg_signals
  ADD CONSTRAINT tkg_signals_source_check CHECK (source IN (
    'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
    'slack', 'notion', 'drive', 'dropbox',
    'uploaded_document', 'manual_entry', 'claude_conversation',
    'proactive_scan', 'user_feedback', 'artifact'
  ));

-- 4. Expand tkg_signals type CHECK to include new types
ALTER TABLE tkg_signals
  DROP CONSTRAINT IF EXISTS tkg_signals_type_check;

ALTER TABLE tkg_signals
  DROP CONSTRAINT IF EXISTS signals_type_check;

ALTER TABLE tkg_signals
  ADD CONSTRAINT tkg_signals_type_check CHECK (type IN (
    'email_sent', 'email_received', 'calendar_event', 'calendar_invite',
    'slack_message', 'document_created', 'document_modified', 'document_shared',
    'task_created', 'task_completed',
    'opportunity_found', 'approval', 'rejection', 'document', 'research'
  ));
