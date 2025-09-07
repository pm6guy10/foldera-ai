create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  domain text not null,
  zod_schema jsonb not null,
  storage_uri text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.generators (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  name text not null,
  description text,
  input_example jsonb,
  created_at timestamptz not null default now()
);
alter table public.templates enable row level security;
alter table public.generators enable row level security;
create policy tpl_read on public.templates for select using (true);
create policy gen_read on public.generators for select using (true);
