# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-02 PT
Current `origin/main` SHA after PR #153 merge: `be5d596c8033f9b273ceb025aa3c2c18333520f4`.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Active implementation seam is issue #154: Select next source-truth seam after issue #151.
Issue #151 is complete: PR #153 landed the source-backed Right Now selector on `main` at merge commit `be5d596c8033f9b273ceb025aa3c2c18333520f4`, and GitHub issue #151 is closed.
Issue #140 / PR #142 remains rail-only and parked externally blocked: deterministic Slack self-loop proof passed, live Slack send reached the rail, and the remaining real Slack button callback proof is externally blocked by Slack/Vercel callback delivery or preview access. Do not mutate PR #142 into packet-brain, connector-platform, dashboard, source-backed selector, or product-brain work.
Issue #136 remains open as the standing Codex Run Ledger only.

## Current slice:
- Issue #126 recovery and downgrade decision are complete/resolved.
- Issue #131 MVP Presence Loop is complete on `main` and closed; do not reopen.
- Issue #136 Codex Run Ledger governance is complete on `main` and remains open only as the standing ledger.
- Issue #138 Real Slack Self-Loop source-truth promotion is complete on `main`.
- Issue #140 / PR #142 is parked as the live rail proof/blocker seam only; do not widen it.
- Issue #143 Work Packet Brain deterministic proof is complete on `main` via PR #145.
- Issue #147 public landing shell adaptation is complete on `main` via PR #149; issue #147 is closed.
- Issue #151 source-backed Right Now selector is complete on `main` via PR #153; issue #151 is closed.
- Issue #154 is the active source-truth selection seam; do not implement product code inside this seam.
- Issues #121, #99, and #48 are closed/superseded; issue #131 is closed/completed. Do not reopen them.
- PR #124 and PR #125 are closed/superseded and must not be reopened or reused.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
Issue #48 is carried forward in repo source truth; it is closed/superseded and must not be reopened.

## Required issue #154 source-truth selection outcome
Select exactly one next source-truth seam after issue #151:
- inspect GitHub/repo source truth only enough to name the next authorized seam;
- keep issue #140 / PR #142 parked externally blocked and rail-only unless GitHub source truth explicitly reassigns it;
- keep issue #136 ledger-only;
- do not implement product code, selector changes, Slack code, landing, dashboard/auth/backend, Supabase schema/data, Stripe, package files, connector expansion, Teams/email/calendar expansion, Vercel settings, Slack app settings, or broad cleanup.

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
- For issue #140 live rail proof, do not patch Slack code until logs prove a code-owned failure.
- For issue #154, do not implement product code or patch PR #142, Slack code, Slack app settings, Vercel settings, connector ingestion, Supabase schema/data, selector/source-backed-state code, landing, dashboard/auth/backend, Stripe, package files, connector expansion, Teams/email/calendar expansion, or broad cleanup.
- No reopening #121/#131/#99/#48/#147/#151.

## Next exact move
Run issue #154 source-truth seam selection only.
Next seam: issue #154 - select the next source-truth seam after issue #151.
Stop after one source-truth selection PR names exactly one next authorized seam, posts PR and issue #136 ledger receipts, and touches no product code. Do not implement the selected seam.
