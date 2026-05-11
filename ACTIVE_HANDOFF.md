# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-11 13:18 PT
Last known production SHA: f387d93
Last completed commit: 6991a32
Current slice: Scheduled-check reliability hardening
Current mode: Current failures classified; workflow hardening locally proven; fresh hosted runs pending

## Current product truth

- Health is `0 FAILING`; Gmail and Outlook are fresh/current; last stored generation is still historical `do_nothing`.
- Production is live on `f387d93`.
- Current scheduled-check truth:
  - `Pipeline cron heartbeat`: current-main replacement runs are green; the old red history split into `external platform failure` (GitHub checkout 500) and `bad monitor semantics` (rolling rerun window).
  - `Production E2E`: current-main deployment-status runs are green; the old scheduled red was a real production CTA regression on commit `5186327`.
  - `Weekly Production Audit`, `Signal Backlog Drain`, `Agent — Health Watchdog`, and the other cron agent workflows are currently green.
- Remaining scheduled-class drift is environmental noise: the cron Playwright/audit lanes still used `actions/upload-artifact@v4`, which emits Node-20 deprecation warnings and will become future failure risk.

## Current slice goal

- Eliminate the remaining scheduled-class warning noise and keep the production smoke assertion tied to the real locked CTA contract instead of generic page text.

## Completed recently

- Reclassified the active scheduled failures by root bucket instead of treating old red history as current truth.
- Tightened the production smoke CTA assertion to the real visible `/start` links.
- Upgraded the scheduled artifact uploads in `Production E2E` and `Weekly Production Audit` to `actions/upload-artifact@v6`.
- Added workflow log breadcrumbs so the cron monitor tells the operator exactly what success means.

## Verified proof

- health: PASS 2026-05-11 13:17 PT; `RESULT: 0 FAILING`; warning `Last generation do_nothing`
- build: PASS `npm run build`
- focused Playwright: PASS `npx playwright test tests/production/smoke.spec.ts --config playwright.prod.config.ts --grep 'locked /start CTA copy stays "Get started free"'`
- GitHub truth: current-main `Production E2E` deployment-status runs `#1096`, `#1097`, and `#1098` are green; `Pipeline cron heartbeat` workflow-dispatch runs `#35` and `#36` are green
- Playwright/browser: production smoke public CTA proof passed against the live site
- production SHA: PASS `https://www.foldera.ai/api/health` -> build `f387d93`

## Remaining defects in current slice

1. Fresh hosted proof for the updated `Production E2E` and `Weekly Production Audit` workflow files is still pending until the new YAML runs on `main`.
2. Production deploy SHA is still `f387d93`; this seam is CI/workflow-only and does not require a Vercel redeploy to prove the hosted monitor behavior.
3. This slice does not change daily-brief generation, paid model behavior, or dashboard/product execution paths.

## Next exact move

Start here:
1. Read `ACTIVE_HANDOFF.md` before broad history.
2. Push the scheduled-check hardening seam to `main`.
3. Trigger fresh current-main `Production E2E` and `Weekly Production Audit` runs, then record whether the deprecation-noise fix stayed green.

## Do not touch yet

- paid generation
- outbound email
- Stripe charge
- schema migration
- destructive DB action
- other slices unless a fresh hosted scheduled run names them

## External blockers

- None yet. The next truth rung is hosted workflow proof on the updated YAML.

## Stop condition

Stop only when the touched scheduled workflows are green on fresh current-main runs, or when a new hosted run reveals one exact blocker.
