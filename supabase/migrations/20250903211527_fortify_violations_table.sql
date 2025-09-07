alter table public.violations
  add column if not exists source_uri text,
  add column if not exists source_id text;
