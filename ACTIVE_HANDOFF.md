# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-12 PT (#276 COMPLETE — Command State Resolver v0 merged via PR #279; between rungs, rung 9 needs its issue)

## Boot

1. Read this file.
2. Read the active issue it names.

## Active command gate

No active seam. Command state is between rungs until rung 9 is activated.
Issue #276 is COMPLETE — Command State Resolver v0 backend verdict object merged via PR #279 (`e848d01`) on 2026-06-12.
Issue #274 is COMPLETE — resolver contract locked in source truth 2026-06-12 (PR #277, `7c6cc1a`).
Issue #262 is COMPLETE — PR #273 merged `d6b99f2`; production deploy `dpl_A4XzywTzsTqhc31KRRWyXxdUg6b7` READY.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only — the count is zero right now, on purpose.

**Next seam: rung 9 — prove first non-owner validation. Its GitHub issue does not exist yet (`issue: needs_issue` in `FOLDERA_BUILD_ORDER.yaml`).**
Owner action required: create (or explicitly authorize an agent to create) the rung-9 issue, then activate it in all three control files.

## Current slice:

Between rungs. No implementation is authorized.
Rung 9 completion criteria: one person who is not Brandon completes the loop and names one concrete value. Mechanical pipe proofs do not satisfy it (that was #259).
Forbidden until rung 9 activates: any implementation, dashboard/UI, new connectors, Stripe, #244, #246.

## #276 closeout record

Command State Resolver v0: one pure backend resolver (`lib/workday-presence/command-state-resolver.ts`) collapses saved workday presence state into exactly one of four verdicts: `MERGE_READY`, `FIX_FIRST`, `WAIT`, `CLEAR`.
- Conservative precedence: snooze > named blocker > prepared draft > external wait > honest CLEAR.
- Weak truth never produces action verdicts: scored winner without a draft → CLEAR; label-only draft → CLEAR; malformed state → CLEAR. WAIT/CLEAR are real wins.
- `resolveCommandStateForUser` reads the same auth-metadata state row the trigger-runner uses — connected truth, no parallel store.
- Proof: 19/19 resolver contract tests · 66/66 workday-presence suite · gate:continuity · lint · build · 53-gate pre-push · CI green.
- PR #279 merged `e848d01` (2026-06-12). Issue #276 closed COMPLETED.

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

Owner: create the rung-9 issue — "Rung 9: prove first non-owner validation" (one non-Brandon human completes the loop, gets a durable receipt row, and names one concrete value in their own words) — then activate it as the single active seam in `ACTIVE_HANDOFF.md`, `FOLDERA_BUILD_ORDER.yaml`, and `.foldera-contract.json`. Agent issue-creation was permission-denied 2026-06-12, so this step is owner-gated.

## Prior closeout records (condensed; GitHub receipts + git history are the archive)

- #259 (rung 7): mechanical non-owner pipe proof — receipt https://github.com/pm6guy10/foldera-ai/issues/259#issuecomment-4692374168
- #249: scored winner beats recency, enforced in `selectSourceBackedRightNowState` — PR #257 (`ac8b15e`); receipt https://github.com/pm6guy10/foldera-ai/issues/249#issuecomment-4686122101
- #226 (rung 6): Gmail + Microsoft sign-in + Slack self-loop scored winner — PR #256; receipt https://github.com/pm6guy10/foldera-ai/issues/226#issuecomment-4685107461
