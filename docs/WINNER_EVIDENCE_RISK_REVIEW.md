# Winner Evidence Risk Review

Date: 2026-05-13 PT

## Current Source Truth

- `npm run health` passed with 0 failing checks. Gmail and Outlook were fresh, with source syncs about 13 hours old at health time.
- `npm run winner:autopsy` returned `no_safe_artifact_today`.
- The graph drift blocker was empty.
- The remaining rejection was `Selected candidate failed discrepancy-card quality: weak_risk; reminder_without_risk`.

## Closest Candidate

The closest candidate was:

`discrepancy_exposure_1d0e3ecb-899c-4ec1-96d0-748485678dfe`

Plain-English title:

`Commitment due in 0d: Submit high-quality .docx documents for document collection`

Foldera saw this as an exposure candidate: Brandon had accepted a commitment, the due date was now, and there was no execution artifact yet.

## Evidence Found

The candidate had these usable source facts:

- Commitment: `Submit high-quality .docx documents for document collection project ($50 per accepted document)`.
- Due date evidence: `due_at=2026-05-15T00:00:00+00:00`.
- Timing evidence: `days_until_due=0`.
- Status evidence: `status=active`.
- Execution gap: no execution artifact existed for the commitment.
- Source reference: `commitment:1d0e3ecb-899c-4ec1-96d0-748485678dfe`.

This is real risk evidence. The candidate was not merely "remember to do this someday." It had a current deadline, an accepted commitment, a money-linked task, and no visible finished artifact.

## Evidence Missing

The candidate did not have:

- A named external recipient or submission endpoint.
- A confirmed artifact file already drafted.
- A source trail showing exact submission instructions.
- Current proof that the task was already completed elsewhere.

Those missing facts matter for the final artifact content, but they do not erase the deadline risk.

## Why It Failed

The candidate failed because its generated risk sentence was:

`Due in 0 day(s) with zero artifacts - this is not a reminder, it is an exposure gap`

That sentence caused two problems:

- It used the word `reminder`, which triggered the reminder-safety check.
- It did not include the concrete risk terms the discrepancy-card quality rule requires, such as deadline, missing, submission window, risk, or opportunity.

So the quality rule did exactly what it was built to do for the text it received: it rejected a card that looked like a reminder defending itself instead of a grounded risk.

## Whether Rejection Is Correct

The mechanical rejection was correct for the card text.

The product-level no-winner result was not the cleanest truth, because the source inputs did contain real risk evidence. Foldera was failing to surface that evidence in the risk field.

The right fix is not to weaken the discrepancy-card quality bar. The right fix is to hydrate the risk framing with the evidence already present: deadline now, zero artifacts, missing submission window, and lost accepted-commitment opportunity.

## Exact File And Rule Involved

Risk text was created in:

- `lib/briefing/discrepancy-detector.ts`
- Function: `extractExposure`
- Field: `trigger.why_now`

The rejection was created in:

- `lib/briefing/discrepancy-card-frame.ts`
- Function: `evaluateDiscrepancyCardFrame`
- Rules:
  - `RISK_RE` did not match the risk sentence, so `weak_risk` was added.
  - `REMINDER_RE` matched the frame text while risk was weak, so `reminder_without_risk` was added.

## Smallest Safe Fix

Keep the quality bar unchanged.

Change only the exposure candidate's risk phrasing so imminent commitments say, in plain English:

- the deadline is now,
- there are zero artifacts,
- missing the submission window is the risk,
- and the accepted commitment opportunity can be lost.

This makes Foldera show the real evidence it already had instead of forcing a winner or accepting generic reminders.

## Proof Required

- `npm run health`
- `npm run winner:autopsy`
- Focused tests proving old reminder-shaped risk still fails and the reframed deadline-exposure risk passes without weakening the evaluator.
- `npm run gate:decision-trace`
- `npm run build`
- Updated `ACTIVE_HANDOFF.md`
- Updated `SESSION_HISTORY.md`
- Commit pushed to `main`

## Stop Condition

Foldera should now be able to say truthfully:

`A winner exists because missing risk evidence is now hydrated and visible.`

## Fix Result

After the narrow risk-framing fix, `npm run winner:autopsy` selected the same closest candidate instead of returning `no_safe_artifact_today`.

Selected winner:

`Commitment due in 0d: Submit high-quality .docx documents for document collection`

Selected risk:

`Deadline is in 0 day(s) with zero artifacts; missing the submission window risks losing the accepted commitment opportunity.`

The discrepancy-card quality bar was not weakened. The old reminder-shaped risk still fails focused tests with `weak_risk` and `reminder_without_risk`; the same evidence passes only when the risk field names the deadline, missing submission window, and opportunity at stake.
