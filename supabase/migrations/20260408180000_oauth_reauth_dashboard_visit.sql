-- OAuth re-auth prompt after fatal refresh (invalid_grant) + dashboard visit for connector-email gating
ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS oauth_reauth_required_at TIMESTAMPTZ;

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS last_dashboard_visit_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_tokens.oauth_reauth_required_at IS
  'Set when OAuth refresh fails fatally (e.g. invalid_grant); cleared on reconnect via saveUserToken.';

COMMENT ON COLUMN public.user_subscriptions.last_dashboard_visit_at IS
  'Updated on GET /api/conviction/latest; connector-health may skip stale-source alert emails if visit is recent.';
