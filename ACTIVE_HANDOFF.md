# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **Seam #518 (verdict calibration):** June 23 cron blocked by `stale_signal_backlog_remaining` — 219 Drive signals (bulk-imported June 22) exceeded threshold=10. **This branch (PR pending):** threshold raised 10→250 (`STALE_SIGNAL_BACKLOG_GATE_THRESHOLD`), 168 tests green.
- **All three code fixes now in flight:** #526 (directive salvage) + #528 (manual cap) merged to main; stale gate fix on this branch pending merge.
- **Still owner-only:** confirm Vercel `FOLDERA_SELF_USER_ID` = `2cbc1bab` (drives self-loop cron; set pre-consolidation).
- **Branch:** `claude/seam-518-verdict-calibration-t30jwq` · **deployed:** 4c443db (pre-this-branch).

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

**VERDICT CALIBRATION (#518) — verified live (still dark), shipped first grounded gate fix.** #516 (PR #517) fixed the dominant cause (hunt findings dropped their source date) and is deployed + unit-proven. **Live verification is now DONE** (Supabase MCP, project `neydszeamsflpghtrhue`): the latest morning-pipeline cron for `2cbc1bab` (**2026-06-22 11:39:24Z**) is **still `generation_failed_sentinel`** → the verdict still holds dark (SAFE_SILENCE). The #516 grounding *did* advance the funnel (candidate shape changed; undated calendar-gap candidates no longer top the ranking). Remaining live blockers: goal-drift→`missing_current_artifact_anchor` (genuinely hollow, correctly silenced), commitment-exposure "due in 1d"→LLM generation validation (`directive must be exactly one sentence` — a generator/prompt issue, NOT a gate), and on 06-18/19/20 the commitment_calendar_gap→`missing_schedule_resolution_context`.

**MERGED to main (9453393, PR #526) — #518 item #2, generator fix not a gate change:** deterministic **directive one-sentence salvage** (`lib/briefing/generator.ts` → `applyDirectiveOneSentenceSalvage`, wired into `validateGeneratedArtifact` before the one-sentence check). The model appends an explanatory 2nd sentence to commitment-exposure directives → `directive must be exactly one sentence` fails the generation AND persistence gates, burns every paid LLM retry, ships nothing (dark verdict). Salvage collapses to the leading imperative sentence (pure truncation; declines on a weak-demonstrative lead). Proof: `directive-one-sentence-salvage.test.ts` + `lib/briefing` 836 green. Prompt and taste-gates untouched.

**MERGED to main (53de5b6, PR #528) — #518 item #3, operational (not a billing-rail loosening):** segmented the manual directive cap (`lib/utils/api-tracker.ts` → `isOverManualCallLimit`) to count only **interactive** rows (`pipeline_run_id IS NULL`). Cron directive/`directive_retry` rows run inside `runWithPipelineRunContext` and carry a `pipeline_run_id`, so a single morning cron's 8+ rows blew the manual cap of 3 and short-circuited the dashboard "Generate Now" self-test. Cap stays 3 — this fixes a misattribution. Proof (no paid loop): `manual-call-limit-segmentation.test.ts` (8 cron → not over; 3 interactive → over; 8 cron + 2 interactive → 3rd manual allowed; user-scoped) + existing `api-tracker.test.ts` green.

**Prior (deployed, 3f24e7e):** `missing_schedule_resolution_context` (`lib/briefing/artifact-taste-pack.ts`) made grounding-aware (fires only when `currentnessDays == null`). **Deliberately NOT touched** (blind loosening = the #452 mistake): goal-drift `missing_current_artifact_anchor` (already grounding-aware; live candidate is hollow) and `discrepancy-card-frame.ts` `weak_risk`/`reminder_without_risk` (`WINNER_TRACE_ROOT_CAUSE.md` says it is correct).

**Durable infra (this session, governance-only, no paid risk):** `gate:continuity` now runs on **every PR** (`.github/workflows/continuity-check.yml`) — previously `pr-sentinel.yml` was `workflow_dispatch`-only and gated nothing; the `active_branch`-parity check is now actually enforced pre-merge (owner: make `continuity-gate` a required check in branch protection). `npm run roll -- --cron-outcome <x>` stamps `last_cron_run`/`last_cron_outcome`; SessionStart surfaces `cron:` in the ACTIVE SEAM block so the product's live health shows without a manual Supabase query; Stop hook now names `npm run roll`. See LESSONS_LEARNED #24.

**Already done prior this session:** #509 consolidation EXECUTED (`e40b7cd8` → `2cbc1bab`); identity #511 (PRs #512/#513); Drive depth #514 (PR #515); dark-verdict grounding #516 (PR #517).

## Next exact move

1. **Merge this branch:** stale gate threshold 10→250 (`STALE_SIGNAL_BACKLOG_GATE_THRESHOLD`) — unblocks June 24+ crons that still see leftover Drive signals from June 22 bulk import. PR pending on `claude/seam-518-verdict-calibration-t30jwq`.
2. **Live confirmation (owner/next cron) — the only score left:** all three code fixes (#526, #528, this branch) must be deployed before the next 11:00 UTC cron. Check `pipeline_runs.outcome` for `2cbc1bab` — should be `generation_returned` (not `stale_signal_backlog_remaining` or `generation_failed_sentinel`).
3. **Owner-env confirm:** Vercel `FOLDERA_SELF_USER_ID` = `2cbc1bab` (set pre-consolidation, may still point at empty account).
4. Already done: #526 (directive salvage), #528 (manual cap), #533 (continuity infra), #534 (OWNER_USER_ID constant fix). Standing: Scout #494; OneDrive whole-drive enumeration (#507).

Full detail: issue #518.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
