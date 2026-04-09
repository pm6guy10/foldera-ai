-- Supabase linter: unindexed_foreign_keys (lint 0001).
-- Indexes on referencing columns speed FK checks when parent rows are updated/deleted.

CREATE INDEX IF NOT EXISTS idx_tkg_directive_ml_snapshots_action_id
  ON public.tkg_directive_ml_snapshots (action_id);

-- Nullable FK: partial index is sufficient for Postgres FK enforcement.
CREATE INDEX IF NOT EXISTS idx_tkg_goals_entity_id
  ON public.tkg_goals (entity_id)
  WHERE entity_id IS NOT NULL;
