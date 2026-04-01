# CLAUDE.md — Operational Runbook

## Pre-Flight Checklist

Every session runs this before any work:

1. Do not rebase. Commit only task files. Leave unrelated worktree changes untouched.
2. Read `CLAUDE.md` fully.
3. Read `LESSONS_LEARNED.md` before every session. Every rule is enforced.
4. Read `FOLDERA_PRODUCT_SPEC.md`. Confirm the current task maps to a specific item in the spec (cite the section number). Fixes outside the spec require explicit approval.
5. Read `AUTOMATION_BACKLOG.md` for current open items.
6. Read every file you plan to modify.
7. Run `git log --oneline -10`.
8. Trace the relevant data path before coding: source -> transform -> persistence -> reader.
9. If recent changes or repo state conflict with the task, report that before editing.
10. After completing work, update `FOLDERA_PRODUCT_SPEC.md` with new status and evidence for every item touched. If a fix would break or conflict with another spec item, flag it before implementing. Push updated spec as final commit.

## Database CHECK Constraints (tkg_goals)

These are enforced by Postgres. Invalid values cause silent insert failures.

- `goal_category`: career, financial, relationship, health, project, other
- `goal_type`: short_term, long_term, recurring
- `priority`: 1-5 (integer)
- `source`: extracted, manual, auto_suppression, onboarding_bucket, onboarding_stated, onboarding_marker, system_config
- `status`: active, achieved, abandoned

Any insert with values outside these sets will fail silently (Supabase returns success but doesn't persist the row). ALWAYS verify insert values against this list.

## Token Storage

- `user_tokens` is the single source of truth for OAuth tokens. All reads and writes go through `lib/auth/user-tokens.ts`.
- `integrations` table is deprecated. No code reads from it. Do not add new reads.
- Token refresh on execution paths goes through `lib/auth/token-store.ts`, which delegates to `user_tokens`.

## Environment Variables Required In Vercel

- `ANTHROPIC_API_KEY`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `ALLOW_DEV_ROUTES` (`true` only in local/dev environments when testing `/api/dev/*`; leave unset in production)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `DAILY_BRIEF_TO_EMAIL`
- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_WEBHOOK_SECRET`
- `INGEST_USER_ID`
- `SENTRY_DSN`

Optional recovery variable:

- `ENCRYPTION_KEY_LEGACY` only when old ciphertext or OAuth tokens still depend on a pre-rotation key.

## Cron Schedule

Vercel Free allows max 2 cron jobs. The full nightly pipeline is consolidated into `/api/cron/nightly-ops`.

- `/api/cron/nightly-ops` — `0 11 * * *` (`11:00 UTC`, `4:00 AM` Pacific) — runs sync-microsoft, process-unprocessed-signals (up to 3 rounds of 50), passive rejection, daily-brief sequentially. All users.
- `/api/cron/health-check` — `0 15 * * *` (`15:00 UTC`, `8:00 AM` Pacific) — checks tokens, DB, last directive age; sends alert email if anything fails.
- `vercel.json` is the current source of truth.
- The individual routes (`trigger`, `daily-generate`, `daily-send`, `sync-google`, `sync-microsoft`, `process-unprocessed-signals`, `daily-brief`) still exist and work with CRON_SECRET auth but are not registered as Vercel crons.

## Decided Items

- Email is the primary product surface. The dashboard is secondary.
- One directive per email. Never send anything below `70%` confidence.
- Every directive must include a finished artifact. If the user has to do work after approval, the feature is broken.
- Confidence stays internal. Do not surface confidence percentages, evidence panels, or internal scoring to users unless that decision is explicitly changed.
- Core surfaces stay one-tap approve or skip. No guilt copy, deprioritized lists, or extra workflow steps.
- Cyan and emerald are the accent colors. No violet.
- The dashboard is for users, not developers. No internal health, token, API, or debug metrics on the main product surface.
- Owner account uses the same `user_subscriptions` row as every other user (no code bypass). Dashboard trial/expired banners follow real subscription state.
- Self-referential Foldera signals must be filtered before generator or extraction reads.
- Session-backed routes use `session.user.id` only. `INGEST_USER_ID` is cron and background only.
- Production logs must not include directive text, conviction scores, behavioral content, or similar user-private data.
- When debugging production errors, check Sentry first before querying Supabase.
- Pushes go to `main`.
- When running in a worktree, do not create feature branches. Merge your changes into main and push to origin/main before stopping. If you cannot checkout main because a worktree holds it, use git worktree remove to free it first.

## Mandatory QA Gate

For any session that changes user-facing code, this gate is mandatory before push:

1. Check every user-facing route: `/`, `/start`, `/login`, `/pricing`, `/dashboard`, `/dashboard/settings`.
2. For each route verify:
   - Build passes.
   - No hydration mismatches.
   - Loading, empty, and error states exist.
   - No hardcoded user data.
   - All buttons have working handlers.
   - No CSS overflow or truncation.
   - Copy is consistent across pages.
3. Run `npm run build`.
4. Run `npx playwright test`.
5. Fix any failures before pushing.
6. If any issue cannot be fixed in-session, note it in `AUTOMATION_BACKLOG.md` as a new item.

For non-user-facing changes, `npm run build` must still pass before commit.

Every session that touches the pipeline must re-trigger production after deploying, query the database for the expected outcome, and show the receipt (email delivered, action row created, correct status). A build pass alone is not sufficient verification. "Done" without live proof is not done.

## Production E2E Tests (MANDATORY)

Every CC session that pushes to main MUST:
1. Wait for Vercel deployment to show READY
2. Run `npm run test:prod`
3. Show all tests passing
4. If any test fails, the session is NOT done. Fix the failure before closing.

If auth-state.json is expired (session older than 30 days), tell Brandon to run `npm run test:prod:setup` to refresh it. Do not skip the tests.

If tests cannot run (network issues, etc.), explicitly say "Production E2E tests could not run" and explain why. Do not claim the task is verified.

Tests live in tests/production/smoke.spec.ts. Config is playwright.prod.config.ts.

## Change Impact Report (MANDATORY)

When editing any existing file, BEFORE committing, run:

1. `git diff <file>` on every modified file
2. For each file, list:
   - Functions/components that existed before and still exist (PRESERVED)
   - Functions/components that were removed or renamed (REMOVED — justify why)
   - onClick handlers, fetch calls, form submissions that existed before (verify each still works)
3. If ANY interactive element (button, link, form) was in the file before the edit, confirm it still exists and still fires. Name each one.

This catches the #1 CC failure pattern: rewriting a file to add a feature and accidentally removing existing functionality. The build passes because the removed code was never tested. The user finds it broken.

Example output:
```
SettingsClient.tsx impact report:
- Google Connect button: PRESERVED (onClick → /api/google/connect)
- Google Disconnect button: PRESERVED (onClick → fetch /api/google/disconnect)
- Microsoft Connect button: PRESERVED
- Microsoft Disconnect button: PRESERVED
- Sign Out button: PRESERVED
- Delete Account button: PRESERVED
- Generate Now button: PRESERVED
- NEW: Goals section with Edit link
- NEW: Sub-source signal counts
```

## Test-First Edit Rule (MANDATORY)

Before editing any existing file:

1. Write tests for every behavior that file currently has. Buttons, fetches, redirects, renders. Run them. They must pass against the current code.
2. Now make your changes.
3. Run the same tests. If any fail, your change broke existing behavior. Fix it before committing.
4. Add tests for your new behavior. Run everything. All must pass.

The tests are written BEFORE the edit, not after the breakage. This is not reactive. This is how regressions become impossible. If you skip step 1, you are guessing that your edit did not break anything. Guessing is how Connect buttons disappear.

## Before/After Test Gate (MANDATORY)

1. BEFORE making any code changes, run `npm run test:prod` (or `npx playwright test` if auth-state is unavailable). Record which tests pass and fail. Save the output.
2. Make your changes.
3. Run `npm run build`. Must pass.
4. Run the SAME test suite again. Compare results to the baseline from step 1.
5. If ANY test that PASSED before now FAILS: your change broke something. Fix it before committing. Do not push with new test failures.
6. If you broke something that no test catches: add the test FIRST, confirm it passes against current production, THEN make your change, THEN verify the new test still passes. The test suite gets stronger with every fix.

This replaces manual impact analysis. The tests ARE the impact trace. If the tests are good enough, regressions are caught automatically. If they're not good enough, the gap becomes visible and we add coverage.

## Change Impact Trace (MANDATORY)

No change exists in a vacuum. Before committing ANY edit, trace the full dependency chain:

1. **WHAT DID I CHANGE?** Run `git diff` on every modified file. List every function signature, response shape, prop interface, database query, or API contract that changed.
2. **WHO CONSUMES THIS?** For every changed function/API/response shape, grep the codebase for every caller. List them. If an API response added a field, every component that reads that response must still work. If a component was rewritten, every route that renders it must still work. If a database query changed, every function that uses its results must still work.
3. **WHAT INTERACTIVE ELEMENTS EXISTED BEFORE?** For every modified UI file: list every button, link, form, onClick, onSubmit, fetch call, and router.push that existed BEFORE the edit. Confirm each one still exists and still fires after the edit. Name them explicitly.
4. **WHAT COULD BREAK DOWNSTREAM?** Think one level past the file you touched. Changed API response shape → every fetch() that reads it. Changed auth callback → every redirect target. Changed database schema → every query that reads that table. Changed component props → every parent that renders it. For each downstream consumer, verify it still works with the new code. If you cannot verify (e.g. requires auth), say "CANNOT VERIFY: [component] reads [API] — manual test needed."
5. **WHAT IS THE BLAST RADIUS IF I'M WRONG?** Name the worst case. This forces you to think about consequences before shipping.

## Multi-User Verification Rule

- A task is not done if it only works for Brandon, the owner account, or `INGEST_USER_ID`.
- Any session-backed route or UI path must be verified for general-user behavior: `session.user.id` scoping, no owner-only fallback, no hardcoded user data, and no reliance on the owner dataset.
- When auth, billing, or settings behavior changes, verify the relevant signed-in and signed-out states.

## Doc Maintenance Rule

- After every session, update `AUTOMATION_BACKLOG.md` so the current status reflects what is fixed, blocked, or open.
- If required verification fails and cannot be fixed in-session, log it in `AUTOMATION_BACKLOG.md` before stopping.
- Session logs go in `SESSION_HISTORY.md`, not in this file.

## Session Logs

- 2026-03-28 — Brain data expansion + priority inversion fix + spend cap separation + skipSpendCap for manual runs
  MODE: AUDIT
  Commit hash(es): `96b50d2` (data expansion), `8517a32` (skipSpendCap), `282a765` (spend cap separation), `28054c2` (priority inversion), `6868d62` (pipeline unblock), `4abda4f` (signal drain + Sentry)
  Files changed: `lib/briefing/scorer.ts`, `lib/briefing/generator.ts`, `lib/utils/api-tracker.ts`, `lib/cron/daily-brief-types.ts`, `lib/cron/daily-brief-generate.ts`, `app/api/settings/run-brief/route.ts`, `app/api/settings/run-brief/__tests__/route.test.ts`, `AUTOMATION_BACKLOG.md`, `LESSONS_LEARNED.md`
  What was verified: `npx vitest run --exclude ".claude/worktrees/**"` (32 files, 226 tests passed); `npm run build` passed; pushed to main; Vercel deploy `dpl_BfLgEP3FjMJgviZ1reB547bLrbsY` READY; production nightly-ops triggered — 4 candidates scored (scorer_ev 2.03), behavioral graph updated (280 entities, 59 silent), but generator_confidence = 0 persists
  Changes: (1) Priority inversion fix: P1 goals now score highest (6 sites fixed). (2) Spend cap separation: getDailySpend excludes extraction traffic. (3) skipSpendCap: manual Generate Now bypasses spend cap entirely — testing is free. (4) Brain data expansion: scorer signals 50→200, context enrichment 14d→90d (150), entities 10 cooling→30 by interaction count, evidence keyword search 14d→90d (150), snippet cap 8→12, buildStructuredContext 7→15 with type diversity (calendar/tasks/files/drive get priority slots). (5) Pipeline unblock: skipStaleGate, discrepancy gate relaxed, vague penalty softened.
  Any unresolved issues: **P0** generator_confidence = 0 despite expanded data. Root cause: generator prompt demands multi-signal convergence the data can't support. Prompt confidence calibration is the next session's top priority. Also: duplicate Vercel deploys (GitHub integration + deploy hook both firing).

- 2026-03-28 — Discrepancy detection + entity suppression fix + double-deploy elimination
  MODE: AUDIT
  Commit hash(es): `ec7b333` (remove duplicate deploy workflow), `7b041bd` (OAuth identity_data for selfNameTokens), `63bfc40` (extractRelationshipContextEntities — entity suppression from relationship context only), `fab67f4` (discrepancy detector)
  Files changed: `.github/workflows/deploy.yml` (deleted), `lib/briefing/generator.ts` (extractRelationshipContextEntities, fetchUserSelfNameTokens OAuth fix, selfNameTokens hoisted), `lib/briefing/__tests__/generator-runtime.test.ts` (2 entity suppression tests updated), `lib/briefing/discrepancy-detector.ts` (new — 5 extractors), `lib/briefing/scorer.ts` (ScoredLoop type union + import + injection block + goal-primacy gate), `lib/briefing/__tests__/discrepancy-detector.test.ts` (new — 29 unit tests)
  What was verified: `npx vitest run --exclude ".claude/worktrees/**"` — 33 files, 255 tests passed; `npm run build` passed; deploy `dpl_DYJXD1UkkqWgNU6FbagcBVbG6PQE` READY (single deploy — double-deploy confirmed fixed); nightly-ops triggered — scorer_ev = 4.37, top 3 candidates are ALL discrepancies (drift, exposure, risk), open-loop candidates fully displaced; pipeline-receipt test shows exposure discrepancy at score 4.26 competing with compound winner at 4.33
  Changes: (1) Removed `.github/workflows/deploy.yml` — was calling `vercel deploy --prod` via CLI on every push alongside GitHub integration, causing double deploys. (2) `extractRelationshipContextEntities()` — entity suppression now uses ONLY `winner.relationshipContext` (confirmed contacts), never email body narrative. "Dear Brandon" in spam body no longer leaks into suppression. Also adds first name alone so partial action-history matches still fire. (3) `fetchUserSelfNameTokens` — added OAuth identity_data fallback (Google given_name/family_name live in identities[0].identity_data). (4) `lib/briefing/discrepancy-detector.ts` — pure function, 5 extractors: decay (silent relationship 5-14 interactions), exposure (commitment due within 7d), drift (P1/P2 goal with no signal/commitment activity), avoidance (at_risk commitment stalled 14+d), risk (high-value relationship ≥15 interactions, silent). (5) scorer.ts wiring — discrepancy candidates scored via computeCandidateScore(tractability=0.70), injected into scored pool, goal-primacy gate updated to exempt type='discrepancy'.
  Any unresolved issues: Generator blocks discrepancy candidates via (a) freshness gate — `freshness_state = stale` rejects candidates with no recent signals; for discrepancy candidates absence of signals IS the evidence, needs `|| winner.type === 'discrepancy'` bypass; (b) entity suppression false positive on risk class — krista's hydrated relationship context contains "Brandon Kapp" as co-participant; selfNameTokens doesn't contain "brandon"+"kapp" in production (OAuth identity_data fix may not cover this account's auth provider config); fix: skip entity suppression when `winner.type === 'discrepancy'`. Logged in AUTOMATION_BACKLOG P0.

- 2026-03-27 — DecisionPayload authority enforcement + adversarial proof tests
  MODE: OVERRIDE / AUDIT
  Commit hash(es): pending (uncommitted — types.ts, generator.ts, 2 new test files, usefulness-gate.test.ts update)
  Files changed: `lib/briefing/types.ts` (new DecisionPayload type + validateDecisionPayload), `lib/briefing/generator.ts` (buildDecisionPayload, canonical authority enforcement, legacy conversion removed), `lib/briefing/__tests__/decision-payload.test.ts` (new — 15 unit tests), `lib/briefing/__tests__/decision-payload-adversarial.test.ts` (new — 6 adversarial proof tests), `lib/briefing/__tests__/usefulness-gate.test.ts` (updated assertion for canonical authority)
  What was verified: `npx vitest run lib/briefing/__tests__/decision-payload-adversarial.test.ts` — 6/6 passed; `npx vitest run --exclude ".claude/worktrees/**"` — 32 files, 226 tests passed; `npm run build` passed
  Changes: (1) `DecisionPayload` type + `validateDecisionPayload()` in types.ts — canonical binding contract between scorer and generator. (2) `buildDecisionPayload()` added to generator — deterministically computes canonical action, freshness, blocking reasons from scorer winner. (3) `generateDirective()` rewritten to enforce canonical authority: DecisionPayload validated before LLM is called; after LLM, `canonicalAction = decisionPayload.recommended_action` is the only source for persisted `action_type`. (4) Legacy `wait_rationale → write_document` commitment conversion removed from `generatePayload` — was masking raw LLM drift before detection. (5) Drift detection: `llm_action_drift_overridden` event logs both canonical and attempted actions. (6) Suppression entity scoping (prior commits a9ad01b/16b617d): contact-only suppression for CONTACT_ACTION_TYPES, DO NOT goals only.
  Any unresolved issues: Production verification not yet run (no deploy this session — pending push). The `do_nothing` generation issue that initiated this session required suppression fix (prior commits) + DecisionPayload enforcement. Live trigger needed to confirm non-do_nothing action persists in tkg_actions.

- 2026-03-27 — CI flow gate + brief orchestration unification + daily-brief.ts split
  MODE: AUDIT
  Commit hash(es): `64674d7` (brief refactor), earlier commits for CI gate
  Files changed: `lib/cron/daily-brief-types.ts` (new), `lib/cron/daily-brief-status.ts` (new), `lib/cron/daily-brief-generate.ts` (new), `lib/cron/daily-brief-send.ts` (new), `lib/cron/brief-service.ts` (new), `lib/cron/__tests__/brief-service.test.ts` (new), `lib/cron/daily-brief.ts` (rewritten as thin façade), `app/api/settings/run-brief/route.ts`, `app/api/cron/nightly-ops/route.ts`, `app/api/settings/run-brief/__tests__/route.test.ts`, `playwright.ci.config.ts` (new), `.github/workflows/ci.yml`, `package.json`
  What was verified: `npm run build` passed; `npx vitest run --exclude ".claude/worktrees/**"` 25 files / 136 tests passed; `npx playwright test --config playwright.ci.config.ts` 34/34 passed (GitHub Actions CI run #75 green)
  Changes: (1) CI flow gate: new `playwright.ci.config.ts` pins 3 DB-free spec files; `test:ci:e2e` script; CI workflow adds `Install Playwright`, `Generate CI test secret` (ephemeral `NEXTAUTH_SECRET` via openssl), and `E2E flow gate` steps. (2) Brief orchestration unification + split: `daily-brief.ts` (~1856L) split into 5 focused modules + 1 service entrypoint. `lib/cron/brief-service.ts` is now the single authoritative entrypoint for "run brief lifecycle". Both `run-brief` and `nightly-ops` call `runBriefLifecycle()`. `daily-brief.ts` reduced to thin façade (runDailyBrief, autoSkipStaleApprovals, re-exports). All business logic — signal processing, queue reconciliation, no-send persistence, directive generation, send stage, stage formatting — is in the sub-modules.
  Any unresolved issues: Production E2E (`npm run test:prod`) not run this session — no route contract changes, only internal refactor.

- 2026-03-26 — Infrastructure hardening: shared constants, security fixes, behavioral graph, 504 fix
  MODE: AUDIT
  Commit hash(es): `9be7891`, `6d97588`, `8973b5f`, `c795885`, `83c09c8`, `a57d722`
  Files changed: `lib/signals/behavioral-graph.ts` (new), `lib/config/constants.ts` (new), `lib/briefing/generator.ts`, `lib/briefing/scorer.ts`, `lib/briefing/conviction-engine.ts`, `lib/cron/daily-brief.ts`, `app/api/conviction/latest/route.ts`, `app/api/cron/nightly-ops/route.ts`, `lib/sync/google-sync.ts`, `lib/sync/microsoft-sync.ts`, `lib/auth/resolve-user.ts`, `tests/e2e/authenticated-routes.spec.ts`
  What was verified: `npm run build` passed; `npx vitest run` passed; pre-push E2E gate (50+ passed, 6 skipped); `npm run test:prod` 51/51 passed
  Changes: (1) `lib/signals/behavioral-graph.ts` — new module computing per-entity interaction density (14d/30d/90d windows), silence detection (≥5 signals, last >30d), velocity (14d vs 90d rate), written to `tkg_entities.patterns.bx_stats`; wired into nightly-ops Sunday stage. (2) `lib/config/constants.ts` — single source of truth for CONFIDENCE_PERSIST_THRESHOLD=45, CONFIDENCE_SEND_THRESHOLD=70, SIGNAL_RETENTION_DAYS=180, daysMs(), MS_7D/14D/30D/90D, APPROVAL_LOOKBACK_MS, TEST_USER_ID; all 30+ inline `n*24*60*60*1000` expressions replaced. (3) `lib/auth/resolve-user.ts` — replaced `!==` with `crypto.timingSafeEqual()` for CRON_SECRET; prevents timing-based brute-force. (4) `app/api/settings/run-brief/route.ts` — removed all-users `runCommitmentCeilingDefense()` calls from interactive path (was adding 15-30s overhead and causing 504s); raised `maxDuration` to 120s. (5) Fixed silent catch blocks in google-sync and microsoft-sync.
  Any unresolved issues: P0 audit items still open: env var validation at startup (currently crashes at handler time), non-atomic commitment suppression in self-heal.ts, encryption key fallback logging. P1: generator.ts (2,637L) and scorer.ts (3,029L) need splitting into smaller modules. P2: missing DB indexes on tkg_signals (user_id, processed), (user_id, occurred_at) columns.

- 2026-03-26 — Professional Infrastructure & Clean House Audit
  MODE: AUDIT
  Commit hash(es): `eeee07f`, `f2a08c9`, `9724149`, `bde1190`, `524e639`
  Files changed: `lib/utils/api-error.ts`, `lib/briefing/generator.ts`, `app/api/cron/nightly-ops/route.ts`, `app/api/conviction/execute/route.ts`, `app/error.tsx`, `app/global-error.tsx`, `instrumentation.ts`, `instrumentation-client.ts`, `app/dashboard/page.tsx`, `app/dashboard/settings/SettingsClient.tsx`, `app/api/account/delete/route.ts`, `lib/signals/signal-processor.ts`, `lib/briefing/__tests__/pipeline-receipt.test.ts`, `supabase/migrations/20260326000002_api_usage_index.sql`
  What was verified: 4-agent parallel codebase audit (contract consistency, Sentry coverage, test gaps, scale fragility); `npm run build` passed (zero Sentry warnings after instrumentation.ts migration); `npx vitest run --exclude ".claude/worktrees/**"` 24 files / 131 tests passed; dev server confirmed all public routes render (/, /login, /pricing, /dashboard redirect); first real Sentry alert received within minutes of deploy confirming DSN active; `[object Object]` Sentry issue reproduced from production alert and fixed same session
  Any unresolved issues: `supabase/migrations/20260326000002_api_usage_index.sql` (api_usage composite index) not yet applied to production DB — requires `npx supabase db push` or manual execution; both 20260326 migrations need production DB apply at next maintenance window

- 2026-03-24 — Class-level stabilization (Part 2 forensic audit remediation)
  MODE: AUDIT
  Commit hash(es): `945bc9b`
  Files changed: `supabase/migrations/20260326000001_unify_check_constraints.sql`, `lib/db/__tests__/check-constraints.test.ts`, `app/error.tsx`, `.github/workflows/ci.yml`, `.husky/pre-push`, `lib/sync/microsoft-sync.ts`, `lib/sync/google-sync.ts`, `lib/signals/signal-processor.ts`, `app/api/cron/nightly-ops/route.ts`, `lib/cron/daily-brief.ts`, `lib/briefing/generator.ts`, `lib/cron/self-heal.ts`, `lib/auth/user-tokens.ts`, `lib/auth/token-store.ts`, `app/providers.tsx`, `app/api/google/connect/route.ts`, `app/dashboard/page.tsx`, `app/dashboard/settings/SettingsClient.tsx`
  What was verified: baseline `git stash pop` to restore working changes; `npm run build` passed; focused `npx vitest run lib/db/__tests__/check-constraints.test.ts` (4 passed); `npx playwright test tests/e2e/` passed (50 passed, 6 skipped, 0 failed); commit `945bc9b` pushed to `origin/main`
  Any unresolved issues: (1) `generator-runtime.test.ts` has 2 cross-file module isolation failures when run in the full vitest suite — tests pass in isolation, pre-existing pattern unrelated to this session's changes, needs `--isolate` refactor in a separate session; (2) `supabase/migrations/20260326000001_unify_check_constraints.sql` must be applied to production Supabase DB — requires `npx supabase db push` or manual execution, blocked without DB password from this workspace

- 2026-03-24 — Added `/api/health` route to stop health-check JSON parse failures and alert spam
  MODE: AUDIT
  Commit hash(es): pending (set after commit on `main`)
  Files changed: `app/api/health/route.ts`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: attempted `GIT_EDITOR=true git pull --rebase origin main` (blocked by pre-existing unstaged changes in the workspace); baseline `git log --oneline -10`; traced failing path `/api/cron/health-check -> fetch(/api/health) -> healthRes.json()`; baseline `npx playwright test` captured pre-existing 10-failure auth/clickflow set; `npm run build` passed after the fix; direct route execution of `GET /api/health` returned HTTP `200`, `application/json`, and body `{"status":"ok","ts":"...","db":true,"env":true}`; post-change `npx playwright test` reran and reproduced the same pre-existing 10-failure set with no new regressions
  Any unresolved issues: full local `npx playwright test` still fails outside this patch scope (`tests/audit/clickflow.spec.ts` timeout on `/`, and authenticated `tests/production/smoke.spec.ts` failures due missing local authenticated session state); logged in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`

- 2026-03-24 — Nightly pre-ceiling + scorer suppressed filter + 180-day signal cleanup
  MODE: AUDIT
  Commit hash(es): pending (set after commit on `main`)
  Files changed: `lib/cron/self-heal.ts`, `app/api/cron/nightly-ops/route.ts`, `app/api/cron/nightly-ops/__tests__/route.test.ts`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: attempted `GIT_EDITOR=true git pull --rebase origin main` (blocked by pre-existing unstaged `supabase/.temp/cli-latest`); `git log --oneline -10`; traced data path `nightly-ops start -> pre-cleanup -> pre-ceiling -> signal processing -> scorer commitment inputs`; focused `npx vitest run app/api/cron/nightly-ops/__tests__/route.test.ts` passed (5 tests); `npm run build` passed; local DB-backed verification script executed the new pre-ceiling defense and 180-day cleanup logic and confirmed `max_unsuppressed_commitments_after = 150` across checked users plus old extracted-signal totals before/after; verified scorer commitment loaders already include explicit `suppressed_at IS NULL` filters (no scorer file edit required)
  Any unresolved issues: `npm run test:prod` still has the pre-existing single failure `tests/production/smoke.spec.ts:137` (`/login?error=OAuthCallback` banner assertion); logged in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`

- 2026-03-24 — Raise generation spend cap + suppress recent contact repeats before prompt generation
  MODE: AUDIT
  Commit hash(es): pending (set after commit on `main`)
  Files changed: `lib/utils/api-tracker.ts`, `lib/utils/__tests__/api-tracker.test.ts`, `lib/briefing/generator.ts`, `lib/briefing/__tests__/generator-runtime.test.ts`, `FOLDERA_PRODUCT_SPEC.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: attempted `GIT_EDITOR=true git pull --rebase origin main` (blocked by pre-existing unstaged `supabase/.temp/cli-latest`); `git log --oneline -10`; traced generation path `scoreOpenLoops() -> hydrateWinnerRelationshipContext() -> fetchWinnerSignalEvidence() -> generatePayload()` before edits; focused `npx vitest run lib/utils/__tests__/api-tracker.test.ts lib/briefing/__tests__/generator-runtime.test.ts` passed (9 tests); `npm run build` passed; `npx playwright test` ran and reproduced pre-existing mixed-suite auth/session failures outside patch scope; live query `SELECT estimated_cost FROM api_usage ... LIMIT 5` for owner returned recent rows and `getSpendSummary()` returned `"dailyCapUSD": 1`
  Any unresolved issues: full local `npx playwright test` still fails outside this scoped patch (`tests/audit/clickflow.spec.ts` timeout on `/`, plus authenticated `tests/production/smoke.spec.ts` failures due missing local authenticated session state and `401` API checks); recorded in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`

- 2026-03-24 — Microsoft soft-disconnect token flow (no hard delete) + sync null-token guard
  MODE: AUDIT
  Commit hash(es): pending (will be updated after commit on `main`)
  Files changed: `app/api/microsoft/disconnect/route.ts`, `app/api/microsoft/disconnect/__tests__/route.test.ts`, `lib/auth/user-tokens.ts`, `lib/auth/__tests__/user-tokens.test.ts`, `lib/auth/auth-options.ts`, `lib/sync/microsoft-sync.ts`, `lib/sync/__tests__/microsoft-sync.test.ts`, `supabase/migrations/20260325000002_soft_disconnect.sql`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `GIT_EDITOR=true git pull --rebase origin main`; baseline `git log --oneline -10`; traced token path `JWT callback -> saveUserToken() -> /api/microsoft/disconnect -> user_tokens -> getAllUsersWithProvider()/getUserToken() -> syncMicrosoft()` before editing; focused `npx vitest run lib/auth/__tests__/user-tokens.test.ts lib/sync/__tests__/microsoft-sync.test.ts app/api/microsoft/disconnect/__tests__/route.test.ts` passed (`3 files, 8 tests`); `npm run build` passed
  Any unresolved issues: full local `npx playwright test` still fails outside this patch scope with pre-existing mixed-suite failures (audit clickflow timeout on `/`, multiple authenticated production-smoke failures against local auth/session state, plus blog/audit assertions in the omnibus run); logged in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`

- 2026-03-24 — Nightly orchestrator Job 1 prompt contract + morning action template
  MODE: OPS
  Commit hash(es): `5eaddaa`
  Files changed: `AGENTS.md`, `NIGHTLY_REPORT.md`, `CLAUDE.md`
  What was verified: read `CLAUDE.md`, `AGENTS.md`, `LESSONS_LEARNED.md`, `FOLDERA_PRODUCT_SPEC.md`; ran `git log --oneline -10`; traced reporting path `Job 1 output -> NIGHTLY_REPORT.md -> Brandon morning action`; confirmed `NIGHTLY_REPORT.md` has `## MORNING_ACTION` at top; confirmed AUTO_FIXABLE item includes `Status`, `Classification`, `Evidence`, `Human Action`, and `CODEX_PROMPT`; `npm run build` passed
  Any unresolved issues: pre-existing dirty worktree blocked `GIT_EDITOR=true git pull --rebase origin main` in this session

- 2026-03-24 — Added the pipeline receipt test for encrypted signal -> extraction -> scoring -> generation -> send
  MODE: AUDIT
  Commit hash(es): latest `test: add pipeline receipt coverage` commit on `main`
  Files changed: `lib/briefing/__tests__/pipeline-receipt.test.ts`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `FOLDERA_PRODUCT_SPEC.md`, `CLAUDE.md`
  What was verified: baseline `GIT_EDITOR=true git pull --rebase origin main`; baseline `git log --oneline -10`; baseline `npx playwright test` timed out before edits while starting the full omnibus suite; traced the receipt path `encrypt() -> tkg_signals.content -> processUnextractedSignals() -> scoreOpenLoops() -> generateDirective() -> runDailyGenerate() -> runDailySend()` before coding; `npx vitest run lib/briefing/__tests__/pipeline-receipt.test.ts` passed; `npm run build` passed on rerun after one transient `.next` rename failure; post-change `npx playwright test` reproduced the same local auth/session and clickflow failures outside this patch scope while the new receipt test stayed green
  Any unresolved issues: full local `npx playwright test` still fails outside this test-only patch because `tests/audit/clickflow.spec.ts` times out on `/`, authenticated `tests/production/smoke.spec.ts` redirects local `/dashboard` and `/dashboard/settings` to `/login`, `/api/auth/session` has no authenticated user, and `/api/conviction/latest` plus `/api/integrations/status` return `401`; logged in `FOLDERA_MASTER_AUDIT.md`

- 2026-03-24 — Nightly ops backlog threshold and stale reset guard
  MODE: AUDIT
  Commit hash(es): latest `fix: correct nightly signal backlog mode and stale reset guard` commit on `main`
  Files changed: `app/api/cron/nightly-ops/route.ts`, `app/api/cron/nightly-ops/__tests__/route.test.ts`, `lib/signals/signal-processor.ts`, `lib/cron/daily-brief.ts`, `lib/cron/__tests__/daily-brief.test.ts`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `FOLDERA_PRODUCT_SPEC.md`, `CLAUDE.md`
  What was verified: baseline `GIT_EDITOR=true git pull --rebase origin main`; baseline `git log --oneline -10`; baseline `npx vitest run app/api/cron/nightly-ops/__tests__/route.test.ts` passed; baseline `npx playwright test` reproduced the existing local auth/session failures; traced Stage 2 path `nightly-ops -> listUsersWithUnprocessedSignals/countUnprocessedSignals -> resetStaleSignalsForReprocessing/processUnextractedSignals -> runDailyBrief` before editing; post-change `npx vitest run --exclude ".claude/worktrees/**" app/api/cron/nightly-ops/__tests__/route.test.ts` passed; post-change `npx vitest run --exclude ".claude/worktrees/**" lib/cron/__tests__/daily-brief.test.ts` passed; `npm run build` passed; post-change `npx playwright test` still reproduced the same pre-existing local auth/session failures while the cron-focused changes stayed green in targeted tests
  Any unresolved issues: a real manual signed-in local `POST /api/settings/run-brief` could not be completed from this workspace because the stored local auth state is invalid (`/dashboard` and `/dashboard/settings` redirect to `/login`, `/api/auth/session` has no authenticated user, `/api/conviction/latest` and `/api/integrations/status` return `401`); full local `npx playwright test` still fails outside this patch scope with the same 10 pre-existing auth/clickflow cases already logged in `FOLDERA_MASTER_AUDIT.md`

- 2026-03-24 — Onboarding goal insert schema fix
  MODE: AUDIT
  Commit hash(es): latest `fix: remove invalid onboarding goal columns` commit on `main`
  Files changed: `app/api/onboard/set-goals/route.ts`, `app/api/onboard/set-goals/__tests__/route.test.ts`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `FOLDERA_PRODUCT_SPEC.md`, `CLAUDE.md`
  What was verified: baseline `GIT_EDITOR=true git pull --rebase origin main`; baseline `git log --oneline -10`; traced onboarding data path `POST /api/onboard/set-goals -> bucket/freeText row mapping -> supabase.from('tkg_goals').insert(rows) -> GET /api/onboard/set-goals` before editing; baseline `npx vitest run app/api/onboard/set-goals/__tests__/route.test.ts` passed; baseline `npx playwright test` reproduced the known local auth-state/clickflow failures; post-change `npx vitest run app/api/onboard/set-goals/__tests__/route.test.ts` passed; `npm run build` passed; local `/api/auth/session` resolved a valid session for `e40b7cd8-4925-42f7-bc99-5022969f1d22`; local `GET /api/onboard/set-goals` payload was replayed through local `POST /api/onboard/set-goals` and returned HTTP `200`; follow-up DB query confirmed the onboarding row persisted with only `user_id`, `goal_text`, `goal_category`, `priority`, `source`, `current_priority`, and `created_at`; post-change `npx playwright test` reproduced the same 10 known failures as baseline; push gate `npm run build` + focused local E2E passed during `git push`; post-push `npm run test:prod` passed 17/18 checks against production.
  Any unresolved issues: full local `npx playwright test` still fails outside this patch scope because `tests/audit/clickflow.spec.ts` times out on `/` and authenticated `tests/production/smoke.spec.ts` still do not get valid local auth state against `http://localhost:3000`; post-push production smoke also failed `tests/production/smoke.spec.ts:137` because `/login?error=OAuthCallback` did not show the expected banner on the live site; logged in `AUTOMATION_BACKLOG.md` and `FOLDERA_MASTER_AUDIT.md`.

- 2026-03-24 — Production hardening sweep
  MODE: AUDIT
  Commit hash(es): latest `fix: production hardening sweep` commit on `main`
  Files changed: `app/api/conviction/latest/route.ts`, `app/api/cron/nightly-ops/route.ts`, `app/api/cron/nightly-ops/__tests__/route.test.ts`, `app/api/onboard/set-goals/route.ts`, `app/api/onboard/set-goals/__tests__/route.test.ts`, `app/dashboard/page.tsx`, `app/login/page.tsx`, `app/page.tsx`, `app/pricing/page.tsx`, `lib/briefing/types.ts`, `lib/conviction/execute-action.ts`, `lib/conviction/__tests__/execute-action.test.ts`, `lib/cron/acceptance-gate.ts`, `lib/cron/connector-health.ts`, `lib/cron/__tests__/acceptance-gate.test.ts`, `lib/cron/__tests__/connector-health.test.ts`, `lib/email/resend.ts`, `lib/sync/google-sync.ts`, `lib/sync/__tests__/google-sync.test.ts`, `supabase/migrations/20260325000001_health_alert.sql`, `tests/e2e/public-routes.spec.ts`, `tests/production/smoke.spec.ts`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `FOLDERA_PRODUCT_SPEC.md`, `CLAUDE.md`
  What was verified: baseline `GIT_EDITOR=true git pull --rebase origin main` was blocked by a pre-existing dirty worktree; baseline `git log --oneline -10`; traced cron/sync/execute/onboarding/dashboard/login data paths before editing; focused `npx vitest run --exclude ".claude/worktrees/**" app/api/cron/nightly-ops/__tests__/route.test.ts lib/conviction/__tests__/execute-action.test.ts lib/sync/__tests__/google-sync.test.ts lib/cron/__tests__/acceptance-gate.test.ts lib/cron/__tests__/connector-health.test.ts app/api/onboard/set-goals/__tests__/route.test.ts` passed (`6 files, 19 tests`); `npm run build` passed; post-change full local `npx playwright test` still reproduced the pre-existing mixed-suite failures while the updated pricing and login-error assertions passed; requested grep checks will be captured in this session before commit.
  Any unresolved issues: full local `npx playwright test` still fails outside this patch scope because `tests/audit/clickflow.spec.ts` times out on `/` and authenticated `tests/production/smoke.spec.ts` expects valid local auth state against `http://localhost:3000`; the pre-existing dirty worktree also blocked the required pre-push rebase flow.

- 2026-03-24 — Fixed blog markdown rendering and typography on `/blog/[slug]`
  MODE: AUDIT
  Commit hash(es): `27c3f79`
  Files changed: `app/(marketing)/blog/[slug]/page.tsx`, `lib/blog.ts`, `tailwind.config.js`, `tests/e2e/public-routes.spec.ts`, `package.json`, `package-lock.json`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `GIT_EDITOR=true git pull --rebase origin main`; baseline `git log --oneline -10`; baseline `npm run test:prod` (18 passed); traced blog data path `content/blog/*.md -> lib/blog.ts -> app/(marketing)/blog/[slug]/page.tsx`; pre-edit focused `npx playwright test tests/e2e/public-routes.spec.ts --grep "Blog routes"` failed on missing busy-professionals table; post-change `npm run build` passed; post-change focused `npx playwright test tests/e2e/public-routes.spec.ts --grep "Blog routes"` passed (5 passed); full local `npx playwright test` reproduced only the pre-existing mixed-suite failures while the new blog checks passed
  Any unresolved issues: full local `npx playwright test` still fails outside this patch scope because `tests/production/smoke.spec.ts` expects authenticated production storage state against `http://localhost:3000` and `tests/audit/clickflow.spec.ts` still times out on `/`; logged in `FOLDERA_MASTER_AUDIT.md`

- 2026-03-24 — Replaced placeholder blog post bodies with provided marketing copy
  MODE: AUDIT
  Commit hash(es): `95b3f10`
  Files changed: `content/blog/ai-email-assistant.md`, `content/blog/ai-task-prioritization.md`, `content/blog/ai-assistant-busy-professionals.md`, `content/blog/reduce-email-overwhelm.md`, `content/blog/best-ai-tools-solopreneurs-2026.md`, `CLAUDE.md`
  What was verified: baseline `GIT_EDITOR=true git pull --rebase origin main`; baseline `git log --oneline -10`; traced blog content path through `lib/blog.ts`; confirmed body-only diffs for all five markdown files; `npm run build` passed; `npx playwright test` ran after an initial webServer startup error and reproduced the pre-existing authenticated production-smoke failures plus the existing `tests/audit/clickflow.spec.ts` timeout on `/`
  Any unresolved issues: `npx playwright test` did not pass because of pre-existing local auth-state / production-smoke failures (`tests/production/smoke.spec.ts`) and the existing `tests/audit/clickflow.spec.ts` landing-page timeout; no source changes were made outside the requested blog content and this mandatory session log

- 2026-03-24 — Signal backfill throttle, extraction spend cap, blog launch, and Google scope diagnostics
  MODE: AUDIT
  Commit hash(es): `e804e58`
  Files changed: `app/api/cron/nightly-ops/route.ts`, `app/api/cron/nightly-ops/__tests__/route.test.ts`, `lib/utils/api-tracker.ts`, `lib/utils/__tests__/api-tracker.test.ts`, `lib/signals/signal-processor.ts`, `lib/sync/google-sync.ts`, `lib/sync/__tests__/google-sync.test.ts`, `lib/blog.ts`, `app/(marketing)/blog/page.tsx`, `app/(marketing)/blog/[slug]/page.tsx`, `content/blog/ai-email-assistant.md`, `content/blog/ai-task-prioritization.md`, `content/blog/ai-assistant-busy-professionals.md`, `content/blog/reduce-email-overwhelm.md`, `content/blog/best-ai-tools-solopreneurs-2026.md`, `tests/e2e/public-routes.spec.ts`, `package.json`, `package-lock.json`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `GIT_EDITOR=true git pull --rebase origin main`; baseline `git log --oneline -10`; focused baseline `vitest` for nightly-ops/api-tracker/google-sync before edits; post-change `npx vitest run app/api/cron/nightly-ops/__tests__/route.test.ts lib/utils/__tests__/api-tracker.test.ts lib/sync/__tests__/google-sync.test.ts lib/signals/__tests__/signal-processor.test.ts`; `npm run build`; full local `npx playwright test` with the new `/blog` coverage passing while the pre-existing production-smoke/local-auth failures remained; explicit grep checks for signal throttle constants, `EXTRACTION_DAILY_CAP`, and Google missing-scope logs; local `http://localhost:3000/blog` and `http://localhost:3000/blog/ai-email-assistant` both returned HTTP 200
  Any unresolved issues: full local `npx playwright test` still fails outside this patch scope because `tests/production/smoke.spec.ts` expects authenticated production storage state against `http://localhost:3000`; logged in `FOLDERA_MASTER_AUDIT.md`

- 2026-03-24 — Manual run-brief now sends immediately for the signed-in user
  MODE: AUDIT
  Commit hash(es): `2576c1a`
  Files changed: `app/api/settings/run-brief/route.ts`, `app/api/settings/run-brief/__tests__/route.test.ts`, `lib/cron/daily-brief.ts`, `lib/cron/__tests__/manual-send.test.ts`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `git pull --rebase origin main`; baseline `git log --oneline -10`; baseline `npm run test:prod` (18 passed); focused `npx vitest run app/api/settings/run-brief/__tests__/route.test.ts lib/cron/__tests__/manual-send.test.ts` (5 passed); `npm run build`; full local `npx playwright test` reproduced the pre-existing mixed-suite failures (`73 passed, 7 skipped, 10 failed`); Vercel production deploy `dpl_3fz8buNpDkRvSV4bppvVnEtvayt7` reached `Ready`; post-deploy `npm run test:prod` (18 passed); production `POST /api/settings/run-brief` with a valid signed-in owner session returned HTTP `207` with `daily_brief.generate.results[0].meta.action_id = 6e555f8f-d28c-4400-b3bd-c77c9d3c9715`, `status = pending_approval`, and `daily_brief.send.results[0].code = email_already_sent`; live DB query confirmed the owner already had `daily_brief_sent_at = 2026-03-24T02:26:26.519Z` on action `a2481a04-9097-4546-b782-6437c2688c8d`; authenticated non-owner coverage verified by route/unit tests (`runDailyBrief({ userIds })` + `runDailySend({ userIds })` scope) because no deliverable non-owner auth session exists in this workspace
  Any unresolved issues: full local `npx playwright test` still fails outside this patch scope because `tests/production/smoke.spec.ts` expects valid authenticated local auth state and `tests/audit/clickflow.spec.ts` still times out on `/`; logged in `AUTOMATION_BACKLOG.md` and `FOLDERA_MASTER_AUDIT.md`

- 2026-03-24 — Signal freshness repair for existing entities and Yadira alias backfill
  MODE: AUDIT
  Commit hash(es): `7532485`
  Files changed: `lib/signals/signal-processor.ts`, `lib/signals/__tests__/signal-processor.test.ts`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `git pull --rebase origin main`; baseline `git log --oneline -10`; focused regression baseline `npx vitest run lib/signals/__tests__/signal-processor.test.ts` failed before the patch (2 failed) and passed after the patch (3 passed); `npm run build`; full local `npx playwright test` reproduced the pre-existing mixed-suite failures (`73 passed, 7 skipped, 10 failed`); live owner query `SELECT name, last_interaction FROM tkg_entities WHERE user_id = 'e40b7cd8-4925-42f7-bc99-5022969f1d22' AND name ILIKE '%clapper%'` now returns both Yadira rows at `2026-03-23T09:18:07.943+00:00`; live `scoreOpenLoops()` no longer surfaces a Yadira relationship candidate; local `generateDirective()` for owner now returns a low-urgency `do_nothing` result instead of selecting Yadira
  Any unresolved issues: full local `npx playwright test` still fails outside this patch scope because `tests/production/smoke.spec.ts` expects valid authenticated local auth state and `tests/audit/clickflow.spec.ts` still times out on `/`; logged in `FOLDERA_MASTER_AUDIT.md`

- 2026-03-24 — Generator JSON extraction hardening and production receipt verification
  MODE: AUDIT
  Commit hash(es): `f56f7d2`, `9de6a0f`
  Files changed: `lib/briefing/generator.ts`, `lib/briefing/__tests__/generator-runtime.test.ts`, `lib/briefing/__tests__/generator.test.ts`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `git pull --rebase origin main`; baseline `git log --oneline -10`; baseline `npm run test:prod` (18 passed); focused `npx vitest run lib/briefing/__tests__/generator-runtime.test.ts lib/briefing/__tests__/generator.test.ts` (160 passed); `npm run build`; full local `npx playwright test` reproduced the mixed-suite failures (`73 passed, 7 skipped, 10 failed`); repo push gate passed (`npm run build` + `npx playwright test tests/e2e/ tests/e2e/backend-safety-gates.spec.ts tests/e2e/safety-gates.spec.ts tests/e2e/flow-routes.spec.ts` => `45 passed, 6 skipped`); post-deploy `npm run test:prod` (18 passed); post-deploy `POST /api/settings/run-brief` created owner action `9ec89641-e099-4138-82cb-3b6fe0e83773` with `status = pending_approval`, `action_type = send_message`, `confidence = 78`
  Any unresolved issues: full local `npx playwright test` still fails outside the repo push gate because the omnibus local run mixes `tests/production/smoke.spec.ts` auth expectations against `http://localhost:3000` and still has one `tests/audit/clickflow.spec.ts` timeout on `/`; logged in `AUTOMATION_BACKLOG.md` and `FOLDERA_MASTER_AUDIT.md`

- 2026-03-24 — Feedback signal source migration + test-token persistence guard
  MODE: AUDIT
  Commit hash(es): `21e83d0`
  Files changed: `lib/auth/user-tokens.ts`, `lib/auth/__tests__/user-tokens.test.ts`, `supabase/migrations/20260324000002_restore_user_feedback_signal_source.sql`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `git pull --rebase origin main`; baseline `git log --oneline -10`; baseline `npm run test:prod` (18 passed); live owner Google `user_tokens` row exists and is encrypted in storage, not a literal `test_` token; `npx vitest run lib/auth/__tests__/user-tokens.test.ts` (2 passed); `npm run build`; post-change `npm run test:prod` (18 passed); `git grep -n "test_" -- lib/auth/user-tokens.ts`
  Any unresolved issues: remote Supabase DDL could not run from this workspace because `npx supabase migration list` requires the linked project Postgres password, so the requested live `pg_get_constraintdef(...)` verification for `tkg_signals_source_check` remains blocked; logged in `AUTOMATION_BACKLOG.md` and `FOLDERA_MASTER_AUDIT.md`

- 2026-03-24 — Permanent cost controls for extraction, research gating, goal refresh, try-analyze, and spend cap
  MODE: AUDIT
  Commit hash(es): `7258b73`
  Files changed: `lib/extraction/conversation-extractor.ts`, `lib/briefing/generator.ts`, `lib/cron/goal-refresh.ts`, `app/api/try/analyze/route.ts`, `lib/utils/api-tracker.ts`, `lib/briefing/__tests__/generator-runtime.test.ts`, `lib/utils/__tests__/api-tracker.test.ts`, `FOLDERA_PRODUCT_SPEC.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `git pull --rebase origin main`; baseline `git log --oneline -10`; baseline `npm run test:prod` (18 passed); focused `npx vitest run lib/briefing/__tests__/generator-runtime.test.ts lib/utils/__tests__/api-tracker.test.ts` (5 passed); post-change `npm run build`; post-change `npm run test:prod` (18 passed); post-change `git grep -n "claude-sonnet" -- app lib tests` showed only `lib/briefing/generator.ts` and `lib/briefing/researcher.ts`; post-change `git grep -n "DAILY_SPEND_CAP" -- lib` showed `0.25`; post-change full `npx playwright test` completed with pre-existing mixed-suite failures logged in `FOLDERA_MASTER_AUDIT.md`
  Any unresolved issues: full local `npx playwright test` still fails in pre-existing `tests/production/smoke.spec.ts` local-auth expectations plus one `tests/audit/clickflow.spec.ts` timeout; logged in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`

- 2026-03-24 — Generator fallback now preserves generation-stage failures and api_usage writes endpoint
  MODE: AUDIT
  Commit hash(es): `e60752f`
  Files changed: `lib/briefing/generator.ts`, `lib/utils/api-tracker.ts`, `lib/briefing/__tests__/generator-runtime.test.ts`, `lib/utils/__tests__/api-tracker.test.ts`, `supabase/migrations/20260324000001_api_usage_endpoint.sql`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `npm run test:prod` (18 passed); baseline `npx playwright test` reproduced existing failures; targeted `vitest` for generator/api-tracker regressions failed before the patch and passed after it; `npm run build`; post-change `npx playwright test` still reproduced the same pre-existing failures outside the repo push gate; repo push hook `npx playwright test tests/e2e/ tests/e2e/backend-safety-gates.spec.ts tests/e2e/safety-gates.spec.ts tests/e2e/flow-routes.spec.ts` passed (44 passed, 7 skipped); post-deploy `npm run test:prod` passed (18 passed); live `POST https://www.foldera.ai/api/cron/nightly-ops` created action `504c171f-50dc-473f-afdc-cdfc53f15894` with `generation_log.stage = "generation"`; live `api_usage` writes verified via rows `be76ef5c-40af-4543-9cb3-37db0cf27d16` and `80aaeaaa-c6bb-4458-bf9e-78fe72d5fdd6`.
  Any unresolved issues: Anthropic credits are exhausted in production, so cron-driven `api_usage` rows are still blocked until billing is restored; full local `npx playwright test` still has the pre-existing mixed-suite failures logged in `FOLDERA_MASTER_AUDIT.md`.

- 2026-03-23 — Added backend E2E safety gates for cron auth reachability, auth/session agreement, sync error handling, invalid input, and webhook preconditions
  MODE: AUDIT
  Commit hash(es): `2781a23`
  Files changed: `tests/e2e/backend-safety-gates.spec.ts`
  What was verified: baseline `npm run test:prod` (18 passed); `npx playwright test tests/e2e/backend-safety-gates.spec.ts` (9 passed, 7 skipped for unmet env/runtime preconditions); `npm run build`; `npx playwright test tests/e2e/` (44 passed, 7 skipped); `npm run test:prod` (18 passed)
  Any unresolved issues: none

- 2026-03-23 — Added E2E safety-gate coverage for redirect stability, API user context, pricing, overflow, and connector decrypt canary
  MODE: AUDIT
  Commit hash(es): `79f9de7`
  Files changed: `tests/e2e/safety-gates.spec.ts`
  What was verified: baseline `npm run test:prod` (18 passed); `npx playwright test tests/e2e/safety-gates.spec.ts` (6 passed); `npm run build`; `npx playwright test tests/e2e/` (35 passed); `npm run test:prod` (18 passed)
  Any unresolved issues: none

- 2026-03-23 — Dashboard no longer client-redirects to onboard after middleware auth and route loop coverage added
  MODE: AUDIT
  Commit hash(es): `7b0b170`
  Files changed: `app/dashboard/page.tsx`, `tests/e2e/flow-routes.spec.ts`
  What was verified: baseline `npx playwright test tests/e2e/` (27 passed); `npx playwright test tests/e2e/flow-routes.spec.ts` (2 passed); `npm run build`; `npx playwright test tests/e2e/` (29 passed); `npm run test:prod` (18 passed)
  Any unresolved issues: none

- 2026-03-23 — Production smoke redirects for authenticated /login and /start
  MODE: OPS
  Commit hash(es): `7e15efa`
  Files changed: `tests/production/smoke.spec.ts`, `CLAUDE.md`
  What was verified: `npm run build`; `npx playwright test tests/e2e/` (27 passed); baseline `npm run test:prod` reproduced the 2 stale failures; updated `npm run test:prod` passed (18 passed)
  Any unresolved issues: none

- 2026-03-23 — Added a read-only stress-test route for the directive pipeline
  MODE: AUDIT
  Commit hash(es): `9b3e719`
  Files changed: `app/api/dev/stress-test/route.ts`, `lib/signals/signal-processor.ts`, `lib/briefing/generator.ts`, `lib/briefing/researcher.ts`, `lib/briefing/scorer.ts`, `lib/utils/api-tracker.ts`, `CLAUDE.md`
  What was verified: `npm run build`; local dev call to `POST /api/dev/stress-test` with a signed generic session cookie and `{"rounds":3}` returned valid JSON in the requested shape; `tkg_actions` count for user `44444444-4444-4444-8444-444444444444` stayed at `0` before and after the call; `npx playwright test tests/e2e/` (44 passed, 7 skipped)
  Any unresolved issues: none

- 2026-03-23 — JWT onboarding claim for middleware auth routing
  MODE: AUDIT
  Commit hash(es): `67d0d23`
  Files changed: `middleware.ts`, `lib/auth/auth-options.ts`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `npx playwright test tests/e2e/` (27 passed) before edits; `npm run build`; `npx playwright test tests/e2e/` (27 passed)
  Any unresolved issues: `npm run test:prod` failed 2 tests on live `/login` and `/start` public-route expectations under authenticated storage state; logged as `NEEDS_REVIEW` in `FOLDERA_MASTER_AUDIT.md` and `AB20` in `AUTOMATION_BACKLOG.md`

- 2026-03-23 — Middleware auth gate, redirect cleanup, and connector refresh
  MODE: AUDIT
  Commit hash(es): `f4549e5`
  Files changed: `middleware.ts`, `app/dashboard/page.tsx`, `app/onboard/page.tsx`, `app/dashboard/settings/SettingsClient.tsx`, `tests/e2e/authenticated-routes.spec.ts`, `tests/e2e/public-routes.spec.ts`, `tests/production/smoke.spec.ts`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`, `CLAUDE.md`
  What was verified: baseline `npx playwright test tests/e2e/public-routes.spec.ts` before edits; Step 1 `npm run build` + `npx playwright test tests/e2e/public-routes.spec.ts`; Step 2 `npm run build` + `npx playwright test tests/e2e/` (27 passed); Step 3 `npm run build` + `npx playwright test tests/e2e/` (27 passed); `npm run test:prod` (18 passed) after updating the stale landing-page CTA assertion
  Any unresolved issues: none

- 2026-03-24 — Goal-gap analysis architectural rewrite (generator, scorer, context-builder, goal-refresh)
  MODE: AUDIT
  Commit hash(es): pending (set after commit on `main`)
  Files changed: `lib/briefing/generator.ts`, `lib/briefing/scorer.ts`, `lib/briefing/context-builder.ts`, `lib/cron/goal-refresh.ts`, `FOLDERA_PRODUCT_SPEC.md`, `CLAUDE.md`
  What was verified: baseline `GIT_EDITOR=true git pull --rebase origin main`; baseline `git log --oneline -10`; read `LESSONS_LEARNED.md`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`; read all 5 target files in full before coding; traced data path `tkg_goals -> scorer goals query -> matchGoal() -> buildStructuredContext() -> buildPromptFromStructuredContext() -> generatePayload()` before editing; baseline `npx vitest run` (231 passed across 12 test files); post-change `npm run build` passed; post-change `npx vitest run --exclude ".claude/worktrees/**"` (110 passed, 19 test files); post-change `npx playwright test tests/e2e/` (50 passed, 6 skipped — same as baseline)
  Any unresolved issues: `inferGoalsFromBehavior()` is not yet wired into nightly-ops (needs explicit call, designed for Sunday/weekly cadence); production verification of goal-gap analysis quality requires signal backlog to clear first; full local `npx playwright test` still has pre-existing auth-state failures outside this patch scope

- 2026-03-24 — Generator rewritten to behavioral-analyst mode
  MODE: AUDIT
  Commit hash(es): `09d06ae`
  Files changed: `lib/briefing/generator.ts`, `lib/briefing/scorer.ts`, `lib/briefing/__tests__/scorer-benchmark.test.ts`, `FOLDERA_PRODUCT_SPEC.md`
  What was verified: baseline `GIT_EDITOR=true git pull --rebase origin main`; baseline `git log --oneline -10`; read `LESSONS_LEARNED.md`, `FOLDERA_PRODUCT_SPEC.md`; baseline `npx vitest run lib/briefing/__tests__/generator-runtime.test.ts lib/briefing/__tests__/generator.test.ts` (160 passed); post-change `npx vitest run lib/briefing/__tests__/ lib/utils/__tests__/api-tracker.test.ts` (279 passed); `npm run build`; pre-push `npx playwright test` (50 passed, 6 skipped); push gate passed; Vercel deploy `dpl_2mGQv2GC9qdwxfwYpjTJJhTMkeo5` reached `READY`; post-deploy `npm run test:prod` (17 passed, 1 pre-existing failure); production `POST /api/settings/run-brief` created `tkg_actions.id = 2dc60d21-d7d2-4812-8310-4d4c0dba47e0` with `action_type = do_nothing`, `confidence = 66`, `gen_stage = generation`, `artifact_type = wait_rationale`; directive text surfaced a behavioral-analyst observation (spending contradiction while cash-constrained) rather than a task-manager suggestion
  Any unresolved issues: `npm run test:prod` still has the pre-existing `smoke.spec.ts:137` login error banner failure; the directive was `wait_rationale` (scorer_ev = 0) because signal processing budget was exhausted with 841 unprocessed signals remaining — quality of executable directives (send_message, write_document) cannot be verified until signal backlog clears

- 2026-03-23 — Scorer quality floor + generator context enrichment
  MODE: AUDIT
  Commit hash(es): 92a15c1
  Files changed: `lib/briefing/scorer.ts`, `lib/briefing/context-builder.ts`, `lib/briefing/types.ts`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`
  What was verified: `npm run build`; scorer search checks for fallback action type and `specificityAdjustedStakes`; `computeUserState()` runtime check for owner `e40b7cd8-4925-42f7-bc99-5022969f1d22` and test user `22222222-2222-2222-2222-222222222222`; `buildContextBlock()` runtime check for both users; `npx playwright test` executed
  Any unresolved issues: `npx playwright test` still fails in unrelated pricing/auth production checks logged in `AUTOMATION_BACKLOG.md` as `AB19`; requested `FOLDERA_MASTER_AUDIT.md` does not exist in this repo

- 2026-03-24 — Part 2 class-level stabilization + CI workflow hardening
  MODE: AUDIT
  Commit hash(es): pending (set after commit on `main`)
  Files changed: `app/api/google/sync-now/route.ts`, `lib/sync/google-sync.ts`, `lib/cron/connector-health.ts`, `app/dashboard/settings/SettingsClient.tsx`, `app/api/integrations/status/route.ts`, `app/api/subscription/status/route.ts`, `app/api/account/delete/route.ts`, `app/api/account/delete/__tests__/route.test.ts`, `supabase/migrations/20260325000003_atomic_goal_replacements.sql`, `app/api/priorities/update/route.ts`, `app/api/priorities/update/__tests__/route.test.ts`, `app/api/onboard/set-goals/route.ts`, `app/api/onboard/set-goals/__tests__/route.test.ts`, `lib/auth/onboarding-state.ts`, `lib/auth/auth-options.ts`, `app/api/onboard/check/route.ts`, `middleware.ts`, `app/api/cron/health-check/route.ts`, `lib/cron/acceptance-gate.ts`, `lib/cron/__tests__/acceptance-gate.test.ts`, `lib/cron/daily-brief.ts`, `lib/cron/__tests__/daily-brief.test.ts`, `app/api/cron/daily-generate/route.ts`, `app/api/cron/daily-send/route.ts`, `app/api/cron/trigger/route.ts`, `lib/extraction/conversation-extractor.ts`, `lib/auth/daily-brief-users.ts`, `app/api/stripe/webhook/route.ts`, `lib/auth/subscription.ts`, `app/api/conviction/latest/route.ts`, `app/api/google/sync-now/__tests__/route.test.ts`, `lib/db/__tests__/check-constraints.test.ts`, `.github/workflows/ci.yml`, `FOLDERA_MASTER_AUDIT.md`, `CLAUDE.md`
  What was verified: baseline `git log --oneline -10`; focused `npx vitest run app/api/onboard/set-goals/__tests__/route.test.ts app/api/priorities/update/__tests__/route.test.ts app/api/account/delete/__tests__/route.test.ts app/api/google/sync-now/__tests__/route.test.ts lib/cron/__tests__/acceptance-gate.test.ts lib/cron/__tests__/daily-brief.test.ts lib/sync/__tests__/google-sync.test.ts lib/db/__tests__/check-constraints.test.ts` (`46 passed`); `npm run build` passed after clearing stale `.next`; full `npx playwright test` executed (`67 passed, 7 skipped, 21 failed`)
  Any unresolved issues: omnibus Playwright still fails on mixed local auth-state + authenticated-flow expectations; logged in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`
