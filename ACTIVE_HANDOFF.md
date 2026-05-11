# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-11 14:29 PT
Last known production SHA: f387d93
Last completed commit: pending current convergence seam push
Current slice: Candidate-selection convergence email-alias matching
Current mode: Generated convergence seam locally proven and awaiting push + controller rerun

## Current product truth

- Health is `0 FAILING`; Gmail and Outlook are fresh/current; last stored generation is still historical `do_nothing`.
- Production is still live on `f387d93`; this seam is controller/runtime-only and does not require a deploy.
- `npm run controller:autopilot` still selects `GENERATED-CANDIDATE-SELECTION-CONVERGENCE`.
- Current convergence truth:
  - `extractConvergence` now treats exact known-entity email hits as valid evidence even when calendar and drive signal bodies do not include the full person name.
  - The red regression covers the real failing shape: a three-bucket entity where email has the full name but calendar/drive only carry the known email alias.
  - `npm run winner:autopsy` remains grounded after the fix: current winner still reports `no_safe_artifact_today`, `action_needed: []`, and no graph drift.

## Current slice goal

- This seam is locally complete. Candidate-selection convergence no longer under-matches when calendar/drive signals only carry a known entity email alias instead of the full name.

## Completed recently

- Added a deterministic convergence regression where the entity is known by full-name email plus calendar/drive email alias only.
- Narrowed the convergence matcher so exact known entity emails count toward cross-source convergence buckets.
- Reproved that the no-paid live truth path stays grounded after the fix with fresh `winner:autopsy`.

## Verified proof

- focused regression: PASS `node node_modules/vitest/vitest.mjs run lib/briefing/__tests__/discrepancy-detector.test.ts --reporter=verbose` (`110/110`)
- product/prod-like proof: PASS `npm run winner:autopsy` after the fix; current winner remains grounded (`no_safe_artifact_today`, `weak_risk`, no graph drift, no action_needed)
- health: PASS 2026-05-11 14:25 PT; `RESULT: 0 FAILING`; warning `Last generation do_nothing`
- build: PASS `npm run build`

## Remaining defects in current slice

1. This seam is not pushed yet in the current receipt; the next exact move is commit, push, and rerun controller from a clean tree.
2. Paid/external waiting items remain honest blockers: BL-015/003/005 need paid or quota proof, BL-006 needs a real non-owner account, and BL-011 still needs passive next-window proof.
3. This slice does not change paid generation, outbound email, dashboard rendering, connector sync, or production deploy state.

## Next exact move

Start here:
1. Read `ACTIVE_HANDOFF.md` before broad history.
2. Push the convergence seam.
3. Rerun `npm run controller:autopilot` from a clean tree and execute only the next generated or backlog-selected contract it emits.

## Do not touch yet

- paid generation
- outbound email
- Stripe charge
- schema migration
- destructive DB action
- other slices unless the clean-tree controller output replaces the current one

## External blockers

- None for this seam.

## Stop condition

Stop only when the clean-tree controller can prove every money-loop rung is production-proven or externally blocked, or when an explicit user seam limit stops autonomous continuation.
