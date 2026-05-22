# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-21 16:52 PT
Current slice: issue #62 homepage-only image swap is in progress on branch `codex/issue-62-homepage-clean`.
Current `origin/main` SHA at update time: `5898426c561261523c29470ae24b8d869b1d6933`.
Latest verified runtime/product baseline: origin/main before the homepage image swap.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

## Current truth

- Issue #62 is the active homepage-only seam.
- Homepage scope: `components/foldera/LandingPage.tsx`, `public/foldera-homepage-final*.png`, contract allowance, public-route proof, frontend product-copy gate enforcement, screenshots, and receipt docs only.
- Forbidden for issue #62: dashboard behavior, backend, auth, billing, schema, connectors, live Slack/Teams/email sends, PR #44, PR #46, Dependabot, `scorer.ts`, and `conviction-engine.ts`.

## Proof (issue #62 local)

- `npm run health`: RESULT 0 FAILING; warning only: Last generation `do_nothing`.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run gate:frontend`: dashboard screenshot matrix PASS 27/27, interaction matrix PASS, banned-copy audit PASS, layout contract PASS, frontend product-copy test PASS; production current screenshots are not newly claimed for this local homepage PR.

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

Finish issue #62 only: commit and push `codex/issue-62-homepage-clean`, open one homepage-only PR, attach screenshots/proof, and stop.
