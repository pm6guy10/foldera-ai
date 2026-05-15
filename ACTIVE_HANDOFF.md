# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-15 13:27 PT
Current slice: Owner-controlled Microsoft canary guard; not real non-owner beta proof.
Current release gate: GATE_9_REAL_NON_OWNER_BETA
First failing release gate: GATE_9_REAL_NON_OWNER_BETA after live-truth receipt alignment.
Release gate status: BLOCKED_EXTERNAL
Last known production SHA: `18371dbf4a3e48e0998c92e4e22204e0b804c3c4`.
Latest product/runtime SHA verified: `18371dbf4a3e48e0998c92e4e22204e0b804c3c4`.
Latest receipt/docs status: Owner canary guard has local proof and is pending commit/push/deploy verification; do not require this file to embed its own future SHA.

## Current Truth

- Owner-controlled Outlook/Hotmail canary accounts are now excluded from real non-owner proof through `OWNER_CANARY_USER_IDS`.
- `NON_OWNER_DEPTH` excludes `OWNER_USER_ID`, `TEST_USER_ID`, and every `OWNER_CANARY_USER_IDS` value before checking subscriptions or persisted action evidence.
- `npm run gate:status` cannot pass real non-owner beta from owner, test, canary, mock, or fabricated evidence.
- `docs/OWNER_CANARY_TEST_RUNBOOK.md` contains the exact Microsoft canary steps: configure `OWNER_CANARY_USER_IDS`, connect Microsoft normally, verify honest source status, and never convert canary evidence into beta proof.
- Local proof passed for the isolated guard: focused acceptance/release-gate tests, preflight contract regression, `npm run health`, `npm run gate:status`, `npm run gate:frontend`, `npm run build`, and `npm run lint`.
- Previous live truth before this seam: Local HEAD and `origin/main` were aligned at `18371dbf4a3e48e0998c92e4e22204e0b804c3c4`.
- GitHub Actions for that SHA are green: `CI` runs `25931486377` and `25931486534`, `Health Gate` run `25931486401`, `semgrep` run `25931486391`, `Production E2E` run `25931613176`, and `Deploy to Vercel` runs `25931494966` / `25931919864` completed successfully.
- Vercel production deployment `dpl_54fgcku2vTXqGELLWy9aarA73voU` is `READY` for commit `18371dbf4a3e48e0998c92e4e22204e0b804c3c4`.
- Production `https://www.foldera.ai/api/health` returned `status=ok`, `build=18371db`, and `revision.git_sha=18371dbf4a3e48e0998c92e4e22204e0b804c3c4`.
- `npm run health` passed with `RESULT: 0 FAILING`; warnings were Gmail/Outlook fresh about 6h ago and last generation `do_nothing`.
- `npm run gate:quality`, `npm run gate:visual`, `npm run gate:frontend`, `npm run winner:autopsy`, `npm run gate:decision-trace`, `npm run build`, and `npm run lint` passed.
- After this receipt update, `npm run gate:status` passed GATE_0 and stopped honestly at `GATE_9_REAL_NON_OWNER_BETA` with `STATUS: BLOCKED_EXTERNAL`.
- Frontend receipt retained for GATE_9 eligibility: `gate:frontend` reran 27 Playwright checks plus focused gate tests and script proof; screenshot matrix result was `PASS` for finished, requirements-needed, no-safe, and Today/Recent Work/Sources/Account desktop/mobile committed baselines.
- Interaction matrix result: `PASS` for navigation, notification disabled status, Learn more, Upgrade to Pro, profile dropdown, Copy read, Copy draft, Open requirements packet, Skip, Save, Save packet, Approve, Sign out, source trail cards, disabled upload card, account controls, and icon-only labels.
- Banned-copy audit result: `PASS`; dashboard rendered text and dashboard UI source strings block backend/internal phrases plus shell filler copy.
- Layout contract result: `PASS` for compact desktop, standard desktop, wide desktop, and mobile containment checks.
- Production current screenshots: not newly captured in this GATE_9 verification-only run because no real non-owner user exists; no live frontend proof beyond the deployed SHA is being claimed here.
- Initial `npm run gate:status` failed only because this handoff was stale for the current production SHA; the live GitHub/main, Vercel, and `/api/health` SHAs were already aligned.

## GATE_9 Real Non-Owner Proof

- Read-only Supabase query against project `neydszeamsflpghtrhue` excluded `OWNER_USER_ID=e40b7cd8-4925-42f7-bc99-5022969f1d22` and `TEST_USER_ID=22222222-2222-2222-2222-222222222222`.
- Qualifying non-owner Google/Microsoft token rows in any state: `0`.
- Qualifying non-owner connected token rows: `0`.
- Qualifying non-owner refresh-capable token rows: `0`.
- Existing connected Google/Microsoft rows are owner-only; the reserved test row is Google with no connected access row.
- Because no qualifying non-owner token row exists, source status, dashboard state, source trail, save/skip/approve, and history cannot be honestly verified for a real non-owner beta user in this run.

## Decision

`PROVEN - Brandon-controlled Outlook/Hotmail can test Microsoft connection without counting as real beta.`

Exact blocker: one real non-owner user must sign in and connect Google or Microsoft through the normal production OAuth flow. Do not count owner data, the reserved test user, mock harness rows, fabricated rows, or local fixtures as beta proof.

## Next exact move

Canary test path: add the b-kapp Outlook/Hotmail auth UUID to `OWNER_CANARY_USER_IDS`, connect Microsoft through the normal product flow, verify dashboard or `/api/integrations/status` source status, verify one honest connected/stale/reconnect/no-safe/waiting state, and rerun `npm run gate:status` to confirm real non-owner beta remains externally blocked until a separate non-Brandon tester connects.

## Do Not Touch

- Backend artifact selection or generation logic
- Schema or destructive DB actions
- Stripe/payment behavior
- Paid generation
- Outbound email
- Fake users, token rows, source rows, artifacts, documents, deadlines, emails, or beta proof
- Public demo using Brandon private data
- UI polish or broad redesign
