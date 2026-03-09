-- ============================================================================
-- tkg_goals: Declared goals vector for the conviction engine.
-- Every briefing calculation is measured against these goals, not just
-- pattern history. Seeded from existing conversation extraction data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tkg_goals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_text   TEXT NOT NULL,
  goal_category TEXT NOT NULL CHECK (goal_category IN (
    'career', 'financial', 'relationship', 'health', 'project', 'other'
  )),
  priority    INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  source      TEXT NOT NULL DEFAULT 'extracted' CHECK (source IN (
    'extracted', 'manual'
  )),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tkg_goals_user_id ON tkg_goals (user_id);
CREATE INDEX idx_tkg_goals_category ON tkg_goals (user_id, goal_category);
CREATE INDEX idx_tkg_goals_priority ON tkg_goals (user_id, priority DESC);

-- RLS: users see only their own goals
ALTER TABLE tkg_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY tkg_goals_user_select ON tkg_goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY tkg_goals_user_insert ON tkg_goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY tkg_goals_user_update ON tkg_goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY tkg_goals_service_all ON tkg_goals
  FOR ALL USING (auth.role() = 'service_role');
