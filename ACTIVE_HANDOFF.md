# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **PR #542 OPEN** (repo cleanup #524): 5 stub workflows deleted, 9 audit docs archived, SESSION_HISTORY/LESSONS_LEARNED moved to `docs/archive/`, ghost gov refs removed, cleanup-branch gate exemption added. Gate green, 75 tests pass. Pending merge.
- **Open PRs:** #542 (repo cleanup) · #539 (external-promisor staleness gate) · #541 (observation shape + Slack receipt).
- **Next:** merge #542 → merge #539 + #541 → start #538 (graceful degradation, never go dark).
- **Owner actions:** (1) delete 38 stale `claude/*` branches (command in PR #542 body); (2) set Vercel `FOLDERA_SELF_USER_ID` = `2cbc1bab`.

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Always ship one real act — never go dark. Empty is not a product.** When no high-stakes discrepancy clears the bar, degrade gracefully to the best *real* available act (a due commitment teed up, an owed reply drafted, a goal-advancing follow-up), honestly framed by stakes. The one hard line that stays: never *fabricate* stakes or post a fixture as real — lower-stakes-but-true beats invented-urgency, and both beat silence. It must be an ACT, not a list/inbox-summary. `do_nothing` is a rare last resort, not a default. (Owner directive 2026-06-23; see #538.)
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** It proposes finished, review-gated artifacts. The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world (the thread they're about to drop, the reply owed, the deadline in their files) and reduce load. Do **not** fish the open web for external "opportunities" — that is tone-deaf. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.
7. **Reduce friction by default, every session.** Standing owner directive: cut process friction and cruft proactively without re-asking; never lock things down. Hard safety rails still need sign-off. See `AGENTS.md` → "Friction Reduction — Standing Authorization".

Keep this cockpit short and value-first. Completed-issue history lives in `docs/archive/SESSION_HISTORY.md` + git, never here.

## Boot

1. Read this file. 2. Read active issue #524. 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #524 is the active REPO-CLEANUP seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**REPO CLEANUP (#524) — PR #542 open, gate:continuity green.** Shipped: 5 stub `agent-*.yml` workflows deleted (no implementation behind them); 9 dated audit docs archived to `docs/archive/`; `SESSION_HISTORY.md` + `LESSONS_LEARNED.md` moved from root → `docs/archive/` with all refs updated (CI workflows, continuity-gate, preflight-contract, SOURCE_OF_TRUTH_MAP, ACTIVE_HANDOFF); 3 ghost file entries removed from `STOP_STATE_CONTRACTLESS_FILES` (`CURRENT_STATE.md`, `controller-autopilot.ts`, `controller-autopilot.test.ts` — never existed); cleanup-branch exemption added to `continuity-gate.ts` so `claude/hotfix-*` and `claude/*-cleanup-*` skip the `active_branch` parity check; seam pointer fixed across all 4 control-plane files (was stale on closed #518 / PR #536). 75 config+preflight tests pass. One remaining owner action: delete 38 stale `claude/*` branches (command in PR #542 body).

## Next exact move

1. **Ship this PR** (`claude/repo-cleanup-o89hvu` → #524): stale branches deleted, stub workflows retired, docs archived, gov refs cleaned, SESSION_HISTORY/LESSONS_LEARNED moved, cleanup-branch gate added. Gate:continuity green.
2. **Merge #539** (external-promisor staleness gate — Fix A for #537 commitment hygiene). Already drafted and green.
3. **Merge #541** (Option C: observation-shape rejection + concrete-incoming-work lane + Slack receipt). Already drafted and green.
4. **Start #538** (graceful degradation ladder — never go dark): tier-descent from high-stakes discrepancy → due commitment → owed reply → goal move → `do_nothing` only when all tiers empty.
5. **Owner:** set Vercel `FOLDERA_SELF_USER_ID` = `2cbc1bab` (Slack cards need this to fire).

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
