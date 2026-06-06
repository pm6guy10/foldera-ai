# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-06 PT
Current `origin/main` SHA after PR #191 merge: `90146a976d9a3c0496876bd539ae3e8cee26060c`.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Issue #181 is completed by merged PR #191.
Active implementation seam is issue #192.
The active seam is the source-truth closeout for the Master Bible promotion.
`FOLDERA_MASTER_BIBLE.md` is the canonical master bible reference authority.
`FOLDERA_EXECUTION_QUEUE.yaml` remains inactive and does not control the next move.
PR #189 remains `UNMERGED_DRAFT_CONTEXT_ONLY`.
Issue #175 is complete via PR #177: the read-only audit selected the deterministic work-packet fixture lane.
Issue #173 is complete/superseded by PR #174.
Issue #170 is complete/superseded by PR #172.
Issue #165 Open Threads remains capture-only and cannot authorize implementation.
Issue #140 / PR #142 remains rail-only and parked outside this source-truth closeout seam.
Issue #136 remains open as the standing Codex Run Ledger only.
GitHub writeback is mandatory.
One active seam only.

## Current slice:
- PR #191 landed the Master Bible bundle and issue #181 is now closed by merge.
- Issue #192 is the active source-truth closeout seam.
- `FOLDERA_MASTER_BIBLE.md` is the human-readable company plan; supporting docs remain subordinate.
- `FOLDERA_EXECUTION_QUEUE.yaml` stays inactive/reference-only until a future explicit activation issue reopens it.
- The current lane is docs and source-truth only: no product/runtime/provider/schema/Supabase/Vercel/live Slack/Stripe/auth/landing/dashboard work is authorized in this closeout seam.
- `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` remains `REFERENCE_DRAFT`: source material only, not implementation authority.
- Issue #140 / PR #142 is parked for this seam; do not touch live Slack/provider surfaces.
- Issues #48, #121, #99, #131, #147, #151, #154, #159, #163, #166, #170, #173, #175, #179, #181, and #183 are closed/completed/superseded. Do not reopen them here.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
`FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.

## Source-truth boundary
Allowed files for this seam are the source-truth files and the gate/test files needed to prove the Master Bible closeout is coherent.
Current source-truth truth is: `FOLDERA_MASTER_BIBLE.md` is the canonical reference authority, issue #192 is active, and the queue file remains inactive/reference-only.
Forbidden in this closeout seam: product/runtime/provider/schema/Supabase/Vercel/live Slack/PR #142/Stripe/auth/landing/dashboard work, package/dependency changes, data mutation, migrations, live connector fetch, paid/model calls, fake claims, queue activation, or queue drift outside the source-truth closeout.
Stop condition: stop when the source-truth docs and gate/test layer agree that the Master Bible is the current repo authority, the queue remains inactive, and issue #192 is the single active seam.

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
Fix the source-truth closeout gate/test blocker only.
Next authorized move after this PR merges: start the first money-loop issue in a separate run; do not start it in this PR.
