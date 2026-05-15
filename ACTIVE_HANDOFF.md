# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-15 16:22 PT
Current slice: First-run activation readiness repair for real non-owner micro1.
Current mode: FOLDERA FIRST-RUN ACTIVATION REPAIR; no broad UI polish, Stripe, paid generation, outbound email beyond existing welcome-email tests, fake users/rows/sources/artifacts, or fake beta proof.
Current origin/main before this local slice: d33703c121f41cada06409aaef460f22c94a74bf.
Last known production SHA: d33703c121f41cada06409aaef460f22c94a74bf.
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

## Decision

`PROVEN LOCALLY - first-run non-owner reaches a useful human-readable state with source counts, reason, next action, and nothing-sent truth.`

The final commit must still be pushed to main, then verified through GitHub CI, Vercel READY, and production `/api/health` for the exact final `origin/main` SHA.

## Next exact move

Commit and push the repair, then verify GitHub CI, Vercel READY, and production `/api/health`. If any live-truth source disagrees, stop on that exact drift.

## Do Not Touch

- Stripe/payment behavior
- Schema or destructive SQL
- Paid/model generation
- Outbound email beyond existing welcome-email tests
- Backend artifact-generation logic
- Fake users, token rows, source rows, artifacts, documents, deadlines, emails, or beta proof
- Broad dashboard polish
