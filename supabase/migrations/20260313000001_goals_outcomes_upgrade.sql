-- ============================================================================
-- Intelligence Upgrade: tkg_goals full schema + tkg_signals outcome_label
--
-- Adds missing columns to tkg_goals so the extractor can persist extracted
-- goals with type, status, confidence, and lineage back to the source signal.
--
-- Adds outcome_label to tkg_signals so confirmed outcomes are visible in the
-- main signal stream and can be injected into the conviction prompt.
-- ============================================================================

-- 1. Add missing columns to tkg_goals
ALTER TABLE tkg_goals
  ADD COLUMN IF NOT EXISTS entity_id         UUID REFERENCES tkg_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goal_type         TEXT CHECK (goal_type IN ('short_term', 'long_term', 'recurring')),
  ADD COLUMN IF NOT EXISTS source_conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'active'
                                               CHECK (status IN ('active', 'achieved', 'abandoned')),
  ADD COLUMN IF NOT EXISTS confidence        INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  ADD COLUMN IF NOT EXISTS time_horizon      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Index for generator query (status='active', order by updated_at)
CREATE INDEX IF NOT EXISTS idx_tkg_goals_status
  ON tkg_goals (user_id, status, updated_at DESC)
  WHERE status = 'active';

-- 2. Add outcome_label to tkg_signals
ALTER TABLE tkg_signals
  ADD COLUMN IF NOT EXISTS outcome_label TEXT
    CHECK (outcome_label IN ('CONFIRMED_WORKED', 'CONFIRMED_DIDNT_WORK'));

-- Index for generator query (outcome_label IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_tkg_signals_outcome_label
  ON tkg_signals (user_id, created_at DESC)
  WHERE outcome_label IS NOT NULL;

-- 3. Expand tkg_signals type constraint to include 'outcome_feedback'
ALTER TABLE tkg_signals
  DROP CONSTRAINT IF EXISTS tkg_signals_type_check;

ALTER TABLE tkg_signals
  ADD CONSTRAINT tkg_signals_type_check CHECK (type IN (
    'email_sent', 'email_received', 'calendar_event', 'calendar_invite',
    'slack_message', 'document_created', 'document_modified', 'document_shared',
    'task_created', 'task_completed',
    'opportunity_found', 'approval', 'rejection', 'document', 'research',
    'outcome_feedback'
  ));
