# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-10 PT (truth repair — #231 is COMPLETE via PR #232; #226 reactivated)

## Boot

1. Read this file.
2. Read the active issue below.

## Active command gate

Issue #226 is the active rung-6 owner-path-readiness seam.
Rung 6 scope: sign-in reliability + one Slack self-loop end-to-end.
Issue #231 (work-state purity) is COMPLETE — full scope merged in PR #232 (2026-06-09): earned trust (outbound evidence required), work/personal/automated relationship labels, nightly demotion sweep, acquisition agents default OFF.
Rung 5 (issue #220) is COMPLETE — payment path proven live. Rung 7 (non-owner paid loop) remains forbidden until #226 is proven.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

## Current slice:

- Issue #226 proves owner-path readiness. Known facts: Gmail sign-in WORKS for Brandon; Microsoft sign-in is BROKEN. The Microsoft OAuth path is an explicit sub-proof of this seam (likely Azure app redirect URI / tenant config / token persistence — see PR #230's transient-persist hypothesis).
- Required proof: (1) Brandon signs in reliably via Gmail AND Microsoft, (2) one Slack self-loop end-to-end surfacing one real next move, (3) durable receipt in GitHub truth.
- Forbidden in this seam: non-owner proof, Stripe changes, schema migrations, new connectors, broad cleanup.

## Product doctrine

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention; remembers where the user was, decides when to interrupt, gives one next move, lets the user respond with one click, updates state, stays quiet otherwise. No dashboard/task-manager/inbox-summary/chatbot/surveillance drift. Issue #48 and `FOLDERA_MASTER_BIBLE.md` carry product doctrine.

Owner verbiage directive (2026-06-10): cards are "right now" cards, not "morning" cards — interruption is state-change-triggered and as-needed, not once-daily. Verbiage + trigger decoupling is a queued post-#226 seam (needs its own issue), not part of #226.

## GitHub writeback contract

- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue changes.

## Next exact move

Work issue #226: diagnose the Microsoft sign-in failure (capture one failed sign-in with exact evidence: browser symptom + auth trace), fix the narrowest seam, prove Gmail + Microsoft sign-in, then run one Slack self-loop end-to-end. Post receipts to #226. After #226 is proven: open rung 7 issue (non-owner paid loop) and the "right now cards" product issue.
