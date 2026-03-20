# Acceptance Gate

Product contract checklist. Every directive must pass before it ships.

## Core Contract

- [ ] Exactly one directive per email
- [ ] Exactly one finished artifact attached
- [ ] If the user has to do work after approving, the feature is broken
- [ ] Confidence below threshold is never sent
- [ ] A correct no-send is better than a bad directive
- [ ] Silence with a specific reason is better than fake usefulness

## Valid User-Facing Artifact Types

1. **send_message**: real recipient email in `to` (or empty if unavailable), non-empty `subject`, non-empty `body` ready to send as-is
2. **write_document**: `document_purpose` (brief|plan|summary|proposal|checklist), `target_reader`, `title`, non-empty `content` — finished artifact, not notes
3. **schedule_block**: `title`, `reason`, `start` or scheduling target, `duration_minutes`
4. **wait_rationale**: `why_wait`, `tripwire_date`, `trigger_condition`
5. **do_nothing**: `exact_reason`, `blocked_by`

## Removed Types (not valid as user-facing output)

- **make_decision** — may remain as internal candidate class; generator converts to send_message, write_document, or silence
- **research** — may remain as internal candidate class; generator converts to write_document or send_message
- **decision_frame** — removed
- **research_brief** — removed

## Hard Failures

- [ ] Null artifact is never success
- [ ] Empty artifact fields for the type is never success
- [ ] Placeholder values ([NAME], [Company], [Date], TBD, TODO) is never success
- [ ] Coaching/advice language (consider, reflect, explore, think about, take a break) is never success
- [ ] Silence without logged candidate failure reasons is never success
- [ ] A pending_approval with invalid artifact is FAIL
- [ ] A candidate that fails evidence gating is never sent to the LLM

## Evidence Gating (before LLM call)

A candidate is generation-eligible only if:
- has_recent_evidence = true (signals within 14 days)
- conflicts_with_locked_constraints = false
- already_acted_recently = false

If no candidate is eligible, emit do_nothing deterministically (no LLM call).

## User Experience

- [ ] No confidence scores, evidence panels, or internal scoring shown to users
- [ ] Core surfaces are one-tap approve or skip only
- [ ] No guilt copy, deprioritized lists, or extra workflow steps
- [ ] No self-referential Foldera signals in output
- [ ] No hardcoded user data — works for any authenticated user
