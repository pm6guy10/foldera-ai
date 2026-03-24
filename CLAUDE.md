# CLAUDE.md — Operational Runbook

## Pre-Flight Checklist

Every session runs this before any work:

1. Run `GIT_EDITOR=true git pull --rebase origin main` before making changes. If the worktree is not clean, resolve that without discarding user changes.
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
- `source`: extracted, manual, auto_suppression, onboarding_bucket, onboarding_stated, onboarding_marker
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
- Owner account `e40b7cd8` is always pro. Never show trial or expired banners to the owner.
- Self-referential Foldera signals must be filtered before generator or extraction reads.
- Session-backed routes use `session.user.id` only. `INGEST_USER_ID` is cron and background only.
- Production logs must not include directive text, conviction scores, behavioral content, or similar user-private data.
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

- 2026-03-23 — Scorer quality floor + generator context enrichment
  MODE: AUDIT
  Commit hash(es): 92a15c1
  Files changed: `lib/briefing/scorer.ts`, `lib/briefing/context-builder.ts`, `lib/briefing/types.ts`, `FOLDERA_PRODUCT_SPEC.md`, `AUTOMATION_BACKLOG.md`
  What was verified: `npm run build`; scorer search checks for fallback action type and `specificityAdjustedStakes`; `computeUserState()` runtime check for owner `e40b7cd8-4925-42f7-bc99-5022969f1d22` and test user `22222222-2222-2222-2222-222222222222`; `buildContextBlock()` runtime check for both users; `npx playwright test` executed
  Any unresolved issues: `npx playwright test` still fails in unrelated pricing/auth production checks logged in `AUTOMATION_BACKLOG.md` as `AB19`; requested `FOLDERA_MASTER_AUDIT.md` does not exist in this repo
