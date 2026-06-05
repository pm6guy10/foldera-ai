# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-04 PT
Current `origin/main` SHA after PR #180 merge: `b1e932e63c2fd261a2fc0c57edf99b0e4f8d5b80`.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Issue #179 is completed by merged PR #180.
Active implementation seam is `EXECUTION_QUEUE`.
The active seam is now controlled entirely by `FOLDERA_EXECUTION_QUEUE.yaml`.
Task `001` is completed and Task `002` is active.
Issue #175 is complete via PR #177: the read-only audit selected the deterministic work-packet fixture lane.
Issue #173 is complete/superseded by PR #174.
Issue #170 is complete/superseded by PR #172.
Issue #165 Open Threads remains capture-only and cannot authorize implementation.
Issue #140 / PR #142 remains rail-only and parked outside this deterministic queue phase.
Issue #136 remains open as the standing Codex Run Ledger only.
GitHub writeback is mandatory.
One active seam only.

## Current slice:
- Queue authority has replaced issue-by-issue routing for this phase.
- Execute only the first `ACTIVE` task in `FOLDERA_EXECUTION_QUEUE.yaml`, then advance it deterministically when its proof gate passes.
- Current active task is `002`: build deterministic state inference from Waiting on Marcus to Approval Received with next move `Send Estimate`.
- Current lane remains deterministic TEST_MODE only: `tests/fixtures/work-packets/source-signals.ts` -> `lib/work-packets` packet generation/receipt/transitions -> `lib/slack-test-mode/work-packet-review.ts` TEST_MODE review card -> packet/workday state after.
- No paid model call, live connector fetch, live Slack delivery, Vercel, Supabase, or schema work is authorized in this queue phase.
- `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` remains `REFERENCE_DRAFT`: source material only, not implementation authority.
- Issue #140 / PR #142 is parked for this seam; do not touch live Slack/provider surfaces.
- Issues #121, #99, #48, #131, #147, #151, #154, #159, #163, #166, #170, #173, #175, and #179 are closed/completed/superseded. Do not reopen them here.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
`FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.

## Execution queue boundary
Allowed files are controlled by the current `ACTIVE` queue item in `FOLDERA_EXECUTION_QUEUE.yaml`.
Current task `002` allows only `lib/work-packets/generator.ts`, `lib/work-packets/types.ts`, and `lib/work-packets/__tests__/work-packet-brain.test.ts`.
Forbidden in this queue phase: product/runtime/provider/schema/Supabase/Vercel/live Slack/PR #142/Stripe/auth/landing/dashboard work, package/dependency changes, data mutation, migrations, live connector fetch, paid/model calls, fake claims, or queue drift outside ordered advancement.
Stop condition: continue deterministic queue execution until Task `005` is completed or a hard TypeScript test failure blocks progress.

## GitHub writeback contract
- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Every PR must close source truth before stop.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue, paused issue list, priority class, or work type changes.
- If a source-truth file is not updated, the PR receipt must say `unchanged - reason` or `not applicable - reason`.

## Next exact move
Read `FOLDERA_EXECUTION_QUEUE.yaml`, execute active Task `002`, and advance the queue only if its proof gate passes.
Next authorized move after Task `002`: mark Task `002` completed, mark Task `003` active, commit locally, and continue.
