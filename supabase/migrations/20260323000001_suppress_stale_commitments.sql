-- One-time data cleanup: suppress pre-quality-filter commitments for owner account
-- Strategy:
--   KEEP: created after 2026-03-19 (post quality-filter deploy)
--   KEEP: referenced by a tkg_actions execution_result
--   SUPPRESS: everything else (set suppressed_at = now(), reason = bulk_purge_pre_quality_filter)
--
-- Before: 706 active / 714 total
-- After:   87 active / 714 total (619 suppressed in this run)
-- Applied: 2026-03-23 via Supabase MCP execute_sql

UPDATE tkg_commitments
SET suppressed_at = NOW(),
    suppressed_reason = 'bulk_purge_pre_quality_filter'
WHERE user_id = 'e40b7cd8-4925-42f7-bc99-5022969f1d22'
  AND suppressed_at IS NULL
  AND created_at <= '2026-03-19 00:00:00+00'
  AND id NOT IN (
    SELECT DISTINCT (execution_result->>'commitment_id')::uuid
    FROM tkg_actions
    WHERE user_id = 'e40b7cd8-4925-42f7-bc99-5022969f1d22'
      AND execution_result->>'commitment_id' IS NOT NULL
  );
