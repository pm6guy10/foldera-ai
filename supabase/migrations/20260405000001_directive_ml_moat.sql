-- ML moat: privacy-preserving directive feature snapshots + pooled global priors.
-- No narrative text in global_priors. Snapshots are per-user (RLS deny public; service_role bypasses).

CREATE TABLE IF NOT EXISTS tkg_directive_ml_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES tkg_actions(id) ON DELETE CASCADE,
  bucket_key TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  top_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome_label TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome_label IN (
      'pending',
      'approved',
      'skipped',
      'rejected',
      'executed',
      'failed',
      'no_send_generated'
    )),
  outcome_updated_at TIMESTAMPTZ,
  email_opened BOOLEAN NOT NULL DEFAULT false,
  email_clicked BOOLEAN NOT NULL DEFAULT false,
  global_prior_snapshot DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (action_id)
);

CREATE INDEX IF NOT EXISTS idx_ml_snapshots_user_outcome
  ON tkg_directive_ml_snapshots (user_id, outcome_label);
CREATE INDEX IF NOT EXISTS idx_ml_snapshots_bucket_outcome
  ON tkg_directive_ml_snapshots (bucket_key, outcome_label);

COMMENT ON TABLE tkg_directive_ml_snapshots IS
  'Per-directive coarse features + top-K scorer candidates for calibration and regret analysis; no email bodies.';

CREATE TABLE IF NOT EXISTS tkg_directive_ml_global_priors (
  bucket_key TEXT PRIMARY KEY,
  approved_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  executed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  total_labeled INTEGER NOT NULL DEFAULT 0,
  smoothed_approve_rate DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tkg_directive_ml_global_priors IS
  'Cross-user smoothed approval rates by coarse bucket; min-sample filter applied in aggregation job.';

ALTER TABLE tkg_directive_ml_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_public_ml_snapshots" ON tkg_directive_ml_snapshots
  AS RESTRICTIVE FOR ALL TO public USING (false);

ALTER TABLE tkg_directive_ml_global_priors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_public_ml_global_priors" ON tkg_directive_ml_global_priors
  AS RESTRICTIVE FOR ALL TO public USING (false);
