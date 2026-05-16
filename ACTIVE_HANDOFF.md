# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-15 18:56 PT
Current slice: First-run activation production truth receipt.
Current mode: FOLDERA CLEAN FINAL TRUTH VERIFY MODE; no product buildout, UI polish, schema, paid generation, outbound email, Stripe, fake users/rows/sources/artifacts, or fake beta proof.
Product proof baseline SHA: 9588f1e649573fbb9ace9c07509c557dd0e8b1ec.
Most recent receipt-only production health readback before this wording correction: 0601d2d367fd15d20ea5dbf393654e7803c1b7bb.
Most recent Vercel production deployment before this wording correction: dpl_FXu6mc2jVsADnwdX8Tt39t18UEho, READY for 0601d2d367fd15d20ea5dbf393654e7803c1b7bb.
Current release gate: GATE_9_REAL_NON_OWNER_BETA
First failing release gate: NONE
Release gate status: PASS

## Current Truth

- Read-only Supabase proof for micro1: user `398a8c82-d110-4dea-9b53-004d0f406149`, email `zz933@expert.micro1.ai`, reserved owner/test match count `0`, provider `google`, token_count `1`, access/refresh tokens present, disconnected_at `null`, oauth_reauth_required_at `null`.
- No `integrations` row exists for micro1, and that is expected: connector status is based on `user_tokens`; the old `integrations` table is deprecated for this path.
- Source truth: signal_count `2`, processed_signal_count `0`, unprocessed_signal_count `2`, latest Gmail signal ingested `2026-05-15 22:44:00.324716+00`, action_count `0`, pipeline_run_count `0`, user token last_synced_at `null`.
- real non-owner first-run state: connected source Google; signal_count=2; processed_signal_count=0; unprocessed_signal_count=2; reason=not enough evidence for a safe move yet; next_action=Check sources now; nothing_sent=true.
- First-run readiness now exposes connected source, source counts, processed/unprocessed counts, last checked, next check timing, exact no-action reason, and `Nothing was sent.` The dashboard can render that state without Brandon private data and links to Sources for the existing no-paid source check path.
- Welcome and OAuth-return copy no longer promise "first read arrives tomorrow" or vague scheduled pickup. They say first read depends on source freshness and enough useful mail/calendar activity, and nothing was sent.
- GATE_9 no longer passes from token-only, welcome-email-only, or unprocessed-signal-only proof. It passes only from a clear first-run waiting/no-safe state with counts/reason/next action/nothing-sent truth, or a source-backed move with source trail and safe controls/history.

## Verification

- Read-only Supabase query: PASS for real non-owner exclusion and first-run source counts above; no fabricated rows and no mock harness counted.
- Focused unit/model/gate/onboarding/source-readiness plus CI guard tests: PASS, `7` files / `28` tests.
- `npm run health`: PASS, `RESULT: 0 FAILING`; warning only `Last generation do_nothing`.
- `npm run gate:status`: PASS through `GATE_9_REAL_NON_OWNER_BETA`; proof found is the real non-owner first-run state with source counts, reason, next action, and nothing-sent truth.
- `npm run build`: PASS; `/api/source-readiness` is included in the production bundle.
- `npm run lint`: PASS.
- Focused non-owner Playwright path: PASS, `6/6`; it proves dashboard source-readiness copy, `Check sources now`, existing no-paid sync path, source-backed move, source trail, Save/Skip, no outbound send attempt, and history readback.
- CI guard repair proof: `app/dashboard/page.tsx` is `986` lines after extracting source-status loading into `app/dashboard/use-dashboard-source-status.ts`; `tests/config/__tests__/large-file-splits.test.ts` and `tests/config/__tests__/docs-source-of-truth.test.ts` passed.
- `npm run gate:frontend`: PASS; screenshot matrix, interaction matrix, banned-copy audit, layout contract, and production current screenshots receipt markers all passed the frontend product truth gate.
- GitHub/main product proof: `9588f1e649573fbb9ace9c07509c557dd0e8b1ec`, commit message `Fix first-run CI guards`.
- Vercel production: READY deployment `dpl_3Z5dbKqjT1vqFkowniFbrMP9wCav` for `9588f1e649573fbb9ace9c07509c557dd0e8b1ec`.
- Production `/api/health`: HTTP 200 with `revision.git_sha=9588f1e649573fbb9ace9c07509c557dd0e8b1ec`, `build=9588f1e`, `deployment_id=dpl_3Z5dbKqjT1vqFkowniFbrMP9wCav`, and `vercel_env=production`.
- Receipt-only deployment readback: after committing the final truth receipt, Vercel production deployment `dpl_FXu6mc2jVsADnwdX8Tt39t18UEho` became READY and production `/api/health` returned `revision.git_sha=0601d2d367fd15d20ea5dbf393654e7803c1b7bb`. This SHA changed receipt docs only; product proof remains the `9588f1e...` first-run activation repair.

## Decision

`PROVEN - origin/main, Vercel production READY, production /api/health, release gates, and handoff agree on the first-run activation source-readiness truth.`

First-run activation no longer passes as token-only/no-value proof. The live proof is a useful real non-owner source-readiness/no-safe state with source counts, processed/unprocessed counts, reason, next action, and `Nothing was sent.`

## Next exact move

Continue to real beta repeatability proof only after a fresh clean checkout is aligned to `origin/main`. Do not reopen token-only GATE_9 proof without fresh failing evidence.

## Do Not Touch

- Stripe/payment behavior
- Schema or destructive SQL
- Paid/model generation
- Outbound email beyond existing welcome-email tests
- Backend artifact-generation logic
- Fake users, token rows, source rows, artifacts, documents, deadlines, emails, or beta proof
- Broad dashboard polish
