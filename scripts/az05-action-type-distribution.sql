-- AZ-05 — Organic action_type distribution (last 14 days)
-- Run in Supabase SQL editor (service role / dashboard). Paste results into AUTOMATION_BACKLOG or SESSION_HISTORY when closing AZ-05.

SELECT action_type, COUNT(*) AS n
FROM tkg_actions
WHERE generated_at > now() - interval '14 days'
GROUP BY 1
ORDER BY n DESC;

-- Same query, 7-day window (AZ-24 receipt):
-- SELECT action_type, COUNT(*) AS n
-- FROM tkg_actions
-- WHERE generated_at > now() - interval '7 days'
-- GROUP BY 1
-- ORDER BY n DESC;
