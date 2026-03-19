-- The original signal_summaries migration included week_end but it was
-- not applied to production. The summarizer inserts week_end on every
-- upsert, so the column must exist.

ALTER TABLE signal_summaries
  ADD COLUMN IF NOT EXISTS week_end DATE;

COMMENT ON COLUMN signal_summaries.week_end IS 'Sunday of the summarized week';

-- Backfill any existing rows (week_end = week_start + 6 days)
UPDATE signal_summaries
SET week_end = week_start + INTERVAL '6 days'
WHERE week_end IS NULL;
