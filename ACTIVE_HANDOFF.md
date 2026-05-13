# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-12 19:22 PT
Last known production SHA: b78b2ac
Last completed code commit: b78b2ac
Current slice: Briefing quality / candidate selection
Current mode: Deterministic selection bug shipped; controller selection is being aligned so the next no-paid selected-move persistence seam is emitted instead of a stale all-external STOP.

## Current product truth

- Frontend surface contract A-Z is shipped on `main`; controller STOP cleanup is shipped on `main` and live in production at `a6fdeec`.
- Public landing nav is server-auth-aware: logged-out `/` shows `Sign in` + `Start free`; logged-in `/` shows `Dashboard` instead of `Sign in`, without adding a client `/api/auth/session` poll.
- Legacy app surfaces that use `ProductShell` share the matte Foldera app background, wider app-width shell, cyan-edged header card, and mobile dashboard-section rail.
- Auth/onboarding surfaces (`/login`, `/start`, `/onboard`) use the same premium matte app surface and centered cards without changing OAuth, onboarding, billing, source freshness, or outbound email contracts.
- Production mobile auth checks, production Playwright auth state, and production smoke CTA assertions now match the public-only deploy contract.
- Production deploy truth: `https://www.foldera.ai/api/health` reports `revision.git_sha=b78b2ac78bb2cb83e763b6ac9725626495be827a`, `git_ref=main`, `deployment_id=dpl_FSKhoE98wGWjmVfYrubCLp8mNcgF`, `vercel_env=production`.
- GitHub truth for `b78b2ac` is green: commit check-runs include successful health, static verification, unit/build/e2e, deploy, and deploy-triggered CI gates; authenticated/payments/quarantine lanes were skipped by workflow scope.
- Controller truth: after the candidate-selection fix, source truth has one deterministic no-paid next rung: selected WorkSourceWA current move -> persisted artifact/action/history proof. Controller selection is patched to emit that generated contract instead of a stale all-external STOP.
- The controller now clears stale `.foldera-contract.json` on STOP so future runs cannot execute an already-finished contract.
- Current health is non-blocking: Gmail fresh `14h ago`, Outlook fresh `14h ago`, `Mail cursors current`, and last generation `do_nothing`.
- Persisted artifact path truth: deterministic approve/skip/latest/detail/history tests pass, and past production `write_document` artifacts remain visible in history.
- Candidate selection truth: previous no-safe result was an over-filtering bug. Pattern memory learned from operational auto-suppressed proof rows and broad `candidate:discrepancy` keys, blocking a real Tier 1 WorkSourceWA admin-deadline candidate.
- Current no-paid winner truth after the fix: `npm run winner:autopsy` returns `current_winner.verdict=selected` for `Deadline closing: Complete at least one account activity...`, tier `tier_1`, artifact family `admin_deadline_decision_packet`.
- Daily-value state after the fix: deterministic winner-truth builds a non-null `daily_utility_slate.primary_move` for the selected WorkSourceWA account-activity deadline, without paid generation or persistence.
- Contractless STOP preflight now allows `CURRENT_STATE.md` alongside `ACTIVE_HANDOFF.md` and `SESSION_HISTORY.md` for source-truth receipts, so valid proof-mode blockers can be committed without fabricating a controller contract.

## Verified proof

- controller stop: PASS `npm run controller:autopilot` -> `CONTROLLER RESULT: STOP`; `.foldera-contract.json` removed; no blocking dirty files.
- controller/preflight regression: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/controller-autopilot.test.ts scripts/__tests__/preflight-contract.test.ts --reporter=verbose` (`33/33`).
- build/lint: PASS `npm run build`; PASS `npm run lint`.
- health: PASS `npm run health` -> `RESULT: 0 FAILING`.
- production SHA: PASS `https://www.foldera.ai/api/health` -> `b78b2ac`, deployment `dpl_FSKhoE98wGWjmVfYrubCLp8mNcgF`.
- GitHub CI/deploy: PASS check-runs on `b78b2ac` all completed with no failures.
- Previously proven frontend surface contract: build, lint, large-file split, public routes, dashboard navigation, authenticated routes, mobile visual QA, production public smoke, and proof screenshots.
- persisted-artifact focused tests: PASS `npx vitest run lib/conviction/__tests__/execute-action.test.ts app/api/conviction/execute/__tests__/route.test.ts 'app/api/conviction/actions/[id]/__tests__/route.test.ts' app/api/conviction/history/__tests__/route.test.ts app/api/conviction/daily-value/__tests__/route.test.ts app/api/conviction/latest/__tests__/free-artifact-allowance.test.ts lib/briefing/__tests__/daily-utility-slate.test.ts --reporter=verbose` (`50/50`).
- winner/autopsy before fix: PASS `npm run winner:autopsy` -> `current_winner.verdict=no_safe_artifact_today`; blockers showed a Tier 1 admin-deadline candidate blocked by noisy-pattern memory.
- winner/autopsy after fix: PASS `npm run winner:autopsy` -> `current_winner.verdict=selected`, selected Tier 1 `admin_deadline_decision_packet`.
- daily-value state after fix: PASS deterministic winner-truth read returns a non-null `daily_utility_slate.primary_move` for the selected WorkSourceWA account-activity deadline.
- candidate-selection regression: PASS `node node_modules/vitest/vitest.mjs run lib/briefing/__tests__/discrepancy-card-frame.test.ts lib/briefing/__tests__/winner-selection.test.ts lib/briefing/__tests__/positive-winner-contract.test.ts --reporter=verbose` (`44/44`).
- controller selection regression: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/controller-autopilot.test.ts --reporter=verbose` (`20/20`).
- contractless receipt preflight: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/preflight-contract.test.ts --reporter=verbose`.
- build: PASS `npm run build`.

## Remaining defects in current slice

- None for the frontend surface contract or controller STOP cleanup.
- Candidate selection over-filtering is fixed and pushed. The selected-move persistence path remains unexecuted; controller selection is patched so future runs can receive that generated contract.

## Next exact move

1. Rerun `npm run controller:autopilot`.
2. Execute only the generated selected-move persistence contract if it emits `GENERATED-SELECTED-MOVE-TO-PERSISTED-ARTIFACT`.
3. Do not use `proof:golden-artifact`; do not run paid/model generation without explicit approval.
4. Only reopen external money-loop work when one blocker becomes actionable: explicit paid/model-proof approval and quota, next passive send window, a real connected non-owner account, or fresh repeated-directive failure evidence.

## Do not touch yet

- paid generation without explicit approval
- outbound email without explicit approval
- Stripe charge
- schema migration
- destructive DB action
- fake non-owner accounts or fabricated production data
- dashboard/app-fit or public surface polish without fresh failing proof

## External blockers

- `BL-015`: waiting on explicit paid/model-backed owner money-shot proof.
- `BL-003` and `BL-005`: waiting on paid model quota/access before fresh approved production proof.
- `BL-006`: waiting on one real connected non-owner account.
- `BL-011`: waiting on the next natural daily-send passive proof window.
- `BL-007`: waiting on fresh repeated-directive failure evidence or monitored production brief-run proof.

## Stop condition

Stop when the controller returns `STOP` with only the external blockers above and no stale executable contract exists.
