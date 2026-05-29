# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-29 PT
Current `origin/main` SHA at update time: `0c2e10a65d086502fe61dec9d3751ad087b30c85`.

## Canonical Boot Sequence

For any Foldera task, use this order:

1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_LAUNCH_ROADMAP.md`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Current slice:

- Issue #106 final repo hygiene is complete; PR #107 merged at `0c2e10a65d086502fe61dec9d3751ad087b30c85`.
- Issue #113 is the active source-truth closeout enforcement seam.
- Issue #99 remains paused until issue #113 is merged.
- Issue #84 and PR #95 remain paused.
- Issue #48 remains the product contract.
- Issue #77 still gates any real Slack implementation decision.

Active implementation seam is issue #113 (Codex source-truth closeout enforcement).

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `BLOCKED`, `PROOF`, `PR OPENED`, `MERGE READY`, or `STOPPED`.
- Every PR must close source truth before stop.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue, paused issue list, priority class, or work type changes.
- If a source-truth file is not updated, the PR receipt must say `unchanged - reason` or `not applicable - reason`.
- No Codex run may silently leave a stale handoff or build order.

## Current truth

- `FOLDERA_LAUNCH_ROADMAP.md` is the long-form controlling roadmap.
- `FOLDERA_BUILD_ORDER.yaml` is the machine-readable controller contract.
- `docs/SOURCE_OF_TRUTH_MAP.md` classifies current, execution, proof, reference, archive, and stale source-truth files.
- `npm run gate:continuity` is the source-truth enforcement gate.
- Repo files + GitHub issues are source of truth over chat memory.
- Brandon is not the messenger between ChatGPT and Codex; update GitHub source of truth first.
- PR #107 proved final hygiene; issue #113 now repairs the factory rule that allowed the handoff/build order to remain stale.

## Forbidden unless explicitly assigned

- No landing work.
- No Slack work.
- No backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes.
- No #99 implementation until issue #113 is merged.
- No broad cleanup outside the issue #113 source-truth closeout seam.
- No direct edits to `main`.

## Next exact move

Run issue #113 only:

1. Enforce source-truth closeout in `ACTIVE_HANDOFF.md`, `FOLDERA_BUILD_ORDER.yaml`, `.github/pull_request_template.md`, `scripts/continuity-gate.ts`, `AGENTS.md`, and `CODEX_START.md`.
2. Ensure `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` agree on the active issue.
3. Require PR receipts to mark source-truth files as `updated`, `unchanged - reason`, or `not applicable - reason`.
4. Preserve #99 as next/paused; do not implement it.
5. Run `npm run gate:continuity`, `npm run lint`, and `npm run build`.
6. Open one PR and write the terminal GitHub receipt before stop.
