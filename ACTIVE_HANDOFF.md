# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-13 13:26 PT
Last known production SHA: 6b0c163
Last completed code commit: b67600e
Current slice: GATE_9_REAL_NON_OWNER_BETA external blocker verified
Current mode: Release truth only; no product features, no UI polish, no paid generation, no outbound email, no Stripe, no schema.
Current release gate: GATE_9_REAL_NON_OWNER_BETA
First failing release gate: GATE_9_REAL_NON_OWNER_BETA
Release gate status: BLOCKED_EXTERNAL

## Current product truth

- Health is non-blocking: Gmail fresh, Outlook fresh, mail cursors current, and last generation is `write_document`.
- Production `/api/health` serves `6b0c163564a8646075ef904c1f82a2ff441c7a36`, deployment `dpl_3Jd2tsD8CGoAeVWkvdB9TpZLsMwP`.
- Production still has selected-move artifact `8aca653a-f0a1-46e9-9af4-323c5cee539b` as owner `pending_approval` `write_document`; that is not non-owner beta proof.
- Real non-owner depth remains externally blocked until one real non-owner connects Google or Microsoft.
- Mock-only beta harness map now exists at `NON_OWNER_BETA_HARNESS_MAP.md`.
- First missing harness is implemented in `tests/e2e/non-owner-beta-harness.spec.ts`.
- The harness uses `33333333-3333-4333-8333-333333333333`, explicitly not `OWNER_USER_ID` or `TEST_USER_ID`.
- The harness proves simulated `/start` -> `/onboard` no-token block -> connected-source dashboard path -> waiting/no-safe-move -> source-backed artifact -> source trail -> Save/Skip controls -> approval with no outbound send attempts -> history readback.
- Release gate controller is shipped and live; `npm run gate:status` is the current release program.
- Read-only production token proof found `0` connected non-owner Google/Microsoft provider rows after excluding `OWNER_USER_ID` and `TEST_USER_ID`.

## Verified proof

- health: PASS `npm run health` -> `RESULT: 0 FAILING`.
- release truth: PASS production `/api/health` -> `6b0c163564a8646075ef904c1f82a2ff441c7a36`.
- build: PASS `npm run build`.
- release gate unit: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/release-gate-status.test.ts --reporter=verbose` (`3/3`).
- preflight contract unit: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/preflight-contract.test.ts --reporter=verbose` (`16/16`).
- gate status: PASS `npm run gate:status` -> first failing gate `GATE_9_REAL_NON_OWNER_BETA`, `BLOCKED_EXTERNAL`.
- GATE_9 DB proof: PASS read-only `user_tokens` query excluding owner/test IDs -> `connectedNonOwnerTokenRows: 0`, `connectedNonOwnerUserIds: []`.
- focused browser proof: PASS `npx playwright test tests/e2e/non-owner-beta-harness.spec.ts --reporter=list` (`4/4`).
- dashboard/API proof: PASS latest/history/execute/dashboard-model tests (`26/26`).
- auth/onboarding/connect proof: PASS auth/onboard/google/microsoft tests (`12/12`).
- exclusion grep: PASS `acceptance-gate.ts` excludes `OWNER_USER_ID` and `TEST_USER_ID`; harness id differs from both.
- production SHA: PASS `https://www.foldera.ai/api/health` -> `6b0c163564a8646075ef904c1f82a2ff441c7a36`, deployment `dpl_3Jd2tsD8CGoAeVWkvdB9TpZLsMwP`.

## Remaining defects in current slice

- None for the release gate controller.
- Mock proof is not real beta readiness.
- Real beta readiness still requires one real connected non-owner account.

## Next exact move

1. Stop.
2. Do not build product work, polish UI, fabricate users, or count owner/mock proof.
3. Resume only when one real non-owner tester connects Google or Microsoft, then rerun `npm run gate:status` and prove GATE_9 from real provider rows.

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
