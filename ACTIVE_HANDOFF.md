# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-13 12:56 PT
Last known production SHA: 7b129f4
Last completed code commit: 7b129f4
Current slice: Release gate status controller
Current mode: Controller/docs only; no product features, no UI polish, no paid generation, no outbound email, no Stripe, no schema.
Current release gate: GATE_9_REAL_NON_OWNER_BETA
First failing release gate: GATE_9_REAL_NON_OWNER_BETA
Release gate status: BLOCKED_EXTERNAL

## Current product truth

- Health is non-blocking: Gmail fresh, Outlook fresh, mail cursors current, and last generation is `write_document`.
- Production `/api/health` serves `7b129f41ca59e7cc4129157cb4d065c3ee47f249`; `origin/main` matches.
- Production still has selected-move artifact `8aca653a-f0a1-46e9-9af4-323c5cee539b` as owner `pending_approval` `write_document`; that is not non-owner beta proof.
- Real non-owner depth remains externally blocked until one real non-owner connects Google or Microsoft.
- Mock-only beta harness map now exists at `NON_OWNER_BETA_HARNESS_MAP.md`.
- First missing harness is implemented in `tests/e2e/non-owner-beta-harness.spec.ts`.
- The harness uses `33333333-3333-4333-8333-333333333333`, explicitly not `OWNER_USER_ID` or `TEST_USER_ID`.
- The harness proves simulated `/start` -> `/onboard` no-token block -> connected-source dashboard path -> waiting/no-safe-move -> source-backed artifact -> source trail -> Save/Skip controls -> approval with no outbound send attempts -> history readback.
- Release gate controller work is in progress: `docs/RELEASE_GATES.md`, `scripts/release-gate-status.ts`, and `npm run gate:status`.

## Verified proof

- health: PASS `npm run health` -> `RESULT: 0 FAILING`.
- release truth: PASS production `/api/health` -> `7b129f41ca59e7cc4129157cb4d065c3ee47f249`.
- build: PASS `npm run build`.
- release gate unit: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/release-gate-status.test.ts --reporter=verbose` (`3/3`).
- preflight contract unit: PASS `node node_modules/vitest/vitest.mjs run scripts/__tests__/preflight-contract.test.ts --reporter=verbose` (`16/16`).
- gate status: PASS `npm run gate:status` -> first failing gate `GATE_9_REAL_NON_OWNER_BETA`, `BLOCKED_EXTERNAL`.
- focused browser proof: PASS `npx playwright test tests/e2e/non-owner-beta-harness.spec.ts --reporter=list` (`4/4`).
- dashboard/API proof: PASS latest/history/execute/dashboard-model tests (`26/26`).
- auth/onboarding/connect proof: PASS auth/onboard/google/microsoft tests (`12/12`).
- exclusion grep: PASS `acceptance-gate.ts` excludes `OWNER_USER_ID` and `TEST_USER_ID`; harness id differs from both.
- production SHA: PASS `https://www.foldera.ai/api/health` -> `7b129f41ca59e7cc4129157cb4d065c3ee47f249`.

## Remaining defects in current slice

- Commit/push and post-deploy `/api/health` proof are still pending for the release gate controller.
- Mock proof is not real beta readiness.
- Real beta readiness still requires one real connected non-owner account.

## Next exact move

1. Finish `npm run gate:status`.
2. Prove health, build, gate status, harness, and reserved-user exclusion.
3. Commit and push the release gate controller.
4. Stop at GATE_9 unless a real non-owner tester connects Google or Microsoft.

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
