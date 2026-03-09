-- ============================================================================
-- Extend tkg_briefings with chief-of-staff output fields
-- Phase 1 pivot: existing briefings were structured around conflicts/commitments.
-- These three columns carry the new CoS output: a single insight, a confidence
-- score traceable to the user's own history, and one recommended action.
-- ============================================================================

ALTER TABLE tkg_briefings
  ADD COLUMN IF NOT EXISTS top_insight text,
  ADD COLUMN IF NOT EXISTS confidence float,
  ADD COLUMN IF NOT EXISTS recommended_action text;

-- Allow Claude conversation exports as a signal source.
-- tkg_signals.source had an implicit check; we surface the new value here
-- so downstream queries can filter by source = 'claude_conversation'.
COMMENT ON COLUMN tkg_signals.source IS
  'Signal origin. Values in use: gmail | outlook | google_calendar | '
  'outlook_calendar | slack | notion | drive | dropbox | '
  'uploaded_document | manual_entry | claude_conversation';
