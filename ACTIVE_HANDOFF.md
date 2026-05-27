# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-26 PT
Current `origin/main` SHA at update time: `0ef966c`.

## Current slice:

Launch readiness recovery chain.

Immediate active seam: frontend launch-truth pass from issue #72.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

## Current truth

- Issue #48 remains the product contract: Workday Presence Layer, not dashboard triage.
- PR #71 landing storyboard is merged; this does not change issue #67 backend scope.
- Issue #67 / PR #68 is merged on `main` at `0ef966c5b1e67fbc6f7c3f697bc9bdf2e431bc23`.
- GitHub main checks and Vercel production deployment are green for merge SHA `0ef966c`.
- Production `/api/health` now reports `revision.git_sha=0ef966c5b1e67fbc6f7c3f697bc9bdf2e431bc23` and deployment `dpl_Bu9jd7EP9jB7AzLtRxB4GX3VAcVf`.
- Next active seam is issue #72 frontend launch-truth pass (no backend/auth/Stripe/schema/scoring expansion).

## Enforcement mechanism

- Frontend launch-truth pass remains frontend-only.
- No landing redesign expansion, Slack implementation, dashboard UX, Stripe/billing, schema, scoring, or conviction edits in this next seam.

## Forbidden unless explicitly assigned

- Landing-page redesign work.
- Dashboard UX work.
- Stripe/billing changes.
- Scoring/conviction changes.
- Workday Presence copy changes.
- Unrelated schema/integration work.

## Next exact move

Execute issue #72 launch-truth pass using targeted context only, with frontend-only changes that remove unsupported public claims while preserving the existing storyboard structure.

## Proof required

- Frontend-only changed files.
- `npm run lint` PASS.
- `npm run build` PASS.
- Public-route/playwright proof for launch-truth copy.

## Stop condition

Stop when issue #72 launch-truth pass has proof and receipt updates, without starting Slack or backend seams.
