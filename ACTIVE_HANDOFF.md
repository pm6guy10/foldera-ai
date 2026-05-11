# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-11 12:59 PT
Last known production SHA: f387d93
Last completed commit: 4dafbb3
Current slice: Pipeline cron heartbeat same-day UTC service window
Current mode: CI reliability seam shipped and hosted-proof complete

## Current product truth

- Health is `0 FAILING`; Gmail and Outlook are fresh/current; last stored generation is still historical `do_nothing`.
- Production is live on `f387d93`.
- GitHub `Pipeline cron heartbeat` run `#34` attempt `2` remains the old failing rerun on commit `5186327`, and its root cause was the old rolling last-3-hour query window.
- The heartbeat script now checks today's UTC service window from the expected daily-brief lower bound (`11:00 UTC` by default, env-configurable) through `now`, so late reruns still validate the same daily send without counting yesterday's success.
- Fresh hosted proof is complete: GitHub `Pipeline cron heartbeat` run `#35` (`workflow_dispatch`) passed on `main` commit `4dafbb3`.

## Current slice goal

- This seam is complete. The heartbeat now uses the strict same-day UTC window and hosted proof is green.

## Completed recently

- Added a focused heartbeat-window regression test.
- Hardened `scripts/pipeline-cron-heartbeat-check.ts` so the query checks today's expected UTC post-cron window instead of a rolling last-3-hours window.
- Removed import-time execution from the heartbeat helper so tests do not trigger live queries on module load.
- Triggered GitHub `Pipeline cron heartbeat` run `#35` on `main`; it completed `success`.

## Verified proof

- health: PASS 2026-05-11 12:49 PT; `RESULT: 0 FAILING`; warning `Last generation do_nothing`
- build: PASS `npm run build`
- focused tests: PASS `npx vitest run scripts/__tests__/pipeline-cron-heartbeat-check.test.ts --reporter=verbose` (`4/4`)
- prod-like heartbeat proof: PASS `GITHUB_EVENT_NAME=schedule`, `GITHUB_RUN_ATTEMPT=2`, `npm run check:pipeline-heartbeat` -> `Checking daily_brief cron_complete window: 2026-05-11T11:00:00.000Z -> ... UTC` and `OK: daily_brief cron_complete count=1 in UTC window ...`
- GitHub truth: hosted proof PASS `Pipeline cron heartbeat` run `#35`, `workflow_dispatch`, `head_sha=4dafbb3...`, `conclusion=success`, URL `https://github.com/pm6guy10/foldera-ai/actions/runs/25693902390`
- Playwright/browser: not applicable; no app route behavior changed
- production SHA: PASS `https://www.foldera.ai/api/health` -> build `f387d93`

## Remaining defects in current slice

1. The old failed rerun on `5186327` remains in GitHub history, but the replacement hosted run on `main` is green.
2. Production deploy SHA is still `f387d93`; this seam is CI/workflow-only and does not require a Vercel redeploy to prove the hosted heartbeat behavior.
3. This slice does not change daily-brief generation, paid model behavior, or dashboard/product execution paths.

## Next exact move

Start here:
1. Read `ACTIVE_HANDOFF.md` before broad history.
2. Treat the heartbeat seam as closed unless a fresh GitHub failure names a different exact blocker.
3. Select the next real seam instead of re-diagnosing this one.

## Do not touch yet

- paid generation
- outbound email
- Stripe charge
- schema migration
- destructive DB action
- other slices unless a new failing proof names them

## External blockers

- None for this seam.

## Stop condition

Stop only when the next failing proof identifies a different seam, or when an explicit user seam limit stops autonomous continuation.
