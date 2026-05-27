# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-27 PT
Current `origin/main` SHA at update time: `c65cc34`.

## Boot sequence

For any Foldera task:
1. Confirm repo `pm6guy10/foldera-ai`.
2. Read this file first.
3. Read `FOLDERA_LAUNCH_ROADMAP.md`.
4. Read issue #78 (roadmap control), issue #48 (product doctrine), and issue #81 (active seam).

Current slice:
- Active implementation seam is issue #81 (stale Production E2E landing CTA assertion fix).
- Production E2E #1360 is classified as stale expectation.
- Real Slack integration remains blocked pending issue #77 decision.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Current truth

- `FOLDERA_LAUNCH_ROADMAP.md` is the long-form controlling roadmap.
- Issue #78 is the roadmap/continuity lock issue.
- Issue #81 is the active narrow implementation seam.
- Issue #77 gates any real Slack OAuth/API/send implementation.
- Issue #67/PR #68, issue #72/PR #73, issue #52/PR #74, and PR #75 are merged on `main`.

## Enforcement mechanism

- Repo files + GitHub issues are source of truth over chat memory.
- If a rule is not enforced by npm gate, CI check, required file, or test, it is incomplete.
- `tests/config/__tests__/docs-source-of-truth.test.ts` enforces this file contract.

## Forbidden unless explicitly assigned

- No real Slack OAuth/API/send implementation.
- No landing redesign or asset changes.
- No backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes.
- No broad cleanup outside the active seam.

## Next exact move

Run issue #81 only, then report proof.