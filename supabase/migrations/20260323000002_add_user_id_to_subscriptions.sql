-- Add user_id column to user_subscriptions.
-- The live table was created with 'email' as the identifier but the codebase
-- uses 'user_id' (UUID string) for all subscription lookups and webhook writes.

ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Backfill: if any rows exist with email but no user_id, this is a no-op on empty table
-- For future rows, user_id will be set by the Stripe webhook

-- Make user_id unique (for upsert onConflict)
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_user_id_unique ON user_subscriptions (user_id) WHERE user_id IS NOT NULL;

-- RLS policy for user reads
DROP POLICY IF EXISTS "users_read_own" ON user_subscriptions;
CREATE POLICY "users_read_own" ON user_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);
