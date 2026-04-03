-- AZ-24 — Optional read-only: `research` action_type provenance (Supabase SQL editor)
-- Paste aggregates into AUTOMATION_BACKLOG / SESSION_HISTORY when investigating skew.

-- 7d distribution by status
SELECT status, COUNT(*) AS n
FROM tkg_actions
WHERE action_type = 'research'
  AND generated_at > now() - interval '7 days'
GROUP BY 1
ORDER BY n DESC;

-- 7d: execution_result top-level status (often null for drafts)
SELECT COALESCE(execution_result->>'status', '(null)') AS exec_status, COUNT(*) AS n
FROM tkg_actions
WHERE action_type = 'research'
  AND generated_at > now() - interval '7 days'
GROUP BY 1
ORDER BY n DESC
LIMIT 20;

-- 7d: generation stage from evidence JSON (shape varies — may be all no_stage)
SELECT COALESCE(evidence->'generation_log'->>'stage', '(no_stage)') AS gen_stage, COUNT(*) AS n
FROM tkg_actions
WHERE action_type = 'research'
  AND generated_at > now() - interval '7 days'
GROUP BY 1
ORDER BY n DESC
LIMIT 20;
