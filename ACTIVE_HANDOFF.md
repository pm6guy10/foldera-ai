# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-25 PT

## Current slice

Temporary active execution seam: public landing-page hero rebuild from the poster/reference direction.

This temporarily pauses issue #67 / PR #68 until the landing-page hero proof is complete. PR #68 remains open and must not be expanded while this temporary frontend seam is active.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

## Current truth

- Issue #48 remains the product contract: Workday Presence Layer, not dashboard triage.
- Issue #62 / PR #66 landed the public homepage as an image-based landing page with CTA hotspots and public-route proof.
- Issue #67 / PR #68 remains the backend/cost-control seam, but it is temporarily paused for this landing-page hero pass.
- The current temporary seam is frontend-only: rebuild the public landing-page hero as responsive live HTML/CSS from the poster/reference direction.
- The poster/reference image is art direction only, not the durable source of truth.

## Enforcement mechanism

- Changed files must stay frontend-only, expected primary file: `components/foldera/LandingPage.tsx` plus visual assets/styles only if required.
- Important text must be live/editable, not baked into AI-generated image pixels.
- Hero must be responsive and proved at 390x844, 768x1024, and 1440x1600.
- `npm run build` must pass.

## Forbidden unless explicitly assigned

- Backend, auth, Supabase, schema, Stripe, billing, dashboard, Morning Anchor, Right Now, connector-health, token-gate, scoring, conviction, or PR #68 work.
- Fake customer proof, fake enterprise logos, fake compliance claims, or fabricated user proof.
- Expanding the landing-page pass into a full product/navigation/app redesign.

## Exact next Codex prompt

Read `ACTIVE_HANDOFF.md` first. The active temporary seam is the public landing-page hero rebuild. Edit only frontend landing-page files, expected primary file `components/foldera/LandingPage.tsx`, plus visual assets/styles only if required. Use the poster/reference image as art direction only and rebuild the hero as responsive live HTML/CSS: black obsidian background, huge live headline, live subcopy, live CTA, reusable floating app/work-fragment cards, and CSS/SVG/vector vortex/glow background. Do not use baked AI text or logos as the source of truth. Do not touch backend/auth/Supabase/schema/Stripe/billing/dashboard/connector-health/token-gate/scoring/conviction/PR #68. Run `npm run build` and capture screenshots at 390x844, 768x1024, and 1440x1600. Report files changed, proof run, screenshots, remaining blocker, and whether the hero is launch-review ready. Stop after proof.

## Proof required

- Frontend-only changed files.
- `npm run build` PASS.
- Screenshot proof at 390x844, 768x1024, and 1440x1600.
- Hero preserves the poster's premium black/neon/obsidian feeling while using live text/components.

## Stop condition

Stop when the landing-page hero is responsive live code, visually close enough to the poster direction at mobile/tablet/desktop, and build/screenshot proof exists. Then return active execution to issue #67 / PR #68.