# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-14 06:08 PT
Last known production SHA: f6b9d3bf772baef90db4c9106591915cedd52e2a
Last completed code commit: f6b9d3b
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
- `npm run winner:autopsy` still selects the document-collection winner: `Commitment due in 0d: Submit high-quality .docx documents for document collection`.
- `npm run gate:decision-trace` still passes with `FIRST_FAILING_DECISION_TRACE_GATE: NONE`.
- Finished `.docx` work remains blocked until Brandon provides owned candidate `.docx` files/source bodies, specific document topics/titles, and the submission URL/upload destination.
- Local code now renders the requirements-needed packet with the exact intake language: `To finish this, provide: owned .docx/source files, document topics/titles, and submission URL.` and `Paste the submission link and list/upload the candidate documents.`
- The dashboard now has a scoped no-schema intake panel for this requirements packet only. It stores submitted link/document notes under `execution_result.document_collection_intake` and leaves the action `pending_approval`.
- Save/Skip/history remain on the existing action controls; no schema, upload storage, editor, paid generation, outbound email, Stripe, or fake `.docx` content was added.

## Verified proof

- Required truth commands: `npm run health`, `npm run winner:autopsy`, `npm run gate:decision-trace`.
- Focused tests: selected latest/generate/action-detail/intake/dashboard/generator slice passed `48/48`.
- Dashboard intake proof: `npx playwright test tests/e2e/dashboard-navigation.spec.ts --grep "document collection requirements packet" --reporter=list` passed.
- Build: `npm run build` passed and includes `/api/conviction/actions/[id]/document-collection-intake`.
- Read-only DB proof before deploy: current production row `ce3a69f1-80e1-4ad8-8226-5c2f15cb0cba` is still the old requirements packet and has no fake `.docx`, but does not yet include the new exact intake language.

## Remaining blockers

- Production deployment/readback is pending for the intake code commit.
- A new no-paid selected-winner generation must run after deploy so latest/history show the updated intake wording instead of the old persisted packet.
- Real beta readiness still requires one real non-owner tester to connect Google or Microsoft.

## Next exact move

1. Commit and push the intake workflow.
2. Verify Vercel production SHA.
3. Run the no-paid `source=winner_truth` selected-move generation path once after deploy.
4. Read back latest/history/detail/DB and record the final receipt.

## Do not touch

- UI polish or frontend redesign
- Paid generation
- Outbound email
- Stripe or pricing
- Schema or destructive DB actions
- Fake users, fake `.docx` content, or beta-readiness claims
