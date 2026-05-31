# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-31 PT
Current `origin/main` SHA at update time: `7784505f42f3ee16713a36d619f4ea0ceaa640fd`.

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

- Issue #113 source-truth closeout enforcement is complete; PR #114 merged at `2292181e0e81c505256637272d0e612cd10440a2`.
- Issue #120 public-funnel route contract is complete; PR #122 merged at `7784505f42f3ee16713a36d619f4ea0ceaa640fd` and issue #120 is closed/completed.
- Issue #121 is active in PR #125 on branch `issue-121-code-native-landing`; it is still open and owns the landing-page frontend contract + code-native LP repair seam.
- Issue #126 Supabase egress burn-down was merged into the active issue #121 branch via PR #127.
- Issue #99 remains paused until issue #121 is proven and merged.
- Issue #84 and PR #95 remain paused.
- Issue #48 remains the product contract.
- Issue #77 still gates any real Slack implementation decision.

Active implementation seam is issue #121 (landing page frontend contract + code-native LP repair). Issue #126 is complete inside the active PR chain and must not become the active seam.

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
- PR #122 proved the public funnel route contract; issue #121 owns landing-page contract and code-native LP repair.
- PR #127 merged issue #126 egress burn-down into the issue #121 branch: duplicate `settings/run-brief` action reads are collapsed, query-budget receipts exist, auth admin lookups are cached, and localhost full run-brief generation is fail-closed unless explicitly allowed.

## Forbidden unless explicitly assigned

- No #99 implementation.
- No Slack work.
- No backend/auth rewrite/schema/Stripe/dashboard/scoring/conviction product behavior changes.
- No Supabase downgrade inside issue #121.
- No broad cleanup outside the assigned seam.
- No direct edits to `main` outside explicit handoff/source-truth maintenance.

## Next exact move

For issue #121 / PR #125:

1. Keep PR #125 draft until Vercel/checks are green and visual proof is acceptable.
2. Fix continuity/build failures before visual polish.
3. Confirm `/start` CTA routing still works.
4. Confirm mobile and desktop landing screenshots look intentional.
5. Do not merge PR #125 until the PR is no longer draft, Vercel is green, and the landing visual proof is accepted.
6. Do not downgrade Supabase until live Supabase usage confirms projected API/database egress is below 5 GB/month.

## Stop condition

Issue #121 stops when PR #125 has green proof, acceptable mobile/desktop landing visuals, safe `/start` routing, source-truth closeout, and a merge-ready GitHub receipt.
