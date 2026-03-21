# Acceptance Gate

Product contract checklist. Every directive must pass before it ships.

## Permanent Success Criteria

The system passes if and only if ALL of these are true every morning with zero human intervention:

1. **DELIVERY**: Email arrives by 7am PT. Every morning. `wait_rationale` counts. Silence fails.
2. **SELF-HEALING**: Tokens, signals, commitments, queue — detected and resolved automatically via `lib/cron/self-heal.ts`.
3. **SELF-LEARNING**: Skips and approvals change future output. No manual teaching.
4. **SELF-OPTIMIZING**: Threshold adjusts based on approval rates. System finds its own bar.
5. **MULTI-USER**: Everything works for someone who is not Brandon.

Failure on any criterion = the system is broken. Not "needs improvement." Broken.

## Core Contract

- [ ] Exactly one directive per email
- [ ] Exactly one finished artifact attached
- [ ] If the user has to do work after approving, the feature is broken
- [ ] Confidence below threshold: send `wait_rationale` (not silence)
- [ ] A correct "nothing today" with rationale is better than a bad directive
- [ ] The morning email ALWAYS arrives. Silence is a bug.

## Valid User-Facing Artifact Types

1. **send_message**: real recipient email in `to` (or empty if unavailable), non-empty `subject`, non-empty `body` ready to send as-is
2. **write_document**: `document_purpose` (brief|plan|summary|proposal|checklist), `target_reader`, `title`, non-empty `content` — finished artifact, not notes
3. **schedule_block**: `title`, `reason`, `start` or scheduling target, `duration_minutes`
4. **wait_rationale**: `context` (what was evaluated), `evidence` (why nothing was sent), optional `tripwires` (what unblocks future sends)
5. **do_nothing**: `exact_reason`, `blocked_by`

## Self-Heal Defenses (lib/cron/self-heal.ts)

1. **Token Watchdog**: auto-refresh tokens expiring within 6 hours of cron. Alert user on failure.
2. **Commitment Ceiling**: auto-suppress oldest beyond 150 per user.
3. **Signal Backlog Drain**: process stale signals, flag undecryptable as dead_key.
4. **Queue Hygiene**: auto-skip stale pending_approval > 24h, abandon executed > 7d with no interaction.
5. **Delivery Guarantee**: wait_rationale on no-send (implemented in daily-brief.ts).
6. **Health Alert**: alert email to brief@foldera.ai if any defense fails.

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

If no candidate is eligible, emit wait_rationale deterministically (no LLM call).

## User Experience

- [ ] No confidence scores, evidence panels, or internal scoring shown to users
- [ ] Core surfaces are one-tap approve or skip only
- [ ] No guilt copy, deprioritized lists, or extra workflow steps
- [ ] No self-referential Foldera signals in output
- [ ] No hardcoded user data — works for any authenticated user
