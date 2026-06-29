# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **#572 MERGED (PR #574, `45c8465`):** duplicate `commitment_lapsing` Slack card fixed (per-commitment 20h cooldown; the dedup key embedded `state.updated_at`, which the ping rewrites).
- **Active seam #573 — retire the due-date homework-nag delivery (PR pending).** Doctrine: "a due-date nag is NOT an act." `commitment_lapsing` live delivery is now retired by default (`ALLOW_COMMITMENT_LAPSING_SLACK_PING` re-enables) + `findLapsingCommitmentSignal` gains a 30-day staleness floor so year-old items can't surface. Killed 3 stale Rule 59(e) rows (>1y overdue) per owner. Fail-safe.
- **Stale-pool finding:** 88/135 active dated commitments are overdue 30d+ (20 are 180d+) — recommend a pool-hygiene seam (auto-expire non-event commitments). #567 parked (owner sign-offs).

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
6. **Card IS the act; pool self-cleans.** The card leads with the ready-to-send draft, not homework scaffolding (#556 `send_message`, #564 `write_document` acquisition). Past-due EVENT commitments auto-expire from candidacy at scorer load (#562/#537), overdue actions preserved. Don't reintroduce homework framing or per-row manual suppression.

## Boot

1. Read this file. 2. Read the active issue (#567). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #573 is the active retire-lapsing-nag seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**#573 — retire the `commitment_lapsing` due-date homework-nag. Branch `fix/retire-lapsing-nag-573` (PR pending). #572 already MERGED (PR #574).**

- Doctrine: "a due-date nag is NOT an act"; "the card IS the act, not homework scaffolding." The lapsing card is the nag.
- Change: live lapsing delivery retired by default (`runWorkdayPresenceTriggerRunner` stays quiet for `commitment_lapsing` unless `ALLOW_COMMITMENT_LAPSING_SLACK_PING=true`) + `findLapsingCommitmentSignal` 30-day staleness floor (year-old items can't surface) + soonest-first ordering.
- Owner-directed kill: suppressed 3 stale Rule 59(e) rows (>1y overdue, 2025 due dates) in prod.
- Finding: 88/135 active dated commitments overdue 30d+ — broader pool hygiene is a follow-up seam.

## Next exact move

1. **Merge #573** (retire lapsing nag + staleness floor) — gate:continuity + vitest (163) green; stops the homework-nag delivery.
2. **Pool-hygiene seam:** 88 active commitments overdue 30d+ pollute the pool — auto-expire non-event commitments (generalize #562 beyond events), or a one-pass suppression with owner review.
3. **#567 (owner sign-off):** `tkg_goals` re-ground + Gmail connector (1→967) → trigger `/api/cron/ingest-and-deliver`, verify R1 card via Probe 1.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
