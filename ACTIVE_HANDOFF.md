# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-11 14:49 PT
Last known production SHA: f387d93
Last completed commit: 87c0999
Current slice: Controller generated-contract closure rule
Current mode: Closure seam proven; next generated seam identified

## Current product truth

- Health is `0 FAILING`; Gmail and Outlook are fresh/current; last stored generation is still historical `do_nothing`.
- Production is still live on `f387d93`; this seam is controller/runtime-only and does not require a deploy.
- `GENERATED-CANDIDATE-SELECTION-CONVERGENCE` no longer re-emits after closure. A clean-tree `npm run controller:autopilot` now selects `GENERATED-USEFUL-CURRENT-MOVE-DAILY-VALUE`.
- Generated contracts now carry closure metadata: `source_truth_file`, `source_truth_finding`, and `required_closure_update`.
- Generated contracts now automatically allow the exact source-truth file they need for closure, and preflight rejects generated contracts that cannot close themselves.
- `SESSION_HISTORY.md` remains append-only unless a generated contract explicitly requires a history correction.

## Verified proof

- focused controller/preflight tests: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/controller-autopilot.test.ts scripts/__tests__/preflight-contract.test.ts --reporter=verbose` (`26/26`)
- controller clean-tree rerun: PASS `npm run controller:autopilot` -> `GENERATED-USEFUL-CURRENT-MOVE-DAILY-VALUE`; no repeat of `GENERATED-CANDIDATE-SELECTION-CONVERGENCE`
- health: PASS 2026-05-11 14:44 PT; `RESULT: 0 FAILING`; warning `Last generation do_nothing`
- build: PASS `npm run build`

## Remaining defects in current slice

1. This seam changes controller/runtime closure behavior only; it does not execute the new `GENERATED-USEFUL-CURRENT-MOVE-DAILY-VALUE` contract.
2. Paid/external waiting items remain honest blockers: BL-015/003/005 need paid or quota proof, BL-006 needs a real non-owner account, and BL-011 still needs passive next-window proof.
3. This slice does not change paid generation, outbound email, Stripe, schema, or destructive DB behavior.

## Next exact move

Start here:
1. Read `ACTIVE_HANDOFF.md`.
2. Run `npm run controller:autopilot`.
3. Execute only `GENERATED-USEFUL-CURRENT-MOVE-DAILY-VALUE`.

## Do not touch yet

- paid generation
- outbound email
- Stripe charge
- schema migration
- destructive DB action
- any seam outside the generated current-best-move contract

## External blockers

- None for this controller seam.

## Stop condition

Stop only when the clean-tree controller can prove every money-loop rung is production-proven or externally blocked, or when an explicit user seam limit stops autonomous continuation.
