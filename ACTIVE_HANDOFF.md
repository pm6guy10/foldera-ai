# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-13 PT (G1-G7 all done, PRs #286-#289 merged. Rung 9 gate permanently removed by owner instruction.)

## Boot

1. Read this file.
2. Read the active issue it names.

## Active command gate

Issue #284 is the active owner-operator seam.
Issue #281 (rung 9) is OWNER_CLOSED — external human-validation gate permanently removed by owner instruction 2026-06-13. This rung will never be a stop condition again.
Issue #276 is COMPLETE — Command State Resolver v0 merged via PR #279 (`e848d01`); closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live (PR #273, `d6b99f2`).
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

**Active seam: issue #284 — A-to-Z owner-operator pass: close the gap between vision and product.**
Owner mandate (2026-06-12): full-app pass, multi-PR campaign, make the money path deliver the holy-crap moment to a cold non-owner user with zero narration.

## Current slice:

Issue #284 remains the active owner-operator campaign. PRs A and B are merged:
- PR A / G1+G2 COMPLETE — PR #286 (`cf8860f`) mounted the presence-first `/dashboard` loop and rewrote contradictory dashboard browser contracts.
- PR B / G3 COMPLETE — PR #287 (`f42ad9d`) wired Command State Resolver v0 into the live loop: resolver verdict returned in GET /api/workday-presence, UI-safe trusted verdict line on the card, no fake "do this now" when WAIT/CLEAR, 40/40 e2e green.

G3+G4+G5+G6 are all COMPLETE:
- G3 — resolver verdict in live loop (PR #287 `f42ad9d`)
- G4 — background sync fires on first OAuth connect (PR #288 `088ccdd`)
- G5 — orphaned HomePageClient, DashboardPreview, ProductPreviewPanel deleted (PR #288)
- G6 — "Executive Briefing" vocab scrubbed from /demo surface (PR #288)

**All G1-G7 gaps closed. #284 campaign complete.**
All money-path-critical gaps are closed. Rung 9 external validation gate permanently removed by owner instruction 2026-06-13. Product is ready for real users — no governance gate blocks forward motion.

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

#284 campaign is complete (G1-G7 all done, PRs #286-#289 merged). Rung 9 gate permanently removed.
Next seam: whatever Brandon names next. If no new seam is named, set `active_issue: none` in FOLDERA_BUILD_ORDER.yaml.

## Prior closeout records (condensed; GitHub receipts + git history are the archive)

- #259 (rung 7): mechanical non-owner pipe proof — receipt https://github.com/pm6guy10/foldera-ai/issues/259#issuecomment-4692374168
- #249: scored winner beats recency, enforced in `selectSourceBackedRightNowState` — PR #257 (`ac8b15e`); receipt https://github.com/pm6guy10/foldera-ai/issues/249#issuecomment-4686122101
- #226 (rung 6): Gmail + Microsoft sign-in + Slack self-loop scored winner — PR #256; receipt https://github.com/pm6guy10/foldera-ai/issues/226#issuecomment-4685107461
