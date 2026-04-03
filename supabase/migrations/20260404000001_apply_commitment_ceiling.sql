-- Single-statement commitment ceiling: suppress oldest active rows per user beyond p_ceiling.
-- Replaces multi-round client updates with one atomic UPDATE (self-heal defense2).

CREATE OR REPLACE FUNCTION public.apply_commitment_ceiling(p_ceiling integer DEFAULT 150)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn,
      COUNT(*) OVER (PARTITION BY user_id) AS cnt
    FROM tkg_commitments
    WHERE suppressed_at IS NULL
  ),
  to_suppress AS (
    SELECT id
    FROM ranked
    WHERE cnt > p_ceiling
      AND rn <= (cnt - p_ceiling)
  ),
  upd AS (
    UPDATE tkg_commitments AS c
    SET
      suppressed_at = now(),
      suppressed_reason = 'commitment_ceiling_auto'
    FROM to_suppress AS t
    WHERE c.id = t.id
    RETURNING c.id
  )
  SELECT jsonb_build_object(
    'suppressed_count', COALESCE((SELECT COUNT(*)::int FROM upd), 0)
  );
$$;

GRANT EXECUTE ON FUNCTION public.apply_commitment_ceiling(integer) TO service_role;
