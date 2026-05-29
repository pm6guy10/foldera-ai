# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-28 PT
Current `origin/main` SHA at update time: `905bf067370c5d0c92b09ccb25ba09f965ef16d9`.

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

- Issue #96 is the active implementation seam.
- PR #97 is the active draft PR for issue #96.
- Issue #84 landing polish is paused.
- PR #95 is paused and must not merge while issue #96 is open.
- Issue #94 remains the legacy issue quarantine control ticket.
- Issue #48 remains the product contract.
- Issue #77 gates any real Slack implementation decision.

Active implementation seam is issue #96 (enterprise hygiene quarantine and public ghost cleanup).

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Current truth

- `FOLDERA_LAUNCH_ROADMAP.md` is the long-form controlling roadmap.
- `docs/SOURCE_OF_TRUTH_MAP.md` classifies current, execution, proof, reference, archive, and stale source-truth files.
- `npm run gate:continuity` is the source-truth enforcement gate.
- Issue #96 temporarily overrides issue #84 until its proof passes.
- Issue #84 resumes only after issue #96 is resolved.

## Enforcement mechanism

- Repo files + GitHub issues are source of truth over chat memory.
- Brandon is not the messenger between ChatGPT and Codex; update GitHub source-of-truth first.
- If a rule is not enforced by npm gate, CI check, required repo file, or test, it is incomplete.
- `npm run gate:continuity` enforces the boot sequence, stale-doc markers, README replacement, PR template, PR Sentinel wiring, and inactive stale contract.

## Forbidden unless explicitly assigned

- No real Slack implementation.
- No dashboard rewrite.
- No schema, Supabase, or Stripe work.
- No landing merge while issue #96 is open.
- No direct edits to `main`.
- No broad cleanup outside issue #96.

## Next exact move

Run issue #96 only:

1. Continue PR #97 from branch `chatgpt/issue-96-public-ghost-cleanup`.
2. Prove the old public try surface is removed, paused, or safely redirected.
3. Fix public status copy if needed.
4. Remove high-confidence ghosts only with proof.
5. Classify demo and dev proof routes before changing them.
6. Run `npm run gate:continuity`, `npm run lint`, `npm run build`, and focused public-route proof.
7. Stop after one issue #96 PR proves the public ghost risk is closed.
