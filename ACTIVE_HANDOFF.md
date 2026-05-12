# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-12 07:23 PT
Last known production SHA: f387d93
Last completed commit: a40f355
Current slice: Dashboard visual acceptance
Current mode: `/dashboard` is locally proven as the real app shell; public-nav auth proof is intentionally deferred

## Current product truth

- `/dashboard` now renders as the actual post-login app surface instead of a centered mock frame: full viewport, stable left rail, dominant center artifact, and aligned right support rail.
- Mobile `/dashboard` now uses the real viewport with no fake phone shell or status bar; the bottom nav swaps Today, Sources, Recent Work, and Account in-shell.
- The center stage no longer falls back to a dead loading box. Loading uses a Daily Brief skeleton, daily-value still renders the existing slate card, connected-but-idle renders a standing-by brief, and disconnected/stale inputs render a `WAITING FOR SOURCES` brief.
- Public-nav auth awareness is intentionally not part of this seam. `NavPublic.tsx` remains deferred until `/` hydration and root static-asset serving are proven.
- Current health remains non-blocking: Gmail fresh `2h ago`, Outlook fresh `2h ago`, `Mail cursors current`, and last generation `do_nothing`.

## Verified proof

- health: PASS `npm run health` -> `RESULT: 0 FAILING`
- build: PASS `npm run build`
- lint: PASS `npm run lint`
- dashboard UI proof: PASS `npx playwright test tests/e2e/dashboard-navigation.spec.ts --reporter=list` (`19/19`)
- fresh screenshots: PASS `artifacts/verification/dashboard-contract-desktop-fresh.png` and `artifacts/verification/dashboard-contract-mobile-fresh.png`

## Remaining defects in current slice

1. Public-nav auth proof is still unproven. Do not mix `NavPublic.tsx` into this seam until `/` serves its static assets correctly, hydration works, and logged-in/logged-out nav behavior is browser-proven.
2. This slice does not change source freshness, paid generation, outbound email, Stripe, schema, or controller selection.

## Next exact move

Start here:
1. Push the dashboard visual acceptance seam after the final preflight/build guard clears.
2. Next customer-visible seam: persisted artifact path, unless deployment proof for this dashboard seam is selected first.

## Do not touch yet

- `components/nav/NavPublic.tsx`
- public route tests
- controller/meta seams unless execution hard-fails
- paid generation
- outbound email
- Stripe charge
- schema migration
- destructive DB action
- unrelated public homepage files

## External blockers

- `/` root-route hydration and static-asset serving are not yet proven, so auth-aware public nav remains a separate unproven seam.

## Stop condition

Stop after the dashboard shell seam is committed and pushed cleanly without reintroducing unproven public-nav work.
