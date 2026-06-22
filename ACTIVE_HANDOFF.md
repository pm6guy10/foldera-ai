# ACTIVE HANDOFF - FOLDERA

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Safe silence beats a fake card.** Never manufacture a verdict; quiet on weak evidence. The Scout obeys this too: no opportunity worth surfacing → stay quiet.
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** It proposes finished, review-gated artifacts. The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world (the thread they're about to drop, the reply owed, the deadline in their files) and reduce load. Do **not** fish the open web for external "opportunities" — that is tone-deaf. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.

Keep this cockpit short and value-first. Completed-issue history lives in `SESSION_HISTORY.md` + git, never here.

## Boot

1. Read this file. 2. Read the active issue (#516). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #516 is the active VALUE-DELIVERY seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**VALUE DELIVERY (#516) — the daily verdict has been DARK since March 16.** `pipeline_runs` (owner `2cbc1bab`, 45d) showed **77** `generation_failed_sentinel` days: the engine found **~45 real candidates/run**, ranked them, picked a winner, then the `positive_winner_contract` gate **blocked the winner 96% of the time** (`error_class` null — mis-calibration, not a crash). Root cause: **hunt findings dropped their source date** — `huntFindingToScoredLoop` built `sourceSignals` with no `occurredAt` and `HuntFinding` had no date field, so `newestSourceDate()==null` and the currentness/anchor gates (`missing_current_artifact_anchor`, `stale_status_without_current_artifact_facts`) executed every hunt winner (the calendar-gap / unanswered-email / repeat-sender cards). Fix **grounds, doesn't loosen** (per `docs/CONTEXT.md`): carry the real newest-signal date through `HuntFinding.newestSignalAt` → `sourceSignals[].occurredAt`. Fresh anomalies ship; genuinely stale (>14d) ones still caught by `stale_evidence_over_14d`.

**Already done:** Drive deep backfill (#514, PR #515); identity seam fully landed — link-guard (PR #512), Google-sole-sign-in + Microsoft-as-source (PR #513), account consolidation EXECUTED `e40b7cd8` → `2cbc1bab` (#509).

**Predecessors merged:** #514 (PR #515), #511 (PRs #512/#513), #507 (PR #508), LANDING #500 (PR #501).

## Next exact move

1. Land #516 (this PR): `HuntFinding.newestSignalAt` + populate it; propagate `occurredAt` in `huntFindingToScoredLoop`; new `hunt-grounding-516` test; update the one pipeline-receipt block-reason assertion.
2. Proof: `npm run gate:continuity && npm run typecheck && npx vitest run lib/briefing/__tests__/`.
3. Open PR on `claude/verdict-grounding-516` targeting #516.
4. Owner: after merge, trigger the morning pipeline (or wait for the 11:00 cron) and confirm `pipeline_runs` flips to `generation_returned` + a real briefing appears. Then review the remaining gates (calendar-gap, goal-drift) for over-strictness; Scout #494.

Full detail: issue #516.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
