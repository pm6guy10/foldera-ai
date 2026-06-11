# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-11 PT (#226 COMPLETE — all 3 sub-proofs done, PR #256 merged; active seam is #249)

## Boot

1. Read this file.
2. Read the active issue below.

## Active command gate

Issue **#249** is the active seam — right-now winner selection via `scoreOpenLoops`; compute `risk_score` + `due_confidence`.
Issue #226 (rung-6 owner-path readiness) is **COMPLETE** — all 3 sub-proofs done, PR #256 merged 2026-06-11. Proof receipt: https://github.com/pm6guy10/foldera-ai/issues/226#issuecomment-4685107461
Issue #231 (work-state purity) is COMPLETE — merged PR #232 (2026-06-09).
Rung 5 (issue #220) is COMPLETE — payment path proven live.
Rung 7 (non-owner paid loop) is now **unblocked** — #226 is proven.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

## Current slice:

- Issue #249: wire `scoreOpenLoops` as the permanent right-now winner source; compute `risk_score` and `due_confidence` from signals in the rows; backfill. Pool state going into #249: scorable=99 rows, future=1, next7d=1 ("Homeschool meeting with Deanne Varnum" due 2026-06-12). `risk_score`=0 and `due_confidence`=0.5 on all rows (both flat — that is #249's job). MS mail 2AM backfill will add ~3 weeks of Outlook signals.
- Forbidden in this seam: non-owner proof, Stripe changes, schema migrations not related to scoring, new connectors, broad cleanup.

## Product doctrine

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention; remembers where the user was, decides when to interrupt, gives one next move, lets the user respond with one click, updates state, stays quiet otherwise. No dashboard/task-manager/inbox-summary/chatbot/surveillance drift. Issue #48 and `FOLDERA_MASTER_BIBLE.md` carry product doctrine.

Owner verbiage directive (2026-06-10): cards are "right now" cards, not "morning" cards — interruption is state-change-triggered and as-needed, not once-daily. Verbiage + trigger decoupling is a queued post-#249 seam.

## GitHub writeback contract

- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue changes.

## Next exact move

Work issue #249: open the issue, read completion criteria, then wire `scoreOpenLoops` as the permanent path for the right-now card (replacing the current recency fallback). Compute `risk_score` and `due_confidence` from signals already in each row. Re-run `node scripts/audit-selection-pool.mjs` after 2AM MS backfill to verify pool freshness before tuning.

## #226 closeout record

Sub-proof 1: Gmail sign-in — PASS (prior session)
Sub-proof 2: Microsoft sign-in — PASS (Azure client secret regenerated + ENCRYPTION_KEY fixed in Vercel, 2026-06-11)
Sub-proof 3: Slack self-loop scored winner — PASS (2026-06-11, PR #256)
  - `scoreOpenLoops` fired (pipelineDryRun: true)
  - Winner: "Commitment due in 0d: Homeschool meeting with Deanne Varnum" (score 2.86, type discrepancy)
  - `state_source: 'scored_winner'` — scorer path, not recency pick
  - Done interaction recorded, loop closed
  - Proof receipt: https://github.com/pm6guy10/foldera-ai/issues/226#issuecomment-4685107461
