# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **FULL AUDIT done — issue #540 (FTR). Read it first.** The honest end-to-end answer to "does Foldera work?": **No, not since April 22.** 12 real generations ever; dark 17 days straight; the June Slack-card surface has delivered **0** acted cards (8 attempts). Pool is healthy (141 fresh, 23 high-risk) — silence is the **gate stack**, not data starvation.
- **Two failure layers; we only ever fix Layer 1.** L1 plumbing: `lifecycle_gate` zeroes 67/68 (`scorer.ts:6184`), then `positive_winner_contract` blocks survivors (`artifact-taste-pack.ts:396/:414`), then the one-sentence gate burns retries (`generator.ts:7775`). L2 substance: even when it ships, output is nags/homework — except the **one** valued act ever (Apr 22, conf 95, "…here is your completed prep" — did real work, handed it over done).
- **Next session = ONE structural bet, driven to a live delivered+tapped+valued act.** Likely L2: re-aim at the Apr-22 shape (do a real piece of work, deliver it done), not another gate tweak. Decision is Brandon's. Stop the fix-one-thing-and-move-on reflex.
- **Owner-only still:** set Vercel `FOLDERA_SELF_USER_ID` = `2cbc1bab` (delivery no-ops silently without it).

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

1. Read this file. 2. Read the active issue (#540 — the FTR audit + rubric). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #540 is the active AUDIT-FTR seam.

#537 (commitment hygiene) Fix A merged e3fa1e8 via PR #539; Fix B/C parked pending the #540 structural-bet decision.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**FULL-AUDIT FTR (#540) — "does it work?" answered with live receipts. This is the active record; read #540 before doing anything.** The product has not delivered an acted-on act since **2026-04-22**. The dark verdict is a two-layer failure (L1 gate stack zeroes everything; L2 substance is homework), and we keep fixing L1 one gate at a time and giving up before L2. The one proof-of-value ever (Apr 22 interview prep, "here is your completed prep") is the north-star shape: do a concrete real piece of work and hand it over **done** — the opposite of surfacing a pattern/nag. Next session commits to **one** structural bet (likely re-aiming at that shape) and drives it to a live delivered+tapped+valued act, measured against #540's 4-point definition of "it works." No more touch-and-move-on.

**Superseded (#537 pool hygiene, PR #539 MERGED e3fa1e8):** Fix A (external-promisor staleness gate) is in main and is fine, but the audit proves it was Layer-1 hygiene that changes nothing about why we're dark — the Columbia zombie it removes was candidate #2; candidate #1 died at the same generation gate. Do not invest more in Fix B/C until #540's bet is chosen.

**Fix A (this branch).** `lib/briefing/discrepancy-detector.ts` → new `isStaleExternalPromisorCommitment()` / `hasExternalPromisorPhrasing()`, applied as a pre-filter in `detectDiscrepancies()` right after the `trust_class` filter. It drops a commitment from the pool **before any extractor runs** when all three hold: (1) counterparty-as-subject phrasing ("X will…", "X to provide…", "X is responsible for…" — not the user's own imperatives or first-person promises), (2) `due_at`/`implied_due_at` in the **past**, (3) no fresh extraction touch in **21+ days** (`updated_at`). So the zombie never becomes a candidate and never burns a retry. `canonical_form` added to the scorer commitment fetch (`lib/briefing/scorer.ts`) so the gate sees the normalized form. **Chosen location:** the detector, not `daily-brief-generate.ts` as the issue text guessed — that file calls the opaque `generateDirective()` and never sees individual candidates; the detector is the real, pure, unit-testable chokepoint into `gate_funnel.discrepancy_candidates_preview`.

**Proof (no paid calls):** `lib/briefing/__tests__/discrepancy-detector.test.ts` +13 (phrasing match/reject, three-condition gate, prefers canonical_form, integration: Columbia zombie dropped, the user's own stale at_risk commitment still surfaces). `lib/briefing` 846 green; `tsc --noEmit` clean.

**Predecessor #518 DONE** — PR #536 merged (`aba6877`): stale gate 10→250, blocked_gate truncation fix, morning-pipeline daily_brief→seed_from_scorer, full email send surface deleted (lifecycle generate-only). The Slack Right Now card is now the sole delivery surface.

## Next exact move

1. **Read issue #540 in full.** It is the FTR audit and the rubric. Do not start by re-diagnosing — it's done, with live receipts.
2. **Pick ONE structural bet with Brandon and commit the whole session to it.** The audit points at Layer 2 (re-aim the engine at the Apr-22 shape: detect a concrete real piece of work that landed in Brandon's world, *do it*, deliver it **done**; treat "observation about Brandon" as out of scope). The alternative is a Layer-1 unblock (lifecycle_gate / positive_winner_contract / one-sentence salvage) but the audit argues L1 alone just lets homework through. This is Brandon's product-definition call.
3. **Drive that bet to a live, delivered, tapped, valued act** and measure against #540's 4-point definition of "it works." Add a Slack delivery receipt (today `trigger-runner.ts:680` drops the send result).
4. **Owner-env (still blocking delivery):** set Vercel `FOLDERA_SELF_USER_ID` = `2cbc1bab` — without it the Slack card silently no-ops (`trigger-runner.ts:372`). Standing: Scout #494; OneDrive #507.

Full detail: issue **#540** (full audit / FTR — start here); #537 (pool hygiene, superseded); #518 (verdict calibration, merged).

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
