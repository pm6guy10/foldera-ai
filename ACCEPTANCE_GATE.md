# Acceptance Gate

Product contract checklist. Every artifact candidate must pass before it ships.

## Product Promise

Foldera is focused on Brandon's job, interview, benefits, payment, admin deadlines, and calendar conflicts. It watches real inbox/calendar signals, then produces one exact ready-to-use artifact Brandon can save or skip.

Foldera is not a generic morning-summary product. Command-center category is diagnostic, not a hard allowlist. The artifact gates block only safety, fabrication, stale-event, and action-contract failures; quality-only concerns persist as `soft_warnings` and must not stop generation, pending approval, or send-time success.

`No safe artifact today.` is valid only when no viable candidate exists or a hard safety/action failure remains.

## Production Ladder: Works / Broken / Proof

This ladder is the operational definition of production truth.

- `Works` means observable product behavior, not logs alone.
- `Broken` means a failed observable condition at the rung being claimed.
- `Proof` must be a build command, test command, Playwright journey, or explicit manual UI check.
- A change does not count if it only updates docs, screenshots, visual polish, SEO, refactors, or unrelated tests.
- Browser/product proof is the closure standard: files changed, tests passed, docs updated, CI green, logs, screenshots, and build output are never product success by themselves.
- If browser/product proof is missing or fails, the verdict is NOT DONE.

### 1. Command-center scan completes end-to-end

- **Works means:** one real production command-center scan reaches a completed product outcome with no manual rescue in the middle.
- **Broken means:** the run stalls, errors, exits early, or only proves internal progress while the user-observable flow never completes.
- **Proof command:** explicit manual UI check: trigger one real production scan and verify the run reaches either one allowed artifact or `No safe artifact today.` rather than a log-only success.
- **Do-not-count conditions:** cron 200s, logs, traces, DB rows, or internal stage markers by themselves do not count; docs/screenshots/visual polish/SEO/refactors/unrelated tests also do not count.

### 2. It creates one allowed usable artifact or a safe no-artifact result

- **Works means:** the completed run produces exactly one finished artifact or returns `No safe artifact today.` when no viable candidate exists or a hard safety/action failure blocks all candidates.
- **Broken means:** the output is null, empty, duplicated, placeholder-filled, fabricated, stale, action-mismatched, a relationship-silence artifact, or not usable as shipped.
- **Proof command:** explicit manual UI check: inspect the produced artifact in the real product surface and confirm it is a single finished artifact, with any quality-only concerns visible in receipts as soft warnings rather than hidden hard suppression.
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

## Controller Backlog Eligibility

`controller:autopilot` may select only backlog items that are actionable now.

An item is actionable only when `Status: OPEN` and the next required step can be performed now by code, tests, or free proof in the current repo/runtime.

The controller must skip items whose status or next blocker requires unavailable external account setup, paid/model quota, passive waiting, paid proof, manual reauth, real user onboarding, a future natural cron/time window, fabricated production data, or fresh failure evidence that does not currently exist. Skipped items remain open or waiting; they must not be closed until their real proof requirement is satisfied.

## Permanent Success Criteria

The system passes if and only if ALL of these are true for the command-center path with zero human intervention:

1. **SCOPE**: Job, interview, benefits, payment, admin deadline, and calendar-conflict candidates remain the product focus, but unrecognized category/scope is not a hard block by itself.
2. **OUTPUT**: Exactly one artifact appears, or `No safe artifact today.` appears when no viable candidate exists or a hard safety/action failure blocks all candidates.
3. **NO OUTBOUND BY DEFAULT**: Follow-up email drafts are for review only unless an explicit send flag is enabled elsewhere.
4. **SELF-HEALING**: Tokens, signals, commitments, and queue issues are detected and resolved automatically via `lib/cron/self-heal.ts`.
5. **MULTI-USER READY**: The path remains user-scoped and does not depend on hardcoded Brandon data, even while Brandon is the wedge proof user.

Failure on any criterion = the system is broken. Not "needs improvement." Broken.

## Core Contract

- [ ] Exactly one artifact or exactly one `No safe artifact today.` result
- [ ] Artifact categories are diagnostic only; no recognized command-center class is required to pass
- [ ] If the user has to prepare, review, research, or invent missing facts after saving, the artifact is broken
- [ ] Generic morning summaries, homework, and broad autonomy are soft-warning quality failures unless they also contain a hard safety/action failure
- [ ] Relationship-silence artifacts, fake obligations, placeholders, fabricated claims, stale-event artifacts, and action-type mismatches are blocked
- [ ] A correct `No safe artifact today.` is better than an unsafe or fabricated artifact
- [ ] Outbound email is not part of the default product promise

## Primary User-Facing Artifact Categories

1. **Interview role-fit packet**: grounded from real job/interview/resume signals; gives Brandon finished role-fit language or a ready packet.
2. **Follow-up email draft for review only**: real recipient, non-empty subject/body, grounded in a real job/interview/admin thread, and not sent by default.
3. **Deadline/risk decision brief**: one concrete decision, risk, deadline, and next action from real signals.
4. **Benefits/payment/admin action packet**: exact admin/payment/benefits response packet with source, deadline, required fields, and ready text.
5. **Calendar conflict resolution brief**: one calendar conflict, decision, tradeoff, deadline, and calendar move.
6. **Other grounded artifact**: allowed to proceed when it has no hard safety/action failure; category gaps are diagnostics and soft warnings.
7. **No safe artifact today.**: required result only when no viable candidate exists or hard safety/action failures block all candidates.

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
- [ ] Coaching/advice language is recorded as a quality warning and judged by approve/skip unless it also carries a hard safety/action failure
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
