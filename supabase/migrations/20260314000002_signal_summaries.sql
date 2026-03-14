-- Signal summaries: weekly digests of compressed signals.
-- Raw signals are kept 90 days; summaries persist permanently
-- and feed into the generator as long-term context.

CREATE TABLE IF NOT EXISTS signal_summaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  week_start  DATE NOT NULL,           -- Monday of the summarized week
  week_end    DATE NOT NULL,           -- Sunday of the summarized week
  signal_count INTEGER NOT NULL DEFAULT 0,
  sources     JSONB NOT NULL DEFAULT '{}',   -- { "gmail": 5, "outlook": 3, ... }
  themes      JSONB NOT NULL DEFAULT '[]',   -- ["MAS3 negotiations", "Foldera launch", ...]
  people      JSONB NOT NULL DEFAULT '[]',   -- ["Sarah Chen", "Mike R.", ...]
  summary     TEXT NOT NULL,           -- Human-readable weekly digest
  emotional_tone TEXT,                 -- "anxious", "confident", "neutral", etc.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One summary per user per week
CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_summaries_user_week
  ON signal_summaries (user_id, week_start);

-- Query by user, ordered by recency
CREATE INDEX IF NOT EXISTS idx_signal_summaries_user_date
  ON signal_summaries (user_id, week_start DESC);
