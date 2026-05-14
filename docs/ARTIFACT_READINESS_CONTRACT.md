# Artifact Readiness Contract

Date: 2026-05-14

## Purpose

Foldera may select the right winner and still be wrong if the visible artifact is stale, overclaimed, unsupported, or missing the ingredients needed for finished work.

This contract applies to every `write_document` winner on the path:

`winner truth -> selected move -> artifact generation -> latest/detail/history/dashboard`

## States

### FINISHED_ARTIFACT_READY

Use when the source evidence is sufficient and the artifact is finished work the user can approve, save, or skip.

Required:

- visible document body
- source evidence strong enough to support the artifact
- no persistence or artifact-quality blockers
- no fake documents, links, deadlines, claims, or source facts

### REQUIREMENTS_NEEDED

Use when the winner is valid, but Foldera cannot finish the document until the user provides exact missing inputs.

Required:

- source-backed known requirements
- exact missing inputs
- clear next action
- explicit refusal to invent finished document content

The document-collection packet is the fixture for this state:

- known: `.docx` required, $50 per accepted document, ownership/IP rules, rejection rules, Google-login context, deadline
- missing: owned `.docx`/source files, document topics/titles, submission URL

### NO_SAFE_ARTIFACT

Use when the winner cannot safely become useful finished document work.

Required:

- no fake artifact
- no stale selected-move substitution
- one plain reason for why Foldera held back
- latest/dashboard must show no finished artifact

## Implementation

Classifier:

- `lib/conviction/artifact-readiness.ts`

Write path:

- `app/api/conviction/generate/route.ts` classifies `write_document` artifacts before persistence.
- `execution_result.artifact_readiness` stores the chosen state and reason.
- `NO_SAFE_ARTIFACT` returns a validation response instead of persisting fake work.

Readback path:

- `app/api/conviction/latest/route.ts` returns `artifact_readiness` and `artifact_readiness_state`.
- `app/api/conviction/actions/[id]/route.ts` uses `buildDashboardActionPayload`, which exposes the same state from detail.
- `app/api/conviction/history/route.ts` derives the same state from summary rows without widening the query to full artifacts or `execution_result`.
- `app/dashboard/dashboard-page-model.tsx` accepts the readiness state on dashboard action payloads.

Stale selected moves:

- `selected_move_generate` rows still must match the current winner fingerprint before latest can show them.
- A mismatch becomes `NO_SAFE_ARTIFACT` with reason `stale_selected_move_artifact`.

## Pass/Fail Criteria

Pass:

- finished artifact ready is classified as `FINISHED_ARTIFACT_READY`
- requirements packets are classified as `REQUIREMENTS_NEEDED`
- missing or invalid write-document artifacts are classified as `NO_SAFE_ARTIFACT`
- source present but insufficient does not pass as finished work
- stale selected-move artifacts are hidden
- latest, detail, history, and dashboard model agree on state

Fail:

- old selected-move artifact stands in for a changed winner
- missing source content is labeled as finished work
- requirements-needed packet lacks exact missing inputs
- dashboard/latest/history disagree about the state
- fake `.docx`, fake emails, fake deadlines, or fake source claims appear

## Proof Required

- `npm run health`
- `npm run winner:autopsy`
- `npm run gate:decision-trace`
- focused artifact-readiness tests
- focused latest/detail/history/dashboard tests
- `npm run build`
- GitHub CI green for final `origin/main`
- Vercel green for final `origin/main`
- production `/api/health` SHA matches final `origin/main`
