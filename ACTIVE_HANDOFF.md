# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-26 PT
Current `origin/main` SHA at update time: `5a59765`.

## Current slice:

Launch readiness recovery chain.

Immediate active seam: repair issue #67 / PR #68 on branch `codex/issue-67-free-plan-gate`.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

## Current truth

- Issue #48 remains the product contract: Workday Presence Layer, not dashboard triage.
- PR #71 landing storyboard is merged; this does not change issue #67 backend scope.
- Issue #67 / PR #68 remains the immediate backend/cost-control seam.
- PR #68 must be repaired in-place; do not create a new PR for this seam.

## Enforcement mechanism

- `npm run gate:free-plan` must fail on `access_token` / `refresh_token` selects outside auth/OAuth/sync/provider execution paths.
- For PR #68: focused failing Vitest test + `npm run gate:free-plan` + `npm run lint` + `npm run build` must pass.
- Scope stays limited to issue #67 token-safety/free-plan egress seam.

## Forbidden unless explicitly assigned

- Landing-page redesign work.
- Dashboard UX work.
- Stripe/billing changes.
- Scoring/conviction changes.
- Workday Presence copy changes.
- Unrelated schema/integration work.

## Next exact move

Repair existing PR #68 on `codex/issue-67-free-plan-gate` by fixing only the failing unit/Vitest path, rerun required proofs, push, and confirm GitHub CI is green with PR mergeable.

## Proof required

- Focused failing Vitest test PASS.
- `npm run gate:free-plan` PASS.
- `npm run lint` PASS.
- `npm run build` PASS.
- GitHub CI green.
- PR #68 mergeable.

## Stop condition

Stop when PR #68 is green and mergeable. Do not merge in this run.
