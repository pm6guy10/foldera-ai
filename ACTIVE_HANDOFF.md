# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **Seam #538 (graceful degradation — never go dark):** PR open on `claude/pr-merge-sequence-kziba2`. Tier-descent safety net wired into `no_valid_action` branch: Tier 2 (commitment due ≤14d → write_document) + Tier 3 (thread-backed owed reply → send_message). do_nothing only when both genuinely empty.
- **#542 + #539 + #540 all merged** to main SHA `230e776`. Repo clean. 1014/1014 tests green.
- **Live proof for #538:** After deploy, `pipeline_runs.gate_funnel.tier_descent_winner` must be non-null for `2cbc1bab` on a day with no Tier-1 discrepancy.
- **Standing:** #537 Fix B/C queued; Scout #494; OneDrive #507.

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

1. Read this file. 2. Read the active issue (#538). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #538 is the active GRACEFUL-DEGRADATION seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**GRACEFUL DEGRADATION / NEVER GO DARK (#538) — code-proven, PR pending.**

`attemptTierDescentDirective` (exported, in `lib/briefing/generator.ts`) is wired into `generateDirective` at the `no_valid_action` branch:
- Tier 2: queries `tkg_commitments` for commitments due today–+14d, status active/at_risk, trust_class trusted/unclassified. Returns a `write_document` directive if found.
- Tier 3: scans `scored.topCandidates` for thread-backed (`isThreadBackedSendableLoop`) owed-reply candidate. Returns a `send_message` directive if found.
- Returns `null` (→ `buildNoValidActionBlockerDirective`) when both tiers empty.
- `tier_descent_winner` label recorded in `GenerationRunLog` and surfaced in `gate_funnel` extras.
- 6 new unit tests in `lib/briefing/__tests__/tier-descent.test.ts`; 1014/1014 total green.

Key invariants:
- Fires ONLY in `no_valid_action` branch — LLM-failure paths untouched.
- Tier 2 excludes past-due commitments (`gte today` filter).
- Tier 3 uses `isThreadBackedSendableLoop` — no stale signal fabrication.
- No gate loosening, no numeric threshold changes.

## Next exact move

1. **Push** `claude/pr-merge-sequence-kziba2` and open draft PR.
2. **Live confirmation post-deploy:** check next morning-pipeline cron for `2cbc1bab` — `pipeline_runs.gate_funnel.tier_descent_winner` should be non-null; directive must not be `do_nothing`.
3. **If still dark (both tiers empty):** verify commitments table has near-future-due rows for 2cbc1bab. Never loosen gates or numeric thresholds.
4. **Standing:** #537 Fix B/C; Scout #494; OneDrive #507.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
