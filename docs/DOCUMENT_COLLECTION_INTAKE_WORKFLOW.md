# Document Collection Intake Workflow

## Current Requirements-Needed Artifact

Current winner: `Commitment due in 0d: Submit high-quality .docx documents for document collection`.

Current artifact shape: `Requirements needed: Submit high-quality .docx documents for document collection`.

Current artifact behavior: Foldera produces a requirements-needed packet, not finished `.docx` content. The packet preserves the known source requirements, names the missing inputs, and stops before invented document bodies.

Required visible intake language:

```text
To finish this, provide: owned .docx/source files, document topics/titles, and submission URL.
Paste the submission link and list/upload the candidate documents.
```

## Exact Missing Inputs

- Brandon-owned candidate `.docx` files or source document bodies.
- Specific document titles/topics or which owned documents should be submitted.
- Submission URL, upload destination, or exact handoff location.

## Known Source Requirements

- `.docx` documents are required.
- $50 per accepted document.
- Brandon must own the rights and be the original author.
- Strong submissions should be structurally rich: tables, charts, TOCs, headers/footers, footnotes, forms, or embedded data.
- Rejection rules include AI-generated content, PDF-converted files, confidential content, employer/client-owned content, NDA-covered content, and identifying content.
- Google-login context is required for submission.
- Deadline evidence: May 15, 2026 at 11:59 PM PT.

## Current App Surface

- Latest summary: `/api/conviction/latest` selects the current `selected_move_generate` requirements packet when its stored winner fingerprint matches current winner truth.
- Detail readback: `/api/conviction/actions/:id` returns the full artifact body for the authenticated owner.
- Dashboard surface: `/dashboard` shows the requirements packet as the current work item with source trail, Save/Skip controls, and a scoped intake panel when the packet is the document-collection requirements state.
- History surface: `/api/conviction/history` preserves the user-facing requirements packet preview and does not need full artifact bodies.

## Smallest Intake UX

No file-management system is required for this seam.

The smallest working intake path is structured text/link capture on the existing pending action:

- Submission link field.
- Candidate documents/source bodies field.
- Save inputs button.
- Persisted under `execution_result.document_collection_intake` on the same `tkg_actions` row.
- Status remains `pending_approval`; Foldera does not claim finished `.docx` work.

This lets Brandon paste the submission destination and list owned `.docx` files, titles/topics, or source bodies without schema changes or storage expansion.

## Schema Requirement

Schema change is avoidable.

Existing `tkg_actions.execution_result` can store the scoped intake payload:

```json
{
  "document_collection_intake": {
    "status": "inputs_provided",
    "captured_at": "ISO timestamp",
    "submission_url": "https://...",
    "candidate_documents": "structured user-provided list/source bodies",
    "next_action": "Produce the finished submission packet from the captured owned inputs."
  }
}
```

No new table, migration, upload storage, document editor, Stripe behavior, paid generation, or outbound email is required.

## Files, Routes, Components

- `lib/conviction/artifact-generator.ts` renders the requirements-needed packet.
- `lib/conviction/document-collection-intake.ts` identifies the scoped requirements state and normalizes intake.
- `app/api/conviction/actions/[id]/document-collection-intake/route.ts` captures the submission link and candidate document/source-body notes on the existing action row.
- `app/dashboard/page.tsx` displays the targeted intake panel and posts the captured inputs.
- `app/dashboard/dashboard-page-model.tsx` exposes the packet recognizer for dashboard state.
- `components/dashboard/DashboardMobileLayout.tsx` preserves the same status/next-step language on mobile.
- Existing safe controls stay on `/api/conviction/execute`, `/api/conviction/history`, and `/api/conviction/actions/[id]`.

## Pass/Fail Criteria

Pass:

- Latest/current artifact says: `To finish this, provide: owned .docx/source files, document topics/titles, and submission URL.`
- Latest/current artifact says: `Paste the submission link and list/upload the candidate documents.`
- Known requirements remain visible.
- Missing ingredients remain visible.
- The dashboard intake is scoped only to the document-collection requirements packet.
- Capturing inputs does not change status away from `pending_approval`.
- Save/Skip/history behavior remains safe.
- No fake `.docx` content is generated.
- No schema change, paid generation, outbound email, Stripe action, or broad file-management system is introduced.

Fail:

- Foldera claims finished `.docx` work before Brandon-owned source bodies/files and destination exist.
- The intake route accepts unrelated actions.
- The intake route writes a generic memo or fake document body.
- The dashboard hides the missing inputs behind generic artifact copy.
- Save/Skip/history breaks or implies outbound send.

## Proof Required

- `npm run health`
- `npm run winner:autopsy`
- `npm run gate:decision-trace`
- Focused tests for artifact wording, dashboard detection, and intake route behavior.
- Focused dashboard/browser proof for the no-schema intake panel.
- `npm run build`
- Readback proof for latest/history/detail/intake persistence.
- `ACTIVE_HANDOFF.md` updated.
- `SESSION_HISTORY.md` updated.
- Commit pushed to `main`.
