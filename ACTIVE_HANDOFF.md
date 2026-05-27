# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-26 PT
Current `origin/main` SHA at update time: `0b21bd3`.

## Current slice:

Launch readiness recovery chain.

Immediate active seam: issue #52 Slack test-mode proof (test-mode only).

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
- Issue #72 / PR #73 is merged on `main` at `0b21bd329d55135aafeab3ccf9d5c1ae0d541889`.
- PR #73 CI run `#1118` is green (`Status Success`), Vercel deployment is `success`, and production now serves merge SHA `0b21bd3`.
- Production page includes pilot-honest qualifiers for Slack/Teams execution and cross-app auto-send/writeback limits.
- Next active seam is issue #52 Slack test-mode proof only (no real Slack OAuth/API/send work).

## Enforcement mechanism

- Slack work remains test-mode only.
- No real Slack OAuth/API/send implementation, no backend expansion, no dashboard/Stripe/schema/scoring/conviction edits in this next seam.

## Forbidden unless explicitly assigned

- Landing-page redesign work.
- Dashboard UX work.
- Stripe/billing changes.
- Scoring/conviction changes.
- Workday Presence copy changes.
- Unrelated schema/integration work.

## Next exact move

Execute issue #52 Slack test-mode proof using targeted context only, proving the Right Now loop in test mode without enabling real Slack connectivity.

## Proof required

- Test-mode proof artifacts for issue #52.
- `npm run lint` PASS.
- `npm run build` PASS.
- No production Slack send claims.

## Stop condition

Stop when issue #52 Slack test-mode proof has receipt-grade evidence, without real Slack rollout or backend expansion.
