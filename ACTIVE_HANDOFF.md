# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-31 PT
Current `origin/main` SHA at update time: `aeb4e73c2a89cedfc8fdccdd7f8fa0dba4b0f03d`.

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
Active implementation seam is issue #123: repo command gate / anti-sprawl enforcement.

PR #130 is the only active execution lane for issue #123.
Issue #121 landing polish is paused until issue #123 is merged and enforced by code.
Stop condition: PR #130 green/merged before landing resumes.

## Current slice:

- PR #124 is closed and superseded; it must not be reopened or reused for current work.
- PR #125 is closed and superseded; it must not be reopened or reused for current work.
- Issue #121 is next after #123, not active implementation.
- Issue #99 remains paused.
- Issue #48 remains the product doctrine.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Required enforcement outcome for #123

The repo must contain a deterministic command gate that fails locally and in CI when source truth drifts, closed PRs are reused, landing work starts while issue #121 is paused, protected Vercel preview links are treated as proof, proof commands are missing, or PR files exceed the active contract allowlist.

Required proof:

- npm run gate:command
- npm run gate:continuity
- npm run lint
- npm run build

## GitHub writeback contract

- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `BLOCKED`, `PROOF`, `PR OPENED`, `MERGE READY`, or `STOPPED`.
- Every PR must close source truth before stop.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue, paused issue list, priority class, or work type changes.
- If a source-truth file is not updated, the PR receipt must say `unchanged - reason` or `not applicable - reason`.

## Forbidden unless explicitly assigned

- No issue #121 landing implementation until issue #123 is enforced.
- No issue #99 implementation.
- No Slack work.
- No backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes.
- No broad cleanup.
- No new landing issue.
- No reopening PR #124.
- No reopening PR #125.

## Next exact move

Run issue #123 only in PR #130:

1. Keep source-truth command gate enforcement green.
2. Keep FOLDERA_BUILD_ORDER.yaml and .foldera-contract.json aligned to issue #123.
3. Keep the work inside PR #130 only.
4. Stop after proof is posted.
