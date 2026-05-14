# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-13 18:46 PT
Last known production SHA: 76a8ff6fa35990d098787bcdbbf8ae3575074ec4
Last completed code commit: 76a8ff6
Current slice: Winner evidence/risk framing
Current mode: Evidence/risk framing only; no new gate, no proof packet, no UI polish, no paid generation, no outbound email, no Stripe, no schema, no beta-readiness claim, do not weaken discrepancy-card quality.
Current release gate: GATE_9_REAL_NON_OWNER_BETA
First failing release gate: GATE_9_REAL_NON_OWNER_BETA
Release gate status: BLOCKED_EXTERNAL
Current quality gate: QG_10_ARTIFACT_QUALITY
First failing quality gate: NONE
Quality gate status: PASS
Current visual gate: QG_11_VISUAL_FRONTEND_QUALITY
First failing visual gate: NONE
Visual gate status: PASS

## Current truth

- Health is non-blocking: Gmail fresh, Outlook fresh, mail cursors current, and last generation is `write_document`.
- Production `/api/health` served winner risk-framing commit `76a8ff6fa35990d098787bcdbbf8ae3575074ec4`.
- Release gate stops at `GATE_9_REAL_NON_OWNER_BETA` because no real connected non-owner account exists.
- `npm run gate:quality` reports `QG_10_ARTIFACT_QUALITY` as `PASS` from deterministic fixtures only.
- `npm run gate:visual` reports `QG_11_VISUAL_FRONTEND_QUALITY` as `PASS` from deterministic mock visual/browser proof only.
- `npm run gate:decision-trace` reports `QG_13_DECISION_TRACE_QUALITY` as `PASS` from deterministic fixtures only.
- `npm run winner:autopsy` now selects the document-collection deadline candidate. The earlier no-safe result was caused by exposure risk text hiding real deadline/submission risk as `weak_risk; reminder_without_risk`.
- `docs/WINNER_EVIDENCE_RISK_REVIEW.md` names the closest candidate, evidence found/missing, exact files/rules, and narrow fix.
- Mock, owner, fixture, screenshot, and deterministic proof do not claim beta readiness.

## Verified proof

- health: PASS `npm run health` -> `RESULT: 0 FAILING`.
- release gate: PASS/BLOCKED_EXTERNAL `npm run gate:status` -> first failing release gate `GATE_9_REAL_NON_OWNER_BETA`.
- quality gate: PASS `npm run gate:quality` -> `FIRST_FAILING_QUALITY_GATE: NONE`.
- visual gate: PASS `npm run gate:visual` -> `FIRST_FAILING_VISUAL_GATE: NONE`.
- decision trace gate: PASS `npm run gate:decision-trace` -> `FIRST_FAILING_DECISION_TRACE_GATE: NONE`.
- focused weak-risk proof: PASS `npx vitest run lib/briefing/__tests__/discrepancy-card-frame.test.ts lib/briefing/__tests__/discrepancy-detector.test.ts --reporter=verbose` -> `122/122`.
- winner autopsy: PASS `npm run winner:autopsy` -> selected Tier 1 `admin_deadline_decision_packet`; no graph drift; no action needed; no no-safe reason.
- production: PASS `/api/health` -> `revision.git_sha=76a8ff6fa35990d098787bcdbbf8ae3575074ec4`.

## Remaining blockers

- Real beta readiness still requires one real non-owner tester to connect Google or Microsoft.
- Owner-private winner truth now selects the document-collection deadline move because missing risk evidence is hydrated and visible.
- Do not use fake users, owner data, `TEST_USER_ID`, mock harnesses, or deterministic fixtures as beta proof.

## Next exact move

1. Return to the external release blocker: one real non-owner account must connect Google or Microsoft.
2. Do not use fake users, owner data, mock harnesses, or deterministic fixtures as beta proof.
3. If working owner-private winner truth, keep the selected document-collection deadline move grounded in its source trail.

## Do not touch

- UI polish or frontend redesign
- landing copy
- paid generation
- outbound email
- Stripe or pricing
- schema or destructive DB actions
- fake users, owner-only proof, or beta-readiness claims
