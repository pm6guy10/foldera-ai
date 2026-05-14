# Document Artifact Requirements Review

## Selected Winner

`Commitment due in 0d: Submit high-quality .docx documents for document collection`

Foldera is right to care about this move: the accepted commitment is current, the deadline is immediate, and there is no current execution artifact for it.

## Source Rows / Evidence

Proof was read from the current winner autopsy plus read-only Supabase source queries against the owner source graph.

Current selected commitment:

- `tkg_commitments.id=1d0e3ecb-899c-4ec1-96d0-748485678dfe`
- Description: `Submit high-quality .docx documents for document collection project ($50 per accepted document)`
- Status: `active`
- Category: `deliver_document`
- Due at: `2026-05-15T00:00:00+00:00`
- Created/updated: `2026-05-13T11:52:42.839445+00:00`
- Source signal: `1215e4fd-0d8b-4e47-9a67-0f855d2e8a2f`

Current source email:

- `tkg_signals.id=1215e4fd-0d8b-4e47-9a67-0f855d2e8a2f`
- Source/type: `outlook/email_received`
- From: `handshake@g.joinhandshake.com`
- Occurred at: `2026-05-12T13:46:24+00:00`
- Subject: `Reminder: Paid opportunity — earn $50 for every accepted document`
- Evidence says Handshake AI is accepting submissions for a document collection project, wants high-quality `.docx` documents in areas like finance, consulting, legal, data science, or software engineering, pays `$50 per accepted document`, requires ownership rights, requires Google login, and gives a deadline of `5/15/2026, Friday, at 11:59 PM PT`.

Earlier related commitment:

- `tkg_commitments.id=c804aaa3-eee3-45b1-90ae-ca79c4bda877`
- Description: `Submit high-quality professional documents for payment ($50 per accepted document)`
- Status: `active`
- Category: `deliver_document`
- Due at: `null`
- Created/updated: `2026-05-10T11:21:34.495566+00:00`
- Source signal: `9362af29-0b5d-47f3-a9f2-267bff2cd4d5`

Earlier detailed source email:

- `tkg_signals.id=9362af29-0b5d-47f3-a9f2-267bff2cd4d5`
- Source/type: `outlook/email_received`
- From: `handshake@g.joinhandshake.com`
- Occurred at: `2026-05-09T18:33:49+00:00`
- Subject: `Earn $50 for every accepted document`
- Evidence adds more detail: quality matters more than length; professional-grade `.docx`; personally owned rights; freelance/sole practitioner/personal project/template/framework/research examples; not employer/client-owned, NDA/IP-assigned, AI-generated, PDF-converted, lightly formatted, confidential, or identifying; true `.docx` only; deadline `5/15/2026 at 11:59pm PT`.

Older related commitment:

- `tkg_commitments.id=d1568e90-1793-4e24-a32c-a623e54c9f40`
- Description: `Submit high-quality documents to Handshake AI for AI model training`
- Status: `active`
- Category: `deliver_document`
- Due at: `null`
- Created/updated: `2026-04-13T23:54:54.598239+00:00`

Related but not sufficient source row:

- `tkg_signals.id=c7882e20-034f-4e2b-aede-e326e54abca0`
- Source/type: `gmail/email_received`
- From: `Naren Inukoti (via Google Docs) <naren.inukoti@joinhandshake.com>`
- Occurred at: `2026-05-06T23:40:30+00:00`
- Subject: `Document shared with you: "Project Mosaic Chat Export Instructions - Claude + Gemini.docx"`
- This proves an instruction document was shared, but Foldera only has the share notification text, not the instruction document contents.

## Known Requirements

The source rows do specify several accepted-document requirements:

- Real `.docx` documents.
- Professional-grade work in areas like finance, consulting, legal, data science, or software engineering.
- Brandon must personally own the rights.
- Employer/client-owned, NDA-covered, confidential, identifying, PDF-converted, AI-generated, lightly formatted, or broken files are not acceptable.
- Stronger submissions include structural richness: tables, charts, table of contents, headers/footers, footnotes, forms, embedded data, section breaks, cover pages, and similar Word-document structure.
- Pay is `$50 per accepted document`.
- Submission deadline from source email is `May 15, 2026 at 11:59 PM PT`.
- Submission requires being logged into a Google account.

## Missing Requirements

The source rows do not provide enough to produce finished `.docx` content.

Missing:

- The actual owned candidate `.docx` files or source document bodies.
- Which specific documents Brandon wants to submit.
- Specific document titles/topics beyond broad acceptable categories.
- The actual submission URL or upload destination; the ingested email text preserves the button label `Submit your documents`, but the captured URLs only showed a tracking/image URL.
- Any review of whether a candidate document is truly Brandon-owned and scrubbed of private/company/client identifiers.

## Can Foldera Generate Finished .docx Content?

No.

Foldera has enough evidence to identify a real, urgent document-production opportunity and enough acceptance rules to explain what a valid submission needs. It does not have the owned document content itself. Generating finished `.docx` text from this evidence would fake the actual work product.

## Exact Artifact Behavior When Requirements Are Missing

Foldera should produce a finished `requirements-needed packet`.

That packet should:

- Name the selected document-collection winner.
- State `submit nothing` and `do not draft fake .docx content` until the missing inputs exist.
- List source-backed known requirements.
- List the missing owned documents/source bodies, chosen topics/titles, and submission destination.
- Preserve the deadline and pay evidence.
- Explain that the current blocker is missing source content, not model/payment approval.
- Be useful enough to save or approve as a stop packet, not as finished `.docx` work.

Foldera should not produce:

- A generic decision memo.
- A reminder to make documents.
- Invented document content.
- A claimed `.docx-ready` artifact without the actual owned source material.

## Smallest Code Seam

The narrow seam is the deterministic selected-move artifact path:

- `app/api/conviction/generate/route.ts` now hydrates selected-winner source evidence from the linked commitment row and source signal before artifact generation.
- `lib/conviction/artifact-generator.ts` now recognizes document-production winners and checks whether source content is sufficient.
- If the selected document-production winner lacks owned document content, chosen document topics, or submission destination, Foldera returns a requirements-needed packet instead of the generic admin-deadline packet.

This does not weaken the discrepancy-card bar, does not create a new gate, does not run paid generation, and does not fake document content.

## Proof Required

Required proof for this slice:

- `npm run health`
- `npm run winner:autopsy`
- Read-only source query showing the exact commitment/source signal rows above.
- Focused test for document artifact requirement sufficiency.
- `npm run gate:decision-trace`
- `npm run build`
- `ACTIVE_HANDOFF.md` updated.
- `SESSION_HISTORY.md` updated.
- Commit pushed to `main`.

## Stop Condition

Current truthful stop condition:

`Requirements are missing; produce a source-backed requirements-needed packet instead of fake .docx work.`
