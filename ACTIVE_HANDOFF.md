# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-30 PT
Current `origin/main` SHA at update time: `2292181e0e81c505256637272d0e612cd10440a2`.

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
- Issue #120 is the active public-funnel route contract seam.
- Issue #99 remains paused until issue #120 is proven and merged.
- Issue #84 and PR #95 remain paused.
- Issue #48 remains the product contract.
- Issue #77 still gates any real Slack implementation decision.

Active implementation seam is issue #120 (public funnel route contract).

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
- PR #114 proved source-truth closeout enforcement; issue #120 now repairs the public funnel route contract before visual landing polish.

## Forbidden unless explicitly assigned

- No landing redesign or visual polish.
- No Slack work.
- No backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes.
- No #99 or #121 implementation.
- No broad cleanup outside the issue #120 route-contract seam.
- No direct edits to `main`.

## Next exact move

Run issue #120 only:

1. Produce the public route map before editing.
2. Fix only proven broken public CTA/route/guard behavior.
3. Add or update the public funnel regression gate.
4. Preserve #99 and #121 as not started.
5. Run `npm run gate:continuity`, `npm run lint`, `npm run build`, and the focused landing/auth route test.
6. Open one PR and write the terminal GitHub receipt before stop.
