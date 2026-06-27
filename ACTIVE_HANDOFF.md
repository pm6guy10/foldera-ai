# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **#567 MERGED (PR #568, `c0b7c51`).** Four code moves on main: `pipeline_runs` observability, ghost-goal gate, doctrine (Bible Part VI), anchor regex un-rot. gate:continuity green; 1064 vitest pass.
- **LP hero decision state machine MERGED (PR #569, `a937c1e`).** Hero now leads with the live Right Now decision card cycling active→changed→stale→conflict. Constellation moved to #product centerpiece. Live on www.foldera.ai.
- **Waiting on owner sign-off to close #567:** `tkg_goals` DB edit (re-ground apex goal) + Gmail connector fix (1→967). No code work remains.
- **After sign-offs:** owner triggers `/api/cron/ingest-and-deliver` → run Probe 1 → expect R1 finished-asset card + traceable `pipeline_runs` row, no ghost-goal drift.

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

Issue #567 is the active foundation seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**#567 — PR #568 MERGED (`c0b7c51`). Code complete; waiting on owner sign-offs.**

- All four code moves are on main and green.
- Issue #567 remains OPEN pending two owner actions (no Claude code work left).

**Waiting on owner sign-off:**
- `tkg_goals` DB edit: re-ground / re-prioritize the apex goal from real own-activity (so it produces a real finished act, not a make_decision drift card)
- Gmail connector fix: `1 → 967` ingested sent emails (Rung 1 fuel that feeds own-activity candidate promotion)

## Next exact move

1. **Owner sign-off:** `tkg_goals` DB edit + Gmail connector config → then trigger `/api/cron/ingest-and-deliver`
2. **Expected result:** R1 card = a finished asset the user started (not a reminder, not silence); ghost-goal drift gone from `pipeline_runs` trace
3. **Verify via Probe 1** (`docs/LIVE_POOL_PROBE.md`) after trigger — `pipeline_runs` shows a traceable row; no `blocked_gate = ghost_goal_drift`

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
