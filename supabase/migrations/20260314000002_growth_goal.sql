-- Insert the system growth goal for the ingest user.
-- This goal competes in the scorer alongside personal goals.
-- Priority 5 = highest. Keywords chosen to match growth signals via matchGoal().
--
-- The scorer does keyword matching: it extracts words >= 4 chars from goal_text,
-- then checks if the signal content contains >= 2 of those keywords.
-- Growth signals contain "acquire", "paying", "users", "growth", "customer", "convert"
-- so they match this goal and get stakes = 5.
--
-- IMPORTANT: Replace the user ID below with your actual INGEST_USER_ID.
-- Run: UPDATE tkg_goals SET user_id = '<your-ingest-user-id>' WHERE goal_text LIKE '%Acquire first 10 paying%';

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Try to get the INGEST_USER_ID from the self entity
  SELECT user_id INTO v_user_id FROM tkg_entities WHERE name = 'self' LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Only insert if it doesn't already exist
    INSERT INTO tkg_goals (user_id, goal_text, goal_category, priority)
    SELECT v_user_id,
           'Acquire first 10 paying users. Grow customer base through Reddit, Twitter, and Hacker News outreach. Convert visitors into paying subscribers.',
           'growth',
           5
    WHERE NOT EXISTS (
      SELECT 1 FROM tkg_goals
      WHERE user_id = v_user_id
        AND goal_category = 'growth'
        AND goal_text LIKE '%Acquire first 10 paying%'
    );
  END IF;
END $$;
