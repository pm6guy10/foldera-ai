# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-16 06:02 PT
Current slice: GATE_9A no-paid first-run activation split.
Current mode: FOLDERA NO-PAID FIRST-RUN VALUE MODE; no paid generation, outbound email, Stripe, schema, fake users/rows/signals/actions/artifacts, owner data, or fake beta proof.
Current origin/main before this local slice: 974eb3d3b257981b2b879cb89861882d1c9132c2.
Last known production SHA before this local slice: 974eb3d3b257981b2b879cb89861882d1c9132c2.
Current release gate: GATE_9A_FIRST_RUN_ACTIVATION
First failing release gate: GATE_9_REAL_NON_OWNER_BETA
Release gate status: BLOCKED_EXTERNAL

## Current Truth

- Read-only Supabase proof for micro1: user `398a8c82-d110-4dea-9b53-004d0f406149`, email `zz933@expert.micro1.ai`, reserved owner/test match count `0`, provider `google`, token_count `1`, access/refresh tokens present, disconnected_at `null`, oauth_reauth_required_at `null`.
- No `integrations` row exists for micro1, and that is expected: connector status is based on `user_tokens`; the old `integrations` table is deprecated for this path.
- Source truth: signal_count `2`, processed_signal_count `0`, unprocessed_signal_count `2`, latest Gmail signal ingested `2026-05-15 22:44:00.324716+00`, action_count `0`, pipeline_run_count `0`, user token last_synced_at `null`.
- real non-owner first-run state: connected source Google; signal_count=2; processed_signal_count=0; unprocessed_signal_count=2; reason=not enough evidence for a safe move yet; next_action=Check sources now; nothing_sent=true.
- First-run readiness now exposes connected source, signal count, newest signal time, processed/unprocessed counts, metadata-only explanation, exact no-finished-move reason, what unlocks value next, and `Nothing was sent.` The dashboard can render that state without Brandon private data and links to Sources for the existing no-paid source check path.
- Welcome and OAuth-return copy no longer promise "first read arrives tomorrow" or vague scheduled pickup. They say first read depends on source freshness and enough useful mail/calendar activity, and nothing was sent.
- `GATE_9A_FIRST_RUN_ACTIVATION` can pass from the clear no-paid first-run waiting/no-safe state. `GATE_9_REAL_NON_OWNER_BETA` must not pass from that alone; it still needs source-backed action or explicit tester feedback. Token-only, welcome-email-only, unprocessed-signal-only, owner/test/canary, and mock harness proof do not pass either gate.

## Verification

- Read-only Supabase query: PASS for real non-owner exclusion and first-run source counts above; no fabricated rows and no mock harness counted.
- Focused source-readiness, dashboard model, and release-gate split tests: PASS, `3` files / `21` tests.
- `npm run health`: PASS, `RESULT: 0 FAILING`; warning only `Last generation do_nothing`.
- `npm run gate:status`: PASS; `GATE_9A_FIRST_RUN_ACTIVATION` passed and `GATE_9_REAL_NON_OWNER_BETA` stayed `BLOCKED_EXTERNAL` with reason `Full beta proof still requires source-backed action or explicit tester feedback after first-run activation.`
- `npm run build`: PASS; `/api/source-readiness` is included in the production bundle.
- `npm run lint`: PASS.
- Focused non-owner Playwright path: PASS, `1/1`; proves the connected low-data user sees newest signal, metadata explanation, no-finished-move reason, `Nothing was sent.`, `Check sources now`, no outbound send attempt, source-backed move, safe approval/save, and history readback.
- CI guard repair proof: `app/dashboard/page.tsx` is `986` lines after extracting source-status loading into `app/dashboard/use-dashboard-source-status.ts`; `tests/config/__tests__/large-file-splits.test.ts` and `tests/config/__tests__/docs-source-of-truth.test.ts` passed.
- `npm run gate:frontend`: PASS; screenshot matrix (`27/27`), interaction matrix, banned-copy audit, layout contract, and production current screenshots receipt markers all passed the frontend product truth gate.
- GitHub/main product proof: `9588f1e649573fbb9ace9c07509c557dd0e8b1ec`, commit message `Fix first-run CI guards`.
- Vercel production: READY deployment `dpl_3Z5dbKqjT1vqFkowniFbrMP9wCav` for `9588f1e649573fbb9ace9c07509c557dd0e8b1ec`.
- Production `/api/health`: HTTP 200 with `revision.git_sha=9588f1e649573fbb9ace9c07509c557dd0e8b1ec`, `build=9588f1e`, `deployment_id=dpl_3Z5dbKqjT1vqFkowniFbrMP9wCav`, and `vercel_env=production`.
- Receipt-only deployment readback: after committing the final truth receipt, Vercel production deployment `dpl_FXu6mc2jVsADnwdX8Tt39t18UEho` became READY and production `/api/health` returned `revision.git_sha=0601d2d367fd15d20ea5dbf393654e7803c1b7bb`. This SHA changed receipt docs only; product proof remains the `9588f1e...` first-run activation repair.

## Decision

`LOCAL PROOF PASSED - GATE_9A is the no-paid first-run activation gate; GATE_9 remains blocked until source-backed action or explicit tester feedback.`

First-run activation no longer passes as token-only/no-value proof, and it no longer counts as full beta success. The intended live proof is a useful real non-owner source-readiness/no-safe state with provider, signal count, newest signal time, processed/unprocessed counts, metadata explanation, no-finished-move reason, next unlock, `Check sources now`, and `Nothing was sent.`

## Next exact move

Commit and push this GATE_9A split, then verify GitHub CI, Vercel READY, and production `/api/health` for the exact pushed SHA. Do not call this full beta success.

## Do Not Touch

- Stripe/payment behavior
- Schema or destructive SQL
- Paid/model generation
- Outbound email beyond existing welcome-email tests
- Backend artifact-generation logic
- Fake users, token rows, source rows, artifacts, documents, deadlines, emails, or beta proof
- Broad dashboard polish
