# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-12 09:30 PT
Last known production SHA: 0ea1c9a
Last completed commit: d654c64
Current slice: Dashboard/UI CI-parity proof rule
Current mode: Dashboard repair is pushed; permanent proof ladder is being encoded so local proof must match CI.

## Current product truth

- `/dashboard` keeps the full-screen authenticated app shell shipped in `0ea1c9a`: desktop fills the viewport, mobile uses the real viewport, and Today/Sources/Recent Work/Account stay in-shell.
- Dashboard CI repair commit `d654c64` is pushed and restores the authenticated surfaces required by CI: `dashboard-empty-state`, notification affordances, neutral non-owner account copy, write-document support text, and post-skip empty-state behavior.
- Local proof for `d654c64` matched the affected dashboard/UI CI lane: build, lint, large-file-splits, dashboard-navigation, and authenticated-routes passed.
- GitHub API truth for `d654c64` showed `CI`, `Health Gate`, `Production E2E`, `Deploy to Vercel`, and `semgrep` green; one duplicate `CI`-named run was still in progress when the doctrine fix started.
- New permanent rule: for every seam, proof must include the affected CI lane. Local proof that skips the CI lane is not proof.
- For dashboard/UI work, the permanent local gate is `npm run build`, `npm run lint`, `large-file-splits`, `dashboard-navigation`, and `authenticated-routes`.
- Current health is non-blocking: Gmail fresh `4h ago`, Outlook fresh `4h ago`, `Mail cursors current`, and last generation `do_nothing`.

## Verified proof

- health: PASS `npm run health` -> `RESULT: 0 FAILING`
- build: PASS `npm run build`
- lint: PASS `npm run lint`
- doctrine guard: PASS `npx vitest run scripts/__tests__/brandon-doctrine.test.ts tests/config/__tests__/docs-source-of-truth.test.ts --reporter=verbose`
- dashboard CI lane already proved for `d654c64`: PASS `npx playwright test tests/e2e/dashboard-navigation.spec.ts tests/e2e/authenticated-routes.spec.ts --reporter=list` (`57/57`)

## Remaining defects in current slice

1. Push the CI-parity doctrine guard and verify GitHub CI green on the new head.
2. Public-nav auth awareness remains deferred and must not be mixed into dashboard/UI proof-rule work.

## Next exact move

Start here:
1. Commit and push the dashboard/UI CI-parity proof rule.
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

- Stash `quarantine-dashboard-current-brief-mobile-css` preserves an uncommitted mobile current-brief stylesheet tweak that is outside this doctrine slice.

## External blockers

- None for this doctrine repair; GitHub CI is the required final proof.

## Stop condition

Stop only when GitHub CI passes on the dashboard/UI CI-parity proof-rule commit.
