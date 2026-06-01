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

Issue #121 landing polish is paused until #123 is enforced by code, not just written in chat or Markdown.

## Why #123 is active before #121

The current failure is not visual polish skill. The failure is process drift:

- extra PRs get created
- old PRs get reused
- source-truth files contradict each other
- chat memory becomes the operating system
- Brandon becomes the project manager
- proof links replace real screenshot/build evidence

That must be blocked by repo code before landing work resumes.

## Current slice

- Issue #113 source-truth closeout enforcement is complete; PR #114 merged at `2292181e0e81c505256637272d0e612cd10440a2`.
- Issue #120 public-funnel route contract is complete; PR #122 merged at `7784505f42f3ee16713a36d619f4ea0ceaa640fd`.
- PR #129 landing hotfix merged at `aeb4e73c2a89cedfc8fdccdd7f8fa0dba4b0f03d`.
- PR #124 is closed and superseded; it must not be reopened or reused for current work.
- PR #125 is closed and superseded; it must not be reopened or reused for current work.
- Issue #123 is now the active blocker.
- Issue #121 is next after #123, not active implementation.
- Issue #99 remains paused.
- Issue #48 remains the product doctrine.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Required enforcement outcome for #123

The repo must contain a deterministic command gate that fails locally and in CI when:

1. ACTIVE_HANDOFF.md and FOLDERA_BUILD_ORDER.yaml disagree on the active issue.
2. .foldera-contract.json disagrees with the active issue.
3. More than one active implementation seam is declared.
4. A closed PR is named as the active execution lane.
5. A landing PR exists while issue #121 is not the active issue.
6. A PR touches files outside the active contract allowed paths.
7. A PR omits required proof commands.
8. A user-facing frontend PR omits mobile and desktop screenshot proof.
9. A PR receipt uses a protected Vercel preview link as the proof instead of screenshots/build/route evidence.
10. A next step creates a parallel issue instead of using the active issue.

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

Run issue #123 only:

1. Implement a repo command gate that enforces the active seam and anti-sprawl rules.
2. Wire it into npm scripts and CI.
3. Add failing and passing fixtures/tests.
4. Update FOLDERA_BUILD_ORDER.yaml and .foldera-contract.json to agree with issue #123.
5. Keep the work inside PR #130 only.
6. Stop after proof is posted.
