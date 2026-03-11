-- Add retry tracking columns to tkg_actions
-- Used by the daily-brief cron to track generation attempts and log errors.

ALTER TABLE tkg_actions
  ADD COLUMN IF NOT EXISTS generation_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error          TEXT;
