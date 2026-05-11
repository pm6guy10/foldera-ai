# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-11 13:33 PT
Last known production SHA: f387d93
Last completed commit: 9a3b420
Current slice: Scheduled-check reliability hardening
Current mode: Reliability-class seam shipped and fresh hosted proof complete

## Current product truth

- Health is `0 FAILING`; Gmail and Outlook are fresh/current; last stored generation is still historical `do_nothing`.
- Production is live on `f387d93`.
- Current scheduled-check truth:
  - `Pipeline cron heartbeat`: current-main replacement runs are green; the old red history split into `external platform failure` (GitHub checkout 500) and `bad monitor semantics` (rolling rerun window).
  - `Production E2E`: current-main hosted proof is green; the old scheduled red was a real production CTA regression on commit `5186327`.
  - `Weekly Production Audit`: current-main hosted proof is green.
  - `Signal Backlog Drain`, `Agent — Health Watchdog`, `Agent — Distribution Finder`, and the other cron agent workflows are currently green.
- The scheduled Playwright/audit lanes no longer emit the targeted Node-20 artifact-action deprecation warning; fresh hosted runs used `actions/upload-artifact@v6`.

## Current slice goal

- This seam is complete. Scheduled checks are now classified by real root cause, the CTA monitor proves the locked contract directly, and the touched cron workflows are green on fresh current-main runs.

## Completed recently

- Reclassified the active scheduled failures by root bucket instead of treating old red history as current truth.
- Tightened the production smoke CTA assertion to the real visible `/start` links.
- Upgraded the scheduled artifact uploads in `Production E2E` and `Weekly Production Audit` to `actions/upload-artifact@v6`.
- Added workflow log breadcrumbs so the cron monitor tells the operator exactly what success means.
- Triggered fresh current-main hosted runs for both touched workflows; both completed `success`.

## Verified proof

- health: PASS 2026-05-11 13:17 PT; `RESULT: 0 FAILING`; warning `Last generation do_nothing`
- build: PASS `npm run build`
- focused Playwright: PASS `npx playwright test tests/production/smoke.spec.ts --config playwright.prod.config.ts --grep 'locked /start CTA copy stays "Get started free"'`
- GitHub truth:
  - `Production E2E` `#1099` (`workflow_dispatch`, commit `9a3b420`) PASS: `https://github.com/pm6guy10/foldera-ai/actions/runs/25695446490`
  - `Weekly Production Audit` `#8` (`workflow_dispatch`, commit `9a3b420`) PASS: `https://github.com/pm6guy10/foldera-ai/actions/runs/25695447427`
  - New logs confirm `actions/upload-artifact@v6` was used and the targeted `Node.js 20 actions are deprecated` warning is absent in both runs
  - `Pipeline cron heartbeat` workflow-dispatch runs `#35` and `#36` remain green
- Playwright/browser: production smoke public CTA proof passed against the live site
- production SHA: PASS `https://www.foldera.ai/api/health` -> build `f387d93`

## Remaining defects in current slice

1. Old red history remains visible for `Production E2E` `#1094` and `Pipeline cron heartbeat` `#34`, but both now have fresh green current-main replacement runs and should not be treated as open failures.
2. Production deploy SHA is still `f387d93`; this seam is CI/workflow-only and does not require a Vercel redeploy to prove the hosted monitor behavior.
3. This slice does not change daily-brief generation, paid model behavior, or dashboard/product execution paths.

## Next exact move

Start here:
1. Read `ACTIVE_HANDOFF.md` before broad history.
2. Treat this scheduled-check seam as closed unless a fresh current-main cron run names a different exact blocker.
3. If a future cron lane fails, classify it first as product regression, monitor semantics, brittle assertion, platform failure, env drift, or real pipeline failure before editing code.

## Do not touch yet

- paid generation
- outbound email
- Stripe charge
- schema migration
- destructive DB action
- other slices unless a fresh hosted scheduled run names them

## External blockers

- None for this seam.

## Stop condition

Stop only when a future current-main scheduled run reveals one exact blocker, or when an explicit user seam limit stops autonomous continuation.
