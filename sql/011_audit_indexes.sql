create index if not exists idx_audit_project_time on public.audit_events(project_id, created_at desc);
create index if not exists idx_files_project_time on public.files(project_id, created_at desc);
