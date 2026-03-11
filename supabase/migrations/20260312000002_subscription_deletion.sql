-- Add data deletion scheduling to user_subscriptions.
-- Set data_deletion_scheduled_at = NOW() + 30 days when subscription is cancelled.
-- The cleanup-cancelled cron deletes all user data after this date passes.

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS data_deletion_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id         TEXT;

-- Index for the cleanup cron query
CREATE INDEX IF NOT EXISTS idx_user_subs_deletion ON user_subscriptions (data_deletion_scheduled_at)
  WHERE status = 'cancelled' AND data_deletion_scheduled_at IS NOT NULL;
