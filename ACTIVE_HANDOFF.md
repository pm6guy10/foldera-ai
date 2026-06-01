# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-01 PT
Current `origin/main` SHA at Real Slack Self-Loop implementation promotion start: `5f1d3e73f90f1c30ad904c8e45db18a68ebc042e`.

## Canonical Boot Sequence
For any Foldera task, use this order:

1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Active implementation seam is issue #140: Real Slack Self-Loop implementation.

Issue #126 is complete: PR #132 landed Supabase egress controls on `main`, PR #133 completed source-truth closeout, and current-cycle Supabase usage showed projected API/database egress under the Free-plan target. The Supabase measurement/downgrade blocker is resolved.

Issue #131 is complete: PR #135 landed the Slack test-mode MVP Presence Loop on `main`.

Issue #136 is complete: PR #137 installed mandatory Codex Run Ledger closeout discipline on `main`.

Issue #138 is complete: PR #139 promoted the Real Slack Self-Loop source-truth target on `main` without Slack implementation code.

## Current slice:

- Issue #126 recovery and downgrade decision are complete/resolved.
- Issue #131 MVP Presence Loop is complete on `main`.
- Issue #136 Codex Run Ledger governance is complete on `main`.
- Issue #138 Real Slack Self-Loop source-truth promotion is complete on `main`.
- Issue #140 is now the active implementation seam for the bounded Real Slack Self-Loop.
- Issue #121 landing work remains paused unless explicitly reassigned after issue #136.
- Issue #99 remains paused.
- Issue #48 remains the product doctrine.
- PR #124 and PR #125 are closed/superseded and must not be reopened or reused.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Required issue #140 outcome

Implement one safe Real Slack Self-Loop only:
issue #131 deterministic Slack test-mode loop -> issue #138 Real Slack Self-Loop source-truth target -> issue #140 bounded real Slack implementation.

Required deterministic proof for issue #140: `npm run health`, focused Slack self-loop tests, token exposure / secret redaction test or gate, `npm run gate:command`, `npm run gate:continuity`, `npm run lint`, `npm run build`, and `git diff --check`.

Live Slack send/install/OAuth proof is only required after the implementation reaches that boundary and must not be faked. If external credentials, OAuth app settings, Slack workspace authorization, or paid/model proof are required, stop with `BLOCKED` and name the exact missing permission.

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

- No landing, Stripe, dashboard redesign, Supabase schema, live Slack install/OAuth/send, Teams/email/calendar expansion, outreach, billing/downgrade work, or broad cleanup.
- For issue #140 specifically, one real Slack self-loop only; no connector platform expansion.

## Next exact move

Run issue #140 Real Slack Self-Loop implementation only after this closeout/promotion PR lands. Do not start landing, Stripe, dashboard redesign, Supabase schema except a proven token/state boundary, Teams/email/calendar expansion, billing/downgrade, outreach, Dependabot, or broad cleanup.
