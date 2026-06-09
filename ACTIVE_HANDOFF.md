# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-08 PT
Current `origin/main` SHA after PR #210 merge: see GitHub for latest.

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
Issue #192 is completed by merged PR #193.
Issue #196 is completed by merged PR #197.
Issue #198 is completed by merged PR #198 and restored issue #194 as active control.
Issue #194 is completed by merged PR #201.
Issue #140 is completed by merged PR #206.
Issue #207 completed the governance pivot and moved repo control to issue #208.
Issue #208 is completed by merged PR #215.
Issue #213 is completed by merged PR #214 (Launch Ladder Lock v1 governance seam).
Issue #216 is completed by merged PR #218.
Issue #220 is the active Product MVP seam.
Issue #178 is suspended/queued and no longer active.
Current Phase: Rung 5 — Add bounded self-serve early-access payment path.
The active seam is the Product MVP seam: the Stripe/payment implementation (checkout, webhook, portal, pricing page, subscription-db, migrations) already exists on main; this seam proves it end-to-end and closes out rung 5. Do not rebuild what is already there.
The launch_ladder in FOLDERA_BUILD_ORDER.yaml is the ordering authority for the Foldera build sequence. Rung 3 (issue #208) is COMPLETE. Rung 4 (issue #216) is COMPLETE. Rung 5 (issue #220) is IN_PROGRESS. Rungs 6-7 are PENDING with needs_issue markers.
`FOLDERA_MASTER_BIBLE.md` is the canonical master bible reference authority.
`FOLDERA_EXECUTION_QUEUE.yaml` remains inactive and does not control the next move.
PR #189 remains `UNMERGED_DRAFT_CONTEXT_ONLY`.
Issues #175 (PR #177), #173 (PR #174), #170 (PR #172) are complete/superseded.
Issue #165 Open Threads remains capture-only and cannot authorize implementation.
Issue #182 is completed/superseded by PR #203.
Issue #168 is completed/superseded by PR #205.
Issue #136 remains open as the standing Codex Run Ledger only.
GitHub writeback is mandatory.
One active seam only.

## Current slice:
- PR #198 restored issue #194 as the active seam after the closeout sweep.
- PR #207 completed the governance pivot and moved repo control from issue #178 to issue #208.
- The current lane is the Product MVP pivot: one scoped source-truth move, one active product seam. Payment implementation exists on main; rung 5 is prove/closeout not build.
- Issue #165 remains the raw-input inbox and capture-only.
- Issue #140 is complete and no longer the active seam.
- Issue #178 is suspended/queued and no longer the active seam.
- Issue #220 is the sole active seam.
- The next authorized move after this closeout is to continue issue #220 in the active seam.
- `FOLDERA_EXECUTION_QUEUE.yaml` stays inactive/reference-only until a future explicit activation issue reopens it.
- Issues #48, #121, #99, #131, #147, #151, #154, #159, #163, #166, #170, #173, #175, #179, #181, #182, #183, #192, #194, and #196 are closed/completed/superseded. Do not reopen them here.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
`FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.

## Source-truth boundary
Allowed files for this seam are the governance-control files, gate/test files, product-doctrine docs, and source-truth files needed to prove the Product MVP pivot.
Current source-truth truth is: `FOLDERA_MASTER_BIBLE.md` is the canonical reference authority, issue #220 is the active Product MVP seam (rung 5 IN_PROGRESS), issue #216 is completed by PR #218 (rung 4 COMPLETE), issue #178 is suspended/queued, issue #140 is completed/closed, issue #168 is completed/superseded, issue #165 is capture-only, issue #182 is completed/superseded, and the queue file remains inactive/reference-only.
Forbidden in this seam: live Slack, Supabase migrations or data mutation, Vercel settings, Stripe/auth work, package/dependency changes, queue activation, Dependabot, live connector fetch, paid model call, fake claims, or broad cleanup.

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
The next authorized move after this closeout is to begin issue #220 in the active seam.
Issue #220: Prove the already-implemented payment path end-to-end — checkout, webhook, portal, user_subscriptions persistence, and post-checkout access gate. Implementation exists on main. Remaining work is live proof only.
