-- Add suppression columns to tkg_commitments.
-- When a user skips a directive sourced from a commitment,
-- that commitment is suppressed so the scorer won't surface it again.
-- A new signal referencing the same entity clears the suppression.

ALTER TABLE tkg_commitments
  ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suppressed_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN tkg_commitments.suppressed_at IS 'Set when user skips a directive generated from this commitment. Cleared when a new signal arrives for the same entity.';
COMMENT ON COLUMN tkg_commitments.suppressed_reason IS 'Why the commitment was suppressed (e.g. user_skipped_directive).';
