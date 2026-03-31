-- Recount tkg_entities.total_interactions and last_interaction to only
-- reflect real human interaction signals (email + calendar).
--
-- Background: passive sources (conversation_ingest, onedrive, drive,
-- microsoft_todo, notion) were incrementing total_interactions identically
-- to real emails/calendar events. A person mentioned in ingested chat
-- transcripts accumulated the same count as someone you actually emailed,
-- causing the scorer to treat mention-only contacts as high-value relationships.
--
-- This migration recounts from scratch using tkg_signals.extracted_entities
-- (the authoritative record of which entities were extracted from each signal)
-- filtered to real interaction source types only.

-- Step 1: Set real counts for entities that do have real-interaction signals
UPDATE tkg_entities e
SET
  total_interactions = sub.real_count,
  last_interaction   = sub.last_real_at
FROM (
  SELECT
    unnested.entity_id::uuid,
    COUNT(DISTINCT s.id)  AS real_count,
    MAX(s.occurred_at)    AS last_real_at
  FROM tkg_signals s
  CROSS JOIN LATERAL unnest(s.extracted_entities::text[]) AS unnested(entity_id)
  WHERE s.processed = true
    AND s.source IN (
      'gmail', 'google_calendar',
      'outlook', 'outlook_calendar',
      'email', 'calendar'
    )
  GROUP BY unnested.entity_id
) sub
WHERE e.id = sub.entity_id;

-- Step 2: Zero out entities that had no real-interaction signals at all
-- (they existed only from passive mentions)
UPDATE tkg_entities e
SET
  total_interactions = 0,
  last_interaction   = NULL
WHERE e.name != 'self'
  AND NOT EXISTS (
    SELECT 1
    FROM tkg_signals s
    CROSS JOIN LATERAL unnest(s.extracted_entities::text[]) AS unnested(entity_id)
    WHERE unnested.entity_id::uuid = e.id
      AND s.processed = true
      AND s.source IN (
        'gmail', 'google_calendar',
        'outlook', 'outlook_calendar',
        'email', 'calendar'
      )
  )
  AND e.total_interactions > 0;
