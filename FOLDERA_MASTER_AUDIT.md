# FOLDERA MASTER AUDIT

## NEEDS_REVIEW

- 2026-03-23 — Production smoke expectation drift on authenticated `/login` and `/start`
  `npm run test:prod` failed 2 tests after the JWT onboarding-claim change set because the stored authenticated session was redirected away from `/login` and `/start`, so the suite could not find the sign-in heading or OAuth buttons. Local verification for the requested change is green (`npm run build`, `npx playwright test tests/e2e/`), but the production smoke suite needs to be updated to reflect the authenticated redirect behavior.
