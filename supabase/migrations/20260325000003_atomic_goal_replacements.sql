-- Atomic write helpers for onboarding and manual priorities.
-- These eliminate delete-then-insert partial write windows in API handlers.

CREATE OR REPLACE FUNCTION public.replace_onboarding_goals(
  p_user_id UUID,
  p_rows JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  DELETE FROM tkg_goals
  WHERE user_id = p_user_id
    AND source = ANY (ARRAY['onboarding_bucket', 'onboarding_stated', 'onboarding_marker']);

  IF p_rows IS NOT NULL AND jsonb_typeof(p_rows) = 'array' AND jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO tkg_goals (
      user_id,
      goal_text,
      goal_category,
      priority,
      current_priority,
      source
    )
    SELECT
      p_user_id,
      trim(item->>'goal_text'),
      item->>'goal_category',
      COALESCE((item->>'priority')::INTEGER, 3),
      COALESCE((item->>'current_priority')::BOOLEAN, false),
      item->>'source'
    FROM jsonb_array_elements(p_rows) AS item;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
  END IF;

  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_current_priorities(
  p_user_id UUID,
  p_rows JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  UPDATE tkg_goals
  SET current_priority = false
  WHERE user_id = p_user_id
    AND current_priority = true;

  IF p_rows IS NOT NULL AND jsonb_typeof(p_rows) = 'array' AND jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO tkg_goals (
      user_id,
      goal_text,
      goal_category,
      priority,
      source,
      current_priority
    )
    SELECT
      p_user_id,
      trim(item->>'goal_text'),
      COALESCE(NULLIF(item->>'goal_category', ''), 'other'),
      COALESCE((item->>'priority')::INTEGER, 5),
      'manual',
      true
    FROM jsonb_array_elements(p_rows) AS item;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
  END IF;

  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_onboarding_goals(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_current_priorities(UUID, JSONB) TO service_role;

