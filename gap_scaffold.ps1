# gap_scaffold.ps1 — adds missing guardrails, tests, SQL, and runbooks (non-destructive)

function Write-IfNew {
  param([string]$Path,[string]$Content)
  if (Test-Path $Path) { Write-Host "Skip (exists): $Path" -ForegroundColor Yellow; return }
  $dir = Split-Path $Path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $Content | Set-Content -Path $Path -Encoding UTF8
  Write-Host "Created: $Path" -ForegroundColor Green
}

# --- Semgrep workflow (SAST) ---
Write-IfNew ".github\workflows\semgrep.yml" @"
name: semgrep
on: [pull_request, push]
jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
        with:
          config: p/ci
"@

Write-IfNew ".semgrepignore" @"
**/*.md
**/fixtures/**
"@

# --- Playwright minimal config + smoke test ---
Write-IfNew "playwright.config.ts" @"
import { defineConfig } from "@playwright/test";
export default defineConfig({
  timeout: 30000,
  webServer: { command: "pnpm build && pnpm start", port: 3000, reuseExistingServer: !process.env.CI },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" }
});
"@

Write-IfNew "tests\e2e\smoke.spec.ts" @"
import { test, expect } from "@playwright/test";
test('home responds', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Bulldog/i);
});
"@

# --- CI preflight (fail fast on missing secrets) ---
Write-IfNew "scripts\ci-preflight.mjs" @"
const req=[
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SENTRY_DSN',
  'OTEL_EXPORTER_OTLP_ENDPOINT'
];
const miss=req.filter(k=>!process.env[k]);
if(miss.length){ console.error('Missing envs:', miss.join(', ')); process.exit(1); }
console.log('Preflight OK');
"@

# --- SQL: brain registry (templates/generators) ---
Write-IfNew "sql\010_brain.sql" @"
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
"@

# --- SQL: audit & file indexes (speed + court reads) ---
Write-IfNew "sql\011_audit_indexes.sql" @"
create index if not exists idx_audit_project_time on public.audit_events(project_id, created_at desc);
create index if not exists idx_files_project_time on public.files(project_id, created_at desc);
"@

# --- Clerk JWT template (for docs/reference, paste into Clerk Dashboard) ---
Write-IfNew "docs\clerk_jwt_template.json" @"
{
  \"template\": {
    \"claims\": {
      \"role\": \"{{user.public_metadata.role | default: 'viewer'}}\",
      \"project_ids\": \"{{user.public_metadata.project_ids | default: []}}\"
    }
  }
}
"@

# --- DR runbook (execute once, record outcomes) ---
Write-IfNew "runbooks\dr.md" @"
# DR Rehearsal Playbook
Goal: prove we can restore in <30 min.

1) Create Supabase staging project and restore latest prod snapshot.
2) Configure Vercel Preview env with staging secrets.
3) Run:
   pnpm install
   pnpm test
   TRIALS=1000 pnpm trials
   pnpx playwright install
   pnpm test:e2e
4) Generate one motion via API, open DOCX, confirm audit_events row with SHA-256.
5) Record elapsed time, issues, and fixes here:
- Date:
- Operator:
- Elapsed:
- Notes:
"@

# --- Readme hint for templates bucket usage (no fs in server) ---
Write-IfNew "templates\README.md" @"
Upload your .docx files to Supabase Storage bucket 'templates'.
Route fetches via: \`/storage/v1/object/public/templates/<key>.docx\`.
Use {snake_case} placeholders only.
"@

Write-Host "`n✅ Gap scaffold complete. Next: install deps, set secrets, apply SQL." -ForegroundColor Cyan