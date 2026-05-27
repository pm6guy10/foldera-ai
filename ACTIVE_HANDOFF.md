# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-27 PT
Current `origin/main` SHA at update time: `f08592a9f6b58c81f31d26baf07b730973dd8b1d`.

## Boot sequence

For any Foldera task:
1. Confirm repo `pm6guy10/foldera-ai`.
2. Read this file first.
3. Read `FOLDERA_LAUNCH_ROADMAP.md`.
4. Read issue #78 (roadmap control), issue #48 (product doctrine), and issue #84 (active seam).

Current slice:
- PR #82 merged at `f08592a9f6b58c81f31d26baf07b730973dd8b1d`; issue #81 is complete.
- Active implementation seam is issue #84 (landing-page spacing and production polish after PR #82).
- Repo hygiene / continuity cleanup is queued next under issue #80 and issue #79 after issue #84 is complete.
- Real Slack integration remains blocked pending issue #77 decision.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Current truth

- `FOLDERA_LAUNCH_ROADMAP.md` is the long-form controlling roadmap.
- Issue #78 is the roadmap/continuity lock issue.
- Issue #84 is the active narrow implementation seam.
- Issue #80 and issue #79 control queued repo-truth cleanup and continuity enforcement.
- Issue #77 gates any real Slack OAuth/API/send implementation.
- Issue #67/PR #68, issue #72/PR #73, issue #52/PR #74, PR #75, PR #82, and PR #83 are merged.

## Enforcement mechanism

- Repo files + GitHub issues are source of truth over chat memory.
- Brandon is not the messenger between ChatGPT and Codex; update GitHub source-of-truth first.
- If a rule is not enforced by npm gate, CI check, required file, or test, it is incomplete.
- `tests/config/__tests__/docs-source-of-truth.test.ts` enforces this file contract.

## Forbidden unless explicitly assigned

- No real Slack OAuth/API/send implementation.
- No backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes.
- No repo hygiene, README, backlog, authority-map, stale-doc, or continuity-gate cleanup inside issue #84.
- No broad cleanup outside the active seam.

## Next exact move

Run issue #84 only, then report proof.
