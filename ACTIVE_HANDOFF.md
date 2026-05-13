# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-13 10:19 PT
Last known production SHA: bd480af
Last completed code commit: bd480af
Current slice: Selected WorkSourceWA latest readback proven
Current mode: Controller should now stop unless it finds a fresh no-paid contract.

## Current product truth

- Health is non-blocking: Gmail fresh, Outlook fresh, mail cursors current, and last generation is `write_document`.
- Controller selection is aligned to emit live generated contracts from current source truth.
- Production has selected-move artifact `8aca653a-f0a1-46e9-9af4-323c5cee539b` as `pending_approval` `write_document`, title `WorkSourceWA account activity closeout`, `brief_origin=selected_move_generate`.
- History and latest now both read back row `8aca653a...`; latest returns `strict_artifact_selected`, confidence `45`, `brief_origin=selected_move_generate`, and detail URL `/api/conviction/actions/8aca653a-f0a1-46e9-9af4-323c5cee539b`.
- Latest allows `brief_origin=selected_move_generate` rows through the first ranking gate while preserving the existing artifact/discrepancy validation before display.
- `winner:autopsy` now reports no fresh safe artifact today because the selected WorkSourceWA move already persisted and repeat generation is blocked; the active seam is latest/history readback of row `8aca653a...`, not another generation.

## Verified proof

- controller latest-readback selector shipped: commit `1242f478d9fe58b8bff4f800625a721062d217b5` pushed to `main`; push gate build and public smoke passed.
- selected-move persistence receipt shipped: commit `88db21b` pushed to `main`; production DB row `8aca653a...` exists as pending approval.
- health: PASS `npm run health` -> `RESULT: 0 FAILING`, last generation `write_document`.
- selected latest regression: PASS `node node_modules/vitest/vitest.mjs run app/api/conviction/latest/__tests__/free-artifact-allowance.test.ts app/api/conviction/history/__tests__/route.test.ts app/api/conviction/daily-value/__tests__/route.test.ts lib/conviction/__tests__/artifact-generator.test.ts lib/conviction/__tests__/artifact-generator-contract.test.ts --reporter=verbose` (`41/41`).
- current build/lint: PASS `npm run build`; PASS `npm run lint`.
- production deploy truth: PASS Vercel deployment `dpl_5BTucyL2ouGVVUTDiRaHJLCk3a85` is READY for `bd480af53cd174d979579ff05fd57a7a013c31a4`.
- production SHA: PASS `https://www.foldera.ai/api/health` -> `bd480af53cd174d979579ff05fd57a7a013c31a4`.
- authenticated readback: PASS production `/api/conviction/latest` returned row `8aca653a...`; `/api/conviction/history?limit=5` also returns the same row first with artifact preview.

## Remaining defects in current slice

- None for selected-move latest/history readback.

## Next exact move

1. Commit/push this closure receipt.
2. Rerun `npm run controller:autopilot` from clean `main`.
3. Continue only if it emits a fresh no-paid contract; otherwise stop on the verified external blockers.

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

Stop when the controller returns `STOP` with only external blockers, or when a fresh exact blocker is proven.
