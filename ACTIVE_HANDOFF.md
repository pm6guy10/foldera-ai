# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-14 PT (PR #311 merged to main at d81240b; #244 Slice 1 is merged; Slice 2 source-truth ratchet is active before product wiring.)

## Boot

1. Read this file.
2. Read issue #244.
3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

ACTIVE_SEAM_STATE.json is the machine-readable control plane.
Issue #244 is the active Right-now cards seam.
Issue #296 (M1 backend-lock) is COMPLETE — merged via PR #307 (`ecf89dd`); production live.
Issue #301 is COMPLETE — control-plane truth ledger + hidden-op Slack wiring merged through PR #305 (`f29cd80`); hidden-op outcome logging deployed in commit `370cc7a`.
Issue #284 is COMPLETE — owner-operator pass gaps G1-G7 closed across PRs #286, #287, and #288; product-path receipt posted on the issue.
Issue #281 (rung 9) is OWNER_CLOSED — external human-validation gate permanently removed by owner instruction 2026-06-13.
Issue #276 is COMPLETE — Command State Resolver v0 merged via PR #279 (`e848d01`); closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live via PR #273 (`d6b99f2`).
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.

## Current slice:

- Issue #244 Slice 1 (Copy scrub) — **MERGED**. PR #308 landed at commit dddece7. All morning-brief/daily-card copy changed to Right Now terminology.
- Issue #244 Slice 2 (State-change product changes) — **ACTIVE**. Ratchet the control files to the live deploy and widen the seam contract from Slice 1 copy-only files to the trigger/runtime surface required for product work.
- Issue #244 Slice 2 (Product wiring) — **NEXT**. Decouple Right Now card generation from clock; implement trigger wiring and event integration.

Next human action: Merge the Slice 2 source-truth ratchet, then implement #244 Slice 2 trigger wiring and state-change model.

Current production truth: `Last known production SHA: d81240b031bc8ca5a5f254e469c6bffead0cbd71` (PR #311 merged; #244 contract-scope housekeeping live in production)

Safety rails unchanged: no outbound sends by default, no paid tests without naming exact cost, acquisition stays quarantined OFF, no fake claims, one intervention max, safe silence is a win, schema changes only via committed+applied+verified migrations.

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

1. Implement #244 Slice 2: State-change trigger product architecture (right-now card generation decoupled from clock; trigger wiring via workday-presence POST; event integration + testing)
2. Implement #246: GitHub OS Enforcement Layer v2 Gates (B-E: forbidden files, PR receipt, active-seam protection, intake form; F: CI forbidden-claim grep; G: doctrine in FOLDERA_MASTER_BIBLE.md)
