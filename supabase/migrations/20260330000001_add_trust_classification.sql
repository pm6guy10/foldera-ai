-- Trust classification for contamination control without deleting history.
-- Adds trust_class to entities/commitments and backfills low-trust rows based
-- on source metadata from extracted signals.

ALTER TABLE tkg_entities
  ADD COLUMN IF NOT EXISTS trust_class TEXT NOT NULL DEFAULT 'unclassified';

ALTER TABLE tkg_commitments
  ADD COLUMN IF NOT EXISTS trust_class TEXT NOT NULL DEFAULT 'unclassified';

ALTER TABLE tkg_entities
  DROP CONSTRAINT IF EXISTS tkg_entities_trust_class_check;

ALTER TABLE tkg_entities
  ADD CONSTRAINT tkg_entities_trust_class_check CHECK (
    trust_class IN ('trusted', 'junk', 'transactional', 'personal', 'unclassified')
  );

ALTER TABLE tkg_commitments
  DROP CONSTRAINT IF EXISTS tkg_commitments_trust_class_check;

ALTER TABLE tkg_commitments
  ADD CONSTRAINT tkg_commitments_trust_class_check CHECK (
    trust_class IN ('trusted', 'junk', 'transactional', 'personal', 'unclassified')
  );

CREATE INDEX IF NOT EXISTS idx_tkg_entities_user_trust_class
  ON tkg_entities (user_id, trust_class);

CREATE INDEX IF NOT EXISTS idx_tkg_commitments_user_trust_class
  ON tkg_commitments (user_id, trust_class);

WITH signal_trust AS (
  SELECT
    s.id,
    s.user_id,
    s.occurred_at,
    CASE
      WHEN lower(COALESCE(s.author, '')) ~ '(noreply|no-reply|donotreply|newsletter|marketing|promotions?|mailchimp|sendgrid|constantcontact|klaviyo|marketo|hubspot|amazonses\.com|unsubscribe)'
        THEN 'junk'
      WHEN lower(COALESCE(s.author, '')) ~ '(security|alerts?|password|verification)'
        THEN 'transactional'
      WHEN lower(COALESCE(s.source_id, '')) ~ '(order|receipt|invoice|shipment|tracking|refund|return)'
        THEN 'transactional'
      ELSE 'trusted'
    END AS trust_class
  FROM tkg_signals s
),
entity_signal_trust AS (
  SELECT
    e.id AS entity_id,
    COUNT(*) AS total_signal_count,
    COUNT(*) FILTER (WHERE st.trust_class IN ('junk', 'transactional')) AS low_trust_signal_count,
    COUNT(*) FILTER (WHERE st.trust_class = 'junk') AS junk_signal_count,
    COUNT(*) FILTER (WHERE st.trust_class = 'transactional') AS transactional_signal_count,
    COUNT(*) FILTER (WHERE st.occurred_at >= now() - interval '90 days') AS recent_signal_count_90d
  FROM tkg_entities e
  JOIN tkg_signals s
    ON s.user_id = e.user_id
   AND e.id::text = ANY(COALESCE(s.extracted_entities::text[], ARRAY[]::text[]))
  JOIN signal_trust st
    ON st.id = s.id
  GROUP BY e.id
),
entity_backfill AS (
  SELECT
    entity_id,
    CASE
      WHEN total_signal_count > 0
        AND low_trust_signal_count = total_signal_count
        AND recent_signal_count_90d = 0
        AND junk_signal_count > 0
        THEN 'junk'
      WHEN total_signal_count > 0
        AND low_trust_signal_count = total_signal_count
        AND transactional_signal_count > 0
        AND junk_signal_count = 0
        THEN 'transactional'
      ELSE NULL
    END AS classified_as
  FROM entity_signal_trust
)
UPDATE tkg_entities e
SET trust_class = entity_backfill.classified_as
FROM entity_backfill
WHERE e.id = entity_backfill.entity_id
  AND entity_backfill.classified_as IS NOT NULL
  AND e.trust_class = 'unclassified';

WITH signal_trust AS (
  SELECT
    s.id::text AS signal_id,
    CASE
      WHEN lower(COALESCE(s.author, '')) ~ '(noreply|no-reply|donotreply|newsletter|marketing|promotions?|mailchimp|sendgrid|constantcontact|klaviyo|marketo|hubspot|amazonses\.com|unsubscribe)'
        THEN 'junk'
      WHEN lower(COALESCE(s.author, '')) ~ '(security|alerts?|password|verification)'
        THEN 'transactional'
      WHEN lower(COALESCE(s.source_id, '')) ~ '(order|receipt|invoice|shipment|tracking|refund|return)'
        THEN 'transactional'
      ELSE 'trusted'
    END AS trust_class
  FROM tkg_signals s
)
UPDATE tkg_commitments c
SET trust_class = st.trust_class
FROM signal_trust st
WHERE c.source = 'signal_extraction'
  AND c.source_id = st.signal_id
  AND c.trust_class = 'unclassified'
  AND st.trust_class IN ('junk', 'transactional');
