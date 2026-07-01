# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **#592 — the dismissal ratchet is built.** Diagnosis: the product is amnesiac for the USER (continuity is the missing primitive), and the verified receipt on #592 proved the dismissal loop was one-way — 1,204 skipped `tkg_actions` rows, 93% with no `feedback_weight`, 0% ever `outcome_closed`. This PR wires the existing-but-unwired rails: a one-tap Slack overflow (not-now/never/wrong-framing/already-done) always populates `skip_reason` + `feedback_weight`, and a new scorer judgment-suppression pass demotes (never hard-drops) future candidates sharing the dismissed mechanism/topic, decaying per reason. No migration — rides `execution_result` JSONB. 1416 tests green.
- **PR #591 (#589 card-brevity fix) still open/draft on a separate branch**, awaiting owner merge — untouched by this seam.
- **#567 paradigm swap stays foundational and MERGED+LIVE:** rank against the STATED objective + live evidence, not a stored/inferred goal model (`FOLDERA_GOAL_SOURCE=stated`). Do not re-propose rebuilding goal inference — see SETTLED #9.
- **Next:** owner live-verifies a real Slack dismissal-with-reason tap in `#foldera-self-loop` (row updates, later similar card visibly demoted in scorer diagnostics), then decide the `outcome_closed` follow-up as its own scoped seam.

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Learning agentic life-system — proactive, instant, value-cascade. NOT an inbox/reply bot.** Reply-drafting is R2 (rung 2 of 6, reactive) — do NOT call it "the product". Foldera lurks/watches/learns the user's *own* world and ships the next real act they'd never have asked for — opportunity-finder, not CBT nag. Walk the cascade until something clears a real bar: **R1 advance what you started** (drafts/Drive/in-flight) → R2 owed replies → R3 inbound-ask→finished prep → R4 goal moves → R5 relationship → R6 outward Scout (sign-off-gated). **KEYSTONE (corrected #567) = rank against the STATED objective + live evidence, NOT a stored goal model. The stored `tkg_goals` table rotted → homework; the lever is objective-anchored selection (`FOLDERA_GOAL_SOURCE=stated`), NOT goal-table refresh.** Instant/event-driven, never fabricate to fill silence; a due-date nag is NOT an act. Vision: `FOLDERA_MASTER_BIBLE.md` Part II-A/II-B; owner taste: run `docs/BRANDON.md` §5 before claiming "is it good?".
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.
7. **Reduce friction by default, every session.** Standing owner directive: cut process friction and cruft proactively without re-asking. Hard safety rails still need sign-off. See `AGENTS.md` → "Friction Reduction — Standing Authorization".

Keep this cockpit short and value-first. Completed-issue history lives in `docs/archive/SESSION_HISTORY.md` + git, never here.

## SETTLED — do not relitigate

These are decided. Do not re-derive, re-probe, or re-propose the dead alternative.

1. **Delivery is push/event-driven, not a scheduled cron.** Provider push (Microsoft Graph change-notifications → `/api/webhooks/graph`; Gmail watch is phase 2) fires the card the instant data changes — the change is the clock. `deliverWorkdayPresence` (`lib/workday-presence/deliver-now.ts`) is the single seed→trigger pipeline ALL callers use. The `vercel.json` crons are a Hobby-throttled fallback heartbeat + subscription-renewer only; never "wait for the cron". Old `daily-brief-generate` RETIRED (#548). **Push architecture MERGED #555.**
2. **Owner = `2cbc1bab`.** `FOLDERA_SELF_USER_ID` is canonical owner resolution everywhere; `INGEST_USER_ID` is legacy fallback only (fixed in #553). Old account `e40b7cd8` is empty post-#509.
3. **`SAFE_SILENCE` is a valid SUCCESS.** Never loosen a gate to force a card.
4. **Live-pool schema + probes live in `docs/LIVE_POOL_PROBE.md`.** Don't re-derive columns or re-pull the pool to "see what the brain has" — it's already canned.
5. **Budget phantom cap fixed (#555).** `api_budget_check_and_reserve` reconciles to real `api_usage` ledger on every call (durable, not a one-time reset). Micro1 eval agent (`398a8c82` / `zz933@expert.micro1.ai`) permanently excluded via `isExcludedPipelineUser`.
6. **Card IS the act; pool self-cleans.** The card leads with the ready-to-send draft, not homework scaffolding (#556 `send_message`, #564 `write_document` acquisition). Past-due EVENT commitments auto-expire from candidacy at scorer load (#562/#537), overdue actions preserved. Don't reintroduce homework framing or per-row manual suppression.
7. **The product is the PROACTIVE cascade. Email/owed-reply drafting is R2 — NOT "the product".** Dead alternative (do not re-propose): "Foldera = an inbox/reply bot" or "the only non-homework lane is drafting replies to humans". The product is R1→R6 (finish-what-you-started → … → Scout); reply-drafting is rung 2 of 6. Brandon called this relitigation out 2026-06-29.
8. **Paid LLM is ON in prod and has been for ages.** Dead alternative (do not re-propose): "flip `ALLOW_PROD_PAID_LLM` / do one paid run to test". The spend kill-switches are NOT the blocker — if output is homework, the cause is the goal anchor, not the flag. See memory `project_paid_llm_already_on`.
9. **Goal anchor = STATED objective + live evidence, NOT a stored/inferred goal model.** Dead alternative (do not re-propose): "rebuild goal inference / re-infer `tkg_goals` from recent activity / refresh the goal table is the keystone". Proven wrong by a live head-to-head 2026-06-29 (PR #584): the stored model rotted to job-hunting + n-gram garbage and lost to objective-anchored ranking on the same pool. The mechanism is shipped behind `FOLDERA_GOAL_SOURCE=stated` (`lib/briefing/scorer-goal-source.ts`). Deprecating `tkg_goals` outright is a later scoped seam (it is load-bearing); do NOT re-propose reviving goal-inference as the build.

## Boot

1. Read this file. 2. Read the active issue (#592). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #592 is the active continuity-ratchet seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**#592 — the dismissal ratchet.** The product had no memory of the user's dismissal judgments: `skip_reason` populated 28% of the time, `feedback_weight` 7%, `outcome_closed` never. Built the wired version of those existing rails:

- **Capture:** `lib/slack/right-now.ts` adds a one-tap `overflow` menu (not_now/never/wrong_framing/already_done) alongside the existing Dismiss button; `app/api/slack/interaction/route.ts` routes it through new `lib/workday-presence/dismiss-with-reason.ts` → the existing `executeAction` skip path (`lib/conviction/execute-action.ts` gained one optional `extraExecutionResultPatch` field). Legacy plain-`dismiss` taps on already-posted messages are untouched.
- **Judgment key:** `lib/briefing/generator.ts` stamps a stable `mechanismClass` + `topicKey` on every new directive at generation time (persisted into `execution_result.inspection`, no migration).
- **Suppression:** `lib/briefing/scorer-failure-suppression.ts` gained a judgment-suppression pipeline (`collectActiveJudgmentSuppressionEntries`, per-reason decay 3d→90d); `lib/briefing/scorer.ts` applies it as a score **multiplier** (never a hard filter) so a March dismissal demotes, never deletes, July's recurrence. Legible via a new `judgmentSuppressionApplied` field on `ScorerDiagnostics`.

## Next exact move

1. **Live owner verification (#592).** Trigger a heartbeat, tap each of the 4 dismissal-reason options on a real `#foldera-self-loop` card, confirm the `tkg_actions` row gets `skip_reason`/`feedback_weight`/`execution_result.dismissal`, and that a later similar candidate shows up demoted (not missing) in scorer diagnostics.
2. **Scoped follow-up, not this PR:** `outcome_closed` is still never set — deciding whether/how to close that loop is a separate seam once the reason-capture side is proven live.
3. **Unrelated, parallel:** PR #591 (#589 card-brevity) still needs an owner merge decision on its own branch.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
