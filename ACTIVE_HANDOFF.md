# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **NEXT = rebuild goal inference (THE keystone). This is the build.** `tkg_goals` is DEAD: 50–83d stale + garbage n-gram goals ("recurring theme 'has in'"). A dead goal model = the engine can't climb the R1/R4/R6 rungs = it falls to commitment-reminders (the birthday/$346.61 homework you keep seeing). Code already exists — `refreshGoalContext()` in `lib/cron/goal-refresh.ts`, wired into daily-maintenance — but it only decays/updates existing goals; it does NOT re-infer a fresh real goal model from recent activity. That's the seam: make goal inference rebuild from recent real activity so #567's R1 "finish-what-I-started" card finally has something to fire on. NOT gate-tuning, NOT the reply lane.
- **Live proof (2026-06-29):** plumbing all works — Outlook + 201 Drive signals flowing, paid LLM works (it wrote a full draft). When re-scored on live data the engine went SAFE_SILENCE (honest: today's inbox was 15 automated newsletters, zero human mail) and otherwise serves homework because the keystone is dead. The disease is the goal model, not infra/money/Gmail.
- **This session shipped:** #577 boot memory pin · #578 Slack alert on OAuth fatal disconnect · #579 Graph subscription renewal wired into morning-pipeline (root cause of "OneDrive isn't syncing") · #580 dropped Gmail scopes (owner is Outlook-primary, doesn't use Gmail) + made google-sync Gmail-optional · #581 hardcoded PRODUCT TRUTH (cascade+keystone+BRANDON.md) into the unskippable SessionStart hook.
- **Owner-only, non-blocking:** Google OAuth app unverified for sensitive scopes (Drive) — only needed if publishing past Testing mode; pool hygiene (88/135 commitments overdue 30d+) is a smaller parallel seam.

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Learning agentic life-system — proactive, instant, value-cascade. NOT an inbox/reply bot.** Reply-drafting is R2 (rung 2 of 6, reactive) — do NOT call it "the product". Foldera lurks/watches/learns the user's *own* world and ships the next real act they'd never have asked for — opportunity-finder, not CBT nag. Walk the cascade until something clears a real bar: **R1 advance what you started** (drafts/Drive/in-flight) → R2 owed replies → R3 inbound-ask→finished prep → R4 goal moves → R5 relationship → R6 outward Scout (sign-off-gated). **KEYSTONE = goal inference (`tkg_goals`): stale goals → engine can't climb → falls to homework reminders; refresh goals from recent activity is the lever.** Instant/event-driven, never fabricate to fill silence; a due-date nag is NOT an act. Vision: `FOLDERA_MASTER_BIBLE.md` Part II-A/II-B; owner taste: run `docs/BRANDON.md` §5 before claiming "is it good?".
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
8. **Paid LLM is ON in prod and has been for ages.** Dead alternative (do not re-propose): "flip `ALLOW_PROD_PAID_LLM` / do one paid run to test". The spend kill-switches are NOT the blocker — if output is homework, the cause is the dead goal model, not the flag. See memory `project_paid_llm_already_on`.

## Boot

1. Read this file. 2. Read the active issue (#567). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #567 is the active foundation seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**#567 — fire the R1 "finish-what-I-started" card. BLOCKED by the dead keystone (goal inference), and that is the work.** The earlier "parked on owner sign-offs (tkg_goals re-ground + Gmail 1→967)" framing is STALE/WRONG: Gmail is retired (owner is Outlook-primary, #580), and the goal model isn't an owner DB edit — it's a code capability that's broken. R1 can't fire because the goal model is dead, so the scorer falls to homework reminders.

- Why dead: `tkg_goals` last updated 2026-05-10 (50d); real goals frozen 2026-04-07 (83d); half are garbage n-grams. Live-verified 2026-06-29.
- Existing code: `refreshGoalContext()` (`lib/cron/goal-refresh.ts`), wired into `daily-maintenance`, but it only decays/updates existing goals + is gated on `priority>=3` — it does NOT re-infer a fresh goal model from recent real activity. THAT is the gap to build.

## Next exact move

1. **Rebuild goal inference from recent real activity (THE keystone, #567).** Start in `lib/cron/goal-refresh.ts` (`refreshGoalContext`) + `lib/briefing/goal-hygiene.ts`. Make it (re)derive a real, current goal model from the user's recent signals (Outlook + 201 Drive docs), replace the stale/garbage goals, then verify the R1 "finish-what-I-started" card fires via Probe 1 (`docs/LIVE_POOL_PROBE.md`). Prove in harness first; paid LLM is already ON (don't re-suggest enabling it — see memory). This is the whole game: a fresh goal model is what lets the engine climb the cascade instead of serving homework.
2. **Pool-hygiene (smaller parallel seam):** auto-expire/suppress 88 active commitments overdue 30d+ (generalize past-due expiry #562 beyond events) so dead ghosts stop ranking #1.
3. **Google OAuth verification (owner-only, non-blocking):** only needed to publish past Testing mode; Drive `drive.readonly` is the lone restricted scope.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
