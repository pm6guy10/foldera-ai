# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **Seam #546 (learning agentic life-system / value cascade):** active on `claude/value-cascade-r1-own-activity`. Thesis locked in `FOLDERA_MASTER_BIBLE.md`. Building **R1 — advance what you've started** (sent mail / drive edits win + force next-move output).
- **#538 tier-descent MERGED** (PR #545, main `6b67edb`). Its Tier-2 now gated against junk/errand commitments (no nag-on-junk).
- **Why R1:** live data — engine ships homework/junk because its only fuel is noreply inbound + a contaminated commitment pool; the real fuel (own `email_sent`/`drive file_modified`, fresh) is ignored & entity-gated out.
- **Next:** event-driven delivery (off the daily cron — nothing lands today); live proof = an own-activity act lands in Slack with a `workday_presence_slack_send` receipt for `2cbc1bab`.

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Learning agentic life-system — proactive, instant, value-cascade.** Foldera lurks/watches/learns the user's *own* world and ships the next real act they'd never have asked for — opportunity-finder, not CBT nag. Walk the cascade until something clears a real bar: **R1 advance what you started** (sent mail, open drafts, in-flight projects) → owed replies → inbound-ask→finished prep → goal moves → relationship → outward Scout (a rung, sign-off-gated). Instant/event-driven, not a daily cron. Never fabricate to fill silence; a due-date nag is NOT an act. See `FOLDERA_MASTER_BIBLE.md` → "Learning Agentic Life-System" (owner thesis 2026-06-24).
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.
7. **Reduce friction by default, every session.** Standing owner directive: cut process friction and cruft proactively without re-asking. Hard safety rails still need sign-off. See `AGENTS.md` → "Friction Reduction — Standing Authorization".

Keep this cockpit short and value-first. Completed-issue history lives in `docs/archive/SESSION_HISTORY.md` + git, never here.

## Boot

1. Read this file. 2. Read the active issue (#546). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #546 is the active LEARNING-AGENTIC-LIFE-SYSTEM seam.

#546 (value cascade) enumerates rungs R1–R6 + goal-inference + expert-panel; R1 (advance what you've started) is the current slice.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**R1 — ADVANCE WHAT YOU'VE STARTED (#546) — in progress.**

Re-aim the daily engine at the user's own recent activity instead of homework/junk:
- Promote own-activity candidates (`email_sent`, `drive file_modified`, fresh ≤7d) to win over observation-shaped discrepancy/pattern candidates; they currently get entity-gated out (no external counterparty) — carve them out of the `no_real_external_entity` drop only.
- Force a real next-move / finished-work artifact for an own-activity winner (`hasFinishedHomeworkHandoffContent` bar) — "here's the next move to finish X you started," not a nag.
- **Shipped this session:** doctrine lock-in (Bible + #546); #538 Tier-2 junk gate (`isLowValueErrandCommitment`, 11 tier-descent tests green).

Key invariants:
- Own-activity carve-out is additive — does NOT weaken the external-entity requirement for any other class.
- No loosening of `positive_winner_contract` / `weak_risk` — R1 ADDS an output bar.
- Inward only; never fabricate to fill silence.

## Next exact move

1. **Land R1 engine** (own-activity promotion + next-move output gate) green on `lib/briefing lib/workday-presence`; open draft PR.
2. **Event-driven delivery:** move evaluate-and-deliver off the daily `morning-pipeline` (`0 11 * * *`) onto the signal-ingest cycle so fresh sent-mail/drive edits produce a Slack card within minutes (nothing lands today; bridge exists but `seed-from-scorer` returns `seeded=false` on dark verdict).
3. **Live proof:** replay a fresh `email_sent`/`file_modified` thread for `2cbc1bab` → directive (not do_nothing) → Slack card → `workday_presence_slack_send` receipt.
4. **Standing (in #546):** R2–R6, goal-inference refresh, expert-panel/avatars, gmail sent-mail connector (1 vs 967), #537 Fix B/C.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
