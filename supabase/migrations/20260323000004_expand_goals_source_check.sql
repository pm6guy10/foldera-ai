-- ============================================================================
-- Expand tkg_goals source CHECK to include onboarding + auto_suppression values
-- The original migration only allowed 'extracted' and 'manual', but the
-- onboarding flow writes 'onboarding_bucket', 'onboarding_stated', and
-- 'onboarding_marker'. Without this fix, onboarding inserts silently fail.
-- ============================================================================

ALTER TABLE tkg_goals
  DROP CONSTRAINT IF EXISTS tkg_goals_source_check;

ALTER TABLE tkg_goals
  ADD CONSTRAINT tkg_goals_source_check CHECK (source IN (
    'extracted', 'manual', 'auto_suppression',
    'onboarding_bucket', 'onboarding_stated', 'onboarding_marker'
  ));
