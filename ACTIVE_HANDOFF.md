# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-29 PT
Current `origin/main` SHA at update time: `ebad78cf443e87f6f72f92d26478c3f399c626de`.

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

- Issue #102 is the active implementation seam.
- Issue #101 branch/worktree hygiene receipt is posted.
- Issue #94 legacy issue classification receipt is posted.
- Issue #98 implementation PR is merged.
- Issue #99 is paused until issue #102 repo artifact hygiene completes.
- Issue #84 and PR #95 remain paused.
- Issue #48 remains the product contract.
- Issue #77 still gates any real Slack implementation decision.

Active implementation seam is issue #102 (repo artifact hygiene).

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
- No broad cleanup outside the issue #102 artifact-hygiene seam.
- No direct edits to `main`.

## Next exact move

Run issue #102 only:

1. Classify repo artifacts and generated proof remnants as keep/quarantine/delete candidates.
2. Remove only proven-stale artifacts that do not control active product behavior.
3. Preserve all paused/control seams (#99 planning spine and #84/#95 landing pause).
4. Keep issue and branch closure/deletion receipts explicit in GitHub.
5. Run `npm run gate:continuity`, `npm run lint`, and `npm run build`.
6. Open one PR and write the terminal GitHub receipt before stop.
