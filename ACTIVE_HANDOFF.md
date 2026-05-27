# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-27 PT
Current `origin/main` SHA at update time: `c52a798`.

## Boot sequence

For any Foldera question or Codex task:

1. Confirm repo: `pm6guy10/foldera-ai`.
2. Read this file first.
3. Read `FOLDERA_LAUNCH_ROADMAP.md`.
4. Read controlling roadmap issue #78.
5. Read issue #48 for product doctrine.
6. Read active implementation issue #81.
7. Check latest open PRs and most recent merged PR if repo/deploy state matters.
8. Only then answer, create issues, or code.

## Current slice

Production E2E #1360 investigation is classified.

Current active implementation seam: issue #81 — fix stale Production E2E landing CTA assertion after PR #75.

Real Slack integration remains blocked pending issue #77 decision.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

Issue #48 remains the product contract.

## Current truth

- `FOLDERA_LAUNCH_ROADMAP.md` exists and is the controlling launch roadmap.
- Issue #78 is the current roadmap/continuity lock issue.
- Issue #48 remains the product contract: Workday Presence Layer, not dashboard triage.
- Issue #67 / PR #68 is merged on `main` at `0ef966c5b1e67fbc6f7c3f697bc9bdf2e431bc23`.
- Issue #72 / PR #73 is merged on `main` at `0b21bd329d55135aafeab3ccf9d5c1ae0d541889`.
- Issue #52 / PR #74 is merged on `main` at `9b2e7096cf99a37a9b14d5ccabfd0fb0aacc437b`.
- PR #75 is merged on `main` at `48c0cb9ee45d6fcc49fafc82ae9cb97bd633a8f5`.
- Vercel production deployment for PR #75 is READY: `dpl_24v9N3K8W8cuuFYfYv1hcH9BKxJM`.
- Vercel project: `foldera-ai`, project ID `prj_eG5St3NmUtqYGXJwXsANdZBLYr9N`, team ID `team_y2RdnSgeVsCExRheya1QRB5z`.
- Supabase project: `Foldera`, ref `neydszeamsflpghtrhue`, status at continuity lock `ACTIVE_HEALTHY`.
- Issue #76 classified Production E2E #1360 as stale E2E expectation.
- Issue #81 is the active narrow fix issue for the stale production smoke assertion.
- Issue #77 exists to decide real Slack integration ownership, but no real Slack OAuth/API/send work is active yet.

## Enforcement mechanism

- Repo docs and GitHub issues beat chat memory.
- `FOLDERA_LAUNCH_ROADMAP.md` defines launch rungs and app continuity context.
- This file defines the current active seam.
- Issue #81 controls the next implementation fix.
- Issue #77 controls any future real Slack implementation decision.
- If a rule exists only in chat/comment/markdown and is not enforced by npm gate, CI, test, PR checklist, contract file, or required repo file, treat it as incomplete and propose enforcement.

## Forbidden unless explicitly assigned

- No real Slack OAuth/API/send implementation.
- No landing-page redesign.
- No new landing sections.
- No landing asset changes.
- No dashboard UX work.
- No Stripe/billing changes.
- No Supabase/schema changes.
- No scoring/conviction changes.
- No Workday Presence copy changes.
- No broad backend/frontend cleanup.
- No unrelated integration work.

## Next exact move

Run issue #81.

Goal: fix stale Production E2E landing CTA assertion after PR #75.

Required implementation:

1. Update `tests/production/smoke.spec.ts` so it no longer asserts an exact raw count of visible `/start` links in `main`.
2. Assert intended CTA hotspot contract using stable selectors where possible:
   - `landing-cta-1` exists and links to `/start`
   - `landing-cta-6` exists and links to `/start`
   - sections 2 through 5 do not expose CTA hotspots
3. Scope CTA copy checks to intended CTA elements only if copy remains part of the production contract.
4. Use `tests/e2e/landing-mobile-sections.spec.ts` as the current landing section contract reference.
5. Keep this test-only unless implementation selectors are proven missing.

## Exact Codex prompt

```text
Start by reading the repository, not chat.

Repo: pm6guy10/foldera-ai

Read first:
@ACTIVE_HANDOFF.md
@FOLDERA_LAUNCH_ROADMAP.md
Issue #48
Issue #76
Issue #81

Task: fix the stale Production E2E landing CTA assertion after PR #75.

Current truth:
- Issue #76 classified Production E2E #1360 as a stale E2E expectation.
- Active seam is issue #81.
- Failing file: tests/production/smoke.spec.ts
- The old assertion expected exactly two visible /start links in main.
- Actual production returned four.
- Intended landing contract is CTA hotspot only on section 1 and section 6.

Required:
1. Update tests/production/smoke.spec.ts so it no longer asserts an exact raw count of visible /start links in main.
2. Assert the intended CTA hotspot contract using stable selectors where possible:
   - landing-cta-1 exists and links to /start
   - landing-cta-6 exists and links to /start
   - sections 2 through 5 do not expose CTA hotspots
3. Scope CTA copy checks to intended CTA elements only if copy is still part of the production contract.
4. Use tests/e2e/landing-mobile-sections.spec.ts as the reference for the current landing section contract.
5. Keep this a test-only seam unless the test proves implementation selectors are missing.

Forbidden:
- no visual redesign
- no new landing sections
- no landing asset changes
- no Slack/Teams/OAuth/API/send work
- no backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes
- no health env work
- no unrelated cleanup
- do not reopen PR #75

Run proof:
- focused production smoke test or local equivalent for tests/production/smoke.spec.ts
- npm run lint
- npm run build

Report:
1. Files changed
2. Old assertion removed
3. New assertion contract
4. Proof commands/results
5. Confirmation forbidden work was not touched

Stop when one narrow PR is open and the focused smoke assertion passes locally/equivalently.
```

## Proof required

- Focused production smoke test or local equivalent passes.
- `npm run lint` passes.
- `npm run build` passes.
- PR changes only the stale test assertion path unless implementation selectors are proven missing.
- No real Slack implementation begins until issue #77 has a repo-backed decision and linked follow-up issue.

## Stop condition

Stop when issue #81 has one narrow PR open fixing only the stale assertion and proof is reported.
