# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-13 PT (M1 loop-health guardian merged PR #297 96fa9a2; Slack DM alarm live; milestone board #296 open; auto-label workflow #295 merged.)

## Boot

1. Read this file.
2. Read the active issue it names.

## Active command gate

Issue #296 is the active milestone seam.
Issue #281 (rung 9) is OWNER_CLOSED — external human-validation gate permanently removed by owner instruction 2026-06-13. This rung will never be a stop condition again.
Issue #276 is COMPLETE — Command State Resolver v0 merged via PR #279 (`e848d01`); closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live (PR #273, `d6b99f2`).
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

**Active seam: M1 — Loop closes for Brandon (≥3 days/week, 2 consecutive weeks).**
Milestone board: issue #296. M1 definition: the one metric that means Foldera works is `tkg_actions.approved_at` being stamped by a human, not just the brain generating moves.

## Current slice:

**#284 campaign COMPLETE** (G1-G7 all done, PRs #286-#289 merged). Rung 9 permanently removed.

**M1 foundation laid:**
- PR #295 MERGED — auto-label workflow: every new issue tagged on open (ops/intake/frontend/handoff/product)
- PR #297 MERGED (`96fa9a2`) — loop-health guardian: daily scheduled check on `tkg_actions.approved_at`; exits non-zero and fires a Slack DM (SLACK_BOT_TOKEN + FOLDERA_SLACK_SELF_CHANNEL_ID) when COLD/NEVER. The loop has been dead since 2026-04-22 — first scheduled run will correctly go red and ping Slack.
- Issue #296 OPEN — Milestone board M1→M4 (M1: Brandon closes loop; M2: stranger closes loop; M3: frontend on locked contract; M4: runs itself)

**M1 blocker identified:** `workday_presence_state` is not always-present. When it's null/missing, the dashboard renders a dead setup form with no action buttons — no loop possible. Backend state contract must be locked before the loop can reliably close.

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

## Guardian Vision Lock (2026-06-13 — DO NOT REGRESS)

Owner mandate written into `FOLDERA_MASTER_BIBLE.md` PART II-B and II-C. Any session that drifts back to "build another scoring module" or "add a new classifier" without a runtime consumer is violating the Brain-Without-Hands Law (AGENTS.md). Snap back here.

**The vision in one sentence:** Foldera is the Facebook pixel inverted — total-context care, not total-context extraction. The magic moment is "how did it know?" not "here are your top 5 items."

**The data moat:** signal→act→outcome tuples at scale teach Foldera what buried signals matter to what persona, when, and how to deliver them. Average-person signals (family, health, money, community) vs. professional signals (GitHub noise, Slack loops, project artifacts) calibrate differently. The crowd makes every user's experience better. That feedback loop is the moat — not the connector count, not the scoring formula.

**The next move law:** Wire one real act onto something already surfaced. The Slack loop is live and proven (owner-only). Widen that thread — don't start a new brain.

## Next exact move

Loop-health guardian is live (PR #297 merged). Alarm will DM Brandon in Slack when the loop is cold.

**Next seam (M1 backend-lock):** Make `workday_presence_state` always-present — seed a real state object on every dashboard load so Brandon always sees an action button, never a dead setup form. One backend fix, locked contract, no frontend redesign. Issue #284 or a new M1 issue.

## Prior closeout records (condensed; GitHub receipts + git history are the archive)

- #259 (rung 7): mechanical non-owner pipe proof — receipt https://github.com/pm6guy10/foldera-ai/issues/259#issuecomment-4692374168
- #249: scored winner beats recency, enforced in `selectSourceBackedRightNowState` — PR #257 (`ac8b15e`); receipt https://github.com/pm6guy10/foldera-ai/issues/249#issuecomment-4686122101
- #226 (rung 6): Gmail + Microsoft sign-in + Slack self-loop scored winner — PR #256; receipt https://github.com/pm6guy10/foldera-ai/issues/226#issuecomment-4685107461
