ALTER TABLE user_tokens
  ALTER COLUMN refresh_token DROP NOT NULL;

ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;
