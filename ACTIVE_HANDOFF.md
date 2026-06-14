# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-14 PT (active seam: #244 — Right-now cards Slice 1 copy/verbiage scrub; production SHA ecf89dd.)

## Boot

1. Read this file.
2. Read issue #296.
3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

ACTIVE_SEAM_STATE.json is the machine-readable control plane.
Issue #244 is the active Right-now cards seam (Slice 1: copy/verbiage scrub).
Issue #296 (M1 backend-lock) is COMPLETE — merged via PR #307 (`ecf89dd`); production live.
Issue #301 is COMPLETE — control-plane truth ledger + hidden-op Slack wiring merged through PR #305 (`f29cd80`); hidden-op outcome logging deployed in commit `370cc7a`.
Issue #284 is COMPLETE — owner-operator pass gaps G1-G7 closed across PRs #286, #287, and #288; product-path receipt posted on the issue.
Issue #281 (rung 9) is OWNER_CLOSED — external human-validation gate permanently removed by owner instruction 2026-06-13.
Issue #276 is COMPLETE — Command State Resolver v0 merged via PR #279 (`e848d01`); closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live via PR #273 (`d6b99f2`).
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.

## Current slice:

Current active slice is Right-now cards Slice 1 under issue #244.
Current source-truth action: complete copy/verbiage scrub changing "morning brief/daily card" terminology to "Right Now" to reflect state-change-triggered delivery model.
Implementation target: update all user-facing copy to reflect Right Now state (Slice 1 — copy scrub), then implement product changes to decouple card generation from clock (Slice 2).

Current production truth: `Last known production SHA: ecf89ddb61b9155f9a67ff77a31048f121940b94`

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

Complete PR #308 (Slice 1 copy scrub) with CI green, then continue to Slice 2 product changes: decouple Right Now card generation from clock-based scheduling and implement state-change triggers. Verify dashboard and public pages reflect Right Now terminology before closing Slice 1.
