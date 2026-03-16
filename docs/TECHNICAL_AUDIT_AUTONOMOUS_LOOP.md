# Technical Audit: Autonomous Product Improvement Loop Readiness

**Purpose:** Determine whether this codebase can support an autonomous product improvement loop (AI agents proposing changes, implementing them, and running experiments).

**Audit date:** March 12, 2026.

---

## 1. System Architecture

### Overview

The application is a **single Next.js 14 App Router monolith** with server-side Supabase and external integrations. There is no separate backend service; all API logic lives in Route Handlers and shared `lib/` modules.

| Layer | Technology | Notes |
|-------|------------|--------|
| **Frontend** | Next.js 14 App Router, React 18, Tailwind, Framer Motion, Recharts | No client router library; data fetched in components via `fetch` to API routes. |
| **Backend** | Next.js API routes (`app/api/*`) | Stateless; auth per request via NextAuth session or Bearer/header (cron, ingest). |
| **Database** | Supabase (Postgres) | Single `createServerClient()` using **service role**; RLS present but bypassed server-side. |
| **AI** | Anthropic Claude (claude-sonnet-4-6) | Used in: conviction generator, artifact generator, conversation extractor, onboard directive, scan-opportunities, specialist agents. |
| **Auth** | NextAuth (Google OAuth, Azure AD) | Session-based; OAuth tokens stored in `integrations` (encrypted). Cron/ingest use `CRON_SECRET` / `x-ingest-secret`. |
| **External** | Resend (email), Stripe, Gmail/Outlook (send + calendar), Svix (webhooks) | Wired for daily brief, checkout, sync, webhooks. |

### Database schema (relevant to product loop)

- **TKG (identity graph):** `tkg_entities`, `tkg_signals`, `tkg_commitments`, `tkg_actions`, `tkg_goals`, `tkg_briefings`, `tkg_conflicts`, `tkg_feedback`
- **Product/billing:** `waitlist`, `user_subscriptions`, `integrations`, `email_drafts`
- **Legacy/shadow:** `ai_usage`, `briefings`, `relationships`, plus older tables from migrations (e.g. `subscriptions`, `risk_alerts`, `pending_actions`)

Schema is **migration-based** (Supabase migrations); no single schema doc in repo. Table naming has historical drift (e.g. `entities` → `tkg_*` in later migrations).

### Data flow (high level)

1. **Ingest → DB:**  
   `POST /api/ingest/conversation` (or onboard ingest) → `extractFromConversation()` → raw + extracted data into `tkg_signals`, `tkg_entities`, `tkg_commitments`, patterns.  
   Cron: `sync-email`, `sync-calendar` update relationships/signals.

2. **DB → Conviction / Agents:**  
   `generateDirective(userId)` (briefing/generator) reads signals, commitments, entities, goals, feedback → one directive.  
   `generateArtifact(userId, directive)` (artifact-generator) produces email/document/calendar/research/decision/affirmation.  
   Result written to `tkg_actions` (status `pending_approval` or `draft`).  
   Specialist agents (cron) also write to `tkg_actions` as `draft`.

3. **Conviction/agents → UI:**  
   Dashboard calls `/api/conviction/latest`, `/api/drafts/pending`, `/api/graph/stats`.  
   User approves/skips → `POST /api/conviction/execute` or `/api/drafts/decide` → `executeAction()` → run artifact (send email, create event, save doc) and write feedback to `tkg_signals`.

4. **Crons (Vercel):**  
   `sync-email` (02:00), `sync-calendar` (03:00), `cleanup-trials` (04:00), `cleanup-cancelled` (05:00), `scan-opportunities` (06:00), `daily-brief` (07:00) UTC.  
   Agent crons (uiux-critic, gtm-strategist, etc.) exist as routes but are **not** in `vercel.json` (disabled).

---

## 2. Codebase Quality

### Modularity

- **Strengths:**  
  - Clear split: `app/` (routes, pages), `lib/` (db, auth, conviction, agents, extraction, integrations, design-system).  
  - Single DB factory (`lib/db/client.ts`), single auth resolution layer (`resolve-user.ts`), unified execution (`execute-action.ts`).  
  - Zod schemas in `lib/utils/api-schemas.ts` for key request bodies.

- **Weaknesses:**  
  - No domain-style boundaries (e.g. “conviction” vs “onboard” vs “cron”); everything can import across domains.  
  - API routes often contain inline logic; some orchestration could move into `lib/` for reuse and testability.  
  - `lib/briefing/` holds both “briefing” (legacy shape) and the core conviction directive logic—naming doesn’t reflect current product (“conviction engine”).

### Technical debt

- **Single-user assumption:** `INGEST_USER_ID` and cron paths assume one primary user; multi-tenant readiness would require refactors in cron, resolve-user, and several libs.
- **Legacy tables and code paths:** Old tables (e.g. `briefings`, `risk_alerts`, `pending_actions`) and legacy shapes (e.g. `draft_type`/`email_compose` in execute-action) remain; no cleanup strategy documented.
- **Lazy singletons:** `lib/briefing/generator.ts` uses a module-level `_anthropic`; other code creates clients per call. Inconsistent and can bite under serverless cold starts.
- **Type safety:** Widespread `any` (e.g. in dashboard-content, settings, artifact-generator, generator, cron routes, auth-options). Weakens refactor safety and agent-safe edits.

### Duplicated logic

- **Auth checks:** Repeated `resolveUser` / `resolveCronUser` / `validateCronAuth` at top of each route is consistent but verbose; no middleware or wrapper to enforce “all /api/conviction/* require session.”
- **Error handling:** Many routes use `apiError(err, 'route-name')` in catch blocks; others still return `NextResponse.json({ error: ... })` with ad hoc messages. One route returns `result.error` to the client (`conviction/execute` on 404)—acceptable but worth standardizing.
- **Cron agent structure:** Each agent cron route repeats the same pattern: validate cron auth → resolve user → call agent → return counts. Could be a shared handler with a registry of agents.

### Maintainability

- **Documentation:** `CLAUDE.md` is the main system doc and is strong. `README.md` is the default Next.js stub. No API catalog, no schema doc, no ADRs. New engineers (or agents) depend on code and `CLAUDE.md` only.
- **Naming:** “Briefing” vs “conviction” vs “directive” is used inconsistently in filenames and comments; “tkg” is unexplained in repo (only in CLAUDE.md).
- **Config:** No `.env.example`; required env vars are documented only in `CLAUDE.md`. Risk of drift and onboarding friction.

### Security risks

- **Secrets:** Env vars for Supabase, Anthropic, Stripe, Resend, OAuth, encryption key, cron secret. No evidence of secret scanning in CI; rotation story undefined.
- **Input validation:** Zod used for several bodies; not every route validates. Supabase client is service-role—any server-side bug can bypass RLS.
- **Error leakage:** `lib/utils/api-error.ts` correctly returns a generic message to the client and logs detail server-side. Not every catch path uses it; a few routes return custom messages (e.g. “Action not found”) which is acceptable but should stay intentional.
- **No rate limiting on public APIs:** e.g. `/api/try/analyze`, onboard routes. `lib/utils/rate-limit.ts` exists but usage is not systematic.

### Scalability concerns

- **DB:** Single Postgres; no read replicas or connection-pool strategy mentioned. All writes go through one client factory.
- **AI:** Each directive/artifact/extraction call is a synchronous Claude request. No queue, no backoff beyond generic retry in `lib/utils/retry.ts`. Cron jobs that iterate users (e.g. daily-brief) could hit timeouts or rate limits at scale.
- **Single region:** Vercel + Supabase; no multi-region or failover design.

---

## 3. Telemetry & Observability

### What exists

| Area | Current state |
|------|----------------|
| **Structured logging** | Almost none. `console.log` / `console.error` with ad hoc strings (e.g. `[daily-brief] sent 3`, `[conviction/outcome] action_id → outcome`). `lib/utils/api-error.ts` logs with context string; no request ID passed in practice. |
| **Errors** | Server-side logging in catch blocks via `apiError()` or raw `console.error`. No aggregation, no stack trace collection. |
| **Performance** | No request timing, no span or trace IDs. No middleware to measure latency per route. |
| **Business/behavioral events** | No SDK. No PostHog, Amplitude, Mixpanel, or custom event pipeline. Key events (e.g. “directive approved”, “directive skipped”, “trial started”) are not emitted as analytics events. |
| **Health/uptime** | No `/health` or `/ready` endpoint. Vercel and Supabase provide infra-level visibility only. |

### What is missing (for automated product analysis)

- **Event tracking:** No structured events for: page/screen views, button clicks, conversion steps (signup, trial start, first directive approved, subscription), or feature usage. An autonomous loop cannot measure impact of changes without these.
- **Analytics:** No product analytics tool integrated. No funnels, retention, or cohort definitions.
- **Request correlation:** No `x-request-id` or trace ID propagated through API and logs. Hard to debug and to attribute errors to a single request.
- **Performance metrics:** No collection of P50/P95/P99 per route or per operation (e.g. `generateDirective`, `generateArtifact`). Cannot automatically detect regressions.
- **Error monitoring:** No Sentry (or similar). Errors are only in logs; no grouping, no alerting, no release attribution.
- **Experimentation metadata:** No way to tag requests or users with experiment/variant; cannot attribute outcomes to a change.

**Verdict:** The system does **not** collect enough signals for automated product analysis. You would need to add event tracking, analytics, request IDs, performance metrics, and error monitoring before an AI-driven improvement loop could reliably measure the effect of changes.

---

## 4. Experimentation Capability

### Current state

- **A/B tests:** None. No SDK, no experiment framework, no assignment of users to variants.
- **Feature flags:** None. No LaunchDarkly, Statsig, or custom flag system. Behavior is controlled only by code and env.
- **Behavioral metrics:** No product-level event stream. Behavioral data exists in the DB (e.g. `tkg_actions`, approvals/skips) but is not exposed as a unified “metric” layer for experiments.

### What would be required

1. **Feature flags**  
   - Store flags per user or per environment (e.g. `feature_x_enabled`).  
   - Evaluate flags in API routes and/or UI so that an agent can ship code that is gated by a flag and roll out gradually.  
   - No need to build from scratch; integrate a provider or a small DB-backed service.

2. **Experiment assignment**  
   - Persist experiment id + variant per user (or anonymous id).  
   - Middleware or wrapper that attaches `experiment_id` and `variant` to each request (or to event payloads).  
   - So that downstream analytics can segment by variant.

3. **Behavioral metrics pipeline**  
   - Emit structured events for: directive shown, approved, skipped, outcome (worked/didn’t work), trial started, subscription started, etc.  
   - Send to analytics/warehouse (e.g. PostHog, Amplitude, or BigQuery).  
   - Define “success” metrics (e.g. approval rate, 7-day retention) so experiments can be evaluated automatically.

4. **Statistical evaluation**  
   - Tooling or scripts to run significance checks on metric by variant.  
   - Without this, an autonomous loop could not conclude “variant B is better” in a principled way.

**Verdict:** The system **cannot** run product experiments today. You need at least: feature flags, experiment assignment, event emission for key behaviors, and a way to evaluate metrics by variant.

---

## 5. AI Agent Compatibility

Can coding agents (Claude Code, Codex, Cursor agents) safely modify this system?

### Architectural constraints

- **Monolith + shared DB:** Agents can change any route or lib and affect the whole app. There are no hard boundaries (e.g. services with clear contracts), so a change in one area can break another without obvious tests failing.
- **Implicit contracts:** Conviction engine, artifact generator, and execute-action rely on shapes (e.g. `execution_result`, `artifact.type`). These are not expressed as shared TypeScript types or API contracts; they’re in code and comments. Agents might not see all usages and can introduce subtle breakages.
- **Auth model:** Multiple auth paths (session, ingest secret, cron secret). An agent adding a new route might pick the wrong pattern or bypass auth if it doesn’t follow existing routes closely.

### Fragile areas

- **execute-action.ts:** Central to approval flow; handles many artifact types and legacy shapes. High risk from refactors or “cleanup” without full regression coverage.
- **briefing/generator.ts and artifact-generator.ts:** Large prompts and JSON parsing. Changes to prompt or response shape can break callers; no snapshot or contract tests.
- **DB schema:** Migrations are additive; no documented “current schema” or generated types from DB. Agents might assume wrong columns or tables.
- **Cron routes:** Same auth and structure repeated; an agent might change one and not others, or change shared lib and break crons that aren’t run in CI.

### Missing tests

- **Unit:** One focused test file: `lib/conviction/__tests__/execute-action.test.ts`. It mocks Supabase and integrations and covers approve/skip, artifact types, idempotency. No tests for generator, artifact-generator, conversation-extractor, or any API route.
- **Integration:** None. No tests that hit API routes with a test DB or mocks.
- **E2E:** One Playwright test: `tests/e2e/smoke.spec.ts` (“home responds” / title). No flows for login, dashboard, approve/skip, or critical paths.
- **CI:** `package.json` has `test` (Vitest) and `test:e2e` (Playwright). No evidence of CI running tests on every PR; Playwright runs full build + start, which is slow and flaky without guards.

**Verdict:** Agents can *mechanically* edit this codebase, but the lack of tests and explicit contracts makes it **unsafe**: they cannot validate that a change didn’t break conviction, execution, or cron flows. The single unit test and single E2E are far from sufficient.

### Lack of documentation

- No API spec (OpenAPI/Swagger). Agents must infer from route handlers.
- No schema doc or ER diagram. Tables and relationships are in migrations only.
- No “how to add a new cron” or “how to add a new artifact type” runbook. Agents would have to reverse-engineer from existing code.

---

## 6. Autonomous Product Loop Readiness

**Score: 2 / 10**

### Rationale

- **Data and product logic (identity graph, conviction, execution):** Present and working for the current single-user/product scope. **+1**
- **Unified execution and feedback path:** One place for “approve/skip → execute → feedback.” **+1**
- **Observability:** No event stream, no product analytics, no request correlation, no error monitoring, no performance metrics. An autonomous loop cannot measure “did this change improve things?” **−2**
- **Experimentation:** No feature flags, no A/B infrastructure, no behavioral metrics pipeline. Cannot run experiments or roll out changes gradually. **−2**
- **Test coverage:** One unit test file and one minimal E2E. No regression safety for agents. **−2**
- **Contracts and boundaries:** Implicit; types and shapes scattered. High risk of breakage from agent-applied changes. **−1**
- **Documentation:** Strong high-level doc (CLAUDE.md); missing API, schema, and runbooks. **−0.5**
- **Security and ops:** No rate limiting on key APIs, no health checks, no secret/rotation story. **−0.5**

### Main bottlenecks for a self-improving product

1. **No way to measure impact**  
   Without events and analytics, you cannot compute “approval rate,” “time to first value,” or “retention” before/after a change. The loop cannot learn.

2. **No experiments**  
   You cannot ship “variant B” to a subset of users and compare. Every change is all-or-nothing. Rollback is revert-only.

3. **No safety net for changes**  
   Sparse tests and implicit contracts mean that agent-proposed changes (e.g. to conviction or execute-action) are likely to cause regressions that only show up in production.

4. **No feature flags**  
   You cannot merge code that is off by default and turn it on for a percentage of traffic. So you cannot decouple “ship code” from “run experiment.”

5. **Single point of failure**  
   The conviction/artifact/execute pipeline is critical and mostly untested. One bad change can break the core loop for everyone.

---

## 7. Priority Fixes (Top 10)

Listed in order of impact for enabling a safe, measurable, AI-driven improvement loop.

1. **Add product event tracking**  
   Emit structured events (e.g. “directive_shown”, “directive_approved”, “directive_skipped”, “trial_started”) from API and/or UI. Send to an analytics backend (PostHog, Amplitude, or custom). Without this, no autonomous analysis of product impact is possible.

2. **Introduce feature flags**  
   Integrate a feature-flag provider or a small DB-backed flag service. Use it to gate new behavior (e.g. “new_conviction_prompt”) so agents can ship code that is off by default and enabled per user or percentage.

3. **Add error monitoring**  
   Integrate Sentry (or equivalent). Ensure all uncaught errors and `apiError()` paths report with context. Enables alerting and prevents “silent” breakage from agent changes.

4. **Add request correlation**  
   Generate and propagate `x-request-id` (or trace id) in middleware or per-route. Attach to every log line and error report. Essential for debugging and for attributing events to a single request.

5. **Expand unit tests**  
   Add tests for: `generateDirective` (with mocked DB and Claude), `generateArtifact` (per artifact type), and at least one critical API route (e.g. `POST /api/conviction/execute`). Aim to cover the “happy path” and one failure path per module.

6. **Document and enforce API contracts**  
   Define shared TypeScript types (or Zod schemas) for conviction directive, artifact payload, and `tkg_actions.execution_result` shape. Export from a single module and use in generator, artifact-generator, and execute-action. Reduces risk of agents breaking the pipeline.

7. **Add a health/readiness endpoint**  
   e.g. `GET /api/health` that checks DB connectivity and optionally critical env. Enables load balancers and monitoring; simple sanity check after deployments.

8. **Standardize error handling**  
   Ensure every API route catch block uses `apiError(err, context)`. Audit and fix routes that return raw error messages or don’t catch. Optionally pass a request id into `apiError` once correlation exists.

9. **Add E2E coverage for critical paths**  
   At least: (1) load dashboard (authenticated or mocked), (2) approve or skip a directive (or draft) and assert the outcome. Run in CI on every PR to protect the core loop.

10. **Create a minimal experimentation pipeline**  
    Persist experiment id + variant per user; emit events that include variant; add a script or job that computes a key metric (e.g. approval rate) by variant. Doesn’t require full A/B platform—enough to evaluate “did this change help?” before going to full automation.

---

**Summary:** The codebase is coherent and the core product loop (ingest → graph → conviction → artifact → approve/skip → execute → feedback) is implemented. It is **not** ready for an autonomous product improvement loop: observability, experimentation, and test coverage are insufficient, and there are no feature flags or safety nets. The 10 fixes above are the highest-leverage steps to move toward agent-safe, measurable, self-improving product development.
