# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-12 PT (#281 readiness VERIFIED — validation ask posted; rung 9 blocked only on the human validator)

## Boot

1. Read this file.
2. Read the active issue it names.

## Active command gate

Issue #281 is the active validation seam.
Issue #276 is COMPLETE — Command State Resolver v0 merged via PR #279 (`e848d01`); closeout PR #280 (`13581bf`); both production deploys READY on foldera.ai.
Issue #274 is COMPLETE — resolver contract locked in source truth 2026-06-12 (PR #277, `7c6cc1a`).
Issue #262 is COMPLETE — PR #273 merged `d6b99f2`; event-driven trigger runner live.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

**Active seam: issue #281 — Rung 9: prove first non-owner validation.**
One person who is not Brandon completes the loop and names one concrete value.

## Current slice:

Issue #281: rung-9 organic non-owner validation.
- Terminal proof is human-gated: a real non-owner completes the loop (source connected → justified intervention or honest quiet → one-click response → durable receipt) and names one concrete value in their own words.
- Agent-side scope: verify the non-owner path is mechanically ready (free truth reads — IDs/counts/booleans only), smallest-correct repairs inside the proven loop when verification exposes a break, prepare the exact validation ask.
- Mechanical pipe proofs do NOT satisfy this rung (that was #259).
Forbidden: new product surface, dashboard/UI redesign, new connectors, Slack card redesign, Stripe, #244, #246, paid tests without owner approval, outbound sends by default.

## #276 closeout record

Command State Resolver v0: `lib/workday-presence/command-state-resolver.ts` collapses saved presence state into exactly one of four verdicts: `MERGE_READY`, `FIX_FIRST`, `WAIT`, `CLEAR`. Precedence: snooze > named blocker > prepared draft > external wait > honest CLEAR; weak truth never produces action verdicts. Proof: 19/19 contract tests · 66/66 suite · all gates · CI green. Receipt: https://github.com/pm6guy10/foldera-ai/issues/276#issuecomment-4694521189
Not yet consumed by any runtime surface — wiring it into the live loop is the natural implementation seam after rung 9 (owner sequencing call; recorded in #136).

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

Readiness is VERIFIED and the validation ask is posted: https://github.com/pm6guy10/foldera-ai/issues/281#issuecomment-4694707092 (non-owner pipeline live — 1,277 signals, freshest 2026-06-12 14:58 UTC; receipt path proven; surface = dashboard Right Now card via resolveAnyUser). The one remaining dependency is human: hand the ask to the first non-Brandon validator. Their one-click receipt row + named value closes the rung. Note: agent reads of `auth.users` are permission-blocked (denied 3×, 2026-06-12); app-table counts are readable.

## Prior closeout records (condensed; GitHub receipts + git history are the archive)

- #259 (rung 7): mechanical non-owner pipe proof — receipt https://github.com/pm6guy10/foldera-ai/issues/259#issuecomment-4692374168
- #249: scored winner beats recency, enforced in `selectSourceBackedRightNowState` — PR #257 (`ac8b15e`); receipt https://github.com/pm6guy10/foldera-ai/issues/249#issuecomment-4686122101
- #226 (rung 6): Gmail + Microsoft sign-in + Slack self-loop scored winner — PR #256; receipt https://github.com/pm6guy10/foldera-ai/issues/226#issuecomment-4685107461
