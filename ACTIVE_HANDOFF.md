# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **Seam #537 (commitment pool hygiene):** shipping **Fix A** — external-promisor staleness gate. `detectDiscrepancies()` now drops counterparty-as-subject commitments ("X will contact you…") that are past-due AND stale (>21d no fresh touch) before any extractor runs, so the Columbia Motors zombie can't win or burn a retry. Pure chokepoint in `lib/briefing/discrepancy-detector.ts`; `canonical_form` added to the scorer commitment fetch. lib/briefing 846 green (13 new), typecheck clean.
- **Predecessor #518 DONE:** PR #536 merged (`aba6877`) — stale gate 10→250, morning-pipeline daily_brief→seed_from_scorer, email send surface deleted.
- **#537 remaining:** Fix B (marketing-sender extraction filter) + Fix C (fuzzy dedup).
- **Still owner-only:** set Vercel `FOLDERA_SELF_USER_ID` = `2cbc1bab` so Slack cards fire.

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

1. Read this file. 2. Read the active issue (#537). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #537 is the active COMMITMENT-HYGIENE seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**COMMITMENT POOL HYGIENE (#537) — Fix A shipped: external-promisor staleness gate.** When professional signal is thin, stale/misextracted commitments float to the top of the discrepancy ranking and win a weak card. Observed 2026-06-23: "Columbia Motors will contact you regarding the 2017 Toyota Sienna" — a passive counterparty callback with no actionable move for Brandon. Manual suppression (`suppressed_at`/`suppressed_reason`) is whack-a-mole; the extractor keeps minting zombies.

**Fix A (this branch).** `lib/briefing/discrepancy-detector.ts` → new `isStaleExternalPromisorCommitment()` / `hasExternalPromisorPhrasing()`, applied as a pre-filter in `detectDiscrepancies()` right after the `trust_class` filter. It drops a commitment from the pool **before any extractor runs** when all three hold: (1) counterparty-as-subject phrasing ("X will…", "X to provide…", "X is responsible for…" — not the user's own imperatives or first-person promises), (2) `due_at`/`implied_due_at` in the **past**, (3) no fresh extraction touch in **21+ days** (`updated_at`). So the zombie never becomes a candidate and never burns a retry. `canonical_form` added to the scorer commitment fetch (`lib/briefing/scorer.ts`) so the gate sees the normalized form. **Chosen location:** the detector, not `daily-brief-generate.ts` as the issue text guessed — that file calls the opaque `generateDirective()` and never sees individual candidates; the detector is the real, pure, unit-testable chokepoint into `gate_funnel.discrepancy_candidates_preview`.

**Proof (no paid calls):** `lib/briefing/__tests__/discrepancy-detector.test.ts` +13 (phrasing match/reject, three-condition gate, prefers canonical_form, integration: Columbia zombie dropped, the user's own stale at_risk commitment still surfaces). `lib/briefing` 846 green; `tsc --noEmit` clean.

**Predecessor #518 DONE** — PR #536 merged (`aba6877`): stale gate 10→250, blocked_gate truncation fix, morning-pipeline daily_brief→seed_from_scorer, full email send surface deleted (lifecycle generate-only). The Slack Right Now card is now the sole delivery surface.

## Next exact move

1. **#537 Fix B** — marketing-sender extraction filter: reject commitment extraction when the signal `author` is a noreply/marketing/one-way sender (`noreply@`, `donotreply@`, `team@info.*`, `*@trx.mail*`) or has no reply-to. Kills the ClickUp interview ghost at the source.
2. **#537 Fix C** — fuzzy dedup on commitment creation: similarity > 0.85 (pg_trgm / normalized distance) updates the existing record instead of inserting a duplicate (the "Sign Inbound Data License Agreement" ×2 pattern).
3. **Live confirmation:** after deploy, the next morning-pipeline cron's `pipeline_runs.gate_funnel.discrepancy_candidates_preview` for `2cbc1bab` should contain no stale external-promisor candidate.
4. **Owner-env:** set Vercel `FOLDERA_SELF_USER_ID` = `2cbc1bab` (Slack cards need this to fire). Standing: Scout #494; OneDrive #507.

Full detail: issue #537 (commitment hygiene); predecessor issue #518 (verdict calibration, merged).

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
