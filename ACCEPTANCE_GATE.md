# Acceptance Gate

Product contract checklist. Every directive must pass before it ships.

## Production Ladder: Works / Broken / Proof

This ladder is the operational definition of production truth.

- `Works` means observable product behavior, not logs alone.
- `Broken` means a failed observable condition at the rung being claimed.
- `Proof` must be a build command, test command, Playwright journey, or explicit manual UI check.
- A change does not count if it only updates docs, screenshots, visual polish, SEO, refactors, or unrelated tests.

### 1. Daily Brief run completes end-to-end

- **Works means:** one real production Daily Brief run reaches a completed product outcome with no manual rescue in the middle.
- **Broken means:** the run stalls, errors, exits early, or only proves internal progress while the user-observable flow never completes.
- **Proof command:** explicit manual UI check: trigger one real production Daily Brief run and verify the run reaches a completed user-facing outcome rather than a log-only success.
- **Do-not-count conditions:** cron 200s, logs, traces, DB rows, or internal stage markers by themselves do not count; docs/screenshots/visual polish/SEO/refactors/unrelated tests also do not count.

### 2. It creates one usable artifact

- **Works means:** the completed run produces exactly one finished, usable artifact of a valid Foldera type.
- **Broken means:** the output is null, empty, duplicated, placeholder-filled, scaffold-like, or not usable as shipped.
- **Proof command:** explicit manual UI check: inspect the produced artifact in the real product surface and confirm it is a single finished artifact, not notes or raw generation sludge.
- **Do-not-count conditions:** "artifact created" in logs, a persisted invalid payload, or a screenshot of static mock content does not count; docs/screenshots/visual polish/SEO/refactors/unrelated tests also do not count.

### 3. Artifact is visible on /dashboard without manual DB/app inspection

- **Works means:** a signed-in user can open `/dashboard` and see the artifact directly in the product without reading DB tables, API JSON, or debug panels.
- **Broken means:** the artifact exists only in storage/logs/API output, requires refresh tricks or manual inspection, or does not appear in the normal dashboard journey.
- **Proof command:** Playwright journey or explicit manual UI check: sign in, open `/dashboard`, and verify the artifact is visible in the real dashboard surface.
- **Do-not-count conditions:** DB inspection, API responses, console logs, screenshots from non-dashboard surfaces, or developer-only views do not count; docs/screenshots/visual polish/SEO/refactors/unrelated tests also do not count.

### 4. User can approve/send/save/use the artifact

- **Works means:** the user can take the intended action on the artifact inside the product flow and reach a completed outcome without repair work.
- **Broken means:** approve/send/save/use actions error, dead-end, require manual editing to become valid, or force the user into hidden operator steps.
- **Proof command:** Playwright journey or explicit manual UI check: perform the real approve/send/save/use action from the dashboard artifact and verify completion.
- **Do-not-count conditions:** button presence, local component state, partial form fill, or an operator-only workaround does not count; docs/screenshots/visual polish/SEO/refactors/unrelated tests also do not count.

### 5. Output quality is demoable and money-moving

- **Works means:** the artifact is grounded, timely, finished, and strong enough to demo as real Foldera value that could move a user toward action or revenue.
- **Broken means:** the artifact is generic, timid, advisory, obviously unfinished, weakly grounded, or embarrassing to show in a real demo.
- **Proof command:** explicit manual UI check: read the real artifact in-product and verify it is sendable, usable, or worth saving without rewriting.
- **Do-not-count conditions:** structural validity alone, pretty formatting alone, or "better than before" language does not count; docs/screenshots/visual polish/SEO/refactors/unrelated tests also do not count.

### 6. System repeats reliably

- **Works means:** the same production path succeeds repeatedly without babysitting, hidden resets, or one-off operator intervention.
- **Broken means:** the path works once but flakes, requires manual cleanup between runs, or fails for non-owner depth/repeat runs.
- **Proof command:** explicit manual production check: verify repeated runs of the same flow, with the required outcome reproduced reliably rather than once by luck.
- **Do-not-count conditions:** a single lucky pass, a replay that skips the real path, or a run that depends on manual cleanup does not count; docs/screenshots/visual polish/SEO/refactors/unrelated tests also do not count.

### 7. Visual polish comes last

- **Works means:** after rungs 1 through 6 are already true, the completed surface is visually clear and demo-safe.
- **Broken means:** polish problems are real only after the product already works; a polished screenshot of a broken flow is still broken.
- **Proof command:** Playwright visual journey or explicit manual UI check after functional proof exists.
- **Do-not-count conditions:** screenshots, pixel polish, copy tweaks, or layout cleanup without advancing a lower rung do not count; docs/screenshots/visual polish/SEO/refactors/unrelated tests also do not count.

## Controller Rule

Every Foldera Codex run must map to:

Doctrine -> production rung -> works/broken definition -> proof command -> result.

If Codex cannot prove that at least one production rung advanced, the run did not count.

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
