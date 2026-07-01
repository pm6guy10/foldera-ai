# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **#567 PARADIGM SWAPPED — stored goal inference was the WRONG primitive. Do NOT rebuild it.** A live head-to-head (2026-06-29, PR #584) proved ranking against a STATED stable objective + live evidence beats the stored `tkg_goals` model. **#584 is MERGED + LIVE; `FOLDERA_GOAL_SOURCE=stated` is set in prod.** Confirmed on a live owner run (2026-06-30): `goals_raw 4→2`, outcome flipped `safe_silence → write_document`.
- **#567 follow-on fixes (Phase A+B, INCIDENT #1, budget-segmentation ×2) all MERGED+LIVE on `main` (PRs #585-#588).** Goal-primacy gate closed in `stated` mode; `proactive-delivery.ts` posts heartbeat-seeded winners to Slack with a freshness guard (fixed the 3.5h-stale-card incident, see LESSONS_LEARNED #34); both cron AND push delivery are exempted from the interactive manual-call budget so neither silently starves for the rest of the day.
- **#589 MERGED+LIVE (PR #591, `c873c88`) and #606 MERGED+LIVE (PR #607, `fe3bd70`).** #589: Decision lock card collapsed to one `Source:` line + one paragraph. **#606 — live diagnostic found a plausible real blocker behind #567's silence:** `evaluateCommandCenterCandidateGate`'s `INTERNAL_DEBUG_PATTERN` bare-UUID clause was false-positiving on raw commitment/signal ids `hunt-anomalies.ts` embedded into `evidenceLines`, silently killing real candidates pre-LLM. Fixed (ids dropped from `evidenceLines`). **NOT YET live-verified.**
- **PR #609 (open) — found the ACTUAL bug blocking #606's live-verification.** `parseGeneratedPayload`'s discrepancy-engine parse branch (the format the retry prompt tells the model to prefer) never copied top-level `reason` into `artifact` for `schedule_block` — the owner's stuck 2026-07-05 commitment candidate hit `schedule_block reason is required` on every attempt, retry included, and fell to `safe_silence`. Fixed by sharing the field-copy-down helper across both parse branches (`lib/briefing/generator.ts`). NOT yet merged/live-verified.
- **Deprecation recorded, not executed:** `tkg_goals` still load-bearing (scorer + generator); goal-refresh cron (`lib/cron/goal-refresh.ts`) still writes it. Pool hygiene (commitments overdue 30d+) is a smaller parallel seam.

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Learning agentic life-system — proactive, instant, value-cascade. NOT an inbox/reply bot.** Reply-drafting is R2 (rung 2 of 6, reactive) — do NOT call it "the product". Foldera lurks/watches/learns the user's *own* world and ships the next real act they'd never have asked for — opportunity-finder, not CBT nag. Walk the cascade until something clears a real bar: **R1 advance what you started** (drafts/Drive/in-flight) → R2 owed replies → R3 inbound-ask→finished prep → R4 goal moves → R5 relationship → R6 outward Scout (sign-off-gated). **KEYSTONE (corrected #567) = rank against the STATED objective + live evidence, NOT a stored goal model. The stored `tkg_goals` table rotted → homework; the lever is objective-anchored selection (`FOLDERA_GOAL_SOURCE=stated`), NOT goal-table refresh.** Instant/event-driven, never fabricate to fill silence; a due-date nag is NOT an act. Vision: `FOLDERA_MASTER_BIBLE.md` Part II-A/II-B; owner taste: run `docs/BRANDON.md` §5 before claiming "is it good?".
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.
7. **Reduce friction by default, every session.** Standing owner directive: cut process friction and cruft proactively without re-asking. Hard safety rails still need sign-off. See `AGENTS.md` → "Friction Reduction — Standing Authorization".
8. **Owner truths (2026-06-30) — can't be overlooked.** Owner is **OUTLOOK-primary, not Gmail** (≈130 vs 56 signals/7d) — never say "open Gmail"/default to Gmail (that slip IS the amnesia, live). Identity = **founder/builder**; the health/Medicaid/grant-compliance résumé is the life he's **leaving** — don't mine old commitments for "useful to Brandon", and don't pitch grants/gig-labor/bill-nags as "make me money" (the lever is the PRODUCT/habit, not side income). **Carry ONE conviction move, never a menu** — he's chasing a *feeling*: superhuman continuity, met as a colleague. **AMNESIA is the disease, continuity the missing primitive (issue #592):** product is stateless for the USER while the repo hoards continuity for its agents; the Slack dismissal loop is one-way (1,204 skips, 0 outcomes ever closed; `feedback_weight`/`skip_reason`/`outcome_closed` rails exist, unwired) → ratchet the JUDGMENT not the row.

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

**#567 — paradigm corrected; #606 landed but a SECOND bug (fixed in PR #609) was still blocking live-verification.** Do NOT rebuild stored goal inference. A live manual trigger (2026-07-01 20:40 UTC) proved #606 alone wasn't enough: the owner's one ranked candidate — the same 2026-07-05 commitment #606 was supposed to unstick — still fell to `safe_silence`, this time from a `schedule_block` generation-validation bug (see PR #609 above). Not yet live-verified.

- What shipped (#606): dropped raw commitment/signal ids from `hunt-anomalies.ts`'s `evidenceLines` (two finding kinds) so they stop false-positiving `evaluateCommandCenterCandidateGate`'s `INTERNAL_DEBUG_PATTERN`; the regex itself is untouched. Threaded `suppressionTrace` into `pipeline_runs.raw_extras` for future diagnosability.
- What shipped (#609, open): `parseGeneratedPayload`'s discrepancy-engine branch now copies top-level `reason`/`start`/`duration_minutes`/etc. into `artifact` for every action type (shared `copyKnownArtifactFieldsDown()`), not just `send_message`/`write_document` — `schedule_block` was silently losing `reason` and failing validation every attempt.
- Proof: #606 — 4 regression tests, full suite green. #609 — 1 new regression test, `lib/briefing`+`lib/workday-presence` (1098 tests) green, `gate:continuity` green (post-roll).

## Next exact move

1. **Merge #609, then live-verify #606+#609 together:** trigger the next real pipeline run (or wait for one) and re-query `pipeline_runs.raw_extras` + `workday_presence_suppression_trace` for `2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f` — confirm the two previously-stuck commitment candidates (due 2026-07-05, 2026-07-07) now produce a real card instead of `safe_silence`.
2. **Then #567 owner sign-offs** (tkg_goals re-ground + Gmail connector 1→967) — re-check what's really left before assuming more work is needed.
3. **Then #597:** live dismissal-tap verification, once a real card exists to dismiss. PR #593 (CSS cleanup) still open, low priority, mergeable anytime.
4. **Pool-hygiene (parallel, unchanged):** auto-expire/suppress 88 active commitments overdue 30d+ (generalize #562 past-due expiry) so dead ghosts stop ranking.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
