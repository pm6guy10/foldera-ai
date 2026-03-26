-- Composite index on api_usage(user_id, created_at) for spend cap queries.
-- The isOverDailyLimit() function queries this table filtered by user_id and
-- created_at on every cron run. Without an index this becomes a full table
-- scan at 100+ users × 365 days × ~5 calls/day = 180,000+ rows.
CREATE INDEX IF NOT EXISTS idx_api_usage_user_date
  ON api_usage (user_id, created_at DESC);
