# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **#553 + #554 MERGED (main `8987acc`):** brain fix live (`FOLDERA_SELF_USER_ID` canonical, dark since Jun 23 fixed) + boot context contradiction-free (SETTLED anchor, dead cron framing gone).
- **Delivery is event-driven** (NOT a scheduled daily brief): signal ingestion → seed-from-scorer → trigger-runner → Slack card. The `vercel.json` crons are only the Hobby-throttled trigger.
- **Next move:** live proof, now *measured* — precision meter (`card-precision.ts`) links fired→acted; target 10 acted cards on `2cbc1bab`. Real card or named `suppression_trace`; `SAFE_SILENCE` still success.
- **Standing (#546):** R2–R6 cascade, goal-inference refresh (keystone), expert-panel/avatars, Gmail sent-mail connector (1 vs 967), commitment pool hygiene (Fix B/C).

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

1. **Delivery is event-driven, not a scheduled cron/daily brief.** `vercel.json` crons (`morning-pipeline`, `ingest-and-deliver`) are ONLY the Hobby-throttled trigger — never present "wait for the 11:00 cron" as the product. The old `daily-brief-generate` flow is RETIRED (replaced by these two, #548).
2. **Owner = `2cbc1bab`.** `FOLDERA_SELF_USER_ID` is canonical owner resolution everywhere; `INGEST_USER_ID` is legacy fallback only (fixed in #553). Old account `e40b7cd8` is empty post-#509.
3. **`SAFE_SILENCE` is a valid SUCCESS.** Never loosen a gate to force a card.
4. **Live-pool schema + probes live in `docs/LIVE_POOL_PROBE.md`.** Don't re-derive columns or re-pull the pool to "see what the brain has" — it's already canned.

## Boot

1. Read this file. 2. Read the active issue (#546). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #546 is the active LEARNING-AGENTIC-LIFE-SYSTEM seam.

#546 (value cascade) enumerates rungs R1–R6 + goal-inference + expert-panel; R1 (advance what you've started) is the current slice.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**R1 — ADVANCE WHAT YOU'VE STARTED (#546) — MERGED (PR #547, `3714b62`).**

Shipped:
- Own-activity carve-out: `email_sent`/`drive file_modified` (≤7d) re-admitted past `no_entity_detected` gate only — all other entity-gate conditions unchanged.
- `selectRankedCandidates` promotes own-activity winner over observation-shaped discrepancies; `protectOwnActivity` carve-out in `topDiscrepancy` block prevents re-burial.
- `own_activity_unfinished` issue + repair steer forces finished/next-move artifact shape when own-activity wins.
- Tier-2 junk gate (`isLowValueErrandCommitment`): errands/personal tasks can't ship as never-go-dark act.
- 1031/1031 vitest green; typecheck clean; gate:continuity green.

Key invariants (still hold):
- Own-activity carve-out is additive — does NOT weaken the external-entity requirement for any other class.
- No loosening of `positive_winner_contract` / `weak_risk` — R1 ADDS an output bar.
- Inward only; never fabricate to fill silence.

## Next exact move

1. **Live proof — now measured:** event-driven path end-to-end (fresh `email_sent`/`file_modified` → `seed-from-scorer` resolves `2cbc1bab` → `trigger-runner` → Slack card → `workday_presence_slack_send` receipt), then click → `responded_to_slack_ts` linked → precision meter (Probe 5) reflects it. Target: 10 acted cards. A named `suppression_trace` is honest silence, not failure.
2. **Standing (in #546):** R2–R6 cascade, goal-inference refresh (keystone — everything depends on a continuously-refreshed model of what you care about), expert-panel/avatars + gap analysis, Gmail sent-mail connector fix (1 vs 967), #537 Fix B/C.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
