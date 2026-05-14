# Winner Trace Root Cause

Generated: 2026-05-13 18:12 PT

This is a root-cause trace, not a proof packet and not a beta-readiness claim.

## Current Source Truth

Fresh command truth:

- `npm run health`: `RESULT: 0 FAILING`
- `npm run gate:status`: release gate stops at `GATE_9_REAL_NON_OWNER_BETA`, `BLOCKED_EXTERNAL`
- `npm run gate:quality`: `QG_10_ARTIFACT_QUALITY`, `PASS`
- `npm run gate:visual`: `QG_11_VISUAL_FRONTEND_QUALITY`, `PASS`
- `npm run gate:decision-trace`: `QG_13_DECISION_TRACE_QUALITY`, `PASS`
- `npm run winner:autopsy`: exits non-zero because it reports a current blocker

Winner-autopsy source inputs:

- Google token is connected, not stale, last synced about 13 hours before the run.
- Microsoft token is connected, not stale, last synced about 13 hours before the run.
- latest processed signal data is from 2026-05-13.
- decrypted signal sample count is 250.
- decrypted fallback count is 0.
- behavioral graph freshness says `graph_stale=false` and `stale_entity_count=0`.

## Candidate List

Top viable candidates reported by `winner:autopsy`:

1. `discrepancy_exposure_1d0e3ecb-899c-4ec1-96d0-748485678dfe`
   - title: `Commitment due in 0d: Submit high-quality .docx documents for document collection`
   - tier: `tier_1`
   - artifact family: `admin_deadline_decision_packet`
   - missing blockers: none

2. `discrepancy_exposure_8c6b545a-a8ba-4784-835d-f846faa55d2b`
   - title: `Commitment due in 4d: Michel dance recital 3:40pm`
   - tier: `tier_1`
   - artifact family: `admin_deadline_decision_packet`
   - missing blockers: none

Blocked candidates reported by `winner:autopsy`:

- product/revenue goal drift: blocked by `missing_current_artifact_anchor`
- calendar-gap commitment for 2026-05-15: blocked by `missing_schedule_resolution_context`
- older account-support commitment: blocked by `stale_status_without_current_artifact_facts` and `missing_current_artifact_anchor`
- household-stability goal drift: blocked by `missing_current_artifact_anchor`
- developer-platform event invite: blocked by `low_authority_event_invite_suppressed`, `changes_next_move_required`, `low_value_event_invite_without_dependency`, `stale_status_without_current_artifact_facts`, and `missing_current_artifact_anchor`

## Closest Candidate

The closest candidate was the same-day administrative deadline/document candidate:

`Commitment due in 0d: Submit high-quality .docx documents for document collection`

It looked closest because it was tier 1, deadline-shaped, action family `admin_deadline_decision_packet`, and had no artifactability blockers in the top-viable list.

## Rejection Reasons

The current winner verdict is:

`no_safe_artifact_today`

The immediate rejection reason is:

`Selected candidate failed discrepancy-card quality: weak_risk; reminder_without_risk`

Plain English:

- Foldera found a deadline-shaped candidate.
- The generated internal discrepancy card did not explain a strong enough risk.
- The card looked too much like "remember this" instead of "this source-backed thing will break or cost you if not handled now."
- So the quality bar correctly refused to call it a trustworthy winner.

## What Behavioral Graph Drift Means Here

Behavioral graph drift compares stored entity relationship/window counts in `tkg_entities.patterns.bx_stats` against counts recomputed from processed signals.

Here it reported:

- Brandon Kapp stored 90-day count `96`, actual `93`
- Alex Crisler stored 14-day count `2`, actual `0`; stored 30-day count `10`, actual `7`; 90-day count stayed `11`

In plain English: the audit says some stored relationship counters are not numerically equal to a fresh recount.

## Is Graph Drift Real Or False Here?

The graph drift is a stale/false blocker for this winner failure.

Why:

- `graph_stale=false`
- `stale_entity_count=0`
- no decrypt fallback rows exist
- the drift rows are count decreases, not new unprocessed activity
- the latest signals for the drifted entities are older than `patterns_updated_at`
- the winner failure happened because the discrepancy card had weak risk / reminder-only framing, not because relationship context selected a bad winner

The graph count mismatch is worth monitoring, but it should not be a current blocker when counts only aged out of rolling windows and no newer signal exists.

## First Broken Rung

The first broken rung is not source freshness and not candidate generation.

The first broken rung is blocker classification:

`auditBehavioralGraphConsistency()` treats natural rolling-window count aging as graph drift, and `getWinnerTruthReport()` promotes any graph drift row to a `current_blocker`.

That creates confusing output: the real no-winner reason is weak risk / reminder-only, but the report also says to repair the behavioral graph.

## Exact File And Rule Responsible

Graph drift block:

- `lib/signals/behavioral-graph.ts`
  - `auditBehavioralGraphConsistency()`
  - `isRollingWindowBoundaryDrift()`

- `lib/system/winner-truth.ts`
  - any non-empty `graphDrift` becomes `classification: 'current_blocker'`
  - any non-empty `graphDrift` adds `Repair the behavioral graph before briefing reads relationship state.`

Weak-risk / reminder-only rejection:

- `lib/briefing/discrepancy-card-frame.ts`
  - `RISK_RE` decides whether risk text is strong enough.
  - `REMINDER_RE` plus missing risk match adds `reminder_without_risk`.
  - `evaluateDiscrepancyCardFrame()` blocks the candidate when `weak_risk` and `reminder_without_risk` are present.

The weak-risk rule is not the wrong rule here. It is doing the right thing: it prevents a deadline-shaped reminder from becoming fake finished work.

The graph drift rule is too strict. It treats natural rolling-window aging as if the behavioral graph must be repaired before winner truth can be trusted.

## Recommended Narrow Fix

One-file code fix:

- Update `lib/signals/behavioral-graph.ts`.
- Make `isRollingWindowBoundaryDrift()` ignore monotonic count decreases when:
  - the latest signal is not newer than `patterns_updated_at`
  - actual 14/30/90-day counts are all less than or equal to stored counts
  - at least one count changed

That keeps real drift visible when:

- new signal activity exists after graph computation
- actual counts increase unexpectedly
- the graph is genuinely stale

It removes the confusing false blocker when counts only age out of rolling time windows.

## Proof Required

Required proof after the fix:

- focused behavioral graph unit test proving monotonic count aging is ignored
- focused behavioral graph unit test proving a real newer-signal mismatch is still reported
- `npm run health`
- `npm run winner:autopsy`
- `npm run gate:decision-trace`
- `npm run build`

Actual post-fix end state:

`No winner exists today, and here is the clean, non-confusing reason why: the best candidate failed the discrepancy-card quality bar as weak-risk / reminder-only.`

Post-fix `npm run winner:autopsy` confirms:

- `graph_drift: []`
- `action_needed: []`
- `future_findings: []`
- `current_winner.verdict: no_safe_artifact_today`
- `current_winner.no_safe_artifact_reason: Selected candidate failed discrepancy-card quality: weak_risk; reminder_without_risk`

## Stop Condition

Stop when Foldera can truthfully say:

`No winner exists today, and here is the clean, non-confusing reason why.`

Do not stop with unexplained `graph drift`.
