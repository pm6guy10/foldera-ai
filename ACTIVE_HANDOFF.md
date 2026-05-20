# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-20 09:22 PT
Current slice: issue #55 proactive re-entry trigger loop (manual/test mode); PR #57 open; do not merge until mergeable=true and checks policy is satisfied.
Current `origin/main` SHA at update time: `8d26ce46c90fe5303e401dfeb6811c38fbfde044`.
PR #57 head SHA: `097560b5460891e198b14cce3de6989369d3a079`.
GitHub Actions status for PR #57: NO WORKFLOW RUNS VISIBLE (blocker; investigate checks/branch protection).
Vercel preview for PR #57: READY (deployment `dpl_8ArSpAD77oeCTncG2cGdmbkNKBYs`).

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

## Current truth

- PR #47 merged: Morning Anchor workday presence state exists.
- PR #54 merged: Right Now message payload + Done/Stuck/Break smaller/Snooze simulated actions exist.
- Issue #48 is the roadmap/product contract.
- Issue #55 is the active rung: proactive re-entry trigger loop (manual/test mode) for `morning_anchor`, `pre_meeting`, `end_of_day`, `waiting_on_changed`.

## Local proof (PR #57)

- `npm run health`: `RESULT: 0 FAILING` (warn: last generation `do_nothing`).
- `npm run gate:status`: PRE_BETA_READINESS_THRESHOLD `BLOCKED_EXTERNAL` (unchanged).
- `npm run gate:quality`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- Focused tests: `npx vitest run lib/workday-presence/__tests__/triggers.test.ts app/api/workday-presence/__tests__/triggers-route.test.ts --reporter=verbose`.

## Parked / forbidden unless explicitly assigned

- PR #44, PR #46, Dependabot
- live Slack/Teams/email send, connector intelligence, durable thread ledger
- billing, auth, dashboard redesign
- `scorer.ts`, `conviction-engine.ts`

## Next exact move

Investigate PR #57 mergeability/checks only (no product code changes):
- Determine why `.github/workflows/ci.yml` did not run despite touched `app/**` and `lib/**`.
- Identify branch protection / required checks policy for `main`.
- Fix only CI trigger/metadata if required; otherwise wait until PR is mergeable and required checks are green.

