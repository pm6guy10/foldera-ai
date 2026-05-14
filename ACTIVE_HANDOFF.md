# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-14 06:35 PT
Last known production SHA: 639beb97095f4b48fba6762513c350e4df94468d
Last completed code commit: 639beb9
Current slice: Document-collection intake workflow
Current mode: no new gate, no proof packet, no UI polish, no paid generation, no outbound email, no Stripe, no schema, no fake `.docx`, no beta-readiness claim.
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

- `npm run health` is green: Gmail fresh, Outlook fresh, mail cursors current, last generation is `write_document`, and `RESULT: 0 FAILING`.
- `npm run winner:autopsy` still selects `Commitment due in 0d: Submit high-quality .docx documents for document collection`.
- `npm run gate:decision-trace` still passes with `FIRST_FAILING_DECISION_TRACE_GATE: NONE`.
- Production `/api/health` serves commit `639beb97095f4b48fba6762513c350e4df94468d`.
- No-paid selected-winner generation persisted row `d17931e4-ab3d-4d75-9775-61b6c58b22b4`.
- `/api/conviction/latest` returns row `d17931e4-ab3d-4d75-9775-61b6c58b22b4`, `detail_url=/api/conviction/actions/d17931e4-ab3d-4d75-9775-61b6c58b22b4`, and next action `Paste the submission link and list/upload the candidate documents.`
- `/api/conviction/history?limit=2` has the new row first, ahead of the older requirements packet and without stale WorkSourceWA.
- Detail/DB readback shows the exact ask: `To finish this, provide: owned .docx/source files, document topics/titles, and submission URL.`
- Detail/DB readback preserves known source requirements: `.docx`, `$50 per accepted document`, ownership/IP rules, rejection rules, Google-login context, and the May 15, 2026 deadline.
- Detail/DB readback lists missing ingredients: owned candidate files/source bodies, topics/titles, and submission URL/upload destination.
- Finished `.docx` work remains blocked until Brandon provides those owned inputs and destination.
- No schema, upload storage, document editor, paid generation, outbound email, Stripe, or fake `.docx` content was added.

## Verified proof

- Required truth commands: `npm run health`, `npm run winner:autopsy`, `npm run gate:decision-trace`.
- Focused tests: latest/generate/action-detail/intake/dashboard/generator slice passed `49/49`.
- Dashboard intake proof: `npx playwright test tests/e2e/dashboard-navigation.spec.ts --grep "document collection requirements packet" --reporter=list` passed.
- Build: `npm run build` passed and includes `/api/conviction/actions/[id]/document-collection-intake`.
- Vercel deployment `dpl_9h55iTkP5Jjf4YuKKx8uTPHcdnUU` for commit `639beb9` is `READY`.
- Production `/api/health` reports SHA `639beb97095f4b48fba6762513c350e4df94468d`.
- Production API/DB proof confirms latest/detail/history row `d17931e4-ab3d-4d75-9775-61b6c58b22b4` is the updated requirements-needed packet.

## Remaining blockers

- Dashboard visibility patch is locally verified and awaiting commit/push/deploy proof.
- Real finished submission packet still requires Brandon-owned `.docx` files/source bodies, document topics/titles, and submission URL/upload destination.
- Real beta readiness still requires one real non-owner tester to connect Google or Microsoft.

## Next exact move

1. Commit and push the dashboard visibility patch.
2. Verify Vercel production SHA for the new commit.
3. Re-check production dashboard shows the intake panel and exact missing-input ask.
4. Record final handoff/history receipt.

## Do not touch

- UI polish or frontend redesign
- Paid generation
- Outbound email
- Stripe or pricing
- Schema or destructive DB actions
- Fake users, fake `.docx` content, or beta-readiness claims
