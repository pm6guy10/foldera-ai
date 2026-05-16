# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-16 06:17 PT
Current slice: GATE_9A no-paid first-run activation split external receipt.
Current mode: FOLDERA NO-PAID FIRST-RUN VALUE MODE; no paid generation, outbound email, Stripe, schema, fake users/rows/signals/actions/artifacts, owner data, or fake beta proof.
Current origin/main receipt SHA at last readback: 129462e9929f458671a66a20aaa427ddd47aea4d.
Last verified product behavior SHA: 41a577bbf0476a928e7b2d463d0ef5edf4515bf5.
Latest receipt/docs status: receipt-only commit `129462e9929f458671a66a20aaa427ddd47aea4d` was pushed, GitHub green, Vercel READY, and production `/api/health` read back. This file may be contained in a later receipt-only commit; that does not change product/runtime proof.
Current release gate: GATE_9A_FIRST_RUN_ACTIVATION
First failing release gate: GATE_9_REAL_NON_OWNER_BETA
Release gate status: BLOCKED_EXTERNAL

## Current Truth

- Read-only Supabase proof for micro1: user `398a8c82-d110-4dea-9b53-004d0f406149`, email `zz933@expert.micro1.ai`, reserved owner/test match count `0`, provider `google`, token_count `1`, access/refresh tokens present, disconnected_at `null`, oauth_reauth_required_at `null`.
- No `integrations` row exists for micro1, and that is expected: connector status is based on `user_tokens`; the old `integrations` table is deprecated for this path.
- Source truth: signal_count `2`, processed_signal_count `0`, unprocessed_signal_count `2`, latest Gmail signal ingested `2026-05-15 22:44:00.324716+00`, action_count `0`, pipeline_run_count `0`, user token last_synced_at `null`.
- Real non-owner first-run state: connected source Google; signal_count=2; processed_signal_count=0; unprocessed_signal_count=2; reason=not enough evidence for a safe move yet; next_action=Check sources now; nothing_sent=true.
- First-run readiness now exposes connected source, signal count, newest signal time, processed/unprocessed counts, metadata-only explanation, exact no-finished-move reason, what unlocks value next, and `Nothing was sent.` The dashboard can render that state without Brandon private data and links to Sources for the existing no-paid source check path.
- `GATE_9A_FIRST_RUN_ACTIVATION` can pass from the clear no-paid first-run waiting/no-safe state. `GATE_9_REAL_NON_OWNER_BETA` must not pass from that alone; it still needs source-backed action or explicit tester feedback.

## Verification

- `npm run health`: PASS, `RESULT: 0 FAILING`.
- `npm run gate:status`: PASS; `GATE_9A_FIRST_RUN_ACTIVATION` passed and `GATE_9_REAL_NON_OWNER_BETA` stayed `BLOCKED_EXTERNAL` with reason `Full beta proof still requires source-backed action or explicit tester feedback after first-run activation.`
- Focused source-readiness, dashboard model, and release-gate split tests: PASS, `3` files / `21` tests.
- Focused non-owner Playwright path: PASS, `1/1`; proves the connected low-data user sees newest signal, metadata explanation, no-finished-move reason, `Nothing was sent.`, `Check sources now`, no outbound send attempt, source-backed move, safe approval/save, and history readback.
- `npm run build`: PASS; `/api/source-readiness` is included in the production bundle.
- `npm run lint`: PASS.
- `npm run gate:frontend`: PASS; screenshot matrix (`27/27`), interaction matrix, banned-copy audit, layout contract, and production current screenshots receipt markers all passed.
- GitHub CI for product behavior SHA `41a577bbf0476a928e7b2d463d0ef5edf4515bf5`: PASS (`CI` 25962661679 and 25962661681, `Health Gate` 25962661684, `semgrep` 25962661690, `Production E2E` 25962717044, `Deploy to Vercel` 25962665566 / 25962865382).
- Vercel production for runtime/product SHA: READY deployment `dpl_6BHQ5KyeFbMEkkVwaYGgwHkfbxQN`, aliases include `www.foldera.ai` and `foldera.ai`.
- Production `/api/health`: `status=ok`, `build=41a577b`, `revision.git_sha=41a577bbf0476a928e7b2d463d0ef5edf4515bf5`, `deployment_id=dpl_6BHQ5KyeFbMEkkVwaYGgwHkfbxQN`, `vercel_env=production`.
- Receipt-only close-out proof: commit `129462e9929f458671a66a20aaa427ddd47aea4d` passed GitHub (`CI` 25963038328, `Health Gate` 25963038327, `Deploy to Vercel` 25963042098), Vercel deployment `dpl_6fVgQuqoaoG3XxAcPPzYFQAFwwUu` became READY, and production `/api/health` returned `build=129462e`, matching `revision.git_sha=129462e9929f458671a66a20aaa427ddd47aea4d`.

## Decision

`PROVEN - GATE_9A is the no-paid first-run activation gate; GATE_9 remains blocked until source-backed action or explicit tester feedback.`

First-run activation no longer passes as token-only/no-value proof, and it no longer counts as full beta success. The intended live proof is a useful real non-owner source-readiness/no-safe state with provider, signal count, newest signal time, processed/unprocessed counts, metadata explanation, no-finished-move reason, next unlock, `Check sources now`, and `Nothing was sent.`

## Next exact move

After this receipt-only update is pushed and externally verified, continue to real beta repeatability proof only when a real non-owner source-backed action or explicit tester feedback exists. Do not call GATE_9A full beta success.

## Do Not Touch

- Stripe/payment behavior
- Schema or destructive SQL
- Paid/model generation
- Outbound email beyond existing welcome-email tests
- Backend artifact-generation logic
- Fake users, token rows, source rows, artifacts, documents, deadlines, emails, or beta proof
- Broad dashboard polish
