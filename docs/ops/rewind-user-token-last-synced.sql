-- One-off operator repair: after a bad Gmail query window advanced `last_synced_at`
-- with no messages ingested, rewind the cursor so the next sync re-reads mail.
--
-- Replace USER_ID and TARGET_UTC if needed. Example: owner backfill from 2026-03-27 UTC.
--
-- Run in Supabase SQL editor (service role / dashboard).

-- begin adjustable
-- USER_ID := 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
-- TARGET_UTC := '2026-03-27T23:59:59.999Z';  -- end of Mar 27 UTC; sync uses "after: yyyy/mm/dd" from this instant's ms
-- end adjustable

UPDATE user_tokens
SET
  last_synced_at = '2026-03-27T23:59:59.999Z'::timestamptz,
  updated_at = now()
WHERE user_id = 'e40b7cd8-4925-42f7-bc99-5022969f1d22'
  AND provider IN ('google', 'microsoft')
  AND disconnected_at IS NULL;

-- Verify:
-- SELECT user_id, provider, last_synced_at, email FROM user_tokens
-- WHERE user_id = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
