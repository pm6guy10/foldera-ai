-- Read-only audit: possible duplicate person entities (run in Supabase SQL editor).
-- See docs/ENTITY_DEDUPE.md. Do not execute DELETE here without a merge plan.

-- Entities sharing a primary_email (non-null)
SELECT a.user_id, a.primary_email, a.id AS id_a, a.display_name AS name_a,
       b.id AS id_b, b.display_name AS name_b
FROM tkg_entities a
JOIN tkg_entities b
  ON a.user_id = b.user_id
 AND a.primary_email = b.primary_email
 AND a.primary_email IS NOT NULL
 AND a.id < b.id
WHERE a.name <> 'self';
