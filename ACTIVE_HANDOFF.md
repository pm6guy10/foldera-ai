# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-11 PT (#251 COMPLETE — PR #258 merged b0de76d; #259 active)

## Boot

1. Read this file.
2. Read the active issue it names (issue #259).

## Active command gate

Issue #259 is the active rung-7 seam.
Issue #251 (rung-7 foundation hardening) is COMPLETE — PR #258 merged 2026-06-11.
Issue #226 (rung-6 owner-path readiness) is COMPLETE — PR #256 merged 2026-06-11.
Issue #249 (scorer-winner invariant) is COMPLETE — PR #257 merged 2026-06-11.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

## Current slice:

Issue #259: Rung 7 — prove non-owner paid loop (onboard → connect source → receive card → one action → durable receipt).
Forbidden: #244, #246, dashboard/frontend polish, schema migrations beyond loop requirements, governance cleanup.

## Product doctrine

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention; remembers where the user was, decides when to interrupt, gives one next move, lets the user respond with one click, updates state, stays quiet otherwise. No dashboard/task-manager/inbox-summary/chatbot/surveillance drift. Issue #48 and `FOLDERA_MASTER_BIBLE.md` carry product doctrine.

## GitHub writeback contract

- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue changes.

## Next exact move

Execute issue #259 (rung-7 non-owner paid loop). Read issue #259 before acting. Do not touch #244, #246, or any governance file until #259 is proven.

## #249 closeout record

Invariant: scored winner beats recency — enforced in `selectSourceBackedRightNowState`.
PR #257 merged 2026-06-11. Merge SHA: ac8b15e.
Proof: 20/20 vitest pass · gate:continuity pass · lint clean · build clean · 53-gate pre-push pass · CI green.
Proof receipt: https://github.com/pm6guy10/foldera-ai/issues/249#issuecomment-4686122101

## #226 closeout record

Sub-proof 1: Gmail sign-in — PASS (prior session)
Sub-proof 2: Microsoft sign-in — PASS (Azure client secret regenerated + ENCRYPTION_KEY fixed in Vercel, 2026-06-11)
Sub-proof 3: Slack self-loop scored winner — PASS (2026-06-11, PR #256)
  - `scoreOpenLoops` fired (pipelineDryRun: true)
  - Winner: "Commitment due in 0d: Homeschool meeting with Deanne Varnum" (score 2.86, type discrepancy)
  - `state_source: 'scored_winner'` — scorer path, not recency pick
  - Done interaction recorded, loop closed
  - Proof receipt: https://github.com/pm6guy10/foldera-ai/issues/226#issuecomment-4685107461
