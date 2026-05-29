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

## Current slice:

- Issue #98 is the active implementation seam.
- Issue #96 proof is complete enough for this follow-on contract seam.
- Issue #84 and PR #95 remain paused.
- Issue #48 remains the product contract.
- Issue #77 still gates any real Slack implementation decision.

Active implementation seam is issue #98 (repo-enforced GitHub writeback and build-order contract).

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

## Current truth

- `FOLDERA_LAUNCH_ROADMAP.md` is the long-form controlling roadmap.
- `FOLDERA_BUILD_ORDER.yaml` is the machine-readable controller contract.
- `docs/SOURCE_OF_TRUTH_MAP.md` classifies current, execution, proof, reference, archive, and stale source-truth files.
- `npm run gate:continuity` is the source-truth enforcement gate.
- Repo files + GitHub issues are source of truth over chat memory.
- Brandon is not the messenger between ChatGPT and Codex; update GitHub source of truth first.

## Forbidden unless explicitly assigned

- No landing work.
- No Slack work.
- No backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes.
- No broad cleanup outside the issue #98 contract seam.
- No direct edits to `main`.

## Next exact move

Run issue #98 only:

1. Add the permanent GitHub writeback rule to `ACTIVE_HANDOFF.md`.
2. Create `FOLDERA_BUILD_ORDER.yaml` with writeback-required terminal-state contract.
3. Make `scripts/continuity-gate.ts` fail on missing writeback/order rules.
4. Prove the gate fails when the writeback rule is removed.
5. Run `npm run gate:continuity`, `npm run lint`, and `npm run build`.
6. Open one PR and write the terminal GitHub receipt before stop.
