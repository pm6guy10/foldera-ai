# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-10 PT (issue #231 work-state purity — #240 MERGED)

## Boot

1. Read this file.
2. Read the active issue below.

## Active command gate

Issue #231 is the active work-state-purity seam.
Issue #226 (rung 6 — owner-path readiness: sign-in + Slack self-loop) is PAUSED behind #231.
Rung 5 (issue #220) is COMPLETE — payment path proven live. Rung 7 (non-owner paid loop) remains forbidden until #226 is proven.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

## Current slice:

- Issue #231 repairs work-state contamination: earned trust (outbound evidence required), personal salience cap, nightly demotion sweep, acquisition/growth agent quarantine (default OFF), and blocked-brief receipts (visible reason when confidence gate fires).
- Scope: `lib/signals/entity-trust.ts`, `lib/agents/` quarantine kill-switch, cron blocked-brief receipt, governance amendments.
- Issue #240 governance collapse is MERGED — root markdown bounded to 7, single gate, single contract.

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

Work issue #231: fix `lib/signals/entity-trust.ts` (earned trust — outbound evidence required, personal salience cap), add nightly demotion sweep, quarantine acquisition/growth agents (default OFF), add blocked-brief receipts. Proof: focused vitest on trust classification + demotion + salience cap, `npm run gate:continuity`, lint, build green. PR, merge, then reactivate #226.
