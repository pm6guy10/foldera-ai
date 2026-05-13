# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-13 08:25 PT
Last known production SHA: 8c2f114
Last completed code commit: 8c2f114
Current slice: CI Node 24 action-runtime hardening
Current mode: Updating CI action majors only; product runtime unchanged.

## Current product truth

- Frontend surface contract A-Z is shipped on `main`; controller STOP cleanup is live in production.
- Health is non-blocking: Gmail fresh, Outlook fresh, mail cursors current, and last generation is `do_nothing`.
- Candidate selection over-filtering is fixed; no-paid winner truth selects the WorkSourceWA account-activity deadline as Tier 1 `admin_deadline_decision_packet`.
- Controller selection is aligned to emit `GENERATED-SELECTED-MOVE-TO-PERSISTED-ARTIFACT` for the next no-paid selected-move persistence seam.
- The selected WorkSourceWA current move now has a deterministic no-paid document artifact path and a selected-winner generate mode that persists a real `pending_approval` action shape.
- The docs CI failure on `f075162` was caused by `ACTIVE_HANDOFF.md` growing past the 80-line cockpit cap before GitHub unit CI caught it.
- Root-cause guard is shipped: preflight now validates `ACTIVE_HANDOFF.md` markers and the `<= 80` line cap before commit/push gates can pass.
- CI warning class found on historical `#994`: `changes` uses `dorny/paths-filter@v3` and CI artifact handoffs use Node-20-runtime artifact actions.

## Verified proof

- health: PASS `npm run health` -> `RESULT: 0 FAILING`.
- docs/source guard before patch: CI failed `tests/config/__tests__/docs-source-of-truth.test.ts` because `ACTIVE_HANDOFF.md` had 83 lines.
- local current handoff before patch: 77 lines after commit `74854b3`, confirming the narrow trim fixed the symptom but not the preflight gap.
- focused regression: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/preflight-contract.test.ts tests/config/__tests__/docs-source-of-truth.test.ts --reporter=verbose` (`18/18`).
- diff hygiene: PASS `git diff --check`.
- build/lint: PASS `npm run build`; PASS `npm run lint`.
- preflight: PASS `npm run preflight -- --stage=pre-commit` after clearing an ignored stale `.foldera-contract.json` from the prior selected-move seam.
- push/remote: PASS `git push origin main`; `origin/main` -> `d569129751ad54fdec44ecc47c0e41edbbd35c8b`.
- hosted truth: PASS GitHub CI, docs-fast CI, Health Gate, Semgrep, Deploy to Vercel, and Production E2E for `d569129`.
- production SHA: PASS `https://www.foldera.ai/api/health` -> `8c2f114`, deployment `dpl_6kQQEHVidSABAX7NNpUF32Gh8cNo`.
- selected-move persistence regression: PASS `node node_modules/vitest/vitest.mjs run lib/conviction/__tests__/artifact-generator.test.ts lib/conviction/__tests__/artifact-generator-contract.test.ts app/api/conviction/latest/__tests__/free-artifact-allowance.test.ts app/api/conviction/history/__tests__/route.test.ts app/api/conviction/daily-value/__tests__/route.test.ts app/api/conviction/latest/__tests__/selected-move-generate.test.ts --reporter=verbose` (`41/41`).
- winner/autopsy: PASS `npm run winner:autopsy` -> selected WorkSourceWA Tier 1 `admin_deadline_decision_packet`.
- current build/health: PASS `npm run health` -> `RESULT: 0 FAILING`; PASS `npm run build`.
- CI action-runtime local proof: PASS `ci.yml` YAML parse; PASS docs source-of-truth test; `ACTIVE_HANDOFF.md` is under 80 lines.

## Remaining defects in current slice

- None for the docs/source guard.
- CI Node 20 action warning is not a red check today, but must be removed before GitHub forces Node 24 action runtime defaults.

## Next exact move

1. Run preflight/build, commit, and push the CI action-runtime bump.
2. Verify `changes`, `build`, `unit`, artifact handoff e2e lanes, deploy, and production `/api/health` SHA for the pushed commit.
3. Do not use `proof:golden-artifact`; do not run paid/model generation without explicit approval.
4. After deploy proof, rerun controller and continue only if it emits a fresh no-paid contract.

## Do not touch yet

- paid generation without explicit approval
- outbound email without explicit approval
- Stripe charge
- schema migration or destructive DB action
- fake non-owner accounts or fabricated production data
- dashboard/app-fit or public surface polish without fresh failing proof

## External blockers

- `BL-015`: waiting on explicit paid/model-backed owner money-shot proof.
- `BL-003` and `BL-005`: waiting on paid model quota/access before fresh approved production proof.
- `BL-006`: waiting on one real connected non-owner account.
- `BL-011`: waiting on the next natural daily-send passive proof window.
- `BL-007`: waiting on fresh repeated-directive failure evidence or monitored production brief-run proof.

## Stop condition

Stop when the controller returns `STOP` with only external blockers, or when the selected-move persistence seam is proven or exactly blocked.
