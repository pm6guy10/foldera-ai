-- user_tokens: stores OAuth refresh tokens for background sync jobs
CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  expires_at BIGINT,
  email TEXT,
  scopes TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- RLS: deny all public access; service_role bypasses
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_public" ON user_tokens
  FOR ALL TO public USING (false);
