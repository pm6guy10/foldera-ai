# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-12 10:07 PT
Last known production SHA: 0ea1c9a
Last completed commit: 02e7e83
Current slice: Dashboard visual CI repair follow-up
Current mode: Local proof matches the affected dashboard/UI CI lane; commit, push, and GitHub CI proof pending.

## Current product truth

- `/dashboard` keeps the full-screen authenticated app shell shipped in `0ea1c9a`: desktop fills the viewport, mobile uses the real viewport, and Today/Sources/Recent Work/Account stay in-shell.
- `app/dashboard/page.tsx` is 942 lines, below the 1000-line large-file threshold.
- The authenticated dashboard lane now sees the required surfaces: `dashboard-empty-state`, mobile and desktop `Notifications` buttons, neutral non-owner account copy, write-document support/preview behavior, and post-skip empty state.
- Mobile dashboard fit is covered in `dashboard-navigation`: the card/footer stay above the in-shell bottom nav with no fake phone wrapper or horizontal overflow.
- Current health is non-blocking: Gmail fresh `5h ago`, Outlook fresh `5h ago`, `Mail cursors current`, and last generation `do_nothing`.

## Verified proof

- build: PASS `npm run build`
- lint: PASS `npm run lint`
- large-file split: PASS `npx vitest run tests/config/__tests__/large-file-splits.test.ts --reporter=verbose`
- dashboard CI lane: PASS `npx playwright test tests/e2e/dashboard-navigation.spec.ts tests/e2e/authenticated-routes.spec.ts --reporter=list` (`57/57`)
- health: PASS `npm run health` -> `RESULT: 0 FAILING`

## Remaining defects in current slice

1. Push this dashboard visual CI repair follow-up.
2. Verify GitHub CI green on the new commit.
3. Public-nav auth awareness remains deferred and must not be mixed into this dashboard repair.

## Next exact move

Start here:
1. Commit and push the dashboard visual CI repair follow-up.
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

## Quarantined local drift

- Stashes remain for older dashboard experiments; do not apply them into this seam unless a current proof lane requires them.

## External blockers

- None for this dashboard repair; GitHub CI is the required final proof.

## Stop condition

Stop only when GitHub CI passes on the dashboard visual CI repair follow-up commit.
