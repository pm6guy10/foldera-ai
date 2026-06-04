# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-04 PT
Current `origin/main` SHA after PR #174 merge: `34ac1b28be8c965a741eefbb1eb3f18a724bc45b`.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Active implementation seam is issue #175: Rung 2 - Audit current schema and choose first evidence lane.
This is a read-only schema/evidence-lane audit seam.
Issue #173 is complete/superseded by PR #174: the first executable MVP rung was promoted and Rung 2 was named next.
Issue #170 is complete/superseded by PR #172: `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` is build-bible-ready `REFERENCE_DRAFT`, not implementation authority.
Issue #165 Open Threads remains capture-only and cannot authorize implementation.
Issue #140 / PR #142 remains rail-only and parked for this seam; do not widen or patch it here.
Issue #136 remains open as the standing Codex Run Ledger only.
GitHub writeback is mandatory.
One active seam only.

## Current slice:
- Issue #175 is the only active seam: audit current schema/state/evidence support and choose the first evidence lane.
- `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` remains `REFERENCE_DRAFT`: source material only, not implementation authority, not schema authority, and not permission to build.
- The next executable build sequence is: promote first executable MVP rung; audit current schema and choose first evidence lane; prove deterministic one-verdict fixture loop; prove one-click state mutation receipt; implement first user journey shell; persist one source-backed workday state path; prove trust/privacy/no-send rail; add bounded $29 early-access/payment path; prove money-ready MVP end to end; prove first non-owner validation.
- Immediate next seam after issue #175: Rung 3 - Prove deterministic one-verdict fixture loop, only after issue #175 selects a first evidence lane or blocks lane selection.
- Rung 2 is read-only audit work; it may inspect current repo files/schema artifacts but must not implement product/runtime/schema changes.
- This transition PR activates #175 only and must not start the audit artifact.
- Issue #173 is complete via PR #174; do not continue first-rung promotion work in this seam.
- Issue #170 is complete/superseded by PR #172; do not reopen it.
- Issue #166 is complete via PR #167; do not continue Command OS implementation in this seam.
- Issue #165 is capture-only Open Threads; it feeds future routing but cannot authorize implementation.
- Issue #140 / PR #142 is parked for this source-truth routing seam; do not touch Slack here.
- Issues #121, #99, #48, #131, #147, #151, #154, #159, #163, #166, #170, and #173 are closed/completed/superseded. Do not reopen them.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
`FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.

## Issue #175 boundary
Allowed in issue #175 activation PR: source-truth transition files and focused source-truth/continuity gate tests only if required.
Required result: active issue becomes #175; priority class becomes `RUNG_2_SCHEMA_EVIDENCE_LANE_AUDIT`; work type becomes `READ_ONLY_SCHEMA_EVIDENCE_AUDIT`; issue #173 is completed/superseded by PR #174; `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` remains `REFERENCE_DRAFT`; #165 remains capture-only; PR #142 remains parked rail-only; #136 remains ledger-only; next seam is Rung 3 deterministic one-verdict fixture loop only after the audit selects a lane.
Forbidden in issue #175 activation PR: starting the audit artifact, product/runtime code, Supabase migrations, Vercel changes, Slack / PR #142, Stripe, connectors, landing/dashboard/auth/backend, broad cleanup, fake claims, or treating the draft as implementation authority.
Forbidden in later issue #175 audit work: product/runtime/frontend/backend implementation, Supabase migrations or data mutation, Vercel changes, Slack / PR #142, Stripe, connectors, landing/dashboard/auth/backend, package/dependency changes, fake schema/customer/compliance claims, or starting Rung 3.

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
Run issue #175 activation only on branch `codex/issue-175-rung-2-schema-evidence-audit`.
Create one draft PR that activates Rung 2 as a read-only audit seam, records issue #173 completed/superseded by PR #174, proves source-truth gates, posts PR receipt, posts issue #136 ledger receipt, and stops without starting the audit.
Next authorized move after this PR: run issue #175 audit only, producing one audit artifact and choosing or blocking the first evidence lane.
