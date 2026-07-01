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
| Stale commitment surfaced -> suppress that row | Past-due EVENT -> auto-expire from candidacy at scorer load (#562) |

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

## 24. A Gate That Runs Only on `workflow_dispatch` Gates Nothing — Wire It to the PR Event

Follow-on to #23. The friction audit found `gate:continuity` was well-designed and even had an `active_branch`-parity check, but its only CI wiring was `pr-sentinel.yml` (`on: [workflow_dispatch]`) — a human had to remember to click it, so in practice it never ran and a PR with a stale `ACTIVE_SEAM_STATE.json` (wrong branch, closed active issue, bloated TL;DR) merged freely. An unenforced gate is theater: the logic exists, the enforcement doesn't.

**Rule (enforcement lives in the trigger, not the script):** a quality gate is only real when it runs on the event it's meant to guard — `on: pull_request` for a per-PR invariant, not `workflow_dispatch`. Before trusting any gate, check *what fires it*. Concretely (2026-06-23): added `.github/workflows/continuity-check.yml` (`on: pull_request`, skips drafts) so `npm run gate:continuity` runs on every non-draft PR; the remaining step is owner-only — mark `continuity-gate` a required status check in branch-protection (a workflow file creates the check; only Settings → Branches can *require* it).

**Two friction corollaries shipped with it:** (a) the brain only surfaces the live product's health if the pointer carries it — `npm run roll -- --cron-outcome <x>` now stamps `last_cron_run`/`last_cron_outcome` and SessionStart prints a `cron:` line in the ACTIVE SEAM block, so "is the product alive?" no longer costs a manual Supabase query each session; (b) the Stop ratchet now names the exact command (`npm run roll -- [--pr N | --no-pr]`) instead of saying "roll the pointer forward" — a reminder that names the move is cheaper to obey than one that makes you re-derive it.

## 25. A Data Mutation Has a Code Half — Don't File It as "Owner-Only"

While answering "what do we do next to make money," a check of the two owner accounts (Supabase, 2026-06-23) showed the #509 split-brain consolidation had fully executed: `e40b7cd8` was **empty** (0 actions / 0 signals / 0 pipeline runs) and `2cbc1bab` held **everything** (1,227 actions, 5,775 signals, 1,010/14d). Yet `lib/auth/constants.ts` still hardcoded `OWNER_USER_ID = e40b7cd8` — so every owner script, the Slack self-loop, `winner-truth`, and `beta-readiness` were keyed to a dead husk. The control plane had filed this under "Owner (sandbox cannot do): set Vercel `OWNER_USER_ID`/`FOLDERA_SELF_USER_ID`" — but `OWNER_USER_ID` is a **code constant**, not an env var. The "owner-only" label hid a one-line code fix for days.

**Rule:** when a DB/identity migration is executed, the same change usually has a **code half** (constants, hardcoded IDs, fixtures) that must move in lockstep — grep the literal across the whole repo (`rg <uuid>`), not just the env. And when something is parked as "owner-only / sandbox-cannot-do," sanity-check that it actually requires owner privileges; a surprising amount of "owner work" is a code edit the harness can do and prove. Two genuinely-distinct halves remain owner-only here: the **DB mutation** (done, #509) and the **Vercel env** (`FOLDERA_SELF_USER_ID`, hidden value, drives the self-loop cron) — but the constant was neither. Fixed 2026-06-23: `constants.ts` + `owner-user-id-boundary.test.ts` + the 4 `.mjs` debug scripts repointed to `2cbc1bab`. Corollary for #518: the dark verdict is **not** data-starvation (the account is rich) — it is gate calibration, which keeps the focus where the value is.

## 26. The Seam Pointer Is the Most Expensive File to Leave Stale — Update It First, Not Last

(2026-06-24 — #524 repo cleanup session.) The entire session booted on a stale seam pointer: `ACTIVE_SEAM_STATE.json` still named closed issue #518 and merged PR #536 as the active seam. Every session-start brain injection surfaced verdict-calibration context that no longer applied. The cleanup-branch exemption in `continuity-gate.ts` was needed *because* the pointer hadn't been updated when #536 merged — the gate was failing on the mismatch between the new cleanup branch and the stale `active_branch` field.

**Rule:** when a seam closes (PR merges), the very first commit on the next branch must update the 4 control-plane files (`ACTIVE_SEAM_STATE.json`, `FOLDERA_BUILD_ORDER.yaml`, `.foldera-contract.json`, `ACTIVE_HANDOFF.md`) before anything else. A stale pointer is more expensive than it looks: it misleads the session brain (wrong context injected at boot), fails the gate (branch mismatch), and cascades into cleanup work that wouldn't have been needed. The `npm run roll` command exists for exactly this — run it as the first commit, not the last.

**Corollary — ghost refs in contractless sets silently bloat governance:** `STOP_STATE_CONTRACTLESS_FILES` in `scripts/preflight-contract.ts` had 3 entries for files that never existed (`CURRENT_STATE.md`, `scripts/controller-autopilot.ts`, `scripts/__tests__/controller-autopilot.test.ts`). They made it appear that more files were safe to commit without a contract than actually were, and they kept tests pegged to a fictional controller-cleanup scenario. Removing them broke 7 tests that needed to be rewritten to match real file paths. Lesson: any file in a contractless allowlist that doesn't exist in the repo is a lie waiting to confuse the next agent.

**Corollary — cleanup-branch exemption belongs in the gate, not in the seam pointer:** when a branch is structurally off-seam (hotfix, cleanup), the gate should recognize that by pattern, not require the seam pointer to be updated to match. Without the `/^claude\/(hotfix-|[^/]+-cleanup-)/.test(currentBranch)` exemption, every cleanup branch would fail the parity check until someone remembered to update `ACTIVE_SEAM_STATE.json` again. Encode the structural exception once in the gate; don't rely on per-seam memory.

## 27. Filter the Pool Before the Extractors, Not Inside Them — Extractors Are Blind to Whole Garbage Classes

Seam #537 (2026-06-23) surfaced what the product does when professional signal is thin: it doesn't go quiet, it reaches down the discrepancy ranking and lets a **passive counterparty callback** win the card — *"Columbia Motors will contact you regarding the 2017 Toyota Sienna."* That is a commitment where the **counterparty is the subject and Brandon has no move**. It is structurally a zombie: past-due, untouched for weeks, and re-minted every run, so manual `suppressed_at` is whack-a-mole.

The instinct is to fix it inside an extractor (e.g. add a staleness check to `extractExposure`). That fails: `extractExposure` is **future-due only**, so a *past-due* external-promisor callback never reaches it — it slips past an exposure-only gate and gets picked up by a different extractor. No single extractor can see the whole garbage class, because each extractor is scoped to one shape.

**Rule (chokepoint, not per-extractor patch):** when a bad candidate class can enter through *more than one* extractor, drop it from the pool **before any extractor runs** — a pre-filter in `detectDiscrepancies()` right after the `trust_class` filter, feeding `gate_funnel.discrepancy_candidates_preview`. That is the one pure, unit-testable chokepoint every extractor draws from. Implemented as `hasExternalPromisorPhrasing()` + `isStaleExternalPromisorCommitment()`: drop only when **all three** hold — (1) counterparty-as-subject phrasing (`"X will…"`, excludes the user's own imperatives and first-person `"I will…"`), (2) `due_at`/`implied_due_at` in the past, (3) no fresh touch in 21+ days. This is a *tightening* (drops garbage), never a gate loosen; the 3-condition predicate is tight enough that live/fresh/own-action commitments are untouched, so SAFE_SILENCE stays a valid success. Also: the gate must read the **normalized** form — `canonical_form` was added to the scorer commitment fetch (falls back to `description`) so phrasing matching isn't defeated by raw text. PR #539 (Fix A); Fix B (marketing-sender extraction filter) + Fix C (fuzzy dedup) are the same hygiene seam at the *creation* boundary.

**Don't trust the issue text's file guess.** The #537 issue named `daily-brief-generate.ts` as the fix site; that file calls the opaque `generateDirective()` and never sees individual candidates. The real chokepoint was the detector. Locate the seam by where the data actually flows, not where the ticket points.

## 28. Look at the End of the Pipe Before You Touch the Middle — and a Two-Layer Failure Can't Be Fixed One Layer at a Time

Brandon, 2026-06-24, after a day of pool-hygiene: *"we always touch on it and then we give up, fix one thing and move on… we're at the same farm. Does it work? Does it work well? Does it work consistently? … is it valuable? would someone pay for this?"* He was right, and the reason we kept circling is that **no session had ever simply queried the end of the pipe.** One audit (issue #540, FTR) answered "does it work?" in three live queries we should have run months ago:

- `pipeline_runs` outcomes all-time: **12 `generation_returned` ever**, vs 124 `generation_failed_sentinel`; **dark every run for 17 straight days** (last real generation 2026-06-07).
- `tkg_actions` ledger: **last user-executed directive was 2026-04-22** — two months dark. The June Slack-card surface (`action_source=workday_presence_trigger`): **8 attempts, 0 approved, 0 executed.** The new delivery surface had never delivered a single acted-on card, and nobody knew because the Slack send result is returned and dropped, never persisted (`trigger-runner.ts:680`).

**Rule (instrument the exit first):** before fixing any gate/scorer/extractor, run the outcome distribution and the delivered-act ledger on live data. "Where does value actually exit, and when did it last exit?" is one query and it reframes the entire problem. Months of middle-of-pipe tuning happened because we kept re-deriving the candidate pool and never looked at whether *anything ever came out.* A product with no persisted delivery receipt is a product you are flying blind on — add the receipt (Lesson #1 has teeth only if delivery is observable).

**The deeper finding — two failure layers, and fixing one alone does nothing:**
- **Layer 1 (plumbing):** the gate stack strangles its own output. `lifecycle_gate` zeroes 67/68 candidates (`scorer.ts:6184`), `positive_winner_contract` blocks the survivors (`artifact-taste-pack.ts:396/:414`), the one-sentence gate burns the paid retries (`generator.ts:7775`). The pool was healthy the whole time (141 fresh, 23 high-risk) — **silence was never data starvation, it was the gates** (Lesson #19, confirmed with the funnel).
- **Layer 2 (substance):** even when the plumbing opened, the output was mostly *homework* — "you're avoiding replies," "track this deadline cluster," "the goal is drifting." Observations about the user, not finished work. The scorer/discrepancy engine is built to surface patterns, and a pattern is homework.

**Why this is the trap we kept falling into:** each session fixed one Layer-1 gate, saw still-dark, and gave up — because Layer-1 fixes alone only let Layer-2 homework through. You cannot incrementally gate-tune your way to value when the thing the engine is *aiming at* is the wrong shape. That requires a product-definition decision, which is scarier than a code fix, so every session flinched.

**The one proof-of-value, and what it teaches:** exactly one act in the entire history cleared "valuable" — 2026-04-22, conf 95: it took a concrete real input that landed in the user's world (interview questions that actually arrived) and returned *"here is your completed prep."* It **did the work and handed it over done** — the inverse of homework. That is the north-star shape. The lesson isn't "tune gate N," it's: **re-aim the engine at the did-real-work-delivered-done shape and treat 'observation about the user' as out of scope.** Magic is reachable (N=1 proves it); the machine just isn't pointed at it.

**Rule (define "works" so the goalposts stop moving):** "works" = on live data, zero homework asked of the user: a real act on ≥5/7 consecutive days, delivered with a persisted receipt, tapped ≥1/week and called valuable, and ≥1/week of the did-real-work-done shape. Green CI is not on this list (Lesson #1). Until those hold live, the product does not work — say exactly that.

## 29. The Generator Has Two Semantically Opposite "Give Up" Paths — Safety Nets Belong in Only One

`generateDirective()` has two distinct failure modes that look similar in code but are structurally opposite:

- **`no_valid_action`** — the scorer exhausted the candidate pool and found nothing viable. Tier-descent belongs HERE: commitment data and open-loop signals are already loaded and may contain a truthful act even though the discrepancy pool is empty.
- **Generation-exhausted** — the scorer found viable candidates, the LLM ran 2+ retries against the winner, and still couldn't produce a clean artifact. Tier-descent does NOT belong here: recycling the same failed candidate against a weaker artifact frame doesn't produce a better artifact — it just lets bad output through under a different label.

**The bug that made this concrete (seam #538):** tier-descent was initially placed in the generation-exhausted branch. Immediately, BAD1-5 tests (simulate a good candidate + failing LLM) returned `send_message` instead of `GENERATION_FAILED_SENTINEL` — the bad-LLM scorer still left the candidate in `topCandidates`, so the Tier-3 filter picked it up. The fix was conceptual, not syntactic: identify which failure mode the safety net recovers from, then route it only there.

**Rule:** `scored.outcome === 'no_valid_action'` is the only branch where tier-descent may fire. The generation-retry/exhaust branch is downstream of a valid winner and must never trigger a safety-net path that re-routes to a different candidate class.

**Corollary — `isThreadBackedSendableLoop` is the correct Tier-3 semantic gate:** a loose type exclusion (`type !== 'discrepancy/compound/emergent'`) still passes `signal`-type candidates. Signal-type candidates are observations — precisely what the quality gate correctly blocks. `isThreadBackedSendableLoop` (existing scorer gate: commitment, relationship, or specific sendable discrepancy class with a real entity name) encodes "Foldera owes a reply on behalf of the user" — the only shape where Tier-3 is honest. A Tier-3 that bypasses this will misfire on stale observations the upstream gate already correctly rejected.

## 30. The Card Must BE the Act, Not Assign It — Homework Recurs in Every Artifact Type

The owner's repeated, visceral complaint across cards: *"it gave me homework… it should if anything have linked me a present."* A card that says "decide on gift type → purchase → wrap → confirm logistics," or "send a quick check-in," is a to-do list the user still has to execute. The act is the *done thing*: the reply already written (tap Approve & Send), the gift already chosen (tap to buy). "Here is your completed prep" (the lone N=1 magic moment, Lesson #28) is the shape; a plan is its inverse.

**The trap:** the fix is per-artifact-type, not global. #556 made `send_message` cards lead with the ready-to-send draft inline — but `write_document`/prep-steps cards (the Nathaniel-birthday 4-step checklist) kept handing homework, because that path was never converted. Fixing one artifact type and declaring "no more homework" is wrong; the disease lives in every generation path that emits a plan instead of a product.

**Rule:** for each artifact type the brain can emit, the card must render the *finished object the user approves or sends*, never a description of work for them to do. A multi-step "preparation steps" breakdown is a homework tell — if the card lists steps the user performs, it has failed, regardless of how well-grounded it is.

## 31. Verify the Dependency Before Handing the Owner Homework

For several turns the standing "next move" was *"set `GRAPH_WEBHOOK_SECRET` in Vercel + reconnect Outlook"* — owner homework, repeated every close. Both halves were wrong on inspection: Outlook was already connected (126 inbound mails ingested in 4 days — sync was live), and the secret is instant-push-only, **not required for daily cards at all**. The system was delivering on the daily cron with zero owner action; the "homework" was an unverified assumption dressed as a blocker.

**Rule:** before telling the owner to go do an infra step, prove the dependency is actually missing AND actually required for the outcome. Query prod (is the token live? is data flowing?) and trace whether the daily/default path even needs the thing. "Don't make Brandon the operator" (Lesson #20) includes not inventing operator tasks — an unchecked "you need to set X" is the same flinch as front-loading a choice. If the only true blocker is outside your tools, say *exactly that one thing* and confirm everything else runs without it.

## 32. A Changed Flag Is Not a Changed Outcome — Read the Winner, Not the Counter

After merging the #567 goal swap and flipping `FOLDERA_GOAL_SOURCE=stated`, a live run showed `goals_raw 4→2` and `outcome: safe_silence → write_document`. I called it "swap wins." It hadn't: reading the actual seeded `next_move` (`auth.users.workday_presence_state`), the winning card was *"make a payment to bring account under credit limit"* — the exact personal homework the swap was meant to kill. The counter (`goals_raw=2`) and the action *type* (`write_document`) both flipped, but the action *content* was still homework.

**Why it slipped through:** the swap changed the goal *source*, but the `goal_primacy_gate` blanket-exempts `type === 'discrepancy'`, and the detector emits `exposure`/`behavioral_pattern` discrepancies off any open personal commitment. Homework rode the discrepancy exemption clean past the objective anchor — a door the goal swap never touched. The fix (#585) is at the gate, not the goal source.

**Rule:** verifying a behavior change means reading the actual artifact the user would receive (the seeded move / the card body), never just the diagnostic counters or the action-type label. "goals_raw flipped" and "outcome is no longer safe_silence" are necessary, not sufficient. When a gate has a wholesale type-level exemption (`type === X` with no further test), assume it is a bypass that something undesirable will eventually ride — and that swapping an upstream input will not close it.

## 33. A "Send to Slack" Pipeline That Only One Caller Uses Is Not a Delivery Path — It's a Button

`buildRightNowMessagePayload` → `buildSlackRightNowMessage` → `postMessage` was already a complete, #394-finished-work-gated, doctrine-compliant function for turning `workday_presence_state` into a real Slack card. It existed, was tested, and worked — but its only caller was `app/api/slack/right-now/route.ts`, a manual owner-triggered "Post to Slack" button. Nothing automatic ever called it. So a heartbeat seed could produce a genuinely good, draft-backed, objective-anchored winner (#567 Phase A's whole point) and it would just sit in `workday_presence_state` forever, because the only thing that posts automatically — `trigger-runner` — fires exclusively off *fresh inbound signals* (a reactive bar a proactive recommendation can never clear on its own).

**The trap:** the pipeline being battle-tested and reused (good practice — "reuse the gate, don't reinvent it") created the illusion that delivery was solved. It wasn't; only the *render* step was solved. A payload-builder with one manual caller is a button a human has to remember to press, not a delivery path — and an unpressed button looks identical to "nothing to deliver" from the outside (both produce silence). The two are operationally indistinguishable until you check who calls the function.

**Rule:** when a "deliver X" function exists but has exactly one caller and that caller is a manually-triggered route, treat that as a finding, not a reassurance — ask "what automatically calls this for the case that matters?" before assuming the surface is wired up. Grep callers, not just existence, before declaring a pipeline "already handles it."

## 34. A New Automated Delivery Path's First Run Has No History to Protect It From Stale State

`proactive-delivery.ts` shipped with a content-based dedup cursor (`last_winner_key`) specifically to stop re-pinging an unchanged recommendation every heartbeat tick — but dedup only protects against *repeating* a delivery, not against *the first delivery being wrong*. Its first-ever production run hit the daily manual-call-limit (an existing, intentional brake on `skipSpendCap` calls, unrelated to and unaffected by this change) before the scorer ran, so `workday_presence_state` was never refreshed that tick — it still held a 3.5-hour-old winner seeded *before* the same day's goal-primacy fix had even deployed. With no prior cursor to compare against, the module read that leftover state, saw a perfectly well-formed, draft-backed, `payload.mode === 'active'` card, and posted it live to the owner's real Slack channel.

**Why review didn't catch it:** every test exercised the dedup path (`cursor.last_winner_key === winnerKey`) and the #394 finished-work gate, both real and necessary — but none asked "is this state actually *current*, or just whatever happens to be sitting in the DB?" `workday_presence_state` is only overwritten on a *successful* seed; a blocked seed (manual-call-limit, safe_silence, generation_failed, bottom_gate, ungrounded-send) silently leaves it untouched, so "a well-formed state exists" and "this tick produced a well-formed state" are different claims that look identical from inside the function.

**Rule:** for ANY function that reads mutable, possibly-stale shared state to decide whether to take an external action (here: post to Slack), require an explicit freshness check against the *current* operation's own clock — not just a dedup-by-content check against history. `state.updated_at` was already being stamped by the producer for exactly this purpose; it just wasn't being read by the consumer. When a new automated path is added on top of an existing "is this content already known" cursor, ask separately: "what happens on this path's very first run, before any cursor exists?" — that's precisely the run with zero history to fall back on.

## 35. When a New Path Supersedes an Old One, It Inherits None of the Old Path's Hardening For Free

`isOverManualCallLimit` was designed correctly from the start: count only interactive `directive`/`directive_retry` calls, excluding anything tagged with a `pipeline_run_id` from a cron-context call (via `runWithPipelineRunContext`). The segmentation worked — for the path it was wired into. But that path was `daily-brief-generate.ts`, retired when `seed-from-scorer-core.ts` became the real delivery mechanism (per SETTLED #1, "push architecture MERGED #555"). Nobody re-wired the segmentation into the new path, because nothing about adding a new delivery mechanism *looked* like it touched budget/auth code — the new path just called `generateDirective` directly, the same as everything else looked like it should. The result: the 3-call/day interactive budget silently became a 3-call/day budget for the ENTIRE system, scheduled cron included, and a single testing burst could (and did) block the legitimate scheduled heartbeat for the rest of the day with an opaque `"Manual directive call limit reached for today"` reason buried in a suppression trace nobody was looking at.

This is the second instance this session of the same underlying shape (see Lesson #33, the Slack delivery pipeline with one manual caller): an old mechanism did its job correctly, a new mechanism replaced it as "the real path," and a piece of cross-cutting hardening (delivery wiring in #33, budget segmentation here) that lived only in the old mechanism's call site silently failed to carry over — because nothing about writing the new path *looked like* it needed to know about the old path's safety mechanisms.

**Rule:** when a new code path supersedes/replaces an old one as "the real implementation," explicitly enumerate what cross-cutting concerns the OLD path satisfied (auth segmentation, budget exemptions, delivery wiring, rate limits, audit logging) and verify each one was either ported or is provably unnecessary for the new path — don't assume "it calls the same inner function, so the same protections apply." Grep for what called the old path's *neighbors* (the auth/budget/observability wiring sitting next to the business logic), not just the business logic itself.

**Addendum — the FIX repeated the bug's own shape on the first pass.** The first fix for this lesson only exempted `morning-pipeline`/`ingest-and-deliver` (the two callers the live incident happened to demonstrate) and left `graph-webhook.ts` — push, the doctrinally PRIMARY delivery path (SETTLED #1) — still capped by the same budget. The owner caught it by asking "why are we still at cron's mercy" when push was supposed to make cron irrelevant. The meta-rule: when fixing "caller X wasn't exempted from shared budget/auth machinery," grep for ALL callers of the underlying function (here: every call site of `seedFromScorerForUser`/`deliverWorkdayPresence`), not just the one the bug report named — a fix scoped to the reported symptom inherits the exact same blind spot as the original bug.

## 36. A Multi-Section Card Template Drifts Toward Restating the Same 1-2 Facts in Different Words

The "Decision lock" `write_document` template (`buildDecisionEnforcedFallbackPayload`, `lib/briefing/generator.ts`) had 9 separately-labeled, blank-line-separated sections: Source, Decision required, Deciding criterion, Owner, Next action, Deadline, the raw `copy.ask`, the raw `copy.consequence`, Mechanism. Reading the actual rendered Slack message (not the generator's structured return value) showed the deadline stated three times and the "ask" stated twice near-verbatim — because `memoAsk`, the standalone `Deadline:` line, and the embedded deadline inside `copy.ask`/`copy.consequence` were all independently derived from the same one or two underlying fields (`target`, `deadline`, `copy.ask`), each formatted by a different line in the template. Two more lines (`Deciding criterion`, `Owner: assign...`) were constant boilerplate text that never varied call to call — present in every card, carrying zero information about THIS card.

**Why it wasn't visible from the code:** each line in the `content` array looked locally reasonable — a labeled field with its own sentence. The redundancy only became obvious by reading the fully-rendered card as the human receives it (the owner did this; nobody on the build side had been doing it as routine verification — see Lesson #32, "read the winner, not the counter," for the adjacent but distinct failure of checking content correctness without checking content SHAPE/length).

**Rule:** when a template assembles a card/document from N separately-labeled sections, check whether any TWO sections are different phrasings of the same 1-2 underlying facts (a deadline, an ask, a consequence) before shipping it — and check whether any section is constant text that doesn't vary with the input. Multi-section templates accrete this kind of duplication naturally, because each section is usually written/edited independently over time, and nobody re-reads the assembled whole against "does each line add new information." The fix is almost always the same shape: collapse to the smallest number of sections where every sentence states something the reader doesn't already know from an earlier sentence.

## 37. A Retry Loop Can't Fix a Bug in the Field It's Retrying — It Just Repeats the Failure Twice

`parseGeneratedPayload` (`lib/briefing/generator.ts`) has two branches for reading the LLM's JSON: a "discrepancy engine" branch (`{action, confidence, reason, ...}` with fields at the top level) and a "legacy" branch (`{artifact_type, artifact: {...}}` with fields nested). The generator's validator-aware retry prompt explicitly tells the model the discrepancy-engine format is "preferred." The legacy branch had a `knownFields` copy-down loop that pulled top-level fields (including `reason`) into `artifact` when the model omitted the nested duplicate. The discrepancy-engine branch had no such loop — it only special-cased `send_message` and `write_document`, which each hand-copied their own specific fields. `schedule_block` (and by the same shape, `wait_rationale`) got nothing: a model-provided top-level `reason` was silently dropped, so `validateGeneratedArtifact`'s `schedule_block reason is required` check failed every time. The generator's own retry mechanism — which feeds the exact validation issue back to the model and asks it to fix it — could never succeed, because the model *was* fixing it (correctly filling `reason` in the preferred format) and the parser threw the fix away before validation ever saw it. Two attempts, same failure, both silently reported as "the model can't produce a valid `reason`" when the model had produced one both times.

**Why it read as flaky LLM behavior instead of a deterministic bug:** the retry telemetry (`generation_retry`, `generation_validation_exhausted`) logs issue counts and buckets, not the actual pre-drop parsed payload — so there was no visible signal that `artifact.reason` was `undefined` immediately after parsing, before validation ever ran. A blocked candidate after N attempts looks identical whether the model is genuinely struggling or the harness is discarding a correct answer; only reading the intermediate parsed object (not just the final validation issues) distinguishes them.

**Rule:** when a retry loop "isn't working" — same validation issue survives every attempt — check whether the field in question ever reaches the validator at all before assuming the model can't produce it. Two structurally different parse/normalization branches for the same conceptual payload (here: "preferred" vs "legacy" format) are a standing invitation for one branch to get a field-mapping fix and the other not to; grep every artifact-type-specific special case in one branch for its counterpart in the other rather than assuming shared logic is actually shared.
