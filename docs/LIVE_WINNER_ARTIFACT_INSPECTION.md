# Live Winner Artifact Inspection

Date: 2026-05-13 PT

## Selected Winner

`npm run winner:autopsy` now selects:

`Commitment due in 0d: Submit high-quality .docx documents for document collection`

Winner reason:

`Deadline is in 0 day(s) with zero artifacts; missing the submission window risks losing the accepted commitment opportunity.`

Artifact family:

`admin_deadline_decision_packet`

## Source Evidence

The selected winner is supported by:

- Commitment text: `Submit high-quality .docx documents for document collection project ($50 per accepted document)`.
- Due date: `2026-05-15T00:00:00+00:00`.
- Timing: `days_until_due=0`.
- Status: `active`.
- Gap: no execution artifact exists yet.
- Source reference: `commitment:1d0e3ecb-899c-4ec1-96d0-748485678dfe`.

That evidence supports the urgency and the selection. It does not, by itself, contain the actual `.docx` document content, document requirements, submission endpoint, accepted-document criteria, or a draftable source bundle.

## Artifact Found Or Missing

No persisted artifact exists for the selected document-collection winner.

Read-only production data check:

- Latest pending action is `8aca653a-f0a1-46e9-9af4-323c5cee539b`.
- Its title is `WorkSourceWA account activity closeout`.
- Its `brief_origin` is `selected_move_generate`.
- It is not the current document-collection winner.
- Searching `tkg_actions` for `document collection` returned no matching rows.

So Foldera currently has a right selected winner, but it has not produced the matching current artifact.

## Quality Verdict

Verdict:

`The winner is right, but the artifact is not finished work because no artifact exists for this winner yet.`

The currently persisted artifact is stale relative to the selected winner. It should not be treated as proof that the document-collection winner has finished work.

## Direct Answers

1. What artifact did Foldera produce?
   - For the new winner: none found.
   - Existing latest artifact: `WorkSourceWA account activity closeout`, which belongs to a previous selected move.

2. Is it finished work or just advice?
   - For this winner: neither; it is missing.
   - The older WorkSourceWA artifact is a closeout packet, not evidence for this winner.

3. Does it include the `.docx` content or merely say to make documents?
   - No current artifact includes `.docx` content.
   - The selected winner only proves an accepted commitment to submit `.docx` documents, not the document contents themselves.

4. Does it name the submission gap clearly?
   - The winner does: deadline now, zero artifacts, missing submission window.
   - No matching artifact exists to carry that gap into finished work.

5. Does it include source evidence?
   - The winner trace includes source evidence.
   - No matching persisted artifact exists with that evidence.

6. Is it useful enough to save/copy/approve?
   - Not yet. There is nothing current to save/copy/approve for this winner.

7. What is missing that would make it "holy crap"?
   - The actual `.docx` content or a source bundle sufficient to draft it.
   - The accepted-document requirements.
   - The submission endpoint or recipient.
   - A finished `.docx`-ready document body, not a reminder or decision memo.
   - A clear action state that says whether Foldera can produce the documents or must ask for one missing input.

8. Is the blocker generation quality, missing source content, or artifact format?
   - First blocker: generation execution. The selected winner has not been persisted as a current artifact.
   - Deeper blocker: missing source content. The winner evidence proves a deadline and opportunity, but not enough substance to write high-quality `.docx` documents.
   - Format risk: the current deterministic admin-deadline renderer would likely produce a decision/closeout packet, not actual `.docx` document content. That would still be mediocre for this specific task.

## Exact Missing Generation Step

The missing step is selected-winner persistence for the new winner:

`POST /api/conviction/generate?source=winner_truth`

That path is intended to convert the selected winner into a normal `pending_approval` `write_document` action.

No paid generation flag appears required for that deterministic selected-move path. The blocker is not payment approval. The blocker is that the selected-winner persistence step has not run for the newly selected candidate, and the product can still show an older `selected_move_generate` artifact as the latest pending action.

## Exact Next Code Seam

Smallest safe seam:

When the current winner changes, Foldera must not let an older `selected_move_generate` action stand in as the current artifact.

Add a winner identity check to selected-move persistence and latest readback:

- Store a stable winner fingerprint on `selected_move_generate` rows, such as the selected candidate/source ref plus claim.
- In `/api/conviction/latest`, only allow a `selected_move_generate` row to bypass the normal confidence threshold when its stored winner fingerprint still matches current `winner:autopsy` truth.
- If no matching selected-move artifact exists, return a clean missing-artifact state instead of surfacing a stale artifact.

Second narrow seam, after stale-artifact mismatch is fixed:

For `.docx` / document-collection winners, require real source content before claiming a finished document artifact. If the sources only prove the deadline but not the document body, Foldera should say:

`The winner is right, but Foldera cannot produce finished .docx work because the source trail does not include the document content or accepted-document requirements.`

Do not weaken the quality bar. Either hydrate real document content or stop cleanly.

## Proof Required

- `npm run health`
- `npm run winner:autopsy`
- `npm run gate:decision-trace`
- Read-only production data proof that no `document collection` artifact exists in `tkg_actions`.
- Focused test, if code is changed, proving stale `selected_move_generate` rows do not represent a changed winner.
- `npm run build`, if code is changed.
- `ACTIVE_HANDOFF.md` updated.
- `SESSION_HISTORY.md` updated.
- Commit pushed.

## Stop Condition

Foldera can now say:

`The winner is right, but the artifact is not finished work because no artifact exists for the selected document-collection winner yet, and the available source evidence does not contain the actual .docx content needed to make holy-crap finished work.`
