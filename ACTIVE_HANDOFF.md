# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-28 PT
Current `origin/main` SHA at update time: `af9f6e1d61def92af0175e14c0c5fc4fdedc8991`.

## Canonical Boot Sequence

For any Foldera task, use this order:

1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_LAUNCH_ROADMAP.md`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Current slice

- Issue #80 source-truth hygiene is complete enough to stop controlling new work:
  - PR #87 enforced source-truth continuity, stale-doc markers, PR template, README replacement, and continuity gate wiring.
  - PR #91 upgraded `docs/SOURCE_OF_TRUTH_MAP.md` into the operator-grade authority ledger.
- PR #92 was squash-merged into `origin/main` at `af9f6e1d61def92af0175e14c0c5fc4fdedc8991` to restore a buildable `components/foldera/LandingPage.tsx` after the manual interactive landing edit broke main.
- Issue #84 is now the active implementation seam.
- PRs #88 and #89 are older issue #84 landing polish attempts and must be treated as stale/superseded unless explicitly revalidated from current `origin/main`.
- Real Slack integration remains blocked pending issue #77 decision.

Active implementation seam is issue #84 (landing production polish / post-build-restore cleanup).

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Current truth

- `FOLDERA_LAUNCH_ROADMAP.md` is the long-form controlling roadmap.
- `docs/SOURCE_OF_TRUTH_MAP.md` classifies current, execution, proof, reference, archive, and stale source-truth files.
- `npm run gate:continuity` is the source-truth enforcement gate.
- Issue #84 is the active narrow implementation seam after PR #92 restored the landing build.
- Issue #77 gates any real Slack OAuth/API/send implementation.

## Enforcement mechanism

- Repo files + GitHub issues are source of truth over chat memory.
- Brandon is not the messenger between ChatGPT and Codex; update GitHub source-of-truth first.
- If a rule is not enforced by npm gate, CI check, required repo file, or test, it is incomplete.
- `npm run gate:continuity` enforces the boot sequence, stale-doc markers, README replacement, PR template, PR Sentinel wiring, and inactive stale contract.

## Forbidden unless explicitly assigned

- No real Slack OAuth/API/send implementation.
- No backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes.
- No repo hygiene broad cleanup outside the active seam.
- No new landing redesign or interactive landing rewrite without a new controlling issue.
- No direct edits to `main`.

## Next exact move

Run issue #84 only:

1. Verify current `origin/main` landing build after PR #92.
2. Treat PRs #88 and #89 as stale/superseded unless they are revalidated from current `origin/main`.
3. If additional landing polish is still required, open one fresh issue #84 PR from current `origin/main` with proof.
4. Stop after one PR or a no-change proof comment.
