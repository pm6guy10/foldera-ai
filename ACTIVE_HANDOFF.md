# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-11 12:53 PT
Last known production SHA: f387d93
Last completed commit: f387d93
Current slice: Pipeline cron heartbeat same-day UTC service window
Current mode: CI reliability seam with real production-data proof; fresh GitHub run still pending

## Current product truth

- Health is `0 FAILING`; Gmail and Outlook are fresh/current; last stored generation is still historical `do_nothing`.
- Production is live on `f387d93`.
- GitHub `Pipeline cron heartbeat` run `#34` attempt `2` is still the old failing rerun on commit `5186327`, and it failed because the script checked a rolling last-3-hour window from rerun time.
- The heartbeat script now checks today's UTC service window from the expected daily-brief lower bound (`11:00 UTC` by default, env-configurable) through `now`, so late reruns still validate the same daily send without counting yesterday's success.

## Current slice goal

- Keep `Pipeline cron heartbeat` from false-failing on reruns/manual dispatch while staying strict about today's expected daily-brief completion window.

## Completed recently

- Added a focused heartbeat-window regression test.
- Hardened `scripts/pipeline-cron-heartbeat-check.ts` so the query checks today's expected UTC post-cron window instead of a rolling last-3-hours window.
- Removed import-time execution from the heartbeat helper so tests do not trigger live queries on module load.

## Verified proof

- health: PASS 2026-05-11 12:49 PT; `RESULT: 0 FAILING`; warning `Last generation do_nothing`
- build: PASS `npm run build`
- focused tests: PASS `npx vitest run scripts/__tests__/pipeline-cron-heartbeat-check.test.ts --reporter=verbose` (`4/4`)
- prod-like heartbeat proof: PASS `GITHUB_EVENT_NAME=schedule`, `GITHUB_RUN_ATTEMPT=2`, `npm run check:pipeline-heartbeat` -> `Checking daily_brief cron_complete window: 2026-05-11T11:00:00.000Z -> ... UTC` and `OK: daily_brief cron_complete count=1 in UTC window ...`
- GitHub truth: public Actions API shows latest heartbeat failure is run `#34` attempt `2`, `conclusion=failure`, `head_sha=5186327...`, so no fresh run has executed the new logic yet
- Playwright/browser: not applicable; no app route behavior changed
- production SHA: PASS `https://www.foldera.ai/api/health` -> build `f387d93`

## Remaining defects in current slice

1. A fresh GitHub heartbeat run on the new commit is still unproven until the hosted workflow executes the new script.
2. The old failed rerun on `5186327` will remain red in GitHub history even after this fix ships.
3. This slice does not change daily-brief generation, paid model behavior, or dashboard/product execution paths.

## Next exact move

Start here:
1. Read `ACTIVE_HANDOFF.md` before broad history.
2. Push the same-day-window heartbeat fix directly to `main`.
3. Trigger or wait for a fresh `Pipeline cron heartbeat` run on the new head commit, then confirm the latest run number turns green.

## Do not touch yet

- paid generation
- outbound email
- Stripe charge
- schema migration
- destructive DB action
- other slices unless the fresh heartbeat run surfaces a different real blocker

## External blockers

- No product/runtime blocker remains in this seam.
- Fresh GitHub workflow proof depends on a new run because rerunning the old `#34` run would stay pinned to commit `5186327`.

## Stop condition

Stop only when the fresh GitHub heartbeat run on the new head commit is green, or when the next failure names a different exact blocker.
