# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-18 06:20 PT
Current slice: docs-only operating-system alignment for issue-driven PR execution.
Current mode: docs-only update; no product code, backend, schema, Supabase, Stripe, auth, or dependency changes.
Current `origin/main` SHA at handoff update time: `7db9924642c058b29ca2e86e07b9eaea46cd1cfd`.
Latest commit kind: product/runtime commit (issue #15 merge).
Last verified runtime/product SHA: `7db9924642c058b29ca2e86e07b9eaea46cd1cfd`.
Latest receipt/docs status: pending docs-only PR for operating-system instruction alignment.
GitHub Actions for the latest `origin/main` head: verify in active PR flow for this docs-only update before merge.
Latest verified Vercel production deployment: `dpl_4ahwdHZmrS1gGFKADt7G24M3GKv9`, READY for `7db9924642c058b29ca2e86e07b9eaea46cd1cfd`.
Production `/api/health` for the latest `origin/main` head: `status=ok`, `build=7db9924`, `revision.git_sha=7db9924642c058b29ca2e86e07b9eaea46cd1cfd`, `deployment_id=dpl_4ahwdHZmrS1gGFKADt7G24M3GKv9`.
Current release gate: PRE_BETA_READINESS_THRESHOLD
First failing release gate: PRE_BETA_READINESS_THRESHOLD
Release gate status: BLOCKED_EXTERNAL
Current quality gate: QG_10_ARTIFACT_QUALITY PASS
Current visual gate: QG_11_VISUAL_FRONTEND_QUALITY PASS

## Issue/PR Workflow Receipt (Today)

- Gates/controllers remain the selector for the next failing truth condition.
- Execution wrapper is mandatory: one issue -> one clean branch/worktree -> one PR -> one merge/reject decision -> one production SHA verification.
- Controlled autopilot is selector-only; no multi-issue autonomous execution.
- Frontend/dashboard issue PRs require screenshots in PR body/comments.

## Current Truth

- Source coverage is no longer just display copy. The Today path now treats it as operating law.
- Proven states in this slice: `thin`, `usable`, `rich`, `not_ready`, `obligation_only`, `context_ready`, and `operator_ready`.
- The Today card keeps exactly one next connector visible. Unsupported future connectors are labeled as `Next unlock`, not fake-working connect controls.
- Existing source trail, Save, Skip, Approve, history, and no-send behavior remain intact.
- micro1 is Brandon-controlled and is internal owner-alias proof only. It cannot satisfy `GATE_9_REAL_NON_OWNER_BETA`.
- owner-alias clear no-safe state (micro1): connected source Google; `signal_count=111`; `processed_signal_count=111`; `unprocessed_signal_count=0`; reason=no current Tier 1 or Tier 2 candidate proved a fresh, grounded discrepancy; next_action=ask tester feedback or wait for stronger evidence; nothing_sent=true.
- `PRE_BETA_READINESS_THRESHOLD` must pass before Foldera tells the operator to seek an external tester.
- Required deployed proof for that threshold:
  - a new tester can connect Google or Microsoft and reach one honest Today answer
  - Today is governed by source coverage
  - thin graphs show `Fix this first`
  - earned clear state requires sufficient coverage
  - source trail, no-send boundary, Save/Skip/Approve/history, and `Next unlock` remain intact
  - tester-facing expectation is explicit: Foldera may show `Do this`, `You're clear right now`, or `Fix this first`
- Full `GATE_9_REAL_NON_OWNER_BETA` can still close through either explicit proof branch only after the pre-beta threshold passes:
  - `real non-owner source-backed move` with source trail plus safe controls/history
  - `explicit tester feedback: real non-owner tester` saying the waiting state was understandable and useful enough to keep trusting Foldera
- Fake, synthetic, mock, owner, reserved test, and owner-canary proof remain excluded.

## Verification

- Red-first focused proof caught the missing operating-law cases, then the source-coverage / source-readiness / dashboard model suite passed (`20/20`).
- `npm run health`: PASS, `RESULT: 0 FAILING`.
- `npm run gate:status`: `PRE_BETA_READINESS_THRESHOLD` is now the first failing release gate and reports `BLOCKED_EXTERNAL` until deployed first-run readiness is proven.
- `npm run gate:quality`: PASS.
- `npm run gate:visual`: PASS.
- `npm run gate:frontend`: screenshot matrix, interaction matrix, banned-copy audit, and layout contract passed.

## Decision

`PROVEN - PRE_BETA_READINESS_THRESHOLD GATE IMPLEMENTED.`

## Next exact move

Stop this slice here. The next live blocker is deployed first-run proof: prove the pre-beta threshold before routing Foldera toward any true external tester.

## Do Not Touch

- Broad integrations or a connector marketplace
- Stripe/payment behavior
- Schema or destructive SQL
- Paid/model generation
- Outbound email
- Fake users, rows, signals, actions, artifacts, or beta proof
- Brandon owner data, `OWNER_USER_ID`, or `TEST_USER_ID` as beta proof
- Manual AI-chat import as the main path

