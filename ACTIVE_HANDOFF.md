# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-12 17:46 PT
Last known production SHA: a6fdeec
Last completed code commit: 601afc8
Current slice: Persisted artifact path proof
Current mode: Proof mode; no product/frontend changes because the current owner-day path blocks before persistence.

## Current product truth

- Frontend surface contract A-Z is shipped on `main`; controller STOP cleanup is shipped on `main` and live in production at `a6fdeec`.
- Public landing nav is server-auth-aware: logged-out `/` shows `Sign in` + `Start free`; logged-in `/` shows `Dashboard` instead of `Sign in`, without adding a client `/api/auth/session` poll.
- Legacy app surfaces that use `ProductShell` share the matte Foldera app background, wider app-width shell, cyan-edged header card, and mobile dashboard-section rail.
- Auth/onboarding surfaces (`/login`, `/start`, `/onboard`) use the same premium matte app surface and centered cards without changing OAuth, onboarding, billing, source freshness, or outbound email contracts.
- Production mobile auth checks, production Playwright auth state, and production smoke CTA assertions now match the public-only deploy contract.
- Production deploy truth: `https://www.foldera.ai/api/health` reports `revision.git_sha=a6fdeecd445473ce29b4b32ed61b2783898fe39d`, `git_ref=main`, `deployment_id=dpl_662ia9cV6ezkQkFTeAzVKFajP5mC`, `vercel_env=production`.
- GitHub truth for `a6fdeec` is green: commit check-runs include successful health, static verification, unit/build/e2e, deploy, and deploy-triggered CI gates; authenticated/payments/quarantine lanes were skipped by workflow scope.
- Controller truth: `npm run controller:autopilot` returns `CONTROLLER RESULT: STOP` because all remaining money-loop rungs are externally blocked by paid/model-backed proof, passive proof, quota/access, real non-owner account, or fresh external proof.
- The controller now clears stale `.foldera-contract.json` on STOP so future runs cannot execute an already-finished contract.
- Current health is non-blocking: Gmail fresh `12h ago`, Outlook fresh `12h ago`, `Mail cursors current`, and last generation `do_nothing`.
- Persisted artifact path truth: deterministic approve/skip/latest/detail/history tests pass, and past production `write_document` artifacts remain visible in history, but the current owner-day path has `0` pending approval actions and `/api/conviction/daily-value` has no slate because winner truth is `no_safe_artifact_today`.
- First broken rung for persisted-artifact work: `candidate selected/current best move -> artifact/current move`. Do not force a fake golden artifact or paid generation to bypass this; reopen only when a fresh safe candidate exists or Brandon explicitly approves a paid/model-backed proof.
- Contractless STOP preflight now allows `CURRENT_STATE.md` alongside `ACTIVE_HANDOFF.md` and `SESSION_HISTORY.md` for source-truth receipts, so valid proof-mode blockers can be committed without fabricating a controller contract.

## Verified proof

- controller stop: PASS `npm run controller:autopilot` -> `CONTROLLER RESULT: STOP`; `.foldera-contract.json` removed; no blocking dirty files.
- controller/preflight regression: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/controller-autopilot.test.ts scripts/__tests__/preflight-contract.test.ts --reporter=verbose` (`33/33`).
- build/lint: PASS `npm run build`; PASS `npm run lint`.
- health: PASS `npm run health` -> `RESULT: 0 FAILING`.
- production SHA: PASS `https://www.foldera.ai/api/health` -> `a6fdeec`, deployment `dpl_662ia9cV6ezkQkFTeAzVKFajP5mC`.
- GitHub CI/deploy: PASS check-runs on `a6fdeec` all completed with no failures.
- Previously proven frontend surface contract: build, lint, large-file split, public routes, dashboard navigation, authenticated routes, mobile visual QA, production public smoke, and proof screenshots.
- persisted-artifact focused tests: PASS `npx vitest run lib/conviction/__tests__/execute-action.test.ts app/api/conviction/execute/__tests__/route.test.ts 'app/api/conviction/actions/[id]/__tests__/route.test.ts' app/api/conviction/history/__tests__/route.test.ts app/api/conviction/daily-value/__tests__/route.test.ts app/api/conviction/latest/__tests__/free-artifact-allowance.test.ts lib/briefing/__tests__/daily-utility-slate.test.ts --reporter=verbose` (`50/50`).
- winner/autopsy: PASS `npm run winner:autopsy` -> `current_winner.verdict=no_safe_artifact_today`; action needed is to inspect blockers before forcing generation.
- live DB read-only proof: PASS latest owner actions are recent `do_nothing` no-send rows; `tkg_action_summaries` has `0` pending approvals; user-facing history still contains the May 9 skipped `write_document` artifact previews.
- daily-value state: PASS deterministic winner-truth read returns `daily_utility_slate=null` because no current Tier 1/Tier 2 candidate proved a fresh grounded discrepancy.
- contractless receipt preflight: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/preflight-contract.test.ts --reporter=verbose`.
- build: PASS `npm run build`.

## Remaining defects in current slice

- None for the frontend surface contract or controller STOP cleanup.
- Persisted artifact path is not currently product-code broken after a selected artifact exists; it is blocked before persistence because no current safe candidate/current best move exists.

## Next exact move

Start here:
1. Rerun `npm run controller:autopilot`.
2. If moving persisted-artifact work, start from `npm run winner:autopsy` and prove whether a fresh safe candidate exists before touching persistence.
3. If winner truth is still `no_safe_artifact_today` and daily-value is null, stop on the exact pre-persistence blocker instead of inserting forced golden data or reopening frontend.
4. Only reopen money-loop work when one blocker becomes actionable: explicit paid/model-proof approval and quota, next passive send window, a real connected non-owner account, or fresh repeated-directive failure evidence.

## Do not touch yet

- paid generation without explicit approval
- outbound email without explicit approval
- Stripe charge
- schema migration
- destructive DB action
- fake non-owner accounts or fabricated production data
- dashboard/app-fit or public surface polish without fresh failing proof

## Quarantined local drift

- Stashes remain for older dashboard experiments; do not apply them unless a current proof lane requires them.

## External blockers

- `BL-015`: waiting on explicit paid/model-backed owner money-shot proof.
- `BL-003` and `BL-005`: waiting on paid model quota/access before fresh approved production proof.
- `BL-006`: waiting on one real connected non-owner account.
- `BL-011`: waiting on the next natural daily-send passive proof window.
- `BL-007`: waiting on fresh repeated-directive failure evidence or monitored production brief-run proof.

## Stop condition

Stop when the controller returns `STOP` with only the external blockers above and no stale executable contract exists.
