# SYSTEM_INVENTORY.md — What Foldera Actually IS

> **Pass 0 of the Master Audit (#445).** This is the canonical "what IS" — every
> table, route, cron, env var, and external resource, reconciled against the
> **real** external state (Supabase / GitHub / Vercel) on the date below, not
> against what the code or docs assume. It is the anti-rediscovery foundation:
> every later pass starts here so we stop re-deriving the same facts.
>
> **Ground-truth date:** 2026-06-19 UTC · **main SHA:** `7783dfe`
> **Reconciliation method:** Supabase MCP (`list_tables`, read-only), GitHub MCP
> (`list_branches`, workflow files), repo source (`process.env` reads, `vercel.json`,
> `app/api/**`, `supabase/migrations/**`). No paid API calls.

---

## 1. External resources (the real accounts)

| Resource | Identity / ref | State | Notes |
|---|---|---|---|
| **Supabase** | project `Foldera` · ref `neydszeamsflpghtrhue` · region `us-west-1` · Postgres 17.6 | `ACTIVE_HEALTHY` | 26 public tables, all RLS-enabled, real prod data flowing |
| **GitHub** | `pm6guy10/foldera-ai` | private | **1 branch (`main`), unprotected** — see §8 / Finding F-1 |
| **Vercel** | Next.js app, production | live | 1 scheduled cron (§5); env list owner-side (Finding F-4) |
| **Anthropic** | `ANTHROPIC_API_KEY` | owner-set in prod (pending per #420) | the one engine-run blocker; daily generation |
| **Slack** | bot token + signing secret | self-loop (owner channel) | review-gated send surface |
| **Resend** | `RESEND_API_KEY` + webhook | email send | gated behind `ALLOW_APPROVAL_EMAIL_SEND` |
| **Stripe** | secret + webhook + price id | billing | checkout/portal/webhook routes live |
| **Google OAuth** | client id/secret | Gmail/Calendar/Drive connectors | |
| **Azure AD** | client id/secret/tenant | Outlook/MS connectors | |
| **PostHog** | project id + personal key | analytics | optional |
| **Sentry** | DSN + environment | runtime errors | optional |

---

## 2. Database — 26 tables (all RLS-enabled)

Reconciled live from Supabase `list_tables` on the ground-truth date. Row counts
are real production data.

| Table | Rows | RLS | Role |
|---|---:|:---:|---|
| `tkg_signals` | 7,198 | ✅ | Immutable external observations (the input) |
| `api_usage` | 2,925 | ✅ | API call accounting |
| `tkg_commitments` | 1,738 | ✅ | Atomic unit of trust (promise w/ deadline) — **the moat** |
| `tkg_actions` | 1,272 | ✅ | Derived actions / drafts |
| `pipeline_runs` | 833 | ✅ | Observability: cron + funnel markers |
| `tkg_entities` | 521 | ✅ | People/orgs; `patterns` JSONB accumulates the moat |
| `cost_events` | 451 | ✅ | Append-only LLM spend ledger |
| `system_health` | 360 | ✅ | Health snapshots |
| `signal_summaries` | 42 | ✅ | Per-week signal rollups |
| `tkg_pattern_metrics` | 24 | ✅ | Bayesian pattern stats |
| `tkg_goals` | 16 | ✅ | User goals |
| `tkg_briefings` | 7 | ✅ | Cached daily briefs |
| `user_tokens` | 6 | ✅ | Encrypted connector tokens |
| `integrations` | 3 | ✅ | Connected services |
| `tkg_constraints` | 3 | ✅ | Constraints |
| `api_budget` | 3 | ✅ | Budget guard state |
| `user_brief_cycle_gates` | 3 | ✅ | Per-user generation gates |
| `user_subscriptions` | 2 | ✅ | Billing state |
| `session_state` | 2 | ✅ | Workday-presence state |
| `tkg_user_meta` | 1 | ✅ | Per-user metadata |
| `waitlist` | 0 | ✅ | Signups (empty) |
| `tkg_conflicts` | 0 | ✅ | Contradictions (empty) |
| `tkg_feedback` | 0 | ✅ | Learning signal (empty) |
| `referral_accounts` | 0 | ✅ | Referrals (empty) |
| `tkg_directive_ml_snapshots` | 0 | ✅ | ML moat snapshots (empty) |
| `tkg_directive_ml_global_priors` | 0 | ✅ | ML priors (empty) |

**Schema history:** the full migration ledger lives under `supabase/migrations/`
(80+ timestamped files, `20250111…` → `20260509…`) plus 3 legacy `sql/` files
(`010_brain.sql`, `011_audit_indexes.sql`, `020_user_meta.sql`). All 26 tables
have RLS enabled — confirms the #420 read-only finding ("all tables RLS-enabled —
clean"). Per-table policy correctness is **Pass 1's** job, not Pass 0's.

---

## 3. API routes — 73 route handlers

Grouped by surface (full enumeration; this is the canonical map):

- **auth** (1): `auth/[...nextauth]`
- **account** (1): `account/delete`
- **conviction** (8): `actions/[id]`, `actions/[id]/document-collection-intake`, `daily-value`, `execute`, `generate`, `history`, `latest`, `outcome`
- **workday-presence** (5): `route`, `message-action`, `message-preview`, `seed-from-scorer`, `triggers`
- **slack** (5): `command`, `interaction`, `right-now`, `test-mode/interaction`, `test-mode/right-now`
- **cron** (14): see §5
- **dev** (7): `brain-receipt`, `cost-summary`, `email-preview`, `ingest-signals`, `ops-health`, `send-log`, `stress-test` *(gated by `ALLOW_DEV_ROUTES`)*
- **google** (4): `callback`, `connect`, `disconnect`, `sync-now`
- **microsoft** (4): `callback`, `connect`, `disconnect`, `sync-now`
- **stripe** (3): `checkout`, `portal`, `webhook`
- **health** (2): `route`, `verdict`
- **drafts** (2): `decide`, `pending`
- **onboard** (2): `check`, `set-goals`
- **settings** (2): `agents`, `run-brief`
- **single-route surfaces** (13): `briefing/latest`, `command-os/intake`, `connectors/test-mode/ingest`, `extraction/ingest`, `graph/stats`, `ingest/conversation`, `integrations/status`, `outcome-autopsy/latest`, `resend/webhook`, `source-readiness`, `subscription/status`, `system/winner-truth`, `try/analyze`, `webhooks/resend`

---

## 4. Cron *routes* vs cron *schedules* — the gap

**Code defines 14 cron routes. `vercel.json` schedules exactly ONE.**

| Cron route | Scheduled in `vercel.json`? | How it actually fires |
|---|---|---|
| `cron/morning-pipeline` | ✅ `0 11 * * *` (daily 11:00 UTC) | **only Vercel-scheduled cron** |
| `cron/daily-brief` | ❌ | not scheduled |
| `cron/daily-generate` | ❌ | not scheduled |
| `cron/daily-send` | ❌ | not scheduled |
| `cron/daily-maintenance` | ❌ | not scheduled |
| `cron/nightly-ops` | ❌ | not scheduled |
| `cron/health-check` | ❌ | not scheduled |
| `cron/agent-runner` | ❌ | GitHub workflow (dispatch) / external |
| `cron/agent-ui-ingest` | ❌ | GitHub workflow (dispatch) / external |
| `cron/process-unprocessed-signals` | ❌ | `signal-drain.yml` (dispatch) / external |
| `cron/sync-google` | ❌ | external / on-demand |
| `cron/sync-microsoft` | ❌ | external / on-demand |
| `cron/trigger` | ❌ | event-driven (`sync-now` → trigger eval, #421) |
| `cron/workday-presence-trigger-runner` | ❌ | `workday-presence-trigger-runner.yml` (dispatch) / external |

> This is consistent with the deliberate "no daily cron" decision (#369) and the
> free event-driven model (#421) — but it means **13 of 14 cron routes do not run
> on any automatic schedule** inside this repo's config. Whether each is
> intentionally external-cron-driven or genuinely orphaned is a **Pass 4 (runtime
> correctness) + Pass 9 (infra)** determination. Logged here so it is decided once.

---

## 5. GitHub workflows — 18 files

| Workflow | Trigger | Auto-runs? |
|---|---|---|
| `ci.yml` | `workflow_dispatch` | ❌ **never on PR/push** — see Finding F-1 |
| `deploy.yml` | `workflow_run` | only if its upstream workflow runs |
| `health-gate.yml` | `push`, `workflow_dispatch` | ✅ on push |
| `issue-auto-label.yml` | `issues` | ✅ on issue events |
| `docs-fast.yml` | `workflow_dispatch` | ❌ |
| `pr-sentinel.yml` | `workflow_dispatch` | ❌ |
| `production-e2e.yml` | `workflow_dispatch` | ❌ |
| `pipeline-cron-heartbeat.yml` | `workflow_dispatch` | ❌ |
| `loop-health-guardian.yml` | `workflow_dispatch` | ❌ |
| `signal-drain.yml` | `workflow_dispatch` | ❌ |
| `weekly-audit.yml` | `workflow_dispatch` | ❌ |
| `workday-presence-trigger-runner.yml` | `workflow_dispatch` | ❌ |
| `agent-distribution-finder.yml` | `workflow_dispatch` | ❌ |
| `agent-gtm-strategist.yml` | `workflow_dispatch` | ❌ |
| `agent-health-watchdog.yml` | `workflow_dispatch` | ❌ |
| `agent-retention-analyst.yml` | `workflow_dispatch` | ❌ |
| `agent-self-optimizer.yml` | `workflow_dispatch` | ❌ |
| `agent-ui-critic.yml` | `workflow_dispatch` | ❌ |

**Only `health-gate.yml` (push) and `issue-auto-label.yml` (issues) fire
automatically.** Everything else, including CI, is manual-dispatch only.

---

## 6. Environment variables — 82 read in code, 29 documented

`grep process.env` across `app/ lib/ scripts/ middleware.ts` finds **82** distinct
keys. `.env.example` documents **29**. Excluding platform-auto-provided keys
(`CI`, `VERCEL*`, `GITHUB_*`, `GH_TOKEN`, `NODE_ENV`, `VITEST`, `DEPLOYED_COMMIT_SHA`),
**37 application keys are read but undocumented:**

`AGENT_UI_BASE_URL`, `ALLOW_APPROVAL_EMAIL_SEND`, `ALLOW_PAID_LLM`,
`ALLOW_PROD_PAID_LLM`, `ALLOW_PROD_PROOF`, `AUDIT_USER_ID`, `AZURE_AD_TENANT_ID`,
`BASE_URL`, `CRON_DAILY_BRIEF_PIPELINE_DRY_RUN`, `DRY`, `ENCRYPTION_KEY_LEGACY`,
`EXTRACTION_DAILY_CAP_USD`, `FOLDERA_ALLOW_LOCAL_PROD_GENERATION`,
`FOLDERA_DB_STATE_VERSION`, `FOLDERA_DEBUG_AUTH`, `FOLDERA_EGRESS_EMERGENCY_MODE`,
`FOLDERA_HEALTH_URL`, `FOLDERA_LOG_PRE_VALIDATION_ARTIFACT`,
`FOLDERA_LOG_SALVAGE_ARTIFACT`, `FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY`,
`HEALTH_STRICT_PRODUCTION`, `LOOP_HEALTH_COLD_DAYS`, `NEXT_BUILD_SETTLE_TIMEOUT_MS`,
`OUTCOME_AUTOPSY_QUERY`, `OWNER_CANARY_USER_IDS`, `OWNER_USER_ID`,
`PIPELINE_HEARTBEAT_EXPECTED_CRON_HOUR_UTC`,
`PIPELINE_HEARTBEAT_EXPECTED_CRON_MINUTE_UTC`, `POSTHOG_PERSONAL_API_KEY`,
`POSTHOG_PROJECT_ID`, `PROD_DEFAULT_PIPELINE_DRY_RUN`, `REPAIR_REWIND_ISO`,
`REPAIR_USER_ID`, `SCORER_FORCE_DECAY_WINNER`, `SENTRY_ENVIRONMENT`, `SUPABASE_URL`,
`UI_CRITIC_ENABLED`.

> Note: `SUPABASE_URL` undocumented while `NEXT_PUBLIC_SUPABASE_URL` **is** documented
> — verify they're intentionally distinct (server vs client) and not a drift bug.
> Most of the rest are operator/debug/proof flags. Closing this gap is **Pass 9's**
> acceptance work; the #433 hardening already added several MS/Slack/Azure keys.

---

## 7. npm scripts (operational surface)

Build/quality core: `build`, `lint`, `typecheck`, `test`, `gate:continuity`,
`gate:quality`, `gate:frontend`, `preflight`. Audit lane: `audit:smoke`,
`audit:ux`, `audit:all`, `cost:egress-audit`. Proof lane: `proof:golden-artifact`,
`beta:readiness`, `winner:autopsy`, `outcome:autopsy`. E2E: the `test:ci:e2e:*`
family (smoke/flow/payments/quarantine). Full list in `package.json`.

---

## 8. Git / branch state

- **Branches on origin: 1 — `main` only.** The handoff/#420 claim of "46–50 stale
  remote branches to prune" is **stale** — they are already gone (Finding F-2).
- `main` is **`protected: false`** (Finding F-1).

---

## 9. Ground-truth corrections (docs said X → reality is Y)

These are the discrepancies Pass 0 found between the written record and live state.
Recorded once, here, so they are not re-derived.

| # | Docs / assumption said… | Reality (2026-06-19) | Feeds |
|---|---|---|---|
| **F-1** | PR-gated workflow, "branch protection points to `ci-passed`" (`AGENTS.md`, `ci.yml` header) | `main` is **unprotected** AND `ci.yml` is `workflow_dispatch` (CI never auto-runs on PR/push) | **Pass 10** (BLOCK candidate) |
| **F-2** | "46–50 stale remote branches need pruning" (`ACTIVE_HANDOFF.md`, #420) | Only `main` exists — already pruned | Pass 10 (close as done) |
| **F-3** | 14 cron routes imply 14 scheduled jobs | Only `morning-pipeline` is Vercel-scheduled; 13 are external/event-driven/orphan | Pass 4 / Pass 9 |
| **F-4** | env "several secrets show Needs Attention" (#445) | 82 keys read vs 29 documented; 37 app keys undocumented | Pass 9 |
| **F-5** | `ACTIVE_SEAM_STATE.json` → active_issue 432 / `claude/cost-economics-audit` | #432 shipped as #444 (merged); control plane is stale | rolled forward in this PR |

---

## 10. Verdict & handoff to later passes

**Pass 0 verdict: `CONCERN`.** The system is real and substantial — 26 RLS-enabled
tables with genuine production data, 73 routes, a coherent pipeline. The concern is
**not** the product; it's that the *governance/safety model is partly paper*: the
PR/CI/branch-protection enforcement that the docs describe is not actually enforced
by the platform (F-1). That is a real gap for "a company you'd trust," and it is
Pass 10's to resolve (turn on branch protection + make `ci.yml` run on PRs, or
consciously accept manual-dispatch CI and stop claiming otherwise).

Routing of findings:
- **Pass 1 (Security):** per-table RLS *policy* correctness + cross-tenant leak test.
- **Pass 4 (Runtime):** which of the 13 unscheduled cron routes are live-external vs orphan (F-3).
- **Pass 9 (Infra):** document the 37 undocumented env keys; verify `SUPABASE_URL` vs `NEXT_PUBLIC_SUPABASE_URL` (F-4).
- **Pass 10 (CI/CD):** branch protection + CI auto-run decision (F-1); close stale-branch item (F-2).

This file is the canonical "what IS." Update it (don't re-derive it) whenever the
real system changes.
