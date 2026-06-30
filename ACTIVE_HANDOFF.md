# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **#567 PARADIGM SWAPPED — stored goal inference was the WRONG primitive. Do NOT rebuild it.** A live head-to-head (2026-06-29, PR #584) proved ranking against a STATED stable objective + live evidence beats the stored `tkg_goals` model. **#584 is MERGED + LIVE; `FOLDERA_GOAL_SOURCE=stated` is set in prod.** Confirmed on a live owner run (2026-06-30): `goals_raw 4→2`, outcome flipped `safe_silence → write_document`.
- **Phase A + Phase B MERGED + LIVE (PR #585).** A: `discrepancyBypassesGoalPrimacy` in `lib/briefing/scorer.ts` closes the goal-primacy gate's blanket `type === 'discrepancy'` exemption in `stated` mode — personal/admin discrepancies now need an objective match or drop to SAFE_SILENCE. B: `lib/workday-presence/proactive-delivery.ts` posts a heartbeat-seeded, draft-backed scored_winner to Slack via the SAME `buildRightNowMessagePayload`→`buildSlackRightNowMessage`→`postMessage` pipeline the manual "Post to Slack" button uses (#394-gated, content-deduped); `morning-pipeline` reordered so `nightly_ops` runs LAST instead of starving the scorer.
- **INCIDENT #1 (2026-06-30, fixed + MERGED, PR #586) — proactive-delivery's first live run posted a STALE pre-fix homework card.** `seedFromScorerForUser` only overwrites `workday_presence_state` on a SUCCESSFUL seed; a blocked seed left `workday_presence_state` stuck at a 3.5h-old pre-Phase-A winner, and proactive-delivery (first run, no dedup history) posted it to the real `#foldera-self-loop` channel as fresh. **Fix (MERGED):** `evaluateProactiveDelivery` requires `state.updated_at` within `STATE_FRESHNESS_WINDOW_MS` (10 min) of `nowIso`. See LESSONS_LEARNED #34.
- **STRUCTURAL FIX (PR in flight) — the daily manual-call-limit (3/day) was capping the SCHEDULED cron, not just interactive testing.** `isOverManualCallLimit` (`lib/utils/api-tracker.ts`) was designed to exclude cron-context calls via `pipeline_run_id IS NOT NULL`, but that segmentation (`runWithPipelineRunContext`) was only ever wired into the retired `daily-brief-generate.ts` path — `seed-from-scorer-core.ts`, which now IS the delivery path, never got it. Result: the two scheduled heartbeat ticks (`morning-pipeline`, `ingest-and-deliver`) shared the same 3-call/day budget as any manual testing, and today's testing burst (3 concurrent triggers + retries = 6 calls in 20s) blew through it, silently blocking every subsequent cron tick for the rest of the day with `blocker_reason: "Manual directive call limit reached for today."` and `scorer_diagnostics: null` (scorer never even ran). **Fix:** new `isCronAuthenticated(request)` (`lib/auth/resolve-user.ts`) + `seedFromScorerForUser(..., { isCronTriggered })` wraps the `generateDirective` call in `runWithPipelineRunContext` when the call is CRON_SECRET-authenticated — exempts `morning-pipeline`'s seed stage + `ingest-and-deliver` from the interactive budget; `sync-now` (owner click) and the dashboard correctly KEEP counting against it, by design. NEXT = merge this PR, then trigger the cron once — should succeed even with today's interactive budget already spent, proving Phase A+B end to end same-day (owner separately confirmed canvas is the accepted doc-attachment shape via a manual Slack test).
- **Deprecation recorded, not executed:** `tkg_goals` still load-bearing (scorer + generator); goal-refresh cron (`lib/cron/goal-refresh.ts`) still writes it. Pool hygiene (commitments overdue 30d+) is a smaller parallel seam.

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

1. Read this file. 2. Read the active issue (#567). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #567 is the active foundation seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**#567 — paradigm corrected. The goal anchor was the wrong primitive; the fix is shipped behind a flag.** Do NOT rebuild stored goal inference. A live head-to-head (2026-06-29, PR #584) proved objective-anchored ranking beats the stored `tkg_goals` model on the same pool. The R1 "finish-what-I-started" framing survives; what dies is the inferred/stored-goal *mechanism*.

- What shipped: `lib/briefing/stable-objective.ts` (the stated objective), `lib/briefing/scorer-goal-source.ts` (flag-gated source), wired into `scoreOpenLoops` (`lib/briefing/scorer.ts`) at the single goal-load chokepoint. `lib/experimental/state-move.ts` + `scripts/experiment-state-move.ts` are the reproducible harness.
- Why the swap works through existing machinery: the stated-objective rows carry terms (supabase, billing, revenue, paying, onboard, launch) so the existing keyword `matchGoal` + goal-primacy gate promote objective-relevant candidates and drop personal homework — no scorer-logic rewrite.

## Next exact move

1. **Live smoke run, then flip the flag (#567).** With prod Supabase + `ANTHROPIC_API_KEY` + `ALLOW_PAID_LLM`, run `npx tsx scripts/experiment-state-move.ts` to confirm the side-by-side live, then set `FOLDERA_GOAL_SOURCE=stated` (Vercel env) for the owner and watch one `pipeline_runs` cycle for a regression. Instant rollback = unset the env var. (Not done from the credential-less container — must run where prod creds exist.)
2. **Then (later scoped seam): deprecate the goal-refresh cron.** Once `stated` is confirmed live, stop `refreshGoalContext`/`inferGoalsFromBehavior` writing garbage to `tkg_goals` (`lib/cron/goal-refresh.ts`), and migrate the generator's goal-context reads (`lib/briefing/generator.ts`) to the same source. `tkg_goals` is load-bearing — stage it, don't yank it.
3. **Pool-hygiene (parallel):** auto-expire/suppress 88 active commitments overdue 30d+ (generalize #562 past-due expiry) so dead ghosts stop ranking.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
