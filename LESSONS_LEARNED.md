# LESSONS LEARNED — LOCKED MARCH 21, 2026

These are permanent. They do not get revisited, softened, or worked around.

## 1. "Done" Without Live Proof Is a Lie

A build pass is not verification. Code pushed is not code proven.

Every CC/Codex session that touches the pipeline must:
- Re-trigger production after deploying
- Query the database for the expected outcome
- Show the receipt (email delivered, action row created, correct status)
- Only THEN report "done"

If a session says "done" without a production receipt, it is not done. Reopen it.

## 2. Fix the Class, Not the Instance

| Wrong | Right |
|---|---|
| Token expired -> refresh it | Token expiring -> auto-refresh 6hrs before cron |
| Commitments exploded -> purge | Commitments growing -> ceiling at 150, auto-suppress |
| Signal stuck -> reprocess | Signal undecryptable -> flag dead_key, never retry |
| Email didn't send -> debug | No valid candidate -> send wait_rationale anyway |
| CC forgot context -> remind it | CC loses context -> one-concern-per-prompt structure |

If you fixed the same problem twice, you fixed the instance. Build the defense that makes the problem impossible.

### 2b. Remove Friction Before Explaining It

The canonical version of this rule now lives in `FOLDERA_OPERATING_SYSTEM.md`.

Permanent lesson: "status visible but not acted on" is the same class of failure as "done without proof" because it makes the user operate the system.

## 3. The Five Weekly Killers

These five things broke Foldera every single week from March 10-21:

1. **Token expiry** — silent sync failure, no alert, user wakes to nothing
2. **Unverified CC sessions** — "done" without proof, next session discovers wreckage
3. **Mid-session task stacking** — context compacts, half the work lands, bugs multiply
4. **Commitment explosion** — extraction outpaces cleanup, scorer drowns in noise
5. **No second user test** — everything works for Brandon, breaks for everyone else

Each has a permanent defense:
1. Token watchdog in `self-heal.ts`
2. Acceptance gate as final step of every session
3. One-concern mega-prompt template
4. Dedup gate + commitment ceiling in `self-heal.ts`
5. Multi-user check in every prompt + Gate 2

## 4. The Immune System Sequence

Three prompts, three sessions, in order:

1. **Self-heal (defenses)**: token watchdog, commitment ceiling, signal drain, queue hygiene, delivery guarantee, health alert
2. **Self-learn (auto-suppression)**: 3 skips on same entity -> auto-suppress. User approval on suppressed entity -> lift suppression. No manual goal editing.
3. **Self-optimize (dynamic threshold)**: weekly approval rate check. Below 20% -> tighten. Above 60% -> loosen. System finds its own quality bar.

After all three land, Foldera heals itself, learns from behavior, and adjusts its own standards. That is the product promise delivered.

## 5. Monday Morning Sweep

Every Monday before Brandon opens anything:
- Search last week's project chats
- Check Vercel deployment health
- Query Supabase: token expiry dates, commitment counts, signal backlog, action approval rates
- Deliver 5-line status: what's green, what's drifting, what's the one prompt to send

Not a report. Not an audit. Five lines. Brandon approves direction, CC builds, Claude verifies.

## 6. Session Closure Rules

No session ends without answering:
- What was built?
- What was NOT tested?
- What risk carries forward?
- Did the acceptance gate pass against production?

"We're good" is not a valid session close.

## 7. The Product Contract

- The morning email ALWAYS arrives. Silence is a bug.
- Exactly one directive, exactly one finished artifact.
- If the user has to do work after approving, the product is broken.
- A correct "nothing today" is better than a bad directive.
- The system fixes itself or tells you exactly what it can't fix.
- Brandon is never the training mechanism.

## 8. Permanent Success Criteria

The system passes if and only if ALL of these are true every morning with zero human intervention:

1. **DELIVERY**: Email arrives by 7am PT. Every morning. `wait_rationale` counts. Silence fails.
2. **SELF-HEALING**: Tokens, signals, commitments, queue — detected and resolved automatically.
3. **SELF-LEARNING**: Skips and approvals change future output. No manual teaching.
4. **SELF-OPTIMIZING**: Threshold adjusts based on approval rates. System finds its own bar.
5. **MULTI-USER**: Everything works for someone who is not Brandon.

Failure on any criterion = the system is broken. Not "needs improvement." Broken.

## 9. Production E2E Tests Replace Self-Grading

CC cannot test real OAuth flows, session persistence, or redirect chains in its sandbox. The production E2E suite (tests/production/smoke.spec.ts) runs against https://www.foldera.ai with stored session cookies. It catches:
- Middleware redirect loops (the March 23 sign-in bug)
- Session cookie domain mismatches
- API routes returning 401 due to empty userId
- UI copy regressions (pricing, CTAs)
- Dashboard rendering failures

Every deploy must pass this suite. "Build passed" is not verification. "Production E2E passed" is verification.

## 10. The LLM Cannot Be the Authority for Persisted Action

The LLM generates text and artifact content. It does not choose what gets persisted.

**The bug class**: any system where `action_type` is derived from `payload.artifact_type` (LLM output) is a system where a hostile, confused, or hallucinating model can corrupt the intent. This happened in production: the scorer said `send_message`, the LLM said `wait_rationale`, and `wait_rationale` persisted.

**The fix class**: a `DecisionPayload` computed deterministically from scorer output becomes the canonical authority before the LLM is called. The LLM renders prose and artifact content. It cannot change the action. Drift is logged, not followed.

**The proof class**: adversarial tests must feed a well-formed hostile LLM response and assert that the canonical action persists unchanged. If the tests pass, the authority leak is structurally impossible, not just currently absent.

Rules locked:
- `DecisionPayload.recommended_action` is the only source of truth for `action_type`
- `LLM.artifact_type` is a diagnostic field; it is logged and never persisted
- If the payload is stale, blocked, or insufficient, the LLM is never called at all
- Any in-flight conversion of LLM artifact type (e.g., `wait_rationale → write_document` inside render path) must be removed — it masks drift before detection
- Adversarial proof tests (hostile drift, false-positive render, renderer-only contract) are mandatory for any system that calls an LLM and persists an action

## 11. Data Width Before Prompt Tuning

Expanding data windows (signals, entities, evidence) is necessary but not sufficient. The generator prompt's confidence scale must match what the data can actually support.

**The bug class**: scorer loads thin data (50 signals, 10 entities, 14-day evidence) → LLM prompt demands "multi-domain convergence" → LLM returns confidence 0 → no directive ever sends. Expanding data to 200 signals / 30 entities / 90-day windows still returns confidence 0 because the prompt bar is calibrated for a data density that doesn't exist yet.

**The fix class**: calibrate the prompt's confidence scale to the actual signal landscape. A strong single-domain email thread with clear next step = confidence 60-70, not 0. Multi-domain convergence is a bonus, not a requirement. The send threshold is 70 — the prompt must allow 70+ for well-evidenced single-source actions.

**The priority inversion**: P1 goals had priority number 1, but scorer used raw number as weight, giving P5 goals 5x influence. Fixed by inverting to `(6 - priority)`. Always verify that priority=1 means most important throughout the entire pipeline, not just at insert time.

## 12. Always Grep for ALL Call Sites Before Modifying Any Function

`validateDirectiveForPersistence` had 3 call sites across 2 files. The fix in `generator.ts` exempted discrepancy candidates from decision enforcement checks. The fix in `daily-brief-generate.ts` (~line 1539) was missed. Discrepancy candidates were still blocked in production because the second call site ran without `candidateType` and the exemption never fired.

**The rule**: before modifying any function's behavior or adding a new parameter, run `rg 'functionName' --type ts` across the entire codebase and list every call site. Fix ALL of them or the fix is incomplete. A single grep miss means the bug survives the "fix" and wastes a full debug session to rediscover.

This applies to: validation functions, lifecycle gates, auth guards, confidence thresholds, trust class logic — anything that is called from more than one place.

## 14. Async Helpers Outside Inner try/catch Can Still Null the Whole Artifact

`generateArtifact()` wrapped the Anthropic call in `try/catch`, but `await loadRelationshipContext()` ran **before** that try. Any Supabase error (or transient DB failure) propagated to `runDailyGenerate`, which only catches `generateArtifact` errors by leaving `artifact === null` — producing `Artifact generation failed.` even though `write_document` has emergency fallbacks inside the inner catch.

**Rule:** For any pipeline stage that must never return `null` for a canonical action type, every `await` on the hot path must either sit inside the same `try` as the recovery logic or have its own `try/catch` with a safe default. “Inner catch covers LLM failures” is false if an outer await throws first.

## 13. Entity Skip Penalty Applies Only When Email Is Required

A flat `entityPenalty` (e.g. −30) for every candidate type kills calendar-, drive-, and conversation-shaped loops that never had an inbox match. **Rule**: apply skip/entity penalties only when the locked action is `send_message`. For `write_document`, `make_decision`, and `schedule`, entity match is not a prerequisite to act — keep `entityPenalty: 0` on those paths unless a separate product rule says otherwise.

## 15. Gate Exemptions Must Align Across All Three Layers

Three independent gates control whether an artifact reaches `pending_approval`:
- `validateGeneratedArtifact` (generator.ts) — LLM output validation
- `isSendWorthy` (daily-brief-generate.ts) — content quality gate
- `evaluateBottomGate` (daily-brief-generate.ts) — structural readiness gate

If ONE gate exempts a candidate class (e.g. discrepancy), ALL THREE must exempt it identically. A misalignment means the generator says "this is fine," isSendWorthy says "blocked," and the artifact dies silently. This happened with discrepancy + write_document: generator exempted it, isSendWorthy only exempted discrepancy + send_message + valid @, evaluateBottomGate had no discrepancy exemption at all.

**Rule:** When adding or modifying ANY gate exemption, grep for all three gate functions and verify alignment. A single-gate fix is always incomplete.

## 16. Quality-Gate Failures Must Be Visible to the Scorer

`persistNoSendOutcome()` saves blocked artifacts as `action_type: 'do_nothing'` with `status: 'skipped'`. The scorer's skip detector searches `directive_text` for entity names to penalize repeat losers. But `do_nothing` rows from quality-gate blocks lose the original candidate identity. The same candidate wins forever because its failures are invisible to the scorer.

**Rule:** Every `persistNoSendOutcome` call must include `original_candidate` metadata in `execution_result` (original action_type, candidate description, blocked_by reason). The scorer must check this metadata when computing skip penalties. A quality-gate block IS a skip for scoring purposes.

## 17. Pattern Candidates Are Not Entity Candidates

Multi-entity pattern candidates ("deadline across 4 contacts") have no single entity to suppress. Entity-name-based skip detection (`getEntitySkipPenalty`) misses them entirely because it searches for first-name substrings, and the candidate description may not contain any single entity's first name prominently.

**Rule:** Add a fuzzy description-overlap check alongside entity-name matching. If the last 3 actions have 80%+ word overlap with the current candidate description (regardless of entity names), penalize by -50. This catches pattern candidates that repeat without being entity-specific.

## 18. Reconciliation Must Run Before Guards That Depend On It

The `pending_approval` early guard blocks generation when a pending row exists. Reconciliation cleans stale pending rows. If the guard runs first, stale rows block generation forever because reconciliation never gets a chance to clean them.

**Rule:** Any cleanup/reconciliation step must execute **before** any guard that checks the data it cleans. Combine with a rolling staleness cutoff (e.g. only treat pending within the last N hours as blocking) so same-calendar-day UTC rows cannot silence generation for 24+ hours after the user never sees an email.

## 19. Value Is the Only Score. Hygiene Is Not Progress. (the meta-lesson)

The repo can be green, secure, indexed, audited, and CI-clean and still be **failing**, because none of that is the product. The product is: *one valued act the user would not have done themselves.* "The site is healthy but it's not producing value" is **not a footnote — it is the only line that matters.** Audit passes (security/data/cost/runtime) are hygiene; they make the failure *tidier*, not *solved*. Brandon's words: *"besides the fact that it's not producing value."* That "besides" is the whole game.

**Rule (value-first verdict):** Before declaring ANY seam/pass "done," answer in one sentence: *did this move the product closer to producing a real valued act the user acts on?* If the honest answer is "no, this was hygiene," **say exactly that** and name the ONE current value lever. As of 2026-06-19 that lever is: **a paid gem-validation generation cycle** (gem-ranking #456 is live; confirm a real gem clears the bar instead of "nothing cleared the bar"). Everything else is sweeping the floor of a store with nothing on the shelves.

**Why the system keeps forgetting what matters (the actual mechanism):** Agents are stateless across sessions — they rebuild context only from repo files at boot. The boot reads `ACTIVE_HANDOFF.md` first. But that file is hard-capped at 80 lines and is mostly a graveyard of "Issue #X COMPLETE" archive, so the one thing that matters (value isn't being produced) is buried or absent. So every new agent re-derives, re-audits, and ships more hygiene. *The forgetting is structural, not a memory bug.*

**Rule (don't-forget anchor):** The cockpit (`ACTIVE_HANDOFF.md`) must open with a short, stable **"DON'T FORGET / NORTH STAR"** block that any boot hits first: (1) value is the only score; (2) safe silence beats a fake card; (3) no "done" without live product proof; (4) don't make Brandon the router/tester/merger; (5) the current single value-blocker. Completed-issue history belongs in `SESSION_HISTORY.md` / git, **never** in the live cockpit — git is the archive (AGENTS.md). A short cockpit that leads with value is the fix for "the continuity thing is garbage."

**Sub-lessons from the session that wrote this (2026-06-19, Pass 4):**
- **CI can be false-green or false-absent.** GitHub Actions here is owner-side capped, so "CI" proves nothing — it simply doesn't run. Deterministic *local* proof (full suite + build + lint + typecheck + gate) is the real gate. (Reinforces Lesson #1: green ≠ proven.)
- **The control plane fights parallel work.** Three single-file truths (`ACTIVE_HANDOFF.md`, `ACTIVE_SEAM_STATE.json`, `.foldera-contract.json`) mean every new slice rewrites a per-seam contract and two control files, and any two PRs touching them collide. That overhead IS the "the repo fights me" tax. Keep per-seam contracts minimal; keep the cockpit short; prefer one small PR over re-editing the same control file twice.
- **The retry value-tax.** ~74% of directive generations pay for a second full LLM call because the first fails validation (Pass 4 / C-2). Paying 2× to produce drafts that mostly don't clear the bar is the cost-shaped face of the value problem: the brain is expensive *and* quiet.

## 20. Don't Front-Load Choices. Pick, Execute, Report. (+ consequence ≠ keywords)

Brandon, repeatedly and bluntly: *"you pick never front load again."* Ending a turn with a menu of options ("do you want A, B, or C?") before doing any work is a failure mode — it makes him the router/decider (violates the BRANDON.md "don't make Brandon the router" rule) and reads as stalling. He had to redirect three times in one session because each turn front-loaded a decision instead of moving.

**Rule (bias to action):** Make the highest-leverage call yourself, do the work end-to-end, and bring the **result + reasoning**, not the question. Reserve a genuine question only for a true fork that (a) is irreversible or outward-facing AND (b) you cannot resolve from context. A production *data* write of a derived, recomputable field (e.g. backfilling `risk_score`) under a standing "fix everything / you pick" directive is **act, then report** — not a question. When unsure, prefer the safe, reversible, harness-provable move and just do it.

**The discovery that drove this session (consequence ≠ keywords):** the engine produced 100% `do_nothing` not because the inbox was quiet but because `computeCommitmentRisk` gave a flat **+15 for the mere presence of a `$`**. On live data that ranked a **$2.71 statement credit (87)** and a **$6.50 milk-frother choice (75)** at/above a **$7,199.50 ESD statutory hardship waiver (85)**. Noise and the one real obligation were indistinguishable, so every selected winner was hollow.

**Rule (stakes scale with magnitude, not presence):** A stakes signal must scale with *magnitude × irreversibility × who-it-affects*. Presence of a number/`$`/"payment" keyword is nearly worthless — almost every receipt has one. Informational money movement (statement credits, subscription receipts, scheduled autopay) is a *notification*, not an obligation; collapse it. Fixed in `lib/signals/commitment-risk.ts` (#474/PR #475), proven on real rows and backfilled live: waiver → 92 (#1), receipts → 22. `commitment-risk.ts` is the reference pattern; carry it up into the signal-side stakes and the generator's `positive_winner_contract` next.

## 21. Continuity Must Be a Ratchet: Read Enforced at Start, Write Enforced at Stop

Brandon: *"how is this self-learning… it needs to enforce get smart every time not this session one and done… is it gonna roll fwd it's not auto."* Right diagnosis. A doc the agent *chooses* to read (`AGENTS.md`, `ACTIVE_HANDOFF.md`) and a roll-forward the agent *chooses* to do are both skippable — that is why the system kept forgetting. More governance prose does not fix it; only harness-run hooks do, because the harness executes them, not the agent, so they cannot be ignored.

**Rule (the continuity ratchet — both ends must be wired):**
- **SessionStart hook** (`.claude/hooks/session-start.sh`) injects the brain — DON'T FORGET, active seam, next exact move — into every session *before the first action*. Read enforced.
- **Stop hook** (`.claude/hooks/session-stop.sh`) blocks a silent stop when code changed but `ACTIVE_HANDOFF.md` / `ACTIVE_SEAM_STATE.json` / `LESSONS_LEARNED.md` did not — roll the seam forward and append the lesson. Write enforced. It blocks once (respects `stop_hook_active`) so it reminds, never traps.

Read-enforced **+** write-enforced = institutional memory that COMPOUNDS instead of one-and-done. Keep this distinct from *product* self-learning from real user outcomes (`outcome-learning.ts` / autopsy scripts) — a different layer. Wired in `.claude/settings.json` (2026-06-23). This very entry exists because the Stop hook required it.

## 22. Evergreen TL;DR Mode: a Bounded, Enforced Summary at Both Ends

Brandon: *"enforce evergreen tldr mode."* Two enforced halves, wired the same way the continuity ratchet is — harness/gate, not prose-you-choose-to-honor:

- **Cockpit TL;DR:** `ACTIVE_HANDOFF.md` opens with a `## TL;DR` (3–5 lines: where-we-stand + the single next move). The SessionStart brain surfaces it FIRST; the Stop ratchet keeps it fresh (can't change code + stop without touching the handoff); `gate:continuity` requires the marker and bounds it to ≤ 8 non-blank lines so it can't regrow into a wall.
- **Output TL;DR:** every reply leads with a ≤4-line TL;DR and stays terse by default — no end-of-session wall-of-text, expand only on request. Re-injected by the SessionStart brain so it persists across sessions ("evergreen"), and written into `AGENTS.md`.

**Rule:** a standing behavior only sticks if it's enforced where it can't be skipped — gate for the artifact, brain-injection for the behavior. A bound (≤8 lines) is what makes "evergreen" real: without it, summaries rot into walls. Wired 2026-06-23 (`scripts/continuity-gate.ts`, `.claude/hooks/session-start.sh`, `AGENTS.md`).

## 23. Automate the Process Win at the Gate/Script — Don't Re-Derive It

A friction audit of one session (4 PRs: #526/#528/#529/#530) found the same motion burned over and over: every push needed `--no-verify` (the pre-push `npm run build` + Playwright smoke time out in the agent sandbox); the control plane was hand-edited every cycle to stamp `active_pr` and roll `deployed_commit_sha`; and a fresh container had no `node_modules`. The biggest waste: the `active_pr` stamping commits gated **nothing** — `ci.yml` (the real PR gate) doesn't run the continuity gate at all; only `pr-sentinel.yml` does and it's `workflow_dispatch`-only.

**Rule (same shape as the continuity ratchet and evergreen TL;DR mode):** when a process step is friction you hit more than once, encode it as a guard/script/hook so the next session inherits it — never re-derive it by hand. Concretely (2026-06-23):
- `.husky/pre-push` auto-detects the agent sandbox (`CLAUDECODE`/`CLAUDE_CODE_REMOTE`) and skips the heavy lanes; CI still gates build + e2e (no policy drift).
- `npm run roll` (`scripts/roll-pointer.ts`) stamps `ACTIVE_SEAM_STATE.json` in one command and self-validates with the gate — no hand-edited JSON.
- `npm run setup` = `npm ci`; the SessionStart brain warns when deps are missing; owner sets the env setup script to `npm ci`.
- `AGENTS.md` → "Ship Rhythm (sandbox)" records the ceremony-killers (active_pr isn't a CI gate; one PR per change; no `--no-verify`).

**Meta:** before repeating a manual workaround a third time, stop and move it into the harness.
