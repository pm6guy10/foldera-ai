# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-31 PT
Current `origin/main` SHA at closeout start: `9d1dc71ba747306b03fc527ea7058ccdfc8dd723`.

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
Active implementation seam is issue #126: BLOCKED on live Supabase API/database egress measurement before any downgrade.

PR #132 merged the #126 Supabase egress burn-down recovery into `main` at `9d1dc71ba747306b03fc527ea7058ccdfc8dd723`.
Current blocker: live Supabase dashboard/API egress measurement is required before deciding whether the project can downgrade.

## Current slice:

- Issue #126 recovery is complete/landed via PR #132.
- No product implementation seam is active while Supabase measurement/downgrade decision is unresolved.
- Issue #131 is the next product-build candidate only after the Supabase measurement/downgrade decision is resolved.
- Issue #121 landing work remains paused unless explicitly reassigned after the blocker is resolved.
- Issue #99 remains paused.
- Issue #48 remains the product doctrine.
- PR #124 and PR #125 are closed/superseded and must not be reopened or reused.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Required blocker outcome

Measure live Supabase API/database egress after PR #132 before any downgrade. Green target remains projected API/database egress below 5 GB/month, ideally below 125 MB/day sustained.

Required proof for this closeout PR: npm run gate:command; npm run gate:continuity; npm run lint; npm run build.

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

- No product code, landing, Slack, Stripe, issue #131 implementation, Supabase schema, downgrade, dashboard product behavior, or broad cleanup.

## Next exact move

Open one tiny source-truth closeout PR from current `main`; stop after proof and receipt. Do not start issue #131 until live Supabase egress measurement resolves the downgrade decision.
