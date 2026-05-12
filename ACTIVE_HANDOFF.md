# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-12 09:10 PT
Last known production SHA: 0ea1c9a
Last completed commit: 0ea1c9a
Current slice: Dashboard CI repair for visual acceptance seam
Current mode: Local proof now matches the affected CI dashboard/UI lane; commit/push and GitHub CI proof pending

## Current product truth

- `/dashboard` keeps the full-screen authenticated app shell shipped in `0ea1c9a`: desktop fills the viewport, mobile uses the real viewport, and Today/Sources/Recent Work/Account stay in-shell.
- The dashboard route is back under the large-file split threshold: `app/dashboard/page.tsx` is below 1000 counted lines.
- Authenticated dashboard surfaces required by CI are restored: `dashboard-empty-state`, mobile and desktop notification affordances, neutral non-owner account copy, write-document support text, and post-skip empty-state behavior.
- The old fake dashboard stats/search copy remains intentionally absent from the new shell; authenticated tests now assert that absence while preserving document preview/support behavior.
- Current health is non-blocking: Gmail fresh `4h ago`, Outlook fresh `4h ago`, `Mail cursors current`, and last generation `do_nothing`.

## Verified proof

- health: PASS `npm run health` -> `RESULT: 0 FAILING`
- build: PASS `npm run build`
- lint: PASS `npm run lint`
- large-file split: PASS `npx vitest run tests/config/__tests__/large-file-splits.test.ts --reporter=verbose`
- dashboard CI lane: PASS `npx playwright test tests/e2e/dashboard-navigation.spec.ts tests/e2e/authenticated-routes.spec.ts --reporter=list` (`57/57`)

## Remaining defects in current slice

1. GitHub CI proof is still pending until this repair commit is pushed and the run completes green.
2. Public-nav auth awareness remains deferred and must not be mixed into this dashboard CI repair.

## Next exact move

Start here:
1. Commit and push the dashboard CI repair.
2. Verify GitHub CI green on the new commit.
3. After CI is green, resume customer-visible product seams; next priority remains persisted artifact path unless production deployment proof is explicitly selected.

## Do not touch yet

- controller/meta seams unless execution hard-fails
- public nav/auth surfaces
- backend/API
- paid generation
- outbound email
- Stripe charge
- schema migration
- destructive DB action

## External blockers

- None for this CI repair; GitHub CI is the required final proof.

## Stop condition

Stop only when GitHub CI passes on the dashboard CI repair commit.