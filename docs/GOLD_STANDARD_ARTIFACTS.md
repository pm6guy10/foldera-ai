# GOLD STANDARD ARTIFACTS

## Canonical Product Standard
Foldera's paid-worthy output is finished leverage artifacts, not advice, task management, or organization.

This standard is for scoring and audit first. Do not block production generation from this file yet.

## Passing Standard
A paid-worthy artifact passes when it:
- names the real situation
- uses real source facts
- identifies the hidden leverage point
- produces usable finished work
- reduces cognitive load immediately
- makes the user think: "I would not have wanted to make this myself"

## Failure Conditions
Any of the following is a fail:
- generic advice
- homework
- "consider / prepare / review" language
- checklist instead of finished asset
- user must figure out the angle
- could have been made by any generic chatbot

## Artifact Families

### 1. Strategic Audit / Money Diagnosis
Why it works:
- Converts scattered evidence into one decisive financial move with explicit downside if ignored.

Required ingredients:
- Named situation (person/org/context)
- At least two concrete facts (dates, amounts, frequency, sender/thread pattern)
- Hidden leverage diagnosis (the actual bottleneck)
- One finished output asset (e.g., send-ready message, one-page decision memo)

Pass example:
- "You have 3 unreplied invoices from Acme since March 29 and your payment terms expire May 1. Hidden leverage: no owner has been assigned on their side. Send this exact escalation email to the AP manager and controller now."

Fail example:
- "Review your finances and prepare a follow-up strategy for unpaid invoices."

### 2. Category Lockout / Visual Insight
Why it works:
- Creates immediate pattern recognition the user can act on without analysis overhead.

Required ingredients:
- Clear category lockout pattern (what keeps repeating)
- Evidence anchors from real sources
- Specific unlock move that breaks the pattern
- Finished visual-ready artifact (tight narrative table/script, not exploratory notes)

Pass example:
- "Pattern: interview follow-ups stall after round 2 due to delayed owner confirmation. Here is the final decision matrix and send-ready escalation copy with deadline."

Fail example:
- "Consider mapping your categories and reviewing where you might be stuck."

### 3. Interview / Opportunity Brief
Why it works:
- Compresses a noisy opportunity into one credible positioning move and a send-ready artifact.

Required ingredients:
- Named role/company/opportunity context
- Verified source facts (timeline, thread facts, constraints)
- Hidden leverage point (what the decision-maker actually needs resolved)
- Finished artifact (final brief, outreach note, or response packet)

Pass example:
- "Role: Sr PM at Contoso. Constraint: hiring manager asked for ownership proof twice in 8 days. Hidden leverage: risk transfer clarity. Use this final 180-word response and attached proof bullets as-is."

Fail example:
- "Prepare STAR stories and review the job description before your interview."

### 4. Application / Cover Letter Narrative
Why it works:
- Turns fragmented experience into one coherent narrative the user can submit immediately.

Required ingredients:
- Real role/company and real prior facts
- Differentiating narrative angle (not generic motivation)
- Draft that is submission-ready
- Explicit tie between evidence and claim

Pass example:
- "For the Stripe PM role, use this final narrative framing your 2 launch recoveries with dates and outcomes. Cover letter below is complete and ready to submit."

Fail example:
- "Consider tailoring your cover letter and reviewing your achievements."

### 5. Life Admin / Hard Response Packet
Why it works:
- Removes decision fatigue by packaging difficult responses into one executable packet.

Required ingredients:
- Named counterpart/system and exact obligation
- Source-grounded facts (dates, request history, constraints)
- Hidden leverage point (what resolves the blockage)
- Finished packet (response draft + required fields + sequence)

Pass example:
- "Agency: CA EDD. Fact pattern: 2 unresolved notices (April 3, April 11), hearing deadline April 29. Hidden leverage: missing wage-week clarification. Here is the exact response packet text and submission order."

Fail example:
- "Review your notices and prepare your response documents."

## Future Integration Path (TODO)
1. Feed `docs/GOLD_STANDARD_ARTIFACTS.md` into generator context.
2. Score generated artifacts before persistence.
3. Reject or retry artifacts below threshold.
4. Show score/reason in admin/dev mode only.
5. Eventually use real examples as golden fixtures.
