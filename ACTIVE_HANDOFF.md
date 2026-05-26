# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-26 PT

## Current slice:

Launch readiness recovery chain.

The landing storyboard PR #71 is merged. The repo must stop acting like the landing hero seam is still active. The active execution order is now:

1. Finish PR #68 backend token-safety/free-plan egress gate.
2. Run public launch-truth copy pass so the landing page is pilot-honest.
3. Prove Slack test-mode Right Now loop locally.
4. Only then consider real Slack OAuth/API/bot send work.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

## Current truth

- Issue #48 remains the product contract: Workday Presence Layer, not dashboard triage.
- PR #71 merged the six-slide storyboard landing page into `components/foldera/LandingPage.tsx` with CTA hotspots on slide 1 and slide 6.
- Issue #72 is now the launch-readiness recovery controller: backend gate first, public truth pass second, Slack test-mode proof third.
- Issue #67 / PR #68 is the immediate active backend/security seam.
- PR #68 remains open and must be repaired on branch `codex/issue-67-free-plan-gate`; do not create a new PR for that seam.
- Slack is not connected. Current Slack work is test-mode only. No real Slack API, bot credentials, or production messaging should be claimed or built until the test-mode loop is proven and a dedicated real-Slack issue exists.
- The public page is pilot-only until unsupported Slack/Teams/cross-app writeback/enterprise claims are removed or clearly qualified.

## Enforcement mechanism

- Use the Targeted Context Rule from `AGENTS.md`: manually tag the active handoff, controlling issue, active PR, exact failing files/routes/gates/tests, and direct imports only.
- Do not give Codex generic full-repo permission when the seam is known.
- Issue #72 controls execution order.
- PR #68 must pass `npm run gate:free-plan` and enforce forbidden token-value selects by repo gate, not chat instructions.
- Frontend launch-truth work must be frontend-only and may not touch backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction/live sends.

## Forbidden unless explicitly assigned

- Broad repo audits.
- New landing-page redesigns before launch-truth copy is honest.
- Real Slack OAuth/API/bot send before PR #68 is merged and issue #52 test-mode proof exists.
- Backend/auth/Supabase/schema/Stripe/billing/dashboard/scoring/conviction work during the frontend launch-truth pass.
- Fake customer proof, fake enterprise logos, fake compliance claims, fake Slack/Teams integrations, or fabricated user proof.
- Expanding the next seam into a full product/navigation/app redesign.

## Next exact move

Repair existing PR #68 on branch `codex/issue-67-free-plan-gate`.

Use targeted context only:

- `ACTIVE_HANDOFF.md`
- Issue #67
- PR #68
- `app/api/integrations/status/route.ts`
- `app/api/cron/nightly-ops/route.ts`
- `lib/integrations/connector-health.ts`
- `lib/cron/connector-health.ts`
- `lib/cron/acceptance-gate.ts`
- `lib/ops/beta-readiness.ts`
- `scripts/free-plan-gate.ts`
- `scripts/health-connectors.ts`
- `scripts/health.ts`
- `scripts/__tests__/free-plan-gate.test.ts`
- `scripts/__tests__/health-connectors.test.ts`

Required: fix the current CI failure, remove forbidden `user_tokens.access_token` / `user_tokens.refresh_token` selects from health/status/readiness/nightly-ops/acceptance-gate/connector-health paths, allow token-value reads only in auth/OAuth/sync/provider execution paths, and make `npm run gate:free-plan` enforce this permanently.

Do not touch landing page, dashboard UX, Stripe, scoring, conviction, Workday Presence copy, schema unrelated to this seam, or new integrations.

## Proof required

For PR #68:

- `npm run gate:free-plan` PASS.
- focused connector-health/status/readiness tests PASS.
- `npm run lint` PASS.
- `npm run build` PASS.
- GitHub CI green.
- PR #68 mergeable.
- no forbidden token-value selects remain outside allowed auth/OAuth/sync/provider paths.

## Stop condition

Stop when PR #68 is green, mergeable, and merged. Then run the frontend-only public launch-truth pass from issue #72.