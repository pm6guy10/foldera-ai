-- ============================================================================
-- tkg_pattern_metrics: Bayesian outcome tracking per action_type+domain.
--
-- Powers deterministic confidence scores in the Conviction Engine.
-- Formula: ((successful_outcomes + 1) / (total_activations + 2)) * 100
-- Laplace smoothing prevents 0% or 100% on cold start.
--
-- total_activations  incremented by generator.ts each time a directive is staged
-- successful_outcomes incremented by sync-email when a reply is detected
-- failed_outcomes     incremented by sync-email when 7 days pass with no reply
-- ============================================================================

create table if not exists tkg_pattern_metrics (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  pattern_hash        text not null,           -- "{action_type}:{domain}" slug
  category            text not null,           -- mirrors action_type
  domain              text not null default 'general',
  total_activations   integer not null default 0,
  successful_outcomes integer not null default 0,
  failed_outcomes     integer not null default 0,
  global_prior_weight float   not null default 0.5,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (user_id, pattern_hash)
);

alter table tkg_pattern_metrics enable row level security;

create policy "tkg_pattern_metrics_owner" on tkg_pattern_metrics
  for all using (auth.uid() = user_id);

create index if not exists idx_tkg_pattern_metrics_hash
  on tkg_pattern_metrics (user_id, pattern_hash);
