# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **Seam #518 (verdict calibration):** PR #536 (`claude/seam-518-verdict-calibration-t30jwq`) pending merge — stale gate 10→250, blocked_gate diagnostic truncation 240→2000, + daily_brief→seed_from_scorer swap in morning-pipeline (email brief killed).
- **Commitment pool hygiene (#537, new issue):** 9 zombie commitments manually suppressed. Structural fix needed: external-promisor staleness gate + marketing-sender extraction filter + fuzzy dedup.
- **Current honest verdict:** SAFE_SILENCE is correct today — after cleanup, no high-quality candidate in the pool. Professional signal has aged out of 14d window.
- **Still owner-only:** confirm Vercel `FOLDERA_SELF_USER_ID` = `2cbc1bab`.

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Always ship one real act — never go dark. Empty is not a product.** When no high-stakes discrepancy clears the bar, degrade gracefully to the best *real* available act (a due commitment teed up, an owed reply drafted, a goal-advancing follow-up), honestly framed by stakes. The one hard line that stays: never *fabricate* stakes or post a fixture as real — lower-stakes-but-true beats invented-urgency, and both beat silence. It must be an ACT, not a list/inbox-summary. `do_nothing` is a rare last resort, not a default. (Owner directive 2026-06-23; see #538.)
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

1. **Merge PR #536** — stale gate 10→250, blocked_gate truncation fix, + morning-pipeline now runs seed_from_scorer (Slack card) instead of daily_brief (email).
2. **Start #537 Fix A** (external-promisor staleness gate in `daily-brief-generate.ts`): kill discrepancy_exposure candidates where the promisor is external + thread signal stale + implied_due passed. Auto-suppresses Columbia Motors pattern structurally.
3. **Live confirmation:** after #536 deploys, check next cron run. Metric to watch: `workday_presence_suppression_trace.trace_type` in `auth.users.user_metadata` for `2cbc1bab` (NOT `pipeline_runs.outcome` — that was the wrong surface).
4. **Owner-env confirm:** Vercel `FOLDERA_SELF_USER_ID` = `2cbc1bab`.
5. Done this session: email daily brief killed from morning-pipeline, 9 zombie suppressions, #526/#528 merged. Standing: Scout #494; OneDrive #507.

Full detail: issue #518 (gate fixes), issue #537 (commitment hygiene).

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
