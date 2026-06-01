# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-31 PT
Current `origin/main` SHA at recovery start: `6654948ed951e217aa75bf2601a8e820c819fcbe`.

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
Active implementation seam is issue #126: Supabase egress burn-down recovery onto `main`.

PR #130 is merged. PR #127 says it closes issue #126, but it merged into `issue-121-code-native-landing`, not `main`. PR #125 is closed and must not be reopened or reused.
Stop condition: prove #126 already exists on `origin/main`, or open one clean recovery PR from `origin/main` re-landing only #126.

## Current slice:

- Issue #126 is the only active implementation seam.
- Issue #121 landing work remains paused unless explicitly reassigned after this recovery seam.
- Issue #99 remains paused.
- Issue #48 remains the product doctrine.
- PR #124 is closed and superseded; it must not be reopened or reused for current work.
- PR #125 is closed and superseded; it must not be reopened or reused for current work.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Required enforcement outcome for #126

Re-land only the #126 egress files missing from `origin/main`: free-plan/egress gates, run-brief query_budget receipt, `ACTION_RUN_BRIEF_FACTS_SELECT`, auth admin lookup cache and collapse tests, and middleware localhost full-generation fail-closed guard.

Required proof: npm run gate:command; npm run gate:continuity; npm run gate:free-plan; npm run lint; npm run build; npx vitest run app/api/settings/run-brief/__tests__/route.test.ts scripts/__tests__/free-plan-gate.test.ts lib/auth/__tests__/admin-user-cache.test.ts --reporter=verbose.

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

- No issue #121 landing implementation, issue #99, Slack, Stripe, dashboard product behavior, schema, issue #131, broad cleanup, or reopening PR #124/PR #125.

## Next exact move

Run issue #126 only in branch `issue-126-egress-reland-main`; keep the diff inside source-truth gate alignment and #126 implementation/test files, open one PR to `main` if patched, then stop after proof and receipt are posted.
