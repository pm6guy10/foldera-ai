# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-15 15:22 PT
Current slice: Auth account switching and Google OAuth redirect proof.
Current `origin/main`: `58f78bd374e1fb493ef08e4ab621ed4f7c66cc87`.
Production deployment: `dpl_QyQS8cyfsCjagxSHdKDWERefxVCA`, `READY`.
Production `/api/health`: `status=ok`, `build=58f78bd`, `revision.git_sha=58f78bd374e1fb493ef08e4ab621ed4f7c66cc87`.
Current release gate: `GATE_9_REAL_NON_OWNER_BETA`.
Release gate status: `BLOCKED_EXTERNAL`.

## Current Truth

- Production, Vercel, and `origin/main` agree on `58f78bd374e1fb493ef08e4ab621ed4f7c66cc87`.
- NextAuth production cookies are shared only on Vercel `foldera.ai` hosts via `.foldera.ai`; local `next start` keeps host-only cookies so Playwright and localhost auth still work.
- Dashboard sign-out uses `SIGN_OUT_CALLBACK_URL=/?signedOut=1`; focused Playwright now proves the signed-in owner can sign out, return to login, and cannot see Brandon's dashboard after sign-out.
- Google sign-in and `/api/google/connect` now request account choice with `prompt=consent select_account`.
- Microsoft sign-in and `/api/microsoft/connect` now request account choice with `prompt=select_account`.
- Required Google Cloud redirect URIs are documented and guarded for both NextAuth and standalone connector callbacks on `www.foldera.ai`, `foldera.ai`, and localhost.
- Connector proof is not beta proof. `GATE_9_REAL_NON_OWNER_BETA` still needs one real non-owner account to sign in and connect Google or Microsoft in production.

## Verification

- `npm run health`: PASS, `RESULT: 0 FAILING`.
- `npm run gate:status`: PASS through `GATE_8`, stops honestly at external `GATE_9_REAL_NON_OWNER_BETA`.
- Vercel READY and production `/api/health` SHA proof passed for `58f78bd374e1fb493ef08e4ab621ed4f7c66cc87`.
- Focused Vitest: auth provider prompts, Google/Microsoft connector authorize URLs, and Google redirect docs passed (`9/9`).
- Focused Playwright: dashboard sign-out/account reset, public Google/Microsoft sign-in account-choice requests, and settings connector redirects passed.
- `npm run build`: PASS after clearing stale generated `.next` output from the first failed build attempt.
- `npm run gate:frontend`: PASS; browser screenshot matrix and interaction matrix passed; banned-copy audit and layout contract passed; production current screenshots are not newly claimed for this auth/config seam.
- `npm run lint`: PASS.

## Decision

`PROVEN - clean account-switching proof and Google OAuth redirect guards are local-main verified.`

The remaining Google `redirect_uri_mismatch` fix is external: the Google Cloud Console OAuth client must include all four production redirect URIs from `docs/GOOGLE_OAUTH_REDIRECTS.md`.

## Next exact move

Manual external step: update the Google Cloud Console OAuth client with all four production redirect URIs. Then one real non-owner user must sign in and connect Google or Microsoft in production for `GATE_9_REAL_NON_OWNER_BETA`.

## Do Not Touch

- Schema, migrations, migration-history repair, or destructive SQL
- Paid generation or model-backed proof
- Outbound email
- Stripe
- Fake users, token rows, source rows, artifacts, documents, deadlines, emails, or beta proof
- Artifact-selection or artifact-generation logic
- Unrelated dashboard polish
