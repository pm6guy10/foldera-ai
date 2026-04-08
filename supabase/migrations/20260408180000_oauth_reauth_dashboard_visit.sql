-- OAuth re-auth prompt after fatal refresh (invalid_grant) + dashboard visit for connector-email gating
ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS oauth_reauth_required_at TIMESTAMPTZ;

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS last_dashboard_visit_at TIMESTAMPTZ;
