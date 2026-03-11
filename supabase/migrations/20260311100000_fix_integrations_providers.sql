-- Fix integrations provider CHECK constraint to include 'google' (used by saveTokens).
-- Previous migration (20251123) only allowed 'gmail', 'google_drive', 'azure_ad'.
-- The codebase stores Google OAuth tokens with provider = 'google', not 'gmail'.
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;

ALTER TABLE integrations ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN ('gmail', 'google', 'google_drive', 'google_calendar', 'azure_ad', 'notion'));

-- Add connected_at column (saveTokens writes to this but it was never in the schema)
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;
