# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-04 PT
Current `origin/main` SHA after PR #167 merge: `a624b49f1f6e28f1c422624d001e072745f2e4bd`.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Active implementation seam is issue #170: Foldera Master Synthesis Lock Pass - customer, deliverable, build spec, and issue ladder.
This is a source-truth build-definition seam only.
Issue #166 / PR #167 completed the Repo Intake Governor Command OS v0 and is superseded as the active seam.
Issue #165 Open Threads remains capture-only and cannot authorize implementation.
Issue #140 / PR #142 remains rail-only and parked externally blocked; do not widen or patch it.
Issue #136 remains open as the standing Codex Run Ledger only.
GitHub writeback is mandatory.
One active seam only.

## Current slice:
- Issue #170 is the only active seam: place `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` under repo control as `REFERENCE_DRAFT` and define the lock-pass acceptance standard.
- The draft is not build-ready and is not implementation authority.
- Issue #166 is complete via PR #167; do not continue Command OS implementation in this seam.
- Issue #165 is capture-only Open Threads; it feeds future routing but cannot authorize implementation.
- Issue #163 / PR #164 completed Product Operating System; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` remains roadmap/phase/backlog/enterprise control.
- Issue #156 North Star Lock is complete on `main`; `FOLDERA_NORTH_STAR_LOCK.md` remains product doctrine control.
- Issue #140 / PR #142 is parked as live rail proof/blocker only; do not widen it.
- Issues #121, #99, #48, #131, #147, #151, #154, #159, #163, and #166 are closed/completed/superseded. Do not reopen them.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
`FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.

## Master Synthesis boundary
Allowed in issue #170: source-truth transition files, `FOLDERA_MASTER_SYNTHESIS_DRAFT.md`, and focused source-truth/continuity gate tests only if required.
Required result: `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` exists as `REFERENCE_DRAFT`, states `READINESS VERDICT - NOT BUILD-READY YET`, and names the required next pass to upgrade it into the hit-by-a-bus build bible.
Forbidden in issue #170: product/runtime code, Supabase migrations, Vercel changes, Slack / PR #142, Stripe, connectors, landing/dashboard/auth/backend, broad cleanup, fake claims, or treating the draft as build-ready.

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
Run issue #170 only on branch `codex/activate-170-master-bible-lock`.
Create one draft PR that activates issue #170, adds `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` as `REFERENCE_DRAFT`, proves source-truth gates, posts PR receipt, posts issue #136 ledger receipt, and stops.
Next authorized move after this PR: upgrade the draft into the hit-by-a-bus build bible only under a future explicitly assigned issue.
