# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-21 17:40 PT
Current slice: PR #66 homepage image swap plus Production E2E SHA alignment fix is in progress on branch `codex/issue-62-homepage-clean`.
Current `origin/main` SHA at update time: `5898426c561261523c29470ae24b8d869b1d6933`.
Latest verified runtime/product baseline: origin/main before the homepage image swap.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

## Current truth

- Issue #62 remains the active homepage seam, and PR #66 also needs the CI-only Production E2E alignment fix to keep merge readiness honest.
- Homepage scope stays `components/foldera/LandingPage.tsx`, `public/foldera-homepage-final*.png`, public-route proof, frontend product-copy gate enforcement, screenshots, and receipt docs.
- The Production E2E guard is now allowed only as a deploy/check enforcement fix; no homepage visuals change.
- Forbidden for issue #62: dashboard behavior, backend, auth, billing, schema, connectors, live Slack/Teams/email sends, PR #44, PR #46, Dependabot, `scorer.ts`, and `conviction-engine.ts`.

## Proof (issue #62 local)

- `npm run health`: RESULT 0 FAILING; warning only: Last generation `do_nothing`.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run gate:frontend`: dashboard screenshot matrix PASS 27/27, interaction matrix PASS, banned-copy audit PASS, layout contract PASS, frontend product-copy test PASS; production current screenshots are not newly claimed for this local homepage PR.
- Production E2E alignment: the workflow now needs the Production-only guard pushed so preview deploys stop waiting for a production SHA that will not exist yet.

## Frontend gate receipt markers

- gate:frontend
- screenshot matrix
- interaction matrix
- banned-copy audit
- layout contract
- production current screenshots not newly claimed for issue #62 local proof

## Parked / forbidden unless explicitly assigned

- PR #44, PR #46, Dependabot
- live Slack/Teams/email send, connector intelligence, durable thread ledger
- billing, auth, dashboard behavior
- `scorer.ts`, `conviction-engine.ts`

## Next exact move

Commit and push the Production E2E guard fix on `codex/issue-62-homepage-clean`, let the PR rerun, and stop only when the required checks rerun green and the homepage still matches the image mock.
