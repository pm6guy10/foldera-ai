-- sync-mail-sql-audit.sql
-- Run in Supabase SQL Editor (Dashboard → SQL) with service role / project owner.
-- Companion rewind (cursor only): docs/ops/rewind-user-token-last-synced.sql
--
-- LEGEND — how to read results
-- 1) tkg_signals CHECK constraints: Mail sync writes type IN ('email_sent','email_received')
--    and source IN ('gmail','outlook'). If tkg_signals_type_check does NOT list those types
--    (e.g. only 'email'), every mail upsert fails at Postgres — apply migration
--    supabase/migrations/20260401120000_widen_signal_pool_constraints.sql to production.
-- 2) Unique index on (user_id, content_hash): Required for Supabase upsert onConflict.
--    Missing unique → upsert errors (see server logs after optional upsert logging).
-- 3) user_tokens.last_synced_at: Incremental Gmail/Outlook window starts here (see lib/sync).
-- 4) Row counts: If constraints OK but created_at stops after a date, suspect provider query
--    or cursor; if COUNT(*) grows slowly but DISTINCT content_hash grows, dedupe is working.
-- 5) Per-user section: Replace :audit_user_id (or use the parameterized block below).

-- =============================================================================
-- 1) CHECK constraints on public.tkg_signals (source + type must allow mail sync)
-- =============================================================================
SELECT conname,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'tkg_signals'
  AND c.contype = 'c'
ORDER BY conname;

-- PASS for mail sync: tkg_signals_type_check includes email_sent and email_received.
-- PASS for mail sync: tkg_signals_source_check includes gmail and outlook.
-- Repo reference: supabase/migrations/20260401120000_widen_signal_pool_constraints.sql

-- =============================================================================
-- 2) Indexes on tkg_signals involving content_hash (dedupe / upsert target)
-- =============================================================================
SELECT i.relname AS index_name,
       ix.indisunique AS is_unique,
       pg_get_indexdef(i.oid) AS index_def
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
WHERE t.relname = 'tkg_signals'
  AND pg_get_indexdef(i.oid) ILIKE '%content_hash%'
ORDER BY i.relname;

-- =============================================================================
-- 3) OAuth sync cursor: Google + Microsoft tokens (mail incremental window)
-- =============================================================================
SELECT user_id,
       provider,
       last_synced_at,
       email,
       disconnected_at,
       updated_at
FROM user_tokens
WHERE provider IN ('google', 'microsoft')
ORDER BY user_id, provider;

-- =============================================================================
-- 4) Mail-shaped signals: volume and recency (all users)
-- =============================================================================
SELECT source,
       type,
       COUNT(*) AS row_count,
       MAX(created_at) AS max_created_at,
       MAX(occurred_at) AS max_occurred_at
FROM tkg_signals
WHERE source IN ('gmail', 'outlook')
  AND type IN ('email_sent', 'email_received')
GROUP BY source, type
ORDER BY source, type;

-- Same, restricted to activity on/after a cutoff (adjust date as needed)
SELECT source,
       type,
       COUNT(*) AS row_count,
       MAX(created_at) AS max_created_at,
       MAX(occurred_at) AS max_occurred_at
FROM tkg_signals
WHERE source IN ('gmail', 'outlook')
  AND type IN ('email_sent', 'email_received')
  AND created_at >= '2026-03-27T00:00:00+00'::timestamptz
GROUP BY source, type
ORDER BY source, type;

-- =============================================================================
-- 5) Dedupe hypothesis for ONE user (replace UUID)
-- =============================================================================
-- Set once:
-- \set audit_user_id '00000000-0000-0000-0000-000000000000'

SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT content_hash) AS distinct_hashes
FROM tkg_signals
WHERE user_id = 'e40b7cd8-4925-42f7-bc99-5022969f1d22'::uuid
  AND source IN ('gmail', 'outlook')
  AND type IN ('email_sent', 'email_received')
  AND created_at >= '2026-03-01T00:00:00+00'::timestamptz;

-- If total_rows >> 0 but distinct_hashes similar to total_rows, collisions are rare.
-- If API "inserted" is 0 but hashes match existing rows, ignoreDuplicates is doing its job.

-- =============================================================================
-- 6) Applied migrations (optional — compare to repo supabase/migrations)
-- =============================================================================
-- Hosted Supabase stores applied versions here (not always identical filename to repo).
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 30;

-- If section 1 CHECK defs differ from supabase/migrations/20260401120000_widen_signal_pool_constraints.sql,
-- align production DDL before expecting newer signal sources/types (e.g. foldera_directive).
