# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-15 16:08 PT
Current slice: Onboarding truth repair.
Current mode: FOLDERA ONBOARDING TRUTH REPAIR; no backend artifact logic, schema, paid generation, outbound email, Stripe, fake users, fake beta proof, or broad redesign.
Current `origin/main`: `41b8b5d77cc4eecfcc0aa3cd2a14351dd1bb934e`.
Last verified runtime/product SHA before this local slice: `41b8b5d77cc4eecfcc0aa3cd2a14351dd1bb934e`.
Latest receipt/docs status: onboarding repair is local pending commit; final GitHub CI, Vercel READY, and production `/api/health` proof are pending for the commit that contains this slice.
GitHub CI status: pending for this local onboarding patch.
Vercel deployment: `dpl_2nZnrxuCVx6fuJkaNzXi4BCv47gW`, `READY`, production SHA `41b8b5d77cc4eecfcc0aa3cd2a14351dd1bb934e`.
Production `/api/health`: `status=ok`, `build=41b8b5d`, `revision.git_sha=41b8b5d77cc4eecfcc0aa3cd2a14351dd1bb934e`.
Current release gate: `GATE_9_REAL_NON_OWNER_BETA`.
Release gate status: `BLOCKED_EXTERNAL`.
Safe to proceed: yes for onboarding local/browser proof and delivery; production proof is not yet current for this local patch.

## Current Truth

- First-run `/onboard` is now source-connection only in local browser proof.
- First-run no-source state shows Connect Google and Connect Microsoft, privacy/no-send-from-mailbox reassurance, and a disabled Continue button.
- First-run connected-source state shows `Continue to dashboard`, posts no focus buckets, and no longer renders Career, Relationships, Finances, Health, `What matters most to you?`, or `Skip for now`.
- `/onboard?edit=true` still intentionally exposes focus editing and can save/cancel without a source gate.
- Existing pending checkout resume behavior after connected first-run setup is preserved in mocked Playwright proof.
- No backend artifact logic, schema, paid generation, outbound email, Stripe action, fake user, fake token row, source row, or beta proof was used.
- Real non-owner beta remains externally blocked; this is onboarding truth repair, not GATE_9 proof.

## Verification

- `npm run health`: PASS, `RESULT: 0 FAILING`.
- `npm run gate:status`: PASS through `GATE_8`; stopped at external `GATE_9_REAL_NON_OWNER_BETA`.
- `npm run build`: PASS via `npm.cmd run build`.
- `npm run lint`: PASS.
- Focused Playwright: `npx playwright test tests/e2e/authenticated-routes.spec.ts -g "Onboarding /onboard" --reporter=list` PASS (`4/4`).
- Focused Playwright: `npx playwright test tests/e2e/non-owner-beta-harness.spec.ts -g "no-token user" --reporter=list` PASS (`1/1`).
- `npm run gate:frontend`: browser screenshot matrix PASS (`27/27` dashboard money-shot checks), interaction matrix PASS, banned-copy audit PASS, layout contract PASS; production current screenshots are not newly claimed for this onboarding seam.

## Decision

`LOCAL PROOF PASSED - first-run onboarding is source-connection only.`

Production proof is still pending until this local slice is committed, pushed, GitHub CI is checked, Vercel deploys the final commit, and production `/api/health` serves that SHA.

## Next exact move

Commit and push the onboarding repair, then verify GitHub CI, Vercel READY, and production `/api/health` for the exact final `origin/main` SHA. If those disagree, stop on live-truth drift before starting another product seam.

## Do Not Touch

- Backend artifact selection or generation logic
- Schema, migrations, migration history, or destructive SQL
- Paid/model generation
- Outbound email
- Stripe
- Fake users, token rows, source rows, artifacts, documents, deadlines, emails, or beta proof
- Broad redesign or unrelated dashboard polish
