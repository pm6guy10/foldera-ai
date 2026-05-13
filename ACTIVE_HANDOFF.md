# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-13 11:44 PT
Last known production SHA: 4b964ab
Last completed code commit: current harness commit pending push
Current slice: Non-owner beta mock harness map + first missing harness
Current mode: Harness only; no UI polish, no paid generation, no outbound email, no Stripe, no schema.

## Current product truth

- Health is non-blocking: Gmail fresh, Outlook fresh, mail cursors current, and last generation is `write_document`.
- Production still has selected-move artifact `8aca653a-f0a1-46e9-9af4-323c5cee539b` as owner `pending_approval` `write_document`; that is not non-owner beta proof.
- Real non-owner depth remains externally blocked until one real non-owner connects Google or Microsoft.
- Mock-only beta harness map now exists at `NON_OWNER_BETA_HARNESS_MAP.md`.
- First missing harness is implemented in `tests/e2e/non-owner-beta-harness.spec.ts`.
- The harness uses `33333333-3333-4333-8333-333333333333`, explicitly not `OWNER_USER_ID` or `TEST_USER_ID`.
- The harness proves simulated `/start` -> `/onboard` no-token block -> connected-source dashboard path -> waiting/no-safe-move -> source-backed artifact -> source trail -> Save/Skip controls -> approval with no outbound send attempts -> history readback.

## Verified proof

- health: PASS `npm run health` -> `RESULT: 0 FAILING`.
- build: PASS `npm run build`.
- focused browser proof: PASS `npx playwright test tests/e2e/non-owner-beta-harness.spec.ts --reporter=list` (`4/4`).
- dashboard/API proof: PASS latest/history/execute/dashboard-model tests (`26/26`).
- auth/onboarding/connect proof: PASS auth/onboard/google/microsoft tests (`12/12`).
- exclusion grep: PASS `acceptance-gate.ts` excludes `OWNER_USER_ID` and `TEST_USER_ID`; harness id differs from both.

## Remaining defects in current slice

- None for the first missing mock harness.
- Mock proof is not real beta readiness.
- Real beta readiness still requires one real connected non-owner account.

## Next exact move

1. Commit and push this harness/map slice to `main`.
2. Verify deploy/production SHA because repo state changed.
3. Stop if the only remaining blocker is still one real non-owner tester connecting Google or Microsoft.

## Do not touch

- landing copy or frontend polish
- controller/meta
- Brandon owner data as proof
- fabricated production users
- paid generation
- outbound email
- Stripe
- schema or destructive DB actions

## External blocker

- One real non-owner tester must connect Google or Microsoft before real beta readiness can be claimed.
