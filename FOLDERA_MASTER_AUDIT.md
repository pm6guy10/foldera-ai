# FOLDERA MASTER AUDIT

## NEEDS_REVIEW

- 2026-03-23 — Production smoke expectation drift on authenticated `/login` and `/start`
  `npm run test:prod` failed 2 tests after the JWT onboarding-claim change set because the stored authenticated session was redirected away from `/login` and `/start`, so the suite could not find the sign-in heading or OAuth buttons. Local verification for the requested change is green (`npm run build`, `npx playwright test tests/e2e/`), but the production smoke suite needs to be updated to reflect the authenticated redirect behavior.

- 2026-03-24 — Anthropic billing exhaustion still blocks route-generated `api_usage` receipts
  Production `POST /api/cron/nightly-ops` on the March 24 hotfix deploy created owner action `504c171f-50dc-473f-afdc-cdfc53f15894` with `execution_result.generation_log.stage = "generation"` and the real `credit balance is too low` Anthropic error preserved, which confirms the generator fix. However, the nightly run still produced zero new `api_usage` rows because the Anthropic request fails before a usage payload exists. The schema/code fix itself is verified live via manual `endpoint` inserts (`be76ef5c-40af-4543-9cb3-37db0cf27d16`, `80aaeaaa-c6bb-4458-bf9e-78fe72d5fdd6`), but restoring Anthropic credits is still required for route-driven usage tracking receipts.

- 2026-03-24 — Full `npx playwright test` still fails outside the repo push gate
  The required full local Playwright command still reproduces pre-existing failures unrelated to this task: one `tests/audit/clickflow.spec.ts` timeout on `/`, plus the mixed local/prod `tests/production/smoke.spec.ts` expectations that run against `http://localhost:3000` inside the combined suite. This session did not widen scope into that test harness; baseline and post-change results matched, the repo push hook gate passed (`44 passed, 7 skipped`), and post-deploy `npm run test:prod` passed (`18 passed`).
