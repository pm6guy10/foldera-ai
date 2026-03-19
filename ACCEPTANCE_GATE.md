# Acceptance Gate

Product contract checklist. Every directive must pass before it ships.

## Core Contract

- [ ] Exactly one directive per email
- [ ] Exactly one finished artifact attached
- [ ] If the user has to do work after approving, the feature is broken
- [ ] Confidence below 70% is never sent
- [ ] A correct no-send is better than a bad directive

## Artifact Validation

Valid artifact types and required fields:

- **send_message**: subject and body non-empty (recipient preferred, not required)
- **write_document**: title and content non-empty
- **schedule**: title, start, end non-empty
- **research**: findings, recommended_action non-empty, sources array non-empty
- **make_decision**: options array with at least 2 items
- **do_nothing / wait_rationale**: context and evidence non-empty

## Hard Failures

- [ ] Null artifact is never success
- [ ] Empty artifact fields for the type is never success
- [ ] Placeholder values ($[...], ${...}, [NAME], [TODO]) is never success
- [ ] Silence without logged candidate failure reasons is never success
- [ ] A pending_approval with invalid artifact is FAIL

## User Experience

- [ ] No confidence scores, evidence panels, or internal scoring shown to users
- [ ] Core surfaces are one-tap approve or skip only
- [ ] No guilt copy, deprioritized lists, or extra workflow steps
- [ ] No self-referential Foldera signals in output
- [ ] No hardcoded user data — works for any authenticated user
