# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-04 PT
Current `origin/main` SHA after PR #177 merge: `17e0699238cd11e80b4891f236be860abe32eb72`.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Active implementation seam is issue #179: Rung 3 - Prove deterministic one-verdict fixture loop.
This is a deterministic TEST_MODE work-packet fixture proof seam.
Issue #175 is complete via PR #177: the read-only audit selected the deterministic work-packet fixture lane.
Issue #173 is complete/superseded by PR #174.
Issue #170 is complete/superseded by PR #172.
Issue #165 Open Threads remains capture-only and cannot authorize implementation.
Issue #140 / PR #142 remains rail-only and parked for this seam; do not widen or patch it here.
Issue #136 remains open as the standing Codex Run Ledger only.
GitHub writeback is mandatory.
One active seam only.

## Current slice:
- Issue #179 is the only active seam: prove the deterministic one-verdict work-packet fixture loop selected by issue #175 / PR #177.
- Exact lane: `tests/fixtures/work-packets/source-signals.ts` -> `lib/work-packets` packet generation/receipt/transitions -> `lib/slack-test-mode/work-packet-review.ts` TEST_MODE review card -> packet/workday state after.
- Required proof chain: fixture signals enter; exactly one work packet is generated; exactly one TEST_MODE review card is produced; exactly one review/dismiss transition is applied; receipt records packet/workday state after; source trail and forbidden send actions remain intact; no paid model call or live connector fetch is required.
- `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` remains `REFERENCE_DRAFT`: source material only, not implementation authority.
- Issue #175 is closed/completed; do not reopen Rung 2 audit work.
- Issue #140 / PR #142 is parked for this seam; do not touch live Slack/provider surfaces.
- Issues #121, #99, #48, #131, #147, #151, #154, #159, #163, #166, #170, #173, and #175 are closed/completed/superseded. Do not reopen them.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
`FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.

## Issue #179 boundary
Allowed in issue #179: source-truth transition files, focused source-truth/continuity gate tests, `tests/fixtures/work-packets/source-signals.ts`, `lib/work-packets/**`, `lib/slack-test-mode/work-packet-review.ts`, `lib/slack-test-mode/__tests__/work-packet-review.test.ts`, and `lib/workday-presence/__tests__/work-packet-state-update.test.ts`.
Forbidden in issue #179: product/runtime/provider/schema/Supabase/Vercel/live Slack/PR #142/Stripe/auth/landing/dashboard work, package/dependency changes, data mutation, migrations, live connector fetch, paid/model calls, fake claims, or starting the next rung.
Stop condition: one PR proves the deterministic fixture lane, posts a PR receipt and issue #136 ledger receipt, and stops without product/runtime/provider/schema work.

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
Open one draft PR for issue #179 on branch `codex/issue-179-rung-3-work-packet-fixture`.
The PR must contain focused deterministic proof, source-truth closeout, PR receipt, and issue #136 ledger receipt.
Next authorized move after this PR: blocked until issue #179 is reviewed/merged; do not start another rung.
