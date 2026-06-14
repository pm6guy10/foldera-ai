# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-14 PT (#244 Slice 2 MERGED via PR #313 at d2bed9a; between seams.)

## Boot

1. Read this file.
2. Read the next active issue (see below).
3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

ACTIVE_SEAM_STATE.json is the machine-readable control plane.
No active seam — between rungs. `active_issue: none` is the valid between-rungs form.

Issue #296 (M1 backend-lock) is COMPLETE — merged via PR #307 (`ecf89dd`); production live.
Issue #301 is COMPLETE — control-plane truth ledger + hidden-op Slack wiring merged through PR #305 (`f29cd80`); hidden-op outcome logging deployed in commit `370cc7a`.
Issue #284 is COMPLETE — owner-operator pass gaps G1-G7 closed across PRs #286, #287, and #288.
Issue #281 (rung 9) is OWNER_CLOSED — external human-validation gate permanently removed by owner instruction 2026-06-13.
Issue #276 is COMPLETE — Command State Resolver v0 merged via PR #279 (`e848d01`); closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live via PR #273 (`d6b99f2`).
Issue #244 is COMPLETE — Right Now cards / state-change triggers. Slice 1 (copy scrub) PR #308 `dddece7`; Slice 2 (trigger persistence + fresh-load fix + button trim) PR #313 `d2bed9a`.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.

## Current slice:

- Issue #244 Slice 1 (Copy scrub) — **MERGED**. PR #308 at `dddece7`.
- Issue #244 Slice 2 (State-change triggers) — **MERGED**. PR #313 at `d2bed9a`. Trigger persistence, durable receipts, fresh-load override on GET, MorningAnchorCard trimmed to 2 buttons.

## Next exact move

1. Implement #246: GitHub OS Enforcement Layer v2 Gates (B-E: forbidden files, PR receipt, active-seam protection, intake form; F: CI forbidden-claim grep; G: doctrine in FOLDERA_MASTER_BIBLE.md)

Current production truth: `Last known production SHA: d2bed9a` (PR #313 merged; #244 Slice 2 live in production)

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
