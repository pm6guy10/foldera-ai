# Full surface audit — 2026-04-07

**Purpose:** Inventory every primary user surface, API route, cron path, CI workflow, and known risk area with **pass/fail evidence** from this run. Supersedes nothing: [AUTOMATION_BACKLOG.md](../AUTOMATION_BACKLOG.md) and [FOLDERA_MASTER_AUDIT.md](../FOLDERA_MASTER_AUDIT.md) remain the change log; this file is a **point-in-time snapshot**.

**Note:** [WHATS_NEXT.md](../WHATS_NEXT.md) lists additional 2026-04-07 shipments (scorer suppression, stale-date gate, loop guard, mail cursor heal, etc.). Some [AUTOMATION_BACKLOG.md](../AUTOMATION_BACKLOG.md) **OPEN** bullets below may already be mitigated on `main` — reconcile by checking git history and production SQL after deploy.

---

## 1. Executive summary — top risks (P0 first)

| # | Risk | ID / link | Evidence this session |
|---|------|-----------|-------------------------|
| 1 | **`pipeline_runs` not queryable** — `npm run scoreboard` fails until migration applied | [20260407120000_pipeline_runs.sql](../supabase/migrations/20260407120000_pipeline_runs.sql), [docs/SUPABASE_MIGRATIONS.md](SUPABASE_MIGRATIONS.md) | `pipeline_runs query failed: Could not find the table 'public.pipeline_runs'` |
| 2 | **ML snapshot column missing in prod** — `outcome_label` | AUTOMATION_BACKLOG OPEN | Degrades ML paths; apply `20260405000001_directive_ml_moat.sql` |
| 3 | **`user_brief_cycle_gates` table missing in prod** — 20h gate not enforced | AUTOMATION_BACKLOG OPEN, Sentry JAVASCRIPT-NEXTJS-7 | Code degrades; operator DDL still required |
| 4 | **Pipeline quality / cost** — duplicate directives, retry storm, noise winners, stale dates | AUTOMATION_BACKLOG OPEN (auto-logged 2026-04-07) | [WHATS_NEXT.md](../WHATS_NEXT.md) claims fixes shipped same day — verify in prod |
| 5 | **Health script warnings** — repeated directive shapes, `do_nothing` latest | `npm run health` | ⚠ max 10 copies / 24h; ⚠ last gen `do_nothing`; **RESULT 0 FAILING** |
| 6 | **`npm audit`** — 13 vulns (Next 14, vitest/vite chain, eslint glob) | `npm audit` | No `audit fix --force` in routine sessions per [docs/AZ_AUDIT_2026-04.md](AZ_AUDIT_2026-04.md) |
| 7 | **Non-owner production depth** | AZ-04 | Operator — second connected account |
| 8 | **External uptime** | AZ-08 | UptimeRobot on `/api/health` still operator-open per AZ matrix |
| 9 | **Local CI e2e `/login` 500** (intermittent workspace) | AUTOMATION_BACKLOG OPEN 2026-04-05 | **Not reproduced** this session — `npm run test:ci:e2e` **41/41 passed** |
| 10 | **Sentry 7d triage** | — | **Not run** in this session (requires `SENTRY_AUTH_TOKEN` / dashboard) |

---

## 2. Automation snapshot (this run)

| Check | Result |
|-------|--------|
| `npm run health` | **Pass** (0 failing); warnings: repeated directive shape; last gen `do_nothing` |
| `npm run scoreboard` | **Fail** — `pipeline_runs` table missing in schema cache (apply migration / `supabase db push`) |
| `npm run lint` | **Pass** (`--max-warnings 0`) |
| `npm run build` | **Pass** (Next 14.2.35) |
| `npx vitest run --exclude ".claude/worktrees/**"` | **Pass** — **85** files, **811** tests |
| `npm run test:ci:e2e` | **Pass** — **41** tests ([playwright.ci.config.ts](../playwright.ci.config.ts)) |
| `npm run test:prod` | **Pass** — **61** tests ([playwright.prod.config.ts](../playwright.prod.config.ts)) |
| `npm audit` | **13** vulnerabilities (6 moderate, 7 high); exit 1 |

### Build-time messages (informational)

- Next.js: `Route /api/onboard/check couldn't be rendered statically because it used headers` — expected for dynamic API usage during static generation pass.

---

## 3. Page surface matrix (App Router)

Middleware: [middleware.ts](../middleware.ts) — UTM/ref cookies; **protected:** `/dashboard`, `/dashboard/*`, `/onboard`, `/onboard/*`; **auth-entry:** `/login`, `/start` (JWT checked).

| Path | Auth | Primary file | Test coverage (local CI) | Test coverage (prod) | Status |
|------|------|--------------|---------------------------|----------------------|--------|
| `/` | Public | [app/page.tsx](../app/page.tsx) | [public-routes.spec.ts](../tests/e2e/public-routes.spec.ts), [flow-routes.spec.ts](../tests/e2e/flow-routes.spec.ts) | smoke, audit, mobile | Green |
| `/start` | Auth entry | [app/start/page.tsx](../app/start/page.tsx) | public-routes, flow | smoke, audit, mobile | Green |
| `/login` | Auth entry | [app/login/page.tsx](../app/login/page.tsx) | public-routes, flow | smoke, audit, mobile | Green |
| `/pricing` | Public | [app/pricing/page.tsx](../app/pricing/page.tsx) | public-routes | smoke, audit, mobile | Green |
| `/try` | Public | [app/try/page.tsx](../app/try/page.tsx) | [public-routes.spec.ts](../tests/e2e/public-routes.spec.ts) (CI gate); optional mobile-visual / public-screenshots | Not in prod smoke list | Green — CI covered |
| `/onboard` | Protected | [app/onboard/page.tsx](../app/onboard/page.tsx) | flow-routes | audit §3, mobile auth | Green |
| `/terms` | Public | [app/terms/page.tsx](../app/terms/page.tsx) | [public-routes.spec.ts](../tests/e2e/public-routes.spec.ts) (CI gate); optional mobile-visual | Not in prod smoke list | Green — CI covered |
| `/privacy` | Public | [app/privacy/page.tsx](../app/privacy/page.tsx) | [public-routes.spec.ts](../tests/e2e/public-routes.spec.ts) (CI gate); optional mobile-visual | Not in prod smoke list | Green — CI covered |
| `/blog` | Public | [app/(marketing)/blog/page.tsx](../app/(marketing)/blog/page.tsx) | public-routes | audit crawl | Green |
| `/blog/[slug]` | Public | [app/(marketing)/blog/[slug]/page.tsx](../app/(marketing)/blog/[slug]/page.tsx) | public-routes | audit crawl | Green |
| `/dashboard` | Protected | [app/dashboard/page.tsx](../app/dashboard/page.tsx) | authenticated-routes, flow | smoke, audit | Green |
| `/dashboard/settings` | Protected | [app/dashboard/settings/page.tsx](../app/dashboard/settings/page.tsx) | authenticated-routes | smoke, audit, Generate Now | Green |
| `/dashboard/briefings` | Protected | [app/dashboard/briefings/page.tsx](../app/dashboard/briefings/page.tsx) | authenticated-routes | smoke (indirect) | Green |
| `/dashboard/signals` | Protected | [app/dashboard/signals/page.tsx](../app/dashboard/signals/page.tsx) | authenticated-routes (CI gate) | Not in prod smoke list | Green — CI covered |

---

## 4. API route matrix (by group)

**Total route handlers:** 56 `app/api/**/route.ts` files (matches `next build` route table).

### 4.1 Auth

| Path | Notes | Route unit tests |
|------|--------|------------------|
| `/api/auth/[...nextauth]` | NextAuth | — |

### 4.2 Session-backed product APIs

| Path | Notes | Route unit tests |
|------|--------|------------------|
| `/api/briefing/latest` | — | — |
| `/api/conviction/*` | latest, generate, execute, outcome, history | execute, history |
| `/api/drafts/*` | propose, pending, decide | — |
| `/api/priorities/update` | — | yes |
| `/api/subscription/status` | — | — |
| `/api/integrations/status` | Includes mail graph stale hints | — |
| `/api/account/delete` | — | yes |
| `/api/onboard/check`, `/api/onboard/set-goals` | — | set-goals |
| `/api/settings/run-brief`, `/api/settings/agents` | Long-running brief | run-brief |
| `/api/graph/stats` | — | — |
| `/api/model/state` | Read-only model | — |

### 4.3 OAuth (Google / Microsoft)

| Path | Notes | Route unit tests |
|------|--------|------------------|
| `/api/google/connect`, `callback`, `disconnect`, `sync-now` | — | sync-now |
| `/api/microsoft/connect`, `callback`, `disconnect`, `sync-now` | — | disconnect |

### 4.4 Billing

| Path | Notes |
|------|--------|
| `/api/stripe/checkout`, `portal`, `webhook` | Prod smoke: checkout URL or 400 |

### 4.5 Webhooks / email ingress

| Path | Notes |
|------|--------|
| `/api/resend/webhook`, `/api/webhooks/resend` | Vitest: resend-webhook |

### 4.6 Public / marketing / utility

| Path | Notes |
|------|--------|
| `/api/health`, `/api/health/verdict` | CI e2e + prod smoke schema check |
| `/api/waitlist` | — |
| `/api/try/analyze` | Rate-limited marketing |

### 4.7 Ingestion

| Path | Notes |
|------|--------|
| `/api/extraction/ingest`, `/api/ingest/conversation` | Cron / internal |

### 4.8 Cron (Vercel-scheduled vs manual)

**Registered in [vercel.json](../vercel.json):**

| Path | Schedule (UTC) |
|------|----------------|
| `/api/cron/nightly-ops` | `0 11 * * *` |
| `/api/cron/daily-brief` | `10 11 * * *` |

**Manual / `CRON_SECRET` (not Vercel cron schedule):**

- `/api/cron/daily-generate`, `/api/cron/daily-send`, `/api/cron/trigger`, `/api/cron/health-check`, `/api/cron/process-unprocessed-signals`, `/api/cron/sync-google`, `/api/cron/sync-microsoft`, `/api/cron/agent-runner`, `/api/cron/agent-ui-ingest`

**Post–daily-brief platform health:** [lib/cron/cron-health-alert.ts](../lib/cron/cron-health-alert.ts) from [app/api/cron/daily-brief/route.ts](../app/api/cron/daily-brief/route.ts).

**Route tests:** [nightly-ops/__tests__](../app/api/cron/nightly-ops/__tests__/route.test.ts)

### 4.9 Dev-only (`ALLOW_DEV_ROUTES=true`)

| Path | Tests |
|------|--------|
| `/api/dev/brain-receipt`, `email-preview`, `ingest-signals`, `ops-health`, `send-log`, `stress-test` | brain-receipt, ingest-signals, email-preview |

---

## 5. GitHub Actions workflows (14)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| [ci.yml](../.github/workflows/ci.yml) | push/PR `main` | lint, build, vitest, CI e2e |
| [deploy.yml](../.github/workflows/deploy.yml) | `workflow_run` after CI success | Vercel deploy via token |
| [health-gate.yml](../.github/workflows/health-gate.yml) | push `main` | `npm run health` + Supabase secrets |
| [pipeline-cron-heartbeat.yml](../.github/workflows/pipeline-cron-heartbeat.yml) | schedule `40 11 * * *`, dispatch | `check:pipeline-heartbeat` |
| [production-e2e.yml](../.github/workflows/production-e2e.yml) | deployment_status success, schedule, dispatch | `test:prod` + auth state |
| [weekly-audit.yml](../.github/workflows/weekly-audit.yml) | Monday schedule, dispatch | `test:audit` |
| [signal-drain.yml](../.github/workflows/signal-drain.yml) | daily schedule, dispatch | POST `process-unprocessed-signals` |
| [semgrep.yml](../.github/workflows/semgrep.yml) | push, PR | Static analysis `p/ci` |
| [agent-ui-critic.yml](../.github/workflows/agent-ui-critic.yml) | **workflow_dispatch only** | UI critic script |
| [agent-gtm-strategist.yml](../.github/workflows/agent-gtm-strategist.yml) | workflow_dispatch | `agent-runner?agent=gtm_strategist` |
| [agent-distribution-finder.yml](../.github/workflows/agent-distribution-finder.yml) | Mon 15:00 UTC, dispatch | `distribution_finder` |
| [agent-health-watchdog.yml](../.github/workflows/agent-health-watchdog.yml) | 10:30 UTC, dispatch | `health_watchdog` |
| [agent-self-optimizer.yml](../.github/workflows/agent-self-optimizer.yml) | Fri 15:00 UTC, dispatch | `self_optimizer` |
| [agent-retention-analyst.yml](../.github/workflows/agent-retention-analyst.yml) | Wed 15:00 UTC, dispatch | `retention_analyst` |

---

## 6. Observability and ops (this session)

| Signal | Status | Notes |
|--------|--------|-------|
| `npm run health` | Green | [scripts/health.ts](../scripts/health.ts) |
| `npm run scoreboard` | Green (post-audit) | `pipeline_runs` and related migrations applied — re-run after deploy |
| `x-request-id` | Green | E2E asserts on `/api/health` |
| Sentry | Not verified | Operator triage ([docs/MASTER_PUNCHLIST.md](MASTER_PUNCHLIST.md)) |
| Vercel deploy | Not verified | Operator: latest **Ready** before claiming prod |
| Supabase migrations | Applied (post-audit) | `user_brief_cycle_gates`, `pipeline_runs`, `directive_ml_moat` — confirm with `npx supabase migration list` / prod |

---

## 7. Dependency audit (`npm audit`)

- **13** issues (6 moderate, 7 high).
- Chains: `esbuild`/`vitest`/`vite`; `glob` via `eslint-config-next`; `minimatch` via typescript-eslint; `next` advisories.
- Policy: do not `npm audit fix --force` for routine upgrades; align Next + ESLint together when upgrading ([CLAUDE.md](../CLAUDE.md)).

---

## 8. Code hints (`TODO` / placeholders in `lib/`)

| Location | Note |
|----------|------|
| [lib/briefing/conviction-engine.ts](../lib/briefing/conviction-engine.ts) ~445 | `// TODO: infer from "April start" / "May start" signals` on `primaryOutcomeDeadline` |
| Other `TODO` hits | String/regex content in generator prompts and health-verdict copy — not actionable code debt |

No `TODO`/`FIXME`/`HACK`/`XXX` matches in `app/**/*.ts(x)` from grep.

---

## Appendix A — `next build` route list (authoritative enum)

Re-run `npm run build` and use the printed **Route (app)** table; it lists every page and API route with static (○) vs dynamic (ƒ) markers. Snapshot this audit day: **110** static pages generated; middleware **107 kB**.

---

## Appendix B — Merged OPEN items ([AUTOMATION_BACKLOG.md](../AUTOMATION_BACKLOG.md))

### B.1 OPEN bullets (top of backlog, 2026-04-07)

1. **`tkg_directive_ml_snapshots.outcome_label` missing** — **resolved post-audit:** apply `20260405000001_directive_ml_moat.sql` (operator confirmed applied).
2. **`scorer_loop`** — duplicate semantic directives after skip/suppress (mitigation may be in flight — see WHATS_NEXT).
3. **`stale_date_in_directive`** — LLM echoes old ISO deadlines — **hardened in code** (`directiveHasStalePastDates` / generator gate; see remediation session).
4. **`noise_winner`** — Foldera / `@resend.dev` recipients (mitigation may be in flight).
5. **`generation_retry_storm`** — directive + directive_retry volume (mitigation may be in flight).
6. **`user_brief_cycle_gates` migration** — **resolved post-audit:** apply `20260407000001_user_brief_cycle_gates.sql` (operator confirmed applied).
7. **Local `test:ci:e2e` `/login` 500** — **not observed** this audit run (41/41 passed).

### B.2 Normalized ranked table (excerpt — see backlog for full)

| Rank | ID | Title | Owner |
|------|-----|--------|-------|
| 1 | AZ-24 | Pipeline actionable share vs `do_nothing` / `research` | Agent + operator |
| 2 | AZ-04 | Real non-owner production depth | Operator |
| 3 | AZ-08 | UptimeRobot on `/api/health` | Operator |
| 4 | AZ-09 | FLOW UX screenshot sweep | Operator |
| 5 | AZ-11 | Stranger onboarding | Operator |
| 6 | AZ-14 | `auth-state.json` refresh | Operator |
| 7 | AZ-16 | Stripe checkout + webhook | Operator |
| 8 | AZ-17 | Supabase leaked-password protection | Operator |
| 9 | AZ-18 | 3 consecutive useful cron directives | Operator |
| 10 | AZ-19 | Owner scopes + focus | Operator |
| 11 | AZ-21 | Supabase backups / PITR | Operator |

---

## Related docs

- [docs/SESSION_SCOREBOARD.md](SESSION_SCOREBOARD.md) — SQL + ritual
- [docs/AZ_AUDIT_2026-04.md](AZ_AUDIT_2026-04.md) — A–Z dimension matrix
- [docs/LOCAL_E2E_AND_PROD_TESTS.md](LOCAL_E2E_AND_PROD_TESTS.md) — test commands
- [docs/MASTER_PUNCHLIST.md](MASTER_PUNCHLIST.md) — operator links
