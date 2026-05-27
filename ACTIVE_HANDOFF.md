# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-27 PT
Current `origin/main` SHA at update time: `ce67813cbdaf0f3d9bc286f6a185deebdf86426e`.

## Canonical Boot Sequence

For any Foldera task, use this order:

1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_LAUNCH_ROADMAP.md`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

Current slice:
- PR #86 was squash-merged into `origin/main` at `ce67813cbdaf0f3d9bc286f6a185deebdf86426e`.
- Issue #84 remains open but paused while issue #80 is explicitly assigned.
- Issue #79 is coordinated by the continuity-gate and PR-template enforcement in issue #80.
- Real Slack integration remains blocked pending issue #77 decision.

Active implementation seam is issue #80 (source-truth hygiene, stale-doc classification, continuity enforcement).

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Current truth

- `FOLDERA_LAUNCH_ROADMAP.md` is the long-form controlling roadmap.
- `docs/SOURCE_OF_TRUTH_MAP.md` classifies current, execution, proof, reference, archive, and stale source-truth files.
- Issue #80 is the active narrow implementation seam by explicit user assignment.
- Issue #84 is next only after issue #80 is complete unless GitHub source truth changes.
- Issue #77 gates any real Slack OAuth/API/send implementation.

## Enforcement mechanism

- Repo files + GitHub issues are source of truth over chat memory.
- Brandon is not the messenger between ChatGPT and Codex; update GitHub source-of-truth first.
- If a rule is not enforced by npm gate, CI check, required file, or test, it is incomplete.
- `npm run gate:continuity` enforces the boot sequence, stale-doc markers, README replacement, PR template, PR Sentinel wiring, and inactive stale contract.

## Forbidden unless explicitly assigned

- No real Slack OAuth/API/send implementation.
- No backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes.
- No landing redesign or dashboard work.
- No broad cleanup outside the active seam.

## Next exact move

Run issue #80 only, open one PR with proof, then stop for merge/review unless the user explicitly assigns the next issue.
