# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **Card IS the act, not homework — today's spine.** #556 made reply cards lead with the ready-to-send draft (Approve & Send, no auto-send); #562 stops the pool feeding dead reminders (past-due `attend_participate` events auto-expire from candidacy, overdue actions preserved). Both MERGED to main.
- **#555 baseline (merged):** event-driven Outlook push live; budget phantom cap fixed *durably at the function level* ($2.17/$30, verified in prod); Micro1 eval agent excluded; card-precision meter wired.
- **Verified today, nothing hinges on the owner:** Outlook is connected (mail flowing, no reconnect); brain unblocked. `GRAPH_WEBHOOK_SECRET` is instant-push-only — NOT required for daily cards.
- **The open disease:** "do the work, don't assign it" is fixed only for reply drafts. `write_document`/prep-steps cards (the Nathaniel-birthday 4-step checklist) still hand homework — extend draft-led acts to every artifact type.
- **Next:** live proof on the cleaned pool — real act or honest SAFE_SILENCE. Standing #546: R2–R6 cascade, goal-inference refresh (keystone), Gmail connector (1 vs 967), expert-panel/avatars.

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Learning agentic life-system — proactive, instant, value-cascade.** Foldera lurks/watches/learns the user's *own* world and ships the next real act they'd never have asked for — opportunity-finder, not CBT nag. Walk the cascade until something clears a real bar: **R1 advance what you started** (sent mail, open drafts, in-flight projects) → owed replies → inbound-ask→finished prep → goal moves → relationship → outward Scout (a rung, sign-off-gated). Instant/event-driven, not a daily cron. Never fabricate to fill silence; a due-date nag is NOT an act. See `FOLDERA_MASTER_BIBLE.md` → "Learning Agentic Life-System" (owner thesis 2026-06-24).
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
6. **Card IS the act; pool self-cleans.** The card leads with the ready-to-send draft, not homework scaffolding (#556, `send_message` only so far). Past-due EVENT commitments auto-expire from candidacy at scorer load (#562/#537), overdue actions preserved. Don't reintroduce homework framing or per-row manual suppression.

## Boot

1. Read this file. 2. Read the active issue (#546). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #546 is the active LEARNING-AGENTIC-LIFE-SYSTEM seam.

#546 (value cascade) enumerates rungs R1–R6 + goal-inference + expert-panel; R1 (advance what you've started) is the current slice.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**Card IS the act + pool hygiene (#546 cascade) — both MERGED 2026-06-26.**

- **#556 — the card IS the draft.** `formatDraftLedText` (`lib/workday-presence/message.ts`): reply cards lead with recipient+subject+body inline + Approve & Send (opens the review-gated modal — submit is the send authorization, no auto-send). Homework scaffolding + the View Draft step are gone. Covers `send_message` only so far.
- **#562 — past events auto-expire (#537).** `partitionExpiredEventCommitments` (`lib/briefing/scorer.ts`) drops past-due `attend_participate` commitments at candidate load, every run — structural replacement for manual suppression. Overdue action/payment/follow-up PRESERVED (more urgent, not moot). ~218 prod zombies out of candidacy.
- Verified: typecheck + scorer/message suites green; continuity-gate green; merged branches auto-deleted by the new `delete-merged-branches` Action. Budget durable + Outlook live confirmed in prod (no owner action pending).
- Open: extend "card IS the act" to `write_document`/prep-steps (the birthday-checklist homework) + #546 R2–R6.

## Next exact move

1. **Extend "card IS the act" to every artifact type.** #556 fixed reply drafts only; `write_document`/prep-steps still hand homework (the Nathaniel-birthday 4-step checklist). For a purchase/prep commitment the act = do the legwork (a concrete thing + link), not a plan.
2. **Live proof on the cleaned pool:** next cron → real act (owed reply / advance-started) or honest SAFE_SILENCE; then click → `responded_to_slack_ts` → precision meter (Probe 5), target 10 acted cards. Nothing hinges on the owner (Outlook connected, budget durable); `GRAPH_WEBHOOK_SECRET` = instant-push-only, not required for daily cards.
3. **Standing (#546):** R2–R6 cascade, goal-inference refresh (keystone), expert-panel/avatars + gap analysis, Gmail sent-mail connector fix (1 vs 967).

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
