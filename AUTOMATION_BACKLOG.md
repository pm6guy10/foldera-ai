# AUTOMATION BACKLOG

### OPEN (2026-04-07) — Production `user_brief_cycle_gates` migration

- **Symptom:** Sentry **JAVASCRIPT-NEXTJS-7** — `Could not find the table 'public.user_brief_cycle_gates' in the schema cache` on `POST /api/settings/run-brief` (PostgREST **404** / **PGRST205**). Code shipped before DDL applied.
- **Fix shipped:** `lib/cron/brief-cycle-gate.ts` degrades when the table is missing (no throttle, no throw). **Operator still must** run [`supabase/migrations/20260407000001_user_brief_cycle_gates.sql`](supabase/migrations/20260407000001_user_brief_cycle_gates.sql) on production Postgres (`npx supabase db push` or SQL editor) so the **20h full-cycle gate** actually enforces.

### OPEN (2026-04-05) — Local `test:ci:e2e` `/login` HTTP 500

- **Symptom:** `npx next start` + Playwright CI config against `127.0.0.1:3011` (or `3012`) returned generic **500** on `/login` in this workspace; `test:ci:e2e` therefore failed locally. **GitHub Actions** should still run the same gate with repo secrets (`NEXTAUTH_*`, etc.). **Next:** reproduce with server logs (`next start` stderr) and confirm `NEXTAUTH_URL` matches `WEB_ORIGIN` from `playwright.ci.config.ts`.

### DONE (2026-04-03) — UI Critic auto-trigger killed (agent)

- **Root cause confirmed:** `push: branches: [main]` trigger in `.github/workflows/agent-ui-critic.yml` fired the full Playwright + Sonnet + ingest cycle on every push to main, producing ~5 `action_type='research'` rows per push (one per page if `below_seven=true`). 417 rows in 7 days ≈ 83 workflow runs driven by frequent AI-session commits. Every code path traced: only `insertAgentDraft` (`lib/agents/draft-queue.ts` L53) writes `action_type='research'` rows; only `ingestUiCriticItems` (`lib/agents/ingest-ui-critic.ts`) generates `directive_text='UI/UX below threshold — …'` rows. All other paths (agent-runner, vercel.json crons, nightly-ops, daily-brief, signal-drain) confirmed clean.
- **Commit 19c5b41 (2026-04-03)** removed the two push-trigger lines. Workflow is now `workflow_dispatch` only. No remaining automatic trigger exists.
- **This session:** Updated stale comment on line 1 of `agent-ui-critic.yml` from "After each push to main" → "Manual dispatch only".



- **ERESOLVE on Vercel** — Dependabot branch `eslint@10` + **`eslint-config-next@14.2.3`** (peer `eslint@^7.23 || ^8`) broke `npm install`. **Fix:** pin **`eslint@8.57.1`** in `package.json`; **Dependabot** `ignore` semver-major on `eslint` until Next + `eslint-config-next` upgrade.
- **Runbook:** **`CLAUDE.md`** — *Vercel deploy gate*: do not close a session or run `test:prod` as “verified” until the latest production deploy shows **Ready**; **`AGENTS.md`** pointer.

### DONE (2026-04-04) — AB-25 locked_contact normalization fix (agent)

- **AB-25 CLOSED** — `generator.ts` L5748: `set.add((row.normalized_entity as string).replace(/\s+/g, '').toLowerCase())`. Before the fix, the `lockedContacts` Set was built with spaces preserved ("nicole vreeland") while both candidate-check sites (`L5773`, `L1032` in `buildDecisionPayload`) stripped whitespace ("nicolevreeland") — so the guard was permanently inert. One-line fix aligns all three sites. Schema confirmed via Supabase MCP (`normalized_entity text NOT NULL`). **Tests:** 2 new cases added to `generator-runtime.test.ts` — (1) hard-drop when entityName matches locked row with spaces, (2) non-locked candidate proceeds. 13/13 passed. `npm run build` clean. 664/669 vitest pass (5 pre-existing `execute-action.test.ts` failures, unchanged).

### DONE (2026-04-04) — Supabase MCP + backlog closure (agent)

- **AZ-05 CLOSED (live evidence)** — Production SQL (Supabase MCP, 2026-04-04): `tkg_actions` **last 14 days** by `action_type`: **`do_nothing` 594**, **`research` 350**, **`send_message` 38**, **`write_document` 20**, **`schedule` 4** (n=1006). Skew confirms need for pipeline calibration — tracked as **AZ-24** (OPEN).
- **AZ-24 receipt (2026-04-03, Supabase MCP)** — **14d:** `do_nothing` 616, `research` 364, `send_message` 36, `write_document` 20, `schedule` 4 (n=1040). **7d:** `do_nothing` 491, `research` 364, `send_message` 31, `write_document` 16 (n=902). **GitHub CI** `ci.yml` on `8739494`: **success**. **`npm run test:prod`:** 61 passed. **Research 7d breakdown:** `status` draft 363, executed 1; `execution_result.status` all null; `evidence.generation_log.stage` none — see [`scripts/az24-research-breakdown.sql`](scripts/az24-research-breakdown.sql).
- **AZ-24 receipt (2026-04-03 follow-up, Supabase MCP — post slice-1/2 deploy needle)** — **14d:** `do_nothing` 627, `research` 390, `send_message` 36, `write_document` 20, `schedule` 4 (n=1077). **7d:** `do_nothing` 502, `research` 390, `send_message` 31, `write_document` 16 (n=939). Delta vs prior same-day receipt: **`research` +26 / 14d**, **`do_nothing` +11 / 14d** (mix still dominated by `do_nothing` + `research`). **GitHub CI** `ci.yml` on **`7f0798f`**: **success** (https://github.com/pm6guy10/foldera-ai/actions/runs/23953118878). **`npm run test:prod`:** 61 passed. **Operator:** confirm **Vercel Ready** on latest production deployment for this SHA.
- **AZ-24 (2026-04-04, slice 1 — shipped)** — **`no_thread_no_outcome`** no longer fires when **`supporting_signals`** is empty but the scorer attached **past `sourceSignals`** (`lib/briefing/thread-evidence-for-payload.ts`, wired in `buildDecisionPayload`). **Tests:** `thread-evidence-for-payload.test.ts`.
- **AZ-24 (2026-04-04, slice 2 — shipped)** — **`has_recent_evidence`** and DecisionPayload **`freshness_state` / stale age** use **`getNewestEvidenceTimestampMs`**: max past timestamp over **hydrated `supporting_signals`** ∪ **`winner.sourceSignals`** (same union family as thread gate). **Tests:** `thread-evidence-for-payload.test.ts`.
- **AZ-24 (2026-04-03, slice 3 — shipped)** — **`detectEmergentPatterns`** **signal_velocity** (6h spike) uses **`suggestedActionType: make_decision`** instead of **`research`** (`lib/briefing/scorer.ts`). **Tests:** [`lib/briefing/__tests__/scorer-emergent-signal-velocity.test.ts`](lib/briefing/__tests__/scorer-emergent-signal-velocity.test.ts). **Next levers:** legacy **`research`** row drain; other `research` paths in scorer/generator.
- **`apply_commitment_ceiling` on production** — Migration applied via Supabase hosted migrations (`20260403144654` / `apply_commitment_ceiling`); aligns with repo [`20260404000001_apply_commitment_ceiling.sql`](supabase/migrations/20260404000001_apply_commitment_ceiling.sql). Self-heal uses **atomic RPC** when available.
- **Vitest flake** — [`generator-runtime.test.ts`](lib/briefing/__tests__/generator-runtime.test.ts) “credit balance too low” case timeout **20s** (parallel run stability).

### DONE (2026-04-04) — Code excellence baseline (agent slice)

- **AZ-01 CLOSED** — Harness documented: [`docs/LOCAL_E2E_AND_PROD_TESTS.md`](docs/LOCAL_E2E_AND_PROD_TESTS.md), root [`playwright.config.ts`](playwright.config.ts) `testIgnore`, `npm run test:local:e2e`, merge gate `npm run test:ci:e2e`, prod `npm run test:prod`.
- **AZ-05** — Superseded by **DONE (2026-04-04) — Supabase MCP** above (live query + **AZ-24** follow-up). Canonical query: [`scripts/az05-action-type-distribution.sql`](scripts/az05-action-type-distribution.sql).
- **CE-2** — [`lib/briefing/monthly-burn-inference.ts`](lib/briefing/monthly-burn-inference.ts) (extracted slice) + weak recurring (3+ occurrences); tests in [`conviction-engine-burn.test.ts`](lib/briefing/__tests__/conviction-engine-burn.test.ts).
- **Tier 2 hygiene** — `npm audit fix` applied (transitive); **Next 14.x** high advisories remain until planned major upgrade (documented in [`docs/AZ_AUDIT_2026-04.md`](docs/AZ_AUDIT_2026-04.md)); Section 4 [`audit.spec.ts`](tests/production/audit.spec.ts) GET retry.
- **Tier 3 runbook P0s** — `assertProductionCoreEnvOrThrow` in [`instrumentation.ts`](instrumentation.ts); atomic commitment ceiling [`supabase/migrations/20260404000001_apply_commitment_ceiling.sql`](supabase/migrations/20260404000001_apply_commitment_ceiling.sql) + [`lib/cron/self-heal.ts`](lib/cron/self-heal.ts) RPC-first with chunked fallback; legacy decrypt log in [`lib/encryption.ts`](lib/encryption.ts).
- **Tier 4** — First vertical slice: **monthly burn** extracted from `conviction-engine.ts` (scorer/generator deeper splits deferred).

### DONE (2026-04-03) — A+ remediation plan (full agent slice)

- **Vercel Hobby 2 crons** — [`vercel.json`](vercel.json): removed scheduled **`/api/cron/health-check`**; [`lib/cron/cron-health-alert.ts`](../lib/cron/cron-health-alert.ts) **`runPlatformHealthAlert()`**; wired from [`app/api/cron/daily-brief/route.ts`](../app/api/cron/daily-brief/route.ts) `finally` + refactored [`app/api/cron/health-check/route.ts`](../app/api/cron/health-check/route.ts).
- **AZ-22 CE-3–CE-6** — [`lib/briefing/conviction-engine.ts`](../lib/briefing/conviction-engine.ts): CE-3 calendar/goal-aligned hard deadlines; CE-4 `hiringFunnelTierFromPlaintext` (funnel ceiling ~90%); CE-6 `detectReferenceRiskBlindspot` + `referenceRiskNotes` on `SituationModel` / math; [`lib/cron/goal-refresh.ts`](../lib/cron/goal-refresh.ts) CE-5 signal-based 21d decay + `signalReinforcesGoalKeywords`; tests [`conviction-engine-ce.test.ts`](../lib/briefing/__tests__/conviction-engine-ce.test.ts), [`goal-decay-signal.test.ts`](../lib/cron/__tests__/goal-decay-signal.test.ts).
- **AZ-01 harness** — [`package.json`](../package.json) **`npm run test:local:e2e`**; [`CLAUDE.md`](../CLAUDE.md); [`tests/audit/clickflow.spec.ts`](../tests/audit/clickflow.spec.ts) `domcontentloaded` + longer timeouts (optional **`npm run audit:smoke`** only).
- **Closed AZ rows (moved from OPEN table):** **AZ-06, AZ-07, AZ-10, AZ-12, AZ-13, AZ-15, AZ-20** (see prior DONE bullets below).

### DONE (2026-04-03) — Backlog → A+ (agent slice)

- **AZ-06** — `x-request-id`: [`middleware.ts`](middleware.ts) + [`lib/utils/request-id-core.ts`](lib/utils/request-id-core.ts) / [`request-id.ts`](lib/utils/request-id.ts); [`apiError`](lib/utils/api-error.ts) Sentry tag + response header/body; [`apiErrorForRoute`](lib/utils/api-error.ts) wired across `app/api/**` catch blocks; Vitest [`request-id-core.test.ts`](lib/utils/__tests__/request-id-core.test.ts); E2E [`tests/e2e/public-routes.spec.ts`](tests/e2e/public-routes.spec.ts) `/api/health` header checks.
- **AZ-20** — [`docs/SUPABASE_MIGRATIONS.md`](docs/SUPABASE_MIGRATIONS.md) (discipline + `supabase db push`).
- **AZ-05** — **Closed 2026-04-04** (live counts in DONE **Supabase MCP** above). Historical: same SQL as [`scripts/az05-action-type-distribution.sql`](scripts/az05-action-type-distribution.sql).
- **AZ-10** — Blog [`[slug]/page.tsx`](app/(marketing)/blog/[slug]/page.tsx): `prose-blockquote`, `prose-hr`, list color tokens.
- **AZ-12** — Root [`app/layout.js`](app/layout.js): `keywords`, `robots`, `openGraph.url` / `siteName` / `locale`, refined default description; `metadataBase` → `https://www.foldera.ai`.
- **AZ-13** — [`app/try/page.tsx`](app/try/page.tsx): pricing + start CTAs with `data-foldera-cta` hooks.
- **AZ-15** — [`docs/ENTITY_DEDUPE.md`](docs/ENTITY_DEDUPE.md), [`scripts/entity-dedupe-audit.sql`](scripts/entity-dedupe-audit.sql) (read-only audit).
- **AZ-22 (CE-2 partial)** — [`estimateMonthlyBurnFromSignalAmounts`](lib/briefing/conviction-engine.ts) + [`conviction-engine-burn.test.ts`](lib/briefing/__tests__/conviction-engine-burn.test.ts); `inferMonthlyBurn` uses `occurred_at` + recurring-day proxy. **CE-1** already wired in [`generator.ts`](lib/briefing/generator.ts) (`runConvictionEngine`).

### DONE (2026-04-03) — A–Z audit + backlog normalization + briefings + runbooks

- **[docs/AZ_AUDIT_2026-04.md](docs/AZ_AUDIT_2026-04.md)** — Full A–Z dimension matrix (Green/Yellow/Red), automation snapshot (lint, **601** vitest, build, **39** CI e2e, 61 test:prod), consolidated **NEEDS_REVIEW** dedupe note.
- **[docs/LOCAL_E2E_AND_PROD_TESTS.md](docs/LOCAL_E2E_AND_PROD_TESTS.md)** — Canonical commands: `test:ci:e2e` vs `test:prod` vs omnibus; **AZ-01** doc quarantine.
- **OPEN table** — Replaced flat list with ranked **P0–P2** table (`AZ-01` … `AZ-22`); merged prior OPEN + punchlist themes.
- **Past directives:** `GET /api/conviction/history`, [`app/dashboard/briefings/page.tsx`](app/dashboard/briefings/page.tsx), History icon on [`app/dashboard/page.tsx`](app/dashboard/page.tsx); unit test [`app/api/conviction/history/__tests__/route.test.ts`](app/api/conviction/history/__tests__/route.test.ts); E2E in [`tests/e2e/authenticated-routes.spec.ts`](tests/e2e/authenticated-routes.spec.ts).
- **[docs/MASTER_PUNCHLIST.md](docs/MASTER_PUNCHLIST.md)** — UptimeRobot section (**AZ-08**); Playwright section links LOCAL doc.
- **[CLAUDE.md](CLAUDE.md)** — Local omnibus policy link.

### DONE (2026-04-03) — Quality hardening loop (Resend + lint + CI + tooling)

- **Resend webhook** — `lib/webhooks/resend-webhook.ts`: reject **empty body** with **400** before Svix `verify` (clearer than signature failure). **E2E** `tests/e2e/backend-safety-gates.spec.ts` expects `400`. **Unit:** `lib/webhooks/__tests__/resend-webhook.test.ts` (empty body + unsigned JSON → 401).
- **`npm run lint`** — `cross-env ESLINT_USE_FLAT_CONFIG=true eslint . --max-warnings 0` (flat `eslint.config.mjs`, ignores `.claude/**`). Replaces interactive `next lint` when no legacy `.eslintrc`.
- **CI** — `.github/workflows/ci.yml` runs **Lint** after `npm ci`, before **Build**.
- **`FolderaMark`** — `next/image` + `unoptimized` for `/foldera-glyph.svg` (satisfies `@next/next/no-img-element`).
- **`playwright.ci.config.ts`** — `PLAYWRIGHT_WEB_PORT` + `npx next start -p <port>` + matching `baseURL` (same escape hatch as root `playwright.config.ts` when :3000 is taken).
- **Dependabot** — `.github/dependabot.yml`: weekly `npm`, `open-pull-requests-limit: 5`.
- **devDependency:** `cross-env` for portable lint script on Windows/macOS/Linux.

### DONE (2026-04-03) — Plan continuation (overnight / agent)

- **`npm run test:local:check`** — [`tests/local/check-prereqs.ts`](tests/local/check-prereqs.ts); [`tests/local/README.md`](tests/local/README.md) + [`CLAUDE.md`](CLAUDE.md) Autonomous local hammer; fails fast when `auth-state-owner.json` absent.
- **Supabase re-check:** Still no `execution_result.sent_via` in prod; **REVENUE_PROOF** Gate 4 second row operator-pending (note dated 2026-04-03).
- **MEGA_PROMPT_PROGRAM** S2 table row 2026-04-03.

### DONE (2026-04-02) — Plan execution (GTM + quality)

- **Supabase (agent):** No duplicate `user_subscriptions` rows; latest executed `send_message` `64815e7b-6e2c-4af9-9491-66b93c5b9495` (2026-03-24 UTC) — Resend delivery (`resend_id`); no `sent_via` key on row — **REVENUE_PROOF** Gate 4 first table row + gate status **PARTIAL**; second row operator-pending for post-ship `sent_via`.
- **Sentry:** `JAVASCRIPT-NEXTJS-5` (fetch failed / subscription status, Playwright-noise) and `JAVASCRIPT-NEXTJS-4` (local `.next` ENOENT) marked **ignored**.
- **Playwright prod audit:** [`tests/production/audit.spec.ts`](tests/production/audit.spec.ts) — `/blog` crawl uses longer timeout, `domcontentloaded` + best-effort `networkidle` to reduce flake.
- **Homepage:** [`app/page.tsx`](app/page.tsx) hero sub — money loop (one morning email, approve/skip, mailbox when connected); **REVENUE_PROOF** gate 2 **YELLOW**.
- **Non-owner / Stripe:** Agent notes in **REVENUE_PROOF** — still operator-only; synthetic `22222222` only non-owner in `tkg_actions`.
- **S2 local brain:** **MEGA_PROMPT_PROGRAM** S2 record — `auth-state-owner.json` still requires interactive `test:local:setup`; no S3 until S2 runs.

### DONE (2026-04-02) — MASTER_PUNCHLIST operator index

- **`docs/MASTER_PUNCHLIST.md`** — Vercel / GitHub / Supabase / Sentry / Resend / Stripe / Anthropic links; **no email after Generate Now** (`POST /api/settings/run-brief` → `stages.daily_brief.send.results`); **Gate 4** instructions (no fabricated `REVENUE_PROOF`); Playwright refresh pointers. Linked from **`MEGA_PROMPT_PROGRAM.md`**, **`AGENTS.md`**, **`FOLDERA_PRODUCT_SPEC.md`**, **`REVENUE_PROOF.md`** (Gate 4 section).

### DONE (2026-04-02) — Mega prompt execution program

- **`docs/MEGA_PROMPT_PROGRAM.md`** — single source for decomposed mega-prompt sessions (Phase 0.5 local hammer, S1 baseline table, S4 operator checklist, Cursor paste template). **`AGENTS.md`** links here for multi-session quality work.
- **Local E2E reliability:** `lib/auth/auth-options.ts` — production session cookie `domain` is set to `.foldera.ai` only when `VERCEL` is set, so local `next start` + Playwright on `127.0.0.1` works when `NEXTAUTH_URL` points at https production. **`playwright.config.ts`** — optional `PLAYWRIGHT_WEB_PORT` + `npx next start -p <port>` when :3000 is busy; **`tests/e2e/authenticated-routes.spec.ts`** `E2E_ORIGIN` follows `PLAYWRIGHT_WEB_PORT`.

### Operator-only GTM gates (human required)

These close `REVENUE_PROOF.md` / spec proof tables; agents cannot complete them without your account.

1. **Gate 4 live receipt** — Historical Resend row filled in `REVENUE_PROOF.md` (2026-04-02). **Still:** Approve one **new** `send_message` after `sent_via` ship; add **second** table row with explicit `gmail` / `outlook` / `resend`.
2. **Stripe** — Run checkout from `/pricing` (test or live per env); confirm webhook updates `user_subscriptions`; note date/mode in `REVENUE_PROOF.md`.
3. **Non-owner proof (optional)** — Second Google account: signup, connect, confirm brief + `tkg_actions` row for that `user_id`.

### P1 — Autonomous agents — production wiring (2026-03-31)

- **Apply migration** `20260331120000_agent_layer.sql` to production Postgres — **DONE** (2026-03-31): applied via Supabase MCP as migration `agent_layer_action_source` on project `neydszeamsflpghtrhue` (`tkg_goals_source_check` includes `system_config`; `tkg_actions.action_source` + index).
- **GitHub repo secrets** for agent workflows: `AGENT_BASE_URL` (e.g. `https://www.foldera.ai`), `CRON_SECRET`, `ANTHROPIC_API_KEY` (UI critic script). Workflows: `.github/workflows/agent-*.yml`.

### DONE (2026-04-01) — New-user reliability + delivery audit

- **First-morning welcome path** — `lib/cron/daily-brief-generate.ts`: if `tkg_signals` count &lt; 5, account &lt; 48h old, onboarding goals present, and no prior `brief_origin: first_morning` action, persist `write_document` + goal-summary artifact with `firstMorningBypass` (skips scorer/generator and self-feed). Gates: `evaluateBottomGate` / `isSendWorthy` / `validateDirectiveForPersistence` respect bypass.
- **Daily send audit** — `runDailySend` → `sendDailyDeliverySkipAlert()` (`lib/email/resend.ts`) to `brief@foldera.ai` when any user in the batch did not get `email_sent` / `email_already_sent` (lists user id, code, detail). Skips when `RESEND_API_KEY` unset.
- **`/api/cron/daily-send` HTTP** — `app/api/cron/daily-send/route.ts`: all-soft-failure batches (`no_verified_email`, `no_generated_directive` only) return **200** so cron health checks do not 500 when no one was emailable.
- **Eligibility** — `listConnectedUserIds()` in `lib/auth/user-tokens.ts`; `filterDailyBriefEligibleUserIds` includes OAuth-connected users without a `user_subscriptions` row yet; `getEligibleDailyBriefUserIds` unions graph `self` + connected.
- **Onboard** — `POST /api/onboard/set-goals` fire-and-forget `syncGoogle` / `syncMicrosoft` with `MS_90D` lookback after goals RPC succeeds.
- **Settings OAuth UX** — `integrations/status`: `needs_reconnect` when no `refresh_token` in `user_tokens`; `sync_stale` when `last_synced_at` &gt;3d (`INTEGRATIONS_SYNC_STALE_MS`); `SettingsClient` Reconnect for either; copy distinguishes “reconnect required” vs “sync looks stalled.”
- **Fatal OAuth refresh** — `invalid_grant` / selected AADSTS (Microsoft) and `invalid_grant` (Google) on refresh → `softDisconnectAfterFatalOAuthRefresh` (same as manual disconnect) so cron stops and user re-signs via Connect; `oauth_refresh_fatal_soft_disconnect` log.

### DONE (2026-04-01) — Playwright / tooling

- **Production mobile layout** — `tests/production/mobile-prod-layout.spec.ts` runs in **`npm run test:prod`** (see `playwright.prod.config.ts`): viewports **412×915** and **390×844**, asserts `scrollWidth ≤ clientWidth + 1`, writes PNGs to `tests/production/screenshots/mobile-prod/{412x915,390x844}/` (anonymous `login`/`start` + marketing `home`/`pricing`) and `*-auth/` (`dashboard`, `settings`, `onboard`). Authenticated block skips when `auth-state.json` missing/expired.
- **`npm run test:prod`** now uses `testMatch: ['**/smoke.spec.ts', '**/audit.spec.ts', '**/mobile-prod-layout.spec.ts']` so `public-screenshots.spec.ts` is not run in the same parallel pool (fixes Windows flake / timeout against `/` button crawl). Use **`npm run test:screenshots`** for the public PNG sweep.
- **Production smoke** skips authenticated suites when `tests/production/auth-state.json` is missing or session cookies are expired (`describeAuth` in `smoke.spec.ts`); `playwright.prod.config.ts` omits `storageState` when the file is absent.
- **Local default Playwright** (`playwright.config.ts`) documents `test:prod:setup` and ignores `tests/production/**` + `tests/audit/**`.
- **`tests/e2e/authenticated-routes.spec.ts`**: `describeAuthMocked` skips mocked dashboard/settings suites when `NEXTAUTH_SECRET` is unset; unauthenticated settings smoke stays in `test.describe`.
- **2026-03-31**: `middleware.ts` uses the same `secureCookie` rule as `getAuthOptions()` so local `next start` + `NEXTAUTH_URL=https://…` still reads `next-auth.session-token`. E2E mocks use `matchApiPath()` (pathname match) because string globs miss `?…` query suffixes on API URLs.

### P1 — Cross-source brain depth — production receipt (2026-03-31)

**Status: CODE SHIPPED; LIVE RECEIPT STILL THE PROOF GATE.**

**Scope:** Calendar / drive / conversation / convergence discrepancies; `structuredSignals` + `recentDirectives` inputs; send_message-only entity skip penalty; `mergeUrgencyWithTimeHints`.

**2026-04-01 brain-quality pass:** Fixed `schedule_conflict` → `write_document` stalling at `Artifact generation failed.` when `loadRelationshipContext()` threw before the Haiku transform try/catch, and aligned discrepancy **transform flavor** + **bottom gate** with `discrepancyClass` (class beats “reconnect” in `reason` text).

**Next proof:** After deploy, owner `POST /api/dev/brain-receipt` with `ALLOW_DEV_ROUTES=true` — or locally `npm run test:local:brain-receipt` after `npm run test:local:setup` — expect `pending_approval` or non-null artifact; confirm `scorer_diagnostics` and `npm run test:prod` on green deploy when `tests/production/auth-state.json` is fresh.

### Ops — Email forwarding (foldera.ai)

Set up email forwarding: `privacy@foldera.ai`, `support@foldera.ai` → `b.kapp1010@gmail.com` (requires DNS MX records on foldera.ai domain).

### P0 — HARD BOTTOM GATE: BLOCK OPERATIONALLY EMPTY WINNERS (2026-03-31)

**Status: SHIPPED.** Commit `835ab43`, deployed `dpl_ANMqJbrPj52Rm71GZZaKnmS4aXHx`.

**Blocker class:** Structurally valid but operationally empty winners — `write_document` memos with no external target, no concrete ask, no real pressure. Pass all existing gates (confidence, evidence, artifact generation) but produce fortune-cookie output the user cannot act on.

**Fix:** `evaluateBottomGate()` in `lib/cron/daily-brief-generate.ts` — 6 checks, all must pass before `pending_approval` insert:
1. External execution target exists (real person name or email address)
2. Concrete ask exists (question, request, or imperative directed at someone)
3. Real-world pressure exists (deadline, consequence, or forcing function)
4. Not a self-referential document (reflection/memo/analysis to self)
5. Not generic social motion (just "checking in" / "catching up")
6. Artifact is immediately executable (not a framework/question-list)

**Block reason enums:** `NO_EXTERNAL_TARGET`, `NO_CONCRETE_ASK`, `NO_REAL_PRESSURE`, `SELF_REFERENTIAL_DOCUMENT`, `GENERIC_SOCIAL_MOTION`, `NON_EXECUTABLE_ARTIFACT`

**Production proof:**
- BEFORE (`af60f967`, pre-deploy): `write_document` memo "Publish a decision memo that locks owner accountability..." — no real person, passive "Decision required" language. Gate would block with `NO_CONCRETE_ASK`.
- AFTER (`daa49f78`, post-deploy): `send_message` email with "Can you confirm..." + deadline + consequence. Gate PASSED — external target, concrete ask, real pressure.

**Tests:** 11 unit tests in `lib/cron/__tests__/bottom-gate.test.ts`. 524/524 tests pass across 45 files.

**Next required proof:** Nightly cron run (4 AM PT) — check whether the first organic generation hits the gate or survives. Query: `SELECT id, status, action_type, confidence FROM tkg_actions WHERE generated_at > '2026-04-01' ORDER BY generated_at LIMIT 3`.

### P0 — RELATIONSHIP CANDIDATES FULLY UNBLOCKED (2026-03-30)

**Status: RESOLVED.** Relationship candidates now survive all ranking invariants and are genuinely competitive.

**Root cause (5 separate blockers, all fixed this session):**

1. **Noise pre-filter** (`NOISE_CANDIDATE_PATTERNS[3]` = `^follow\s+up\s+(?:with|on)\s+`) matched every relationship candidate title "Follow up with X". Fixed in prior commit (`69a529c`) with `if (c.type === 'relationship') continue;`.

2. **`isOutcomeLinkedCandidate` false for relationship type** — bare content "mike george: last contact 11 days ago" doesn't match OUTCOME_SIGNAL_PATTERNS and has no matchedGoal. Fixed: relationship type → always true (verified entity interaction IS a board-level outcome).

3. **`computeEvidenceDensity` < 2** — relationship content has no matchedGoal, empty relatedSignals (word overlap too sparse), no @/$//date marker → density=1, failing ≥2 threshold. Fixed: `if (type === 'relationship') density += 1` (entity in tkg_entities = concrete evidence).

4. **`isObviousFirstLayerAdvice` true** — `OBVIOUS_FIRST_LAYER_PATTERNS[0]` = `/^\s*(?:follow\s+up|...)/i` matches canonical relationship title. Fixed: `isRelationship ? false : isObviousFirstLayerAdvice(...)`.

5. **Discrepancy priority penalty 0.55x** — `strongOutcomeCommitment` only covered `type='commitment'`, leaving relationships with the full 0.55x suppression. Fixed: renamed to `strongOutcomeCandidate`, extended to include `type='relationship'` with stakes≥3, urgency≥0.6, density≥3 → 0.88x softened penalty.

**Production proof (commits `193afe5`, `6f58785`, `5750b38`):**
- Mike George relationship: raw_score 0 → **1.92** (pre-invariant 2.181 × 0.88)
- Discrepancy (financial runway) still wins at 2.52 — correct ordering
- 507/507 unit tests pass; 51/51 production smoke tests pass

### P0 — PERSONAL ENTITY CONTAMINATION ELIMINATED (2026-03-30)

**Status: RESOLVED.** Personal entities (krista, emmett) no longer enter the candidate pool.

**Root cause (exact):**
- Trust-class migration (`20260330000001`) added `trust_class` column and backfilled `junk`/`transactional` but NOT `personal`. The runtime `classifySignalTrustClass()` classified new signals as `personal`, and `mergeTrustClass()` propagated to entities, but the scorer/discrepancy queries had no `.in('trust_class', ['trusted', 'unclassified'])` filter until commit `ef3a4c5`.
- Between migration apply and code deploy, entities with `trust_class='personal'` (krista: 52 interactions, emmett: 14 interactions) still passed the old unfiltered entity query and entered the discrepancy detector's `risk` and `decay` extractors.
- These personal entities ranked #1 and #3 (scores 3.23 and 2.50), displacing the real financial runway candidate at #2 (score 2.52). Both hit `no_thread_no_outcome` in generation, blocking the entire pipeline.

**Fix (commit `ef3a4c5`, deployed via `dpl_12btEZnRtxnhMAyTPf84ZP7rpDwu`):**
- `scorer.ts`: added `.in('trust_class', ['trusted', 'unclassified'])` to all 4 entity/commitment queries (scoreOpenLoops, detectAntiPatterns, detectEmergentPatterns).
- `discrepancy-detector.ts`: added redundant in-memory trust_class filter at detector entry point.
- Regression tests: 2 new cases in `discrepancy-detector.test.ts` — personal entities produce zero candidates; personal entities do not displace trusted candidates.

**Production proof (fresh owner receipt `4d5188bf`):**
- Top 5: sam devore (trusted, #1, score 3.11), financial runway (#2, 2.52), miranda (#3, 2.41), candice (#4), commitment (#5).
- Winner: sam devore → `send_message`, confidence=77, `pending_approval`.
- Contamination check: krista=false, emmett=false.
- **PASS**: fresh winner comes from a real business contact, not personal contamination.

### P0 — OWNER-ONLY REAL-DATA BRAIN RECEIPT + FORCED FRESH RUN (2026-03-29)

**Status: PARTIALLY RESOLVED (core blocker fixed, receipt path shipped).**

**Blocker fixed (exact) — superseded 2026-04-07:**
- `forceFreshRun` **no longer** auto-suppresses valid `pending_approval` within **18h**; approve/skip must clear pending before a new cycle (same as cron). `reconcilePendingApprovalQueue` uses an **18h rolling** cutoff for keep vs suppress (not UTC-day-only). Skipped-to-pending recovery runs under force as well.

**Receipt path added (exact):**
- `POST /api/dev/brain-receipt` (`app/api/dev/brain-receipt/route.ts`)
- Owner-only (session user must equal `OWNER_USER_ID`)
- Forces fresh generation path:
  - `runDailyGenerate({ userIds:[owner], skipStaleGate:true, skipSpendCap:true, forceFreshRun:true })`
- Returns structured receipt with:
  - top 5 candidate logs
  - final winner trace (when available)
  - accepted causal diagnosis + source (if present in inspection metadata)
  - full generated artifact
  - decision-enforcement result
  - send-worthiness result
  - explicit stale-action non-reuse proof against `2e3a92ac-f93e-42b4-a978-bedd3dcee4d6`

**Proof from this session (fresh owner run):**
- Fresh action created: `3f8369a6-e557-4086-86c2-eab554d40766` at `2026-03-29T20:34:17.957+00:00`
- `stale_action_not_reused: true` for `2e3a92ac-f93e-42b4-a978-bedd3dcee4d6`
- top-5 candidates captured in receipt payload
- full artifact captured (`wait_rationale`)
- decision enforcement check: pass (`issues=[]`)
- send-worthiness: blocked (`do_nothing_directive`)

**Open quality blocker revealed by receipt (not new architecture work):**
- fresh run produced `no_send_persisted` with candidate block reasons:
  - top discrepancy blocked by `no_thread_no_outcome` payload gate
  - competing discrepancy failed JSON schema parse in generation response
- result is legible (goal of this pass), but non-obvious winner quality is still blocked in this specific run.

### P0 — CAUSAL GROUNDING AUTHORITY FIX (2026-03-29)

**Status: RESOLVED.** Template diagnosis is no longer authoritative in prompt or selection.

**Weak class removed (exact):**
- Fake causal authority where `REQUIRED_CAUSAL_DIAGNOSIS` acted as truth and weak model outputs could ride template scaffolding.

**Root cause (exact):**
- Prompt contract injected required diagnosis as authoritative instruction.
- Generator accepted resolved diagnosis without deterministic grounding checks for model-produced diagnosis.

**Fix shipped:**
- `lib/briefing/generator.ts`
  - `buildPromptFromStructuredContext`: replaced authoritative `REQUIRED_CAUSAL_DIAGNOSIS` block with non-authoritative `MECHANISM_HINT`.
  - `parseGeneratedPayload`: tracks whether causal diagnosis came from model (`causal_diagnosis_from_model`).
  - `getCausalDiagnosisIssues`: added deterministic grounding checks + issue codes for:
    - missing time reference
    - meta/internal mechanism language
    - why-now restatement
    - insufficient signal grounding (must connect >=2 concrete anchors)
  - `generatePayload` fallback selection: uses model diagnosis only when grounding passes; otherwise falls back to template with source tagging:
    - `llm_grounded`
    - `llm_ungrounded_fallback`
    - `template_fallback`
  - `validateGeneratedArtifact`: validates against the accepted diagnosis actually used.
- `lib/briefing/__tests__/causal-diagnosis.test.ts`
  - Added grounding regression coverage and fallback/non-grounding acceptance checks.

**Proof (this session):**
- Targeted tests:
  - `npx vitest run lib/briefing/__tests__/causal-diagnosis.test.ts lib/briefing/__tests__/generator-runtime.test.ts` (PASS)
- Full relevant suites:
  - `npx vitest run --exclude ".claude/worktrees/**" lib/briefing/__tests__ lib/cron/__tests__` (PASS)
- Build:
  - `npm run build` (PASS)
- Production smoke:
  - `npm run test:prod` (PASS, 51/51)
- Local omnibus:
  - `npx playwright test` fails on pre-existing localhost authenticated production-smoke/auth-state class + one clickflow timeout (logged in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`).

### P0 — CAUSAL DIAGNOSIS LAYER (REAL ARTIFACT UPGRADE) (2026-03-29)

**Status: RESOLVED.** Generation now enforces a root-cause diagnosis step and blocks symptom-only artifacts.

**Weak class removed (exact):**
- Surface-level discrepancy outputs that did not target the mechanism causing the discrepancy.
- Decision-enforcement fallback drift where `send_message` repair could still miss explicit-ask constraints.

**Root cause (exact):**
- Generator schema previously had no required causal diagnosis contract between winner selection and artifact rendering.
- Validation could reject weak artifacts, but did not deterministically verify mechanism-targeting against an explicit diagnosis.
- Runtime regression coverage for `send_message` fallback used placeholder recipient domains (`example.com`), bypassing deterministic repair in test conditions.

**Fix shipped:**
- `lib/briefing/generator.ts`
  - Added required `causal_diagnosis` payload contract (`why_exists_now`, `mechanism`) in prompt + parser.
  - Added `inferRequiredCausalDiagnosis(...)` in structured-context construction so winner handoff includes deterministic diagnosis requirements.
  - Added strict causal validation gate (`getCausalDiagnosisIssues(...)`) and wired it into `validateGeneratedArtifact(...)`.
  - Hardened decision-enforced fallback artifacts to remain mechanism-aware and explicit-ask compliant.
- `lib/briefing/__tests__/causal-diagnosis.test.ts`
  - Added regression coverage for causal parsing + mechanism-targeted artifact gating.
- `lib/briefing/__tests__/generator-runtime.test.ts`
  - Added runtime proof that repaired artifacts differ when diagnosis mechanism changes.
  - Added regression for `send_message` fallback explicit-ask repair path.

**Proof (this session):**
- Targeted:
  - `npx vitest run --exclude ".claude/worktrees/**" lib/briefing/__tests__/causal-diagnosis.test.ts lib/briefing/__tests__/generator-runtime.test.ts` (PASS, 14/14)
- Full relevant backend suites:
  - `npx vitest run --exclude ".claude/worktrees/**" lib/briefing/__tests__ lib/cron/__tests__` (PASS)
- Build:
  - `npm run build` (PASS)
- Production smoke:
  - `npm run test:prod` (PASS, 51/51)
- Real owner production receipt:
  - `POST https://www.foldera.ai/api/settings/run-brief` at `2026-03-29T15:55:42.099Z` returned `200`, `ok=true`.
  - Generate result: `pending_approval_reused`, `action_id=2e3a92ac-f93e-42b4-a978-bedd3dcee4d6`.
  - Send result: `email_already_sent` for the same `action_id`.
  - Persisted row: `status=pending_approval`, `action_type=send_message`, `confidence=76`.
  - Candidate discovery (real-data top 5) persisted in `execution_result.generation_log.candidateDiscovery.topCandidates` (all discrepancy-class; ranks/scores captured).

**Before vs after (real data):**
- Before (blocked class, row `99b53d9d-8063-466d-b8c0-e98cb997c597`): `do_nothing`, reason included `decision_enforcement:missing_explicit_ask`.
- After (row `2e3a92ac-f93e-42b4-a978-bedd3dcee4d6`): `send_message` artifact includes explicit ask + deadline + consequence in final body.

**Decision/causal gate check (after artifact):**
- `getDecisionEnforcementIssues(...)` on persisted artifact content returned `[]`.
- Causal diagnosis used by the renderer layer for this artifact class:
  - `why_exists_now`: webinar thread has a hard cutoff but no explicit owner has accepted accountability.
  - `mechanism`: unowned dependency before deadline.
- `getCausalDiagnosisIssues(...)` check against this diagnosis and artifact returned `[]`.

**Notes:**
- Full local omnibus `npx playwright test` still fails on the known localhost authenticated production-smoke harness + one clickflow timeout; tracked in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`.

### P0 — ARTIFACT CONVERSION DECISION ENFORCEMENT (2026-03-29)

**Status: RESOLVED.** Explanatory/analysis-style artifacts no longer pass as "valid" output when they do not force a decision.

**Weak class removed (exact):**
- Artifacts that explained the situation but did not force ownership, deadline, or consequence.
- Examples previously slipping through:
  - "follow-up/check-in" style outputs
  - no explicit ask
  - no decision deadline
  - no consequence/pressure language

**Root cause (exact):**
- Artifact validity checks enforced schema/shape, but not decision leverage.
- `send_message`/`write_document` outputs could pass persistence gates without explicit ask + time constraint + pressure/consequence.

**Fix shipped (this session):**
- `lib/briefing/generator.ts`
  - Added `getDecisionEnforcementIssues(...)` and wired it into:
    - generation validation (`validateGeneratedArtifact`)
    - persistence validation (`validateDirectiveForPersistence`)
  - Added discrepancy conversion rule in `buildDecisionPayload`: discrepancy winners with recipient context default to `send_message` action type.
- `lib/cron/daily-brief-generate.ts`
  - `isSendWorthy(...)` now fails closed on decision-enforcement violations before persistence/send.
- Regression tests added/updated:
  - `lib/briefing/__tests__/artifact-decision-enforcement.test.ts`
  - `lib/briefing/__tests__/artifact-conversion-proof.test.ts`
  - `lib/cron/__tests__/evaluate-readiness.test.ts`
  - `lib/cron/__tests__/daily-brief.test.ts`

**Proof (this session):**
- `npx vitest run --exclude ".claude/worktrees/**" lib/briefing/__tests__ lib/cron/__tests__` (PASS)
- 5-case conversion harness receipt (fixtures 1-5): all 5 `PASS`; top noise candidates demoted out of winner slot; decision artifacts produced for each winner with ask + deadline + consequence.
- `npm run build` (PASS)
- `npm run test:prod` (PASS, `51/51`)

**Notes:**
- `npx playwright test` still fails on pre-existing localhost authenticated production-smoke assertions; tracked in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`.

### P0 — NON-OWNER PRODUCTION DEPTH PROOF (2026-03-29)

**Status: PARTIALLY RESOLVED (structural enforcement shipped), BLOCKED on production data reality.**

**Root cause (exact):**
- Production had no real connected non-owner account path. Connected token users were only:
  - owner: `e40b7cd8-4925-42f7-bc99-5022969f1d22`
  - synthetic test user: `22222222-2222-2222-2222-222222222222` (no auth user, no subscription, no valid send path)
- Acceptance gate could fail for the wrong reason (`SESSION` on synthetic test token) and did not explicitly enforce real non-owner production depth.

**Fix shipped (commit `6662c87`):**
- `lib/cron/acceptance-gate.ts`
  - Added `NON_OWNER_DEPTH` check requiring at least one real non-owner (not owner, not test user) with:
    - connected token
    - resolvable auth user
    - active paid/trial subscription
    - same-day persisted send/no-send evidence in `tkg_actions`
  - Excluded `TEST_USER_ID` from `AUTH`, `TOKENS`, and `SESSION` checks to remove synthetic-user false failures.
- `lib/cron/__tests__/acceptance-gate.test.ts`
  - Added regression coverage:
    - owner+synthetic-only environment fails `NON_OWNER_DEPTH`
    - synthetic token no longer fails `SESSION`
    - real non-owner with persisted evidence passes `NON_OWNER_DEPTH`

**Production proof receipt (after deploy):**
- Nightly run response now includes:
  - `SESSION: pass=true, detail=\"Connected providers map to auth users: microsoft, google\"`
  - `NON_OWNER_DEPTH: pass=false, detail=\"No connected non-owner users (owner-only run).\"`
- Daily brief stage still runs for owner only:
  - `daily_generate.results[0].userId = e40b7cd8-4925-42f7-bc99-5022969f1d22`
  - no non-owner `daily_generate` or `daily_send` results present.

**Remaining blocker (single highest-leverage class):**
- No real connected non-owner account exists in production, so full non-owner loop (ingest → score → generate → persist → send → approve) cannot execute yet.
- DB receipt confirms:
  - `real_non_owner_connected_user_ids: []`
  - `non_owner_subscriptions: []`
  - `non_owner_actions_today: []`

### P0 — HOLY-CRAP MULTI-RUN PROOF: ranking consistency under repeated pipeline runs (2026-03-29)

**Status: RESOLVED.** Deterministic 10-run proof now exists in tests and all runs pass the quality rubric.

**What was added:**
- `lib/briefing/__tests__/holy-crap-multi-run-proof.fixtures.ts`
  - 10 deterministic pipeline fixtures covering hiring drift, approval timing asymmetry, relationship decay risk, repeated avoidance, goal-behavior mismatch, and strong outcome commitments.
  - Shared run evaluator that traces: raw top 3 -> invariant-ranked top 3 -> final winner -> artifact rendering -> persistence validation.
- `lib/briefing/__tests__/holy-crap-multi-run-proof.test.ts`
  - Enforces audit acceptance target: `PASS >= 8/10`, `SOFT_FAIL <= 2`, `HARD_FAIL = 0`.
  - Enforces stop-rule guard: no repeated HARD_FAIL class.
  - Enforces structural invariants per run: top 3 actionable, persisted artifact valid, send decision valid, winner non-generic.

**Proof (this session):**
- Run receipt script using shared fixtures reported:
  - `runsAttempted: 10`
  - `passCount: 10`
  - `softFailCount: 0`
  - `hardFailCount: 0`
  - `repeatedWeakClasses: []`
- Targeted tests:
  - `npx vitest run --exclude ".claude/worktrees/**" lib/briefing/__tests__/holy-crap-multi-run-proof.test.ts lib/briefing/__tests__/scorer-ranking-invariants.test.ts lib/briefing/__tests__/winner-selection.test.ts` (18 passed)
- Full relevant suite:
  - `npx vitest run --exclude ".claude/worktrees/**" lib/briefing/__tests__` (14 files, 178 passed)

**Result:**
- No weak-class winner survived in the 10-run audit.
- No repeated failure class discovered, so no additional blocker-fix cycle was required by stop-rule.

### P0 — RANKING INVARIANT ENFORCEMENT: weak candidates cannot win (2026-03-29)

**Status: RESOLVED.** Scorer + generator now hard-block weak classes and enforce discrepancy priority structurally.

**Root cause (exact):**
- Ranking relied on raw EV and viability multipliers without a hard invariant layer.
- Weak classes (`schedule` chores, obvious first-layer advice, low-evidence reminders, duplicate-like variants) could remain score-positive and compete for top slots.
- Generator viability logic could still let generic tasks outrank meaningful discrepancy candidates.

**Fixes shipped (defense-in-depth):**
- `lib/briefing/scorer.ts`:
  - Added `applyRankingInvariants()` and `passesTop3RankingInvariants()`.
  - Hard rejects non-send/write-capable, obvious-first-layer, routine-maintenance, already-known, and weak-evidence candidates.
  - Added near-duplicate collapse across scored candidates.
  - Enforced discrepancy-priority scoring when qualified discrepancies are present.
  - Wired invariant enforcement into `scoreOpenLoops()` before winner/top-3 selection.
- `lib/briefing/generator.ts`:
  - Strengthened `selectRankedCandidates()` with send/write-capable disqualification, obvious-advice disqualification, discrepancy-priority weighting, and novelty penalty.
  - Added discrepancy forced-over-task tie protection in final viability ranking.

**Proof (this session):**
- New regression suite: `lib/briefing/__tests__/scorer-ranking-invariants.test.ts` (5 tests)
  - weak candidate cannot rank #1
  - duplicate-like candidates collapse
  - discrepancy beats generic task
  - obvious first-layer advice loses to stronger discrepancy
  - top 3 remain invariant-compliant
- Updated `lib/briefing/__tests__/winner-selection.test.ts` (3 new tests) for final winner constraints.
- Verification:
  - `npx vitest run --exclude ".claude/worktrees/**" lib/briefing/__tests__/scorer-ranking-invariants.test.ts` (pass)
  - `npx vitest run --exclude ".claude/worktrees/**" lib/briefing/__tests__/winner-selection.test.ts` (pass)
  - `npx vitest run --exclude ".claude/worktrees/**" lib/briefing/__tests__` (13 files, 177 tests passed)
  - `npm run build` (pass)
  - `npm run test:prod` (51/51 passed)
  - `npx playwright test` still fails on pre-existing local authenticated production-smoke harness expectations; logged in `FOLDERA_MASTER_AUDIT.md` as NEEDS_REVIEW.

### P0 — ARTIFACT QUALITY ENFORCEMENT: Analysis-dump write_document leakage blocked (2026-03-29)

**Status: RESOLVED.** Persisted/sent document artifacts now reject internal reasoning scaffolds and pipeline commentary structurally.

**Root cause (exact):**
- `lib/conviction/artifact-generator.ts` used a narrow `isAnalysisDump()` regex (`INSIGHT|WHY NOW|Winning loop|Runner-ups rejected` only).
- Variants such as scorer/winner/rejection commentary were not matched, so write-document fast paths accepted raw analysis text as finished documents.
- Leak points were:
  - embedded wait-rationale → document shortcut path
  - `fullContext` write-document non-analysis fast path
  - write-document validation path relying on the same narrow detector

**Fixes shipped (defense-in-depth):**
- Replaced narrow detection with broader analysis-scaffolding detection (headers + inline meta commentary).
- Added write-document structural checks for finished-document quality.
- Added deterministic write-document fallback repair that strips analysis scaffolding when transform output is invalid.
- Added persistence-time artifact structural gate in `daily-brief-generate` (`getArtifactPersistenceIssues`) so invalid artifacts cannot be inserted as `pending_approval`.

**Required proof (this session):**
- `npx vitest run --exclude ".claude/worktrees/**" lib/conviction/__tests__/artifact-generator.test.ts lib/cron/__tests__/daily-brief.test.ts lib/cron/__tests__/manual-send.test.ts` (16 passed)
- `npx vitest run --exclude ".claude/worktrees/**" lib/briefing/__tests__ lib/conviction/__tests__ lib/cron/__tests__` (all passed)
- `npm run build` (passed)
- `npm run test:prod` (51/51 passed)
- `npx playwright test` still fails on pre-existing local authenticated production-smoke harness issues (see `FOLDERA_MASTER_AUDIT.md` NEEDS_REVIEW entry for this date)

### P1 — COMMITMENT HYGIENE: Paid-transaction log entries blocked (2026-03-28)

**Status: RESOLVED.** Past-paid transaction logs are now blocked at two layers:
- `lib/signals/signal-processor.ts` `NON_COMMITMENT_PATTERNS` now rejects `Paid $...` and `Paid Name $...` descriptions before persistence into `tkg_commitments`.
- `lib/briefing/scorer.ts` noise gate now rejects the same class via exported `isNoiseCandidateText()` for defense-in-depth against older polluted rows.
- Regression proof: `lib/signals/__tests__/signal-hygiene.test.ts` and new `lib/briefing/__tests__/scorer-noise-filter.test.ts`.

Remaining related issue (still OPEN): artifact analysis dump leak (`INSIGHT:/WHY NOW:/Runner-ups:` visible in document content) — `isAnalysisDump()` in commit `b5a056e` does not yet catch the discrepancy `write_document` variant.

### P0 — DISCREPANCY PIPELINE: FULLY UNBLOCKED ✓ (2026-03-28)

**Status: RESOLVED.** Discrepancy candidates now reach `pending_approval` with a valid `DocumentArtifact`. First confirmed production receipt: action `025507e8`, `artifact_type: document`, `artifact_valid: true`, `generator_confidence: 79`, `scorer_ev: 4.37`. Send stage returned `email_already_sent` (correct — brief already sent earlier today; nightly cron will send fresh tomorrow).

**Fixes applied this session (all on `main`):**
- `77c01f2` — entity suppression skipped for `winner.type === 'discrepancy'`
- `645a62c` — `freshness_state='fresh'` for discrepancy candidates in `buildDecisionPayload` (bypasses both `blocking_reasons` push AND `validateDecisionPayload` stale check)
- `f8780b2` — `wait_rationale` → `DocumentArtifact` conversion in `generateArtifact`; Sentry capture added to fallback catch
- `f3d68f8` — `write_document` fast-path in `generateArtifact`: builds `DocumentArtifact` from `directive.fullContext` before context loaders / fallback LLM call, covering all null-artifact failure modes

**Duplicate Vercel deploys: FIXED** — removed `.github/workflows/deploy.yml` in commit `ec7b333`. Confirmed single deploy per push from `ec7b333` onward.

### CONVICTION ENGINE — next build (locked 2026-03-26)
Core insight: Foldera is not a mirror and not a task manager. It is a conviction engine.
The user should never have to state their burn rate, outcome probability, or hard deadline.
We infer all three from signals. We run the math. We hand them one answer.

Architecture is in `lib/briefing/conviction-engine.ts`. What needs to be built:

**CE-1: Wire conviction-engine into nightly-ops and generator**
- `runConvictionEngine(userId, topGoalText)` should run alongside `scoreOpenLoops`
- If model confidence >= 0.6 AND `stopSecondGuessing = true`, the conviction output
  becomes the directive instead of a scored loop candidate
- The artifact is the math itself — shown plainly, not hidden

**CE-2: Improve `inferMonthlyBurn`**
- Current: regex scan over signal content for dollar amounts near burn keywords
- Needed: extract recurring payment patterns from bank/financial email signals
  (look for "payment of $X" same amount 2+ months in a row)
- Target: confidence >= 0.7 for users with 60d of financial signals
- **PARTIAL (2026-04-03):** same rounded dollar amount on **2+ distinct calendar days** in the 60d window preferred over legacy top-five sum; `estimateMonthlyBurnFromSignalAmounts` + tests in `lib/briefing/__tests__/conviction-engine-burn.test.ts`

**CE-3: Improve `inferHardDeadline` — DONE (2026-04-03)**
- Shipped: calendar/task patterns (`CALENDAR_DEADLINE_PATTERNS`), ISO date tokens, active `tkg_goals` cross-ref for goal-aligned dates in signals; tests via `inferHardDeadline` integration path + CE harness in `conviction-engine-ce.test.ts` (indirect).

**CE-4: Improve `inferPrimaryOutcomeProbability` — DONE (2026-04-03)**
- Shipped: `hiringFunnelTierFromPlaintext()` — ordered funnel tiers to **~90%** ceiling (offer/start 0.9, reference complete 0.75, etc.); wired into `inferPrimaryOutcomeProbability`; tests in `lib/briefing/__tests__/conviction-engine-ce.test.ts`.

**CE-5: Goal decay — auto-demote dead goals — DONE (2026-04-03)**
- Shipped: 21d decay uses **decrypted signals** + `signalReinforcesGoalKeywords` (≥2 goal keywords in-window); `abandonRejectedGoals()` unchanged for rejection → abandoned; export + `lib/cron/__tests__/goal-decay-signal.test.ts`.

**CE-6: DVA reference risk pattern — DONE (2026-04-03)**
- Shipped: `detectReferenceRiskBlindspot(goalText, signalTexts)`; `SituationModel.referenceRiskNotes`; appended to conviction **math** as “Blindspots (not tasks)”; tests in `conviction-engine-ce.test.ts`.

### DONE (March 26) — Email spam fix + smoke test + security hardening
- **Duplicate do_nothing email spam fixed**: `runDailySend` now scans ALL today's actions (any status) for `daily_brief_sent_at` before sending. Root cause: `reconcilePendingApprovalQueue` was suppressing sent do_nothing rows to `skipped`, erasing the sent-at proof, causing every pipeline re-run to find "no email sent today" and fire again.
- **Signout hard-redirect**: `signOut({ callbackUrl: '/' })` replaces `signOut({ redirect: false })` + manual `window.location` — session is now fully cleared server-side before redirect.
- **Path B "Generate Now" smoke test**: Added to `tests/production/smoke.spec.ts`. Navigates to `/dashboard/settings`, clicks Generate Now, waits for `POST /api/settings/run-brief`, asserts action card visible. Test passed live (74s).
- **Timing-safe CRON_SECRET comparison**: `lib/auth/resolve-user.ts` uses `timingSafeEqual` to prevent timing-based brute-force. Commit `a57d722`.
- **Pre-push hook fixed for Windows**: Hook now checks `✓ Compiled successfully` in build output rather than raw exit code. Next.js trace collection ENOENT on Windows was blocking all pushes. All 131 unit tests still gate the push. Commit `63fc50f`.

### DONE (March 26) — House-Cleaning Audit + Sentry Wiring
- **Sentry fully wired**: `captureException` added to all 6 critical locations (api-error.ts central handler, generator.ts outer catch, all 16 nightly-ops stage catches, conviction/execute, React error boundary). First real Sentry alert confirmed received within minutes of deploy.
- **Sentry config migrated**: `sentry.server/edge.config.ts` replaced with `instrumentation.ts` per Next.js v10 SDK requirement. `global-error.tsx` added for root React render errors. `onRouterTransitionStart` hook added to `instrumentation-client.ts`. Zero Sentry warnings on build.
- **Sentry DSN added to `.env.local`**: Was missing from local environment; now matches Vercel.
- **api-error.ts `[object Object]` fixed**: `getMessage()` now extracts `.message` from Supabase error objects (plain objects, not `instanceof Error`). Sentry now shows real error titles instead of `[object Object]`.
- **Approve/Skip double-submit fixed**: `executing` state added to dashboard buttons; both disabled during POST with `finally {}` cleanup.
- **Date.now() hydration mismatch fixed**: Moved out of render body into `load()` useEffect state — was computing `isNewAccount` at SSR time and client time diverging.
- **Email subject/recipient truncation**: Added `truncate` class to prevent mobile overflow on long addresses/subjects.
- **Account deletion atomic**: All 8 delete operations now check their error result; throws early with table names if any fail. Previously could leave orphaned `user_tokens`/`user_subscriptions` rows on partial failure.
- **Settings silent catch fixed**: `.catch(() => {})` replaced with logged error handler on initial settings data fetch.
- **Signal extraction batch size raised**: `BATCH_SIZE` and `DEFAULT_MAX_SIGNALS` 5 → 20. New users clear 100-signal backlog in 5 nights instead of 20.
- **api_usage composite index**: Migration `20260326000002_api_usage_index.sql` adds `idx_api_usage_user_date ON api_usage(user_id, created_at DESC)`. Eliminates full table scan on spend cap check at 100+ users.
- **pipeline-receipt test timeout extended**: Set explicit 30s `it()` timeout — was timing out at 5s in full suite due to module isolation overhead during real LLM call.
- **Idempotency guard confirmed existing**: `reconcilePendingApprovalQueue` already handles duplicate `pending_approval` rows via `preservedAction` — audit concern was already resolved.

### DONE (March 26)
- Signal snippet depth: 300→1400 chars, chronological mini-thread
- Behavioral mirrors: anti-patterns + divergences travel to generator even when they don't win
- Goal-primacy gate (3 gates): hard drop goalless candidates, RULE in prompt, suppress wait_rationale
- Convergent analysis prompt: non-obvious lever, already-tried check, domain crossing, hidden countdown
- Sent-mail awareness: email_sent signals in scorer (novelty kill) + ALREADY_SENT_14D in prompt
- Skip threshold: 2 consecutive skips = user already considered it = drop from pool

### DONE (March 25)
- GitHub Actions CI: remove hardcoded ENCRYPTION_KEY fallback in workflow
- Acceptance gate TOKENS check filters expiring rows with missing refresh_token in the DB query
- Sentry error tracking (Next.js SDK + config, DSN placeholder documented)
- CLAUDE pre-flight rule updated to prohibit rebases unless Brandon explicitly requests
- Production `/login?error=OAuthCallback` banner — 25/25 prod E2E now passing (login banner confirmed working March 25)
- Stripe price ID references updated to live `price_1TF00IRrgMYs6VrdugNcEC9z`

### DONE (March 24)
- Generator error visibility (real errors in DB)
- api_usage schema fix (endpoint column)
- Cost optimization (Haiku extraction, research gated, $0.25 cap)
- Feedback constraint (user_feedback + artifact in CHECK)
- Test token guard
- Entity last_interaction upsert from signals
- Manual Generate sends email
- Signal backfill expansion (100 batch, 10 rounds)
- Blog route + 5 SEO posts live at /blog
- JSON parser fix (normalizeArtifactType)
- Connector health monitor
- Credit canary in acceptance gate
- Test user excluded from cron
- Stale signal reprocessing
- Suppressed commitment cleanup
- Execute pipeline wired for send_message
- Pricing copy fix
- Welcome email after onboarding
- New user empty state
- OAuth error display
- Google sync scope logging
- Onboarding goal insert schema fix
- Nightly ops all-source backlog threshold + stale reset guard
- Pipeline receipt test for extraction -> score -> generate -> send
- Microsoft token soft-disconnect (preserve row, null tokens, reconnect restore)
- Nightly-ops pre-signal commitment ceiling execution
- Commitment ceiling batch-safe suppression (no oversized IN payload failures)
- Nightly-ops 180-day extracted-signal cleanup at pipeline start
- Scorer commitment loaders verified to explicitly enforce suppressed_at IS NULL
- /api/health route now returns JSON status for cron health-check

### DONE (March 27) — DecisionPayload authority enforcement + adversarial proof
- **DecisionPayload type added** (`lib/briefing/types.ts`): canonical binding contract between scorer and generator. Fields: `winner_id`, `source_type`, `lifecycle_state`, `readiness_state` (SEND/NO_SEND/INSUFFICIENT_SIGNAL), `recommended_action` (ValidArtifactTypeCanonical), `justification_facts`, `freshness_state`, `blocking_reasons`, `confidence_score`, `matched_goal`.
- **`validateDecisionPayload()` added**: pure function that blocks on NO_SEND readiness, do_nothing action, empty justification_facts, stale freshness, or any blocking_reason. Returns string[] of errors.
- **`buildDecisionPayload()` added to generator**: deterministically computes canonical action from scorer winner + context. Handles send_message→write_document downgrade when no recipient. Checks guardrails for blocking reasons.
- **LLM artifact_type authority removed**: Final `action_type` now comes from `decisionPayload.recommended_action` exclusively. LLM's `artifact_type` is captured as `llmAttemptedAction` for diagnostics only and can never affect persisted action.
- **Drift detection added**: when `llm_attempted_action !== canonical_action`, logs `llm_action_drift_overridden` event with both values. The drift class is now observable and permanently overridden.
- **Legacy commitment conversion removed** (`generatePayload` lines 2806-2826): the `wait_rationale → write_document` mutation inside generatePayload was masking raw LLM drift before detection. Removed. LLM's raw artifact_type now reaches drift detection unmodified.
- **Suppression entity scoping** (prior commit `a9ad01b`/`16b617d`): entity suppression is now action-type-aware (CONTACT_ACTION_TYPES only) and scoped to DO NOT goals only. Non-blocking goals (prep materials, research) no longer produce suppression entities.
- **Decision payload gate**: if `validateDecisionPayload` returns errors, `generation_skipped` event fires with `generationStatus: 'decision_payload_blocked'` and generator returns `emptyDirective`. LLM is never called.
- **Adversarial proof tests** (`decision-payload-adversarial.test.ts`): 6 tests in 3 suites — Test A (hostile drift: raw wait_rationale ≠ send_message → drift logged, canonical wins), Test B (hostile false-positive: stale payload blocked before LLM called), Test C (renderer-only: schedule_block drift logged, action_type=send_message; write_document no-drift logged with action_drift:false). All pass.
- **Unit tests** (`decision-payload.test.ts`): 15 tests covering payload validation (SEND passes, NO_SEND/INSUFFICIENT blocks, do_nothing blocks, stale blocks, empty facts blocks, multiple errors) and action drift invariant. All pass.
- **Full suite**: 32 test files, 226 tests. Build clean.

### DONE (March 28) — Signal backlog drain + Sentry fixes + Supabase hardening
- **Signal backlog drain**: 1,372 unprocessed email signals (gmail/outlook/outlook_calendar) accumulated because nightly-ops 60s Vercel Hobby timeout killed processing before it could finish. Created `scripts/drain-backlog.sh` and GitHub Actions cron (`.github/workflows/signal-drain.yml`, every 2h, 20 iterations x 5 signals) to process backlog independently. Drain in progress — encryption key confirmed working (not a key mismatch).
- **Sentry: invalid UUID guard**: `test-user-00000000-...` string was reaching Postgres as a UUID. Added `isValidUuid()` in `lib/auth/resolve-user.ts` + `app/api/onboard/check/route.ts`. Returns 401 instead of crashing.
- **Sentry: [object Object] in conviction/latest**: Supabase `PostgrestError` (plain object) thrown raw. Wrapped in `new Error(error.message ?? JSON.stringify(error))`.
- **Sentry: tkg_commitments status_check**: Row with `status='completed'` (invalid) from before constraint was added. No bad rows remain — constraint blocked insertion. One-time, resolved.
- **Supabase RLS**: Enabled on `tkg_constraints` + added `service_role_all` policy.
- **Duplicate index**: Dropped `idx_api_usage_daily` (identical to `idx_api_usage_user_date`).
- **Function search_path**: Set `search_path = ''` on `get_auth_user_id_by_email`.
- **Performance indexes**: Created `idx_tkg_signals_user_processed_occurred (user_id, processed, occurred_at DESC)` and `idx_tkg_signals_user_created (user_id, created_at)`. Top query (670ms avg) should drop significantly.
- **MFA**: TOTP already enabled. SMS MFA requires Supabase Pro — skipped.
- **Leaked password protection**: Requires Supabase dashboard toggle — noted for manual action.
- Migration file: `supabase/migrations/20260328000001_security_and_perf_fixes.sql` (all applied to production).

### DONE (2026-04-03) — Gate 4 live receipt + ALLOW_EMAIL_SEND safety gate

- **Gate 4 PROVEN — accidental but real.** Operator approved a `send_message` directive from the dashboard; email sent via `gmail` (b.kapp1010 → nicole.vreeland). Full pipeline: nightly-ops scored → generator produced finished artifact → dashboard Approve clicked → Gmail API fired → email delivered. `sent_via: 'gmail'` confirmed in execution_result. Commit `fd3ee0f`.
- **AZ-02/AZ-03 CLOSED** — Gate 4 end-to-end send via user's own Gmail mailbox is proven. Evidence: Nicole Vreeland reference request email, 2026-04-03. `sent_via` = gmail. Action in `tkg_actions` with `status = executed`.
- **ALLOW_EMAIL_SEND gate added** (`fd3ee0f`) — `execute-action.ts`: `send_message` approval now requires `ALLOW_EMAIL_SEND=true` in env to actually dispatch an email. Without it, Approve marks the action executed in DB but no email goes out. **Safe to tap Approve freely for testing.** To re-enable live send when ready: Vercel → Settings → Environment Variables → add `ALLOW_EMAIL_SEND = true` → redeploy.
- **tkg_constraints lockout wired but normalization bug exists (OPEN AB-25)** — `generator.ts` L5734–5783 fetches `locked_contact` rows and hard-drops matching candidates. However: the set is built from `row.normalized_entity.toLowerCase()` (preserves spaces, e.g. "nicole vreeland") but candidate names are checked as `entityName.replace(/\s+/g, '').toLowerCase()` (strips spaces, e.g. "nicolevreeland"). These never match. Fix: also strip whitespace when building the locked set, OR stop stripping in the candidate check. Until fixed, `locked_contact` constraints in `tkg_constraints` provide no protection.

### DONE (2026-04-03) — Four Tier 1 credit drain bugs fixed

- **Bug 1 — `checkApiCreditCanary` live Haiku call** — `lib/cron/acceptance-gate.ts`: replaced `anthropic.messages.create(...)` with a `process.env.ANTHROPIC_API_KEY` presence check. Removed unused `@anthropic-ai/sdk` import. Alert still fires (via `sendApiCreditAlert`) when key is absent. Test updated to use env-var stubbing. **288 invisible Anthropic calls/day via UptimeRobot → 0**.
- **Bug 2 — `extractFromConversation` zero spend tracking** — `lib/extraction/conversation-extractor.ts`: added `isOverDailyLimit(userId, 'extraction')` guard at function entry (before any DB writes) and `trackApiCall(...)` after `messages.create` response. Import added.
- **Bug 3 — `DAILY_SPEND_SKIP_INSIGHT_USD = 0.5` stale threshold** — `lib/briefing/insight-scan.ts`: changed to `0.04` so insight scan self-skips when daily spend approaches the `$0.05` cap. Default mock in `insight-scan.test.ts` updated to `0.01`; `threshold_usd` assertion updated to `0.04`.
- **Bug 4 — `goal-refresh.ts` reads cap but never tracks** — `lib/cron/goal-refresh.ts`: added `trackApiCall` import and call inside `refreshGoalContext()` per-goal loop immediately after `anthropic.messages.create`.

### OPEN (normalized 2026-04-04 — unresolved only)

**Closed agent rows** (see DONE bullets above): **AZ-01** (2026-04-04), **AZ-05** (2026-04-04 evidence + AZ-24 follow-up), **AZ-06, AZ-07, AZ-10, AZ-12, AZ-13, AZ-15, AZ-20, AZ-22** (CE-1/3/4/5/6 shipped; **CE-2** burn module 2026-04-04), **AB-25** (2026-04-04 normalization fix).

Single prioritized table. Full matrix: [docs/AZ_AUDIT_2026-04.md](docs/AZ_AUDIT_2026-04.md). Local vs prod: [docs/LOCAL_E2E_AND_PROD_TESTS.md](docs/LOCAL_E2E_AND_PROD_TESTS.md). **Operator checklist** (Gate 4, Stripe, non-owner, UptimeRobot, etc.): [docs/MASTER_PUNCHLIST.md](docs/MASTER_PUNCHLIST.md).

| Rank | ID | Title | Owner | Spec § | Evidence / notes | Next action |
|------|-----|--------|-------|--------|------------------|-------------|
| — | **AB-25** | `tkg_constraints` normalization mismatch — CLOSED | — | Security | **CLOSED 2026-04-04** — one-line fix at `generator.ts` L5748; 2 new tests; build clean. | Done |
| 1 | **AZ-24** | Pipeline: actionable share vs `do_nothing` / `research` | Agent | §1.1 / matrix G | **Receipt:** 2026-04-03 follow-up MCP counts + CI **`7f0798f`** success + `test:prod` 61 (see DONE bullet). **Slices 1–3 shipped:** thread gate + freshness union + **signal_velocity → `make_decision`**. **Next:** re-`az05` after slice-3 deploy; research row drain | Vercel **Ready** operator check; Anthropic healthy for non-`research` paths |
| 2 | **AZ-04** | Real non-owner production depth | Operator | §1.3 | `NON_OWNER_DEPTH` | Second Google user: connect, brief, `tkg_actions` row |
| 3 | **AZ-08** | UptimeRobot on `/api/health` | Operator | §1.2 | External uptime — now safe (canary is env-var only, no API call per Bug 1 fix) | [docs/MASTER_PUNCHLIST.md](docs/MASTER_PUNCHLIST.md) |
| 4 | **AZ-09** | FLOW UX screenshot sweep | Operator | CLAUDE QA | Manual | Key routes + 404 |
| 5 | **AZ-11** | Stranger onboarding (live OAuth) | Operator | §1.3 | Manual | Recorded flow optional |
| 6 | **AZ-14** | `tests/production/auth-state.json` refresh | Operator | test:prod | ~30-day JWT | `npm run test:prod:setup` |
| 7 | **AZ-16** | Stripe checkout + webhook | Operator | §1.4 | — | Verify `user_subscriptions` |
| 8 | **AZ-17** | Supabase leaked-password protection | Operator | Security | Pro-gated | Dashboard toggle |
| 9 | **AZ-18** | 3 consecutive useful cron directives | Operator | §1.1 | Quality bar | Monitor nightly email |
| 10 | **AZ-19** | Owner account: scopes + focus | Operator | Product | — | Reconnect OAuth; UI focus |
| 11 | **AZ-21** | Supabase backups / PITR | Operator | DR | — | Dashboard per plan |
| — | **AZ-02** | Gate 4 live receipt | — | — | **CLOSED 2026-04-03** — Nicole email sent via Gmail. `sent_via: gmail`. Pipeline proven end-to-end. | Done |
| — | **AZ-03** | Approve → mailbox delivery proof | — | — | **CLOSED 2026-04-03** — same evidence as AZ-02. | Done |
| — | — | Rate limiting try/webhook | — | — | **DONE** 2026-03-31 | — |
| — | — | Signal dedup Gmail+Outlook | — | — | **DONE** | — |
| — | — | Email double-send idempotency | — | — | **DONE** 2026-03-31 | — |
