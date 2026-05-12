# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-12 12:25 PT
Last known production SHA: 38cc996
Last completed commit: 38cc996
Current slice: Frontend surface contract A-Z
Current mode: Frontend surface contract is live; production E2E public-nav assertion follow-up is locally proven and ready to push.

## Current product truth

- `/dashboard` keeps the full-screen authenticated app shell already shipped on main; this slice did not reopen dashboard layout components.
- Public landing nav is now server-auth-aware: logged-out `/` shows `Sign in` + `Start free`; logged-in `/` shows `Dashboard` instead of `Sign in`, without adding a client `/api/auth/session` poll.
- Legacy app surfaces that use `ProductShell` now share the same matte Foldera app background, wider app-width shell, cyan-edged header card, and mobile dashboard-section rail.
- Auth/onboarding surfaces (`/login`, `/start`, `/onboard`) now use the same premium matte app surface and centered cards without changing OAuth, onboarding, billing, source freshness, or outbound email contracts.
- Public/mobile route proof is green locally for landing, start, login, pricing, try, blog/legal/about/security/status/founder; authenticated route proof is green for dashboard/settings/onboarding/briefings/signals.
- Production deploy proof reached `38cc996` on `www.foldera.ai`; the remaining red is that `playwright.prod.config.ts` still loads checked-in production auth state globally whenever the file exists, even when deploy Production E2E is meant to be public-only.
- Production mobile auth checks now obey the same manual `FOLDERA_INCLUDE_AUTH_PROD_SMOKE=true` flag as the rest of production E2E; automatic deploy production E2E is public-only again.
- Production E2E now waits for `/api/health` to report the exact workflow SHA before running public route assertions, so deploy-status races fail at the SHA gate instead of producing ambiguous route-test reds.
- Production Playwright config now uses stored auth state only when `FOLDERA_INCLUDE_AUTH_PROD_SMOKE=true`, keeping deploy/scheduled production smoke anonymous by default.
- Production smoke now scopes locked `Get started free` copy to the main landing CTAs, while public nav remains `Start free` per the new auth-aware nav contract.
- Current health is non-blocking: Gmail fresh `6h ago`, Outlook fresh `6h ago`, `Mail cursors current`, and last generation `do_nothing`.

## Verified proof

- build: PASS `npm run build`
- lint: PASS `npm run lint`
- large-file split: PASS `npx vitest run tests/config/__tests__/large-file-splits.test.ts --reporter=verbose`
- public routes: PASS `npx playwright test tests/e2e/public-routes.spec.ts --reporter=list` (`52/52`)
- dashboard navigation: PASS `PLAYWRIGHT_WEB_PORT=3011 npx playwright test tests/e2e/dashboard-navigation.spec.ts --reporter=list` (`19/19`)
- authenticated routes: PASS `PLAYWRIGHT_WEB_PORT=3012 npx playwright test tests/e2e/authenticated-routes.spec.ts --reporter=list` (`38/38`)
- mobile visual QA: PASS `PLAYWRIGHT_WEB_PORT=3013 npx playwright test tests/e2e/mobile-visual-qa.spec.ts --reporter=list` (`11/11`)
- screenshots: PASS local captures in `%TEMP%/foldera-surface-contract-proof` for landing desktop/mobile, login mobile, start desktop, authenticated dashboard desktop/mobile, and settings mobile.
- production public smoke: PASS `npm run test:prod:ci` (`33 passed`, `28 skipped`)
- health: PASS `npm run health` -> `RESULT: 0 FAILING`

## Remaining defects in current slice

1. Push the production E2E public-nav assertion follow-up.
2. Verify GitHub CI green on the new commit.
3. Verify deploy/production SHA once Vercel promotes the follow-up commit.

## Next exact move

Start here:
1. Commit and push the production E2E public-nav assertion follow-up.
2. Verify GitHub CI green on the new commit.
3. Verify production deploy SHA after Vercel promotion.
4. Then return to the money-loop backlog; do not reopen dashboard/app-fit unless fresh proof breaks it.

## Do not touch yet

- controller/meta seams unless execution hard-fails
- backend/API
- paid generation
- outbound email
- Stripe charge
- schema migration
- destructive DB action

## Quarantined local drift

- Stashes remain for older dashboard experiments; do not apply them into this seam unless a current proof lane requires them.

## External blockers

- None for this frontend surface contract; GitHub CI and production deploy are the required final proof.

## Stop condition

Stop only when GitHub CI and deploy truth pass on the frontend surface contract commit.
