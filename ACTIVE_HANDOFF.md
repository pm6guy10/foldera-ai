# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-12 15:45 PT
Last known production SHA: f0c1b15
Last completed commit: f0c1b15
Current slice: Controller stop-state cleanup
Current mode: Controller STOP is valid; no executable contract remains on disk.

## Current product truth

- Frontend surface contract A-Z is shipped on `main` and live in production at `f0c1b15`.
- Public landing nav is server-auth-aware: logged-out `/` shows `Sign in` + `Start free`; logged-in `/` shows `Dashboard` instead of `Sign in`, without adding a client `/api/auth/session` poll.
- Legacy app surfaces that use `ProductShell` share the matte Foldera app background, wider app-width shell, cyan-edged header card, and mobile dashboard-section rail.
- Auth/onboarding surfaces (`/login`, `/start`, `/onboard`) use the same premium matte app surface and centered cards without changing OAuth, onboarding, billing, source freshness, or outbound email contracts.
- Production mobile auth checks, production Playwright auth state, and production smoke CTA assertions now match the public-only deploy contract.
- Production deploy truth: `https://www.foldera.ai/api/health` reports `revision.git_sha=f0c1b15a4b08c89f8835579c58fc677d8cfe65d6`, `git_ref=main`, `deployment_id=dpl_7vFTKqtZfEkA6QG2ri5JRYs3dpdQ`, `vercel_env=production`.
- GitHub truth for `f0c1b15` is green: commit check-runs include successful CI lanes, `Deploy to Vercel` success, and `Production E2E` success.
- Controller truth: `npm run controller:autopilot` returns `CONTROLLER RESULT: STOP` because all remaining money-loop rungs are externally blocked by paid/model-backed proof, passive proof, quota/access, real non-owner account, or fresh external proof.
- The controller now clears stale `.foldera-contract.json` on STOP so future runs cannot execute an already-finished contract.
- Current health is non-blocking: Gmail fresh `10h ago`, Outlook fresh `10h ago`, `Mail cursors current`, and last generation `do_nothing`.

## Verified proof

- controller stop: PASS `npm run controller:autopilot` -> `CONTROLLER RESULT: STOP`; `.foldera-contract.json` removed; no blocking dirty files.
- controller/preflight regression: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/controller-autopilot.test.ts scripts/__tests__/preflight-contract.test.ts --reporter=verbose` (`32/32`).
- build/lint: PASS `npm run build`; PASS `npm run lint`.
- health: PASS `npm run health` -> `RESULT: 0 FAILING`.
- production SHA: PASS `https://www.foldera.ai/api/health` -> `f0c1b15`, deployment `dpl_7vFTKqtZfEkA6QG2ri5JRYs3dpdQ`.
- GitHub CI/deploy: PASS check-runs on `f0c1b15` include successful CI, successful `Deploy to Vercel`, and successful `Production E2E`.
- Previously proven frontend surface contract: build, lint, large-file split, public routes, dashboard navigation, authenticated routes, mobile visual QA, production public smoke, and proof screenshots.

## Remaining defects in current slice

- None for the frontend surface contract or controller STOP cleanup.

## Next exact move

Start here:
1. Rerun `npm run controller:autopilot`.
2. If it still stops, accept the exact external blockers below and do not invent a local seam.
3. Only reopen money-loop work when one blocker becomes actionable: explicit paid/model-proof approval and quota, next passive send window, a real connected non-owner account, or fresh repeated-directive failure evidence.

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
