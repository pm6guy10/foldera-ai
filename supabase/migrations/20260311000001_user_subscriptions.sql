-- user_subscriptions: tracks trial and paid subscription state per user.
-- plan: 'trial' | 'pro'
-- status: 'active' | 'expired' | 'cancelled'

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 TEXT NOT NULL UNIQUE,
  plan                    TEXT NOT NULL DEFAULT 'trial',
  status                  TEXT NOT NULL DEFAULT 'active',
  current_period_end      TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ DEFAULT now(),
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT
);

-- RLS
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON user_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "users_read_own" ON user_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS user_subscriptions_user_id_idx ON user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_status_idx  ON user_subscriptions (status);
