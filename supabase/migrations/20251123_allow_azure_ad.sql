-- Allow 'azure_ad' in the integrations provider check constraint
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;

ALTER TABLE integrations ADD CONSTRAINT integrations_provider_check 
  CHECK (provider IN ('gmail', 'google_drive', 'azure_ad'));

