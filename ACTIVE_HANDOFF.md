# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-11 19:56 PT
Last known production SHA: f387d93
Last completed commit: 49eaa6e
Current slice: Generated source-freshness contract triage
Current mode: Source-freshness path reproven clean; generated contract is invalid

## Current product truth

- Useful-current-move fallback seam is complete and pushed in `49eaa6e`.
- Focused route/slate/model proof passed for the daily-value path.
- Dashboard current-best-move Playwright proof passed.
- Source-freshness proof is already green without new edits: focused connector-health Vitest, settings stale-vs-fresh Playwright, `npm run health`, and `npm run build` all pass on the current tree.
- Current health truth is fresh, not degraded: Gmail fresh `14h ago`, Outlook fresh `14h ago`, and `Mail cursors current`.
- `GENERATED-SOURCE-FRESHNESS-CONNECTOR-HEALTH` does not map to a live current finding in `ACTIVE_HANDOFF.md` or health output, so this seam is not actionable now.

## Verified proof

- route/slate/model: PASS `node node_modules/vitest/vitest.mjs run app/api/conviction/daily-value/__tests__/route.test.ts lib/briefing/__tests__/daily-utility-slate.test.ts tests/config/__tests__/dashboard-inbox-model.test.ts --reporter=verbose`
- dashboard current best move: PASS `node node_modules/@playwright/test/cli.js test tests/e2e/dashboard-navigation.spec.ts --grep "current best move" --reporter=list`
- health after seam: PASS `npm run health` -> `RESULT: 0 FAILING`
- build after seam: PASS `npm run build`
- source freshness seam suite: PASS `node node_modules/vitest/vitest.mjs run lib/integrations/__tests__/connector-health.test.ts app/api/integrations/status/__tests__/route.test.ts app/api/settings/run-brief/__tests__/route.test.ts scripts/__tests__/health-connectors.test.ts --reporter=verbose`
- source freshness browser proof: PASS `npx playwright test tests/e2e/authenticated-routes.spec.ts --grep "shows stale Google clearly while Microsoft stays fresh" --reporter=list`

## Remaining defects in current slice

1. `GENERATED-SOURCE-FRESHNESS-CONNECTOR-HEALTH` is an invalid generated contract, because current source truth is already fresh and the contract's triggering finding is absent.
2. The next blocker is controller selection truth, not connector freshness behavior.

## Next exact move

Start here:
1. Do not resume `GENERATED-SOURCE-FRESHNESS-CONNECTOR-HEALTH`.
2. Fix controller/autopilot seam selection so generated contracts only target a live current source-truth finding.

## Do not touch yet

- paid generation
- outbound email
- Stripe charge
- schema migration
- destructive DB action
- unrelated public homepage files

## External blockers

- None for the source-freshness product path; this stop is a controller-contract blocker.

## Stop condition

Stop on `invalid contract` for `GENERATED-SOURCE-FRESHNESS-CONNECTOR-HEALTH` until controller selection truth is repaired.
