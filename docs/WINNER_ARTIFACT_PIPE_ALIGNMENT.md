# Winner Artifact Pipe Alignment

Date: 2026-05-13 PT

## Current Winner

`npm run winner:autopsy` selects:

`Commitment due in 0d: Submit high-quality .docx documents for document collection`

The selected risk is:

`Deadline is in 0 day(s) with zero artifacts; missing the submission window risks losing the accepted commitment opportunity.`

Source evidence:

- `Submit high-quality .docx documents for document collection project ($50 per accepted document)`
- `due_at=2026-05-15T00:00:00+00:00`
- `days_until_due=0`
- `status=active`
- `commitment:1d0e3ecb-899c-4ec1-96d0-748485678dfe`

## Current Persisted Artifact

Read-only Supabase proof found one current pending selected-move artifact:

- Action id: `8aca653a-f0a1-46e9-9af4-323c5cee539b`
- Status: `pending_approval`
- Origin: `selected_move_generate`
- Artifact title: `WorkSourceWA account activity closeout`
- Generated at: `2026-05-13T16:42:47.413+00:00`

Searching actions for `document collection` returned no rows.

## Mismatch Explanation

Winner selection and current artifact readback are out of sync.

`winner:autopsy` recomputes current winner truth from current sources and now selects the document-collection deadline. The dashboard/latest path reads pending artifacts from `tkg_action_summaries` and allowed any row marked `brief_origin=selected_move_generate` to bypass the normal confidence threshold.

That meant the old WorkSourceWA selected-move row could still appear as the current artifact even after the current winner changed.

## Exact File And Path Responsible

Selection path:

- `scripts/winner-autopsy.ts`
- `lib/system/winner-truth.ts`

Selected-move persistence path:

- `app/api/conviction/generate/route.ts`
- `POST /api/conviction/generate?source=winner_truth`

Latest/current artifact readback path:

- `app/api/conviction/latest/route.ts`
- `GET /api/conviction/latest`

The broken rule was in `app/api/conviction/latest/route.ts`: `selected_move_generate` rows were trusted by origin only, not by current winner identity.

## Does The Old Pending Action Block Fresh Winner Generation?

It blocks the product readback path by making Foldera look like it already has a current selected-move artifact.

It does not prove that generation itself is impossible. The deterministic selected-move generation endpoint can still be called separately. The bug is that latest/current readback reused a stale pending artifact as if it belonged to the new winner.

## Is Generation Blocked By Paid Model Approval?

No.

The selected-move persistence path is deterministic and skips `generateDirective()` when `source=winner_truth` is used. It should not require paid/model generation approval.

## Is Source Content Sufficient For A Finished Document?

No.

The available source evidence proves the deadline and the opportunity, but it does not include the content needed to create actual `.docx`-ready documents.

Missing source facts:

- The actual document topics or body content.
- The accepted-document requirements.
- The submission endpoint or recipient.
- Formatting requirements for the `.docx` files.
- Whether one document or multiple documents are needed.
- Any source material Foldera can transform into the documents.

Without those facts, Foldera can truthfully produce a source-backed missing-content stop or a decision packet, but not holy-crap finished `.docx` work.

## Smallest Safe Fix

Fix stale selected-move reuse without weakening any quality bar:

1. Store a stable current-winner fingerprint inside `execution_result` when `POST /api/conviction/generate?source=winner_truth` persists a selected-move artifact.
2. Before `/api/conviction/latest` lets a low-confidence `selected_move_generate` row represent the current artifact, compare the stored fingerprint to current `winner:autopsy` truth.
3. If the fingerprint is missing or mismatched, hide the stale selected-move artifact and return the normal no-finished-artifact path.

This does not fake document content. It only prevents an old selected-move artifact from standing in for a changed winner.

## Fix Implemented

Implemented the stale selected-move reuse fix:

- `POST /api/conviction/generate?source=winner_truth` now stores `selected_winner_fingerprint`, `selected_winner_claim`, and `selected_winner_source_refs` inside `execution_result`.
- `/api/conviction/latest` now verifies `selected_move_generate` rows against current winner truth before allowing them to bypass the normal confidence threshold.
- If the stored fingerprint is missing or mismatched, the row is treated as stale and latest returns the normal `no_finished_artifact` path instead of showing the old artifact.

The old WorkSourceWA row has no matching current winner fingerprint, so it can no longer stand in as proof for the document-collection winner after this code is deployed.

This fix does not generate `.docx` content and does not claim the document-collection artifact is finished. The current winner still lacks the actual document content and accepted-document requirements needed for holy-crap finished work.

## Proof Required

- `npm run health`
- `npm run winner:autopsy`
- Read-only Supabase query showing the old WorkSourceWA selected-move artifact and zero `document collection` action rows.
- Focused latest/generate tests proving selected-move artifacts carry a winner fingerprint and stale selected-move rows are hidden.
- `npm run gate:decision-trace`
- `npm run build`
- `ACTIVE_HANDOFF.md` updated.
- `SESSION_HISTORY.md` updated.
- Commit pushed.

## Stop Condition

Foldera should now be able to say:

`An old pending artifact was blocking fresh winner readback, and the stale reuse path is fixed.`

It should also say:

`The current winner cannot produce holy-crap finished .docx work until the source trail includes the actual document content or accepted-document requirements.`
