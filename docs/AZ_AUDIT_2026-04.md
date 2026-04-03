# Foldera A–Z audit — April 2026

**Audit date:** 2026-04-03  
**Definition of A+:** Aligned with [FOLDERA_PRODUCT_SPEC.md](../FOLDERA_PRODUCT_SPEC.md), green lint/build/unit/CI/prod tests, production logs free of user-private payload dumps ([CLAUDE.md](../CLAUDE.md)), operator vs agent ownership explicit for GTM gates ([REVENUE_PROOF.md](../REVENUE_PROOF.md)).

**Related:** [AUTOMATION_BACKLOG.md](../AUTOMATION_BACKLOG.md) (normalized OPEN table), [FOLDERA_MASTER_AUDIT.md](../FOLDERA_MASTER_AUDIT.md), [docs/TECHNICAL_AUDIT_AUTONOMOUS_LOOP.md](./TECHNICAL_AUDIT_AUTONOMOUS_LOOP.md).

---

## Automation snapshot (evidence — this run)

| Check | Result |
|-------|--------|
| `npm run lint` | Pass (flat ESLint, `.claude/**` ignored) |
| `npx vitest run --exclude ".claude/worktrees/**"` | Pass — **610** tests (incl. request-id + conviction burn) |
| `npm run build` | Pass |
| `npm run test:ci:e2e` | Pass — **41** tests (`PLAYWRIGHT_WEB_PORT=3011`, `NEXTAUTH_URL=http://127.0.0.1:3011`; `/api/health` `x-request-id`) |
| `npm run test:prod` | Pass — **61** tests (`playwright.prod.config.ts`) |

**Not run in-session:** Sentry issue triage (needs `SENTRY_AUTH_TOKEN`), Supabase advisor, `npm audit` fix PRs, weekly `npm run test:audit` (optional parity with `.github/workflows/weekly-audit.yml`).

---

## Consolidated NEEDS_REVIEW (deduped from FOLDERA_MASTER_AUDIT)

Multiple dated entries describe the **same** failure class: full local `npx playwright test` (omnibus) fails because **`tests/production/smoke.spec.ts` and production auth storage target `https://www.foldera.ai`** while the default webServer is **`http://localhost:3000`** — session/API assertions and Generate Now expectations do not apply locally without `tests/production/auth-state.json` replay on the same origin or a documented quarantine.

**Canonical auth E2E against production:** `npm run test:prod` + fresh `tests/production/auth-state.json`.  
**Canonical local merge gate:** `npm run test:ci:e2e` (mocked APIs, DB-free).  
**Detail:** [docs/LOCAL_E2E_AND_PROD_TESTS.md](./LOCAL_E2E_AND_PROD_TESTS.md).

**Separate:** `tests/audit/clickflow.spec.ts` timeout on `/` — tracked as audit harness, not production smoke.

---

## A–Z dimension matrix

| Ltr | Dimension | Status | Findings | Evidence | Owner |
|-----|-----------|--------|----------|----------|-------|
| A | Architecture / boundaries | **Green** | Next App Router + `lib/*` split; service-role Supabase server-side | [docs/TECHNICAL_AUDIT_AUTONOMOUS_LOOP.md](./TECHNICAL_AUDIT_AUTONOMOUS_LOOP.md) | Agent |
| B | Billing / Stripe | **Yellow** | Checkout/portal/webhook built; live card + webhook receipt operator-only | `app/api/stripe/*`, REVENUE_PROOF | Operator |
| C | Cron / scheduling | **Yellow** | Crons registered; Hobby may cap at 2 jobs — merge or upgrade per CLAUDE | `vercel.json`, `app/api/cron/*` | Agent / Ops |
| D | Data / DB / migrations | **Yellow** | Migrations in repo; discipline doc added (`docs/SUPABASE_MIGRATIONS.md`); production applies still operator-timed | `supabase/migrations/`, `docs/SUPABASE_MIGRATIONS.md` | Agent |
| E | Email / deliverability | **Green** | Resend + Gmail/Outlook send path; `sent_via` on execute | `lib/email/resend.ts`, `execute-action.ts` | Agent |
| F | Frontend / UX / FLOW | **Yellow** | Prod smoke + `/dashboard/briefings` history UI shipped; FLOW screenshot sweep still open | `app/dashboard/briefings`, `GET /api/conviction/history` | Operator + Agent |
| G | Generator / pipeline | **Yellow** | Large modules; quality gates layered; CE-2 partial (recurring burn inference); CE-3–CE-6 open | `conviction-engine.ts`, AUTOMATION_BACKLOG CE | Agent |
| H | Health / uptime | **Yellow** | `/api/health` + cron health-check; external monitor not configured | `app/api/health`, backlog UptimeRobot | Operator |
| I | Integrations OAuth | **Green** | `user_tokens` SSoT; reconnect UX | `lib/auth/user-tokens.ts`, settings | Agent |
| J | Jobs / background | **Green** | nightly-ops, signal-drain workflow | `.github/workflows/signal-drain.yml` | Agent |
| K | Kill switches / safety | **Green** | `ALLOW_DEV_ROUTES`, rate limits, TEST_USER_ID exclusion | CLAUDE, webhooks | Agent |
| L | Logging / observability | **Green** | Sentry + `x-request-id` middleware (pages + `/api/*`), `apiError` / `apiErrorForRoute`, E2E on `/api/health` | `middleware.ts`, `lib/utils/api-error.ts`, `lib/utils/request-id-core.ts` | Agent |
| M | Multi-user / session | **Green** | Middleware + NextAuth; multi-user-safety tests | `middleware.ts`, `multi-user-safety.test.ts` | Agent |
| N | Non-owner / scale | **Red** | No real connected non-owner in prod — NON_OWNER_DEPTH | `acceptance-gate.ts`, REVENUE_PROOF | Operator |
| O | Ops / runbooks | **Green** | MASTER_PUNCHLIST, MEGA program, SESSION_HISTORY rule | `docs/MASTER_PUNCHLIST.md` | Agent + Operator |
| P | Performance | **Yellow** | Indexes shipped; serverless timeouts on long pipelines | migrations, Vercel limits | Agent |
| Q | Quality gates / tests | **Green** | Lint + 610 vitest + 41 CI e2e + 61 prod | This document § snapshot | Agent |
| R | Revenue / GTM proof | **Yellow** | Gate 4 partial; `sent_via` row operator-pending | REVENUE_PROOF | Operator |
| S | Security | **Green** | CRON timing-safe, webhook verify, secrets in env | `resolve-user.ts`, webhook handlers | Agent |
| T | Trust / content safety | **Green** | trust_class filters, self-signal filtering per spec | scorer, discrepancy-detector | Agent |
| U | UX polish / a11y | **Yellow** | Mobile prod layout tests; blog `[slug]` prose tokens extended | `mobile-prod-layout.spec.ts`, `app/(marketing)/blog/[slug]/page.tsx` | Agent |
| V | Vendor / dependencies | **Yellow** | Dependabot weekly; npm audit not cleared | `.github/dependabot.yml` | Agent |
| W | Webhooks | **Green** | Resend empty-body 400; Stripe signature path | `lib/webhooks/resend-webhook.ts` | Agent |
| X | eXecution approve/skip | **Green** | execute-action + dashboard executing state | `execute-action.ts`, dashboard | Agent |
| Y | Yield (cost / caps) | **Green** | api-tracker, extraction cap separation | `lib/utils/api-tracker.ts` | Agent |
| Z | Zero-drama deploy | **Green** | CI lint → build → vitest → e2e; push main | `.github/workflows/ci.yml` | Agent |

**Suggested backlog IDs:** See [AUTOMATION_BACKLOG.md](../AUTOMATION_BACKLOG.md) OPEN table (`AZ-01` …).

---

## Next quarter

Re-run this file’s automation table and update statuses; diff OPEN table; close NEEDS_REVIEW cluster when local omnibus policy is universally documented and/or harness fixed.
