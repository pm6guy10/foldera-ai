-- Supabase performance advisor cleanup: unused_index INFO rows.
--
-- Drop only zero-scan indexes that do not protect foreign-key or uniqueness
-- checks. Keep FK-support indexes such as idx_tkg_goals_entity_id and
-- idx_ml_snapshots_user even when low traffic leaves them with zero scans.

DROP INDEX IF EXISTS public.idx_system_health_failure;
DROP INDEX IF EXISTS public.idx_ml_snapshots_outcome;
DROP INDEX IF EXISTS public.idx_ml_priors_bucket;
DROP INDEX IF EXISTS public.idx_user_brief_cycle_gates_last_cycle;
DROP INDEX IF EXISTS public.idx_tkg_signals_outcome_label;
