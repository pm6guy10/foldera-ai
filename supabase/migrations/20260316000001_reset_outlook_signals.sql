-- Reset Outlook signals so encrypted content gets reprocessed with decryption
UPDATE tkg_signals
SET processed = false, processing_version = 0
WHERE source IN ('outlook', 'outlook_calendar');
