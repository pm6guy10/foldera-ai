# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-01 PT
Current `origin/main` SHA at ops-ledger start: `1f8f373016ce9b9e8a77b9ea99a2acb683cf406f`.

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
Active implementation seam is issue #136: [OPS] Codex Run Ledger.

Issue #126 is complete: PR #132 landed Supabase egress controls on `main`, PR #133 completed source-truth closeout, and current-cycle Supabase usage showed projected API/database egress under the Free-plan target. The Supabase measurement/downgrade blocker is resolved.

Issue #131 is complete: PR #135 landed the Slack test-mode MVP Presence Loop on `main`.

## Current slice:

- Issue #126 recovery and downgrade decision are complete/resolved.
- Issue #136 is now the active repo-governance seam.
- Issue #131 MVP Presence Loop is complete on `main`.
- Issue #121 landing work remains paused unless explicitly reassigned after issue #136.
- Issue #99 remains paused.
- Issue #48 remains the product doctrine.
- PR #124 and PR #125 are closed/superseded and must not be reopened or reused.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Required issue #136 outcome

Install permanent Codex Run Ledger discipline:
prompt-level closeout behavior -> authoritative repo instruction -> continuity gate enforcement -> PR receipt -> standing ledger issue receipt.

Required proof for the #136 PR: focused continuity/source-truth tests, `npm run health`, `npm run gate:command`, `npm run gate:continuity`, `npm run lint`, `npm run build`, and `git diff --check`.

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

## Next exact move

Run issue #136 only. Do not implement landing, live Slack, Stripe, dashboard redesign, Supabase schema, billing/downgrade, outreach, Dependabot, or broad cleanup.
