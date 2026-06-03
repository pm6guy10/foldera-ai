# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-02 PT
Current `origin/main` SHA after PR #162 merge: `ca34870af4190e1e719ab55a93f4159297eb4135`.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Active implementation seam is issue #163: Foldera Product Operating System - roadmap, backlog, and enterprise path.
This is a docs/source-truth seam only.
Issue #159 is complete via PR #161, and PR #162 realigned source truth to block fake growth while preserving `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md`.
Manual first-10 evidence remains proof doctrine/reference, but it is owner-rejected as the primary operating path and is no longer the only executable next move.
Issue #140 / PR #142 remains rail-only and parked externally blocked; do not widen or patch it.
Issue #136 remains open as the standing Codex Run Ledger only.

## Current slice:
- Issue #163 is the only active seam: create `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` and reconcile roadmap/phase/backlog/enterprise source truth.
- Issue #136 Codex Run Ledger governance is complete on `main` and remains open only as the standing ledger.
- Issue #140 / PR #142 is parked as the live rail proof/blocker seam only; do not widen it.
- Issue #156 Foldera North Star Lock is complete on `main` via PR #158; `FOLDERA_NORTH_STAR_LOCK.md` remains product doctrine control.
- Issue #159 Growth Scout First 10 ICP Evidence Tracker is complete on `main` via PR #161; placeholders are not evidence.
- Issues #121, #99, and #48 are closed/superseded; issue #131 is closed/completed. Do not reopen them.
- PR #124 and PR #125 are closed/superseded and must not be reopened or reused.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
Issue #48 is carried forward in repo source truth; it is closed/superseded and must not be reopened.
`FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.

## Blocked growth boundary
The first-10 tracker remains proof doctrine/reference and must not be deleted.
Manual first-10 evidence is owner-rejected as the primary executable path.
Placeholder rows in `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` are not evidence.
Forbidden in issue #163: product implementation, Slack / PR #142 work, landing/frontend/dashboard work, Supabase, Stripe, package files, connectors, Teams/email/calendar, outreach, scraping, paid ads, customer data mutation, broad cleanup, fake enterprise readiness, fake SOC2/HIPAA/compliance claims, deleting the first-10 tracker, or starting Repo Intake Governor implementation.

## GitHub writeback contract
- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Every PR must close source truth before stop.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue, paused issue list, priority class, or work type changes.
- If a source-truth file is not updated, the PR receipt must say `unchanged - reason` or `not applicable - reason`.

## Forbidden unless explicitly assigned
- Do not patch PR #142, Slack code, Slack app settings, Vercel settings, connector ingestion, Supabase schema/data, selector/source-backed-state code, landing/frontend/dashboard/auth/backend, Stripe, package files, connector expansion, Teams/email/calendar expansion, outreach, scraping, customer data, or broad cleanup.
- No reopening #121/#131/#99/#48/#147/#151/#159.

## Next exact move
Run issue #163 only on branch `codex/product-operating-system-roadmap-lock`.
Create one docs/source-truth PR that creates `FOLDERA_PRODUCT_OPERATING_SYSTEM.md`, updates active source truth, names exactly one next seam, runs required proof, posts PR receipt, posts issue #136 ledger receipt, and stops before implementation.
Next seam after this PR: Repo Intake Governor v0.
