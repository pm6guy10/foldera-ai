# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-13 07:22 PT
Last known production SHA: b78b2ac
Last completed code commit: b78b2ac
Current slice: CI/source-truth guard
Current mode: Root-cause fix for the `ACTIVE_HANDOFF.md` line-cap CI failure; product runtime unchanged.

## Current product truth

- Frontend surface contract A-Z is shipped on `main`; controller STOP cleanup is live in production, and the latest proven production SHA remains `b78b2ac`.
- Health is non-blocking: Gmail fresh, Outlook fresh, mail cursors current, and last generation is `do_nothing`.
- Candidate selection over-filtering is fixed; no-paid winner truth selects the WorkSourceWA account-activity deadline as Tier 1 `admin_deadline_decision_packet`.
- Controller selection is aligned to emit `GENERATED-SELECTED-MOVE-TO-PERSISTED-ARTIFACT` for the next no-paid selected-move persistence seam.
- The selected WorkSourceWA current move is still not persisted as an artifact/action/history row.
- The docs CI failure on `f075162` was caused by `ACTIVE_HANDOFF.md` growing past the 80-line cockpit cap before GitHub unit CI caught it.
- Root-cause guard: preflight now validates `ACTIVE_HANDOFF.md` markers and the `<= 80` line cap before commit/push gates can pass.

## Verified proof

- health: PASS `npm run health` -> `RESULT: 0 FAILING`.
- docs/source guard before patch: CI failed `tests/config/__tests__/docs-source-of-truth.test.ts` because `ACTIVE_HANDOFF.md` had 83 lines.
- local current handoff before patch: 77 lines after commit `74854b3`, confirming the narrow trim fixed the symptom but not the preflight gap.
- focused regression: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/preflight-contract.test.ts tests/config/__tests__/docs-source-of-truth.test.ts --reporter=verbose` (`18/18`).
- diff hygiene: PASS `git diff --check`.
- build/lint: PASS `npm run build`; PASS `npm run lint`.
- preflight: PASS `npm run preflight -- --stage=pre-commit` after clearing an ignored stale `.foldera-contract.json` from the prior selected-move seam.

## Remaining defects in current slice

- None for the local docs/source guard after focused proof.
- Commit, push, and hosted CI/deploy truth are still pending for this guard commit.

## Next exact move

1. Run `npm run preflight -- --stage=pre-commit`, `npm run build`, and the focused docs/preflight guard tests.
2. Commit and push the guard to `main`.
3. Verify remote `main` points at the pushed commit and check the hosted CI/deploy truth available for that commit.
4. After this seam is shipped, rerun `npm run controller:autopilot` and execute only `GENERATED-SELECTED-MOVE-TO-PERSISTED-ARTIFACT` if emitted.
5. Do not use `proof:golden-artifact`; do not run paid/model generation without explicit approval.

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

Stop when this guard is pushed and hosted truth is checked, or when a concrete delivery blocker prevents push/verification.
