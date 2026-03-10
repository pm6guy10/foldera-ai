-- Add feedback_weight to tkg_actions
-- +1.0  = executed (user approved + ran it)
-- -0.5  = skipped  (user passed)
-- -1.0  = rejected (future: explicit rejection path)
-- NULL  = not yet evaluated (pending_approval)

ALTER TABLE tkg_actions
  ADD COLUMN IF NOT EXISTS feedback_weight FLOAT DEFAULT NULL;

COMMENT ON COLUMN tkg_actions.feedback_weight IS
  'Learning signal written at evaluation time: +1.0 executed, -0.5 skipped, -1.0 rejected. NULL = not yet evaluated.';
