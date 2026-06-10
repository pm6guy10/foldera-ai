# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-10 PT (issue #240 governance collapse)

## Boot

1. Read this file.
2. Read the active issue below.

## Active command gate

Issue #240 is the active governance-collapse seam.
Issue #231 (work-state purity — earned entity trust, graph demotion sweep, agent quarantine; owner directive) is PAUSED while #240 lands; it resumes as the active seam immediately after #240 merges.
Issue #226 (rung 6 — owner-path readiness: sign-in + Slack self-loop) is PAUSED behind #231.
Rung 5 (issue #220) is COMPLETE — payment path proven live. Rung 7 (non-owner paid loop) remains forbidden until #226 is proven.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file (north star + product operating system merged in by #240).
One active seam only.

## Current slice:

- Issue #240 collapses governance: root markdown reduced to the keep-list, shims deleted, doctrine merged into the Master Bible, agent contracts merged into `AGENTS.md`, and `gate:continuity` rewritten as the single structural gate with a root-markdown-count cap.
- Git history is the archive. Deleted files are not authority.
- A new governance rule may only be added by editing an existing keep-list file, never by creating a new file (enforced by `npm run gate:continuity`).

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

Land the #240 governance-collapse PR: proof is `npm run gate:continuity`, `npm run lint`, `npm run build`, focused vitest lanes, and root markdown count <= 8. After merge, reactivate issue #231 (work-state purity, owner directive); issue #226 resumes after #231 is proven.
