# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-22 PT
Current `origin/main` SHA at update time: `c166d238c73f68b879c33ba5c785945079cdfc81`.
Latest verified runtime/product baseline: production `/api/health` on deployment `dpl_BsZm2iEp2zwx3PJyfeAqCDQPtFnL`.

## Current slice

Issue #62 / PR #66 homepage image swap is merged.

Current active execution seam is issue #67 / PR #68: Free-plan Supabase egress and token-value select enforcement on branch `codex/issue-67-free-plan-gate`.

PR #68 is open but stale because its branch was created before the homepage merge. Update/rebase it against current `main`, resolve only merge/gate fallout, rerun proof, and merge only if green.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

## Current truth

- Issue #48 remains the product contract: Workday Presence Layer, not dashboard triage.
- Issue #62 / PR #66 landed the public homepage as an image-based landing page with CTA hotspots and public-route proof.
- Issue #67 is the active backend/cost-control seam: remove token-value payload from repeated connector health/status/readiness paths and enforce that with `npm run gate:free-plan`.
- PR #68 claims changes across connector-health, beta-readiness, nightly-ops staleness, health, acceptance-gate paths, focused tests, lint, health, and build.
- PR #68 must not be expanded into product, homepage, auth, dashboard, Stripe, schema, scoring, conviction, or connector-intelligence work.

## Enforcement mechanism

- `npm run gate:free-plan` must fail if `access_token` or `refresh_token` values are selected outside allowed auth/sync/provider execution paths.
- `npm run lint` must pass.
- `npm run health` must pass or report only known non-blocking warnings.
- `npm run build` must pass.
- Focused tests for touched connector-health/status/beta-readiness/acceptance-gate seams must pass.

## Forbidden unless explicitly assigned

- Homepage or landing-page visuals after PR #66.
- Dashboard UX, Morning Anchor, Right Now card copy, or public marketing polish.
- Auth provider setup, billing, Stripe, schema unrelated to issue #67.
- Live Slack/Teams/email sends.
- Proactive triggers, connector intelligence, durable thread ledger.
- PR #44, PR #46, Dependabot.
- `scorer.ts` and `conviction-engine.ts`.

## Exact next Codex prompt

Read `ACTIVE_HANDOFF.md`, issue #48, issue #67, and PR #68 first. Continue only PR #68 / issue #67 on branch `codex/issue-67-free-plan-gate`: update/rebase against current `main` after PR #66 merge, resolve only merge conflicts or gate fallout caused by the stale base, do not change homepage/dashboard/auth/billing/schema/scoring/conviction/live-send behavior, run `npm run gate:free-plan`, focused tests for touched seams, `npm run lint`, `npm run health`, and `npm run build`, then report SHA, files changed, gates, remaining blocker, and merge readiness. Stop after proof.

## Proof required

- PR #68 updated against current `main`.
- `npm run gate:free-plan` PASS.
- Focused tests PASS.
- `npm run lint` PASS.
- `npm run health` PASS or only documented non-blocking warnings.
- `npm run build` PASS.
- PR comment includes current truth, issue implemented, files changed, proof run, remaining blocker, next human decision.

## Stop condition

Stop when PR #68 is either green and merge-ready against current `main`, or blocked by a specific failing gate with the exact file/test/error identified. Do not start issue #55, connector intelligence, homepage polish, or dependency work.
