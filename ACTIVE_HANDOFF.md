# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **Seam #540 (gate-stack output re-aim):** PR #541 open (draft). Option C: Move A rejects observation/homework shape; Move B promotes concrete incoming work; Move C persists Slack receipt. 998/998 tests green. Awaiting owner merge + live proof.
- **Root cause:** 17 days dark (last real act 2026-04-22). Layer 1: lifecycle gate kills ~67/68 candidates. Layer 2: survivors are observation-shaped not finished-work. April-22 ESB interview prep is the north-star act.
- **Always degrade — never go dark (owner, 2026-06-24).** If cron stays dark post-deploy: widen `INCOMING_ASK_RE` in `decision-enforcement.ts`. Never touch the observation gate or numeric thresholds.
- **Live proof is the only done.** After PR #541 merges: `pipeline_runs.outcome` for `2cbc1bab` must move off `generation_failed_sentinel`; directive = finished-work shape; `workday_presence_slack_send` receipt in `tkg_actions`.
- **Standing:** #537 Fix B/C queued (PR #539 = Fix A, merged); Scout #494; OneDrive #507.

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Always ship one real act — never go dark. Empty is not a product.** When no high-stakes discrepancy clears the bar, degrade to the next thing Foldera can **do and hand over done** — a drafted reply, completed prep, teed-up response. A due-date reminder ("your bill is due") is NOT a real act — it is a nag. Never fabricate stakes or post a fixture as real. `do_nothing` is a rare last resort. (Owner directive 2026-06-23/24; see #538.)
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.
7. **Reduce friction by default, every session.** Standing owner directive: cut process friction and cruft proactively without re-asking. Hard safety rails still need sign-off. See `AGENTS.md` → "Friction Reduction — Standing Authorization".

Keep this cockpit short and value-first. Completed-issue history lives in `docs/archive/SESSION_HISTORY.md` + git, never here.

## Boot

1. Read this file. 2. Read the active issue (#540). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #540 is the active GATE-STACK-OUTPUT seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**GATE-STACK OUTPUT RE-AIM (#540) — Option C, all three moves code+unit-proven.** Move A: `findObservationShapeReason` + `OBSERVATION_SHAPE_PATTERNS` gate in `validateGeneratedArtifact` (directive-only scope to avoid catching consequence-framed why_now); chore-list gate generalized to all types. Move B: `isConcreteIncomingWorkCandidate` in `decision-enforcement.ts` + wired into `classifyLifecycle` in `scorer.ts`. Move C: `insertSlackSendReceipt` in `lib/workday-presence/slack-send-receipt.ts` wired into `trigger-runner.ts`. 28 new tests + 998/998 total. Build + tsc clean. PR pending.

## Next exact move

1. **Merge PR #541** (`claude/gate-stack-output-issue-bpglwy`) — draft, awaiting owner review.
2. **Live confirmation post-deploy:** check morning-pipeline cron for `2cbc1bab` — `pipeline_runs.outcome` should move off `generation_failed_sentinel`; directive must be finished-work shape; `workday_presence_slack_send` receipt should appear in `tkg_actions`.
3. **If still dark:** Move B's `INCOMING_ASK_RE` is too tight — widen it in `decision-enforcement.ts`. Do NOT touch the observation gate or numeric thresholds.
4. **Standing:** #537 Fix B/C (PR #539 = Fix A, merged); Scout #494; OneDrive #507.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
