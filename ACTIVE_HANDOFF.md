# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-12 PT (PR A / G1+G2 merged under issue #284; PR B / G3 active)

## Boot

1. Read this file.
2. Read the active issue it names.

## Active command gate

Issue #284 is the active owner-operator seam.
Issue #281 (rung 9) is an EXTERNAL VALIDATION DEPENDENCY, not a blocker — it stays open and closes when a non-Brandon human completes the loop and names one concrete value. Readiness receipt + validation ask: https://github.com/pm6guy10/foldera-ai/issues/281#issuecomment-4694707092
Issue #276 is COMPLETE — Command State Resolver v0 merged via PR #279 (`e848d01`); closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live (PR #273, `d6b99f2`).
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

**Active seam: issue #284 — A-to-Z owner-operator pass: close the gap between vision and product.**
Owner mandate (2026-06-12): full-app pass, multi-PR campaign, make the money path deliver the holy-crap moment to a cold non-owner user with zero narration.

## Current slice:

Issue #284 remains the active owner-operator campaign. The audit receipt is posted and PR A is merged:
- PR A / G1+G2 COMPLETE — PR #286 (`cf8860f`) mounted the presence-first `/dashboard` loop and rewrote the contradictory dashboard browser contracts.
- External CI note from PR A: the final post-merge Actions run failed only on GitHub artifact-upload storage quota after `Next build` and `unit` both passed. That is platform noise, not an app regression.

PR B / G3 is active:
- wire Command State Resolver v0 into the live loop
- return the resolver in `GET /api/workday-presence`
- render one UI-safe trusted verdict line on the card
- prevent the dashboard from showing a fake "do this now" move when resolver truth says `WAIT` or `CLEAR`

Command State Resolver v0 wiring into the live loop is explicitly authorized (the journey's "one trusted verdict", formerly unconsumed).
Safety rails unchanged: no outbound sends by default, no paid tests without naming exact cost, acquisition stays quarantined OFF, no fake claims, one intervention max, safe silence is a win, schema changes only via committed+applied+verified migrations.

## #276 closeout record

Command State Resolver v0: `lib/workday-presence/command-state-resolver.ts` — four verdicts (`MERGE_READY`, `FIX_FIRST`, `WAIT`, `CLEAR`), conservative precedence, weak truth collapses to CLEAR. Proof: 19/19 contract tests · 66/66 suite · all gates · CI green. Receipt: https://github.com/pm6guy10/foldera-ai/issues/276#issuecomment-4694521189

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

Finish PR B / G3 on issue #284: resolver-backed `/api/workday-presence` response, trusted verdict line on the dashboard card, honest quiet/hold behavior when resolver truth says `CLEAR` or `WAIT`, full gates, PR, merge-through, receipt, then continue to G4.

## Prior closeout records (condensed; GitHub receipts + git history are the archive)

- #259 (rung 7): mechanical non-owner pipe proof — receipt https://github.com/pm6guy10/foldera-ai/issues/259#issuecomment-4692374168
- #249: scored winner beats recency, enforced in `selectSourceBackedRightNowState` — PR #257 (`ac8b15e`); receipt https://github.com/pm6guy10/foldera-ai/issues/249#issuecomment-4686122101
- #226 (rung 6): Gmail + Microsoft sign-in + Slack self-loop scored winner — PR #256; receipt https://github.com/pm6guy10/foldera-ai/issues/226#issuecomment-4685107461
