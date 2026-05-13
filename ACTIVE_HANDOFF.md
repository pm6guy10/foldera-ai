# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-13 10:12 PT
Last known production SHA: 1242f47
Last completed code commit: 1242f47
Current slice: Selected WorkSourceWA move latest visibility
Current mode: Generated contract `GENERATED-SELECTED-MOVE-TO-PERSISTED-ARTIFACT`; no paid generation, outbound email, Stripe, schema, or destructive DB action.

## Current product truth

- Health is non-blocking: Gmail fresh, Outlook fresh, mail cursors current, and last generation is `write_document`.
- Controller selection is aligned to emit live generated contracts from current source truth.
- Production has selected-move artifact `8aca653a-f0a1-46e9-9af4-323c5cee539b` as `pending_approval` `write_document`, title `WorkSourceWA account activity closeout`, `brief_origin=selected_move_generate`.
- History readback shows the row, but production `/api/conviction/latest` hid it because the selected-move artifact has confidence `45`, below the normal send-confidence ranking threshold.
- Current code patch allows `brief_origin=selected_move_generate` rows through the first latest ranking gate while preserving the existing artifact/discrepancy validation before display.
- `winner:autopsy` now reports no fresh safe artifact today because the selected WorkSourceWA move already persisted and repeat generation is blocked; the active seam is latest/history readback of row `8aca653a...`, not another generation.

## Verified proof

- controller latest-readback selector shipped: commit `1242f478d9fe58b8bff4f800625a721062d217b5` pushed to `main`; push gate build and public smoke passed.
- selected-move persistence receipt shipped: commit `88db21b` pushed to `main`; production DB row `8aca653a...` exists as pending approval.
- health: PASS `npm run health` -> `RESULT: 0 FAILING`, last generation `write_document`.
- selected latest regression: PASS `node node_modules/vitest/vitest.mjs run app/api/conviction/latest/__tests__/free-artifact-allowance.test.ts app/api/conviction/history/__tests__/route.test.ts app/api/conviction/daily-value/__tests__/route.test.ts lib/conviction/__tests__/artifact-generator.test.ts lib/conviction/__tests__/artifact-generator-contract.test.ts --reporter=verbose` (`41/41`).
- current build/lint: PASS `npm run build`; PASS `npm run lint`.

## Remaining defects in current slice

- Need preflight, commit/push, deploy proof, and authenticated production `/api/conviction/latest` readback for row `8aca653a...`.

## Next exact move

1. Run health, build, lint, docs/source-truth guard, and preflight.
2. Commit/push the latest visibility patch and receipt docs.
3. Verify production SHA and authenticated `/api/conviction/latest` returns row `8aca653a...`.
4. Rerun `npm run controller:autopilot` from clean `main`.

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

Stop when selected-move latest readback is production-proven and the controller returns `STOP` with only external blockers, or when an exact blocker is proven.
