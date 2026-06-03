# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-03 PT
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
Active implementation seam is issue #168: Command OS v1 - automatic Open Threads capture from ChatGPT.
This is a source-truth / assistant-switchboard seam, not product runtime work.
Issue #166 / PR #167 completed Repo Intake Governor Command OS v0.
Issue #163 / PR #164 completed the Product Operating System.
Open Threads issue #165 is the raw-input inbox, not implementation authority.
Issue #140 / PR #142 remains rail-only and parked externally blocked; do not widen or patch it.
Issue #136 remains open as the standing Codex Run Ledger only.
GitHub writeback is mandatory.
One active seam only.

## Current slice:
- Issue #168 is the only active seam: prove one-and-done ChatGPT-to-GitHub capture/retrieval behavior so Brandon does not have to create files, choose targets, run local commands, or keep reminding agents.
- Issue #166 is complete via PR #167; the deterministic repo-local intake governor and `governor:intake` / `gate:repo-intake-governor` remain the Command OS v0 proof rail.
- Issue #165 is capture-only Open Threads; it feeds #168 but cannot authorize implementation.
- Issue #163 is complete via PR #164; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` remains roadmap/phase/backlog/enterprise control.
- Issue #156 North Star Lock is complete on `main`; `FOLDERA_NORTH_STAR_LOCK.md` remains product doctrine control.
- Issue #159 Growth Scout First 10 ICP Evidence Tracker is complete on `main`; placeholders are not evidence.
- Issue #140 / PR #142 is parked as live rail proof/blocker only; do not widen it.
- Issues #121, #99, and #48 are closed/superseded; issue #131 is closed/completed. Do not reopen them.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
`FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.

## Command OS v1 boundary
Allowed in issue #168: source-truth transition files, assistant/GitHub switchboard doctrine, Open Threads auto-capture acceptance criteria, focused source-truth gates/tests, and preservation of existing Repo Intake Governor v0 proof rails.
Forbidden in issue #168: app/runtime/product code, Slack / PR #142, landing/frontend/dashboard/auth/backend, Supabase, Stripe, package-lock/dependency changes, connectors, Teams/email/calendar, outreach, scraping, customer data, fake enterprise/compliance claims, broad cleanup, or treating labels/projects/Open Threads/comments as authority.

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
- Do not patch PR #142, Slack code, Slack app settings, Vercel settings, connector ingestion, Supabase schema/data, selector/source-backed-state code, landing/frontend/dashboard/auth/backend, Stripe, connector expansion, Teams/email/calendar expansion, outreach, scraping, customer data, or broad cleanup.
- No reopening #121/#131/#99/#48/#147/#151/#159/#163/#166.

## Next exact move
Run issue #168 only.
Create one PR that closes out issue #166 / PR #167 in source truth, assigns #168 as the active seam, proves comments alone are not law, and requires one-and-done ChatGPT-to-GitHub capture/retrieval behavior before #168 can close.
Next authorized move after this PR: implement or operationalize #168 so Brandon can speak once in ChatGPT and GitHub receives/retrieves the routed receipt without Brandon manually creating files or choosing targets.
