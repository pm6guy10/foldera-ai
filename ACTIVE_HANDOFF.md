# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-11 PT (#251 ACTIVE — rung-7 foundation hardening; audit seam)

## Boot

1. Read this file.
2. Read the active issue it names (issue #251).

## Active command gate

Issue #251 is the active hardening seam.
Issue #226 (rung-6 owner-path readiness) is **COMPLETE** — all 3 sub-proofs done, PR #256 merged 2026-06-11.
Issue #249 (scorer-winner invariant) is COMPLETE — PR #257 merged 2026-06-11.
Issue #231 (work-state purity) is COMPLETE — merged PR #232 (2026-06-09).
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

## Current slice:

Issue #251: Rung-7 foundation hardening — Vercel env, build-CI reliability, auth posture.
Audit findings: (1) All Vercel required env vars present in production. (2) Build/CI ENOENT was one-time 80-push race — stale, single-push builds are clean. (3) Supabase auth: 2 WARN advisors (leaked-password, MFA) — requires Dashboard action by Brandon.
Forbidden: non-owner paid loop, #244, #246, landing/frontend, schema changes.

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

Complete #251 proof: run gate:continuity + lint + build, post GitHub receipt, open PR. After #251 merges: open rung-7 issue (non-owner paid loop) and assign it here before starting work.

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
