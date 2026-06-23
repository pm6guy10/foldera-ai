# ACTIVE HANDOFF - FOLDERA

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Safe silence beats a fake card.** Never manufacture a verdict; quiet on weak evidence. The Scout obeys this too: no opportunity worth surfacing → stay quiet.
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** It proposes finished, review-gated artifacts. The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world (the thread they're about to drop, the reply owed, the deadline in their files) and reduce load. Do **not** fish the open web for external "opportunities" — that is tone-deaf. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.
7. **Reduce friction by default, every session.** Standing owner directive: cut process friction and cruft proactively without re-asking; never lock things down. Hard safety rails still need sign-off. See `AGENTS.md` → "Friction Reduction — Standing Authorization".

Keep this cockpit short and value-first. Completed-issue history lives in `SESSION_HISTORY.md` + git, never here.

## Boot

1. Read this file. 2. Read the active issue (#518). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #518 is the active VERDICT-CALIBRATION seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**VERDICT CALIBRATION (#518) — verify the dark-verdict fix live, then calibrate what's left.** #516 (PR #517) fixed the dominant cause: hunt findings dropped their source date (`huntFindingToScoredLoop` set no `occurredAt`; `HuntFinding` had no date field), so `positive_winner_contract` blocked ~96% of winners. That fix is **deployed + unit-proven** (`hunt-grounding-516`). **Live verification is incomplete:** the manual "Auto-detect" path is capped at 3 directive calls/UTC-day and today's 11:41 cron blew the cap, so taps short-circuited before scoring. The brain still hasn't run post-fix on real owner data (`directive_calls_today=0`, last api 11:40).

**Prod mutations made this session (disclosed, owner-directed):** deleted today's 8 `directive`/`directive_retry` `api_usage` rows for `2cbc1bab` (lift the cap); removed the leftover `pipe_test` `workday_presence_state` + `workday_presence_suppression_trace` keys.

**Already done this session:** #509 consolidation EXECUTED (`e40b7cd8` → `2cbc1bab`); identity #511 (link-guard PR #512, Google-sole-sign-in PR #513); Drive depth #514 (PR #515); dark-verdict grounding #516 (PR #517).

## Next exact move

1. **Verify live (no taps):** after the 11:00 UTC `morning-pipeline` cron (not manual-limited), read `pipeline_runs` for `2cbc1bab` — expect `generation_returned` (was `generation_failed_sentinel`) and a real verdict card.
2. **If still SAFE_SILENCE:** calibrate the remaining gates with test/replay proof, NO blind loosening (per `docs/CONTEXT.md`): `missing_schedule_resolution_context` (too literal), goal-drift `missing_current_artifact_anchor`, and the downstream `discrepancy-card-frame.ts` `weak_risk; reminder_without_risk` gate (`docs/WINNER_TRACE_ROOT_CAUSE.md`).
3. **Operational:** raise/segment the manual directive cap (`MAX_MANUAL_DIRECTIVE_CALLS_PER_DAY`, `lib/utils/api-tracker.ts`) so the dashboard can self-test.
4. **Owner:** set Vercel `OWNER_USER_ID`/`FOLDERA_SELF_USER_ID` → `2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f`. Standing: Scout #494; OneDrive whole-drive enumeration (#507).

Full detail: issue #518.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
