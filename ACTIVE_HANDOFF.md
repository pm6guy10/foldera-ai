# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-16 PT (Awaiting next authorized seam)

## Boot

1. Read this file.
2. Read the next active issue (see below).
3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

ACTIVE_SEAM_STATE.json is the machine-readable control plane.
Active implementation seam is NONE / awaiting authorized seam.

Issue #341 is COMPLETE — runtime map + current-path Supabase receipts merged via PR #343 (`613296d`); Slack right-now owner-guard and presence-action receipts wired.
Issue #339 is COMPLETE — frontend auth polish closeout merged via PR #340 (`a315394`); dashboard connect anchors now use OAuthConnectButton.
PR #336 is SUPERSEDED — closed without merge; PR #340 is the clean replacement.
PR #338 is COMPLETE — Repo Truth Boot Gate accepts GitHub MCP as valid auth path; merged `bae154e`.
PR #337 is COMPLETE — Stale #330 control-plane cleared; merged `80d3a6b`.
Issue #136 is COMPLETE — Run Ledger rule installed via PR #319 (`d1291ff`).
Issue #321 is COMPLETE — Autonomous Seam Governor installed via PR #322.
Issue #314 is COMPLETE — Slack cockpit merged via PR #318 (`b03e7c4`).
Issue #296 (M1 backend-lock) is COMPLETE — merged via PR #307 (`ecf89dd`); production live.
Issue #284 is COMPLETE — owner-operator pass gaps G1-G7 closed across PRs #286, #287, and #288.
Issue #281 (rung 9) is OWNER_CLOSED — external human-validation gate permanently removed by owner instruction 2026-06-13.
Issue #276 is COMPLETE — Command State Resolver v0 merged via PR #279 (`e848d01`); closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live via PR #273 (`d6b99f2`).
Issue #244 is COMPLETE — Right Now cards / state-change triggers. Slice 1 PR #308 `dddece7`; Slice 2 PR #313 `d2bed9a`.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.

## Current slice:

- NONE

## Next exact move

1. Create or name the next authorized GitHub issue.
2. Update `ACTIVE_HANDOFF.md`, `ACTIVE_SEAM_STATE.json`, `FOLDERA_BUILD_ORDER.yaml`, and `.foldera-contract.json` to that issue before coding.
3. Do not start implementation work until the next active seam is explicitly authorized.

Current production truth: `Last known main SHA: 613296d` (PR #343 merged 2026-06-16; issue #341 closed on GitHub)

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
